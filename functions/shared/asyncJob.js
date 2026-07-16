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

module.exports = { createJob, getJob, updateJobStatus };
