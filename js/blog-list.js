(function () {
  const grid = document.getElementById('blogGrid');

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('vi-VN');
  }

  function cardHtml(p) {
    const img = p.coverImage
      ? `<div class="blog-card-img"><img src="${escapeHtml(p.coverImage)}" alt="${escapeHtml(p.title)}" loading="lazy"></div>`
      : '';
    return `
      <a class="blog-card" href="blog-post.html?slug=${encodeURIComponent(p.slug)}">
        ${img}
        ${p.tags && p.tags.length ? `<div class="blog-card-tags">${escapeHtml(p.tags[0])}</div>` : ''}
        <div class="blog-card-title">${escapeHtml(p.title)}</div>
        <div class="blog-card-excerpt">${escapeHtml(p.excerpt || '')}</div>
        <div class="blog-card-meta">${escapeHtml(p.author || 'Pshop Music')} · ${formatDate(p.publishedAt)}</div>
      </a>`;
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
    if (nav && nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');
    }
  });

  withTimeout(BlogDB.getPublished(), 10000).then(posts => {
    posts.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    if (!posts.length) {
      grid.innerHTML = '<div class="empty-state">Chưa có bài viết nào. Quay lại sau nhé!</div>';
      return;
    }
    grid.innerHTML = posts.map(cardHtml).join('');
  }).catch(err => {
    console.error('Không tải được danh sách blog:', err);
    grid.innerHTML = '<div class="empty-state">Không tải được danh sách bài viết. Vui lòng thử tải lại trang.</div>';
  });

  if (typeof SiteContentDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      SiteChrome.renderNav(content.menu, content.settings);
      SiteChrome.renderFooter(content.footer);
    }).catch(() => {});
  }

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
  }
})();
