/*
 * shared/selfHealing.js — Sprint 14 Phase 6 (FINAL mục 13, Self-Healing API
 * — Validate/Repair/Retry/Status theo Ma trận trạng thái theo module).
 *
 * NGUYÊN TẮC BẮT BUỘC (mục 13, kế thừa "No Self-Auto-Fix" từ Cowork
 * Constitution — Founder xác nhận lại khi giao Phase 6): "Self-Healing =
 * chẩn đoán + đề xuất, KHÔNG PHẢI quyền tự sửa." `repair()` CHỈ chạy khi có
 * 1 request rõ ràng gọi tới (qua routes/selfHealing.js) — KHÔNG có job nền/
 * schedule/trigger nào tự gọi các hàm này. Trong `repair()`, hành động nào
 * đụng tới DỮ LIỆU NGHIỆP VỤ THẬT (Draft/Product...) KHÔNG được tự thực thi
 * — trả về `{repaired:false, requiresApproval:true, proposedAction}` cho
 * Founder tự quyết định. CHỈ hành động hạ tầng thuần (release lock quá TTL,
 * xoá OAuth state nonce hết hạn, refresh token sắp hết hạn qua đúng API đã
 * có) được coi "an toàn" và tự thực thi khi được gọi.
 */
const admin = require('firebase-admin');
const listResource = require('./listResource');

const JOB_LOCK_TTL_MS = 5 * 60 * 1000; // khớp js/ai/job-queue.js LOCK_TTL_MS
const JOB_STUCK_RUNNING_MS = 10 * 60 * 1000; // "running" quá 10 phút coi là kẹt
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // nonce OAuth Facebook chỉ sống trong 1 lượt đăng nhập

const VALID_TARGET_COLLECTIONS = new Set(['blogPosts', 'products', 'banners', 'siteContent.heroSlides']);

// ── Queue (Job Queue — aiJobs) ──────────────────────────────────────────
async function queueStatus() {
  const jobs = await listResource.getAll('aiJobs');
  const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, other: 0 };
  const now = Date.now();
  let stuck = 0;
  jobs.forEach(j => {
    counts[j.status] !== undefined ? counts[j.status]++ : counts.other++;
    if (j.status === 'running' && j.startedAt && (now - j.startedAt) > JOB_STUCK_RUNNING_MS) stuck++;
  });
  const status = stuck > 0 ? 'degraded' : 'ok';
  return { status, details: { counts, stuckRunning: stuck, totalJobs: jobs.length } };
}

async function queueValidate() {
  const jobs = await listResource.getAll('aiJobs');
  const issues = [];
  const now = Date.now();
  jobs.forEach(j => {
    if (j.lock && j.lock.lockedAt && (now - j.lock.lockedAt) > JOB_LOCK_TTL_MS) {
      issues.push({ jobId: j.id, issue: 'lock quá TTL (' + Math.round((now - j.lock.lockedAt) / 1000) + 's)', safe: true });
    }
    if (j.status === 'running' && j.startedAt && (now - j.startedAt) > JOB_STUCK_RUNNING_MS) {
      issues.push({ jobId: j.id, issue: 'status "running" quá ' + Math.round(JOB_STUCK_RUNNING_MS / 60000) + ' phút, có thể đã kẹt', safe: true });
    }
  });
  return { valid: issues.length === 0, issues };
}

// repair — CHỈ hành động hạ tầng thuần: nhả lock quá TTL, đưa job "running"
// kẹt quá lâu về lại "queued" để lần resume() kế tiếp thử lại — KHÔNG chạm
// vào nội dung/kết quả Job, KHÔNG tự publish/reject Draft nào.
async function queueRepair() {
  const jobs = await listResource.getAll('aiJobs');
  const now = Date.now();
  const actions = [];
  for (const j of jobs) {
    const lockStale = j.lock && j.lock.lockedAt && (now - j.lock.lockedAt) > JOB_LOCK_TTL_MS;
    const stuckRunning = j.status === 'running' && j.startedAt && (now - j.startedAt) > JOB_STUCK_RUNNING_MS;
    if (lockStale || stuckRunning) {
      await admin.database().ref('aiJobs/' + j.id + '/lock').remove();
      if (stuckRunning) await listResource.update('aiJobs', j.id, { status: 'queued' });
      actions.push({ jobId: j.id, action: stuckRunning ? 'released lock + reset to queued' : 'released stale lock' });
    }
  }
  return { repaired: actions.length > 0, actions };
}

// ── Drafts (Draft/Publish) — CHỈ chẩn đoán, KHÔNG tự sửa dữ liệu nghiệp vụ ──
async function draftsStatus() {
  const drafts = await listResource.getAll('aiDrafts');
  const counts = { draft: 0, published: 0, rejected: 0, other: 0 };
  drafts.forEach(d => { counts[d.status] !== undefined ? counts[d.status]++ : counts.other++; });
  return { status: 'ok', details: { counts, total: drafts.length } };
}

async function draftsValidate() {
  const drafts = await listResource.getAll('aiDrafts');
  const issues = [];
  drafts.forEach(d => {
    if (d.targetCollection && !VALID_TARGET_COLLECTIONS.has(d.targetCollection)) {
      issues.push({ draftId: d.id, issue: 'targetCollection không hợp lệ: "' + d.targetCollection + '"', safe: false });
    }
  });
  return { valid: issues.length === 0, issues };
}

async function draftsRepair() {
  const check = await draftsValidate();
  if (!check.issues.length) return { repaired: false, actions: [] };
  // targetCollection sai là dữ liệu NGHIỆP VỤ (ảnh hưởng nơi Draft sẽ publish
  // tới) — KHÔNG tự sửa, chỉ đề xuất, đúng nguyên tắc mục 13.
  return {
    repaired: false, requiresApproval: true,
    proposedActions: check.issues.map(i => ({ draftId: i.draftId, proposedAction: 'Founder tự kiểm tra + sửa targetCollection qua Firebase Console hoặc xoá Draft nếu không còn cần.' }))
  };
}

// ── Media Library (Storage + facebookOAuthState nonce) ──────────────────
async function mediaStatus() {
  const snap = await admin.database().ref('facebookOAuthState').once('value');
  const states = snap.val() || {};
  const count = Object.keys(states).length;
  const now = Date.now();
  const expired = Object.values(states).filter(s => s && s.createdAt && (now - s.createdAt) > OAUTH_STATE_TTL_MS).length;
  return { status: expired > 0 ? 'degraded' : 'ok', details: { pendingOAuthStates: count, expiredOAuthStates: expired } };
}

async function mediaValidate() {
  const snap = await admin.database().ref('facebookOAuthState').once('value');
  const states = snap.val() || {};
  const now = Date.now();
  const issues = Object.keys(states)
    .filter(key => states[key] && states[key].createdAt && (now - states[key].createdAt) > OAUTH_STATE_TTL_MS)
    .map(key => ({ state: key, issue: 'OAuth state nonce hết hạn (quá ' + Math.round(OAUTH_STATE_TTL_MS / 60000) + ' phút chưa dùng)', safe: true }));
  return { valid: issues.length === 0, issues };
}

// repair — xoá nonce OAuth hết hạn — thuần hạ tầng, không phải dữ liệu
// nghiệp vụ, đúng ví dụ nêu tên trong tài liệu FINAL mục 13.
async function mediaRepair() {
  const snap = await admin.database().ref('facebookOAuthState').once('value');
  const states = snap.val() || {};
  const now = Date.now();
  const actions = [];
  for (const key of Object.keys(states)) {
    if (states[key] && states[key].createdAt && (now - states[key].createdAt) > OAUTH_STATE_TTL_MS) {
      await admin.database().ref('facebookOAuthState/' + key).remove();
      actions.push({ state: key, action: 'xoá OAuth state nonce hết hạn' });
    }
  }
  return { repaired: actions.length > 0, actions };
}

// ── Firebase Rules — KHÔNG thể tự xác minh/tự deploy (thay đổi cấu hình
// bảo mật hệ thống — Claude không tự ý thực hiện, đã ghi nhận ROADMAP.md) ──
async function rulesStatus() {
  return { status: 'unknown', details: { message: 'Không thể tự xác minh Rules đang chạy thật trên Production từ Cloud Function này — xem ROADMAP.md mục Risk #1. Founder tự xác nhận qua Firebase Console.' } };
}
async function rulesValidate() {
  return { valid: null, issues: [{ issue: 'Không thể tự kiểm tra — cần Founder xác nhận qua Firebase Console.', safe: false }] };
}
async function rulesRepair() {
  return { repaired: false, requiresApproval: true, proposedActions: [{ proposedAction: 'Deploy database.rules.json/storage.rules là thay đổi cấu hình bảo mật — Founder tự thực hiện qua Firebase Console hoặc CLI, Claude không tự động deploy.' }] };
}

// ── AI Provider (OpenAI qua OPENAI_API_KEY) ──────────────────────────────
async function aiProviderStatus(openaiApiKeyConfigured) {
  return { status: openaiApiKeyConfigured ? 'ok' : 'down', details: { openaiApiKeyConfigured } };
}
async function aiProviderValidate(openaiApiKeyConfigured) {
  const issues = openaiApiKeyConfigured ? [] : [{ issue: 'OPENAI_API_KEY chưa cấu hình trong Secret Manager.', safe: false }];
  return { valid: issues.length === 0, issues };
}
async function aiProviderRepair() {
  return { repaired: false, requiresApproval: true, proposedActions: [{ proposedAction: 'Cấu hình OPENAI_API_KEY qua Firebase Secret Manager — Founder tự thực hiện, Claude không tự đặt API Key mới.' }] };
}

module.exports = {
  queueStatus, queueValidate, queueRepair,
  draftsStatus, draftsValidate, draftsRepair,
  mediaStatus, mediaValidate, mediaRepair,
  rulesStatus, rulesValidate, rulesRepair,
  aiProviderStatus, aiProviderValidate, aiProviderRepair
};
