/*
 * shared/asyncJob.js — Async Job Framework (Sprint 14 Phase 1, FINAL mục
 * 10, 14). Node RIÊNG `apiAsyncJobs` — CỐ Ý tách khỏi `aiJobs` (AIJobQueue
 * cũ, js/ai/job-queue.js) vì đó là hàng đợi NGHIỆP VỤ AI đã kiểm chứng 13
 * Sprint, Phase 1 không được đụng vào/regressiontest lại nó. Khung này chỉ
 * cung cấp create/get/update GENERIC — chưa gắn với bất kỳ nghiệp vụ nào
 * (Products/AI Generate...) cho tới Phase 2+.
 */
const admin = require('firebase-admin');

async function createJob({ uid, type, payload, webhookUrl }) {
  const ref = admin.database().ref('apiAsyncJobs').push();
  const job = {
    type,
    uid: uid || null,
    payload: payload || null,
    webhookUrl: webhookUrl || null,
    status: 'queued',
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  };
  await ref.set(job);
  return Object.assign({ id: ref.key }, job);
}

async function getJob(jobId) {
  const snap = await admin.database().ref('apiAsyncJobs/' + jobId).once('value');
  if (!snap.exists()) return null;
  return Object.assign({ id: jobId }, snap.val());
}

async function updateJobStatus(jobId, status, resultOrError) {
  const patch = { status, updatedAt: admin.database.ServerValue.TIMESTAMP };
  if (status === 'completed') patch.result = resultOrError || null;
  if (status === 'failed') patch.error = (resultOrError && resultOrError.message) || String(resultOrError || 'Lỗi không rõ');
  await admin.database().ref('apiAsyncJobs/' + jobId).update(patch);
  return getJob(jobId);
}

module.exports = { createJob, getJob, updateJobStatus, updateWorkflowState, appendExecutionLog, getWorkflowConfig };

/**
 * WORKFLOW-02 Orchestration & Execution (directive 17:06).
 * Mở rộng khung asyncJob để Workflow Engine thành Orchestrator thật sự:
 *   - Workflow State bền (QUEUED/RUNNING/WAITING/PAUSED/RETRYING/FAILED/CANCELLED/COMPLETED)
 *   - Execution Log bền từng step (start/finish/duration/input/output/error/retry)
 *   - Resume từ step cuối sau worker/server restart (không chạy lại từ đầu)
 *   - Workflow Config đọc từ Firebase (không hardcode)
 * Tất cả lưu trong node apiAsyncJobs/{jobId} (worker RTDB onValueCreated đã lắng nghe) —
 * không tạo hệ thống/engine mới.
 */

// Workflow State & Step State (enum — tài liệu trạng thái hợp lệ)
async function updateWorkflowState(jobId, state, extra) {
  const patch = Object.assign({
    workflowState: state,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  }, extra || {});
  await admin.database().ref('apiAsyncJobs/' + jobId).update(patch);
  return getJob(jobId);
}

/**
 * appendExecutionLog(jobId, entry) — ghi 1 dòng log cho 1 step.
 * entry = { stepIndex, moduleId, status, startedAt, finishedAt, durationMs, input, output, error, retry }
 * Không mất log khi restart (lưu RTDB).
 */
async function appendExecutionLog(jobId, entry) {
  const patch = {};
  patch['executionLog/' + (entry.stepIndex || 0)] = Object.assign({ timestamp: admin.database.ServerValue.TIMESTAMP }, entry);
  await admin.database().ref('apiAsyncJobs/' + jobId).update(patch);
  return getJob(jobId);
}

/**
 * getWorkflowConfig(name) — đọc workflow definition từ Firebase node
 * `workflowConfigs/{name}`. Nếu chưa có, trả default (vẫn tương thích cũ).
 * Founder đổi workflow bằng cách ghi node này mà không cần sửa code.
 */
async function getWorkflowConfig(name) {
  const snap = await admin.database().ref('workflowConfigs/' + name).once('value');
  if (snap.exists()) return snap.val();
  // Default: chuỗi cũ (tương thích) — README/knowledge sẽ hướng dẫn ghi config
  // FIX: moduleId ở đây phải khớp ĐÚNG key thật trong MODULES
  // (shared/aiModulesCore.js) — trước đây dùng 'product-content'/'blog-post'/
  // 'facebook-post'/'banner', không key nào tồn tại trong MODULES (thật ra
  // là 'product-description-writer'/'blog-writer'/'facebook-post-generator'/
  // 'banner-generator') — aiGenerateWorker ném "Không nhận diện được module
  // AI" ngay ở step 0 và FAILED cả workflow, không bao giờ chạy tới Blog/
  // Facebook/Banner.
  return {
    id: 'product-auto',
    description: 'Product publish → Auto content workflow',
    steps: [
      { type: 'generation', moduleId: 'product-description-writer' },
      { type: 'generation', moduleId: 'blog-writer' },
      { type: 'generation', moduleId: 'facebook-post-generator' },
      { type: 'generation', moduleId: 'banner-generator' }
    ]
  };
}
