/*
 * Category Manager (admin/categories.html) — CRUD over the "categories" node
 * (js/cms-db.js CategoryDB). This is the single source of truth consumed by
 * the product category dropdown (admin/products.html) and the category
 * filter tabs on category.html (js/category.js).
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'categories', title: 'QUẢN LÝ DANH MỤC' }).then(() => {
    load().then(loadTiles);
  });

  let categories = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    return CategoryDB.getAll().then(list => {
      categories = list;
      render();
    });
  }

  function render() {
    const wrap = document.getElementById('categoryList');
    wrap.innerHTML = categories.map((c, i) => `
      <div class="cms-row" data-id="${c.id}">
        <div class="cms-row-fields">
          <input type="text" value="${escapeHtml(c.code)}" placeholder="Mã (vd: dj)" data-field="code">
          <input type="text" value="${escapeHtml(c.label)}" placeholder="Tên hiển thị" data-field="label">
          <label class="cms-toggle"><input type="checkbox" data-field="active" ${c.active !== false ? 'checked' : ''}> Hoạt động</label>
        </div>
        <div class="cms-row-actions">
          <button class="btn-secondary" title="Lên" ${i === 0 ? 'disabled' : ''} onclick="AdminCategories.move('${c.id}',-1)">&#8593;</button>
          <button class="btn-secondary" title="Xuống" ${i === categories.length - 1 ? 'disabled' : ''} onclick="AdminCategories.move('${c.id}',1)">&#8595;</button>
          <button class="link-btn" onclick="AdminCategories.save('${c.id}')">Lưu</button>
          <button class="btn-danger" onclick="AdminCategories.remove('${c.id}')">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có danh mục nào.</p>';
  }

  function rowValues(id) {
    const row = document.querySelector(`.cms-row[data-id="${id}"]`);
    return {
      code: row.querySelector('[data-field="code"]').value.trim(),
      label: row.querySelector('[data-field="label"]').value.trim(),
      active: row.querySelector('[data-field="active"]').checked
    };
  }

  function save(id) {
    const values = rowValues(id);
    if (!values.code || !values.label) { alert('Cần nhập Mã và Tên hiển thị.'); return; }
    CategoryDB.update(id, values).then(() => {
      showStatus('Đã lưu danh mục.');
      load();
    });
  }

  function move(id, dir) {
    const idx = categories.findIndex(c => c.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    const a = categories[idx], b = categories[swapIdx];
    Promise.all([
      CategoryDB.update(a.id, { order: b.order }),
      CategoryDB.update(b.id, { order: a.order })
    ]).then(load);
  }

  function remove(id) {
    const c = categories.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Xóa danh mục "${c.label}"? Sản phẩm đã gán danh mục này sẽ không còn hiển thị trong tab lọc tương ứng.`)) return;
    CategoryDB.remove(id).then(load);
  }

  function addNew() {
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.order || 0), 0);
    CategoryDB.add({ code: '', label: 'Danh mục mới', order: maxOrder + 1, active: true }).then(load);
  }

  function showStatus(msg) {
    const el = document.getElementById('categoryStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('addCategoryBtn').addEventListener('click', addNew);

  /* ---------------- Ô danh mục hiển thị trang chủ (siteContent.categoryTiles) ---------------- */
  let siteContent = null;
  let tiles = [];
  let uploadTargetIndex = null;

  function loadTiles() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      tiles = Array.isArray(content.categoryTiles) ? content.categoryTiles.slice() : [];
      renderTiles();
    });
  }

  function categoryOptions(selected) {
    return categories.map(c => `<option value="${escapeHtml(c.code)}" ${c.code === selected ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
  }

  function renderTiles() {
    const wrap = document.getElementById('tileList');
    wrap.innerHTML = tiles.map((t, i) => `
      <div class="cms-row" data-idx="${i}">
        <div class="cms-row-fields">
          <select data-field="category" onchange="AdminCategories.setTileField(${i},'category',this.value)">${categoryOptions(t.category)}</select>
          <input type="text" value="${escapeHtml(t.label)}" placeholder="Tên hiển thị" oninput="AdminCategories.setTileField(${i},'label',this.value)">
          <input type="text" value="${escapeHtml(t.image)}" placeholder="Link ảnh" oninput="AdminCategories.setTileField(${i},'image',this.value)">
          <select data-field="size" onchange="AdminCategories.setTileField(${i},'size',this.value)">
            <option value="normal" ${t.size !== 'wide' ? 'selected' : ''}>Ô vuông (normal)</option>
            <option value="wide" ${t.size === 'wide' ? 'selected' : ''}>Banner ngang (wide)</option>
          </select>
          <select data-field="skin" onchange="AdminCategories.setTileField(${i},'skin',this.value)">
            <option value="dark" ${t.skin !== 'light' ? 'selected' : ''}>Nền tối</option>
            <option value="light" ${t.skin === 'light' ? 'selected' : ''}>Nền sáng</option>
          </select>
        </div>
        <div class="cms-row-actions">
          <button class="upload-btn" onclick="AdminCategories.uploadTileImage(${i})">&#128247;</button>
          <button class="btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="AdminCategories.moveTile(${i},-1)">&#8593;</button>
          <button class="btn-secondary" ${i === tiles.length - 1 ? 'disabled' : ''} onclick="AdminCategories.moveTile(${i},1)">&#8595;</button>
          <button class="btn-danger" onclick="AdminCategories.removeTile(${i})">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có ô danh mục nào.</p>';
  }

  function setTileField(i, field, value) {
    tiles[i][field] = value;
  }

  function moveTile(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= tiles.length) return;
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    renderTiles();
  }

  function removeTile(i) {
    if (!confirm('Xóa ô danh mục này?')) return;
    tiles.splice(i, 1);
    renderTiles();
  }

  function addTile() {
    tiles.push({ category: categories[0] ? categories[0].code : '', label: 'Danh mục mới', image: '', size: 'normal', skin: 'dark' });
    renderTiles();
  }

  function uploadTileImage(i) {
    uploadTargetIndex = i;
    document.getElementById('tileImageUpload').click();
  }

  function saveTiles() {
    const content = Object.assign({}, siteContent, { categoryTiles: tiles });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showTileStatus('Đã lưu ô danh mục trang chủ.');
    });
  }

  function showTileStatus(msg) {
    const el = document.getElementById('tileStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('addTileBtn').addEventListener('click', addTile);
  document.getElementById('saveTilesBtn').addEventListener('click', saveTiles);
  StorageUpload.attachUploadInput(
    document.getElementById('tileImageUpload'),
    document.getElementById('tileUploadStatus'),
    'category-tiles',
    url => { if (uploadTargetIndex !== null) { tiles[uploadTargetIndex].image = url; renderTiles(); } }
  );

  window.AdminCategories = {
    save, move, remove,
    setTileField, moveTile, removeTile, uploadTileImage
  };
});
