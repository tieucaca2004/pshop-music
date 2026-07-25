(function () {
  const grid = document.getElementById('videoGrid');

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function cardHtml(v, parsed) {
    const thumb = parsed.thumbnail
      ? `<img src="${PSH.escapeHtml(parsed.thumbnail)}" alt="${PSH.escapeHtml(v.title)}" loading="lazy">`
      : '';
    return `
      <div class="video-card">
        <div class="video-thumb" data-embed="${PSH.escapeHtml(parsed.embedUrl)}">
          ${thumb}
          <div class="video-play"><span>&#9658;</span></div>
        </div>
        <div class="video-card-title">${PSH.escapeHtml(v.title)}</div>
        ${v.description ? `<div class="video-card-desc">${PSH.escapeHtml(v.description)}</div>` : ''}
      </div>`;

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

  if (typeof SiteContentDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    withTimeout(SiteContentDB.get(), 10000).then(content => {
      SiteChrome.renderNav(content.menu, content.settings);
      SiteChrome.renderFooter(content.footer);

  if (typeof SeoDB !== 'undefined' && typeof SiteChrome !== 'undefined') {
    SeoDB.get().then(SiteChrome.applySeo).catch(() => {});

  withTimeout(VideoDB.getAll(), 10000).then(list => {
    const active = list.filter(v => v.active !== false)
      .map(v => ({ v, parsed: parseVideoUrl(v.url) }))
      .filter(x => x.parsed);
    if (!active.length) {
      grid.innerHTML = '<div class="empty-state">Chưa có video nào.</div>';
      return;
    grid.innerHTML = active.map(x => cardHtml(x.v, x.parsed)).join('');
    grid.querySelectorAll('.video-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const iframe = document.createElement('iframe');
        iframe.src = thumb.dataset.embed;
        iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        thumb.innerHTML = '';
        thumb.appendChild(iframe);
    console.error('Không tải được danh sách video:', err);
    grid.innerHTML = '<div class="empty-state">Không tải được danh sách video. Vui lòng thử tải lại trang.</div>';
})();
