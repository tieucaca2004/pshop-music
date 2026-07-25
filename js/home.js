(function () {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');

  window.submitForm = function () {
    const n = document.getElementById('fname').value.trim();
    const p = document.getElementById('fphone').value.trim();
    if (!n || !p) { alert('Vui lòng nhập họ tên và số điện thoại.'); return; }
    const btn = document.querySelector('.submit-btn');
    btn.disabled = true;
    btn.textContent = 'Đang gửi...';
    setTimeout(() => {
      btn.style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';

  /* ---------------- Hero slideshow ---------------- */
  let heroSlidesData = [];

  // renderHeroGlobalText — nhãn địa danh ("Nha Trang · Khánh Hòa") + chữ 2
  // nút bấm dưới Hero — trước đây hardcode cứng trong index.html, GIỐNG NHAU
  // ở MỌI Slide (không phải field riêng từng Slide như title/subtitle/link).
  // Giờ quản lý qua CMS (admin/settings.html mục "HERO TRANG CHỦ"). Gọi 1
  // LẦN DUY NHẤT (không theo từng Slide như updateHeroText()).
  // insertMobileNavSearch — Ô tìm kiếm trang chủ (menu mobile). Chèn qua JS
  // thay vì HTML tĩnh vì SiteChrome.renderNav() GHI ĐÈ TOÀN BỘ innerHTML của
  // #mobileNav (xem js/site-chrome.js renderNav()) — đặt tĩnh trong HTML sẽ
  // bị xoá mất ngay khi renderNav() chạy.
  function insertMobileNavSearch() {
    const mobileNav = document.getElementById('mobileNav');
    if (!mobileNav || mobileNav.querySelector('.nav-search-mobile')) return;
    const form = document.createElement('form');
    form.className = 'search-box nav-search-mobile';
    form.action = 'category.html';
    form.method = 'GET';
    form.innerHTML = '<span class="icon">&#128269;</span><input type="text" name="q" placeholder="Tìm sản phẩm...">';
    mobileNav.insertBefore(form, mobileNav.firstChild);

  function renderHeroGlobalText(content) {
    const tagEl = document.getElementById('heroTag');
    const ctaEl = document.getElementById('heroCta');
    const cta2El = document.getElementById('heroCta2');
    if (tagEl && content.heroTag) tagEl.textContent = content.heroTag;
    if (ctaEl && content.heroCtaLabel) ctaEl.textContent = content.heroCtaLabel;
    if (cta2El && content.heroCta2Label) cta2El.textContent = content.heroCta2Label;

  // Zoom/Vị trí ảnh nền Slide (Sprint 14) — Founder kéo tự do trong
  // admin/sliders.html (khung xem trước, không giới hạn mức nào). Mặc định
  // zoom:100/posX:50/posY:30 khớp ĐÚNG "background-position:center 30%" cố
  // định cũ — Slide chưa từng chỉnh giữ NGUYÊN 100% hiển thị như trước.
  //
  // ẢNH NỀN riêng (bgImage, tùy chọn) — Founder KHÔNG đặt = ẢNH SLIDE (s.image)
  // tự lùi về làm backdrop toàn khung như trước (0 regression). Founder ĐẶT
  // Ảnh nền = Ảnh nền trở thành backdrop (nhận Zoom/Vị trí), ẢNH SLIDE lùi
  // thành ảnh sản phẩm chồng lên (xem #heroSubjectImg, updateHeroText()).
  // ẢNH SLIDE giờ auto-xóa phông trắng khi Founder upload (xem
  // js/admin-sliders.js) nên phần trong suốt lộ đúng nền đen .hero — không
  // cần Ảnh nền riêng vẫn hết cảnh "nền trắng xấu" Founder báo.
  function renderHeroSlides(slides) {
    const slidesWrap = document.getElementById('heroSlides');
    if (!slidesWrap || !Array.isArray(slides) || !slides.length) return;
    heroSlidesData = slides;
    slidesWrap.innerHTML = slides.map((s, i) => {
      const bgSrc = s.bgImage || s.image;
      const zoom = typeof s.imageZoom === 'number' ? s.imageZoom : 100;
      const posX = typeof s.imagePosX === 'number' ? s.imagePosX : 50;
      const posY = typeof s.imagePosY === 'number' ? s.imagePosY : 30;
      return `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${PSH.escapeHtml(bgSrc || s)}');background-position:${posX}% ${posY}%;transform:scale(${zoom / 100})"></div>`;
    updateHeroText(0);

  // LEGACY_POSITION_XY — quy đổi 9 điểm CŨ (đã bỏ, Founder yêu cầu thay bằng
  // kéo tự do) sang toạ độ % gần đúng, CHỈ để Slide cũ (đã có field
  // "position" từ trước) không nhảy vị trí đột ngột — Slide MỚI luôn dùng
  // titlePosX/Y hoặc subPosX/Y thật, không qua bảng này. Giữ ĐÚNG logic này
  // đồng bộ với js/admin-sliders.js — sửa 1 nơi phải sửa nơi kia.
  const LEGACY_POSITION_XY = {
    'top-left': { x: 8, y: 18 }, 'top-center': { x: 50, y: 18 }, 'top-right': { x: 92, y: 18 },
    'middle-left': { x: 8, y: 50 }, 'middle-center': { x: 50, y: 50 }, 'middle-right': { x: 92, y: 50 },
    'bottom-left': { x: 8, y: 58 }, 'bottom-center': { x: 50, y: 58 }, 'bottom-right': { x: 92, y: 58 }
  function deriveTitlePos(slide) {
    if (typeof slide.titlePosX === 'number' && typeof slide.titlePosY === 'number') return { x: slide.titlePosX, y: slide.titlePosY };
    return LEGACY_POSITION_XY[slide.position] || LEGACY_POSITION_XY['bottom-left'];
  function deriveSubPos(slide) {
    if (typeof slide.subPosX === 'number' && typeof slide.subPosY === 'number') return { x: slide.subPosX, y: slide.subPosY };
    const t = deriveTitlePos(slide);
  // deriveTagPos/deriveBtnsPos — Nhãn địa danh ("Nha Trang · Khánh Hòa") và 2
  // nút bấm trước đây LUÔN đứng CHUNG khối với Tiêu đề/Mô tả (không kéo/ẩn
  // riêng được — Founder báo không xóa/di chuyển được). Giờ tách thành 2 khối
  // riêng, kéo TỰ DO độc lập — mặc định (chưa từng kéo) neo ngay TRÊN Tiêu đề
  // /DƯỚI Mô tả một khoảng vừa phải, giữ đúng bố cục cũ cho Slide chưa chỉnh.
  function deriveTagPos(slide) {
    if (typeof slide.tagPosX === 'number' && typeof slide.tagPosY === 'number') return { x: slide.tagPosX, y: slide.tagPosY };
    const t = deriveTitlePos(slide);
  function deriveBtnsPos(slide) {
    if (typeof slide.btnsPosX === 'number' && typeof slide.btnsPosY === 'number') return { x: slide.btnsPosX, y: slide.btnsPosY };
    const s = deriveSubPos(slide);

  function updateHeroText(index) {
    const slide = heroSlidesData[index];
    if (!slide || typeof slide === 'string') return;
    const titleEl = document.getElementById('heroTitle');
    const subEl = document.getElementById('heroSubtitle');
    const tagBlock = document.getElementById('heroTagBlock');
    const btnsBlock = document.getElementById('heroBtnsBlock');
    const ctaBtn = document.getElementById('heroCta');
    const heroSection = document.getElementById('heroSection');
    // Ẩn Nhãn địa danh/Nút bấm riêng cho Slide này (Founder tự bấm "Ẩn" trong
    // admin/sliders.html) — chữ vẫn dùng CHUNG (admin/settings.html), chỉ ẩn
    // HIỂN THỊ ở đúng Slide này, không xóa mất chữ gốc dùng cho Slide khác.
    if (tagBlock) tagBlock.style.display = slide.tagHidden ? 'none' : '';
    if (btnsBlock) btnsBlock.style.display = slide.btnsHidden ? 'none' : '';
    // Xóa tiêu đề (Sprint 13, admin/sliders.html) — trước đây "if (slide.title)"
    // chỉ BỎ QUA khi rỗng, để lại chữ CŨ của Slide trước đó còn hiện trên màn
    // hình (sai). Giờ luôn đồng bộ display theo đúng trạng thái Slide hiện tại.
    if (titleEl) {
      const hasTitle = !!(slide.title && slide.title.trim());
      titleEl.style.display = hasTitle ? '' : 'none';
      if (hasTitle) titleEl.textContent = slide.title;
    // Cùng lỗi "để lại chữ CŨ" đã sửa cho tiêu đề ở trên nhưng bị bỏ sót cho
    // mô tả — Slide không có subtitle (vd Slide chỉ có ảnh) vẫn hiện mô tả
    // CŨ của Slide trước đó, đè lên đúng vị trí Slide hiện tại (đây mới là
    // nguyên nhân thật gây "chữ chồng lên nhau" Founder báo, không phải lệch
    // toạ độ — toạ độ luôn tính đúng theo từng Slide).
    if (subEl) {
      const hasSub = !!(slide.subtitle && slide.subtitle.trim());
      subEl.style.display = hasSub ? '' : 'none';
      if (hasSub) subEl.textContent = slide.subtitle;
    if (ctaBtn) ctaBtn.dataset.link = slide.link || '';
    // Ảnh sản phẩm chồng lên (Sprint 14) — CHỈ hiện khi Slide có "bgImage"
    // riêng (2 lớp) — không có Ảnh nền = ẢNH SLIDE đang tự làm backdrop toàn
    // khung rồi (renderHeroSlides), không cần hiện thêm 1 bản overlay nữa.
    const subjectEl = document.getElementById('heroSubjectImg');
    if (subjectEl) {
      if (slide.bgImage && slide.image) {
        subjectEl.src = slide.image;
        subjectEl.style.display = '';
        subjectEl.style.display = 'none';
    // Vị trí + cỡ chữ TỰ DO (thay 9 điểm cũ) — ghi qua CSS custom property
    // trên #heroSection, css/style.css .hero-title-block/.hero-sub-block đọc
    // lại để định vị + .hero h1/.hero-sub đọc lại để co giãn cỡ chữ.
    if (heroSection) {
      const tp = deriveTitlePos(slide);
      const sp = deriveSubPos(slide);
      const tagP = deriveTagPos(slide);
      const btnsP = deriveBtnsPos(slide);
      heroSection.style.setProperty('--hero-title-x', tp.x + '%');
      heroSection.style.setProperty('--hero-title-y', tp.y + '%');
      heroSection.style.setProperty('--hero-sub-x', sp.x + '%');
      heroSection.style.setProperty('--hero-sub-y', sp.y + '%');
      heroSection.style.setProperty('--hero-tag-x', tagP.x + '%');
      heroSection.style.setProperty('--hero-tag-y', tagP.y + '%');
      heroSection.style.setProperty('--hero-btns-x', btnsP.x + '%');
      heroSection.style.setProperty('--hero-btns-y', btnsP.y + '%');
      heroSection.style.setProperty('--hero-title-scale', (typeof slide.titleScale === 'number' ? slide.titleScale : 100) / 100);
      heroSection.style.setProperty('--hero-sub-scale', (typeof slide.subScale === 'number' ? slide.subScale : 100) / 100);

  window.handleHeroCta = function () {
    const link = document.getElementById('heroCta').dataset.link;
    if (!link) {
      document.getElementById('categories').scrollIntoView({ behavior: 'smooth' });
      const el = document.getElementById(link.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else location.href = link;
      location.href = link;

  function initHeroSlideshow() {
    const slidesWrap = document.getElementById('heroSlides');
    const dotsWrap = document.getElementById('heroDots');
    if (!slidesWrap) return;
    const slides = Array.from(slidesWrap.children);
    if (slides.length < 2) return;

    dotsWrap.innerHTML = slides.map((_, i) => `<button aria-label="Slide ${i + 1}"${i === 0 ? ' class="active"' : ''}></button>`).join('');
    const dots = Array.from(dotsWrap.children);

    let current = 0;
    let timer;

    function goTo(index) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
      updateHeroText(current);

    function next() { goTo((current + 1) % slides.length); }

    function restart() {
      clearInterval(timer);
      timer = setInterval(next, 4500);

    dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); restart(); }));
    restart();

  /* ---------------- Category tiles ----------------
   * tileHasCover(t) — Ô có dùng Cover đầy đủ (Ảnh nền/Logo/Vị trí/Zoom/
   * Opacity/Blur/Overlay, ĐÚNG cơ chế Category Cover) hay không — CHỈ bật khi
   * Founder thật sự đặt 1 trong các field mới, để Ô CHƯA từng chỉnh giữ
   * NGUYÊN 100% rendering cũ (0 regression). Giữ ĐÚNG logic này đồng bộ với
   * js/admin-categories.js (Live Preview) — sửa 1 nơi phải sửa nơi kia. */
  function tileHasCover(t) {
    return !!(t.backgroundImage || t.logo || (t.position && t.position !== 'center') ||
      (t.zoom && t.zoom !== 100) || (t.opacity != null && t.opacity !== 100) ||
      (t.blur && t.blur > 0) || (t.overlay != null && t.overlay !== 100));

  function renderCategoryTiles(tiles) {
    const grid = document.getElementById('catTileGrid');
    if (!grid || !Array.isArray(tiles) || !tiles.length) return;
    grid.innerHTML = tiles.map(t => {
      const href = `category.html?cat=${encodeURIComponent(t.category)}`;
      const classes = ['cat-tile'];
      if (t.size === 'wide') classes.push('wide');
      else if (t.size === 'large') classes.push('large');
      else if (t.size === 'small') classes.push('small');
      if (t.skin === 'light') classes.push('skin-light');
      if (!t.image && !t.backgroundImage) classes.push('no-photo');

      // customAspectRatio — Founder kéo TỰ DO cạnh dưới khung Cover Preview để
      // đổi CHIỀU CAO/tỷ lệ khung Ô, KHÔNG giới hạn 4 mức Nhỏ/Vừa/Lớn/Banner
      // ngang nữa (chỉ CHIỀU RỘNG — số cột chiếm — vẫn theo "size" ở trên, vì
      // lưới CSS Grid 3 cột bắt buộc số cột nguyên để tự responsive đúng trên
      // mọi màn hình). Ghi đè qua inline style (thắng mọi aspect-ratio/height
      // cố định của class .small/.large/.wide) — Ô CHƯA từng kéo (không có
      // field này) giữ NGUYÊN 100% tỷ lệ mặc định của size đã chọn.
      const ratioStyle = t.customAspectRatio ? ` style="aspect-ratio:${t.customAspectRatio};height:auto"` : '';

      let inner;
      if (tileHasCover(t)) {
        classes.push('has-cover');
        const bgHtml = t.backgroundImage
          ? `<div class="cat-tile-bg" style="background-image:url('${PSH.escapeHtml(t.backgroundImage)}');filter:blur(${t.blur || 0}px)"></div><div class="cat-tile-cover-overlay" style="opacity:${(t.overlay != null ? t.overlay : 100) / 100}"></div>`
          : '';
        const prodHtml = t.image
          ? `<img class="cat-tile-product-img" data-cover-position="${t.position || 'center'}" style="--cover-zoom:${(t.zoom || 100) / 100};--cover-opacity:${(t.opacity != null ? t.opacity : 100) / 100}" src="${PSH.escapeHtml(t.image)}" alt="${PSH.escapeHtml(t.label)}" loading="lazy" onerror="this.remove()">`
          : '';
        const logoHtml = t.logo ? `<img class="cat-tile-logo" src="${PSH.escapeHtml(t.logo)}" alt="" loading="lazy">` : '';
        inner = bgHtml + prodHtml + logoHtml;
        inner = t.image
          ? `<img src="${PSH.escapeHtml(t.image)}" alt="${PSH.escapeHtml(t.label)}" loading="lazy" onerror="this.parentElement.classList.add('no-photo');this.remove()">`
          : '';
      return `<a class="${classes.join(' ')}" href="${href}"${ratioStyle}>${inner}<span class="cat-tile-label">${PSH.escapeHtml(t.label)}</span></a>`;

  // renderCategoriesIntro — tiêu đề "DANH MỤC SẢN PHẨM / CHỌN DANH MỤC ĐỂ
  // XEM..." phía trên lưới Ô, giờ quản lý qua CMS (admin/settings.html, mục
  // "Tiêu đề khu Danh mục") thay vì hardcode cứng trong index.html — Founder
  // tự Sửa/Ẩn (bật "categoriesIntroEnabled") mà không cần đổi code. Mặc định
  // ẨN (seed `categoriesIntroEnabled:false`) vì Founder trước đó đã chủ động
  // yêu cầu bỏ khối này để tối ưu diện tích Ô Danh mục — chỉ hiện lại khi
  // Founder tự bật ở CMS.
  function renderCategoriesIntro(content) {
    const wrap = document.getElementById('catTilesIntro');
    if (!wrap) return;
    if (!content.categoriesIntroEnabled) { wrap.style.display = 'none'; return; }
    const eyebrowEl = document.getElementById('catTilesEyebrow');
    const titleEl = document.getElementById('catTilesTitle');
    const descEl = document.getElementById('catTilesDesc');
    if (eyebrowEl) eyebrowEl.textContent = content.categoriesEyebrow || '';
    if (titleEl) titleEl.textContent = content.categoriesTitle || '';
    if (descEl) descEl.textContent = content.categoriesDesc || '';
    wrap.style.display = '';

  /* ---------------- Banner zone (Banner Manager) ---------------- */
  function renderBanners() {
    const zone = document.getElementById('bannerZoneHomeTop');
    if (!zone || typeof BannerDB === 'undefined') return;
    BannerDB.getAll().then(list => {
      const active = list.filter(b => b.active !== false && b.zone === 'home-top');
      if (!active.length) return;
      zone.innerHTML = active.map(b => {
        const img = `<img src="${PSH.escapeHtml(b.image)}" alt="${PSH.escapeHtml(b.title || '')}" loading="lazy">`;
        return b.link
          ? `<a class="banner-item" href="${PSH.escapeHtml(b.link)}">${img}</a>`
          : `<div class="banner-item">${img}</div>`;
      zone.classList.add('has-banners');

  /* ---------------- Settings (contact info) ---------------- */
  function renderSettings(settings) {
    if (!settings) return;
    const phoneEl = document.getElementById('contactPhone');
    if (phoneEl && settings.phone) {
      phoneEl.href = 'tel:' + settings.phone;
      phoneEl.textContent = settings.phoneDisplay || settings.phone;
    const addressEl = document.getElementById('contactAddress');
    if (addressEl && settings.address) {
      addressEl.textContent = settings.address;
      if (settings.mapLink) addressEl.href = settings.mapLink;
    const hoursEl = document.getElementById('contactHours');
    if (hoursEl && settings.openingHours) hoursEl.textContent = settings.openingHours;

    // Nút chat nổi (Messenger) — href có sẵn giá trị mặc định tĩnh trong
    // index.html (hiện đúng ngay cả trước khi Firebase tải xong), JS chỉ
    // ghi đè khi CMS có link Messenger thật khác giá trị đó.
    const messengerBtn = document.getElementById('messengerChatBtn');
    const messengerLink = settings.socials && settings.socials.messenger;
    if (messengerBtn && messengerLink) messengerBtn.href = messengerLink;

  /* ---------------- Services section ---------------- */
  function renderServices(content) {
    if (!content) return;
    const introEl = document.getElementById('servicesIntro');
    if (introEl && content.servicesIntro) introEl.textContent = content.servicesIntro;

    const svcListEl = document.getElementById('svcList');
    if (svcListEl && Array.isArray(content.serviceItems) && content.serviceItems.length) {
      svcListEl.innerHTML = content.serviceItems.map((item, i) => `
        <div class="svc-item"><span class="svc-num">${String(i + 1).padStart(2, '0')}</span><div class="svc-body"><h4>${PSH.escapeHtml(item.title)}</h4><p>${item.desc || ''}</p></div></div>
      `).join('');

    const rowsEl = document.getElementById('infoBoxRows');
    if (rowsEl && Array.isArray(content.infoBoxRows) && content.infoBoxRows.length) {
      rowsEl.innerHTML = content.infoBoxRows.map(row =>
        `<div class="info-row"><span>${PSH.escapeHtml(row.label)}</span><span>${PSH.escapeHtml(row.value)}</span></div>`
      ).join('');

  if (typeof SiteContentDB !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      renderHeroGlobalText(content);
      renderHeroSlides(content.heroSlides);
      renderCategoriesIntro(content);
      renderCategoryTiles(content.categoryTiles);
      renderServices(content);
      renderSettings(content.settings);
      if (typeof SiteChrome !== 'undefined') {
        SiteChrome.renderNav(content.menu, content.settings);
        SiteChrome.renderFooter(content.footer);
      insertMobileNavSearch();
      initHeroSlideshow();
      console.error('Không tải được nội dung trang, dùng nội dung mặc định:', err);
      if (typeof SEED_SITE_CONTENT !== 'undefined') {
        renderHeroGlobalText(SEED_SITE_CONTENT);
        renderCategoriesIntro(SEED_SITE_CONTENT);
        renderCategoryTiles(SEED_SITE_CONTENT.categoryTiles);
      insertMobileNavSearch();
      initHeroSlideshow();
    insertMobileNavSearch();
    initHeroSlideshow();

  renderBanners();

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
})();
