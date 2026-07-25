/*
 * AI Workflow Insights (admin/ai/workflow-insights.html, Admin-only) —
 * Sprint 7 Requirement #5. Chỉ là Experience Layer: gọi
 * WorkflowInsightsService.compute() (js/ai/workflow-insights.js) và hiển
 * thị Timeline từng AI Request + cho phép xem chi tiết. Không tự tính toán
 * gì thêm ngoài resolve label Plugin/Provider — không chứa Business Logic
 * mới, không ghi dữ liệu.
 */
const AdminAIWorkflowInsights = (function () {
  const RANGE_LABELS = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '30d': '30 ngày gần nhất' };

  const STATUS_LABELS = {
    completed: 'Hoàn tất',
    failed: 'Lỗi',
    cancelled: 'Đã hủy',
    permission_denied: 'Không có quyền',
    queued: 'Đang chờ trong Queue',
    running: 'Đang xử lý'
  };

  const DRAFT_STATUS_LABELS = {
    draft: 'Đang chờ duyệt (Human Review)',
    published: 'Đã Duyệt & Publish',
    rejected: 'Đã từ chối'
  };

  let expanded = {};

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function init() {
    AdminAuth.init({ page: 'ai-workflow-insights', title: 'PLUGIN AI — WORKFLOW INSIGHTS', requiredRole: 'admin' }).then(() => {
      document.getElementById('wiRangeFilter').addEventListener('change', renderReport);
      document.getElementById('wiRefreshBtn').addEventListener('click', renderReport);
      renderReport();

  // Functional Requirement #6: thiếu dữ liệu -> "Unknown", không phải lỗi.
  function pluginLabel(moduleId) {
    if (!moduleId) return 'Unknown';
    const module = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(moduleId) : null;
    return module ? module.label : moduleId;

  function providerLabel(providerId) {
    if (!providerId) return 'Unknown';
    const provider = typeof AIProviderRegistry !== 'undefined' ? AIProviderRegistry.get(providerId) : null;
    return provider ? provider.label : providerId;

  function statusLabel(status) {
    return STATUS_LABELS[status] || 'Unknown';

  function PSH.formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : 'Unknown';

  function formatMs(ms) {
    if (ms === null || ms === undefined) return 'Unknown';
    if (ms < 1000) return ms + ' ms';
    return (ms / 1000).toFixed(1) + ' s';

  function draftStatusLabel(item) {
    if (item.draft) return DRAFT_STATUS_LABELS[item.draft.status] || 'Unknown';
    if (item.status === 'completed') return 'Unknown (không tìm thấy Draft)';
    return '—';

  function renderItemDetail(item, index) {
    return `
      <div class="panel" style="margin-top:0.75rem">
        <p><strong>Item ${index + 1}</strong> — ${PSH.escapeHtml(statusLabel(item.status))}${item.error ? ' — ' + PSH.escapeHtml(item.error) : ''}</p>
        <p class="small-muted">Context nhận vào (inputParams):</p>
        <pre style="white-space:pre-wrap;background:var(--bg-alt);padding:0.75rem;font-size:0.8rem;max-height:160px;overflow:auto">${PSH.escapeHtml(JSON.stringify(item.inputParams || {}, null, 2))}</pre>
        <p class="small-muted">Thời gian xử lý (Context + Provider + tạo Draft, gộp chung — Queue không ghi tách riêng): ${PSH.escapeHtml(formatMs(item.log ? item.log.durationMs : null))}</p>
        <p class="small-muted">Draft / Human Review: ${PSH.escapeHtml(draftStatusLabel(item))}${item.draft && item.draft.status === 'published' ? ' lúc ' + PSH.escapeHtml(PSH.formatDate(item.draft.publishedAt)) : ''}</p>
      </div>`;

  function renderRequestDetail(request) {
    return `
      <tr><td colspan="6">
        <div class="panel">
          <p><strong>Timeline</strong></p>
          <p class="small-muted">Tạo lúc: ${PSH.escapeHtml(PSH.formatDate(request.createdAt))} — Hàng đợi (Queue) chờ: ${PSH.escapeHtml(formatMs(request.queueWaitMs))} — Xử lý: ${PSH.escapeHtml(formatMs(request.processingMs))} — Hoàn tất lúc: ${PSH.escapeHtml(PSH.formatDate(request.finishedAt))} — Tổng thời gian: ${PSH.escapeHtml(formatMs(request.totalMs))}</p>
          ${(request.items || []).map(renderItemDetail).join('')}
        </div>
      </td></tr>`;

  function renderRequestRow(request) {
    const isOpen = !!expanded[request.id];
    const typeLabel = request.type === 'permission_denied' ? 'Permission Denied' : pluginLabel(request.moduleId);
    const row = `
      <tr>
        <td>${PSH.escapeHtml(PSH.formatDate(request.createdAt))}</td>
        <td>${PSH.escapeHtml(typeLabel)}</td>
        <td>${PSH.escapeHtml(providerLabel(request.provider))}</td>
        <td>${PSH.escapeHtml(statusLabel(request.finalStatus))}</td>
        <td>${(request.items || []).length}</td>
        <td><button type="button" class="link-btn" data-toggle-request="${PSH.escapeHtml(request.id)}">${isOpen ? 'Ẩn chi tiết' : 'Xem chi tiết'}</button></td>
      </tr>`;
    return row + (isOpen ? renderRequestDetail(request) : '');

  function renderReport() {
    const rangeKey = document.getElementById('wiRangeFilter').value;
    const resultEl = document.getElementById('wiResult');
    resultEl.innerHTML = '<p class="small-muted">Đang tổng hợp dữ liệu...</p>';

    WorkflowInsightsService.compute(rangeKey).then(report => {
      if (report.total === 0) {
        // Functional Requirement #6: chưa đủ dữ liệu -> trạng thái rõ ràng,
        // không phải "System Error".
        resultEl.innerHTML = `<div class="panel"><p class="small-muted">Chưa có AI Request nào trong khoảng "${PSH.escapeHtml(RANGE_LABELS[rangeKey])}".</p></div>`;
        return;
      resultEl.innerHTML = `
        <div class="panel">
          <p><strong>Tổng số AI Request (${PSH.escapeHtml(RANGE_LABELS[rangeKey])}): ${report.total}</strong></p>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>Thời gian tạo</th><th>Plugin</th><th>Provider</th><th>Trạng thái cuối</th><th>Số item</th><th></th></tr></thead>
              <tbody>${report.requests.map(renderRequestRow).join('')}</tbody>
            </table>
          </div>
        </div>`;
      resultEl.querySelectorAll('[data-toggle-request]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.toggleRequest;
          expanded[id] = !expanded[id];
          renderReport();
      resultEl.innerHTML = '<p style="color:#c0392b">Không đọc được dữ liệu Workflow Insights: ' + PSH.escapeHtml(err.message) + '</p>';

  return { init };
})();
