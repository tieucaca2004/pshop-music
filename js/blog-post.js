(function () {
  const wrap = document.getElementById('postContent');

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('vi-VN');
  }

  function setMeta(name, content, isProperty) {
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function renderPost(p) {
    const title = p.seoTitle || p.title;
    const description = p.seoDescription || p.excerpt || '';
    document.title = title + ' - Pshop Music';
    setMeta('description', description);
    setMeta('og:title', p.ogTitle || title, true);
    setMeta('og:description', p.ogDescription || description, true);
    if (p.ogImage || p.coverImage) setMeta('og:image', p.ogImage || p.coverImage, true);
    // SEO Generator (Sprint 2) có thể sinh thêm keywords — chỉ thêm thẻ meta
    // ẩn trong <head>, không đổi giao diện hiển thị.
    if (Array.isArray(p.keywords) && p.keywords.length) setMeta('keywords', p.keywords.join(', '));
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = 'https://pshopmusic.com/blog-post.html?slug=' + encodeURIComponent(p.slug);

    document.getElementById('breadcrumbTitle').textContent = p.title;
    document.getElementById('postTitle').textContent = p.title;
    document.getElementById('postMeta').textContent = `${p.author || 'Pshop Music'} · ${formatDate(p.publishedAt)}`;
    if (p.coverImage) {
      document.getElementById('postCoverWrap').innerHTML = `<img src="${escapeHtml(p.coverImage)}" alt="${escapeHtml(p.title)}">`;
    }
    document.getElementById('postBody').innerHTML = p.contentHtml || '';
    const tagsEl = document.getElementById('postTags');
    if (p.tags && p.tags.length) {
      tagsEl.innerHTML = p.tags.map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`).join('');
    }

    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description,
      image: p.coverImage || undefined,
      author: { '@type': 'Organization', name: p.author || 'Pshop Music' },
      datePublished: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined,
      dateModified: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined
    });
    document.head.appendChild(ld);
  }

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');
    }
  });

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);
  }

  if (typeof SiteContentDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      SiteChrome.renderNav(content.menu, content.settings);
      SiteChrome.renderFooter(content.footer);
    }).catch(() => {});
  }

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
  }

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    wrap.innerHTML = '<div class="empty-state">Không tìm thấy bài viết.</div>';
  } else {
    BlogDB.getBySlug(slug).then(p => {
      if (!p || p.status !== 'published') {
        wrap.innerHTML = '<div class="empty-state">Bài viết không tồn tại hoặc đã bị gỡ. <a href="blog.html" style="color:var(--gold-ink)">Quay lại Blog</a></div>';
        return;
      }
      renderPost(p);
    }).catch(err => {
      console.error('Không tải được bài viết:', err);
      wrap.innerHTML = '<div class="empty-state">Không tải được bài viết. Vui lòng thử tải lại trang.</div>';
    });
  }
})();
