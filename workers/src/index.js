/**
 * 付费资源下载站 - Cloudflare Worker
 * 付费资源下载站 - Cloudflare Worker（Legacy 格式，兼容 API 直传）
 */

var ALLOWED_RESOURCES = [
  { id: 'tool-001', name: 'PDF大师 Pro',      category: 'tool',  thumb: '📄', price: 5.9,  size: '45.2 MB', file: 'tools/pdfmaster-pro.zip',       version: 'v3.2.1' },
  { id: 'tool-002', name: '数据恢复精灵',      category: 'tool',  thumb: '🔍', price: 5.9,  size: '28.7 MB', file: 'tools/data-recovery.exe',       version: 'v5.0'   },
  { id: 'tool-003', name: '思维导图 XMind',   category: 'tool',  thumb: '🧠', price: 5.9,  size: '112 MB',  file: 'tools/xmind-2024.zip',           version: 'v24.01' },
  { id: 'tool-004', name: '视频压缩器 Pro',    category: 'tool',  thumb: '🎬', price: 5.9,  size: '68 MB',   file: 'tools/video-compressor.zip',     version: 'v2.8'   },
  { id: 'game-001', name: '星际争霸：重制版',  category: 'game',  thumb: '🚀', price: 5.9,  size: '28 GB',   file: 'games/starcraft-remastered.zip',  version: '完整版' },
  { id: 'game-002', name: '我的世界·国际版',   category: 'game',  thumb: '⛏️', price: 5.9,  size: '1.2 GB',  file: 'games/minecraft-pocket.apk',     version: 'v1.21'  },
  { id: 'game-003', name: '骑马与砍杀2：领主', category: 'game',  thumb: '⚔️', price: 5.9,  size: '35 GB',   file: 'games/mount-and-blade2.zip',     version: 'v1.2.12'},
];

var VIP_PLANS = {
  monthly:  { label: '月卡会员', days: 30,  price: 9.9  },
  yearly:   { label: '年卡会员', days: 365, price: 59.9 },
  lifetime: { label: '终身会员', days: 365 * 99, price: 59.9 },
};

// ========== 工具函数 ==========

function makeToken() {
  var arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function hashPassword(password) {
  var encoder = new TextEncoder();
  var salt = 'changeme-salt-2026';
  var data = encoder.encode(password + salt);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function kvUserKey(username)   { return 'user:' + username; }
function kvEmailKey(email)     { return 'email:' + email.toLowerCase(); }
function kvTokenKey(token)     { return 'token:' + token; }

function getResourceMeta(id) {
  return ALLOWED_RESOURCES.find(function(r) { return r.id === id; }) || null;
}

function isVipActive(user) {
  if (!user.is_vip) return false;
  if (!user.vip_expire) return true;
  return new Date(user.vip_expire) > new Date();
}

function addDays(days) {
  var d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function jsonResponse(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function getAuthUser(request) {
  var authHeader = request.headers.get('Authorization') || '';
  var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    var u = new URL(request.url);
    token = u.searchParams.get('token') || '';
  }
  return token;
}

var KV, R2_BUCKET;

async function getUserFromToken(request) {
  var token = getAuthUser(request);
  if (!token) return null;
  var username = await KV.get(kvTokenKey(token));
  if (!username) return null;
  var raw = await KV.get(kvUserKey(username));
  if (!raw) return null;
  return JSON.parse(raw);
}

// ========== fetch 入口 ==========

async function handleRequest(request, env) {
  KV = env.USERS_KV;
  R2_BUCKET = env.R2_BUCKET;

  var url = new URL(request.url);
  var path = url.pathname;

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
    // === 公开路由 ===
    if (path === '/api/auth/register') return handleRegister(request);
    if (path === '/api/auth/login')    return handleLogin(request);
    if (path === '/api/resources')    return handleResources();

    // === 需要登录的路由 ===
    var user = await getUserFromToken(request);
    if (!user) return jsonResponse({ error: '请先登录' }, 401);

    if (path === '/api/user/me')        return handleMe(user);
    if (path === '/api/user/resources') return handleUserResources(user);
    if (path === '/api/purchase')       return handlePurchase(request, user);
    if (path === '/api/vip/activate')   return handleVipActivate(request, user);
    if (path === '/api/download')        return handleDownload(request, user);

    return jsonResponse({ error: '未知 API：' + path }, 404);
  } catch (err) {
    return jsonResponse({ error: '服务器内部错误：' + err.message }, 500);
  }
}

// ========== 处理函数 ==========

async function handleRegister(request) {
  var body = await request.json();
  var username = body.username;
  var email = body.email;
  var password = body.password;

  if (!username || !email || !password)
    return jsonResponse({ error: '缺少必填字段' }, 400);
  if (!/^[a-zA-Z0-9]{3,20}$/.test(username))
    return jsonResponse({ error: '用户名格式错误：3-20位字母或数字' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: '邮箱格式错误' }, 400);
  if (password.length < 6)
    return jsonResponse({ error: '密码至少6位' }, 400);

  var existing = await KV.get(kvUserKey(username));
  if (existing) return jsonResponse({ error: '用户名已被占用' }, 409);

  var existingEmail = await KV.get(kvEmailKey(email));
  if (existingEmail) return jsonResponse({ error: '该邮箱已被注册' }, 409);

  var passwordHash = await hashPassword(password);
  var user = {
    username: username,
    email: email.toLowerCase(),
    passwordHash: passwordHash,
    is_vip: false,
    vip_expire: null,
    owned_resources: [],
    created_at: new Date().toISOString(),
  };

  await KV.put(kvUserKey(username), JSON.stringify(user));
  await KV.put(kvEmailKey(email.toLowerCase()), username);

  var token = makeToken();
  await KV.put(kvTokenKey(token), username, { expirationTtl: 7 * 24 * 3600 });

  return jsonResponse({ success: true, token: token, user: { username: username, email: email, is_vip: false } });
}

async function handleLogin(request) {
  var body = await request.json();
  var username = body.username;
  var password = body.password;

  var actualUsername = username;
  if (username && username.includes('@')) {
    actualUsername = await KV.get(kvEmailKey(username.toLowerCase()));
  }
  if (!actualUsername) return jsonResponse({ error: '用户不存在' }, 401);

  var raw = await KV.get(kvUserKey(actualUsername));
  if (!raw) return jsonResponse({ error: '用户不存在' }, 401);

  var user = JSON.parse(raw);
  var hash = await hashPassword(password);
  if (hash !== user.passwordHash) return jsonResponse({ error: '密码错误' }, 401);

  var token = makeToken();
  await KV.put(kvTokenKey(token), actualUsername, { expirationTtl: 7 * 24 * 3600 });

  return jsonResponse({
    success: true,
    token: token,
    user: { username: actualUsername, email: user.email, is_vip: user.is_vip, vip_expire: user.vip_expire }
  });
}

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

async function handleUserResources(user) {
  var owned = user.owned_resources || [];
  var resources = owned.map(function(id) { return getResourceMeta(id); }).filter(Boolean);
  return jsonResponse({ resources: resources });
}

async function handlePurchase(request, user) {
  var body = await request.json();
  var resourceId = body.resourceId;
  var meta = getResourceMeta(resourceId);
  if (!meta) return jsonResponse({ error: '资源不存在' }, 404);

  var owned = user.owned_resources || [];
  if (owned.includes(resourceId)) {
    return jsonResponse({ success: true, message: '已购买，直接下载', resource: meta });
  }

  owned.push(resourceId);
  user.owned_resources = owned;
  await KV.put(kvUserKey(user.username), JSON.stringify(user));

  return jsonResponse({ success: true, resource: meta });
}

async function handleVipActivate(request, user) {
  var body = await request.json();
  var plan = body.plan;
  var planConfig = VIP_PLANS[plan];
  if (!planConfig) return jsonResponse({ error: '不存在的套餐' }, 400);

  if (plan === 'lifetime') {
    user.is_vip = true;
    user.vip_expire = null;
  } else {
    var days = planConfig.days;
    var current = user.vip_expire ? new Date(user.vip_expire) : new Date();
    current.setDate(current.getDate() + days);
    user.vip_expire = current.toISOString().split('T')[0];
    user.is_vip = true;
  }

  await KV.put(kvUserKey(user.username), JSON.stringify(user));
  return jsonResponse({ success: true, is_vip: true, vip_expire: user.vip_expire });
}

async function handleResources() {
  return jsonResponse({ resources: ALLOWED_RESOURCES });
}

async function handleDownload(request, user) {
  var url = new URL(request.url);
  var resourceId = url.searchParams.get('id');
  var meta = getResourceMeta(resourceId);

  if (!meta) return jsonResponse({ error: '资源不存在' }, 404);

  var owned = user.owned_resources || [];
  var canDownload = isVipActive(user) || owned.includes(resourceId);
  if (!canDownload) return jsonResponse({ error: '请先购买或开通会员' }, 403);

  var bucket = R2_BUCKET;
  if (!bucket) return jsonResponse({ error: '存储服务未配置' }, 500);

  try {
    var object = await bucket.get(meta.file);
    if (!object) return jsonResponse({ error: '文件不存在' }, 404);

    var ext = meta.file.split('.').pop();
    var filenameMap = { zip: 'zip', apk: 'apk', exe: 'exe', pdf: 'pdf', rar: 'rar', '7z': '7z' };
    var filename = meta.name + '.' + (filenameMap[ext] || ext);

    var headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    headers.set('Content-Length', object.httpMetadata && object.httpMetadata.contentLength ? object.httpMetadata.contentLength : object.size);
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(object.body, { headers: headers });
  } catch (err) {
    return jsonResponse({ error: '文件获取失败，请稍后重试' }, 500);
  }
}

// Cloudflare Workers fetch handler
addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request, event));
});
