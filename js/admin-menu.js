/*
 * Menu Manager (admin/menu.html) — edits siteContent.menu.items, rendered on
 * every public page's nav/mobile-nav by js/site-chrome.js. Admin-only page.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'menu', title: 'QUẢN LÝ MENU', requiredRole: 'admin' }).then(load);

  let siteContent = null;
  let items = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      items = (content.menu && Array.isArray(content.menu.items)) ? content.menu.items.slice() : [];
      render();
    });
  }

  function render() {
    const wrap = document.getElementById('menuList');
    wrap.innerHTML = items.map((it, i) => `
      <div class="cms-row" data-idx="${i}">
        <div class="cms-row-fields">
          <input type="text" value="${escapeHtml(it.label)}" placeholder="Tên hiển thị" oninput="AdminMenu.setField(${i},'label',this.value)">
          <input type="text" value="${escapeHtml(it.link)}" placeholder="Link (vd: index.html#services)" oninput="AdminMenu.setField(${i},'link',this.value)">
          <label class="cms-toggle"><input type="checkbox" ${it.target === '_blank' ? 'checked' : ''} onchange="AdminMenu.setField(${i},'target',this.checked?'_blank':'_self')"> Mở tab mới</label>
        </div>
        <div class="cms-row-actions">
          <button class="btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="AdminMenu.move(${i},-1)">&#8593;</button>
          <button class="btn-secondary" ${i === items.length - 1 ? 'disabled' : ''} onclick="AdminMenu.move(${i},1)">&#8595;</button>
          <button class="btn-danger" onclick="AdminMenu.remove(${i})">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có mục menu nào.</p>';
  }

  function setField(i, field, value) { items[i][field] = value; }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    render();
  }

  function remove(i) {
    if (!confirm('Xóa mục menu này?')) return;
    items.splice(i, 1);
    render();
  }

  function addItem() {
    items.push({ label: 'Mục mới', link: '#', order: items.length + 1, target: '_self' });
    render();
  }

  function save() {
    items.forEach((it, i) => { it.order = i + 1; });
    const content = Object.assign({}, siteContent, { menu: { items } });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('Đã lưu menu — có hiệu lực ngay trên mọi trang.');
    });
  }

  function showStatus(msg) {
    const el = document.getElementById('menuStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('addMenuItemBtn').addEventListener('click', addItem);
  document.getElementById('saveMenuBtn').addEventListener('click', save);

  window.AdminMenu = { setField, move, remove };
});
