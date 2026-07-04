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

  function getFiltered() {
    return allProducts.filter(p =>
      (state.category === 'all' || p.category === state.category) &&
      matchesQuery(p, state.query)
    );
  }

  function cardHtml(p) {
    const imgHtml = p.image
      ? `<div class="prod-img-wrap"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="window.pshopImgFail(this)"></div>`
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
    const titleEl = document.getElementById('categoryHeaderTitle');
    const crumbEl = document.getElementById('breadcrumbCat');
    const label = CAT_LABELS[cat] || 'Sản phẩm';
    if (titleEl) titleEl.textContent = label.toUpperCase();
    if (crumbEl) crumbEl.textContent = label;
    document.getElementById('pageTitle').textContent = label + ' - Pshop Music';

    const tile = categoryTiles.find(t => t.category === cat && t.image);
    if (header) header.style.backgroundImage = tile ? `url('${tile.image}')` : 'none';
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
      img.alt = p.name;
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
    document.getElementById('modalDesc').innerHTML = p.description;

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
    if (p.category === 'phukien') {
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
    allProducts = products;
    render();
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
