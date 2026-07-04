(function () {
  const PAGE_SIZE = 12;
  const DATA = window.PSHOP_DATA || { products: [], contact: {} };
  const CONTACT = DATA.contact;

  let allProducts = DATA.products || [];
  let state = { category: 'all', query: '', visibleCount: PAGE_SIZE };

  const grid = document.getElementById('productGrid');
  const resultCount = document.getElementById('resultCount');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const searchInput = document.getElementById('searchInput');

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

  window.jumpToCategory = function (cat) {
    const btn = Array.from(document.querySelectorAll('.filter-btn'))
      .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${cat}'`));
    if (btn) filterP(cat, btn);
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

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
    const priceHtml = p.price ? `<div class="prod-price">${escapeHtml(p.price)}</div>` : '';
    const badgeClass = p.status === 'Used' ? 'badge-used' : 'badge-new';
    return `
      <div class="product-card" data-id="${p.id}">
        ${imgHtml}
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

  const VALID_CATEGORIES = ['dj', 'loa', 'tainghe', 'soundcard', 'phukien'];

  function findFilterBtn(cat) {
    return Array.from(document.querySelectorAll('.filter-btn'))
      .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${cat}'`));
  }

  function pushCategoryUrl(cat) {
    const newHash = cat === 'all' ? '' : ('#' + cat);
    if (location.hash === newHash) return;
    const newUrl = location.pathname + location.search + newHash;
    history.pushState({ cat: cat }, '', newUrl);
  }

  window.filterP = function (cat, btn, opts) {
    state.category = cat;
    state.visibleCount = PAGE_SIZE;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
    if (!opts || !opts.skipUrlUpdate) pushCategoryUrl(cat);
  };

  window.addEventListener('popstate', () => {
    const cat = location.hash.replace('#', '');
    const target = VALID_CATEGORIES.includes(cat) ? cat : 'all';
    const btn = findFilterBtn(target) || document.querySelector('.filter-btn');
    filterP(target, btn, { skipUrlUpdate: true });
  });

  function openModal(p) {
    const imgSide = document.getElementById('modalImgSide');
    const noImg = document.getElementById('modalNoImg');
    const oldImg = imgSide.querySelector('img');
    if (oldImg) oldImg.remove();

    noImg.textContent = p.name;
    if (p.image) {
      noImg.style.display = 'none';
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = p.name;
      img.onerror = function () { noImg.style.display = 'block'; this.remove(); };
      imgSide.insertBefore(img, noImg);
    } else {
      noImg.style.display = 'block';
    }

    document.getElementById('modalCat').textContent = p.categoryLabel || '';
    document.getElementById('modalName').textContent = p.name;
    document.getElementById('modalBrand').textContent = p.specs;
    document.getElementById('modalDesc').textContent = p.description;

    const priceEl = document.getElementById('modalPrice');
    if (p.price) { priceEl.textContent = p.price; priceEl.style.display = 'block'; }
    else priceEl.style.display = 'none';

    const b = document.getElementById('modalBadge');
    b.textContent = p.badgeText || (p.status === 'Used' ? 'Used' : 'New');
    b.className = 'modal-badge ' + (p.status === 'Used' ? 'badge-used' : 'badge-new');

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
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
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

  (function applyInitialHash() {
    const hashCat = location.hash.replace('#', '');
    if (VALID_CATEGORIES.includes(hashCat)) {
      const btn = findFilterBtn(hashCat);
      if (btn) {
        state.category = hashCat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }
  })();
  render();

  (function initHeroSlideshow() {
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
    }

    function next() { goTo((current + 1) % slides.length); }

    function restart() {
      clearInterval(timer);
      timer = setInterval(next, 4500);
    }

    dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); restart(); }));
    restart();
  })();
})();
