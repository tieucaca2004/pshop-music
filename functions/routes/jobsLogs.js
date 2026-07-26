// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/jobsLogs.js — Sprint 14 Phase 3 (FINAL mục 17.15, 17.23). Queue/Jobs
 * (`aiJobs`, đúng `JobDB`) + Logs (`aiLogs`, đúng `LogDB`) + History/
 * Workflows (`founderAgentWorkflows`, đúng `WorkflowDB`). `retry`/`cancel`
 * port từ `AIJobQueue.retryFailed()`/`.cancel()` (js/ai/job-queue.js:202-236)
 * — CÙNG hành vi (retry chỉ đặt lại item `failed`→`queued`, giữ nguyên item
 * đã `completed`; cancel ghi Log `status:'cancelled'` kể cả khi Job không
 * tồn tại control path đặc biệt nào khác).
 *
 * Phân trang (mục 10): KHÔNG có tiền lệ cursor Firebase nào trong code cũ
 * (LogDB/JobDB client hiện chỉ `.getAll()` rồi `.slice()` — audit Phần 4.6
 * xác nhận) — đây là phân trang MỚI HOÀN TOÀN: cursor = timestamp phần tử
 * cuối cùng đã trả, lấy tiếp các bản ghi CŨ HƠN cursor đó, sắp mới nhất
 * trước (đúng cách 2 trang Jobs/Logs hiện tại đang hiển thị).
 *
 * `GET /v1/history/conversations` — "Suy luận từ aiJobs/aiDrafts" (mục
 * 17.23). Client hiện có `outcomeLabelForModule()` (js/admin-ai-assistant.js
 * :381-386) dịch moduleId → nhãn thân thiện qua bảng `AITaskRouter.ROUTES`/
 * `AIModuleRegistry` — CẢ 2 chỉ tồn tại phía CLIENT (metadata hiển thị,
 * không phải business logic ghi dữ liệu) — cố tình KHÔNG chép bảng đó sang
 * Backend (tránh 2 nơi cùng giữ 1 bảng nhãn, dễ lệch nhau) — endpoint này
 * trả `moduleId` thô + `targetName` (suy từ Product/Blog liên kết), client
 * tự map nhãn hiển thị như đang làm.
 */
const admin = require('firebase-admin');
const listResource = require('../shared/listResource');
const { canAccess } = require('../shared/permissions');
const asyncJob = require('../shared/asyncJob');

const JOBS_NODE = 'aiJobs';
const LOGS_NODE = 'aiLogs';
const WORKFLOWS_NODE = 'founderAgentWorkflows';

function isStaff(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

function paginate(items, sortField, req) {
  const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 200);
  const cursor = req.query && req.query.cursor ? Number(req.query.cursor) : null;
  const sorted = items.slice().sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0));
  const filtered = cursor ? sorted.filter(i => (i[sortField] || 0) < cursor) : sorted;
  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = page.length ? page[page.length - 1][sortField] || null : null;
  return { page, pagination: { cursor: hasMore ? nextCursor : null, hasMore, limit } };
}

async function releaseJobLock(jobId) {
  await admin.database().ref(JOBS_NODE + '/' + jobId + '/lock').remove();
}

async function logAttempt(entry) {
  return listResource.add(LOGS_NODE, Object.assign({ timestamp: Date.now(), errorMessage: '' }, entry));
}

async function retryFailed(jobId) {
  const job = await listResource.getOne(JOBS_NODE, jobId);
  if (!job) return null;
  const items = (job.items || []).map(item => item.status === 'failed' ? Object.assign({}, item, { status: 'queued', error: null }) : item);
  const progress = Object.assign({}, job.progress, { failed: 0 });
  await listResource.update(JOBS_NODE, jobId, { items, status: 'queued', progress, finishedAt: null });
  await releaseJobLock(jobId);
  return listResource.getOne(JOBS_NODE, jobId);
}

async function cancelJob(jobId, uid, email) {
  const job = await listResource.getOne(JOBS_NODE, jobId);
  await listResource.update(JOBS_NODE, jobId, { status: 'cancelled', finishedAt: Date.now() });
  await releaseJobLock(jobId);
  if (job) {
    await logAttempt({
      moduleId: job.moduleId, provider: job.provider || 'none', jobId,
      durationMs: job.startedAt ? Date.now() - job.startedAt : 0,
      status: 'cancelled', userId: uid, userEmail: email
    });
  }
  return listResource.getOne(JOBS_NODE, jobId);
}

async function targetNameFor(inputParams) {
  if (!inputParams) return '';
  if (inputParams.productId) {
    const p = await listResource.getOne('products', inputParams.productId);
    if (p) return p.name;
  }
  if (inputParams.postId) {
    const post = await listResource.getOne('blogPosts', inputParams.postId);
    if (post) return post.title;
  }
  return '';
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  const isJobs = path === '/v1/jobs' || path.indexOf('/v1/jobs/') === 0;
  const isLogs = path === '/v1/logs';
  const isHistory = path === '/v1/history/conversations';
  const isWorkflows = path === '/v1/workflows';
  if (!isJobs && !isLogs && !isHistory && !isWorkflows) return null;

  // Agent RBAC Foundation (Sprint 15) — "AI Jobs" trong phạm vi Founder chỉ
  // định NGHĨA LÀ chỉ xem (GET /v1/jobs, GET /v1/jobs/{id}), KHÔNG
  // retry/cancel, KHÔNG Logs/History/Workflows. Admin/Editor KHÔNG đổi hành
  // vi (isStaff() vẫn cho qua y hệt cũ, kiểm tra trước, không đụng route
  // nào không thuộc "AI Jobs" — Logs/History/Workflows/retry/cancel vẫn
  // Admin/Editor-only tuyệt đối, agent luôn bị chặn ở gate này vì
  // agentJobsView chỉ đúng khi VỪA isJobs VỪA GET).
  if (!isStaff(auth)) {
    const agentJobsView = isJobs && req.method === 'GET' && canAccess(auth, 'jobs.view');
    if (!agentJobsView) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được xem Queue/Logs/History.');
  }

  if (path === '/v1/jobs' && req.method === 'GET') {
    const all = await listResource.getAll(JOBS_NODE);
    const { page, pagination } = paginate(all, 'createdAt', req);
    return sendSuccess(res, page, { pagination });
  }

  if (isJobs && path !== '/v1/jobs') {
    const rest = path.slice('/v1/jobs/'.length);
    const [id, action] = rest.split('/');
    if (!id) return sendError(res, 'INVALID_REQUEST', 'Thiếu id Job.');

    if (!action && req.method === 'GET') {
      const job = await listResource.getOne(JOBS_NODE, id);
      if (job) return sendSuccess(res, job);
      // Sprint 15 Production Readiness Review — CRITICAL fix. `apiAsyncJobs`
      // (shared/asyncJob.js, Phase 1) là node RIÊNG, TÁCH KHỎI `aiJobs` theo
      // đúng thiết kế gốc (xem asyncJob.js đầu file) — nhưng `POST /v1/ai/
      // {module}/generate?async=true` (Phase 3, Task 3.2) trả về jobId từ
      // ĐÚNG node đó, trong khi endpoint này (trước bản sửa) CHỈ tra `aiJobs`
      // — nghĩa là KHÔNG BAO GIỜ tìm thấy Job vừa tạo qua đường async, phá vỡ
      // đúng cơ chế "poll bằng jobId" mà Task 3.2 xây ra, và khiến quyền
      // "jobs.view" vừa cấp cho agent (Agent RBAC Foundation) vô nghĩa với
      // chính Job agent tự tạo. Fallback tra thêm apiAsyncJobs — dùng ĐÚNG 1
      // endpoint đã có, không thêm route mới.
      const asyncJobRecord = await asyncJob.getJob(id);
      if (asyncJobRecord) return sendSuccess(res, asyncJobRecord);
      return sendError(res, 'NOT_FOUND', 'Không tìm thấy Job.');
    }
    if (action === 'retry' && req.method === 'POST') {
      const updated = await retryFailed(id);
      if (!updated) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Job.');
      return sendSuccess(res, updated);
    }
    if (action === 'cancel' && req.method === 'POST') {
      const updated = await cancelJob(id, auth.uid, auth.email);
      if (!updated) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Job.');
      return sendSuccess(res, updated);
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Route/method Job không hợp lệ.');
  }

  if (isLogs && req.method === 'GET') {
    const all = await listResource.getAll(LOGS_NODE);
    const { page, pagination } = paginate(all, 'timestamp', req);
    return sendSuccess(res, page, { pagination });
  }

  if (isHistory && req.method === 'GET') {
    const jobs = await listResource.getAll(JOBS_NODE);
    const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 200);
    const top = jobs.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
    const entries = [];
    for (const job of top) {
      const item = job.items && job.items[0];
      const targetName = await targetNameFor(item && item.inputParams);
      entries.push({
        jobId: job.id, createdAt: job.createdAt, moduleId: job.moduleId, targetName,
        jobStatus: job.status, resultDraftId: item && item.resultDraftId, errorMessage: item && item.error
      });
    }
    return sendSuccess(res, entries);
  }

  if (isWorkflows && req.method === 'GET') {
    const all = await listResource.getAll(WORKFLOWS_NODE);
    const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 200);
    const sorted = all.slice().sort((a, b) => (b.finishedAt || b.createdAt || 0) - (a.finishedAt || a.createdAt || 0)).slice(0, limit);
    return sendSuccess(res, sorted);
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ.');
}

module.exports = { handle, paginate, retryFailed, cancelJob };
