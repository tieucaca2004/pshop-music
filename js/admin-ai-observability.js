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
    AdminAuth.init({ page: 'ai-observability', title: 'PLUGIN AI — OBSERVABILITY DASHBOARD', requiredRole: 'admin' }).then(() => {
      document.getElementById('observabilityRefreshBtn').addEventListener('click', load);
      document.getElementById('observabilityRangeFilter').addEventListener('change', load);
      // WORKFLOW-03: realtime listener theo dõi Workflow Runtime (apiAsyncJobs)
      startWfListener();
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

  // ─── WORKFLOW-03: Workflow Runtime Monitoring (apiAsyncJobs) ──────────────
  // Đọc trực tiếp Runtime apiAsyncJobs qua Firebase listener (realtime, không
  // polling/cron). REUSE FIRST: dùng trong chính AdminAIObservability — không
  // namespace/file mới. Dashboard 3 tầng: Overview / Workflow Detail / Step Detail.
  var wfSnapshot = {};   // jobId -> job (cache đọc runtime hiện có)
  var wfListener = null;
  var wfMeta = { running: 0, waiting: 0, retrying: 0, failed: 0, completed: 0, cancelled: 0 };
  var wfHistory = [];    // gần nhất trước (cho history 30 ngày / 1000 wf)

  function wfStateLabel(s) {
    return String(s || 'QUEUED').toUpperCase();
  }
  function wfStateColor(s) {
    switch (wfStateLabel(s)) {
      case 'RUNNING': return 'var(--gold-ink)';
      case 'FAILED': case 'CANCELLED': return '#c0392b';
      case 'COMPLETED': return 'var(--green, #27ae60)';
      case 'RETRYING': case 'PAUSED': case 'WAITING': return '#e67e22';
      default: return 'var(--muted2)';
    }
  }
  function dur(ms) {
    if (!ms && ms !== 0) return '—';
    ms = Number(ms);
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function wfOverviewHtml() {
    const m = wfMeta;
    const total = (m.running + m.waiting + m.retrying + m.failed + m.completed + m.cancelled) || 0;
    const successRate = total ? Math.round((m.completed / total) * 100) : 0;
    const failRate = total ? Math.round((m.failed / total) * 100) : 0;
    const card = (label, val, color) => `<div style="flex:1;min-width:120px;padding:.6rem;border:1px solid var(--border,#333);border-radius:8px;text-align:center">
      <div style="font-size:1.6rem;color:${color || 'inherit'}">${val}</div><div class="small-muted">${escapeHtml(label)}</div></div>`;
    return `<div style="display:flex;flex-wrap:wrap;gap:.5rem">
      ${card('Running', m.running, 'var(--gold-ink)')}
      ${card('Waiting', m.waiting)}
      ${card('Retrying', m.retrying, '#e67e22')}
      ${card('Failed', m.failed, '#c0392b')}
      ${card('Completed', m.completed, 'var(--green,#27ae60)')}
      ${card('Cancelled', m.cancelled, '#c0392b')}
      ${card('Queue Size', total)}
      ${card('Success Rate', successRate + '%', 'var(--green,#27ae60)')}
      ${card('Failure Rate', failRate + '%', '#c0392b')}
    </div>`;
  }

  function wfTimelineHtml(job) {
    const log = (job && job.executionLog) ? job.executionLog : {};
    const steps = (job && job.payload && job.payload.steps) || [];
    const rows = steps.map((s, i) => {
      const e = log[i] || {};
      const st = e.status || 'PENDING';
      const color = st === 'SUCCESS' ? 'var(--green,#27ae60)' : (st === 'FAILED' ? '#c0392b' : (st === 'SKIPPED' ? 'var(--muted2)' : (st === 'RUNNING' ? 'var(--gold-ink)' : '#e67e22')));
      return `<div style="padding:.2rem 0"><span style="color:${color}">●</span> <strong>Step ${i + 1}</strong> ${escapeHtml(s.moduleId || '')} <span class="small-muted">(${st}${e.durationMs != null ? ' · ' + dur(e.durationMs) : ''}</span>${e.error ? ` · <span style="color:#c0392b">err</span>` : ''}${e.retry ? ` · retry ${e.retry}` : ''})</div>`;
    });
    return `<div style="font-size:.9rem">${rows.join('') || '<div class="small-muted">Chưa có step.</div>'}</div>`;
  }

  function wfDetailHtml(jobId) {
    const job = wfSnapshot[jobId];
    if (!job) return '<p class="small-muted">Không tìm thấy workflow.</p>';
    const st = wfStateLabel(job.workflowState || (job.status === 'completed' ? 'COMPLETED' : job.status));
    const curIdx = (job.currentStep != null) ? job.currentStep : 0;
    const steps = (job.payload && job.payload.steps) || [];
    const prev = curIdx > 0 ? steps[curIdx - 1] : null;
    const next = curIdx < steps.length ? steps[curIdx] : null;
    const startedAt = job.startedAt || job.createdAt || null;
    const finishedAt = job.finishedAt || null;
    const duration = (finishedAt && startedAt) ? (finishedAt - startedAt) : (startedAt ? (Date.now() - startedAt) : null);
    const retryCount = (job.executionLog) ? Object.values(job.executionLog).reduce((a, e) => a + (Number(e.retry) || 0), 0) : (job.retryCount || 0);
    const row = (l, v) => `<tr><td style="color:var(--muted2);width:40%">${escapeHtml(l)}</td><td>${v}</td></tr>`;
    return `<div class="panel">
      <h3 style="margin-top:0">Workflow ${escapeHtml(jobId)} <span style="color:${wfStateColor(st)}">(${st})</span></h3>
      <table class="admin-table">
        ${row('Workflow Name', (job.payload && job.payload.workflowName) || (job.payload && job.payload.productName) || 'product-auto')}
        ${row('Workflow State', `<span style="color:${wfStateColor(st)}">${st}</span>`)}
        ${row('Current Step', curIdx + ' / ' + (steps.length || 0))}
        ${row('Previous Step', prev ? escapeHtml(prev.moduleId) : '—')}
        ${row('Next Step', next ? escapeHtml(next.moduleId) : '—')}
        ${row('Started', startedAt ? new Date(startedAt).toLocaleString('vi-VN') : '—')}
        ${row('Updated', job.updatedAt ? new Date(job.updatedAt).toLocaleString('vi-VN') : '—')}
        ${row('Finished', finishedAt ? new Date(finishedAt).toLocaleString('vi-VN') : '—')}
        ${row('Duration', dur(duration))}
        ${row('Retry Count', retryCount)}
      </table>
      <h4>Execution Timeline</h4>${wfTimelineHtml(job)}
      <h4>Step Detail</h4>${wfStepsHtml(job)}
    </div>`;
  }

  function wfStepsHtml(job) {
    const log = (job && job.executionLog) ? job.executionLog : {};
    const steps = (job && job.payload && job.payload.steps) || [];
    if (!steps.length) return '<p class="small-muted">Không có step trong workflow config.</p>';
    return `<table class="admin-table"><thead><tr><th>#</th><th>Plugin</th><th>Status</th><th>Duration</th><th>Retry</th><th>Error</th></tr></thead><tbody>
      ${steps.map((s, i) => {
        const e = log[i] || {};
        const st = e.status || 'PENDING';
        const color = st === 'SUCCESS' ? 'var(--green,#27ae60)' : (st === 'FAILED' ? '#c0392b' : (st === 'RUNNING' ? 'var(--gold-ink)' : '#e67e22'));
        return `<tr><td>${i + 1}</td><td>${escapeHtml(s.moduleId || '')}</td><td style="color:${color}">${st}</td><td>${e.durationMs != null ? dur(e.durationMs) : '—'}</td><td>${e.retry || 0}</td><td style="color:#c0392b;max-width:220px;word-break:break-word">${escapeHtml(e.error || '')}</td></tr>`;
      }).join('')}
    </tbody></table>`;
  }

  function wfListHtml() {
    const ids = Object.keys(wfSnapshot);
    if (!ids.length) return '<p class="small-muted">Chưa có workflow nào trong Runtime.</p>';
    ids.sort().reverse();
    const rows = ids.slice(0, 50).map(id => {
      const job = wfSnapshot[id];
      const st = wfStateLabel(job.workflowState || (job.status === 'completed' ? 'COMPLETED' : job.status));
      const steps = (job.payload && job.payload.steps) || [];
      const cur = (job.currentStep != null) ? job.currentStep : 0;
      const pct = steps.length ? Math.round((cur / steps.length) * 100) : 0;
      const name = (job.payload && (job.payload.workflowName || job.payload.productName)) || 'product-auto';
      return `<tr style="cursor:pointer" onclick="AdminAIObservability && AdminAIObservability.openWf('${id}')">
        <td><code>${escapeHtml(id.slice(0, 18))}</code></td>
        <td>${escapeHtml(name)}</td>
        <td style="color:${wfStateColor(st)}">${st}</td>
        <td>${cur} / ${steps.length} (${pct}%)</td>
        <td>${dur((job.startedAt || job.createdAt) ? (((job.finishedAt || Date.now()) - (job.startedAt || job.createdAt))) : null)}</td>
      </tr>`;
    }).join('');
    return `<table class="admin-table"><thead><tr><th>Workflow ID</th><th>Workflow</th><th>State</th><th>Progress</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function wfRender() {
    const root = document.getElementById('wfRuntimePanel');
    if (!root) return;
    root.innerHTML = `
      <div class="panel"><h3 style="margin-top:0">Workflow Runtime — Overview</h3>${wfOverviewHtml()}
        <p class="small-muted" style="margin:.75rem 0 0">Realtime (Firebase listener, không polling). Nhấn 1 Workflow để mở Detail + Step + Timeline.</p></div>
      <div class="panel"><h3 style="margin-top:0">Workflow List (Runtime)</h3>${wfListHtml()}</div>
      <div id="wfDetailTarget"></div>
    `;
  }

  function startWfListener() {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    if (wfListener) return;
    const ref = firebase.database().ref('apiAsyncJobs');
    wfListener = ref.limitToLast(200).on('value', snap => {
      wfSnapshot = {};
      wfMeta = { running: 0, waiting: 0, retrying: 0, failed: 0, completed: 0, cancelled: 0 };
      const now = Date.now();
      wfHistory = [];
      snap.forEach(child => {
        const job = child.val();
        if (!job) return;
        job._id = child.key;
        wfSnapshot[child.key] = job;
        const st = wfStateLabel(job.workflowState || (job.status === 'completed' ? 'COMPLETED' : job.status));
        if (wfMeta[st.toLowerCase()] != null) wfMeta[st.toLowerCase()]++;
        const start = job.startedAt || job.createdAt || now;
        const end = job.finishedAt || now;
        if (job.completedAt || job.updatedAt) wfHistory.push({ id: child.key, state: st, startedAt: start, finishedAt: end, duration: end - start });
      });
      // history: giữ 1000 gần nhất / 30 ngày (reuse runtime, không DB mới)
      const cutoff = now - 30 * 24 * 3600 * 1000;
      wfHistory = wfHistory.filter(h => !h.finishedAt || h.finishedAt >= cutoff).slice(-1000);
      wfRender();
    });
  }

  function stopWfListener() {
    if (typeof firebase === 'undefined' || !firebase.database || !wfListener) return;
    firebase.database().ref('apiAsyncJobs').off('value', wfListener);
    wfListener = null;
  }

  // Public: mở detail 1 workflow khi click
  function openWf(jobId) {
    const target = document.getElementById('wfDetailTarget');
    if (target) target.innerHTML = wfDetailHtml(jobId);
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

  return { init, openWf };
})();
