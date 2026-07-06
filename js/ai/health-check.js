/*
 * HealthCheck — Sprint 5 Requirement #1. Xác minh nhanh toàn bộ chuỗi
 * AI Provider → Cloud Function → OpenAI API → Queue → Draft Workflow đang
 * hoạt động, phục vụ Administrator kiểm tra Production. KHÔNG tạo Job,
 * KHÔNG tạo Draft, KHÔNG Publish, KHÔNG tiêu tốn token ngoài mức tối thiểu.
 *
 * Tái sử dụng ĐÚNG API/Service đã có, không phát sinh Business Logic mới:
 * - AI Provider: gọi `AIProviderRegistry.get(id).health()` (Sprint 3
 *   Requirement #1) — bản thân health() của OpenAI đã gọi Cloud Function
 *   Proxy → OpenAI (GET /v1/models, không tốn token completion nào) trong
 *   1 lượt, nên 1 lời gọi này xác minh đủ cả 3 lớp "AI Provider hoạt động",
 *   "Cloud Function phản hồi", "OpenAI API kết nối thành công".
 * - Queue: CHỈ ĐỌC `JobDB.getAll()` (js/ai/ai-db.js) — không gọi
 *   AIJobQueue.enqueue()/resume()/cancel() nào, không tạo/chạy Job nào.
 *   "Sẵn sàng" ở đây nghĩa là node Firebase `aiJobs` mà Queue dùng đọc được.
 * - Draft Workflow: CHỈ ĐỌC `DraftDB.getAll()` — không tạo/publish Draft nào.
 *
 * Không thay đổi AI Task Router/Plugin Manager/Provider Manager/Permission
 * Service/Queue — file này không import/gọi bất kỳ hàm ghi nào của chúng.
 */
const HealthCheck = (function () {
  function checkProvider(providerId) {
    const provider = typeof AIProviderRegistry !== 'undefined' ? AIProviderRegistry.get(providerId) : null;
    if (!provider || !provider.health) {
      return Promise.resolve({ ok: false, message: 'Provider "' + providerId + '" chưa đăng ký hoặc chưa hỗ trợ kiểm tra kết nối.' });
    }
    return provider.health()
      .then(result => ({ ok: !!result.healthy, message: result.message || (result.healthy ? 'OK' : 'Không rõ nguyên nhân.') }))
      .catch(err => ({ ok: false, message: 'Lỗi khi kiểm tra Provider: ' + err.message }));
  }

  function checkQueue() {
    return JobDB.getAll()
      .then(() => ({ ok: true, message: 'Kết nối tới Job Queue (node aiJobs) thành công.' }))
      .catch(err => ({ ok: false, message: 'Không đọc được Job Queue (aiJobs): ' + err.message }));
  }

  function checkDraftWorkflow() {
    return DraftDB.getAll()
      .then(() => ({ ok: true, message: 'Kết nối tới Draft Workflow (node aiDrafts) thành công.' }))
      .catch(err => ({ ok: false, message: 'Không đọc được Draft Workflow (aiDrafts): ' + err.message }));
  }

  // run(providerId) — chạy đồng thời 3 nhánh (đều chỉ đọc, an toàn song
  // song), trả về báo cáo đầy đủ cho UI. Không hardcode 1 loại Provider cụ
  // thể — providerId truyền vào từ nơi gọi (NFR "không phụ thuộc loại AI
  // Provider").
  function run(providerId) {
    return Promise.all([
      checkProvider(providerId),
      checkQueue(),
      checkDraftWorkflow()
    ]).then(([provider, queue, draftWorkflow]) => ({
      provider, queue, draftWorkflow,
      overallHealthy: provider.ok && queue.ok && draftWorkflow.ok,
      checkedAt: Date.now()
    }));
  }

  return { run };
})();
