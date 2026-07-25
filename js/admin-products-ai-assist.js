/*
 * Product AI Assist (Sprint 11 Requirement #2, tổng quát hóa ở Sprint 12
 * Requirement #10 — Product Management) — 5 nút AI NGAY TRONG form Sản phẩm
 * (admin/products.html), Founder không rời trang, không mở AI Center:
 * Generate Description / Generate SEO / Generate Facebook / Generate Blog /
 * Generate Banner. CHỈ là Experience Layer — tái sử dụng NGUYÊN VẸN 3 Plugin
 * đã có sẵn (product-description-writer/facebook-post-generator/blog-writer/
 * banner-generator) qua đúng luồng PermissionService → PluginManager →
 * AIJobQueue → Draft → publishDraftById/rejectDraftById (js/admin-ai.js) đã
 * dùng ở mọi trang admin/ai/*.html — KHÔNG sửa bất kỳ file nào trong AI
 * Framework, KHÔNG tạo Plugin/Provider/Queue/Workflow mới.
 *
 * "Generate Description" và "Generate SEO" đều gọi CÙNG 1 Plugin
 * (product-description-writer — đã sinh đủ 13 trường bao gồm cả SEO trong 1
 * lần gọi, xem js/ai/modules/product-description-writer.js) — chỉ khác nhau
 * ở phần Preview nhấn mạnh trường nào, tránh gọi AI 2 lần cho cùng 1 nội
 * dung (seo-generator có sẵn không dùng được vì targetType chỉ hỗ trợ
 * blogPost, không hỗ trợ Product).
 *
 * KHÔNG tham chiếu biến nội bộ của AdminApp (js/admin-products.js, IIFE
 * riêng, không export biến) — đọc/ghi qua DOM, giống đúng cách
 * admin-products.js tự làm — không cần sửa admin-products.js.
 */
const ProductAIAssist = (function () {
  let pollTimer = null;
  let activeJobId = null;
  let activeButtonId = null;

  function currentProductId() {
    const el = document.getElementById('pId');
    return el ? el.value.trim() : '';
  }

  function currentProductName() {
    const el = document.getElementById('pName');
    return el ? el.value.trim() : '';
  }

  function box() { return document.getElementById('pAiAssistBox'); }

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function stripHtmlTags(str) {

  function truncate(str, n) {
    const s = String(str || '');
    return s.length > n ? s.slice(0, n) + '…' : s;

  /* ================= Preview renderers (1 cho mỗi loại content) ================= */

  function renderProductPreview(content, focus) {
    if (focus === 'seo') {
      return `<div class="small-muted" style="border:1px solid var(--border,#ddd);padding:0.6rem;border-radius:6px">
        <p><strong>SEO Title:</strong> ${PSH.escapeHtml(content.seoTitle || '(trống)')}</p>
        <p><strong>Meta Description:</strong> ${PSH.escapeHtml(content.metaDescription || '(trống)')}</p>
        <p><strong>SEO Keywords:</strong> ${PSH.escapeHtml((content.seoKeywords || []).join(', ') || '(trống)')}</p>
        <p><strong>Slug:</strong> ${PSH.escapeHtml(content.slug || '(trống)')}</p>
        <p><strong>ALT Text:</strong> ${PSH.escapeHtml(content.altText || '(trống)')}</p>
      </div>`;
    return `<div class="small-muted" style="border:1px solid var(--border,#ddd);padding:0.6rem;border-radius:6px;max-height:260px;overflow:auto">
      <p><strong>Tên:</strong> ${PSH.escapeHtml(content.name || '(trống)')}</p>
      <p><strong>Mô tả ngắn:</strong> ${PSH.escapeHtml(content.shortDescription || '(trống)')}</p>
      <div><strong>Mô tả chi tiết:</strong> ${content.description || '(trống)'}</div>
      <p><strong>Tính năng:</strong> ${PSH.escapeHtml((content.features || []).join(' · ') || '(trống)')}</p>
      <p><strong>Số câu hỏi FAQ:</strong> ${(content.faq || []).length}</p>
    </div>`;

  function renderFacebookPreview(content) {
    const versions = Array.isArray(content.versions) ? content.versions : [];
    return `<div style="display:flex;flex-direction:column;gap:0.6rem">${versions.map(v => `
      <div style="border:1px solid var(--border,#ddd);padding:0.6rem;border-radius:6px">
        <p style="font-weight:700;margin:0 0 0.3rem">Phiên bản ${PSH.escapeHtml(v.label)}</p>
        ${v.hook ? `<p style="font-weight:600">${PSH.escapeHtml(v.hook)}</p>` : ''}
        <p style="white-space:pre-wrap">${PSH.escapeHtml(v.caption)}</p>
        ${v.cta ? `<p style="font-weight:600">${PSH.escapeHtml(v.cta)}</p>` : ''}
        ${(v.hashtags || []).length ? `<p style="color:var(--gold-ink)">${PSH.escapeHtml((v.hashtags || []).map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' '))}</p>` : ''}
        <button type="button" class="link-btn" data-copy-text="${PSH.escapeHtml(v.postText || '')}" onclick="ProductAIAssist.copyText(this)">📋 Copy</button>
      </div>`).join('')}</div>`;

  function renderBlogPreview(content) {
    const snippet = stripHtmlTags(content.contentHtml || '');
    return `<div class="small-muted" style="border:1px solid var(--border,#ddd);padding:0.6rem;border-radius:6px;max-height:260px;overflow:auto">
      <p><strong>Tiêu đề:</strong> ${PSH.escapeHtml(content.title || '(trống)')}</p>
      <p>${PSH.escapeHtml(truncate(snippet, 400))}</p>
    </div>`;

  function renderBannerPreview(content) {
    return `<div class="small-muted" style="border:1px solid var(--border,#ddd);padding:0.6rem;border-radius:6px">
      ${content.image ? `<img src="${PSH.escapeHtml(content.image)}" style="max-width:220px;width:100%;border-radius:6px;margin-bottom:0.5rem;display:block">` : ''}
      <p><strong>${PSH.escapeHtml(content.title || '(trống)')}</strong></p>
      ${content.subtitle ? `<p>${PSH.escapeHtml(content.subtitle)}</p>` : ''}
      ${content.cta ? `<p style="font-weight:600;color:var(--gold-ink)">${PSH.escapeHtml(content.cta)}</p>` : ''}
    </div>`;

  /* ================= Cấu hình 5 nút — mỗi nút = 1 Plugin có sẵn ================= */

  const BUTTONS = [
    {
      id: 'description', moduleId: 'product-description-writer', label: 'Generate Description', applyMode: 'product',
      buildParams: p => ({ productId: p.id, tone: 'Chuyên nghiệp' }),
      renderPreview: content => renderProductPreview(content, 'description')
    {
      id: 'seo', moduleId: 'product-description-writer', label: 'Generate SEO', applyMode: 'product',
      buildParams: p => ({ productId: p.id, tone: 'Chuyên nghiệp' }),
      renderPreview: content => renderProductPreview(content, 'seo')
    {
      id: 'facebook', moduleId: 'facebook-post-generator', label: 'Generate Facebook', applyMode: 'publish',
      buildParams: p => ({ productId: p.id, topic: '', promotion: '' }),
      renderPreview: renderFacebookPreview,
      publishedNote: 'Bài Facebook đã duyệt — xem "Trợ lý AI" → "Duyệt nội dung" để Copy Caption/Hashtags và tự đăng thủ công.'
    {
      id: 'blog', moduleId: 'blog-writer', label: 'Generate Blog', applyMode: 'publish',
      buildParams: p => ({ productId: p.id, topic: 'Giới thiệu ' + (p.name || 'sản phẩm này'), tone: 'Chuyên nghiệp', keywords: '' }),
      renderPreview: renderBlogPreview,
      publishedNote: 'Đã tạo bài Blog mới — xem trang Blog công khai.'
    {
      id: 'banner', moduleId: 'banner-generator', label: 'Generate Banner', applyMode: 'publish',
      buildParams: p => ({ productId: p.id, promotion: '', event: '', link: '' }),
      renderPreview: renderBannerPreview,
      publishedNote: 'Đã tạo Banner mới — xem trên trang chủ (nếu đúng zone đang hiển thị).'
  ];

  function findButtonConfig(id) { return BUTTONS.find(b => b.id === id); }

  /* ================= Trạng thái xử lý (giống hệt luồng cũ, tổng quát hóa) ================= */

  function showMessage(msg) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel"><p class="small-muted">${PSH.escapeHtml(msg)}</p></div>`;

  function renderInProgress(job, config) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <p class="small-muted">${PSH.escapeHtml(config.label)} — đang xử lý AI (${job.status === 'running' ? 'đang chạy' : 'đang chờ trong hàng đợi'})...</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="pAiCancelBtn">HỦY</button>
      </div>
    </div>`;
    document.getElementById('pAiCancelBtn').addEventListener('click', () => cancelJob(job.id));

  function renderFailed(job, item, config) {
    const b = box();
    if (!b) return;
    const errorMsg = (item && item.error) || 'AI xử lý thất bại.';
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <p class="small-muted" style="color:#b3261e">${PSH.escapeHtml(config.label)} thất bại: ${PSH.escapeHtml(errorMsg)}</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="pAiRetryBtn">THỬ LẠI</button>
      </div>
    </div>`;
    document.getElementById('pAiRetryBtn').addEventListener('click', () => retryJob(job.id));

  function showPreview(draft, config) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <h4 style="margin:0 0 0.5rem">${PSH.escapeHtml(config.label)} — Bản nháp AI (chưa áp dụng)</h4>
      ${config.renderPreview(draft.content)}
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="submit-btn" id="pAiApplyBtn">${config.applyMode === 'product' ? 'ÁP DỤNG VÀO SẢN PHẨM' : 'DUYỆT &amp; PUBLISH'}</button>
        <button type="button" class="btn-secondary" id="pAiRejectBtn">TỪ CHỐI</button>
      </div>
    </div>`;
    document.getElementById('pAiApplyBtn').addEventListener('click', () => applyDraft(draft, config));
    document.getElementById('pAiRejectBtn').addEventListener('click', () => rejectDraft(draft.id));

  // syncProductForm() — chỉ đồng bộ lại hiển thị field NÀO Draft có giá trị,
  // không ghi đè bằng rỗng (an toàn giống applyDraft() bản cũ chỉ đồng bộ
  // đúng ô Mô tả) — publishDraftById() đã ghi thật vào Firebase, đây chỉ là
  // đồng bộ hiển thị form, không ghi dữ liệu.
  function syncProductForm(content) {
    const nameEl = document.getElementById('pName');
    if (nameEl && content.name) nameEl.value = content.name;
    const editorEl = document.querySelector('#pDescriptionEditor .ql-editor');
    if (editorEl && content.description) editorEl.innerHTML = content.description;
    const specEl = document.getElementById('pSpecifications');
    if (specEl && content.specifications) specEl.value = content.specifications;
    const featEl = document.getElementById('pFeatures');
    if (featEl && Array.isArray(content.features) && content.features.length) featEl.value = content.features.join('\n');
    const tagsEl = document.getElementById('pTags');
    if (tagsEl && Array.isArray(content.tags) && content.tags.length) tagsEl.value = content.tags.join(', ');

  // ÁP DỤNG/PUBLISH — tái sử dụng NGUYÊN VẸN AdminAI.publishDraftById() (đã
  // biết cách ghi đúng collection theo targetCollection của từng Plugin:
  // 'products' -> DB.update, 'blogPosts' -> BlogDB.add, 'banners' ->
  // BannerDB.add, null (Facebook) -> chỉ đánh dấu đã duyệt) — không viết lại
  // logic Publish.
  function applyDraft(draft, config) {
    AdminAI.publishDraftById(draft.id).then(() => {
      if (config.applyMode === 'product') {
        syncProductForm(draft.content);
        showMessage('Đã áp dụng vào sản phẩm — đã lưu vào Firebase. Form đã đồng bộ hiển thị mới nhất.');
        showMessage('Đã publish — ' + (config.publishedNote || 'nội dung đã được lưu.'));

  function rejectDraft(draftId) {
    AdminAI.rejectDraftById(draftId).then(() => {
      showMessage('Đã từ chối bản nháp — có thể bấm lại nút AI để thử lại.');

  function retryJob(jobId) {
    showMessage('Đang thử lại...');
    const user = AdminAuth.getUser();
    AIJobQueue.retryFailed(jobId).then(() => AIJobQueue.resume(user.uid, user.email)).then(() => {
      activeJobId = jobId;
      pollJob();
      startPolling();

  function cancelJob(jobId) {
    const user = AdminAuth.getUser();
    AIJobQueue.cancel(jobId, user.uid, user.email).then(() => {
      stopPolling();
      showMessage('Đã hủy yêu cầu AI.');

  function pollJob() {
    if (!activeJobId) return;
    const jobId = activeJobId;
    const config = findButtonConfig(activeButtonId);
    if (!config) return;
    JobDB.get(jobId).then(job => {
      if (!job) return;
      if (job.status === 'queued' || job.status === 'running') {
        renderInProgress(job, config);
        return;
      stopPolling();
      const item = job.items && job.items[0];
      if (job.status === 'completed' && item && item.status === 'completed' && item.resultDraftId) {
        DraftDB.get(item.resultDraftId).then(draft => { if (draft) showPreview(draft, config); });
        return;
      if (job.status === 'cancelled') { showMessage('Đã hủy yêu cầu AI.'); return; }
      renderFailed(job, item, config);

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollJob, 3000);

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  function generate(buttonId) {
    const config = findButtonConfig(buttonId);
    if (!config) return;
    const productId = currentProductId();
    if (!productId) {
      showMessage('Cần lưu sản phẩm trước (bấm "LƯU SẢN PHẨM") rồi mới dùng được AI — Plugin cần 1 sản phẩm đã có trong Product Manager.');
      return;
    const user = AdminAuth.getUser();
    activeButtonId = buttonId;
    showMessage(config.label + ' — đang gửi yêu cầu AI...');
    // Permission truoc, dung 1 diem goi PluginManager (khong co duong tat
    // bo qua RBAC) - dung ham PermissionService.checkPluginExecution() ma
    // js/admin-ai.js da dung cho Dashboard ky thuat.
    PermissionService.checkPluginExecution(user.uid, user.email, config.moduleId).then(check => {
      if (!check.granted) {
        showMessage(`Không có quyền chạy AI (thiếu "${check.permission || 'quyền chưa được gán'}").`);
        return;
      // PluginDB.get(id) (dung ben trong PluginManager.loadPlugin()) khong
      // tu seed aiPlugins - chi PluginDB.getAll() moi seed. Product Form co
      // the la trang AI DAU TIEN Founder mo (chua tung qua Dashboard ky
      // thuat) nen goi loadPlugins() 1 lan truoc de dam bao da seed.
      return PluginManager.loadPlugins().then(() => PluginManager.loadPlugin(config.moduleId)).then(plugin => {
        if (!plugin) { showMessage('Không tìm thấy Plugin AI "' + config.moduleId + '".'); return; }
        const params = config.buildParams({ id: productId, name: currentProductName() });
        return plugin.execute([params], user.uid, user.email).then(job => {
          activeJobId = job.id;
          return AIJobQueue.resume(user.uid, user.email);

  // copyText() — Clipboard API + fallback execCommand cho preview Facebook
  // (cùng pattern nhỏ gọn AdminAI.copyDraftText() đã dùng ở admin/ai/drafts.html,
  // không phải Business Logic nên không tính là trùng lặp cần tái sử dụng).
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* bỏ qua */ }
    document.body.removeChild(ta);

  function copyText(btn) {
    const text = btn.getAttribute('data-copy-text') || '';
    const showCopied = () => {
      const old = btn.textContent;
      btn.textContent = '✅ Đã copy!';
      setTimeout(() => { btn.textContent = old; }, 1500);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => { fallbackCopy(text); showCopied(); });
      fallbackCopy(text);
      showCopied();

  function init() {
    document.querySelectorAll('[data-ai-btn]').forEach(btn => {
      btn.addEventListener('click', () => generate(btn.getAttribute('data-ai-btn')));

  return { init, copyText };
})();

document.addEventListener('DOMContentLoaded', () => ProductAIAssist.init());
