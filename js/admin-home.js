/*
 * Founder Home (admin/home.html) — Sprint 10 Requirement #5 (Founder Daily
 * Workflow). Đây là Experience Layer CAO NHẤT của PSH — Founder mở PSH để
 * hoàn thành công việc (Thêm sản phẩm/Tạo Marketing Package/Review/
 * Generate), KHÔNG để quản trị AI. Trang này KHÔNG hiển thị thuật ngữ
 * Queue/Plugin/Provider/Prompt/Workflow/Cost — chỉ hiển thị đúng những gì
 * FOUNDER HOME/QUICK ACTIONS yêu cầu.
 *
 * CHỈ Experience Layer — gộp lại dữ liệu CHỈ ĐỌC từ các nguồn đã có
 * (DB/DraftDB/JobDB/MediaLibrary/SiteContentDB), không gọi PluginManager/
 * AIJobQueue/AIProviderRegistry/AITaskRouter, không tạo Job/Draft nào,
 * không thêm Field/Collection Firebase nào (đúng Architectural Constraint
 * "chỉ thay đổi Experience Layer").
 *
 * "AI Video" trong Quick Actions hiển thị dạng "Sắp có" (disabled, không
 * href) — hệ thống CHƯA có năng lực AI Video nào (đúng Testing Constraint
 * "Không tuyên bố Publish tự động/năng lực nếu chưa tồn tại"). "AI Content"
 * và "AI Image" tạm thời cùng trỏ về Plugin Dashboard kỹ thuật
 * (admin/ai/index.html) — đây là giới hạn đã biết (vẫn còn thuật ngữ
 * Plugin), ghi rõ trong CHANGELOG.md/ROADMAP.md, không tự mở rộng thành 1
 * trang Founder-friendly riêng (ngoài phạm vi Requirement này).
 */
const AdminHome = (function () {
  const RECENT_LIMIT = 5;
  const MEDIA_LIMIT = 6;
  const ACTIVITY_LIMIT = 8;

  const JOB_STATUS_LABELS = { queued: 'Đang chờ', running: 'Đang xử lý', completed: 'Hoàn tất', failed: 'Thất bại', cancelled: 'Đã hủy' };
  const DRAFT_STATUS_LABELS = { draft: 'Chờ duyệt', published: 'Đã publish', rejected: 'Đã từ chối' };

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function formatTime(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : '(không rõ thời gian)';

  function pluginLabel(moduleId) {
    const m = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(moduleId) : null;
    return m ? m.label : (moduleId || '(không rõ)');

  function init() {
    AdminAuth.init({ page: 'founder-home', title: 'TRANG CHỦ' }).then(load);

  function load() {
    Promise.all([
      SiteContentDB.get(),
      DB.getAll(),
      DraftDB.getAll(),
      JobDB.getAll(),
      MediaLibrary.list('').catch(err => ({ error: err.message }))
    ]).then(([content, products, drafts, jobs, media]) => {
      renderBusiness(content.settings || {});
      renderQuickActions();

      const recentProducts = products.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, RECENT_LIMIT);
      const recentDrafts = drafts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, RECENT_LIMIT);
      const recentJobs = jobs.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, RECENT_LIMIT);
      const mediaOk = Array.isArray(media);
      const recentMedia = mediaOk ? media.slice(0, MEDIA_LIMIT) : [];

      renderRecentProducts(recentProducts);
      renderRecentDrafts(recentDrafts);
      renderRecentJobs(recentJobs);
      renderRecentMedia(recentMedia, mediaOk ? null : media.error);
      renderRecentActivities(recentProducts, recentDrafts, recentJobs, mediaOk ? media.slice(0, MEDIA_LIMIT) : []);

  function renderBusiness(settings) {
    document.getElementById('homeBusiness').innerHTML = `
      <h3 style="margin:0 0 0.3rem">${PSH.escapeHtml(settings.siteName || '(chưa đặt tên doanh nghiệp)')}</h3>
      <p class="small-muted" style="margin:0">${PSH.escapeHtml(settings.address || '(chưa có địa chỉ)')}</p>`;

  function quickAction(label, href, disabled) {
    if (disabled) {
      return `<div class="panel" style="text-align:center;opacity:0.5;cursor:default">
        <p style="margin:0;font-weight:600">${PSH.escapeHtml(label)}</p>
        <p class="small-muted" style="margin:0.3rem 0 0">Sắp có</p>
      </div>`;
    return `<a href="${PSH.escapeHtml(href)}" class="panel" style="text-align:center;display:block;text-decoration:none;color:var(--ink)">
      <p style="margin:0;font-weight:600;color:var(--gold-ink)">${PSH.escapeHtml(label)}</p>
    </a>`;

  function renderQuickActions() {
    // Dung dung 7 Quick Action da giao - KHONG hien Queue/Plugin/Provider/
    // Prompt/Cost/Debug (dung QUICK ACTIONS constraint).
    document.getElementById('homeQuickActions').innerHTML = [
      quickAction('Thêm sản phẩm', 'products.html'),
      quickAction('One Click Marketing', 'ai/one-click-marketing.html'),
      quickAction('Media Library', 'media-library.html'),
      quickAction('AI Content', 'ai/index.html'),
      quickAction('AI Image', 'ai/index.html'),
      quickAction('AI Video', null, true),
      quickAction('Marketing Drafts', 'ai/drafts.html')
    ].join('');

  function emptyMsg(text) {
    return `<p class="small-muted">${PSH.escapeHtml(text)}</p>`;

  function renderRecentProducts(items) {
    const el = document.getElementById('homeRecentProducts');
    if (!items.length) { el.innerHTML = emptyMsg('Chưa có sản phẩm nào.'); return; }
    el.innerHTML = `<ul style="list-style:none;padding:0;margin:0">${items.map(p => `
      <li style="padding:0.5rem 0;border-bottom:1px solid var(--bg-alt)">
        <strong>${PSH.escapeHtml(p.name)}</strong> — ${PSH.escapeHtml(p.price || '(chưa có giá)')}
        <div class="small-muted">${formatTime(p.createdAt)}</div>
      </li>`).join('')}</ul>`;

  function renderRecentDrafts(items) {
    const el = document.getElementById('homeRecentDrafts');
    if (!items.length) { el.innerHTML = emptyMsg('Chưa có Draft nào — Draft xuất hiện sau khi dùng công cụ AI Content/Marketing Drafts.'); return; }
    el.innerHTML = `<ul style="list-style:none;padding:0;margin:0">${items.map(d => `
      <li style="padding:0.5rem 0;border-bottom:1px solid var(--bg-alt)">
        <strong>${PSH.escapeHtml(pluginLabel(d.moduleId))}</strong> — ${PSH.escapeHtml(DRAFT_STATUS_LABELS[d.status] || d.status)}
        <div class="small-muted">${formatTime(d.createdAt)}</div>
      </li>`).join('')}</ul>`;

  function renderRecentJobs(items) {
    const el = document.getElementById('homeRecentJobs');
    if (!items.length) { el.innerHTML = emptyMsg('Chưa có hoạt động AI nào gần đây.'); return; }
    el.innerHTML = `<ul style="list-style:none;padding:0;margin:0">${items.map(j => `
      <li style="padding:0.5rem 0;border-bottom:1px solid var(--bg-alt)">
        <strong>${PSH.escapeHtml(pluginLabel(j.moduleId))}</strong> — ${PSH.escapeHtml(JOB_STATUS_LABELS[j.status] || j.status)}
        <div class="small-muted">${formatTime(j.createdAt)}</div>
      </li>`).join('')}</ul>`;

  function renderRecentMedia(items, errorMsg) {
    const el = document.getElementById('homeRecentMedia');
    if (errorMsg) { el.innerHTML = `<p style="color:#c0392b">Không đọc được Thư viện ảnh: ${PSH.escapeHtml(errorMsg)}</p>`; return; }
    if (!items.length) { el.innerHTML = emptyMsg('Chưa có ảnh nào trong Thư viện.'); return; }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:0.5rem">
      ${items.map(m => `<img src="${PSH.escapeHtml(m.url || '')}" alt="${PSH.escapeHtml(m.name)}" style="width:100%;height:70px;object-fit:cover;border-radius:6px;background:var(--bg-alt)">`).join('')}
    </div>`;

  function renderRecentActivities(products, drafts, jobs, media) {
    // Ghep lai TU CHINH 4 nguon da doc o tren thanh 1 dong thoi gian duy
    // nhat - khong doc them nguon nao moi (khong tang luot goi Firebase).
    const activities = []
      .concat(products.map(p => ({ ts: p.createdAt, text: 'Đã thêm sản phẩm "' + p.name + '"' })))
      .concat(drafts.map(d => ({ ts: d.createdAt, text: 'Đã tạo Draft "' + pluginLabel(d.moduleId) + '"' })))
      .concat(jobs.map(j => ({ ts: j.createdAt, text: 'Đã chạy "' + pluginLabel(j.moduleId) + '" — ' + (JOB_STATUS_LABELS[j.status] || j.status) })))
      .concat(media.map(m => ({ ts: m.timeCreated, text: 'Đã tải ảnh "' + m.name + '" lên Thư viện' })))
      .filter(a => a.ts)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, ACTIVITY_LIMIT);

    const el = document.getElementById('homeRecentActivities');
    if (!activities.length) { el.innerHTML = emptyMsg('Chưa có hoạt động nào.'); return; }
    el.innerHTML = `<ul style="list-style:none;padding:0;margin:0">${activities.map(a => `
      <li style="padding:0.4rem 0;border-bottom:1px solid var(--bg-alt)">
        ${PSH.escapeHtml(a.text)}
        <div class="small-muted">${formatTime(a.ts)}</div>
      </li>`).join('')}</ul>`;

  return { init };
})();
