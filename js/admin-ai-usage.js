/*
 * Usage Visibility (admin/ai/usage.html, Admin-only) — Sprint 5 Requirement
 * #4. Chỉ là Experience Layer: gọi UsageStats.compute() (js/ai/usage-stats.js)
 * và hiển thị báo cáo — không tự tính toán gì thêm, không chứa Business
 * Logic mới.
 */
const AdminAIUsage = (function () {
  const RANGE_LABELS = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '30d': '30 ngày gần nhất' };
  const STATUS_LABELS = { completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', permission_denied: 'Permission Denied' };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-usage', title: 'AI ASSISTANT — USAGE VISIBILITY', requiredRole: 'admin' }).then(() => {
      document.getElementById('usageRangeFilter').addEventListener('change', renderReport);
      renderReport();
    });
  }

  // Tên hiển thị Plugin — tái sử dụng nhãn có sẵn của AIModuleRegistry
  // (không viết logic ánh xạ mới); fallback về đúng moduleId nếu không tìm
  // thấy (vd log cũ của module đã gỡ).
  function pluginLabel(moduleId) {
    if (moduleId === '(không rõ)') return moduleId;
    const module = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(moduleId) : null;
    return module ? module.label : moduleId;
  }

  function breakdownRows(counts, labelFn) {
    const keys = Object.keys(counts).filter(k => counts[k] > 0).sort((a, b) => counts[b] - counts[a]);
    if (!keys.length) return '<tr><td colspan="2" style="color:var(--ink-mute)">Không có dữ liệu.</td></tr>';
    return keys.map(k => `<tr><td>${escapeHtml(labelFn ? labelFn(k) : k)}</td><td>${counts[k]}</td></tr>`).join('');
  }

  function renderReport() {
    const rangeKey = document.getElementById('usageRangeFilter').value;
    const resultEl = document.getElementById('usageResult');
    resultEl.innerHTML = '<p class="small-muted">Đang tổng hợp dữ liệu...</p>';

    UsageStats.compute(rangeKey).then(report => {
      if (report.total === 0) {
        // Functional Requirement #6: không có dữ liệu -> hiển thị trạng thái
        // phù hợp, không phải "System Error".
        resultEl.innerHTML = `<div class="panel"><p class="small-muted">Chưa có dữ liệu sử dụng AI trong khoảng "${escapeHtml(RANGE_LABELS[rangeKey])}".</p></div>`;
        return;
      }
      resultEl.innerHTML = `
        <div class="panel">
          <p><strong>Tổng số lần Generate (${escapeHtml(RANGE_LABELS[rangeKey])}): ${report.total}</strong></p>
          <p class="small-muted">Số liệu tổng hợp từ Nhật ký AI (aiLogs) — chỉ đọc, không phải Cost Tracking (chưa có dữ liệu token/chi phí).</p>
          <div class="field-grid" style="margin-top:1rem">
            <div>
              <h4 style="margin:0 0 0.5rem">Theo Plugin</h4>
              <table class="admin-table"><thead><tr><th>Plugin</th><th>Số lần</th></tr></thead>
              <tbody>${breakdownRows(report.byPlugin, pluginLabel)}</tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 0.5rem">Theo Provider</h4>
              <table class="admin-table"><thead><tr><th>Provider</th><th>Số lần</th></tr></thead>
              <tbody>${breakdownRows(report.byProvider)}</tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 0.5rem">Theo Trạng thái</h4>
              <table class="admin-table"><thead><tr><th>Trạng thái</th><th>Số lần</th></tr></thead>
              <tbody>${breakdownRows(report.byStatus, s => STATUS_LABELS[s] || s)}</tbody></table>
            </div>
          </div>
        </div>`;
    }).catch(err => {
      resultEl.innerHTML = '<p style="color:#c0392b">Không đọc được dữ liệu Nhật ký AI: ' + escapeHtml(err.message) + '</p>';
    });
  }

  return { init };
})();
