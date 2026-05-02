/**
 * 付费资源下载站 - Cloudflare Worker
 * 
 * 功能模块：
 * 1. 用户认证 — 注册 / 登录 / 登出（KV 存储）
 * 2. 用户中心 API — 会员状态 / 已购资源
 * 3. VIP 开通 — 月卡/年卡/终身会员
 * 4. 资源下载 — 验证购买状态 + R2 文件分发
 * 
 * KV 数据结构：
 *   user:{username}      → 用户信息 JSON（passwordHash, email, is_vip, vip_expire, owned_resources[]）
 *   email:{email}        → username（邮箱→用户名 索引，用于注册查重）
 *   token:{token}        → username（会话 token → 用户名）
 *   res:{resourceId}     → 资源元数据 JSON（name, price, file, thumb）
 */

const ALLOWED_RESOURCES = [
  { id: 'tool-001', name: 'PDF大师 Pro',      category: 'tool',  thumb: '📄', price: 9.9,  size: '45.2 MB', file: 'tools/pdfmaster-pro.zip',       version: 'v3.2.1' },
  { id: 'tool-002', name: '数据恢复精灵',      category: 'tool',  thumb: '🔍', price: 19.9, size: '28.7 MB', file: 'tools/data-recovery.exe',       version: 'v5.0'   },
  { id: 'tool-003', name: '思维导图 XMind',   category: 'tool',  thumb: '🧠', price: 29.9, size: '112 MB',  file: 'tools/xmind-2024.zip',           version: 'v24.01' },
  { id: 'tool-004', name: '视频压缩器 Pro',    category: 'tool',  thumb: '🎬', price: 14.9, size: '68 MB',   file: 'tools/video-compressor.zip',     version: 'v2.8'   },
  { id: 'game-001', name: '星际争霸：重制版',  category: 'game',  thumb: '🚀', price: 49.9, size: '28 GB',   file: 'games/starcraft-remastered.zip',  version: '完整版' },
  { id: 'game-002', name: '我的世界·国际版',   category: 'game',  thumb: '⛏️', price: 39.9, size: '1.2 GB',  file: 'games/minecraft-pocket.apk',     version: 'v1.21'  },
  { id: 'game-003', name: '骑马与砍杀2：领主', category: 'game',  thumb: '⚔️', price: 69.9, size: '35 GB',   file: 'games/mount-and-blade2.zip',     version: 'v1.2.12'},
];

const VIP_PLANS = {
  monthly:  { label: '月卡会员', days: 30,  price: 9.9  },
  yearly:   { label: '年卡会员', days: 365, price: 59   },
  lifetime: { label: '终身会员', days: 365 * 99, price: 199 },
};

// ========== 工具函数 ==========

function makeToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (env.PASSWORD_SALT || 'changeme-salt-2026'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function kvUserKey(username) { return `user:${username}`; }
function kvEmailKey(email)   { return `email:${email.toLowerCase()}`; }
function kvTokenKey(token)  { return `token:${token}`; }
function kvResKey(id)       { return `res:${id}`; }

function getResourceMeta(id) {
  return ALLOWED_RESOURCES.find(r => r.id === id) || null;
}

function isVipActive(user) {
  if (!user.is_vip) return false;
  if (!user.vip_expire) return true; // 终身会员
  return new Date(user.vip_expire) > new Date();
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function getAuthUser(request) {
  // 支持 Authorization: Bearer xxx 或 ?token=xxx
  const authHeader = request.headers.get('Authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    const u = new URL(request.url);
    token = u.searchParams.get('token') || '';
  }
  return token;
}

async function getUserFromToken(request) {
  const token = getAuthUser(request);
  if (!token) return null;
  const username = await KV.get(kvTokenKey(token));
  if (!username) return null;
  const raw = await KV.get(kvUserKey(username));
  if (!raw) return null;
  return JSON.parse(raw);
}

// ========== 请求路由 ==========

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    try {
      // === 认证路由 ===
      if (path === '/api/auth/register') return handleRegister(request);
      if (path === '/api/auth/login')    return handleLogin(request);

      // 需要登录的路由
      const user = await getUserFromToken(request);
      if (!user) {
        return jsonResponse({ error: '请先登录' }, 401);
      }

      if (path === '/api/user/me')       return handleMe(user);
      if (path === '/api/user/resources') return handleUserResources(user);
      if (path === '/api/purchase')       return handlePurchase(request, user);
      if (path === '/api/vip/activate')  return handleVipActivate(request, user);
      if (path === '/api/download')       return handleDownload(request, user);

      // 资源列表（公开）
      if (path === '/api/resources') return handleResources();

      return jsonResponse({ error: '未知 API：' + path }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: '服务器内部错误：' + err.message }, 500);
    }
  },

  // 定时清理过期 token（可通过 cron 触发）
  async scheduled(event, env, ctx) {
    // 可遍历 token:* 做清理
  }
};

// ========== 处理函数 ==========

// POST /api/auth/register
async function handleRegister(request) {
  const { username, email, password } = await request.json();

  if (!username || !email || !password)
    return jsonResponse({ error: '缺少必填字段' }, 400);
  if (!/^[a-zA-Z0-9]{3,20}$/.test(username))
    return jsonResponse({ error: '用户名格式错误：3-20位字母或数字' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: '邮箱格式错误' }, 400);
  if (password.length < 6)
    return jsonResponse({ error: '密码至少6位' }, 400);

  const KV = env.USERS_KV; // KV 命名空间

  // 检查用户名是否存在
  const existing = await KV.get(kvUserKey(username));
  if (existing) return jsonResponse({ error: '用户名已被占用' }, 409);

  // 检查邮箱是否存在
  const existingEmail = await KV.get(kvEmailKey(email));
  if (existingEmail) return jsonResponse({ error: '该邮箱已被注册' }, 409);

  // 创建用户
  const passwordHash = await hashPassword(password);
  const user = {
    username,
    email: email.toLowerCase(),
    passwordHash,
    is_vip: false,
    vip_expire: null,
    owned_resources: [],
    created_at: new Date().toISOString(),
  };

  await KV.put(kvUserKey(username), JSON.stringify(user));
  await KV.put(kvEmailKey(email.toLowerCase()), username);

  // 生成会话 token
  const token = makeToken();
  await KV.put(kvTokenKey(token), username, { expirationTtl: 7 * 24 * 3600 }); // 7天过期

  return jsonResponse({ success: true, token, user: { username, email, is_vip: false } });
}

// POST /api/auth/login
async function handleLogin(request) {
  const { username, password } = await request.json();
  const KV = env.USERS_KV;

  // 支持用户名或邮箱登录
  let actualUsername = username;
  if (username.includes('@')) {
    actualUsername = await KV.get(kvEmailKey(username.toLowerCase()));
  }
  if (!actualUsername) return jsonResponse({ error: '用户不存在' }, 401);

  const raw = await KV.get(kvUserKey(actualUsername));
  if (!raw) return jsonResponse({ error: '用户不存在' }, 401);

  const user = JSON.parse(raw);
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return jsonResponse({ error: '密码错误' }, 401);

  // 生成新 token
  const token = makeToken();
  await KV.put(kvTokenKey(token), actualUsername, { expirationTtl: 7 * 24 * 3600 });

  return jsonResponse({
    success: true,
    token,
    user: { username: actualUsername, email: user.email, is_vip: user.is_vip, vip_expire: user.vip_expire }
  });
}

// GET /api/user/me
async function handleMe(user) {
  return jsonResponse({
    username: user.username,
    email: user.email,
    is_vip: isVipActive(user),
    vip_expire: user.vip_expire,
    owned_resources: user.owned_resources || [],
    created_at: user.created_at,
  });
}

// GET /api/user/resources
async function handleUserResources(user) {
  const owned = user.owned_resources || [];
  const resources = owned.map(id => getResourceMeta(id)).filter(Boolean);
  return jsonResponse({ resources });
}

// POST /api/purchase  购买单个资源
async function handlePurchase(request, user) {
  const { resourceId } = await request.json();
  const meta = getResourceMeta(resourceId);
  if (!meta) return jsonResponse({ error: '资源不存在' }, 404);

  const owned = user.owned_resources || [];
  if (owned.includes(resourceId)) {
    return jsonResponse({ success: true, message: '已购买，直接下载', resource: meta });
  }

  // 实际项目中：这里验证支付平台回调（Stripe/LemonSqueezy/微信）
  // 假设支付已完成，将资源加入用户已购列表
  owned.push(resourceId);
  user.owned_resources = owned;

  const KV = env.USERS_KV;
  await KV.put(kvUserKey(user.username), JSON.stringify(user));

  return jsonResponse({ success: true, resource: meta });
}

// POST /api/vip/activate  开通会员
async function handleVipActivate(request, user) {
  const { plan } = await request.json();
  const planConfig = VIP_PLANS[plan];
  if (!planConfig) return jsonResponse({ error: '不存在的套餐' }, 400);

  // 实际项目中：验证支付平台回调
  // 假设支付已完成
  const KV = env.USERS_KV;

  if (plan === 'lifetime') {
    // 终身会员
    user.is_vip = true;
    user.vip_expire = null; // null 表示永久
  } else {
    // 月卡/年卡：累加时间
    const currentExpire = user.vip_expire ? new Date(user.vip_expire) : new Date();
    if (user.vip_expire) {
      currentExpire.setDate(currentExpire.getDate() + planConfig.days);
    } else {
      // 从今天开始算
      const start = new Date();
      start.setDate(start.getDate() + planConfig.days);
      user.vip_expire = start.toISOString().split('T')[0];
    }
    user.is_vip = true;
  }

  await KV.put(kvUserKey(user.username), JSON.stringify(user));
  return jsonResponse({ success: true, is_vip: true, vip_expire: user.vip_expire });
}

// GET /api/resources  公开资源列表
async function handleResources() {
  return jsonResponse({ resources: ALLOWED_RESOURCES });
}

// GET /api/download?id=xxx
async function handleDownload(request, user) {
  const url = new URL(request.url);
  const resourceId = url.searchParams.get('id');
  const meta = getResourceMeta(resourceId);

  if (!meta) return jsonResponse({ error: '资源不存在' }, 404);

  // 检查是否有权限下载
  const owned = user.owned_resources || [];
  const canDownload = isVipActive(user) || owned.includes(resourceId);
  if (!canDownload) {
    return jsonResponse({ error: '请先购买或开通会员' }, 403);
  }

  // 从 R2 取文件
  const bucket = env.R2_BUCKET;
  if (!bucket) return jsonResponse({ error: '存储服务未配置' }, 500);

  try {
    const object = await bucket.get(meta.file);
    if (!object) return jsonResponse({ error: '文件不存在' }, 404);

    const ext = meta.file.split('.').pop();
    const filenameMap = {
      zip: 'zip', apk: 'apk', exe: 'exe',
      pdf: 'pdf', rar: 'rar', '7z': '7z',
    };
    const filename = (meta.name + '.' + (filenameMap[ext] || ext));

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    headers.set('Content-Length', object.httpMetadata?.contentLength || object.size);
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(object.body, { headers });
  } catch (err) {
    console.error('R2 error:', err);
    return jsonResponse({ error: '文件获取失败，请稍后重试' }, 500);
  }
}
