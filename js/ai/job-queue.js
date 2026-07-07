/*
 * AIJobQueue — xử lý tuần tự các aiJobs (V1: chạy phía trình duyệt Admin,
 * xem Roadmap trong README.md để biết hướng nâng cấp lên Cloud Functions ở
 * V2 mà không cần đổi hàm enqueue/resume/cancel bên dưới — admin/ai/*.html
 * chỉ gọi qua các hàm này, không biết/không phụ thuộc cách xử lý bên trong).
 *
 * Luồng xử lý đúng theo AI_RULES.md: AI Plugin → DataProvider → Context →
 * AI Provider → Draft. Từng item trong job đi qua: module.loadContext()
 * (đọc CMS thật qua DataProvider) → module.buildPrompt() →
 * AIProviderRegistry.resolveForPlugin() (Provider Manager chọn provider) →
 * provider.validate() → provider.generate() → module.mapToDraftContent() →
 * DraftDB.add() (không bao giờ ghi thẳng vào collection gốc). Mọi bước —
 * kể cả thất bại vì chưa cấu hình provider — đều được ghi vào LogDB.
 *
 * Concurrency Safety (Sprint 8, Requirement #3) — xem Decision Record trong
 * CHANGELOG.md: biến `processing` bên dưới chỉ chặn được resume() gọi trùng
 * TRONG CÙNG 1 tab (đứng yên qua các lần gọi lại), không đồng bộ được giữa
 * nhiều tab/phiên Admin khác nhau. Để chặn 2 phiên cùng xử lý trùng 1 job,
 * mỗi job giữ thêm 1 "khoá mềm" tại `aiJobs/{jobId}/lock` (`lockedBy` +
 * `lockedAt`), giành khoá bằng `firebase.database().ref(...).transaction()`
 * (nguyên tử thật sự ở tầng Firebase, không phải đọc-rồi-ghi như
 * JobDB.update()). Khoá tự hết hạn sau LOCK_TTL_MS nếu không được làm mới —
 * để 1 tab bị crash/đóng giữa chừng không khoá chết job mãi mãi. Không đổi
 * Database Structure các node khác, không thêm `.write`/`.validate` mới vào
 * `database.rules.json` (node `aiJobs` đã cho phép admin/editor ghi bất kỳ
 * field con nào từ Requirement #1 — xác nhận lại trước khi làm Requirement
 * này, không cần sửa Rules).
 */
const AIJobQueue = (function () {
  let processing = false;

  // Định danh phiên hiện tại (1 tab trình duyệt) — chỉ dùng để nhận diện
  // "khoá này là của chính mình" khi kiểm tra transaction, KHÔNG phải một
  // lớp bảo mật/định danh người dùng (đã có Firebase Auth lo việc đó).
  const CLIENT_ID = 'client-' + Math.random().toString(36).slice(2) + '-' + Date.now();

  // 5 phút — đủ dài cho 1 lượt xử lý item AI thật (vài giây tới vài chục
  // giây/lượt), đủ ngắn để job không bị khoá chết quá lâu nếu tab xử lý bị
  // đóng/crash giữa chừng.
  const LOCK_TTL_MS = 5 * 60 * 1000;

  function lockRef(jobId) {
    return firebase.database().ref('aiJobs/' + jobId + '/lock');
  }

  // Giành khoá cho 1 job bằng Firebase transaction (nguyên tử thật sự — nếu
  // 2 tab cùng gọi gần như đồng thời, Firebase đảm bảo chỉ 1 bên thắng).
  // Trả về true nếu CHÍNH client này giành được khoá.
  function claimJobLock(jobId) {
    return lockRef(jobId).transaction(current => {
      if (!current || (Date.now() - current.lockedAt) > LOCK_TTL_MS) {
        return { lockedBy: CLIENT_ID, lockedAt: Date.now() };
      }
      return; // undefined = huỷ transaction, không đụng vào khoá còn "tươi" của phiên khác
    }).then(result => {
      return !!(result.committed && result.snapshot.val() && result.snapshot.val().lockedBy === CLIENT_ID);
    });
  }

  // Làm mới thời điểm khoá — gọi kèm mỗi lần job đã có ghi Firebase khác
  // (sau mỗi item), không tạo thêm round-trip riêng.
  function refreshJobLock(jobId) {
    return lockRef(jobId).child('lockedAt').set(Date.now());
  }

  function releaseJobLock(jobId) {
    return lockRef(jobId).remove();
  }

  function enqueue(moduleId, itemsInputParams, userId, userEmail) {
    const items = itemsInputParams.map(inputParams => ({
      inputParams, resultDraftId: null, status: 'queued', error: null
    }));
    return JobDB.add({
      moduleId,
      status: 'queued',
      items,
      progress: { total: items.length, done: 0, failed: 0 },
      createdBy: userId,
      createdByEmail: userEmail
    });
  }

  function logAttempt(entry) {
    return LogDB.add(Object.assign({ timestamp: Date.now(), errorMessage: '' }, entry));
  }

  function processItem(job, itemIndex, userId, userEmail) {
    const module = AIModuleRegistry.get(job.moduleId);
    const item = job.items[itemIndex];
    const startedAt = Date.now();

    if (!module) {
      item.status = 'failed';
      item.error = 'Module không tồn tại: ' + job.moduleId;
      return logAttempt({
        moduleId: job.moduleId, provider: 'none', jobId: job.id,
        durationMs: 0, status: 'failed', errorMessage: item.error, userId, userEmail
      });
    }

    let providerId = 'none';
    return Promise.resolve(module.loadContext(item.inputParams))
      .then(context => {
        const prompt = module.buildPrompt(item.inputParams, context);
        // Chọn Provider qua Provider Manager (AIProviderRegistry) — Queue
        // không tự quyết định provider nào, chỉ hỏi qua đây.
        return AIProviderRegistry.resolveForPlugin(job.moduleId).then(({ provider, config }) => {
          providerId = provider.id;
          job.provider = providerId; // Job phải lưu tối thiểu provider đã dùng
          const check = provider.validate ? provider.validate(config) : { valid: true, reason: '' };
          if (!check.valid) return Promise.reject(new Error(check.reason || 'Provider chưa sẵn sàng.'));
          return provider.generate({ moduleId: job.moduleId, prompt, params: item.inputParams, config })
            .then(output => ({ output, context }));
        });
      })
      .then(({ output, context }) => {
        const content = module.mapToDraftContent(output, item.inputParams, context);
        return DraftDB.add({
          moduleId: job.moduleId,
          targetCollection: module.targetCollection,
          targetId: item.inputParams.targetId || item.inputParams.productId || item.inputParams.postId || null,
          inputParams: item.inputParams,
          content,
          status: 'draft',
          providerUsed: providerId,
          createdBy: userId
        }).then(draft => {
          item.status = 'completed';
          item.resultDraftId = draft.id;
          return logAttempt({
            moduleId: job.moduleId, provider: providerId, jobId: job.id,
            durationMs: Date.now() - startedAt, status: 'completed', userId, userEmail
          });
        });
      })
      .catch(err => {
        item.status = 'failed';
        item.error = err.message;
        return logAttempt({
          moduleId: job.moduleId, provider: providerId, jobId: job.id,
          durationMs: Date.now() - startedAt, status: 'failed', errorMessage: err.message, userId, userEmail
        });
      });
  }

  function processSequentially(job, index, userId, userEmail) {
    return JobDB.get(job.id).then(latest => {
      if (!latest || latest.status === 'cancelled') return;
      if (index >= job.items.length) {
        // Job hoàn tất xử lý: nếu TẤT CẢ item đều lỗi thì trạng thái Job là
        // "failed" (đúng yêu cầu Queue phải phân biệt Completed/Failed ở cấp
        // Job) — nếu có ít nhất 1 item thành công thì vẫn là "completed"
        // (kèm progress.failed để biết số lượng lỗi trong lô).
        const allFailed = job.items.length > 0 && job.items.every(i => i.status === 'failed');
        job.status = allFailed ? 'failed' : 'completed';
        job.finishedAt = Date.now(); // = "completedAt" — xem AI_RULES.md mục field mapping
        return JobDB.update(job.id, job).then(() => releaseJobLock(job.id));
      }
      // Item đã xử lý xong ở lần chạy trước (resume/retry) — bỏ qua, tránh
      // tạo trùng draft cho các item đã thành công.
      if (job.items[index].status === 'completed') {
        return processSequentially(job, index + 1, userId, userEmail);
      }
      return processItem(job, index, userId, userEmail).then(() => {
        job.progress.done = job.items.filter(i => i.status === 'completed').length;
        job.progress.failed = job.items.filter(i => i.status === 'failed').length;
        // Làm mới khoá cùng lúc job đã phải ghi Firebase (sau mỗi item) —
        // không thêm round-trip riêng, giữ khoá "tươi" trong suốt job dài.
        return JobDB.update(job.id, job)
          .then(() => refreshJobLock(job.id))
          .then(() => processSequentially(job, index + 1, userId, userEmail));
      });
    });
  }

  function runJob(jobId, userId, userEmail) {
    return JobDB.get(jobId).then(job => {
      if (!job || job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') return;
      return claimJobLock(jobId).then(claimed => {
        // Không giành được khoá = 1 phiên khác đang xử lý job này rồi (khoá
        // còn "tươi", chưa hết LOCK_TTL_MS) — bỏ qua, không xử lý trùng.
        if (!claimed) return;
        job.status = 'running';
        job.startedAt = job.startedAt || Date.now();
        return JobDB.update(jobId, job).then(() => processSequentially(job, 0, userId, userEmail));
      });
    });
  }

  // Gọi khi mở admin/ai/jobs.html — tiếp tục các job còn dang dở (queued/
  // running) từ phiên trước, đúng theo giới hạn "V1: Client Queue" đã chọn.
  function resume(userId, userEmail) {
    if (processing) return Promise.resolve();
    processing = true;
    return JobDB.getAll().then(jobs => {
      const pending = jobs.filter(j => j.status === 'queued' || j.status === 'running');
      return pending.reduce((chain, job) => chain.then(() => runJob(job.id, userId, userEmail)), Promise.resolve());
    }).then(() => { processing = false; }, err => { processing = false; throw err; });
  }

  function cancel(jobId, userId, userEmail) {
    return JobDB.get(jobId).then(job => {
      return JobDB.update(jobId, { status: 'cancelled', finishedAt: Date.now() }).then(() => {
        return releaseJobLock(jobId).then(() => {
          if (!job) return;
          // Queue chịu trách nhiệm ghi Log — kể cả khi job bị hủy, không bỏ qua.
          return logAttempt({
            moduleId: job.moduleId, provider: job.provider || 'none', jobId,
            durationMs: job.startedAt ? Date.now() - job.startedAt : 0,
            status: 'cancelled', userId, userEmail
          });
        });
      });
    });
  }

  // Đặt lại các item "failed" về "queued" (giữ nguyên item đã completed),
  // để lần resume() kế tiếp chỉ thử lại đúng phần bị lỗi.
  function retryFailed(jobId) {
    return JobDB.get(jobId).then(job => {
      if (!job) return;
      job.items.forEach(item => {
        if (item.status === 'failed') {
          item.status = 'queued';
          item.error = null;
        }
      });
      job.status = 'queued';
      job.progress.failed = 0;
      job.finishedAt = null;
      // Nhả khoá cũ (nếu còn) để lần resume() kế tiếp giành lại được ngay,
      // không phải chờ LOCK_TTL_MS hết hạn.
      return JobDB.update(jobId, job).then(() => releaseJobLock(jobId));
    });
  }

  return { enqueue, resume, cancel, retryFailed };
})();
