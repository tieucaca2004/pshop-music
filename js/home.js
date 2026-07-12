(function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);
  }

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');
    }
  });

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
    }, 800);
  };

  /* ---------------- Hero slideshow ---------------- */
  let heroSlidesData = [];

  function renderHeroSlides(slides) {
    const slidesWrap = document.getElementById('heroSlides');
    if (!slidesWrap || !Array.isArray(slides) || !slides.length) return;
    heroSlidesData = slides;
    slidesWrap.innerHTML = slides.map((s, i) =>
      `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${escapeHtml(s.image || s)}')"></div>`
    ).join('');
    updateHeroText(0);
  }

  function updateHeroText(index) {
    const slide = heroSlidesData[index];
    if (!slide || typeof slide === 'string') return;
    const titleEl = document.getElementById('heroTitle');
    const subEl = document.getElementById('heroSubtitle');
    const ctaBtn = document.getElementById('heroCta');
    const heroSection = document.getElementById('heroSection');
    if (titleEl && slide.title) titleEl.textContent = slide.title;
    if (subEl && slide.subtitle) subEl.textContent = slide.subtitle;
    if (ctaBtn) ctaBtn.dataset.link = slide.link || '';
    // Vị trí chữ tiêu đề (Sprint 13) — Slide chưa có field "position" (undefined,
    // mọi Slide cũ hiện có) mặc định "bottom-left", khớp ĐÚNG vị trí cố định
    // trước đây — xem css/style.css .hero[data-text-pos].
    if (heroSection) heroSection.dataset.textPos = slide.position || 'bottom-left';
  }

  window.handleHeroCta = function () {
    const link = document.getElementById('heroCta').dataset.link;
    if (!link) {
      document.getElementById('categories').scrollIntoView({ behavior: 'smooth' });
    } else if (link.startsWith('#')) {
      const el = document.getElementById(link.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else location.href = link;
    } else {
      location.href = link;
    }
  };

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
    }

    function next() { goTo((current + 1) % slides.length); }

    function restart() {
      clearInterval(timer);
      timer = setInterval(next, 4500);
    }

    dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); restart(); }));
    restart();
  }

  /* ---------------- Category tiles ---------------- */
  function renderCategoryTiles(tiles) {
    const grid = document.getElementById('catTileGrid');
    if (!grid || !Array.isArray(tiles) || !tiles.length) return;
    grid.innerHTML = tiles.map(t => {
      const href = `category.html?cat=${encodeURIComponent(t.category)}`;
      const classes = ['cat-tile'];
      if (t.size === 'wide') classes.push('wide');
      if (t.skin === 'light') classes.push('skin-light');
      if (!t.image) classes.push('no-photo');
      const imgHtml = t.image
        ? `<img src="${escapeHtml(t.image)}" alt="${escapeHtml(t.label)}" loading="lazy" onerror="this.parentElement.classList.add('no-photo');this.remove()">`
        : '';
      return `<a class="${classes.join(' ')}" href="${href}">${imgHtml}<span class="cat-tile-label">${escapeHtml(t.label)}</span></a>`;
    }).join('');
  }

  /* ---------------- Banner zone (Banner Manager) ---------------- */
  function renderBanners() {
    const zone = document.getElementById('bannerZoneHomeTop');
    if (!zone || typeof BannerDB === 'undefined') return;
    BannerDB.getAll().then(list => {
      const active = list.filter(b => b.active !== false && b.zone === 'home-top');
      if (!active.length) return;
      zone.innerHTML = active.map(b => {
        const img = `<img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title || '')}" loading="lazy">`;
        return b.link
          ? `<a class="banner-item" href="${escapeHtml(b.link)}">${img}</a>`
          : `<div class="banner-item">${img}</div>`;
      }).join('');
      zone.classList.add('has-banners');
    }).catch(err => console.error('Không tải được banner:', err));
  }

  /* ---------------- Settings (contact info) ---------------- */
  function renderSettings(settings) {
    if (!settings) return;
    const phoneEl = document.getElementById('contactPhone');
    if (phoneEl && settings.phone) {
      phoneEl.href = 'tel:' + settings.phone;
      phoneEl.textContent = settings.phoneDisplay || settings.phone;
    }
    const addressEl = document.getElementById('contactAddress');
    if (addressEl && settings.address) {
      addressEl.textContent = settings.address;
      if (settings.mapLink) addressEl.href = settings.mapLink;
    }
    const hoursEl = document.getElementById('contactHours');
    if (hoursEl && settings.openingHours) hoursEl.textContent = settings.openingHours;
  }

  /* ---------------- Services section ---------------- */
  function renderServices(content) {
    if (!content) return;
    const introEl = document.getElementById('servicesIntro');
    if (introEl && content.servicesIntro) introEl.textContent = content.servicesIntro;

    const svcListEl = document.getElementById('svcList');
    if (svcListEl && Array.isArray(content.serviceItems) && content.serviceItems.length) {
      svcListEl.innerHTML = content.serviceItems.map((item, i) => `
        <div class="svc-item"><span class="svc-num">${String(i + 1).padStart(2, '0')}</span><div class="svc-body"><h4>${escapeHtml(item.title)}</h4><p>${item.desc || ''}</p></div></div>
      `).join('');
    }

    const rowsEl = document.getElementById('infoBoxRows');
    if (rowsEl && Array.isArray(content.infoBoxRows) && content.infoBoxRows.length) {
      rowsEl.innerHTML = content.infoBoxRows.map(row =>
        `<div class="info-row"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`
      ).join('');
    }
  }

  if (typeof SiteContentDB !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      renderHeroSlides(content.heroSlides);
      renderCategoryTiles(content.categoryTiles);
      renderServices(content);
      renderSettings(content.settings);
      if (typeof SiteChrome !== 'undefined') {
        SiteChrome.renderNav(content.menu, content.settings);
        SiteChrome.renderFooter(content.footer);
      }
      initHeroSlideshow();
    }).catch(err => {
      console.error('Không tải được nội dung trang, dùng nội dung mặc định:', err);
      if (typeof SEED_SITE_CONTENT !== 'undefined') renderCategoryTiles(SEED_SITE_CONTENT.categoryTiles);
      initHeroSlideshow();
    });
  } else {
    initHeroSlideshow();
  }

  renderBanners();

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
  }
})();
