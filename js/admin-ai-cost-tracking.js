/*
 * AI Cost Tracking (admin/ai/cost-tracking.html, Admin-only) — Sprint 7
 * Requirement #2. Chỉ là Experience Layer: gọi CostTrackingService.compute()
 * (js/ai/cost-tracking.js) và hiển thị báo cáo — không tự tính toán gì
 * thêm, không chứa Business Logic mới.
 */
const AdminAICostTracking = (function () {
  const RANGE_LABELS = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '30d': '30 ngày gần nhất' };
  const STATUS_LABELS = { completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', permission_denied: 'Permission Denied' };
  const UNAVAILABLE_TEXT = 'Cost estimation unavailable';

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-cost-tracking', title: 'AI ASSISTANT — COST TRACKING', requiredRole: 'admin' }).then(() => {
      document.getElementById('costRangeFilter').addEventListener('change', renderReport);
      renderReport();
    });
  }

  function pluginLabel(moduleId) {
    if (moduleId === '(không rõ)') return moduleId;
    const module = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(moduleId) : null;
    return module ? module.label : moduleId;
  }

  function usageRows(counts, labelFn) {
    const keys = Object.keys(counts).filter(k => counts[k] > 0).sort((a, b) => counts[b] - counts[a]);
    if (!keys.length) return '<tr><td colspan="2" style="color:var(--ink-mute)">Không có dữ liệu.</td></tr>';
    return keys.map(k => `<tr><td>${escapeHtml(labelFn ? labelFn(k) : k)}</td><td>${counts[k]}</td></tr>`).join('');
  }

  function formatCost(entry) {
    if (!entry.available) return `<span style="color:var(--ink-mute)">${UNAVAILABLE_TEXT}</span>`;
    return '$' + entry.cost.toFixed(4);
  }

  function costRows(costMap, labelFn) {
    const keys = Object.keys(costMap).sort((a, b) => costMap[b].count - costMap[a].count);
    if (!keys.length) return `<tr><td colspan="3" style="color:var(--ink-mute)">${UNAVAILABLE_TEXT}</td></tr>`;
    return keys.map(k => `<tr><td>${escapeHtml(labelFn ? labelFn(k) : k)}</td><td>${costMap[k].count}</td><td>${formatCost(costMap[k])}</td></tr>`).join('');
  }

  function renderReport() {
    const rangeKey = document.getElementById('costRangeFilter').value;
    const resultEl = document.getElementById('costResult');
    resultEl.innerHTML = '<p class="small-muted">Đang tổng hợp dữ liệu...</p>';

    CostTrackingService.compute(rangeKey).then(report => {
      if (report.total === 0) {
        // Functional Requirement #7: chưa đủ dữ liệu -> trạng thái rõ ràng,
        // không phải "System Error".
        resultEl.innerHTML = `<div class="panel"><p class="small-muted">Chưa có dữ liệu sử dụng AI trong khoảng "${escapeHtml(RANGE_LABELS[rangeKey])}" — ${UNAVAILABLE_TEXT}.</p></div>`;
        return;
      }
      resultEl.innerHTML = `
        <div class="panel">
          <p><strong>Tổng số lần Generate (${escapeHtml(RANGE_LABELS[rangeKey])}): ${report.total}</strong></p>
          <p class="small-muted">Chi phí hiển thị là ƯỚC TÍNH tham khảo (đơn giá trung bình mỗi lượt Generate thành công, không dựa trên token thực tế) — không phải Billing chính xác. Provider chưa có đơn giá tham khảo sẽ hiển thị "${UNAVAILABLE_TEXT}".</p>
          <div class="field-grid" style="margin-top:1rem">
            <div>
              <h4 style="margin:0 0 0.5rem">Usage theo Plugin</h4>
              <table class="admin-table"><thead><tr><th>Plugin</th><th>Số lần</th></tr></thead>
              <tbody>${usageRows(report.byPlugin, pluginLabel)}</tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 0.5rem">Usage theo Provider</h4>
              <table class="admin-table"><thead><tr><th>Provider</th><th>Số lần</th></tr></thead>
              <tbody>${usageRows(report.byProvider)}</tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 0.5rem">Usage theo Trạng thái</h4>
              <table class="admin-table"><thead><tr><th>Trạng thái</th><th>Số lần</th></tr></thead>
              <tbody>${usageRows(report.byStatus, s => STATUS_LABELS[s] || s)}</tbody></table>
            </div>
          </div>
          <div class="field-grid" style="margin-top:1.5rem">
            <div>
              <h4 style="margin:0 0 0.5rem">Chi phí ước tính theo Provider</h4>
              <table class="admin-table"><thead><tr><th>Provider</th><th>Lượt thành công</th><th>Chi phí ước tính</th></tr></thead>
              <tbody>${costRows(report.costByProvider)}</tbody></table>
            </div>
            <div>
              <h4 style="margin:0 0 0.5rem">Chi phí ước tính theo Plugin</h4>
              <table class="admin-table"><thead><tr><th>Plugin</th><th>Lượt thành công</th><th>Chi phí ước tính</th></tr></thead>
              <tbody>${costRows(report.costByPlugin, pluginLabel)}</tbody></table>
            </div>
          </div>
          ${report.costAvailable ? '' : `<p class="small-muted" style="margin-top:1rem">${UNAVAILABLE_TEXT} — chưa có lượt Generate thành công nào từ Provider đã có đơn giá tham khảo (hiện chỉ OpenAI) trong khoảng thời gian này.</p>`}
        </div>`;
    }).catch(err => {
      resultEl.innerHTML = '<p style="color:#c0392b">Không đọc được dữ liệu Cost Tracking: ' + escapeHtml(err.message) + '</p>';
    });
  }

  return { init };
})();
