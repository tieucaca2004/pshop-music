(function () {
  const grid = document.getElementById('blogGrid');

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
    // excerpt bị lẫn nguyên thẻ <h1> tiêu đề (thay vì 1-2 câu mô tả ngắn như
    // Prompt yêu cầu) — cùng nội dung vừa dùng để khôi phục title ở trên,
    // không nên hiển thị lặp lại dạng thẻ HTML thô.
    if (/^<h1[\s>]/i.test(cleaned) || stripHtmlTags(cleaned) === title) return '';
    return stripHtmlTags(cleaned);

  function PSH.formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('vi-VN');

  function cardHtml(p) {
    const title = recoverTitle(p);
    const img = p.coverImage
      ? `<div class="blog-card-img"><img src="${PSH.escapeHtml(p.coverImage)}" alt="${PSH.escapeHtml(title)}" loading="lazy"></div>`
      : '';
    return `
      <a class="blog-card" href="blog-post.html?slug=${encodeURIComponent(p.slug)}">
        ${img}
        ${p.tags && p.tags.length ? `<div class="blog-card-tags">${PSH.escapeHtml(p.tags[0])}</div>` : ''}
        <div class="blog-card-title">${PSH.escapeHtml(title)}</div>
        <div class="blog-card-excerpt">${PSH.escapeHtml(displayExcerpt(p, title))}</div>
        <div class="blog-card-meta">${PSH.escapeHtml(p.author || 'Pshop Music')} · ${PSH.formatDate(p.publishedAt)}</div>
      </a>`;

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);

  document.addEventListener('click', function (e) {
    const nav = document.getElementById('mobileNav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      nav.classList.remove('open');

  withTimeout(BlogDB.getPublished(), 10000).then(posts => {
    posts.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    if (!posts.length) {
      grid.innerHTML = '<div class="empty-state">Chưa có bài viết nào. Quay lại sau nhé!</div>';
      return;
    grid.innerHTML = posts.map(cardHtml).join('');
    console.error('Không tải được danh sách blog:', err);
    grid.innerHTML = '<div class="empty-state">Không tải được danh sách bài viết. Vui lòng thử tải lại trang.</div>';

  if (typeof SiteContentDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      SiteChrome.renderNav(content.menu, content.settings);
      SiteChrome.renderFooter(content.footer);

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});
})();
