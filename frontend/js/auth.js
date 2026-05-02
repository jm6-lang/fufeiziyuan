/**
 * auth.js - 用户认证 & 会员体系
 * 所有 API 调用都发到 Worker（Cloudflare Workers + KV）
 */

const API_BASE = ''; // 同源部署，留空表示相对路径（通过 Pages 函数代理或 CORS 访问 Worker）

// ========== Token 管理 ==========

function getToken() {
  return localStorage.getItem('auth_token') || '';
}

function getCurrentUser() {
  const u = localStorage.getItem('current_user');
  return u ? JSON.parse(u) : null;
}

function setSession(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('current_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('current_user');
  localStorage.removeItem('owned_resources');
}

// ========== API 工具 ==========

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function apiGet(path) {
  const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(getToken()), {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ========== 登录 ==========

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;

  const { ok, data } = await apiPost('/api/auth/login', { username, password });
  if (ok && data.token) {
    setSession(data.token, data.user);
    window.location.href = 'user.html';
  } else {
    showError(data.error || '登录失败，请检查用户名和密码');
  }
}

// ========== 注册 ==========

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirm = form.confirmPassword.value;

  if (password !== confirm) {
    showError('两次输入的密码不一致');
    return;
  }
  if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
    showError('用户名格式错误：3-20位字母或数字');
    return;
  }

  const { ok, data } = await apiPost('/api/auth/register', { username, email, password });
  if (ok && data.token) {
    setSession(data.token, data.user);
    window.location.href = 'user.html';
  } else {
    showError(data.error || '注册失败，用户名或邮箱可能已被占用');
  }
}

// ========== 登出 ==========

function handleLogout() {
  clearSession();
  window.location.href = 'login.html';
}

// ========== 导航栏用户状态 ==========

function updateNavUser() {
  const el = document.getElementById('navUser');
  if (!el) return;
  const user = getCurrentUser();
  if (user) {
    el.textContent = '👤 ' + user.username;
    el.href = 'user.html';
  } else {
    el.textContent = '登录';
    el.href = 'login.html';
  }
}

// ========== 用户中心渲染 ==========

async function renderUserCenter() {
  const container = document.getElementById('userContent');
  const user = getCurrentUser();

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // 获取用户最新信息（会员状态、已购资源）
  const { ok, data } = await apiGet('/api/user/me');
  const userInfo = ok ? data : user;
  const vipText = userInfo.is_vip ? '👑 终身会员' : '🌱 普通用户';
  const vipStyle = userInfo.is_vip ? 'color:#f39c12' : 'color:#888';

  container.innerHTML = `
    <div class="detail-card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px">
        <div style="font-size:3rem">👤</div>
        <div>
          <div style="font-size:1.4rem;font-weight:700;margin-bottom:4px">${userInfo.username}</div>
          <div style="font-size:0.88rem;color:#888">${userInfo.email || ''}</div>
          <div style="font-size:0.92rem;margin-top:6px">
            <span style="${vipStyle};font-weight:600">${vipText}</span>
            ${userInfo.vip_expire ? `<span style="color:#aaa;font-size:0.82rem;margin-left:8px">有效期至 ${userInfo.vip_expire}</span>` : ''}
          </div>
        </div>
      </div>
      <button onclick="handleLogout()" class="btn" style="background:#f5f5f5;color:#666;font-size:0.88rem;padding:8px 18px">退出登录</button>
    </div>

    <div class="detail-card">
      <h3 style="margin-bottom:16px;font-size:1.1rem">💎 开通会员</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="border:2px solid #eee;border-radius:12px;padding:20px;text-align:center;transition:border-color 0.2s"
             onmouseover="this.style.borderColor='#667eea'" onmouseout="this.style.borderColor='#eee'">
          <div style="font-size:0.82rem;color:#888;margin-bottom:6px">月卡会员</div>
          <div style="font-size:1.8rem;font-weight:700;color:#e84118;margin-bottom:4px">¥9.9</div>
          <div style="font-size:0.78rem;color:#aaa;margin-bottom:14px">/月 · 不限下载次数</div>
          <button onclick="openVipPay('monthly')" class="btn btn-primary" style="font-size:0.85rem;padding:8px 14px;width:100%">开通</button>
        </div>
        <div style="border:2px solid #e84118;border-radius:12px;padding:20px;text-align:center;position:relative">
          <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#e84118;color:#fff;font-size:0.72rem;padding:2px 10px;border-radius:10px">最划算</div>
          <div style="font-size:0.82rem;color:#888;margin-bottom:6px">终身会员</div>
          <div style="font-size:2rem;font-weight:700;color:#e84118;margin-bottom:4px">¥59.9</div>
          <div style="font-size:0.78rem;color:#aaa;margin-bottom:14px">一次购买，永久使用</div>
          <button onclick="openVipPay('lifetime')" class="btn btn-primary" style="font-size:0.92rem;padding:10px 20px;background:linear-gradient(135deg,#e84118,#c0392b)">立即开通</button>
        </div>
      </div>
      <p style="text-align:center;color:#aaa;font-size:0.78rem;margin-top:14px">💡 会员期间所有资源免费下载，单个资源购买仅需 ¥5.9</p>
    </div>

    <div class="detail-card" style="margin-top:20px">
      <h3 style="margin-bottom:16px;font-size:1.1rem">📦 我的资源</h3>
      <div id="ownedList" style="color:#aaa;text-align:center;padding:20px;font-size:0.88rem">加载中...</div>
    </div>
  `;

  loadOwnedResources();
}

async function loadOwnedResources() {
  const { ok, data } = await apiGet('/api/user/resources');
  const container = document.getElementById('ownedList');
  if (!ok || !data.resources || data.resources.length === 0) {
    container.innerHTML = '暂无已购资源，<a href="index.html" style="color:#667eea">去购买 →</a>';
    return;
  }
  container.innerHTML = '<div class="resource-list" id="ownedGrid"></div>';
  const grid = document.getElementById('ownedGrid');
  grid.innerHTML = data.resources.map(item => `
    <div class="resource-card">
      <div class="rc-thumb">${item.thumb}</div>
      <div class="rc-title">${item.name}</div>
      <div class="rc-meta">
        <span class="rc-price" style="color:#27ae60;font-size:0.85rem">✅ 已购买</span>
        <span class="rc-size">${item.size}</span>
      </div>
      <a href="detail.html?id=${item.id}" class="btn btn-primary btn-block" style="font-size:0.82rem;padding:8px">下载</a>
    </div>
  `).join('');
}

// ========== 会员支付弹窗 ==========

function openVipPay(plan) {
  const prices = { monthly: 9.9, lifetime: 59.9 };
  const names = { monthly: '月卡会员', lifetime: '终身会员' };
  document.getElementById('payModalTitle').textContent = '开通 ' + names[plan];
  document.getElementById('payModalDesc').textContent = `¥${prices[plan].toFixed(1)}，支付成功即开通 ${names[plan]}`;
  document.getElementById('payModalAmount').textContent = '¥' + prices[plan].toFixed(1);
  window.currentVipPlan = plan;
  document.getElementById('payModal').classList.add('show');
}

async function simulateVipPaid() {
  const plan = window.currentVipPlan;
  if (!plan) return;
  const { ok, data } = await apiPost('/api/vip/activate', { plan });
  if (ok) {
    // 更新本地存储的用户信息
    const user = getCurrentUser();
    user.is_vip = true;
    user.vip_expire = data.vip_expire;
    setSession(getToken(), user);
    document.getElementById('payModal').classList.remove('show');
    renderUserCenter();
  } else {
    alert(data.error || '开通失败');
  }
}

// ========== 辅助 ==========

function showError(msg) {
  const el = document.getElementById('formError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
