(function () {
  const PAGE_SIZE = 12;
  const CONTACT = {
    phone: '0901952999',
    phoneDisplay: '0901 952 999',
    zalo: 'https://zalo.me/0901952999',
    facebook: 'https://www.facebook.com/ChoThueThietBiDJ',
    shopee: 'https://shopee.vn/music_store_79'
  };

  let allProducts = [];
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
      ? `<div class="prod-img-wrap"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
      : '';
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

  window.filterP = function (cat, btn) {
    state.category = cat;
    state.visibleCount = PAGE_SIZE;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  };

  function openModal(p) {
    const imgSide = document.getElementById('modalImgSide');
    const noImg = document.getElementById('modalNoImg');
    const oldImg = imgSide.querySelector('img');
    if (oldImg) oldImg.remove();

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

  DB.getAll().then(products => {
    allProducts = products;
    render();
  });
})();
