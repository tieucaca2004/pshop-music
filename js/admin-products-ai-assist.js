/*
 * Product AI Assist (Sprint 11, Requirement #2) — nút "Viết mô tả bằng AI"
 * NGAY TRONG form Sản phẩm (admin/products.html), Founder không rời trang,
 * không mở AI Center. CHỈ là Experience Layer — tái sử dụng NGUYÊN VẸN
 * PermissionService → PluginManager → AIJobQueue → Draft → Review (đúng
 * luồng js/admin-ai.js đã dùng), kể cả 2 hàm publish/reject 1 Draft biết
 * trước id đã có sẵn từ Sprint 4 Requirement #2 (`AdminAI.publishDraftById`/
 * `AdminAI.rejectDraftById`, xem js/admin-ai.js) — KHÔNG sửa bất kỳ file
 * nào trong AI Framework (plugin-manager.js/job-queue.js/provider-
 * registry.js/permission-service.js/admin-ai.js), KHÔNG tạo Plugin/
 * Provider/Queue/Workflow mới.
 *
 * KHÔNG tham chiếu biến nội bộ của AdminApp (js/admin-products.js, IIFE
 * riêng, không export biến) — đọc/ghi qua DOM (#pId, #pDescriptionEditor
 * .ql-editor) giống đúng cách admin-products.js tự làm (vd editProduct()
 * gán quill.root.innerHTML trực tiếp) — không cần sửa admin-products.js.
 *
 * Chỉ hỗ trợ Mô tả sản phẩm (product-description-writer) ở Requirement
 * này — kiến trúc đủ mở rộng cho Tên sản phẩm/Mô tả ngắn/SEO Title/SEO
 * Description/Keywords sau này (chỉ cần thêm 1 entry moduleId + field DOM
 * tương ứng, không đổi luồng generate()/pollJob() bên dưới) nhưng KHÔNG tự
 * làm thêm ở Requirement này (chưa được giao/phê duyệt).
 */
const ProductAIAssist = (function () {
  const MODULE_ID = 'product-description-writer';
  let pollTimer = null;
  let activeJobId = null;

  function currentProductId() {
    const el = document.getElementById('pId');
    return el ? el.value.trim() : '';
  }

  function box() { return document.getElementById('pAiAssistBox'); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showMessage(msg) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel"><p class="small-muted">${escapeHtml(msg)}</p></div>`;
  }

  function renderInProgress(job) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <p class="small-muted">Đang xử lý AI (${job.status === 'running' ? 'đang chạy' : 'đang chờ trong hàng đợi'})...</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="pAiCancelBtn">HỦY</button>
      </div>
    </div>`;
    document.getElementById('pAiCancelBtn').addEventListener('click', () => cancelJob(job.id));
  }

  // Loi that tu Queue (khong bao gio bia noi dung/dung placeholder) - kem
  // nut "THU LAI" tai su dung AIJobQueue.retryFailed() da co san.
  function renderFailed(job, item) {
    const b = box();
    if (!b) return;
    const errorMsg = (item && item.error) || 'AI xử lý thất bại.';
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <p class="small-muted" style="color:#b3261e">AI thất bại: ${escapeHtml(errorMsg)}</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="pAiRetryBtn">THỬ LẠI</button>
      </div>
    </div>`;
    document.getElementById('pAiRetryBtn').addEventListener('click', () => retryJob(job.id));
  }

  function showPreview(draft) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel">
      <h4 style="margin:0 0 0.5rem">Bản nháp AI — Mô tả sản phẩm (chưa áp dụng vào form)</h4>
      <div class="small-muted" style="border:1px solid var(--border, #ddd);padding:0.6rem;border-radius:6px;max-height:220px;overflow:auto">${draft.content.description || '(trống)'}</div>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="submit-btn" id="pAiApplyBtn">ÁP DỤNG VÀO MÔ TẢ</button>
        <button type="button" class="btn-secondary" id="pAiRejectBtn">TỪ CHỐI</button>
      </div>
    </div>`;
    document.getElementById('pAiApplyBtn').addEventListener('click', () => applyDraft(draft));
    document.getElementById('pAiRejectBtn').addEventListener('click', () => rejectDraft(draft.id));
  }

  // ÁP DỤNG — tái sử dụng NGUYÊN VẸN AdminAI.publishDraftById() (Sprint 4
  // Requirement #2, ghi DB.update(targetId, content) qua đúng
  // publishToTarget() đã có) — không viết lại logic Publish. Founder vẫn
  // phải tự bấm "LƯU SẢN PHẨM" nếu muốn thay đổi thêm field khác cùng lúc;
  // publishDraftById() đã ghi thẳng "description" vào Firebase ngay khi Áp
  // dụng, ô mô tả trên form chỉ cần đồng bộ lại hiển thị.
  function applyDraft(draft) {
    AdminAI.publishDraftById(draft.id).then(() => {
      const editorEl = document.querySelector('#pDescriptionEditor .ql-editor');
      if (editorEl) editorEl.innerHTML = draft.content.description || '';
      showMessage('Đã áp dụng mô tả AI — đã lưu vào sản phẩm. Form đã đồng bộ hiển thị mới nhất.');
    }).catch(err => showMessage('Lỗi khi áp dụng: ' + err.message));
  }

  function rejectDraft(draftId) {
    AdminAI.rejectDraftById(draftId).then(() => {
      showMessage('Đã từ chối bản nháp — có thể bấm "Viết mô tả bằng AI" để thử lại.');
    });
  }

  function retryJob(jobId) {
    showMessage('Đang thử lại...');
    const user = AdminAuth.getUser();
    AIJobQueue.retryFailed(jobId).then(() => AIJobQueue.resume(user.uid, user.email)).then(() => {
      activeJobId = jobId;
      pollJob();
      startPolling();
    });
  }

  function cancelJob(jobId) {
    const user = AdminAuth.getUser();
    AIJobQueue.cancel(jobId, user.uid, user.email).then(() => {
      stopPolling();
      showMessage('Đã hủy yêu cầu AI.');
    });
  }

  function pollJob() {
    if (!activeJobId) return;
    const jobId = activeJobId;
    JobDB.get(jobId).then(job => {
      if (!job) return;
      if (job.status === 'queued' || job.status === 'running') {
        renderInProgress(job);
        return;
      }
      stopPolling();
      const item = job.items && job.items[0];
      if (job.status === 'completed' && item && item.status === 'completed' && item.resultDraftId) {
        DraftDB.get(item.resultDraftId).then(draft => { if (draft) showPreview(draft); });
        return;
      }
      if (job.status === 'cancelled') { showMessage('Đã hủy yêu cầu AI.'); return; }
      renderFailed(job, item);
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollJob, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function generate() {
    const productId = currentProductId();
    if (!productId) {
      showMessage('Cần lưu sản phẩm trước (bấm "LƯU SẢN PHẨM") rồi mới dùng được AI — Plugin cần 1 sản phẩm đã có trong Product Manager.');
      return;
    }
    const user = AdminAuth.getUser();
    showMessage('Đang gửi yêu cầu AI...');
    // Permission truoc, dung 1 diem goi PluginManager (khong co duong tat
    // bo qua RBAC) - dung ham PermissionService.checkPluginExecution() ma
    // js/admin-ai.js da dung cho Dashboard ky thuat.
    PermissionService.checkPluginExecution(user.uid, user.email, MODULE_ID).then(check => {
      if (!check.granted) {
        showMessage(`Không có quyền chạy AI (thiếu "${check.permission || 'quyền chưa được gán'}").`);
        return;
      }
      // PluginDB.get(id) (dung ben trong PluginManager.loadPlugin()) khong
      // tu seed aiPlugins - chi PluginDB.getAll() moi seed (phat hien o
      // Sprint 11 Requirement #1). Product Form co the la trang AI DAU
      // TIEN Founder mo (chua tung qua Dashboard ky thuat) nen goi
      // loadPlugins() 1 lan truoc de dam bao da seed - khong sua
      // plugin-manager.js/plugin-db.js.
      return PluginManager.loadPlugins().then(() => PluginManager.loadPlugin(MODULE_ID)).then(plugin => {
        if (!plugin) { showMessage('Không tìm thấy Plugin AI "Product Description Generator".'); return; }
        return plugin.execute([{ productId, tone: 'Chuyên nghiệp' }], user.uid, user.email).then(job => {
          activeJobId = job.id;
          return AIJobQueue.resume(user.uid, user.email);
        }).then(() => { pollJob(); startPolling(); });
      });
    }).catch(err => showMessage('Lỗi: ' + err.message));
  }

  function init() {
    const btn = document.getElementById('pAiAssistBtn');
    if (btn) btn.addEventListener('click', generate);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => ProductAIAssist.init());
