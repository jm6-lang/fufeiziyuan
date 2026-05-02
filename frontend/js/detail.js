/**
 * detail.js - 资源详情页
 * 购买流程：登录检查 → 发起购买（API）→ 验证通过 → 下载
 */

let selectedPayMethod = 'wechat';

function getResourceId() {
  return new URLSearchParams(window.location.search).get('id');
}

function selectPay(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  document.getElementById('qrDisplay').textContent = method === 'wechat' ? '💳' : '📱';
}

function openPayModal() {
  // 未登录 → 跳转登录
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }
  document.getElementById('payModal').classList.add('show');
}

function closeModal() {
  document.getElementById('payModal').classList.remove('show');
}

function getToken() {
  return localStorage.getItem('auth_token') || '';
}

async function simulatePaid() {
  const id = getResourceId();
  const meta = getResourceMeta(id);
  closeModal();

  // 调用 Worker 记录购买
  try {
    const res = await fetch('/api/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      body: JSON.stringify({ resourceId: id }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showSuccessPage(meta);
    } else {
      alert(data.error || '购买失败，请重试');
    }
  } catch (err) {
    alert('网络错误，请重试');
    console.error(err);
  }
}

function showSuccessPage(meta) {
  document.getElementById('detailPage').innerHTML = `
    <div class="success-page">
      <div class="success-icon">✅</div>
      <div class="success-title">购买成功！</div>
      <p class="success-desc">您已获得「${meta.name}」的下载权限</p>
      <button class="btn btn-primary btn-block" onclick="startDownload()" style="max-width:300px;margin:0 auto;font-size:1rem;padding:14px">
        🎯 立即下载
      </button>
      <br>
      <a href="user.html" style="color:#667eea;font-size:0.9rem">📦 查看我的资源</a>
      <br><br>
      <a href="index.html" style="color:#999;font-size:0.85rem">← 返回首页</a>
    </div>
  `;
}

async function startDownload() {
  const id = getResourceId();
  const token = getToken();

  // 直接让浏览器下载（Worker 返回文件流）
  const a = document.createElement('a');
  a.href = `/api/download?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ========== 渲染详情页 ==========

(function () {
  const id = getResourceId();
  const meta = getResourceMeta(id);
  const page = document.getElementById('detailPage');

  if (!meta) {
    page.innerHTML = '<div class="detail-page"><div class="detail-card"><h2 style="color:#e84118">资源不存在</h2><a href="index.html" style="color:#667eea">← 返回首页</a></div></div>';
    return;
  }

  document.getElementById('pageTitle').textContent = meta.name + ' - 资源下载站';

  // 检查登录和购买状态
  const token = getToken();
  let hasAccess = false;

  // 先检查本地是否已购买（避免无登录状态时无法判断）
  const paidKey = 'paid_' + id;
  if (localStorage.getItem(paidKey) === 'true') hasAccess = true;

  page.innerHTML = `
    <div class="detail-card">
      <div class="detail-thumb">${meta.thumb}</div>
      <h1 class="detail-title">${meta.name}</h1>
      <p class="detail-desc">${meta.desc || '暂无描述'}</p>
      <div class="detail-info">
        <span>版本：<strong>${meta.version}</strong></span>
        <span>文件大小：<strong>${meta.size}</strong></span>
        <span>分类：<strong>${meta.category === 'tool' ? '🛠️ 工具' : '🎮 游戏'}</strong></span>
      </div>
      <div class="detail-price-wrap">
        <span class="detail-price">¥${meta.price.toFixed(1)}</span>
        <span style="color:#999;font-size:0.85rem">永久授权 · 高速下载</span>
      </div>
      <button class="btn btn-primary btn-block" id="mainActionBtn" onclick="handleMainAction()" style="font-size:1.05rem;padding:14px">
        ${hasAccess ? '🎯 已购买，立即下载' : (token ? '💳 立即购买' : '🔐 登录后购买')}
      </button>
      <p style="text-align:center;color:#aaa;font-size:0.78rem;margin-top:10px">
        开通会员可免费下载全部资源 →
      </p>
    </div>
  `;

  // 绑定主按钮行为
  window.handleMainAction = async function () {
    if (hasAccess) {
      startDownload();
      return;
    }
    if (!token) {
      // 未登录 → 跳转登录，登录后回来
      localStorage.setItem('redirectAfterLogin', window.location.href);
      window.location.href = 'login.html';
      return;
    }
    openPayModal();
  };

  // 如果已购买，直接绑定下载
  if (hasAccess) {
    setTimeout(() => {
      const btn = document.getElementById('mainActionBtn');
      if (btn && btn.textContent.includes('已购买')) {
        btn.onclick = startDownload;
      }
    }, 100);
  }
})();
