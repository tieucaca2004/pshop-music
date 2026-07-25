(function () {
  const wrap = document.getElementById('postContent');

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  // AI-generated post đôi khi tự bọc cả phản hồi trong 1 khối code markdown
  // (```html ... ```) dù Prompt không yêu cầu — loại bỏ trước khi hiển thị.
  function stripCodeFence(str) {
      .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();

  function stripHtmlTags(str) {

  // Nếu AI trả lời không đúng định dạng "dòng đầu = tiêu đề" đã yêu cầu (tự
  // bọc cả bài trong 1 khối code, đặt tiêu đề trong thẻ <h1> ở dòng sau thay
  // vì dòng đầu dạng chữ thường) — mapToDraftContent() (js/ai/modules/
  // blog-writer.js) tách nhầm dòng khối code fence (vd "```html") thành title.
  // Khôi phục tiêu đề thật từ thẻ <h1> nếu có trong excerpt/nội dung.
  function looksLikeFenceGarbage(title) {
    const t = String(title || '').trim();
    return !t || /^```/.test(t);

  function recoverTitle(p) {
    if (!looksLikeFenceGarbage(p.title)) return p.title;
    const source = stripCodeFence(p.excerpt) || stripCodeFence(p.contentHtml) || '';
    const m = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (m) return stripHtmlTags(m[1]);
    if (p.slug) return p.slug.replace(/-/g, ' ');
    return 'Bài viết';

  function displayExcerpt(p, title) {
    const cleaned = stripCodeFence(p.excerpt);
    if (/^<h1[\s>]/i.test(cleaned) || stripHtmlTags(cleaned) === title) return '';
    return stripHtmlTags(cleaned);

  function PSH.formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('vi-VN');

  function setMeta(name, content, isProperty) {
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    el.setAttribute('content', content);

  function renderPost(p) {
    const realTitle = recoverTitle(p);
    const title = p.seoTitle || realTitle;
    const description = p.seoDescription || displayExcerpt(p, realTitle) || '';
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

    document.getElementById('breadcrumbTitle').textContent = realTitle;
    document.getElementById('postTitle').textContent = realTitle;
    document.getElementById('postMeta').textContent = `${p.author || 'Pshop Music'} · ${PSH.formatDate(p.publishedAt)}`;
    if (p.coverImage) {
      document.getElementById('postCoverWrap').innerHTML = `<img src="${PSH.escapeHtml(p.coverImage)}" alt="${PSH.escapeHtml(realTitle)}">`;
    document.getElementById('postBody').innerHTML = stripCodeFence(p.contentHtml);
    const tagsEl = document.getElementById('postTags');
    if (p.tags && p.tags.length) {
      tagsEl.innerHTML = p.tags.map(t => `<span class="blog-tag">${PSH.escapeHtml(t)}</span>`).join('');

    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: realTitle,
      description,
      image: p.coverImage || undefined,
      author: { '@type': 'Organization', name: p.author || 'Pshop Music' },
      datePublished: p.publishedAt ? new Date(p.publishedAt).toISOString() : undefined,
      dateModified: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined
    document.head.appendChild(ld);

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);

  if (typeof SiteContentDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      SiteChrome.renderNav(content.menu, content.settings);
      SiteChrome.renderFooter(content.footer);

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});

  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    wrap.innerHTML = '<div class="empty-state">Không tìm thấy bài viết.</div>';
    BlogDB.getBySlug(slug).then(p => {
      if (!p || p.status !== 'published') {
        wrap.innerHTML = '<div class="empty-state">Bài viết không tồn tại hoặc đã bị gỡ. <a href="blog.html" style="color:var(--gold-ink)">Quay lại Blog</a></div>';
        return;
      renderPost(p);
      console.error('Không tải được bài viết:', err);
      wrap.innerHTML = '<div class="empty-state">Không tải được bài viết. Vui lòng thử tải lại trang.</div>';
})();
