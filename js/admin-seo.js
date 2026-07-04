/*
 * SEO Manager (admin/seo.html) — edits global "seoSettings" node (SeoDB).
 * Applied on every public page by js/site-chrome.js (Google Analytics tag,
 * Search Console verification meta tag). Admin-only page.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'seo', title: 'QUẢN LÝ SEO', requiredRole: 'admin' }).then(load);

  function load() {
    SeoDB.get().then(seo => {
      document.getElementById('seoDefaultTitle').value = seo.defaultTitle || '';
      document.getElementById('seoDefaultDescription').value = seo.defaultDescription || '';
      document.getElementById('seoOgImage').value = seo.ogImage || '';
      document.getElementById('seoGaId').value = seo.gaId || '';
      document.getElementById('seoSearchConsoleTag').value = seo.searchConsoleTag || '';
      document.getElementById('seoRobotsExtra').value = seo.robotsExtra || '';
    });
  }

  function save() {
    const settings = {
      defaultTitle: document.getElementById('seoDefaultTitle').value.trim(),
      defaultDescription: document.getElementById('seoDefaultDescription').value.trim(),
      ogImage: document.getElementById('seoOgImage').value.trim(),
      gaId: document.getElementById('seoGaId').value.trim(),
      searchConsoleTag: document.getElementById('seoSearchConsoleTag').value.trim(),
      robotsExtra: document.getElementById('seoRobotsExtra').value.trim()
    };
    SeoDB.save(settings).then(() => showStatus('Đã lưu cài đặt SEO.'));
  }

  function showStatus(msg) {
    const el = document.getElementById('seoStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('seoSaveBtn').addEventListener('click', save);
});
