/*
 * Renders the nav menu + footer on every public page from
 * siteContent.menu / siteContent.footer (Menu Manager / Footer Manager),
 * with the page's existing static markup left in place as the fallback if
 * this never runs (Firebase error, or script missing) — same progressive-
 * enhancement pattern as the hero slider / category tiles.
 */
const SiteChrome = (function () {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  const SOCIAL_ICONS = {
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 9.9V8.6c0-.6.4-.8.9-.8H16V4.9h-2.3c-2.5 0-3.7 1.5-3.7 3.7v1.3H8.3V13H10v8h3.5v-8h2.4l.4-3.1h-2.8z"/></svg>',
    messenger: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.5 5.5 3.9 7.2V22l3.5-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.3S17.5 2 12 2zm1 12.4l-2.5-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.5 5.8z"/></svg>',
    shopee: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 8h-2.3a4.2 4.2 0 00-8.4 0H5.5c-.6 0-1 .4-1.1 1L3 20c-.1.6.4 1.1 1 1.1h16c.6 0 1.1-.5 1-1.1l-1.4-11c-.1-.6-.5-1-1.1-1zM12 5.5c1.2 0 2.2.9 2.3 2.1H9.7c.1-1.2 1.1-2.1 2.3-2.1zM9.5 11a2.5 2.5 0 005 0v-1.4h1.4v1.4a3.9 3.9 0 01-7.8 0v-1.4h1.4V11z"/></svg>'

  function socialButtonHtml(s) {
    if (s.platform === 'zalo') {
      return `<a href="${PSH.escapeHtml(s.url)}" target="_blank" aria-label="Kết bạn Zalo" class="social-btn social-zalo">Z</a>`;
    const icon = SOCIAL_ICONS[s.platform];
    if (!icon) return '';
    const cls = s.platform === 'facebook' ? 'fb' : s.platform;
    return `<a href="${PSH.escapeHtml(s.url)}" target="_blank" aria-label="${PSH.escapeHtml(s.platform)}" class="social-btn social-${cls}">${icon}</a>`;

  function renderNav(menu, settings) {
    const items = (menu && Array.isArray(menu.items)) ? menu.items.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    if (!items.length) return;

    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
      navLinks.innerHTML = items.map(i =>
        `<a href="${PSH.escapeHtml(i.link)}"${i.target === '_blank' ? ' target="_blank"' : ''}>${PSH.escapeHtml(i.label)}</a>`
      ).join('');

    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav) {
      let html = items.map(i =>
        `<a href="${PSH.escapeHtml(i.link)}"${i.target === '_blank' ? ' target="_blank"' : ''} onclick="this.closest('.mobile-nav').classList.remove('open')">${PSH.escapeHtml(i.label)}</a>`
      ).join('');
      if (settings) {
        if (settings.socials && settings.socials.facebook) {
          html += `<a href="${PSH.escapeHtml(settings.socials.facebook)}" target="_blank">Facebook</a>`;
        if (settings.phone) {
          html += `<a href="tel:${PSH.escapeHtml(settings.phone)}" style="color:var(--gold);font-size:1.1rem">${PSH.escapeHtml(settings.phoneDisplay || settings.phone)}</a>`;
      mobileNav.innerHTML = html;

  function renderFooter(footer) {
    if (!footer) return;
    const grid = document.querySelector('.footer-grid');
    if (grid && Array.isArray(footer.columns)) {
      grid.innerHTML = footer.columns.map((col, idx) => {
        const isLast = idx === footer.columns.length - 1;
        const linksHtml = (col.links || []).map(l =>
          `<a href="${PSH.escapeHtml(l.link)}"${/^https?:/.test(l.link) ? ' target="_blank"' : ''}>${PSH.escapeHtml(l.label)}</a>`
        ).join('');
        if (isLast && Array.isArray(footer.social) && footer.social.length) {
          const socialHtml = footer.social.map(socialButtonHtml).join('');
          return `<div class="footer-col footer-col-news"><h5>${PSH.escapeHtml(col.title)}</h5><div class="footer-social">${socialHtml}</div>${linksHtml}</div>`;
        return `<div class="footer-col"><h5>${PSH.escapeHtml(col.title)}</h5>${linksHtml}</div>`;
    const copyEl = document.querySelector('.footer-copy');
    if (copyEl && footer.copyText) copyEl.innerHTML = footer.copyText;

  function applySeo(seo) {
    if (!seo) return;
    if (seo.searchConsoleTag) {
      let el = document.querySelector('meta[name="google-site-verification"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'google-site-verification');
        document.head.appendChild(el);
      el.setAttribute('content', seo.searchConsoleTag);
    if (seo.gaId && !window.__pshopGaLoaded) {
      window.__pshopGaLoaded = true;
      const s1 = document.createElement('script');
      s1.async = true;
      s1.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(seo.gaId);
      document.head.appendChild(s1);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', seo.gaId);

  return { renderNav, renderFooter, applySeo };
})();
