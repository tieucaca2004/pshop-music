/*
 * Logic dùng chung cho 4 trang admin/ai/{index,drafts,jobs,logs}.html.
 * Mỗi trang gọi đúng 1 hàm init tương ứng (AdminAI.initDashboard/initDrafts/
 * initJobs/initLogs). Publish chỉ gọi các hàm data layer đã có sẵn (BlogDB,
 * DB, BannerDB, SiteContentDB) — không viết logic ghi dữ liệu mới.
 */
const AdminAI = (function () {
  let drafts = [];
  let jobs = [];
  let logs = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : '';
  }

  function slugifyForPublish(str) {
    return String(str || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /* ============== DASHBOARD (admin/ai/index.html) ============== */

  function initDashboard() {
    AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT' }).then(() => renderModuleCards());
  }

  function fieldOptionsIfNeeded(field) {
    if (field.type === 'productSelect' && typeof DB !== 'undefined') {
      return DB.getAll().then(list => list.map(p => ({ value: p.id, label: p.name })));
    }
    if (field.type === 'blogSelect' && typeof BlogDB !== 'undefined') {
      return BlogDB.getAll().then(list => list.map(p => ({ value: p.id, label: p.title })));
    }
    return Promise.resolve(null);
  }

  function renderFieldHtml(moduleId, field, index, options) {
    const id = `f-${moduleId}-${field.key}`;
    if (index === 0 && field.type === 'text') {
      return `<div class="form-group full">
        <label>${escapeHtml(field.label)}</label>
        <textarea id="${id}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}"></textarea>
        <p class="small-muted">Mỗi dòng = 1 lần chạy riêng (dùng để tạo hàng loạt, VD 100 dòng = 100 bài).</p>
      </div>`;
    }
    if (field.type === 'textarea') {
      return `<div class="form-group full"><label>${escapeHtml(field.label)}</label><textarea id="${id}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}"></textarea></div>`;
    }
    if (field.type === 'select') {
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select></div>`;
    }
    if (field.type === 'productSelect' || field.type === 'blogSelect') {
      const opts = options || [];
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.optional ? '<option value="">(không chọn)</option>' : ''}${opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
    }
    return `<div class="form-group"><label>${escapeHtml(field.label)}</label><input type="text" id="${id}" placeholder="${escapeHtml(field.placeholder || '')}"></div>`;
  }

  function renderModuleForm(module) {
    const container = document.getElementById('form-' + module.id);
    if (!container) return;
    Promise.all(module.inputFields.map(fieldOptionsIfNeeded)).then(optionsList => {
      container.innerHTML = module.inputFields.map((f, i) => renderFieldHtml(module.id, f, i, optionsList[i])).join('');
    });
  }

  function renderModuleCards() {
    const wrap = document.getElementById('moduleCards');
    // Chỉ hiện plugin đang Enable — hỏi qua PluginManager.loadPlugins(),
    // không đọc thẳng PluginDB (PluginManager là điểm gọi Plugin duy nhất).
    // 5 module Sprint 1 khác vẫn còn code, chỉ đang "coming_soon".
    PluginManager.loadPlugins().then(plugins => {
      const enabledIds = plugins.filter(p => p.metadata.enabled).map(p => p.metadata.id);
      const modules = AIModuleRegistry.getAll().filter(m => enabledIds.includes(m.id));
      wrap.innerHTML = modules.map(m => `
        <div class="panel">
          <h3>${escapeHtml(m.label)}</h3>
          <p class="small-muted">${escapeHtml(m.description)}</p>
          <div id="form-${m.id}"></div>
          <div class="admin-actions">
            <button class="submit-btn" onclick="AdminAI.runModule('${m.id}')">CHẠY</button>
          </div>
          <p class="status-msg" id="status-${m.id}"></p>
        </div>`).join('') || '<p class="small-muted">Chưa có plugin nào đang bật — xem <a href="plugins.html" style="color:var(--gold-ink)">Plugin Manager</a>.</p>';
      modules.forEach(renderModuleForm);
    });
  }

  function showModuleStatus(moduleId, msg) {
    const el = document.getElementById('status-' + moduleId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function runModule(moduleId) {
    const module = AIModuleRegistry.get(moduleId);
    if (!module) return;
    const user = AdminAuth.getUser();

    // Permission & Safety Layer (Sprint 2, Requirement #8): User → Permission
    // → Queue → AI Provider → Draft. Kiểm tra quyền TRƯỚC khi chạm tới
    // PluginManager/Queue — nếu bị từ chối thì dừng ở đây, không gọi
    // execute() nên chắc chắn không tạo Job/không vào Queue/không gọi AI
    // Provider/không tạo Draft. Không sửa plugin-manager.js hay
    // job-queue.js để thêm bước này (giữ nguyên 2 module đó theo yêu cầu).
    PermissionService.checkPluginExecution(user.uid, user.email, moduleId).then(check => {
      if (!check.granted) {
        showModuleStatus(moduleId, `Không có quyền chạy plugin này (thiếu "${check.permission || 'quyền chưa được gán'}").`);
        return;
      }

      // Gọi Plugin thông qua Interface (PluginManager.loadPlugin().execute()) —
      // không tự kiểm tra/ghi PluginDB hay gọi AIJobQueue.enqueue() trực tiếp ở
      // đây. execute() tự chặn nếu plugin đang tắt, và chỉ GỬI job vào Queue —
      // Queue (AIJobQueue) mới là nơi thực thi.
      PluginManager.loadPlugin(moduleId).then(plugin => {
        if (!plugin) {
          showModuleStatus(moduleId, 'Không tìm thấy plugin.');
          return;
        }

        const values = {};
        let primaryKey = null;
        let batchLines = null;

        module.inputFields.forEach((field, i) => {
          const el = document.getElementById(`f-${moduleId}-${field.key}`);
          if (!el) return;
          if (i === 0 && field.type === 'text') {
            primaryKey = field.key;
            batchLines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
          } else {
            values[field.key] = el.value;
          }
        });

        const items = (batchLines && batchLines.length ? batchLines : [null]).map(line => {
          const item = Object.assign({}, values);
          if (primaryKey) item[primaryKey] = line || '';
          return item;
        });

        showModuleStatus(moduleId, `Đã tạo job (${items.length} mục) — đang xử lý...`);
        plugin.execute(items, user.uid, user.email)
          .then(() => AIJobQueue.resume(user.uid, user.email))
          .then(() => showModuleStatus(moduleId, 'Đã xử lý xong job — xem "Nhật ký"/"Job Queue" để biết kết quả (nếu provider chưa cấu hình hoặc gặp lỗi, job sẽ báo lỗi rõ trong Nhật ký).'))
          .catch(err => showModuleStatus(moduleId, 'Lỗi: ' + err.message));
      });
    });
  }

  /* ============== DRAFTS / REVIEW QUEUE (admin/ai/drafts.html) ============== */

  function initDrafts() {
    AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT — DUYỆT NỘI DUNG' }).then(loadDrafts);
  }

  function loadDrafts() {
    DraftDB.getAll().then(list => {
      drafts = list.filter(d => d.status === 'draft').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderDrafts();
    });
  }

  function renderDrafts() {
    const wrap = document.getElementById('draftsList');
    if (!wrap) return;
    if (!drafts.length) {
      wrap.innerHTML = '<p class="small-muted">Không có nội dung nào đang chờ duyệt.</p>';
      return;
    }
    wrap.innerHTML = drafts.map(d => {
      const module = AIModuleRegistry.get(d.moduleId);
      return `
      <div class="panel" data-id="${d.id}">
        <h3>${escapeHtml(module ? module.label : d.moduleId)}</h3>
        <p class="small-muted">Tạo lúc ${formatDate(d.createdAt)} · Provider: ${escapeHtml(d.providerUsed || '—')} · Đích: ${escapeHtml(d.targetCollection || '(chỉ xem/copy)')}</p>
        <pre style="white-space:pre-wrap;background:var(--bg-alt);padding:1rem;font-size:0.82rem;max-height:260px;overflow:auto">${escapeHtml(JSON.stringify(d.content, null, 2))}</pre>
        <div class="admin-actions">
          <button class="submit-btn" onclick="AdminAI.publishDraft('${d.id}')">DUYỆT &amp; PUBLISH</button>
          <button class="btn-danger" onclick="AdminAI.rejectDraft('${d.id}')">TỪ CHỐI</button>
        </div>
      </div>`;
    }).join('');
  }

  function publishToTarget(draft) {
    const target = draft.targetCollection;
    if (!target) return Promise.resolve(); // Facebook Post / Image Prompt — chỉ để xem/copy, không có nơi ghi
    if (target === 'blogPosts') {
      if (draft.targetId) return BlogDB.update(draft.targetId, draft.content);
      const content = Object.assign({}, draft.content);
      if (!content.slug) content.slug = slugifyForPublish(content.title);
      return BlogDB.add(content);
    }
    if (target === 'products') {
      return DB.update(draft.targetId, draft.content);
    }
    if (target === 'banners') {
      return BannerDB.add(draft.content);
    }
    if (target === 'siteContent.heroSlides') {
      return SiteContentDB.get().then(sc => {
        const heroSlides = Array.isArray(sc.heroSlides) ? sc.heroSlides.slice() : [];
        heroSlides.push(draft.content);
        return SiteContentDB.save(Object.assign({}, sc, { heroSlides }));
      });
    }
    return Promise.reject(new Error('Không nhận diện được targetCollection: ' + target));
  }

  function publishDraft(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    publishToTarget(draft)
      .then(() => DraftDB.update(id, { status: 'published', publishedAt: Date.now() }))
      .then(loadDrafts)
      .catch(err => alert('Lỗi khi publish: ' + err.message));
  }

  function rejectDraft(id) {
    if (!confirm('Từ chối nội dung này? Vẫn giữ lại để tra cứu, không xóa.')) return;
    DraftDB.update(id, { status: 'rejected' }).then(loadDrafts);
  }

  // publishDraftById/rejectDraftById (Sprint 4, Requirement #2) — tái sử dụng
  // ĐÚNG cơ chế publish/reject có sẵn (publishToTarget() ở trên, không viết
  // lại) nhưng không phụ thuộc mảng `drafts` cục bộ của trang Duyệt nội dung
  // — cho phép AI Assistant (admin/ai/assistant.html) publish/reject 1 Draft
  // biết trước id mà không cần gọi initDrafts()/loadDrafts() của trang này
  // trước (tránh gọi trùng AdminAuth.init() giữa 2 trang, giảm coupling).
  // Không đổi publishDraft()/rejectDraft()/initDrafts() ở trên.
  function publishDraftById(id) {
    return DraftDB.get(id).then(draft => {
      if (!draft) return Promise.reject(new Error('Không tìm thấy nội dung nháp.'));
      return publishToTarget(draft).then(() => DraftDB.update(id, { status: 'published', publishedAt: Date.now() }));
    });
  }

  function rejectDraftById(id) {
    return DraftDB.update(id, { status: 'rejected' });
  }

  /* ============== JOB QUEUE MONITOR (admin/ai/jobs.html) ============== */

  function initJobs() {
    AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT — JOB QUEUE' }).then(({ user }) => {
      AIJobQueue.resume(user.uid, user.email).then(loadJobs);
      loadJobs();
      setInterval(loadJobs, 3000);
    });
  }

  function loadJobs() {
    JobDB.getAll().then(list => {
      jobs = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderJobs();
    });
  }

  const JOB_STATUS_LABELS = { queued: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };

  function renderJobs() {
    const body = document.getElementById('jobsTableBody');
    if (!body) return;
    if (!jobs.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có job nào.</td></tr>';
      return;
    }
    body.innerHTML = jobs.map(j => {
      const module = AIModuleRegistry.get(j.moduleId);
      const canCancel = j.status === 'queued' || j.status === 'running';
      const canRetry = j.status === 'failed' || (j.status === 'completed' && j.progress.failed > 0) || j.status === 'cancelled';
      const actions = [
        canCancel ? `<button class="btn-danger" onclick="AdminAI.cancelJob('${j.id}')">Hủy</button>` : '',
        canRetry ? `<button class="btn-secondary" onclick="AdminAI.retryJob('${j.id}')">Thử lại</button>` : ''
      ].filter(Boolean).join(' ');
      return `
      <tr>
        <td>${escapeHtml(module ? module.label : j.moduleId)}</td>
        <td>${JOB_STATUS_LABELS[j.status] || escapeHtml(j.status)}</td>
        <td>${j.progress.done}/${j.progress.total} (lỗi: ${j.progress.failed})</td>
        <td>${formatDate(j.createdAt)}</td>
        <td>${escapeHtml(j.createdByEmail || '')}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }

  function retryJob(id) {
    const user = AdminAuth.getUser();
    AIJobQueue.retryFailed(id).then(() => AIJobQueue.resume(user.uid, user.email)).then(loadJobs);
  }

  function cancelJob(id) {
    // Gọi Plugin thông qua Interface (plugin.cancel()) thay vì gọi thẳng
    // AIJobQueue.cancel() — plugin.cancel() vẫn ủy quyền cho Queue bên trong.
    // Truyền user hiện tại để Queue ghi Log đúng ai là người hủy job.
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const user = AdminAuth.getUser();
    PluginManager.loadPlugin(job.moduleId).then(plugin => {
      const cancelPromise = plugin ? plugin.cancel(id, user.uid, user.email) : AIJobQueue.cancel(id, user.uid, user.email);
      return cancelPromise.then(loadJobs);
    });
  }

  /* ============== LOGS (admin/ai/logs.html) ============== */

  function initLogs() {
    AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT — NHẬT KÝ', requiredRole: 'admin' }).then(loadLogs);
  }

  function loadLogs() {
    const moduleFilter = new URLSearchParams(location.search).get('module');
    LogDB.getAll().then(list => {
      logs = list
        .filter(l => !moduleFilter || l.moduleId === moduleFilter)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 200);
      renderLogs();
    });
  }

  const LOG_STATUS_LABELS = {
    completed: 'Completed',
    failed: '<span style="color:#c0392b">Failed</span>',
    cancelled: '<span style="color:var(--ink-mute)">Cancelled</span>',
    permission_denied: '<span style="color:#c0392b">Permission Denied</span>'
  };

  function renderLogs() {
    const body = document.getElementById('logsTableBody');
    if (!body) return;
    if (!logs.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có log nào.</td></tr>';
      return;
    }
    body.innerHTML = logs.map(l => {
      const module = AIModuleRegistry.get(l.moduleId);
      return `
      <tr>
        <td>${formatDate(l.timestamp)}</td>
        <td>${escapeHtml(l.userEmail || '')}</td>
        <td>${escapeHtml(module ? module.label : l.moduleId)}</td>
        <td>${escapeHtml(l.provider || '')}</td>
        <td>${LOG_STATUS_LABELS[l.status] || escapeHtml(l.status || '')}</td>
        <td>${escapeHtml(l.errorMessage || '')}</td>
      </tr>`;
    }).join('');
  }

  return { initDashboard, runModule, initDrafts, publishDraft, rejectDraft, publishDraftById, rejectDraftById, initJobs, cancelJob, retryJob, initLogs };
})();
