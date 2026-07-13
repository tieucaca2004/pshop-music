(function () {
  const PAGE_SIZE = window.matchMedia('(max-width: 600px)').matches ? 8 : 16;
  const CONTACT = {
    phone: '0901952999',
    phoneDisplay: '0901 952 999',
    zalo: 'https://zalo.me/0901952999',
    facebook: 'https://www.facebook.com/ChoThueThietBiDJ',
    shopee: 'https://shopee.vn/music_store_79'
  };
  // Fallback dùng ngay khi vẽ trang lần đầu — nếu Category Manager (CategoryDB)
  // trả về dữ liệu, hai biến này được ghi đè bằng danh sách danh mục thật.
  let CAT_LABELS = { all: 'Tất cả sản phẩm', dj: 'Máy DJ & Controller', loa: 'Loa kiểm âm', tainghe: 'Tai nghe', soundcard: 'Soundcard', phukien: 'Phụ kiện' };
  let VALID_CATEGORIES = ['dj', 'loa', 'tainghe', 'soundcard', 'phukien'];

  let allProducts = [];
  let categoryTiles = [];
  let categoryData = []; // Sprint 13: lưu list category thật để đọc backgroundImage
  let state = { category: 'all', query: '', visibleCount: PAGE_SIZE };

  const grid = document.getElementById('productGrid');
  const resultCount = document.getElementById('resultCount');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const searchInput = document.getElementById('searchInput');

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // AI-generated description đôi khi tự bọc cả phản hồi trong 1 khối code
  // markdown (```html ... ```) dù Prompt không yêu cầu — không phải thẻ HTML
  // thật, hiển thị nguyên văn "```html"/"```" nếu không loại bỏ trước khi
  // render qua innerHTML.
  function stripCodeFence(str) {
    return String(str || '')
      .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();
  }

  // Sprint 12 Requirement #5 (Media AI — Product & Blog Media) — Product
  // KHÔNG có video AI sinh ra, chỉ dùng link YouTube Admin tự nhập thủ công
  // (pYoutubeUrl, admin/products.html). Nhận nhiều dạng URL YouTube phổ biến
  // (watch?v=, youtu.be/, đã ở dạng embed, Shorts) — trả về '' nếu không
  // nhận diện được, để phần video tự ẩn (đúng "skip that section gracefully").
  function getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  // Sprint 12 Requirement #1 (Product AI V2) — render Mô tả ngắn/Thông số
  // chi tiết/Tính năng/FAQ do Product AI sinh ra, khi có. Không có dữ liệu
  // (sản phẩm chưa chạy Product AI V2) thì các khối này tự ẩn — không đổi
  // giao diện của sản phẩm cũ.
  function renderProductExtras(p) {
    const shortDescEl = document.getElementById('modalShortDesc');
    const cleanShort = stripCodeFence(p.shortDescription);
    if (cleanShort) { shortDescEl.textContent = cleanShort; shortDescEl.style.display = 'block'; }
    else shortDescEl.style.display = 'none';

    const specsEl = document.getElementById('modalSpecs');
    const cleanSpecs = stripCodeFence(p.specifications);
    if (cleanSpecs) { specsEl.innerHTML = cleanSpecs; specsEl.style.display = 'block'; }
    else specsEl.style.display = 'none';

    const featuresEl = document.getElementById('modalFeatures');
    if (Array.isArray(p.features) && p.features.length) {
      featuresEl.innerHTML = p.features.map(f => `<li>${escapeHtml(f)}</li>`).join('');
      featuresEl.style.display = 'flex';
    } else featuresEl.style.display = 'none';

    const faqEl = document.getElementById('modalFaq');
    if (Array.isArray(p.faq) && p.faq.length) {
      faqEl.innerHTML = p.faq.map(item => `
        <div class="modal-faq-item">
          <div class="modal-faq-q">${escapeHtml(item.question || '')}</div>
          <div class="modal-faq-a">${escapeHtml(item.answer || '')}</div>
        </div>`).join('');
      faqEl.style.display = 'block';
    } else faqEl.style.display = 'none';

    // Sprint 12 Requirement #5 — video KHÔNG do AI sinh ra, chỉ hiển thị nếu
    // Admin đã tự nhập link YouTube thật (p.youtubeUrl) — ẩn hoàn toàn nếu
    // không có, đúng "If no YouTube URL exists: Hide the video section."
    const videoEl = document.getElementById('modalVideo');
    const embedUrl = getYoutubeEmbedUrl(p.youtubeUrl);
    if (embedUrl) {
      videoEl.innerHTML = `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(p.name || '')}" allowfullscreen loading="lazy"></iframe>`;
      videoEl.style.display = 'block';
    } else {
      videoEl.innerHTML = '';
      videoEl.style.display = 'none';
    }
  }

  window.pshopImgFail = function (img) {
    const wrap = img.parentElement;
    const name = img.alt || '';
    const tile = document.createElement('div');
    tile.className = 'prod-noimg-tile';
    const span = document.createElement('span');
    span.className = 'tile-name';
    span.textContent = name;
    tile.appendChild(span);
    wrap.replaceWith(tile);
  };

  function matchesQuery(p, q) {
    if (!q) return true;
    const hay = (p.name + ' ' + p.brand + ' ' + p.specs).toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  // productCategoryIds — Sprint 13 (Product Management V2: Category
  // Assignment). 1 sản phẩm có thể thuộc NHIỀU danh mục (categoryIds) —
  // sản phẩm CŨ chỉ có "category" (field cũ, vẫn giữ nguyên) tự coi như
  // categoryIds 1 phần tử ngay khi đọc, không cần sửa dữ liệu Firebase.
  function productCategoryIds(p) {
    if (Array.isArray(p.categoryIds) && p.categoryIds.length) return p.categoryIds;
    return p.category ? [p.category] : [];
  }

  function getFiltered() {
    return allProducts.filter(p =>
      (state.category === 'all' || productCategoryIds(p).includes(state.category)) &&
      matchesQuery(p, state.query)
    );
  }

  function cardHtml(p) {
    const imgHtml = p.image
      ? `<div class="prod-img-wrap"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.altText || p.name)}" loading="lazy" onerror="window.pshopImgFail(this)"></div>`
      : `<div class="prod-noimg-tile"><span class="tile-name">${escapeHtml(p.name)}</span></div>`;
    const priceHtml = p.price
      ? `<div class="prod-price">${p.oldPrice ? `<span class="prod-price-old">${escapeHtml(p.oldPrice)}</span> ` : ''}${escapeHtml(p.price)}</div>`
      : '';
    const badgeClass = p.status === 'Used' ? 'badge-used' : 'badge-new';
    const outOfStock = p.stockStatus === 'outofstock';
    return `
      <div class="product-card${outOfStock ? ' out-of-stock' : ''}" data-id="${p.id}">
        ${imgHtml}
        ${outOfStock ? '<span class="prod-oos-badge">HẾT HÀNG</span>' : ''}
        <div class="prod-name">${escapeHtml(p.name)}</div>
        <div class="prod-brand">${escapeHtml(p.specs)}</div>
        ${priceHtml}
        <span class="prod-badge ${badgeClass}">${escapeHtml(p.badgeText || (p.status === 'Used' ? 'Used' : 'New'))}</span>
        <div class="prod-contact">${p.price ? 'Liên hệ đặt hàng' : 'Liên hệ báo giá'} · <a href="tel:${CONTACT.phone}" style="color:var(--gold)">${CONTACT.phoneDisplay}</a></div>
      </div>`;
  }

  function render() {
    const filtered = getFiltered();
    const visible = filtered.slice(0, state.visibleCount);

    if (visible.length === 0) {
      grid.innerHTML = '<div class="empty-state">Không tìm thấy sản phẩm phù hợp. Thử từ khóa khác hoặc chọn danh mục khác.</div>';
    } else {
      grid.innerHTML = visible.map(cardHtml).join('');
      grid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
          const p = allProducts.find(x => x.id === card.dataset.id);
          if (p) openModal(p);
        });
      });
    }

    resultCount.textContent = filtered.length + ' sản phẩm';
    loadMoreWrap.style.display = filtered.length > state.visibleCount ? 'block' : 'none';
  }

  function findFilterBtn(cat) {
    return document.querySelector(`.filter-btn[data-cat="${cat}"]`);
  }

  function renderFilterBar(categories) {
    const bar = document.querySelector('.filter-bar');
    if (!bar || !categories.length) return;
    const buttons = [{ code: 'all', label: 'Tất cả' }].concat(categories.map(c => ({ code: c.code, label: c.label })));
    bar.innerHTML = buttons.map(b =>
      `<button class="filter-btn" data-cat="${b.code}" onclick="filterP('${b.code}',this)">${escapeHtml(b.label)}</button>`
    ).join('');
    const activeBtn = findFilterBtn(state.category) || bar.querySelector('.filter-btn');
    if (activeBtn) activeBtn.classList.add('active');
  }

  function loadCategories() {
    if (typeof CategoryDB === 'undefined') return;
    withTimeout(CategoryDB.getAll(), 10000).then(list => {
      const active = list.filter(c => c.active !== false);
      if (!active.length) return;
      categoryData = active; // Sprint 13: lưu để updateCategoryHeader đọc backgroundImage
      CAT_LABELS = { all: 'Tất cả sản phẩm' };
      active.forEach(c => { CAT_LABELS[c.code] = c.label; });
      VALID_CATEGORIES = active.map(c => c.code);
      renderFilterBar(active);
      updateCategoryHeader(state.category);
    }).catch(err => console.error('Không tải được danh mục, dùng danh mục mặc định:', err));
  }

  function pushCategoryUrl(cat) {
    const params = new URLSearchParams(location.search);
    if (cat === 'all') params.delete('cat'); else params.set('cat', cat);
    const qs = params.toString();
    const newUrl = location.pathname + (qs ? '?' + qs : '');
    if (location.pathname + location.search === newUrl) return;
    history.pushState({ cat: cat }, '', newUrl);
  }

  function updateCategoryHeader(cat) {
    const header = document.getElementById('categoryHeader');
    const bgLayer = document.getElementById('categoryHeaderBg');
    const productImg = document.getElementById('categoryHeaderProductImg');
    const logoImg = document.getElementById('categoryHeaderLogo');
    const titleEl = document.getElementById('categoryHeaderTitle');
    const crumbEl = document.getElementById('breadcrumbCat');
    const label = CAT_LABELS[cat] || 'Sản phẩm';
    if (titleEl) titleEl.textContent = label.toUpperCase();
    if (crumbEl) crumbEl.textContent = label;
    document.getElementById('pageTitle').textContent = label + ' - Pshop Music';

    // Sprint 13: ưu tiên backgroundImage từ category thật (field mới),
    // fallback về categoryTiles.image (cũ) để backward compatible.
    const catObj = categoryData.find(c => c.code === cat);
    const bgFromCat = catObj && catObj.backgroundImage;
    const tile = !bgFromCat && categoryTiles.find(t => t.category === cat && t.image);
    const bg = bgFromCat || (tile && tile.image) || '';
    if (bgLayer) bgLayer.style.backgroundImage = bg ? `url('${bg}')` : 'none';

    // Category Cover (Sprint 13, Product Image Presentation) — lớp Ảnh sản
    // phẩm/Logo/vị trí/zoom/opacity/blur/overlay chồng lên Ảnh nền. Founder
    // KHÔNG bắt buộc thiết lập — nếu chưa có coverProductImage, chỉ hiện Ảnh
    // nền + tiêu đề như trước (0 regression cho Danh mục chưa dùng tính năng
    // này). Áp qua CSS custom property + data-attribute — KHÔNG viết logic vẽ
    // ảnh mới (Canvas/SVG), tái dùng nguyên object-fit:contain đã có.
    if (header) {
      header.style.setProperty('--cover-blur', (catObj && catObj.coverBlur ? catObj.coverBlur : 0) + 'px');
      header.style.setProperty('--cover-overlay', (catObj && typeof catObj.coverOverlay === 'number' ? catObj.coverOverlay : 100) / 100);
    }
    if (productImg) {
      const coverImg = catObj && catObj.coverProductImage;
      if (coverImg) {
        productImg.src = coverImg;
        productImg.style.display = 'block';
        productImg.setAttribute('data-cover-position', (catObj && catObj.coverPosition) || 'center-right');
        productImg.style.setProperty('--cover-zoom', ((catObj && catObj.coverZoom ? catObj.coverZoom : 100) / 100));
        productImg.style.setProperty('--cover-opacity', ((catObj && typeof catObj.coverOpacity === 'number' ? catObj.coverOpacity : 100) / 100));
      } else {
        productImg.style.display = 'none';
      }
    }
    if (logoImg) {
      const logo = catObj && catObj.coverLogo;
      if (logo) { logoImg.src = logo; logoImg.style.display = 'block'; } else { logoImg.style.display = 'none'; }
    }
  }

  window.filterP = function (cat, btn, opts) {
    state.category = cat;
    state.visibleCount = PAGE_SIZE;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
    updateCategoryHeader(cat);
    if (!opts || !opts.skipUrlUpdate) pushCategoryUrl(cat);
  };

  window.addEventListener('popstate', () => {
    const cat = new URLSearchParams(location.search).get('cat') || 'all';
    const target = VALID_CATEGORIES.includes(cat) ? cat : 'all';
    const btn = findFilterBtn(target) || document.querySelector('.filter-btn');
    filterP(target, btn, { skipUrlUpdate: true });
  });

  function openModal(p) {
    const imgSide = document.getElementById('modalImgSide');
    const noImg = document.getElementById('modalNoImg');
    imgSide.querySelectorAll('img, .modal-gallery-nav, .modal-gallery-dots').forEach(el => el.remove());

    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    noImg.textContent = p.name;

    if (images.length === 0) {
      noImg.style.display = 'block';
    } else {
      noImg.style.display = 'none';
      let current = 0;

      const img = document.createElement('img');
      img.alt = p.altText || p.name;
      img.onerror = function () { noImg.style.display = 'block'; this.remove(); };
      imgSide.insertBefore(img, noImg);

      function showImage(i) {
        current = (i + images.length) % images.length;
        img.src = images[current];
        if (dotsWrap) {
          Array.from(dotsWrap.children).forEach((d, idx) => d.classList.toggle('active', idx === current));
        }
      }

      let dotsWrap = null;
      if (images.length > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'modal-gallery-nav modal-gallery-prev';
        prevBtn.setAttribute('aria-label', 'Ảnh trước');
        prevBtn.innerHTML = '&#8249;';
        prevBtn.onclick = () => showImage(current - 1);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'modal-gallery-nav modal-gallery-next';
        nextBtn.setAttribute('aria-label', 'Ảnh sau');
        nextBtn.innerHTML = '&#8250;';
        nextBtn.onclick = () => showImage(current + 1);

        dotsWrap = document.createElement('div');
        dotsWrap.className = 'modal-gallery-dots';
        images.forEach((_, idx) => {
          const dot = document.createElement('button');
          if (idx === 0) dot.classList.add('active');
          dot.onclick = () => showImage(idx);
          dotsWrap.appendChild(dot);
        });

        imgSide.appendChild(prevBtn);
        imgSide.appendChild(nextBtn);
        imgSide.appendChild(dotsWrap);
      }

      showImage(0);
    }

    document.getElementById('modalCat').textContent = p.categoryLabel || '';
    document.getElementById('modalName').textContent = p.name;
    document.getElementById('modalBrand').textContent = p.specs;
    document.getElementById('modalDesc').innerHTML = stripCodeFence(p.description);
    renderProductExtras(p);

    const priceEl = document.getElementById('modalPrice');
    if (p.price) {
      priceEl.innerHTML = (p.oldPrice ? `<span class="prod-price-old">${escapeHtml(p.oldPrice)}</span> ` : '') + escapeHtml(p.price);
      priceEl.style.display = 'block';
    } else priceEl.style.display = 'none';

    const b = document.getElementById('modalBadge');
    b.textContent = p.badgeText || (p.status === 'Used' ? 'Used' : 'New');
    b.className = 'modal-badge ' + (p.status === 'Used' ? 'badge-used' : 'badge-new');

    const oosEl = document.getElementById('modalOutOfStock');
    if (oosEl) oosEl.style.display = p.stockStatus === 'outofstock' ? 'inline-block' : 'none';

    const btn2 = document.getElementById('modalSecondBtn');
    if (productCategoryIds(p).includes('phukien')) {
      btn2.href = CONTACT.shopee;
      btn2.textContent = 'XEM TRÊN SHOPEE →';
    } else {
      btn2.href = CONTACT.facebook;
      btn2.textContent = 'NHẮN TIN FACEBOOK →';
    }

    document.getElementById('modalZalo').href = CONTACT.zalo;

    document.getElementById('modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  window.closeModal = function () {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
  };

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');
    }
  });

  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.query = e.target.value.trim();
        state.visibleCount = PAGE_SIZE;
        render();
      }, 150);
    });
  }

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.visibleCount += PAGE_SIZE;
      render();
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);
  }

  const initialCat = (() => {
    const cat = new URLSearchParams(location.search).get('cat') || 'all';
    return VALID_CATEGORIES.includes(cat) ? cat : 'all';
  })();
  state.category = initialCat;

  const initialBtn = findFilterBtn(initialCat);
  if (initialBtn) initialBtn.classList.add('active');
  updateCategoryHeader(initialCat);

  withTimeout(DB.getAll(), 10000).then(products => {
    // pubStatus (Sprint 12 Requirement #10, Product Management) - CHỈ ẩn sản
    // phẩm có pubStatus rõ ràng là 'draft'/'hidden'. 42 sản phẩm thật hiện
    // có đều CHƯA có field này (undefined) - PHẢI coi là "đã xuất bản"/hiển
    // thị, tuyệt đối không được yêu cầu === 'published' (sẽ làm biến mất
    // toàn bộ sản phẩm thật đang có trên web).
    allProducts = products.filter(p => p.pubStatus !== 'draft' && p.pubStatus !== 'hidden');
    render();
    // Sprint 12 Requirement #5 (Media AI — Product & Blog Media) — "Sản phẩm
    // liên quan" cuối bài Blog cần 1 link thật mở đúng sản phẩm, không chỉ
    // trỏ về trang danh mục chung chung. Product chưa có URL/trang riêng
    // (xem PROJECT_ARCHITECTURE.md mục Product AI V2) nên dùng query param
    // ?product=ID để tự mở đúng modal khi tải trang — không thêm route/
    // trang mới, chỉ đọc thêm 1 param có sẵn trên cùng URL category.html.
    const productParam = new URLSearchParams(location.search).get('product');
    if (productParam) {
      const p = allProducts.find(x => x.id === productParam);
      if (p) openModal(p);
    }
  }).catch(err => {
    console.error('Không tải được dữ liệu sản phẩm:', err);
    grid.innerHTML = '<div class="empty-state">Không tải được dữ liệu sản phẩm. Vui lòng thử tải lại trang, hoặc liên hệ <a href="tel:0901952999" style="color:var(--gold-ink);font-weight:600">0901 952 999</a> nếu vẫn lỗi.</div>';
    resultCount.textContent = '';
  });

  if (typeof SiteContentDB !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      categoryTiles = Array.isArray(content.categoryTiles) ? content.categoryTiles : [];
      updateCategoryHeader(state.category);
      if (typeof SiteChrome !== 'undefined') {
        SiteChrome.renderNav(content.menu, content.settings);
        SiteChrome.renderFooter(content.footer);
      }
    }).catch(() => {
      if (typeof SEED_SITE_CONTENT !== 'undefined') {
        categoryTiles = SEED_SITE_CONTENT.categoryTiles || [];
        updateCategoryHeader(state.category);
      }
    });
  }

  loadCategories();

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
  }
})();
