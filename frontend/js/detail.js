// 从 URL 参数获取资源 ID
function getResourceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// 选中支付方式
let selectedPayMethod = 'wechat';

function selectPay(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  const qrDisplay = document.getElementById('qrDisplay');
  qrDisplay.textContent = method === 'wechat' ? '💳' : '📱';
}

// 打开发起支付弹窗
function openPayModal(item) {
  document.getElementById('payModal').classList.add('show');
}

// 关闭支付弹窗
function closeModal() {
  document.getElementById('payModal').classList.remove('show');
}

// 模拟支付成功（实际项目中需接入真实支付API）
function simulatePaid() {
  const id = getResourceId();
  // 存储支付成功标记（实际用 Worker 验证）
  localStorage.setItem('paid_' + id, 'true');
  closeModal();
  // 显示成功页
  document.getElementById('detailPage').innerHTML = `
    <div class="success-page">
      <div class="success-icon">✅</div>
      <div class="success-title">支付成功！</div>
      <p class="success-desc">点击下方按钮开始下载资源</p>
      <a href="#" class="btn btn-primary btn-block" onclick="startDownload()" style="max-width:300px;margin:0 auto">立即下载</a>
      <br>
      <a href="index.html" style="color:#667eea;font-size:0.9rem">← 返回首页</a>
    </div>
  `;
}

// 开始下载（实际调用 Worker）
function startDownload() {
  const id = getResourceId();
  const item = getById(id);
  if (!item) return;
  // 演示：下载请求发给 Worker
  window.location.href = `/api/download?id=${item.id}&token=${localStorage.getItem('paid_' + id)}`;
}

// 渲染详情页
(function() {
  const id = getResourceId();
  const item = getById(id);
  const page = document.getElementById('detailPage');

  if (!item) {
    page.innerHTML = '<div class="detail-page"><div class="detail-card"><h2 style="color:#e84118">资源不存在</h2><a href="index.html" style="color:#667eea">← 返回首页</a></div></div>';
    return;
  }

  // 检查是否已支付
  const paid = localStorage.getItem('paid_' + id) === 'true';

  document.getElementById('pageTitle').textContent = item.name + ' - 资源下载站';

  page.innerHTML = `
    <div class="detail-card">
      <div class="detail-thumb">${item.thumb}</div>
      <h1 class="detail-title">${item.name}</h1>
      <p class="detail-desc">${item.desc}</p>
      <div class="detail-info">
        <span>版本：<strong>${item.version}</strong></span>
        <span>文件大小：<strong>${item.size}</strong></span>
        <span>分类：<strong>${item.category === 'tool' ? '🛠️ 工具' : '🎮 游戏'}</strong></span>
      </div>
      <div class="detail-price-wrap">
        <span class="detail-price">¥${item.price.toFixed(1)}</span>
        <span style="color:#999;font-size:0.85rem">永久授权 · 不限下载次数</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="openPayModal()" style="font-size:1.05rem;padding:14px">
        ${paid ? '✅ 已购买，立即下载' : '💳 立即购买'}
      </button>
    </div>
  `;

  // 如果已支付，绑定下载按钮
  if (paid) {
    setTimeout(() => {
      const btns = document.querySelectorAll('.btn-primary');
      btns.forEach(btn => {
        if (btn.textContent.includes('已购买')) {
          btn.onclick = () => startDownload();
        }
      });
    }, 100);
  }
})();