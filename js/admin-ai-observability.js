/*
 * AI Observability Dashboard (admin/ai/observability.html, Admin-only) —
 * Sprint 7 Requirement #1. Chỉ là Experience Layer: gọi
 * ObservabilityService.compute() (js/ai/observability.js) và hiển thị 1
 * màn hình duy nhất — không tự tính toán gì thêm, không chứa Business
 * Logic, không ghi/cập nhật/xóa bất kỳ đâu.
 */
const AdminAIObservability = (function () {
  const STATUS_LABELS = { completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', permission_denied: 'Permission Denied' };
  const JOB_STATUS_LABELS = { queued: 'Đang chờ', running: 'Đang xử lý', completed: 'Hoàn tất', failed: 'Thất bại', cancelled: 'Đã hủy' };
  const DRAFT_STATUS_LABELS = { draft: 'Chờ duyệt', published: 'Đã publish', rejected: 'Đã từ chối' };
  const RANGE_LABELS = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '30d': '30 ngày gần nhất' };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-observability', title: 'AI ASSISTANT — OBSERVABILITY DASHBOARD', requiredRole: 'admin' }).then(() => {
      document.getElementById('observabilityRefreshBtn').addEventListener('click', load);
      document.getElementById('observabilityRangeFilter').addEventListener('change', load);
      load();
    });
  }

  function renderHealth(health) {
    if (health && health.error) return `<p style="color:#c0392b">Không kiểm tra được Health Check: ${escapeHtml(health.error)}</p>`;
    if (health && health.skipped) return `<p class="small-muted">${escapeHtml(health.message)}</p>`;
    const color = health.overallHealthy ? 'var(--gold-ink)' : '#c0392b';
    return `
      <p><strong style="color:${color}">${health.overallHealthy ? '✓ Toàn bộ hệ thống hoạt động bình thường' : '✗ Phát hiện thành phần lỗi'}</strong></p>
      <table class="admin-table">
        <thead><tr><th>Thành phần</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead>
        <tbody>
          <tr><td>AI Provider → Cloud Function → OpenAI API</td><td style="color:${health.provider.ok ? 'var(--gold-ink)' : '#c0392b'}">${health.provider.ok ? '✓ OK' : '✗ Lỗi'}</td><td>${escapeHtml(health.provider.message)}</td></tr>
          <tr><td>Queue (aiJobs)</td><td style="color:${health.queue.ok ? 'var(--gold-ink)' : '#c0392b'}">${health.queue.ok ? '✓ OK' : '✗ Lỗi'}</td><td>${escapeHtml(health.queue.message)}</td></tr>
          <tr><td>Draft Workflow (aiDrafts)</td><td style="color:${health.draftWorkflow.ok ? 'var(--gold-ink)' : '#c0392b'}">${health.draftWorkflow.ok ? '✓ OK' : '✗ Lỗi'}</td><td>${escapeHtml(health.draftWorkflow.message)}</td></tr>
        </tbody>
      </table>`;
  }

  function renderProviders(providers) {
    if (providers && providers.error) return `<p style="color:#c0392b">Không đọc được danh sách Provider: ${escapeHtml(providers.error)}</p>`;
    if (!providers.length) return '<p class="small-muted">Chưa có Provider nào được đăng ký.</p>';
    return `<table class="admin-table">
      <thead><tr><th>Provider</th><th>Trạng thái</th><th>Model</th><th>Mặc định toàn cục</th></tr></thead>
      <tbody>${providers.map(p => `<tr>
        <td>${escapeHtml(p.label)}</td>
        <td style="color:${p.enabled ? 'var(--gold-ink)' : 'var(--ink-mute)'}">${p.enabled ? 'Đang bật' : 'Đang tắt'}</td>
        <td>${escapeHtml(p.model || '(chưa cấu hình)')}</td>
        <td>${p.active ? '✓' : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function renderQueue(queue) {
    if (queue && queue.error) return `<p style="color:#c0392b">Không đọc được Queue: ${escapeHtml(queue.error)}</p>`;
    if (queue.total === 0) return '<p class="small-muted">Chưa có Job nào trong hệ thống.</p>';
    return `<p><strong style="color:${queue.busy ? 'var(--gold-ink)' : 'var(--ink-mute)'}">${queue.busy ? '● Đang xử lý' : '○ Đang chờ (idle)'}</strong> — Đang chờ: ${queue.byStatus.queued}, Đang xử lý: ${queue.byStatus.running}</p>`;
  }

  function renderJobSummary(queue) {
    if (queue && queue.error) return `<p style="color:#c0392b">Không đọc được Job Summary: ${escapeHtml(queue.error)}</p>`;
    if (queue.total === 0) return '<p class="small-muted">Chưa có Job nào trong hệ thống.</p>';
    return `<table class="admin-table">
      <thead><tr><th>Trạng thái</th><th>Số lượng</th></tr></thead>
      <tbody>${Object.keys(JOB_STATUS_LABELS).map(k => `<tr><td>${JOB_STATUS_LABELS[k]}</td><td>${queue.byStatus[k] || 0}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><strong>Tổng</strong></td><td><strong>${queue.total}</strong></td></tr></tfoot>
    </table>`;
  }

  function renderDrafts(drafts) {
    if (drafts && drafts.error) return `<p style="color:#c0392b">Không đọc được Draft Summary: ${escapeHtml(drafts.error)}</p>`;
    if (drafts.total === 0) return '<p class="small-muted">Chưa có Draft nào trong hệ thống.</p>';
    return `<table class="admin-table">
      <thead><tr><th>Trạng thái</th><th>Số lượng</th></tr></thead>
      <tbody>${Object.keys(DRAFT_STATUS_LABELS).map(k => `<tr><td>${DRAFT_STATUS_LABELS[k]}</td><td>${drafts.byStatus[k] || 0}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><strong>Tổng</strong></td><td><strong>${drafts.total}</strong></td></tr></tfoot>
    </table>`;
  }

  function renderPlugins(plugins) {
    if (plugins && plugins.error) return `<p style="color:#c0392b">Không đọc được trạng thái Plugin: ${escapeHtml(plugins.error)}</p>`;
    if (!plugins.length) return '<p class="small-muted">Chưa có Plugin nào được đăng ký.</p>';
    return `<table class="admin-table">
      <thead><tr><th>Plugin</th><th>Trạng thái</th><th>Provider</th></tr></thead>
      <tbody>${plugins.map(p => `<tr>
        <td>${escapeHtml(p.name)}<br><span class="small-muted">${escapeHtml(p.id)}</span></td>
        <td style="color:${p.enabled ? 'var(--gold-ink)' : 'var(--ink-mute)'}">${p.enabled ? 'Đang bật' : 'Đang tắt (Coming Soon)'}</td>
        <td>${escapeHtml(p.provider || 'Mặc định toàn cục')}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function pluginLabel(moduleId, plugins) {
    if (moduleId === '(không rõ)') return moduleId;
    const p = plugins.find(x => x.id === moduleId);
    return p ? p.name : moduleId;
  }

  function breakdownRows(counts, labelFn) {
    const keys = Object.keys(counts).filter(k => counts[k] > 0).sort((a, b) => counts[b] - counts[a]);
    if (!keys.length) return '<tr><td colspan="2" style="color:var(--ink-mute)">Không có dữ liệu.</td></tr>';
    return keys.map(k => `<tr><td>${escapeHtml(labelFn ? labelFn(k) : k)}</td><td>${counts[k]}</td></tr>`).join('');
  }

  function renderUsage(usage, plugins, rangeKey) {
    if (usage && usage.error) return `<p style="color:#c0392b">Không đọc được Usage Summary: ${escapeHtml(usage.error)}</p>`;
    if (usage.total === 0) return `<p class="small-muted">Chưa có dữ liệu sử dụng AI trong khoảng "${escapeHtml(RANGE_LABELS[rangeKey])}".</p>`;
    return `
      <p><strong>Tổng số lần Generate (${escapeHtml(RANGE_LABELS[rangeKey])}): ${usage.total}</strong></p>
      <div class="field-grid">
        <div><h4 style="margin:0 0 0.5rem">Theo Plugin</h4>
          <table class="admin-table"><thead><tr><th>Plugin</th><th>Số lần</th></tr></thead>
          <tbody>${breakdownRows(usage.byPlugin, id => pluginLabel(id, plugins))}</tbody></table></div>
        <div><h4 style="margin:0 0 0.5rem">Theo Provider</h4>
          <table class="admin-table"><thead><tr><th>Provider</th><th>Số lần</th></tr></thead>
          <tbody>${breakdownRows(usage.byProvider)}</tbody></table></div>
        <div><h4 style="margin:0 0 0.5rem">Theo Trạng thái</h4>
          <table class="admin-table"><thead><tr><th>Trạng thái</th><th>Số lần</th></tr></thead>
          <tbody>${breakdownRows(usage.byStatus, s => STATUS_LABELS[s] || s)}</tbody></table></div>
      </div>`;
  }

  function load() {
    const rangeKey = document.getElementById('observabilityRangeFilter').value;
    const root = document.getElementById('observabilityResult');
    root.innerHTML = '<p class="small-muted">Đang tổng hợp trạng thái hệ thống...</p>';

    ObservabilityService.compute(rangeKey).then(report => {
      const plugins = Array.isArray(report.plugins) ? report.plugins : [];
      root.innerHTML = `
        <p class="small-muted" style="margin-bottom:1rem">Cập nhật lần cuối: ${escapeHtml(new Date(report.generatedAt).toLocaleString('vi-VN'))}</p>
        <div class="panel"><h3 style="margin-top:0">Health Check</h3>${renderHealth(report.health)}</div>
        <div class="panel"><h3 style="margin-top:0">Provider Status</h3>${renderProviders(report.providers)}</div>
        <div class="panel"><h3 style="margin-top:0">Queue Status</h3>${renderQueue(report.queue)}</div>
        <div class="panel"><h3 style="margin-top:0">Plugin Status</h3>${renderPlugins(report.plugins)}</div>
        <div class="panel"><h3 style="margin-top:0">Usage Summary</h3>${renderUsage(report.usage, plugins, rangeKey)}</div>
        <div class="panel"><h3 style="margin-top:0">Job Summary</h3>${renderJobSummary(report.queue)}</div>
        <div class="panel"><h3 style="margin-top:0">Draft Summary</h3>${renderDrafts(report.drafts)}</div>
      `;
    }).catch(err => {
      root.innerHTML = '<p style="color:#c0392b">Lỗi khi tải AI Observability Dashboard: ' + escapeHtml(err.message) + '</p>';
    });
  }

  return { init };
})();
