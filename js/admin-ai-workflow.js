/*
 * AI Workflow Automation (admin/ai/workflow.html, Admin-only) — Sprint 7
 * Requirement #4. Chỉ là Experience Layer: dựng UI ghép Step (Plugin +
 * input), gọi WorkflowEngine.run() (js/ai/workflow-engine.js) và hiển thị
 * tiến trình từng Step. Không tự chạy AI/không tự vào Queue — mọi việc đó
 * đều do WorkflowEngine (qua đúng Permission Service/Plugin Manager/Queue).
 *
 * Danh sách Plugin lấy qua PluginManager.loadPlugins() (AI_RULES.md mục
 * 5b), CHỈ hiển thị Plugin đang "Đang bật" (giống Dashboard chính,
 * js/admin-ai.js). Dropdown Sản phẩm/Bài viết cho từng field
 * productSelect/blogSelect tải qua DB.getAll()/BlogDB.getAll() trực tiếp —
 * đúng khuôn mẫu js/admin-ai.js đã dùng (không phải loadContext() của
 * Plugin nên không bắt buộc qua DataProvider).
 */
const AdminAIWorkflow = (function () {
  let steps = [];
  let enabledPlugins = [];

  const STATUS_LABELS = {
    completed: 'Hoàn tất',
    failed: 'Lỗi',
    permission_denied: 'Không có quyền',
    plugin_not_found: 'Không tìm thấy Plugin',
    unknown: 'Không rõ trạng thái'
  };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-workflow', title: 'PLUGIN AI — WORKFLOW AUTOMATION', requiredRole: 'admin' }).then(() => {
      document.getElementById('wfAddStepBtn').addEventListener('click', addStep);
      document.getElementById('wfRunBtn').addEventListener('click', onRunWorkflow);
      return PluginManager.loadPlugins().then(plugins => {
        enabledPlugins = plugins.filter(p => p.metadata.enabled);
        addStep();
      });
    });
  }

  function addStep() {
    steps.push({ pluginId: null });
    renderSteps();
  }

  function removeStep(index) {
    steps.splice(index, 1);
    renderSteps();
  }

  // fieldOptionsIfNeeded/renderFieldHtml — đúng khuôn mẫu js/admin-ai.js
  // (fieldOptionsIfNeeded/renderFieldHtml) nhưng luôn render input đơn (mỗi
  // Step chạy đúng 1 item, không có "batch nhiều dòng" như Dashboard chính).
  function fieldOptionsIfNeeded(field) {
    if (field.type === 'productSelect' && typeof DB !== 'undefined') {
      return DB.getAll().then(list => list.map(p => ({ value: p.id, label: p.name })));
    }
    if (field.type === 'blogSelect' && typeof BlogDB !== 'undefined') {
      return BlogDB.getAll().then(list => list.map(p => ({ value: p.id, label: p.title })));
    }
    return Promise.resolve(null);
  }

  function renderFieldHtml(stepIndex, field, options) {
    const id = `wf-${stepIndex}-${field.key}`;
    if (field.type === 'textarea') {
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><textarea id="${id}" rows="2" placeholder="${escapeHtml(field.placeholder || '')}"></textarea></div>`;
    }
    if (field.type === 'select' && field.options) {
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select></div>`;
    }
    if (field.type === 'productSelect' || field.type === 'blogSelect') {
      const opts = options || [];
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}"><option value="">-- Chọn --</option>${opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
    }
    return `<div class="form-group"><label>${escapeHtml(field.label)}</label><input type="text" id="${id}" placeholder="${escapeHtml(field.placeholder || '')}"></div>`;
  }

  function renderStepHtml(step, index) {
    const pluginOptions = enabledPlugins.map(p =>
      `<option value="${escapeHtml(p.metadata.id)}"${step.pluginId === p.metadata.id ? ' selected' : ''}>${escapeHtml(p.metadata.name)}</option>`
    ).join('');
    const module = step.pluginId && typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(step.pluginId) : null;
    const fieldsPromise = module
      ? Promise.all(module.inputFields.map(fieldOptionsIfNeeded)).then(optionsList =>
          module.inputFields.map((f, fi) => renderFieldHtml(index, f, optionsList[fi])).join('')
        )
      : Promise.resolve('');

    return fieldsPromise.then(fieldsHtml => `
      <div class="panel" style="margin-bottom:1rem">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem">
          <strong>Bước ${index + 1}</strong>
          <button type="button" class="link-btn" data-remove-step="${index}">Xóa bước</button>
        </div>
        <div class="form-group" style="max-width:360px">
          <label>Plugin</label>
          <select data-step-plugin="${index}"><option value="">-- Chọn Plugin --</option>${pluginOptions}</select>
        </div>
        ${fieldsHtml ? `<div class="field-grid">${fieldsHtml}</div>` : ''}
      </div>`);
  }

  function renderSteps() {
    const container = document.getElementById('wfSteps');
    Promise.all(steps.map(renderStepHtml)).then(htmlParts => {
      container.innerHTML = htmlParts.join('') || '<p class="small-muted">Chưa có bước nào — bấm "+ Thêm bước" để bắt đầu.</p>';
      container.querySelectorAll('[data-step-plugin]').forEach(sel => {
        sel.addEventListener('change', () => {
          steps[Number(sel.dataset.stepPlugin)].pluginId = sel.value || null;
          renderSteps();
        });
      });
      container.querySelectorAll('[data-remove-step]').forEach(btn => {
        btn.addEventListener('click', () => removeStep(Number(btn.dataset.removeStep)));
      });
    });
  }

  function collectStepInputParams(step, index) {
    const module = step.pluginId && typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(step.pluginId) : null;
    const params = {};
    if (module) {
      module.inputFields.forEach(f => {
        const el = document.getElementById(`wf-${index}-${f.key}`);
        if (el) params[f.key] = el.value;
      });
    }
    return params;
  }

  function pluginLabel(pluginId) {
    const module = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(pluginId) : null;
    return module ? module.label : pluginId;
  }

  // renderResults() vẽ lại toàn bộ bảng tiến trình sau MỖI Step (real-time) —
  // Step chưa có kết quả: "Đang chờ..." khi đang chạy, "Chưa chạy (dừng do
  // bước trước lỗi)" khi Workflow đã dừng hẳn (Functional Requirement #6:
  // hiển thị rõ bước nào lỗi/bước nào không chạy).
  function renderResults(plannedSteps, liveResults, done) {
    const rows = plannedSteps.map((step, i) => {
      const result = liveResults[i];
      if (!result) {
        const stateText = done ? 'Chưa chạy (dừng do bước trước lỗi)' : 'Đang chờ...';
        return `<tr><td>Bước ${i + 1}</td><td>${escapeHtml(pluginLabel(step.pluginId))}</td><td>${stateText}</td><td></td></tr>`;
      }
      const label = STATUS_LABELS[result.status] || result.status;
      const jobLink = result.jobId ? ` <a href="jobs.html" style="color:var(--gold-ink)">Xem Job</a>` : '';
      return `<tr><td>Bước ${i + 1}</td><td>${escapeHtml(pluginLabel(step.pluginId))}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(result.error || '')}${jobLink}</td></tr>`;
    }).join('');

    document.getElementById('wfResult').innerHTML = `
      <div class="panel">
        <table class="admin-table"><thead><tr><th>Bước</th><th>Plugin</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead>
        <tbody>${rows}</tbody></table>
        ${done ? `<p class="small-muted" style="margin-top:1rem">Kết quả (nếu có) đã dừng ở Draft — vào <a href="drafts.html" style="color:var(--gold-ink)">Duyệt nội dung</a> để xem trước và Duyệt &amp; Publish. Workflow KHÔNG tự Publish.</p>` : ''}
      </div>`;
  }

  function onRunWorkflow() {
    const user = AdminAuth.getUser();
    const plannedSteps = steps
      .map((step, i) => ({ pluginId: step.pluginId, inputParams: collectStepInputParams(step, i) }))
      .filter(s => s.pluginId);

    if (!plannedSteps.length) {
      document.getElementById('wfResult').innerHTML = '<p class="small-muted">Chưa chọn Plugin cho bước nào — không có gì để chạy.</p>';
      return;
    }

    const runBtn = document.getElementById('wfRunBtn');
    runBtn.disabled = true;
    const liveResults = [];
    renderResults(plannedSteps, liveResults, false);

    WorkflowEngine.run(plannedSteps, user.uid, user.email, entry => {
      liveResults.push(entry);
      renderResults(plannedSteps, liveResults, false);
    }).then(out => {
      renderResults(plannedSteps, out.results, true);
      runBtn.disabled = false;
    });
  }

  return { init };
})();
