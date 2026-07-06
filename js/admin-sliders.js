/*
 * Slider Manager (admin/sliders.html) — friendlier per-slide form UI over
 * the same siteContent.heroSlides node the homepage hero slideshow already
 * reads (js/home.js renderHeroSlides). No change needed on the public site.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'sliders', title: 'QUẢN LÝ SLIDER TRANG CHỦ' }).then(load);

  let siteContent = null;
  let slides = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
      <div class="panel" data-idx="${i}" style="margin-bottom:1rem">
        <div class="field-grid">
          <div class="form-group full">
            <label>ẢNH SLIDE ${i + 1}</label>
            ${MediaLibraryPicker.renderSlot(s.image, url => setField(i, 'image', url), {})}
          </div>
          <div class="form-group">
            <label>TIÊU ĐỀ LỚN</label>
            <input type="text" value="${escapeHtml(s.title)}" oninput="AdminSliders.setField(${i},'title',this.value)">
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
        <div class="admin-actions">
          <button class="btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="AdminSliders.move(${i},-1)">&#8593; LÊN</button>
          <button class="btn-secondary" ${i === slides.length - 1 ? 'disabled' : ''} onclick="AdminSliders.move(${i},1)">&#8595; XUỐNG</button>
          <button class="btn-danger" onclick="AdminSliders.remove(${i})">XÓA SLIDE</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có slide nào.</p>';
  }

  function setField(i, field, value) { slides[i][field] = value; }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    [slides[i], slides[j]] = [slides[j], slides[i]];
    render();
  }

  function remove(i) {
    if (!confirm('Xóa slide này?')) return;
    slides.splice(i, 1);
    render();
  }

  function addSlide() {
    slides.push({ image: '', title: '', subtitle: '', link: '' });
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

  document.getElementById('addSlideBtn').addEventListener('click', addSlide);
  document.getElementById('saveSlidesBtn').addEventListener('click', saveAll);

  window.AdminSliders = { setField, move, remove };
});
