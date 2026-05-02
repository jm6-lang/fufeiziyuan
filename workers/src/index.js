/**
 * 付费资源下载 Worker
 * 
 * 功能：
 * 1. 支付成功后生成下载令牌
 * 2. 验证下载令牌并从 R2 取文件
 * 3. 返回文件给用户（或重定向到预签名链接）
 * 
 * 环境变量（wrangler.toml 中配置）：
 * - R2_BUCKET: R2 存储桶名称
 * - DOWNLOAD_SECRET: 下载令牌密钥（生产环境请使用复杂的随机字符串）
 */

const ALLOWED_RESOURCES = [
  { id: 'tool-001', file: 'tools/pdfmaster-pro.zip', name: 'PDF大师 Pro' },
  { id: 'tool-002', file: 'tools/data-recovery.exe', name: '数据恢复精灵' },
  { id: 'tool-003', file: 'tools/xmind-2024.zip', name: '思维导图 XMind' },
  { id: 'tool-004', file: 'tools/video-compressor.zip', name: '视频压缩器 Pro' },
  { id: 'game-001', file: 'games/starcraft-remastered.zip', name: '星际争霸：重制版' },
  { id: 'game-002', file: 'games/minecraft-pocket.apk', name: '我的世界·国际版' },
  { id: 'game-003', file: 'games/mount-and-blade2.zip', name: '骑马与砍杀2：领主' },
];

// ========== 辅助函数 ==========

/**
 * 生成下载令牌（支付成功后调用）
 */
function generateToken(resourceId, secret) {
  const timestamp = Date.now();
  const message = `${resourceId}:${timestamp}`;
  // 简化版：实际生产请用 HMAC-SHA256
  const signature = btoa(message + secret).replace(/=/g, '');
  return `${resourceId}:${timestamp}:${signature}`;
}

/**
 * 验证下载令牌
 * 格式：resourceId:timestamp:signature
 */
function verifyToken(token, secret, maxAgeMs = 2 * 60 * 60 * 1000) {
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [resourceId, timestamp, signature] = parts;
  const age = Date.now() - parseInt(timestamp);

  if (age > maxAgeMs) return null; // 过期

  const expectedSig = btoa(`${resourceId}:${timestamp}` + secret).replace(/=/g, '');
  if (signature !== expectedSig) return null;

  return resourceId;
}

/**
 * 获取资源元数据
 */
function getResourceMeta(resourceId) {
  return ALLOWED_RESOURCES.find(r => r.id === resourceId) || null;
}

// ========== 请求处理 ==========

async function handleGenerateToken(request) {
  const url = new URL(request.url);
  const resourceId = url.searchParams.get('id');

  if (!resourceId) {
    return new Response(JSON.stringify({ error: '缺少资源 ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const meta = getResourceMeta(resourceId);
  if (!meta) {
    return new Response(JSON.stringify({ error: '资源不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 生产环境：这里应该调用支付平台 API 验证支付状态
  // 例如 Stripe、微信支付、支付宝等
  // 假设支付已完成，生成令牌
  const secret = env.DOWNLOAD_SECRET || 'dev-secret-change-in-production';
  const token = generateToken(resourceId, secret);
  const downloadUrl = `${url.origin}/api/download?token=${encodeURIComponent(token)}`;

  return new Response(JSON.stringify({
    success: true,
    token,
    downloadUrl,
    resource: meta
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleDownload(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  // 验证令牌
  const secret = env.DOWNLOAD_SECRET || 'dev-secret-change-in-production';
  const resourceId = verifyToken(token, secret);

  if (!resourceId) {
    return new Response('下载令牌无效或已过期，请重新购买。', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const meta = getResourceMeta(resourceId);
  if (!meta) {
    return new Response('资源不存在。', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 从 R2 获取文件
  const bucket = env.R2_BUCKET;
  if (!bucket) {
    return new Response('存储服务未配置（R2_BUCKET missing）', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  try {
    const object = await bucket.get(meta.file);
    if (!object) {
      return new Response('文件不存在（R2 key not found）', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.name + '.' + meta.file.split('.').pop())}"`);
    headers.set('Content-Length', object.httpMetadata.contentLength || object.size);
    headers.set('Cache-Control', 'private, no-cache');

    return new Response(object.body, { headers });
  } catch (err) {
    console.error('R2 fetch error:', err);
    return new Response('文件获取失败，请稍后重试。', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ========== 入口 ==========

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // 路由分发
    if (pathname === '/api/generate-token') {
      return handleGenerateToken(request);
    } else if (pathname === '/api/download') {
      return handleDownload(request);
    } else {
      return new Response('Worker 正常运转，API 端点：/api/generate-token 和 /api/download', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
};