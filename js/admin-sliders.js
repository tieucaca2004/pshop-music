/*
 * Slider Manager (admin/sliders.html) — per-slide form UI over
 * siteContent.heroSlides node (js/home.js renderHeroSlides).
 * Sprint 13: + SortableJS drag-reorder + mini hero preview 9-point position picker.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'sliders', title: 'QUẢN LÝ SLIDER TRANG CHỦ' }).then(load);

  let siteContent = null;
  let slides = [];
  let sortable = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Vị trí chữ tiêu đề — lưới 9 điểm, "bottom-left" là MẶC ĐỊNH khớp đúng
  // vị trí cố định trước đây. Slide cũ chưa có field "position" (undefined)
  // tự hiểu là "bottom-left" — không cần migration.
  const POSITIONS = [
    ['top-left',     'Trên Trái'],   ['top-center',    'Trên Giữa'],   ['top-right',    'Trên Phải'],
    ['middle-left',  'Giữa Trái'],   ['middle-center', 'Chính Giữa'],  ['middle-right', 'Giữa Phải'],
    ['bottom-left',  'Dưới Trái'],   ['bottom-center', 'Dưới Giữa'],   ['bottom-right', 'Dưới Phải'],
  ];

  // Style tuyệt đối cho từng vị trí trong 9 điểm — dùng để đặt CHÍNH nhãn
  // tiêu đề (.hero-mini-label) trong khung xem trước, khớp đúng cách
  // css/style.css .hero[data-text-pos] định vị trên trang thật.
  const POS_STYLE = {
    'top-left':      'top:8px;left:8px;',
    'top-center':    'top:8px;left:50%;transform:translateX(-50%);',
    'top-right':     'top:8px;right:8px;',
    'middle-left':   'top:50%;left:8px;transform:translateY(-50%);',
    'middle-center': 'top:50%;left:50%;transform:translate(-50%,-50%);',
    'middle-right':  'top:50%;right:8px;transform:translateY(-50%);',
    'bottom-left':   'bottom:8px;left:8px;',
    'bottom-center': 'bottom:8px;left:50%;transform:translateX(-50%);',
    'bottom-right':  'bottom:8px;right:8px;'
  };

  // Mini hero preview — kéo thả TRỰC TIẾP nhãn tiêu đề trên ảnh xem trước để
  // di chuyển (snap vào 1 trong 9 điểm khi thả chuột — cùng dữ liệu/CSS đã
  // kiểm thử và triển khai trên trang thật, không đổi kiến trúc lưu trữ),
  // bấm nút ✕ để xóa tiêu đề khỏi Slide này. 9 nút vị trí vẫn giữ làm lối
  // tắt bấm nhanh, dùng chung logic setPos() với thao tác kéo thả.
  function miniPreview(i, s) {
    const pos = s.position || 'bottom-left';
    const bg = s.image ? `background-image:url('${escapeHtml(s.image)}');background-size:cover;background-position:center;` : 'background:#222;';
    const dots = POSITIONS.map(([code, label]) => `
      <button type="button"
        class="pos-dot${code === pos ? ' pos-dot-active' : ''}"
        data-code="${code}"
        title="${escapeHtml(label)}"
        onclick="AdminSliders.setPos(${i},'${code}')">
      </button>`).join('');
    const hasTitle = !!(s.title && s.title.trim());
    const label = hasTitle ? `
      <div class="hero-mini-label" style="${POS_STYLE[pos] || POS_STYLE['bottom-left']}" onpointerdown="AdminSliders.startTitleDrag(event,${i})" title="Kéo để di chuyển tiêu đề">
        ${escapeHtml(s.title)}
        <button type="button" class="hero-mini-label-del" onclick="event.stopPropagation();AdminSliders.deleteTitle(${i})" title="Xóa tiêu đề">✕</button>
      </div>` : `<div class="hero-mini-label-empty">Chưa có tiêu đề — gõ ở ô bên trái</div>`;
    return `
      <div class="hero-mini-preview" style="${bg}">
        <div class="pos-grid">${dots}</div>
        ${label}
      </div>`;
  }

  // startTitleDrag — kéo nhãn tiêu đề trong khung xem trước bằng Pointer
  // Events (hợp nhất chuột/cảm ứng/bút). CHỈ cập nhật style/class tại chỗ
  // trong lúc kéo (không gọi setPos()/refreshPreview() — sẽ REBUILD toàn bộ
  // innerHTML, làm mất tham chiếu DOM đang kéo giữa chừng) — chỉ commit thật
  // sự (setPos, ghi vào `slides`) đúng 1 lần khi thả chuột (pointerup).
  function startTitleDrag(e, i) {
    e.preventDefault();
    const labelEl = e.currentTarget;
    const box = labelEl.closest('.hero-mini-preview');
    if (!box) return;
    labelEl.classList.add('dragging');
    let lastCode = slides[i].position || 'bottom-left';

    function nearestCode(clientX, clientY) {
      const rect = box.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
      const col = Math.min(2, Math.floor((x / rect.width) * 3));
      const row = Math.min(2, Math.floor((y / rect.height) * 3));
      return POSITIONS[row * 3 + col][0];
    }

    function applyLive(code) {
      labelEl.setAttribute('style', POS_STYLE[code] || POS_STYLE['bottom-left']);
      box.querySelectorAll('.pos-dot').forEach(d => d.classList.remove('pos-dot-active'));
      const dot = box.querySelector(`.pos-dot[data-code="${code}"]`);
      if (dot) dot.classList.add('pos-dot-active');
    }

    function move(ev) {
      const code = nearestCode(ev.clientX, ev.clientY);
      if (code !== lastCode) { lastCode = code; applyLive(code); }
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('dragging');
      setPos(i, lastCode);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function deleteTitle(i) {
    slides[i].title = '';
    refreshPreview(i);
    const input = document.getElementById('slideTitleInput-' + i);
    if (input) input.value = '';
  }

  function load() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      slides = Array.isArray(content.heroSlides) ? content.heroSlides.slice() : [];
      render();
    });
  }

  function render() {
    const wrap = document.getElementById('slideList');
    wrap.innerHTML = slides.map((s, i) => `
      <div class="panel slide-panel" data-idx="${i}" style="margin-bottom:1rem">
        <div class="slide-panel-inner">
          <div class="slide-drag-handle" title="Kéo để sắp xếp lại thứ tự">&#9776;</div>
          <div class="slide-panel-content">
            <div class="slide-panel-top">
              <div class="slide-form-col">
                <div class="field-grid">
                  <div class="form-group full">
                    <label>ẢNH SLIDE ${i + 1} (khung ngang — đúng tỉ lệ banner thật)</label>
                    ${MediaLibraryPicker.renderSlot(s.image, url => { setField(i, 'image', url); refreshPreview(i); }, { wide: true })}
                  </div>
                  <div class="form-group">
                    <label>TIÊU ĐỀ LỚN <span class="small-muted">(kéo trong khung bên phải để di chuyển, bấm ✕ để xóa)</span></label>
                    <input type="text" id="slideTitleInput-${i}" value="${escapeHtml(s.title)}" oninput="AdminSliders.setField(${i},'title',this.value);AdminSliders.refreshPreview(${i})">
                  </div>
                  <div class="form-group">
                    <label>LINK KHI BẤM (để trống = cuộn xuống danh mục)</label>
                    <input type="text" value="${escapeHtml(s.link)}" placeholder="category.html?cat=loa" oninput="AdminSliders.setField(${i},'link',this.value)">
                  </div>
                  <div class="form-group full">
                    <label>MÔ TẢ NGẮN</label>
                    <input type="text" value="${escapeHtml(s.subtitle)}" oninput="AdminSliders.setField(${i},'subtitle',this.value)">
                  </div>
                </div>
              </div>
              <div class="slide-preview-col">
                <label>VỊ TRÍ CHỮ TIÊU ĐỀ — bấm ô để chọn</label>
                <div id="preview-${i}">${miniPreview(i, s)}</div>
              </div>
            </div>
            <div class="admin-actions">
              <button class="btn-danger" onclick="AdminSliders.remove(${i})">XÓA SLIDE</button>
            </div>
          </div>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có slide nào. Bấm "+ THÊM SLIDE" để bắt đầu.</p>';

    initSortable();
  }

  // Cập nhật mini preview tại chỗ mà không render lại toàn bộ (tránh mất focus input).
  function refreshPreview(i) {
    const el = document.getElementById('preview-' + i);
    if (el) el.innerHTML = miniPreview(i, slides[i]);
  }

  function setPos(i, code) {
    slides[i].position = code;
    refreshPreview(i);
  }

  function setField(i, field, value) {
    slides[i][field] = value;
  }

  function remove(i) {
    if (!confirm('Xóa slide này?')) return;
    slides.splice(i, 1);
    render();
  }

  function addSlide() {
    slides.push({ image: '', title: '', subtitle: '', link: '', position: 'bottom-left' });
    render();
  }

  function saveAll() {
    const content = Object.assign({}, siteContent, { heroSlides: slides });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('Đã lưu slider trang chủ — có hiệu lực ngay cho mọi khách truy cập.');
    });
  }

  function showStatus(msg) {
    const el = document.getElementById('sliderStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  // SortableJS — khởi tạo lại sau mỗi render() vì DOM được rebuild hoàn toàn.
  function initSortable() {
    if (sortable) { sortable.destroy(); sortable = null; }
    const wrap = document.getElementById('slideList');
    if (!wrap || !window.Sortable) return;
    sortable = Sortable.create(wrap, {
      handle: '.slide-drag-handle',
      animation: 150,
      ghostClass: 'slide-drag-ghost',
      onEnd(evt) {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === newIndex) return;
        const moved = slides.splice(oldIndex, 1)[0];
        slides.splice(newIndex, 0, moved);
        render(); // rebuild với thứ tự mới để idx labels đúng
      }
    });
  }

  document.getElementById('addSlideBtn').addEventListener('click', addSlide);
  document.getElementById('saveSlidesBtn').addEventListener('click', saveAll);

  window.AdminSliders = { setField, setPos, startTitleDrag, deleteTitle, move: (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    [slides[i], slides[j]] = [slides[j], slides[i]];
    render();
  }, remove, refreshPreview };
});
