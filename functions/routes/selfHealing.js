/*
 * routes/selfHealing.js — Sprint 14 Phase 6 (FINAL mục 13). `GET
 * /v1/{module}/status`, `POST /v1/{module}/validate`, `POST
 * /v1/{module}/repair` cho queue/drafts/media/rules/ai-provider (Facebook
 * có route riêng trong routes/facebook.js — cùng module đã sở hữu domain
 * đó từ Phase 3). Cộng `GET /v1/system/diagnostics` (tổng hợp toàn bộ
 * module 1 lần — phục vụ "Detect Errors/Find Root Cause" của OpenClaw) và
 * `GET /v1/system/jobs/monitor` ("Job Monitor"). `POST /v1/queue/retry` —
 * ĐÚNG "Reconcile với Jobs Retry" mục 13: alias gọi lại `retryFailed()` đã
 * có (routes/jobsLogs.js), KHÔNG viết logic retry thứ 2.
 *
 * Admin-only cho mọi route (Repair/Validate là hành động vận hành nhạy
 * cảm — đúng "ADMIN ONLY" mục 6.2 tài liệu FINAL cho repair, áp dụng nhất
 * quán cho status/validate/diagnostics/monitor trong module này).
 */
const selfHealing = require('../shared/selfHealing');
const listResource = require('../shared/listResource');
const jobsLogs = require('./jobsLogs');
const { defineSecret } = require('firebase-functions/params');

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

function isAdmin(auth) {
  return auth.ok && auth.role === 'admin';
}

function openaiConfigured() {
  try { return !!OPENAI_API_KEY.value(); } catch (e) { return false; }
}

const MODULE_FNS = {
  queue: { status: selfHealing.queueStatus, validate: selfHealing.queueValidate, repair: selfHealing.queueRepair },
  drafts: { status: selfHealing.draftsStatus, validate: selfHealing.draftsValidate, repair: selfHealing.draftsRepair },
  media: { status: selfHealing.mediaStatus, validate: selfHealing.mediaValidate, repair: selfHealing.mediaRepair },
  rules: { status: selfHealing.rulesStatus, validate: selfHealing.rulesValidate, repair: selfHealing.rulesRepair },
  'ai-provider': {
    status: () => selfHealing.aiProviderStatus(openaiConfigured()),
    validate: () => selfHealing.aiProviderValidate(openaiConfigured()),
    repair: selfHealing.aiProviderRepair
  }
};

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;

  if (path === '/v1/queue/retry' && req.method === 'POST') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được Retry Queue.');
    const jobs = await listResource.getAll('aiJobs');
    const failed = jobs.filter(j => j.status === 'failed');
    const results = [];
    for (const j of failed) {
      const updated = await jobsLogs.retryFailed(j.id);
      results.push({ jobId: j.id, retried: !!updated });
    }
    return sendSuccess(res, { retried: results.length > 0, jobs: results });
  }

  if (path === '/v1/system/diagnostics' && req.method === 'GET') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem Diagnostics.');
    const [queue, drafts, media, rules, aiProvider] = await Promise.all([
      selfHealing.queueStatus(), selfHealing.draftsStatus(), selfHealing.mediaStatus(),
      selfHealing.rulesStatus(), selfHealing.aiProviderStatus(openaiConfigured())
    ]);
    const modules = { queue, drafts, media, rules, aiProvider };
    const degraded = Object.keys(modules).filter(k => modules[k].status !== 'ok');
    return sendSuccess(res, { overallStatus: degraded.length ? 'degraded' : 'ok', degradedModules: degraded, modules });
  }

  if (path === '/v1/system/jobs/monitor' && req.method === 'GET') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem Job Monitor.');
    const jobs = await listResource.getAll('aiJobs');
    const now = Date.now();
    const byStatus = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    let oldestQueuedAgeMs = null;
    const stuck = [];
    jobs.forEach(j => {
      if (byStatus[j.status] !== undefined) byStatus[j.status]++;
      if (j.status === 'queued' && j.createdAt) {
        const age = now - j.createdAt;
        if (oldestQueuedAgeMs === null || age > oldestQueuedAgeMs) oldestQueuedAgeMs = age;
      }
      if (j.status === 'running' && j.startedAt && (now - j.startedAt) > 10 * 60 * 1000) {
        stuck.push({ jobId: j.id, moduleId: j.moduleId, runningForMs: now - j.startedAt });
      }
    });
    return sendSuccess(res, { totalJobs: jobs.length, byStatus, oldestQueuedAgeMs, stuckJobs: stuck });
  }

  const match = path.match(/^\/v1\/(queue|drafts|media|rules|ai-provider)\/(status|validate|repair)$/);
  if (!match) return null;
  const [, moduleName, action] = match;
  if (action === 'status' && req.method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', 'status chỉ hỗ trợ GET.');
  if (action !== 'status' && req.method !== 'POST') return sendError(res, 'METHOD_NOT_ALLOWED', action + ' chỉ hỗ trợ POST.');
  if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được dùng Self-Healing API.');

  const result = await MODULE_FNS[moduleName][action]();
  return sendSuccess(res, result);
}

module.exports = { handle };
