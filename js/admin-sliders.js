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

  // Mini hero preview — lưới 3×3 nút để Founder click chọn vị trí text.
  // Hiển thị ảnh slide làm nền, 9 nút vị trí, nút active được highlight.
  function miniPreview(i, s) {
    const pos = s.position || 'bottom-left';
    const bg = s.image ? `background-image:url('${escapeHtml(s.image)}');background-size:cover;background-position:center;` : 'background:#222;';
    const dots = POSITIONS.map(([code, label]) => `
      <button type="button"
        class="pos-dot${code === pos ? ' pos-dot-active' : ''}"
        title="${escapeHtml(label)}"
        onclick="AdminSliders.setPos(${i},'${code}')">
      </button>`).join('');
    return `
      <div class="hero-mini-preview" style="${bg}">
        <div class="pos-grid">${dots}</div>
        <div class="hero-mini-label">${escapeHtml(s.title || 'Tiêu đề slide')}</div>
      </div>`;
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
                    <label>TIÊU ĐỀ LỚN</label>
                    <input type="text" value="${escapeHtml(s.title)}" oninput="AdminSliders.setField(${i},'title',this.value);AdminSliders.refreshPreview(${i})">
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

  window.AdminSliders = { setField, setPos, move: (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    [slides[i], slides[j]] = [slides[j], slides[i]];
    render();
  }, remove, refreshPreview };
});
