// 渲染资源列表卡片
function renderList(category, containerId) {
  const container = document.getElementById(containerId);
  const items = getByCategory(category);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<p style="color:#999;text-align:center;padding:40px">暂无资源</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="resource-card">
      <div class="rc-thumb">${item.thumb}</div>
      <div class="rc-title">${item.name}</div>
      <div class="rc-desc">${item.desc}</div>
      <div class="rc-meta">
        <span class="rc-price">¥${item.price.toFixed(1)}</span>
        <span class="rc-size">${item.size}</span>
      </div>
      <a href="detail.html?id=${item.id}" class="btn btn-primary btn-block">查看详情</a>
    </div>
  `).join('');
}