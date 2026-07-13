/*
 * Category Manager (admin/categories.html) — CRUD over the "categories" node
 * (js/cms-db.js CategoryDB). This is the single source of truth consumed by
 * the product category dropdown (admin/products.html) and the category
 * filter tabs on category.html (js/category.js).
 * Sprint 13: + backgroundImage field per category (header trang danh mục).
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'categories', title: 'QUẢN LÝ DANH MỤC' }).then(() => {
    load().then(loadTiles);
  });

  let categories = [];
  // bgSlots[id] = URL ảnh nền hiện tại — cập nhật realtime khi Founder
  // chọn/xóa ảnh, để save() ghi đúng giá trị mới nhất dù picker dùng closure.
  const bgSlots = {};

  // ── CATEGORY COVER (Sprint 13, Product Image Presentation) ─────────────────
  // Ảnh sản phẩm đại diện + Logo + vị trí/zoom/opacity/blur/overlay chồng lên
  // Ảnh nền header — CHỈ layer trình bày (0 collection Firebase mới, ghi
  // thẳng vào record Category có sẵn qua CategoryDB.update() y hệt
  // backgroundImage). Founder KHÔNG bắt buộc dùng — để trống = header cũ.
  const coverProductSlots = {};
  const coverLogoSlots = {};
  const coverSettings = {}; // { position, zoom, opacity, blur, overlay }
  const previewViewport = {}; // 'desktop'|'tablet'|'mobile' — chỉ đổi khung xem, không ghi Firebase
  const bgRemoverOpen = {};
  const COVER_DEFAULTS = { position: 'center-right', zoom: 100, opacity: 100, blur: 0, overlay: 100 };
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const POSITION_LABELS = { 'top-left': 'Trên trái', 'top-center': 'Trên giữa', 'top-right': 'Trên phải', 'center-left': 'Giữa trái', 'center': 'Chính giữa', 'center-right': 'Giữa phải', 'bottom-left': 'Dưới trái', 'bottom-center': 'Dưới giữa', 'bottom-right': 'Dưới phải' };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    return CategoryDB.getAll().then(list => {
      categories = list;
      // Sync bgSlots/Category Cover với dữ liệu mới nhất từ DB
      categories.forEach(c => {
        bgSlots[c.id] = c.backgroundImage || '';
        coverProductSlots[c.id] = c.coverProductImage || '';
        coverLogoSlots[c.id] = c.coverLogo || '';
        coverSettings[c.id] = {
          position: c.coverPosition || COVER_DEFAULTS.position,
          zoom: typeof c.coverZoom === 'number' ? c.coverZoom : COVER_DEFAULTS.zoom,
          opacity: typeof c.coverOpacity === 'number' ? c.coverOpacity : COVER_DEFAULTS.opacity,
          blur: typeof c.coverBlur === 'number' ? c.coverBlur : COVER_DEFAULTS.blur,
          overlay: typeof c.coverOverlay === 'number' ? c.coverOverlay : COVER_DEFAULTS.overlay
        };
        if (!previewViewport[c.id]) previewViewport[c.id] = 'desktop';
      });
      render();
    });
  }

  function render() {
    const wrap = document.getElementById('categoryList');
    wrap.innerHTML = categories.map((c, i) => `
      <div class="cms-row cat-row-expand" data-id="${c.id}">
        <div class="cms-row-fields">
          <input type="text" value="${escapeHtml(c.code)}" placeholder="Mã (vd: dj)" data-field="code">
          <input type="text" value="${escapeHtml(c.label)}" placeholder="Tên hiển thị" data-field="label">
          <label class="cms-toggle"><input type="checkbox" data-field="active" ${c.active !== false ? 'checked' : ''}> Hoạt động</label>
        </div>
        <div class="cat-bg-section">
          <label class="cat-bg-label">ẢNH NỀN HEADER TRANG DANH MỤC <span class="small-muted">(tự co vừa khung — để trống = nền mặc định)</span></label>
          ${MediaLibraryPicker.renderSlot(bgSlots[c.id], url => { bgSlots[c.id] = url; updateCoverPreview(c.id); }, { wide: true })}
        </div>
        ${categoryCoverHtml(c)}
        <div class="cms-row-actions">
          <button class="btn-secondary" title="Lên" ${i === 0 ? 'disabled' : ''} onclick="AdminCategories.move('${c.id}',-1)">&#8593;</button>
          <button class="btn-secondary" title="Xuống" ${i === categories.length - 1 ? 'disabled' : ''} onclick="AdminCategories.move('${c.id}',1)">&#8595;</button>
          <button class="link-btn" onclick="AdminCategories.save('${c.id}')">Lưu</button>
          <button class="btn-danger" onclick="AdminCategories.remove('${c.id}')">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có danh mục nào.</p>';
    categories.forEach(c => { if (bgRemoverOpen[c.id]) mountBgRemover(c.id); });
  }

  // ── CATEGORY COVER — markup ──────────────────────────────────────────────
  // "PRODUCT IMAGE PRESENTATION" Requirement: Background + Product Image +
  // Title + Logo optional, Founder Controls (Position/Zoom/Opacity/Blur/
  // Overlay/Reset), Live Preview (Desktop/Tablet/Mobile), Background Source
  // (Upload/Media Library — tái dùng MediaLibraryPicker; AI Generated — link
  // sang Image AI Studio đã có; Internet — CHƯA có provider thật, hiện đúng
  // "Provider Not Configured", KHÔNG giả vờ hoạt động).
  function categoryCoverHtml(c) {
    const s = coverSettings[c.id] || COVER_DEFAULTS;
    const viewport = previewViewport[c.id] || 'desktop';
    const posButtons = POSITIONS.map(p => `<button type="button" class="cat-cover-pos-btn${s.position === p ? ' active' : ''}" title="${POSITION_LABELS[p]}" onclick="AdminCategories.setCoverField('${c.id}','position','${p}')"></button>`).join('');
    return `
      <div class="cat-cover-section">
        <p class="cat-bg-label">CATEGORY COVER <span class="small-muted">(Ảnh sản phẩm + Logo chồng lên Ảnh nền — để trống Ảnh sản phẩm = chỉ hiện Ảnh nền như cũ)</span></p>

        <div class="cat-cover-viewport-toggle">
          <button type="button" class="btn-secondary${viewport === 'desktop' ? ' active' : ''}" onclick="AdminCategories.setPreviewViewport('${c.id}','desktop')">Desktop</button>
          <button type="button" class="btn-secondary${viewport === 'tablet' ? ' active' : ''}" onclick="AdminCategories.setPreviewViewport('${c.id}','tablet')">Tablet</button>
          <button type="button" class="btn-secondary${viewport === 'mobile' ? ' active' : ''}" onclick="AdminCategories.setPreviewViewport('${c.id}','mobile')">Mobile</button>
        </div>
        <div class="cat-cover-preview-frame" data-viewport="${viewport}" id="cat-cover-frame-${c.id}">
          <div class="cat-cover-preview-inner" id="cat-cover-inner-${c.id}" style="background-image:${bgSlots[c.id] ? `url('${bgSlots[c.id]}')` : 'none'};filter:blur(${s.blur}px)">
            <div class="cat-cover-preview-overlay" id="cat-cover-overlay-${c.id}" style="opacity:${s.overlay / 100}"></div>
          </div>
          ${coverProductSlots[c.id] ? `<img src="${escapeHtml(coverProductSlots[c.id])}" class="cat-cover-preview-product" id="cat-cover-product-${c.id}" data-cover-position="${s.position}" style="--cover-zoom:${s.zoom / 100};--cover-opacity:${s.opacity / 100}" alt="">` : `<span class="cat-cover-preview-product-empty" id="cat-cover-product-${c.id}"></span>`}
          ${coverLogoSlots[c.id] ? `<img src="${escapeHtml(coverLogoSlots[c.id])}" class="cat-cover-preview-logo" id="cat-cover-logo-${c.id}" alt="">` : `<span id="cat-cover-logo-${c.id}"></span>`}
          <div class="cat-cover-preview-title">${escapeHtml(c.label || 'Danh mục')}</div>
        </div>

        <div class="cat-cover-grid">
          <div>
            <label class="cat-bg-label">ẢNH SẢN PHẨM ĐẠI DIỆN</label>
            ${MediaLibraryPicker.renderSlot(coverProductSlots[c.id], url => { coverProductSlots[c.id] = url; render(); }, {})}
            <button type="button" class="link-btn" onclick="AdminCategories.toggleBgRemover('${c.id}')">✂ ${bgRemoverOpen[c.id] ? 'Ẩn' : ''} Xóa phông ảnh sản phẩm</button>
            <div id="cat-cover-bgremover-${c.id}" style="display:${bgRemoverOpen[c.id] ? 'block' : 'none'};margin-top:0.5rem"></div>
          </div>
          <div>
            <label class="cat-bg-label">LOGO THƯƠNG HIỆU <span class="small-muted">(tùy chọn)</span></label>
            ${MediaLibraryPicker.renderSlot(coverLogoSlots[c.id], url => { coverLogoSlots[c.id] = url; render(); }, {})}
          </div>
        </div>

        <div class="cat-cover-controls">
          <div>
            <label class="cat-bg-label">VỊ TRÍ ẢNH SẢN PHẨM</label>
            <div class="cat-cover-position-grid">${posButtons}</div>
          </div>
          <label class="cat-cover-slider-label">Zoom (${s.zoom}%)<input type="range" min="50" max="150" value="${s.zoom}" oninput="AdminCategories.setCoverField('${c.id}','zoom',this.value)"></label>
          <label class="cat-cover-slider-label">Độ hiện Ảnh SP (${s.opacity}%)<input type="range" min="0" max="100" value="${s.opacity}" oninput="AdminCategories.setCoverField('${c.id}','opacity',this.value)"></label>
          <label class="cat-cover-slider-label">Làm mờ Ảnh nền — Blur (${s.blur}px)<input type="range" min="0" max="20" value="${s.blur}" oninput="AdminCategories.setCoverField('${c.id}','blur',this.value)"></label>
          <label class="cat-cover-slider-label">Độ phủ tối — Overlay (${s.overlay}%)<input type="range" min="0" max="150" value="${s.overlay}" oninput="AdminCategories.setCoverField('${c.id}','overlay',this.value)"></label>
          <button type="button" class="btn-secondary" onclick="AdminCategories.resetCover('${c.id}')">↺ ĐẶT LẠI MẶC ĐỊNH</button>
        </div>

        <div class="cat-cover-source-row">
          <span class="small-muted">Nguồn Ảnh nền:</span>
          <a class="link-btn" href="/admin/ai/images.html" target="_blank">✨ Tạo bằng AI (Image AI Studio)</a>
          <button type="button" class="link-btn" onclick="AdminCategories.internetBackgroundStub()">🌐 Ảnh nền từ Internet</button>
        </div>
      </div>`;
  }

  // updateCoverPreview — cập nhật NGAY khung Live Preview mà KHÔNG render()
  // lại toàn bộ danh sách (tránh giật/mất focus slider) — "Live Preview
  // updates immediately". Chỉ dùng khi Ảnh nền đổi qua picker (đã có sẵn
  // <img>/khung); đổi Zoom/Opacity/Blur/Overlay/Position dùng setCoverField().
  function updateCoverPreview(id) {
    const inner = document.getElementById('cat-cover-inner-' + id);
    if (inner) inner.style.backgroundImage = bgSlots[id] ? `url('${bgSlots[id]}')` : 'none';
  }

  function setCoverField(id, field, value) {
    if (!coverSettings[id]) coverSettings[id] = Object.assign({}, COVER_DEFAULTS);
    coverSettings[id][field] = (field === 'position') ? value : Number(value);
    const s = coverSettings[id];
    const inner = document.getElementById('cat-cover-inner-' + id);
    const overlay = document.getElementById('cat-cover-overlay-' + id);
    const productImg = document.getElementById('cat-cover-product-' + id);
    if (inner) inner.style.filter = 'blur(' + s.blur + 'px)';
    if (overlay) overlay.style.opacity = s.overlay / 100;
    if (productImg && productImg.tagName === 'IMG') {
      productImg.setAttribute('data-cover-position', s.position);
      productImg.style.setProperty('--cover-zoom', s.zoom / 100);
      productImg.style.setProperty('--cover-opacity', s.opacity / 100);
    }
    // Cập nhật lại nút vị trí đang active mà không render() lại cả danh sách.
    if (field === 'position') {
      const frame = document.getElementById('cat-cover-frame-' + id);
      if (frame) {
        frame.querySelectorAll('.cat-cover-pos-btn').forEach(btn => btn.classList.remove('active'));
        const idx = POSITIONS.indexOf(value);
        if (idx !== -1 && frame.querySelectorAll('.cat-cover-pos-btn')[idx]) frame.querySelectorAll('.cat-cover-pos-btn')[idx].classList.add('active');
      }
    }
  }

  function resetCover(id) {
    coverSettings[id] = Object.assign({}, COVER_DEFAULTS);
    render();
  }

  function setPreviewViewport(id, viewport) {
    previewViewport[id] = viewport;
    const frame = document.getElementById('cat-cover-frame-' + id);
    if (frame) frame.setAttribute('data-viewport', viewport);
    // Cập nhật trạng thái active của 3 nút mà không render() lại toàn bộ.
    const toolbar = frame && frame.previousElementSibling;
    if (toolbar && toolbar.classList.contains('cat-cover-viewport-toggle')) {
      Array.from(toolbar.children).forEach(btn => btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === viewport));
    }
  }

  // toggleBgRemover — "Founder uploads a Product image with a white
  // background -> Background is automatically removed" — tái dùng NGUYÊN VẸN
  // AdminBgRemover.mount() đã có (Cloud Function openaiProxy action=
  // "remove_background"), KHÔNG viết logic xóa phông mới.
  function toggleBgRemover(id) {
    bgRemoverOpen[id] = !bgRemoverOpen[id];
    render();
  }

  function mountBgRemover(id) {
    AdminBgRemover.mount('cat-cover-bgremover-' + id, {
      label: 'XÓA PHÔNG ẢNH SẢN PHẨM ĐẠI DIỆN',
      sourceImageUrl: coverProductSlots[id] || '',
      onResult: url => { coverProductSlots[id] = url; render(); }
    });
  }

  // internetBackgroundStub — "BACKGROUND SOURCE: Internet Background (future
  // provider)... Do NOT require external APIs in this Requirement. If
  // Internet Provider is unavailable, display 'Provider Not Configured'" —
  // đúng yêu cầu, KHÔNG giả vờ có provider thật.
  function internetBackgroundStub() {
    alert('Provider Not Configured — chưa kết nối nguồn ảnh nền Internet. Dùng "Tải lên"/"Thư viện ảnh"/"Tạo bằng AI" bên trên.');
  }

  function rowValues(id) {
    const row = document.querySelector(`.cms-row[data-id="${id}"]`);
    const s = coverSettings[id] || COVER_DEFAULTS;
    return {
      code: row.querySelector('[data-field="code"]').value.trim(),
      label: row.querySelector('[data-field="label"]').value.trim(),
      active: row.querySelector('[data-field="active"]').checked,
      backgroundImage: bgSlots[id] || '',
      coverProductImage: coverProductSlots[id] || '',
      coverLogo: coverLogoSlots[id] || '',
      coverPosition: s.position,
      coverZoom: s.zoom,
      coverOpacity: s.opacity,
      coverBlur: s.blur,
      coverOverlay: s.overlay
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
        ${MediaLibraryPicker.renderSlot(t.image, url => setTileField(i, 'image', url), {})}
        <div class="cms-row-fields">
          <select data-field="category" onchange="AdminCategories.setTileField(${i},'category',this.value)">${categoryOptions(t.category)}</select>
          <input type="text" value="${escapeHtml(t.label)}" placeholder="Tên hiển thị" oninput="AdminCategories.setTileField(${i},'label',this.value)">
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

  window.AdminCategories = {
    save, move, remove,
    setTileField, moveTile, removeTile,
    setCoverField, resetCover, setPreviewViewport, toggleBgRemover, internetBackgroundStub
  };
});
