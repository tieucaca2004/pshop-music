/*
 * WorkflowInsightsService — Sprint 7 Requirement #5 (AI Workflow Insights).
 * Cho Administrator quan sát toàn bộ vòng đời của 1 AI Request — Context →
 * Queue → Provider → Draft → Human Review → Final Status — trên 1 màn
 * hình, ghép lại từ đúng dữ liệu đã có (`aiJobs`/`aiLogs`/`aiDrafts`), HOÀN
 * TOÀN CHỈ ĐỌC. Đây là công cụ QUAN SÁT (Observability) — không phát sinh
 * Business Logic mới, không thêm Field/Collection nào.
 *
 * Định nghĩa 1 "AI Request" ở đây = 1 `aiJobs` record (đúng đơn vị Admin đã
 * tạo ra khi bấm "Chạy" 1 Plugin/1 Step Workflow — Sprint 2 Requirement #6),
 * CỘNG THÊM các lượt bị từ chối quyền (`aiLogs` có `status:'permission_denied'`
 * và `jobId:null` — AI_RULES.md mục 8: từ chối quyền thì Queue chưa từng
 * được gọi tới nên không có Job nào, chỉ có đúng 1 dòng Log).
 *
 * Vì Queue/Database Structure không đổi, Timeline chỉ hiển thị đúng độ chi
 * tiết THẬT SỰ có sẵn: `createdAt`/`startedAt`/`finishedAt` của Job (Queue
 * wait/Processing/Total), `durationMs` của từng `aiLogs` entry khớp Job đó
 * (thời gian combined của Context + Provider + tạo Draft cho 1 item — Queue
 * không ghi tách riêng từng giai đoạn con). Không suy đoán thêm số liệu nào
 * ngoài dữ liệu đã ghi.
 */
const WorkflowInsightsService = (function () {
  const RANGE_DAYS = { today: 0, '7d': 7, '30d': 30 };

  // Trùng lặp có chủ đích với rangeStartMs() nội bộ của usage-stats.js/
  // cost-tracking.js — không export hàm đó nên không tái sử dụng trực tiếp
  // được; giữ nguyên 2 file đó, không sửa.
  function rangeStartMs(rangeKey) {
    if (rangeKey === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    const days = RANGE_DAYS[rangeKey] || 30;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }

  // buildJobRequest() không bao giờ throw — mọi field đọc qua "|| null/[]"
  // để thiếu dữ liệu vẫn ra 1 Request hợp lệ (Functional Requirement #6:
  // hiển thị "Unknown" ở UI thay vì System Error, không phải lỗi ở tầng này).
  function buildJobRequest(job, logsByJobId, draftsById) {
    const logs = (logsByJobId[job.id] || []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const items = (job.items || []).map((item, index) => ({
      status: item.status || 'unknown',
      error: item.error || null,
      inputParams: item.inputParams || {},
      draft: item.resultDraftId ? (draftsById[item.resultDraftId] || null) : null,
      // Khớp theo thứ tự xử lý tuần tự (processSequentially() trong
      // job-queue.js xử lý + ghi Log lần lượt đúng thứ tự items) — Log
      // không lưu itemIndex riêng nên đây là cách khớp tốt nhất có thể với
      // dữ liệu hiện có, không phải khớp tuyệt đối theo khoá.
      log: logs[index] || null
    }));

    return {
      id: job.id,
      type: 'job',
      moduleId: job.moduleId || null,
      provider: job.provider || null,
      finalStatus: job.status || 'unknown',
      createdAt: job.createdAt || null,
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
      queueWaitMs: (job.startedAt != null && job.createdAt != null) ? Math.max(0, job.startedAt - job.createdAt) : null,
      processingMs: (job.finishedAt != null && job.startedAt != null) ? Math.max(0, job.finishedAt - job.startedAt) : null,
      totalMs: (job.finishedAt != null && job.createdAt != null) ? Math.max(0, job.finishedAt - job.createdAt) : null,
      items,
      sortTime: job.createdAt || 0
    };
  }

  function buildPermissionDeniedRequest(log) {
    return {
      id: 'log-' + log.id,
      type: 'permission_denied',
      moduleId: log.moduleId || null,
      provider: null,
      finalStatus: 'permission_denied',
      createdAt: log.timestamp || null,
      startedAt: null,
      finishedAt: log.timestamp || null,
      queueWaitMs: null,
      processingMs: null,
      totalMs: 0,
      items: [{ status: 'permission_denied', error: log.errorMessage || null, inputParams: {}, draft: null, log }],
      sortTime: log.timestamp || 0
    };
  }

  // compute(rangeKey) -> Promise<{ requests, total }>. Mỗi nguồn đọc
  // (Job/Log/Draft) tự bắt lỗi riêng — 1 nguồn lỗi không làm hỏng toàn bộ
  // Insights, đúng NFR "chỉ đọc dữ liệu" + không phát sinh System Error.
  function compute(rangeKey) {
    return Promise.all([
      JobDB.getAll().catch(() => []),
      LogDB.getAll().catch(() => []),
      DraftDB.getAll().catch(() => [])
    ]).then(([jobs, logs, drafts]) => {
      const since = rangeStartMs(rangeKey);
      const draftsById = {};
      drafts.forEach(d => { draftsById[d.id] = d; });

      const logsByJobId = {};
      logs.forEach(l => {
        if (!l.jobId) return;
        (logsByJobId[l.jobId] = logsByJobId[l.jobId] || []).push(l);
      });

      const jobRequests = jobs
        .filter(j => (j.createdAt || 0) >= since)
        .map(j => buildJobRequest(j, logsByJobId, draftsById));

      const permissionDeniedRequests = logs
        .filter(l => !l.jobId && l.status === 'permission_denied' && (l.timestamp || 0) >= since)
        .map(buildPermissionDeniedRequest);

      const requests = jobRequests.concat(permissionDeniedRequests).sort((a, b) => b.sortTime - a.sortTime);

      return { requests, total: requests.length };
    });
  }

  return { compute };
})();
