/*
 * Production Health Check (admin/ai/health.html, Admin-only) — Sprint 5
 * Requirement #1. Chỉ là Experience Layer: gọi HealthCheck.run() (js/ai/
 * health-check.js) và hiển thị báo cáo — không tự kiểm tra gì thêm, không
 * chứa Business Logic.
 */
const AdminAIHealth = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-health', title: 'AI ASSISTANT — HEALTH CHECK', requiredRole: 'admin' }).then(() => {
      document.getElementById('healthCheckRunBtn').addEventListener('click', runCheck);
    });
  }

  function statusRow(label, result) {
    const color = result.ok ? 'var(--gold-ink)' : '#c0392b';
    const icon = result.ok ? '✓' : '✗';
    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td style="color:${color}">${icon} ${result.ok ? 'OK' : 'Lỗi'}</td>
      <td>${escapeHtml(result.message)}</td>
    </tr>`;
  }

  function runCheck() {
    const btn = document.getElementById('healthCheckRunBtn');
    const resultEl = document.getElementById('healthCheckResult');
    btn.disabled = true;
    resultEl.innerHTML = '<p class="small-muted">Đang kiểm tra hệ thống...</p>';
    HealthCheck.run('openai').then(report => {
      resultEl.innerHTML = `
        <div class="panel">
          <p><strong style="color:${report.overallHealthy ? 'var(--gold-ink)' : '#c0392b'}">
            ${report.overallHealthy ? '✓ Toàn bộ hệ thống hoạt động bình thường' : '✗ Phát hiện thành phần lỗi — xem chi tiết bên dưới'}
          </strong></p>
          <p class="small-muted">Kiểm tra lúc ${escapeHtml(new Date(report.checkedAt).toLocaleString('vi-VN'))}</p>
          <table class="admin-table">
            <thead><tr><th>Thành phần</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead>
            <tbody>
              ${statusRow('AI Provider → Cloud Function → OpenAI API', report.provider)}
              ${statusRow('Queue (aiJobs)', report.queue)}
              ${statusRow('Draft Workflow (aiDrafts)', report.draftWorkflow)}
            </tbody>
          </table>
          <p class="small-muted" style="margin-top:1rem">Health Check chỉ đọc trạng thái — không tạo Job, không tạo Draft, không Publish.</p>
        </div>`;
    }).catch(err => {
      resultEl.innerHTML = '<p style="color:#c0392b">Lỗi khi chạy Health Check: ' + escapeHtml(err.message) + '</p>';
    }).then(() => { btn.disabled = false; });
  }

  return { init };
})();
