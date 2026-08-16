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
  // titlePosX/titlePosY: % trong khung preview (neo góc trên-trái tiêu đề,
  // top:Y% — khớp ĐÚNG chiều css/style.css #categoryHeaderTitle/js/category.js
  // dùng trên trang thật, xem chú thích ở đó). titlePosY mặc định 70 (không
  // phải 88 — giá trị cũ tràn khỏi khung .category-header khi chữ trang thật
  // lớn nhất, Founder báo lỗi live 2026-08-15) — vẫn đủ gần đáy để xấp xỉ vị
  // trí CSS tĩnh cũ. Lưu ý rowValues() LUÔN ghi coverTitlePosY xuống Firebase
  // mỗi lần Lưu (kể cả khi Founder chưa từng kéo tiêu đề) nên giá trị mặc
  // định ở đây cũng chính là giá trị sẽ tồn tại thật trong dữ liệu.
  const COVER_DEFAULTS = { position: 'center-right', zoom: 100, opacity: 100, blur: 0, overlay: 100, titlePosX: 4, titlePosY: 70, titleScale: 100, titleFont: 'sans', titleColor: 'white' };
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const POSITION_LABELS = { 'top-left': 'Trên trái', 'top-center': 'Trên giữa', 'top-right': 'Trên phải', 'center-left': 'Giữa trái', 'center': 'Chính giữa', 'center-right': 'Giữa phải', 'bottom-left': 'Dưới trái', 'bottom-center': 'Dưới giữa', 'bottom-right': 'Dưới phải' };
  // TITLE_FONTS/TITLE_COLORS — 2 font đã nạp SẴN toàn site (mọi trang đều có
  // <link> Google Fonts này, category.html/index.html không ngoại lệ — không
  // thêm font mới, tránh tải chậm/FOUT ngoài ý muốn) + 3 màu theo đúng bảng
  // màu thương hiệu (--gold/--black, trắng mặc định cũ).
  const TITLE_FONTS = { sans: "'Be Vietnam Pro',sans-serif", serif: "'Cormorant Garamond',serif" };
  const TITLE_FONT_LABELS = { sans: 'Be Vietnam Pro', serif: 'Cormorant Garamond' };
  const TITLE_COLORS = { white: '#ffffff', black: '#111111', gold: '#b8892f' };
  const TITLE_COLOR_LABELS = { white: 'Trắng', black: 'Đen', gold: 'Vàng' };

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
          overlay: typeof c.coverOverlay === 'number' ? c.coverOverlay : COVER_DEFAULTS.overlay,
          titlePosX: typeof c.coverTitlePosX === 'number' ? c.coverTitlePosX : COVER_DEFAULTS.titlePosX,
          titlePosY: typeof c.coverTitlePosY === 'number' ? c.coverTitlePosY : COVER_DEFAULTS.titlePosY,
          titleScale: typeof c.coverTitleScale === 'number' ? c.coverTitleScale : COVER_DEFAULTS.titleScale,
          titleFont: c.coverTitleFont || COVER_DEFAULTS.titleFont,
          titleColor: c.coverTitleColor || COVER_DEFAULTS.titleColor
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
          <div class="cat-cover-preview-title" style="left:${s.titlePosX}%;top:${s.titlePosY}%;font-size:${(s.titleScale / 100).toFixed(2)}rem;font-family:${TITLE_FONTS[s.titleFont]};color:${TITLE_COLORS[s.titleColor]}" onpointerdown="AdminCategories.startCoverTitleDrag(event,'${c.id}')" title="Kéo để đổi vị trí tiêu đề">${escapeHtml(c.label || 'Danh mục')}<span class="cat-cover-title-resize-handle" title="Kéo để đổi cỡ chữ" onpointerdown="event.stopPropagation();AdminCategories.startCoverTitleResize(event,'${c.id}')"></span></div>
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
          <label class="cat-cover-slider-label">Font chữ tiêu đề
            <select onchange="AdminCategories.setCoverField('${c.id}','titleFont',this.value)">
              ${Object.keys(TITLE_FONTS).map(k => `<option value="${k}" ${s.titleFont === k ? 'selected' : ''}>${TITLE_FONT_LABELS[k]}</option>`).join('')}
            </select>
          </label>
          <div>
            <label class="cat-bg-label">MÀU CHỮ TIÊU ĐỀ</label>
            <div class="cat-cover-color-swatches">
              ${Object.keys(TITLE_COLORS).map(k => `<button type="button" class="cat-cover-color-btn${s.titleColor === k ? ' active' : ''}" style="background:${TITLE_COLORS[k]}" title="${TITLE_COLOR_LABELS[k]}" onclick="AdminCategories.setCoverField('${c.id}','titleColor','${k}')"></button>`).join('')}
            </div>
          </div>
          <button type="button" class="btn-secondary" onclick="AdminCategories.resetCover('${c.id}')">↺ ĐẶT LẠI MẶC ĐỊNH</button>
        </div>

        <div class="cat-cover-source-row">
          <span class="small-muted">Nguồn Ảnh nền:</span>
          <a class="link-btn" href="/admin/ai/images.html" target="_blank">✨ Tạo bằng AI (Image AI Studio)</a>
          <button type="button" class="link-btn" onclick="AdminCategories.setBackgroundFromInternet('${c.id}')">🌐 Ảnh nền từ Internet</button>
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
    // titleFont/titleColor đổi qua dropdown/click (không phải kéo liên tục
    // như Zoom/Opacity/Blur/Overlay) — render() lại toàn hàng an toàn, không
    // lo giật/mất focus (khác lý do các field bên dưới phải cập nhật DOM
    // thủ công thay vì render() lại).
    if (field === 'titleFont' || field === 'titleColor') {
      coverSettings[id][field] = value;
      render();
      return;
    }
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

  // setBackgroundFromInternet — trước đây luôn báo "Provider Not Configured"
  // dù Founder chỉ cần dán 1 link ảnh nền có sẵn (không cần AI/provider tìm
  // kiếm ảnh nào cả) — Founder báo lỗi live 2026-08-15. Ảnh nền chỉ hiển thị
  // qua CSS background-image ở phía trình duyệt (client-side), không có
  // request nào gửi lên server để xử lý — nên không cần "provider" thật:
  // xác nhận link tải được (Image() probe, cùng cách js/media-edit.js
  // urlSource() đã làm) rồi dùng thẳng làm Ảnh nền, giống hệt chọn từ Thư
  // viện ảnh.
  function setBackgroundFromInternet(id) {
    const url = (prompt('Dán link ảnh nền từ Internet (https://...):') || '').trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) { alert('Chỉ chấp nhận link bắt đầu bằng https://'); return; }
    const probe = new Image();
    probe.onload = () => { bgSlots[id] = url; updateCoverPreview(id); };
    probe.onerror = () => alert('Không tải được ảnh từ link này — kiểm tra lại URL.');
    probe.src = url;
  }

  // startCoverTitleDrag — kéo-thả tự do vị trí chữ tiêu đề trong khung Live
  // Preview, CÙNG kỹ thuật startTextDrag() đã có ở js/admin-sliders.js (Hero
  // Slideshow): %-based theo khung xem trước, chỉ commit vào coverSettings
  // khi thả chuột (pointerup) để tránh giật/mất focus trong lúc kéo.
  function startCoverTitleDrag(e, id) {
    e.preventDefault();
    const labelEl = e.currentTarget;
    const box = labelEl.closest('.cat-cover-preview-frame');
    if (!box) return;
    labelEl.classList.add('dragging');
    if (!coverSettings[id]) coverSettings[id] = Object.assign({}, COVER_DEFAULTS);
    const s = coverSettings[id];
    let lastX = s.titlePosX, lastY = s.titlePosY;

    function move(ev) {
      const rect = box.getBoundingClientRect();
      lastX = Math.round(Math.min(100, Math.max(0, (ev.clientX - rect.left) / rect.width * 100)) * 10) / 10;
      lastY = Math.round(Math.min(100, Math.max(0, (ev.clientY - rect.top) / rect.height * 100)) * 10) / 10;
      labelEl.style.left = lastX + '%';
      labelEl.style.top = lastY + '%';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('dragging');
      s.titlePosX = lastX;
      s.titlePosY = lastY;
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // startCoverTitleResize — kéo TỰ DO tay cầm góc để đổi CỠ CHỮ tiêu đề,
  // CÙNG kỹ thuật startTextResize() ở Hero Slideshow (js/admin-sliders.js):
  // khoảng cách từ góc trên-trái nhãn tới điểm thả chuột so với khoảng cách
  // ban đầu quyết định tỉ lệ phóng to/nhỏ, kẹp 40%-300%. titleScale LƯU
  // TRỰC TIẾP làm cỡ chữ rem (100 → 1rem, khớp đúng font-size:1rem cũ của
  // .cat-cover-preview-title trong CSS — danh mục CHƯA từng đổi cỡ chữ vẫn
  // hiện Y HỆT như trước).
  function startCoverTitleResize(e, id) {
    e.preventDefault();
    const handle = e.currentTarget;
    const labelEl = handle.closest('.cat-cover-preview-title');
    if (!labelEl) return;
    if (!coverSettings[id]) coverSettings[id] = Object.assign({}, COVER_DEFAULTS);
    const s = coverSettings[id];
    const startRect = labelEl.getBoundingClientRect();
    const startScale = s.titleScale;
    const startDist = Math.max(10, Math.hypot(startRect.width, startRect.height));
    labelEl.classList.add('resizing-text');
    let lastScale = startScale;

    function move(ev) {
      const dist = Math.hypot(ev.clientX - startRect.left, ev.clientY - startRect.top);
      lastScale = Math.min(300, Math.max(40, Math.round(startScale * (dist / startDist))));
      labelEl.style.fontSize = (lastScale / 100).toFixed(2) + 'rem';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('resizing-text');
      s.titleScale = lastScale;
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
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
      coverOverlay: s.overlay,
      coverTitlePosX: s.titlePosX,
      coverTitlePosY: s.titlePosY,
      coverTitleScale: s.titleScale,
      coverTitleFont: s.titleFont,
      coverTitleColor: s.titleColor
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

  /* ---------------- Ô danh mục hiển thị trang chủ (siteContent.categoryTiles) ----------------
   * Founder xác nhận: Ô Danh Mục Trang Chủ QUAN TRỌNG HƠN Danh Mục Sản Phẩm —
   * cần chi tiết ĐẦY ĐỦ như Category Cover ở trên, không phải bản rút gọn.
   * Mỗi Ô giờ có NGUYÊN VẸN bộ điều khiển Category Cover (Ảnh nền/Logo/Ảnh
   * sản phẩm/Xóa phông/Vị trí 9 điểm/Zoom/Opacity/Blur/Overlay/Đặt lại mặc
   * định/Live Preview riêng theo Desktop-Tablet-Mobile) — TÁI SỬ DỤNG NGUYÊN
   * class CSS `.cat-cover-*` đã có (0 CSS mới cần thêm cho phần admin — đảm
   * bảo giao diện giống hệt, không phải "giống na ná"). Khác Category (dữ
   * liệu tách trong `bgSlots`/`coverProductSlots` closure vì đọc lại từ
   * Firebase mỗi `load()`), Tile không có id ổn định — đọc/ghi field THẲNG
   * trên `tiles[i]` (mảng đã nắm toàn quyền trong bộ nhớ, không cần closure
   * riêng), Live Preview riêng theo INDEX (tilePreviewViewport[i]/
   * tileBgRemoverOpen[i], reset an toàn mỗi lần renderTiles() vẽ lại theo
   * đúng thứ tự index mới sau khi thêm/xoá/di chuyển Ô).
   * Vẫn giữ thêm khung Live Preview TỔNG cho TOÀN BỘ lưới Ô ở đầu panel
   * (Kích cỡ "Lớn"/"Banner ngang" chỉ có ý nghĩa khi xem cùng ô lân cận). */
  let siteContent = null;
  let tiles = [];
  let tileViewport = 'desktop';
  const tilePreviewViewport = {}; // index -> 'desktop'|'tablet'|'mobile' (khung Cover riêng từng Ô)
  const tileBgRemoverOpen = {};   // index -> bool
  const TILE_COVER_DEFAULTS = { position: 'center', zoom: 100, opacity: 100, blur: 0, overlay: 100 };
  // TILE_TITLE_DEFAULT — CHỈ dùng để vẽ khung xem trước lúc CHƯA kéo/đổi lần
  // nào (không ghi vào tiles[i], không đụng dữ liệu) — xấp xỉ vị trí/cỡ chữ/
  // font/màu mặc định cũ. Giá trị THẬT trên trang chủ CHỈ đổi khi Founder chủ
  // động kéo/chọn (xem startTileTitleDrag/-Resize() + js/home.js renderCategoryTiles()).
  // y:68 (không phải 80) — đủ chỗ cho biến thể "Banner ngang" (font lớn nhất
  // trong 4 biến thể, khung cố định 230px/150px) không tràn khỏi
  // `.cat-tile` (overflow:hidden) khi neo bằng top, xem js/home.js.
  const TILE_TITLE_DEFAULT = { x: 50, y: 68, scale: 100, font: 'sans', color: 'white' };

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

  // tileHasCover/tilePreviewClasses — ĐÚNG logic đã dùng ở js/home.js
  // (renderCategoryTiles) để Live Preview KHÔNG BAO GIỜ lệch với trang thật —
  // sửa 1 nơi phải sửa nơi kia (đã ghi rõ ở cả 2 file).
  function tileHasCover(t) {
    return !!(t.backgroundImage || t.logo || (t.position && t.position !== 'center') ||
      (t.zoom && t.zoom !== 100) || (t.opacity != null && t.opacity !== 100) ||
      (t.blur && t.blur > 0) || (t.overlay != null && t.overlay !== 100));
  }

  function tilePreviewClasses(t) {
    const classes = ['cat-tile'];
    if (t.size === 'wide') classes.push('wide');
    else if (t.size === 'large') classes.push('large');
    else if (t.size === 'small') classes.push('small');
    if (t.skin === 'light') classes.push('skin-light');
    if (!t.image && !t.backgroundImage) classes.push('no-photo');
    if (tileHasCover(t)) classes.push('has-cover');
    return classes.join(' ');
  }

  function tilePreviewInnerHtml(t) {
    if (tileHasCover(t)) {
      const bgHtml = t.backgroundImage ? `<div class="cat-tile-bg" style="background-image:url('${escapeHtml(t.backgroundImage)}');filter:blur(${t.blur || 0}px)"></div><div class="cat-tile-cover-overlay" style="opacity:${(t.overlay != null ? t.overlay : 100) / 100}"></div>` : '';
      const prodHtml = t.image ? `<img class="cat-tile-product-img" data-cover-position="${t.position || 'center'}" style="--cover-zoom:${(t.zoom || 100) / 100};--cover-opacity:${(t.opacity != null ? t.opacity : 100) / 100}" src="${escapeHtml(t.image)}" alt="">` : '';
      const logoHtml = t.logo ? `<img class="cat-tile-logo" src="${escapeHtml(t.logo)}" alt="">` : '';
      return bgHtml + prodHtml + logoHtml;
    }
    return t.image ? `<img src="${escapeHtml(t.image)}" alt="${escapeHtml(t.label)}">` : '';
  }

  // tileRatioStyle — ĐÚNG logic customAspectRatio đã dùng ở js/home.js (kéo
  // TỰ DO chiều cao khung đen Cover Preview, ghi đè aspect-ratio mặc định
  // của size — sửa 1 nơi phải sửa nơi kia, đã ghi rõ ở cả 2 file).
  function tileRatioStyle(t) {
    return t.customAspectRatio ? ` style="aspect-ratio:${t.customAspectRatio};height:auto"` : '';
  }

  // tileTitleStyle — ĐÚNG logic js/home.js renderCategoryTiles() dùng để vẽ
  // chữ tiêu đề đã kéo vị trí/đổi cỡ chữ/font/màu (sửa 1 nơi phải sửa nơi
  // kia, cùng quy ước tileHasCover/tilePreviewClasses ở trên) — để Live
  // Preview TỔNG khớp ngay, không cần Lưu rồi tải lại mới thấy đúng.
  function tileTitleStyle(t) {
    const parts = [];
    // Neo bằng TOP — ĐÚNG chiều startTileTitleDrag() tính (top-left, cùng
    // khung xem trước Cover Preview riêng của Ô) — xem chú thích đầy đủ ở
    // js/home.js renderCategoryTiles() (từng đổi sang bottom nhưng làm ĐẢO
    // NGƯỢC chiều dọc so với khung kéo, Founder báo lỗi live 2026-08-15).
    if (typeof t.titlePosX === 'number' && typeof t.titlePosY === 'number') {
      parts.push('position:absolute', 'z-index:5', `left:${t.titlePosX}%`, `top:${t.titlePosY}%`, 'max-width:80%', 'margin:0', 'text-align:left');
    }
    if (typeof t.titleScale === 'number') parts.push(`--title-scale:${t.titleScale / 100}`);
    if (t.titleFont && TITLE_FONTS[t.titleFont]) parts.push(`font-family:${TITLE_FONTS[t.titleFont]}`);
    if (t.titleColor && TITLE_COLORS[t.titleColor]) parts.push(`color:${TITLE_COLORS[t.titleColor]}`);
    return parts.length ? ` style="${parts.join(';')}"` : '';
  }

  // renderTilePreviewGrid — vẽ lại RIÊNG khung Live Preview TỔNG (không đụng
  // vào các field đang nhập ở tileList bên dưới) — gọi sau MỖI lần đổi field.
  // Mỗi Ô có thêm 1 tay cầm góc dưới-phải (.cat-tile-resize-handle) để KÉO
  // đổi SỐ CỘT chiếm (chiều rộng) trực tiếp — CHỈ đặt ở đây (không phải khung
  // Cover riêng từng Ô) vì số cột chỉ có ý nghĩa khi thấy được các Ô lân cận
  // thật. Chiều cao (customAspectRatio) kéo TỰ DO ở khung Cover riêng từng Ô.
  function renderTilePreviewGrid() {
    const frame = document.getElementById('tilePreviewFrame');
    if (!frame) return;
    frame.setAttribute('data-viewport', tileViewport);
    if (!tiles.length) { frame.innerHTML = '<p class="small-muted">Chưa có ô danh mục nào.</p>'; return; }
    frame.innerHTML = `<div class="cat-tile-grid">${tiles.map((t, i) =>
      `<div class="${tilePreviewClasses(t)}"${tileRatioStyle(t)}>${tilePreviewInnerHtml(t)}<span class="cat-tile-label"${tileTitleStyle(t)}>${escapeHtml(t.label)}</span><span class="cat-tile-resize-handle" title="Kéo để đổi Kích cỡ Ô" onpointerdown="AdminCategories.startTileSizeDrag(event,${i})"></span></div>`
    ).join('')}</div>`;
  }

  function setTileViewport(v) {
    tileViewport = v;
    const toolbar = document.getElementById('tileViewportToggle');
    if (toolbar) Array.from(toolbar.children).forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-vp') === v));
    renderTilePreviewGrid();
  }

  function setTileSize(i, size) {
    tiles[i].size = size;
    renderTiles();
  }

  // startTileSizeDrag — kéo góc Ô trong Live Preview TỔNG bằng Pointer Events
  // (cùng kỹ thuật kéo tiêu đề Hero Slideshow đã làm) — CHỈ đổi className tại
  // chỗ trong lúc kéo (không gọi renderTiles()/renderTilePreviewGrid() giữa
  // chừng — sẽ REBUILD DOM, mất tham chiếu đang kéo) — commit thật (ghi
  // tiles[i].size, render lại toàn bộ để đồng bộ dropdown KÍCH CỠ Ô) đúng 1
  // lần khi thả chuột. Số cột đọc THẬT từ chính lưới đang hiển thị (3 cột
  // Desktop/2 cột Mobile) qua getComputedStyle — không đoán mò/hardcode.
  function startTileSizeDrag(e, i) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const tileEl = handle.closest('.cat-tile');
    const grid = handle.closest('.cat-tile-grid');
    if (!tileEl || !grid) return;
    tileEl.classList.add('resizing');
    const startRect = tileEl.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const colCount = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length || 3;
    const colWidth = gridRect.width / colCount;
    let lastSize = tiles[i].size || 'normal';

    // Chiều rộng/cao đo TỰ DO từ góc kéo (KHÔNG Math.max theo kích thước BAN
    // ĐẦU của Ô — Ô đang "Lớn"/"Banner ngang" phải co được VỀ "Nhỏ" khi kéo
    // ngược lại, không riêng gì phóng to). Chuẩn 1 cột dùng colWidth (ổn định
    // bất kể Ô đang bắt đầu ở cỡ nào), sàn 20px chỉ để tránh chia cho 0.
    function nearestSize(clientX, clientY) {
      const width = Math.max(20, clientX - startRect.left);
      const height = Math.max(20, clientY - startRect.top);
      const colsSpanned = width / colWidth;
      if (colsSpanned >= colCount - 0.4) return 'wide';
      if (colsSpanned >= 1.6) return 'large';
      if (height / colWidth < 0.8) return 'small';
      return 'normal';
    }

    function move(ev) {
      const size = nearestSize(ev.clientX, ev.clientY);
      if (size !== lastSize) {
        lastSize = size;
        tileEl.className = tilePreviewClasses(Object.assign({}, tiles[i], { size })) + ' resizing';
      }
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (tileEl.classList) tileEl.classList.remove('resizing');
      setTileSize(i, lastSize);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // startTileFrameHeightDrag — kéo TỰ DO cạnh dưới khung Cover Preview (khung
  // đen) để đổi CHIỀU CAO/tỷ lệ khung — KHÔNG snap về mức nào, khác hẳn
  // startTileSizeDrag() (đổi SỐ CỘT/Kích cỡ preset ở khung Live Preview
  // TỔNG). Founder xác nhận: lưới Trang chủ dùng CSS Grid 3 cột nên CHIỀU
  // RỘNG bắt buộc theo số cột nguyên (vẫn chọn qua "KÍCH CỠ Ô"/kéo góc ở
  // trên) — nhưng CHIỀU CAO không bị ràng buộc đó, ghi thẳng tỉ lệ THẬT
  // (width/height) vào tiles[i].customAspectRatio, ghi đè mọi aspect-ratio/
  // height cố định của size đã chọn (áp dụng NGAY cả trên trang chủ thật,
  // xem js/home.js). Chiều rộng khung LUÔN cố định trong lúc kéo (đúng đang
  // hiển thị theo viewport Desktop/Tablet/Mobile) — chỉ chiều cao thay đổi.
  function startTileFrameHeightDrag(e, i) {
    e.preventDefault();
    const handle = e.currentTarget;
    const frame = handle.closest('.cat-tile-cover-frame');
    if (!frame) return;
    frame.classList.add('resizing-height');
    const startRect = frame.getBoundingClientRect();
    const frameWidth = startRect.width;
    let lastRatio = frameWidth / startRect.height;

    function move(ev) {
      const height = Math.max(40, ev.clientY - startRect.top);
      const ratio = frameWidth / height;
      lastRatio = ratio;
      frame.style.aspectRatio = String(ratio);
      frame.style.height = 'auto';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      frame.classList.remove('resizing-height');
      tiles[i].customAspectRatio = Math.round(lastRatio * 100) / 100;
      renderTiles();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function resetTileFrameHeight(i) {
    delete tiles[i].customAspectRatio;
    renderTiles();
  }

  // startTileTitleDrag — kéo-thả tự do vị trí chữ tiêu đề Ô Danh mục Trang
  // chủ, CÙNG kỹ thuật startCoverTitleDrag() ở Category Cover. Ghi THẲNG vào
  // tiles[i].titlePosX/titlePosY (cùng cách customAspectRatio đã làm ở trên)
  // — Ô CHƯA từng kéo (2 field này không tồn tại) giữ NGUYÊN 100% rendering
  // cũ trên trang chủ thật (js/home.js renderCategoryTiles() CHỈ áp dụng vị
  // trí tự do khi cả 2 field tồn tại, xem chú thích ở đó).
  function startTileTitleDrag(e, i) {
    e.preventDefault();
    const labelEl = e.currentTarget;
    const box = labelEl.closest('.cat-cover-preview-frame');
    if (!box) return;
    labelEl.classList.add('dragging');
    let lastX = typeof tiles[i].titlePosX === 'number' ? tiles[i].titlePosX : TILE_TITLE_DEFAULT.x;
    let lastY = typeof tiles[i].titlePosY === 'number' ? tiles[i].titlePosY : TILE_TITLE_DEFAULT.y;

    function move(ev) {
      const rect = box.getBoundingClientRect();
      lastX = Math.round(Math.min(100, Math.max(0, (ev.clientX - rect.left) / rect.width * 100)) * 10) / 10;
      lastY = Math.round(Math.min(100, Math.max(0, (ev.clientY - rect.top) / rect.height * 100)) * 10) / 10;
      labelEl.style.left = lastX + '%';
      labelEl.style.top = lastY + '%';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('dragging');
      tiles[i].titlePosX = lastX;
      tiles[i].titlePosY = lastY;
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // startTileTitleResize — kéo TỰ DO tay cầm góc để đổi CỠ CHỮ tiêu đề Ô,
  // CÙNG kỹ thuật startCoverTitleResize() ở Category Cover / startTextResize()
  // ở Hero Slideshow. Ghi THẲNG vào tiles[i].titleScale (cùng cách
  // titlePosX/Y/customAspectRatio đã làm) — Ô CHƯA từng đổi cỡ chữ giữ
  // NGUYÊN 100% cỡ chữ mặc định theo size trên trang chủ thật.
  function startTileTitleResize(e, i) {
    e.preventDefault();
    const handle = e.currentTarget;
    const labelEl = handle.closest('.cat-cover-preview-title');
    if (!labelEl) return;
    const startRect = labelEl.getBoundingClientRect();
    const startScale = typeof tiles[i].titleScale === 'number' ? tiles[i].titleScale : TILE_TITLE_DEFAULT.scale;
    const startDist = Math.max(10, Math.hypot(startRect.width, startRect.height));
    labelEl.classList.add('resizing-text');
    let lastScale = startScale;

    function move(ev) {
      const dist = Math.hypot(ev.clientX - startRect.left, ev.clientY - startRect.top);
      lastScale = Math.min(300, Math.max(40, Math.round(startScale * (dist / startDist))));
      labelEl.style.fontSize = (lastScale / 100).toFixed(2) + 'rem';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('resizing-text');
      tiles[i].titleScale = lastScale;
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // ── TILE COVER — NGUYÊN VẸN Category Cover, tái dùng ĐÚNG class CSS
  // `.cat-cover-*` đã có (0 CSS mới), chỉ đổi id/onclick nhắm theo index `i`
  // thay vì `c.id`. Xem chú thích đầy đủ ở categoryCoverHtml() phía trên. ─────
  function tileCoverHtml(t, i) {
    const s = {
      position: t.position || TILE_COVER_DEFAULTS.position,
      zoom: typeof t.zoom === 'number' ? t.zoom : TILE_COVER_DEFAULTS.zoom,
      opacity: typeof t.opacity === 'number' ? t.opacity : TILE_COVER_DEFAULTS.opacity,
      blur: typeof t.blur === 'number' ? t.blur : TILE_COVER_DEFAULTS.blur,
      overlay: typeof t.overlay === 'number' ? t.overlay : TILE_COVER_DEFAULTS.overlay
    };
    const viewport = tilePreviewViewport[i] || 'desktop';
    const posButtons = POSITIONS.map(p => `<button type="button" class="cat-cover-pos-btn${s.position === p ? ' active' : ''}" title="${POSITION_LABELS[p]}" onclick="AdminCategories.setTileCoverField(${i},'position','${p}')"></button>`).join('');
    return `
      <div class="cat-cover-section">
        <p class="cat-bg-label">COVER Ô DANH MỤC <span class="small-muted">(Ảnh sản phẩm + Logo chồng lên Ảnh nền — để trống Ảnh nền = chỉ hiện Ảnh sản phẩm như hiện tại)</span></p>

        <div class="cat-cover-viewport-toggle">
          <button type="button" class="btn-secondary${viewport === 'desktop' ? ' active' : ''}" onclick="AdminCategories.setTileCoverViewport(${i},'desktop')">Desktop</button>
          <button type="button" class="btn-secondary${viewport === 'tablet' ? ' active' : ''}" onclick="AdminCategories.setTileCoverViewport(${i},'tablet')">Tablet</button>
          <button type="button" class="btn-secondary${viewport === 'mobile' ? ' active' : ''}" onclick="AdminCategories.setTileCoverViewport(${i},'mobile')">Mobile</button>
        </div>
        <div class="cat-cover-preview-frame cat-tile-cover-frame" data-viewport="${viewport}" data-tile-size="${t.size || 'normal'}" id="tile-cover-frame-${i}"${t.customAspectRatio ? ` style="aspect-ratio:${t.customAspectRatio};height:auto"` : ''}>
          <div class="cat-cover-preview-inner" id="tile-cover-inner-${i}" style="background-image:${t.backgroundImage ? `url('${escapeHtml(t.backgroundImage)}')` : 'none'};filter:blur(${s.blur}px)">
            <div class="cat-cover-preview-overlay" id="tile-cover-overlay-${i}" style="opacity:${s.overlay / 100}"></div>
          </div>
          ${t.image ? `<img src="${escapeHtml(t.image)}" class="cat-cover-preview-product cat-tile-cover-draggable" id="tile-cover-product-${i}" data-cover-position="${s.position}" style="--cover-zoom:${s.zoom / 100};--cover-opacity:${s.opacity / 100}" alt="" title="Kéo để di chuyển" onpointerdown="AdminCategories.startTileProductDrag(event,${i})">` : `<span class="cat-cover-preview-product-empty" id="tile-cover-product-${i}"></span>`}
          ${t.logo ? `<img src="${escapeHtml(t.logo)}" class="cat-cover-preview-logo" id="tile-cover-logo-${i}" alt="">` : `<span id="tile-cover-logo-${i}"></span>`}
          <div class="cat-cover-preview-title" style="left:${typeof t.titlePosX === 'number' ? t.titlePosX : TILE_TITLE_DEFAULT.x}%;top:${typeof t.titlePosY === 'number' ? t.titlePosY : TILE_TITLE_DEFAULT.y}%;font-size:${((typeof t.titleScale === 'number' ? t.titleScale : TILE_TITLE_DEFAULT.scale) / 100).toFixed(2)}rem;font-family:${TITLE_FONTS[t.titleFont || TILE_TITLE_DEFAULT.font]};color:${TITLE_COLORS[t.titleColor || TILE_TITLE_DEFAULT.color]}" onpointerdown="AdminCategories.startTileTitleDrag(event,${i})" title="Kéo để đổi vị trí tiêu đề">${escapeHtml(t.label || 'Danh mục')}<span class="cat-cover-title-resize-handle" title="Kéo để đổi cỡ chữ" onpointerdown="event.stopPropagation();AdminCategories.startTileTitleResize(event,${i})"></span></div>
          <span class="cat-tile-frame-resize-handle" title="Kéo để đổi CHIỀU CAO khung tự do" onpointerdown="AdminCategories.startTileFrameHeightDrag(event,${i})"></span>
        </div>

        <p class="small-muted" style="margin:0.35rem 0 0">💡 Kéo trực tiếp <strong>khung đen</strong> (cạnh dưới) để đổi chiều cao TỰ DO, không giới hạn 4 mức — kéo ảnh sản phẩm để di chuyển vị trí (tự snap 9 điểm)${t.customAspectRatio ? ' — <a href="#" class="link-btn" onclick="event.preventDefault();AdminCategories.resetTileFrameHeight(' + i + ')">↺ Đặt lại tỉ lệ mặc định</a>' : ''}.</p>

        <div class="cat-cover-grid">
          <div>
            <label class="cat-bg-label">ẢNH NỀN Ô <span class="small-muted">(tùy chọn — để trống = giữ nền tối/sáng như hiện tại)</span></label>
            ${MediaLibraryPicker.renderSlot(t.backgroundImage, url => { tiles[i].backgroundImage = url; updateTileCoverPreview(i); renderTilePreviewGrid(); }, { wide: true })}
          </div>
          <div>
            <label class="cat-bg-label">LOGO THƯƠNG HIỆU <span class="small-muted">(tùy chọn)</span></label>
            ${MediaLibraryPicker.renderSlot(t.logo, url => { tiles[i].logo = url; renderTiles(); }, {})}
          </div>
        </div>

        <label class="cat-bg-label">ẢNH SẢN PHẨM ĐẠI DIỆN</label>
        ${MediaLibraryPicker.renderSlot(t.image, url => { tiles[i].image = url; renderTiles(); }, {})}
        <button type="button" class="link-btn" onclick="AdminCategories.toggleTileBgRemover(${i})">✂ ${tileBgRemoverOpen[i] ? 'Ẩn' : ''} Xóa phông ảnh sản phẩm</button>
        <div id="tile-cover-bgremover-${i}" style="display:${tileBgRemoverOpen[i] ? 'block' : 'none'};margin-top:0.5rem"></div>

        <div class="cat-cover-controls">
          <div>
            <label class="cat-bg-label">VỊ TRÍ ẢNH SẢN PHẨM</label>
            <div class="cat-cover-position-grid">${posButtons}</div>
          </div>
          <label class="cat-cover-slider-label">Zoom (${s.zoom}%)<input type="range" min="50" max="150" value="${s.zoom}" oninput="AdminCategories.setTileCoverField(${i},'zoom',this.value)"></label>
          <label class="cat-cover-slider-label">Độ hiện Ảnh SP (${s.opacity}%)<input type="range" min="0" max="100" value="${s.opacity}" oninput="AdminCategories.setTileCoverField(${i},'opacity',this.value)"></label>
          <label class="cat-cover-slider-label">Làm mờ Ảnh nền — Blur (${s.blur}px)<input type="range" min="0" max="20" value="${s.blur}" oninput="AdminCategories.setTileCoverField(${i},'blur',this.value)"></label>
          <label class="cat-cover-slider-label">Độ phủ tối — Overlay (${s.overlay}%)<input type="range" min="0" max="150" value="${s.overlay}" oninput="AdminCategories.setTileCoverField(${i},'overlay',this.value)"></label>
          <label class="cat-cover-slider-label">Font chữ tiêu đề
            <select onchange="AdminCategories.setTileField(${i},'titleFont',this.value)">
              ${Object.keys(TITLE_FONTS).map(k => `<option value="${k}" ${(t.titleFont || TILE_TITLE_DEFAULT.font) === k ? 'selected' : ''}>${TITLE_FONT_LABELS[k]}</option>`).join('')}
            </select>
          </label>
          <div>
            <label class="cat-bg-label">MÀU CHỮ TIÊU ĐỀ</label>
            <div class="cat-cover-color-swatches">
              ${Object.keys(TITLE_COLORS).map(k => `<button type="button" class="cat-cover-color-btn${(t.titleColor || TILE_TITLE_DEFAULT.color) === k ? ' active' : ''}" style="background:${TITLE_COLORS[k]}" title="${TITLE_COLOR_LABELS[k]}" onclick="AdminCategories.setTileField(${i},'titleColor','${k}')"></button>`).join('')}
            </div>
          </div>
          <button type="button" class="btn-secondary" onclick="AdminCategories.resetTileCover(${i})">↺ ĐẶT LẠI MẶC ĐỊNH</button>
        </div>

        <div class="cat-cover-source-row">
          <span class="small-muted">Nguồn Ảnh nền:</span>
          <a class="link-btn" href="/admin/ai/images.html" target="_blank">✨ Tạo bằng AI (Image AI Studio)</a>
          <button type="button" class="link-btn" onclick="AdminCategories.setTileBackgroundFromInternet(${i})">🌐 Ảnh nền từ Internet</button>
        </div>
      </div>`;
  }

  // updateTileCoverPreview — cập nhật NGAY khung Cover Preview RIÊNG (không
  // render() lại toàn bộ, tránh giật/mất focus) khi đổi Ảnh nền qua picker.
  function updateTileCoverPreview(i) {
    const inner = document.getElementById('tile-cover-inner-' + i);
    if (inner) inner.style.backgroundImage = tiles[i].backgroundImage ? `url('${tiles[i].backgroundImage}')` : 'none';
  }

  // setTileBackgroundFromInternet — cùng lý do/cách làm setBackgroundFromInternet()
  // ở Category Cover: Ảnh nền Ô chỉ cần 1 link tải được, không cần provider AI.
  function setTileBackgroundFromInternet(i) {
    const url = (prompt('Dán link ảnh nền từ Internet (https://...):') || '').trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) { alert('Chỉ chấp nhận link bắt đầu bằng https://'); return; }
    const probe = new Image();
    probe.onload = () => { tiles[i].backgroundImage = url; updateTileCoverPreview(i); renderTilePreviewGrid(); };
    probe.onerror = () => alert('Không tải được ảnh từ link này — kiểm tra lại URL.');
    probe.src = url;
  }

  function setTileCoverField(i, field, value) {
    tiles[i][field] = (field === 'position') ? value : Number(value);
    const t = tiles[i];
    const inner = document.getElementById('tile-cover-inner-' + i);
    const overlay = document.getElementById('tile-cover-overlay-' + i);
    const productImg = document.getElementById('tile-cover-product-' + i);
    if (inner) inner.style.filter = 'blur(' + (t.blur || 0) + 'px)';
    if (overlay) overlay.style.opacity = (t.overlay != null ? t.overlay : 100) / 100;
    if (productImg && productImg.tagName === 'IMG') {
      productImg.setAttribute('data-cover-position', t.position || TILE_COVER_DEFAULTS.position);
      productImg.style.setProperty('--cover-zoom', (t.zoom || 100) / 100);
      productImg.style.setProperty('--cover-opacity', (t.opacity != null ? t.opacity : 100) / 100);
    }
    if (field === 'position') {
      const frame = document.getElementById('tile-cover-frame-' + i);
      if (frame) {
        frame.querySelectorAll('.cat-cover-pos-btn').forEach(btn => btn.classList.remove('active'));
        const idx = POSITIONS.indexOf(value);
        if (idx !== -1 && frame.querySelectorAll('.cat-cover-pos-btn')[idx]) frame.querySelectorAll('.cat-cover-pos-btn')[idx].classList.add('active');
      }
    }
    renderTilePreviewGrid();
  }

  // startTileProductDrag — kéo TRỰC TIẾP ảnh sản phẩm trong khung Cover
  // Preview để di chuyển (thay bấm 9 nút vị trí), cùng kỹ thuật Pointer
  // Events đã dùng cho kéo tiêu đề Hero Slideshow (js/admin-sliders.js
  // startTitleDrag): CHỈ đặt data-cover-position tại chỗ trong lúc kéo (CSS
  // attribute selector .cat-cover-preview-product[data-cover-position=...]
  // đã có tự động định vị lại — không cần style top/left thủ công như Hero),
  // commit thật (setTileCoverField, ghi tiles[i]) đúng 1 lần khi thả chuột.
  function startTileProductDrag(e, i) {
    e.preventDefault();
    const imgEl = e.currentTarget;
    const frame = imgEl.closest('.cat-cover-preview-frame');
    if (!frame) return;
    imgEl.classList.add('dragging');
    let lastCode = tiles[i].position || TILE_COVER_DEFAULTS.position;

    function nearestCode(clientX, clientY) {
      const rect = frame.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
      const col = Math.min(2, Math.floor((x / rect.width) * 3));
      const row = Math.min(2, Math.floor((y / rect.height) * 3));
      return POSITIONS[row * 3 + col];
    }

    function move(ev) {
      const code = nearestCode(ev.clientX, ev.clientY);
      if (code !== lastCode) {
        lastCode = code;
        imgEl.setAttribute('data-cover-position', code);
        const btns = frame.querySelectorAll('.cat-cover-pos-btn');
        btns.forEach(btn => btn.classList.remove('active'));
        const idx = POSITIONS.indexOf(code);
        if (idx !== -1 && btns[idx]) btns[idx].classList.add('active');
      }
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      imgEl.classList.remove('dragging');
      setTileCoverField(i, 'position', lastCode);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function resetTileCover(i) {
    Object.assign(tiles[i], TILE_COVER_DEFAULTS);
    renderTiles();
  }

  function setTileCoverViewport(i, viewport) {
    tilePreviewViewport[i] = viewport;
    const frame = document.getElementById('tile-cover-frame-' + i);
    if (frame) frame.setAttribute('data-viewport', viewport);
    const toolbar = frame && frame.previousElementSibling;
    if (toolbar && toolbar.classList.contains('cat-cover-viewport-toggle')) {
      Array.from(toolbar.children).forEach(btn => btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === viewport));
    }
  }

  function toggleTileBgRemover(i) {
    tileBgRemoverOpen[i] = !tileBgRemoverOpen[i];
    renderTiles();
  }

  function mountTileBgRemover(i) {
    AdminBgRemover.mount('tile-cover-bgremover-' + i, {
      label: 'XÓA PHÔNG ẢNH SẢN PHẨM ĐẠI DIỆN',
      sourceImageUrl: tiles[i].image || '',
      onResult: url => { tiles[i].image = url; renderTiles(); }
    });
  }

  function renderTiles() {
    const wrap = document.getElementById('tileList');
    wrap.innerHTML = tiles.map((t, i) => `
      <div class="cms-row cat-row-expand" data-idx="${i}">
        <div class="cms-row-fields">
          <select data-field="category" onchange="AdminCategories.setTileField(${i},'category',this.value)">${categoryOptions(t.category)}</select>
          <input type="text" value="${escapeHtml(t.label)}" placeholder="Tên hiển thị" oninput="AdminCategories.setTileField(${i},'label',this.value)">
          <select data-field="skin" onchange="AdminCategories.setTileField(${i},'skin',this.value)">
            <option value="dark" ${t.skin !== 'light' ? 'selected' : ''}>Nền tối</option>
            <option value="light" ${t.skin === 'light' ? 'selected' : ''}>Nền sáng</option>
          </select>
        </div>
        <div class="cat-bg-section">
          <label class="cat-bg-label">KÍCH CỠ Ô <span class="small-muted">(quyết định độ lớn ô trên lưới trang chủ — xem Live Preview ở trên)</span></label>
          <select data-field="size" onchange="AdminCategories.setTileField(${i},'size',this.value)">
            <option value="small" ${t.size === 'small' ? 'selected' : ''}>Nhỏ</option>
            <option value="normal" ${!t.size || t.size === 'normal' ? 'selected' : ''}>Vừa (mặc định)</option>
            <option value="large" ${t.size === 'large' ? 'selected' : ''}>Lớn (chiếm 2 cột)</option>
            <option value="wide" ${t.size === 'wide' ? 'selected' : ''}>Banner ngang (chiếm cả hàng)</option>
          </select>
        </div>
        ${tileCoverHtml(t, i)}
        <div class="cms-row-actions">
          <button class="btn-secondary" title="Lên" ${i === 0 ? 'disabled' : ''} onclick="AdminCategories.moveTile(${i},-1)">&#8593;</button>
          <button class="btn-secondary" title="Xuống" ${i === tiles.length - 1 ? 'disabled' : ''} onclick="AdminCategories.moveTile(${i},1)">&#8595;</button>
          <button class="btn-danger" onclick="AdminCategories.removeTile(${i})">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có ô danh mục nào.</p>';
    tiles.forEach((t, i) => { if (tileBgRemoverOpen[i]) mountTileBgRemover(i); });
    renderTilePreviewGrid();
  }

  function setTileField(i, field, value) {
    tiles[i][field] = value;
    // Đổi Kích cỡ Ô = chọn lại 1 preset SẠCH — phải xoá customAspectRatio
    // còn sót từ lần kéo TỰ DO chiều cao trước đó (nếu có). Bug thật Founder
    // báo: đổi dropdown "không có tác dụng gì", luôn ra 1 hình ngang — do
    // customAspectRatio ghi trực tiếp qua style inline lúc kéo tự do có độ
    // ưu tiên CSS cao hơn rule theo data-tile-size, và trước đây chỉ patch
    // lại thuộc tính data-tile-size chứ không xoá style cũ nên vẫn bị đè.
    // render lại TOÀN BỘ hàng (không chỉ Live Preview tổng) để khung Cover
    // Preview riêng của Ô cũng vẽ lại sạch, không còn style cũ sót lại.
    if (field === 'size') {
      delete tiles[i].customAspectRatio;
      renderTiles();
      return;
    }
    // titleFont/titleColor đổi qua dropdown/click (không phải kéo liên tục)
    // — cần render() lại TOÀN BỘ hàng (không chỉ Live Preview TỔNG) để khung
    // Cover Preview RIÊNG của Ô (nơi có control này) cũng vẽ lại đúng font/
    // màu mới + nút màu đang active — cùng lý do 'size' ở trên.
    if (field === 'titleFont' || field === 'titleColor') {
      renderTiles();
      return;
    }
    renderTilePreviewGrid();
  }

  // resetTileUiState — tilePreviewViewport/tileBgRemoverOpen khoá theo INDEX,
  // không có id ổn định để bám theo khi thứ tự Ô đổi — xoá sạch 2 trạng thái
  // UI tạm (KHÔNG phải dữ liệu Ô) sau mỗi lần thêm/xoá/di chuyển, tránh gán
  // nhầm khung xem Desktop/Mobile hay panel Xóa phông đang mở cho SAI Ô.
  function resetTileUiState() {
    Object.keys(tilePreviewViewport).forEach(k => delete tilePreviewViewport[k]);
    Object.keys(tileBgRemoverOpen).forEach(k => delete tileBgRemoverOpen[k]);
  }

  function moveTile(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= tiles.length) return;
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    resetTileUiState();
    renderTiles();
  }

  function removeTile(i) {
    if (!confirm('Xóa ô danh mục này?')) return;
    tiles.splice(i, 1);
    resetTileUiState();
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
    setTileField, moveTile, removeTile, setTileViewport, setTileSize, startTileSizeDrag,
    setTileCoverField, resetTileCover, setTileCoverViewport, toggleTileBgRemover, startTileProductDrag,
    startTileFrameHeightDrag, resetTileFrameHeight, setTileBackgroundFromInternet,
    setCoverField, resetCover, setPreviewViewport, toggleBgRemover, setBackgroundFromInternet,
    startCoverTitleDrag, startTileTitleDrag, startCoverTitleResize, startTileTitleResize
  };
});
