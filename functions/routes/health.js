// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/health.js — Health API (Sprint 14 Phase 1, FINAL mục 12). 2 tầng:
 * publicHealth (GET /v1/health, KHÔNG cần token — cho uptime monitor/load
 * balancer) và systemHealth (GET /v1/system/health, cần token + Admin, chi
 * tiết đầy đủ). Đây là kiểm tra HẠ TẦNG (RTDB reachable, OpenAI Secret có
 * cấu hình chưa) — KHÔNG kiểm tra module nghiệp vụ nào (Products/AI
 * Generate...) vì chưa xây ở Phase 1.
 */
const admin = require('firebase-admin');

async function publicHealth() {
  try {
    // Kiểm tra RTDB reachable — đọc 1 node nhẹ, không lộ dữ liệu thật.
    await admin.database().ref('.info/connected').once('value');
    return { healthy: true, status: 'ok' };
  } catch (err) {
    return { healthy: false, status: 'down', message: err.message };
  }
}

async function systemHealth(openaiApiKeyConfigured) {
  const checks = {};

  try {
    const start = Date.now();
    await admin.database().ref('.info/connected').once('value');
    checks.firebaseRtdb = { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    checks.firebaseRtdb = { healthy: false, message: err.message };
  }

  checks.openaiSecretConfigured = { healthy: !!openaiApiKeyConfigured };

  try {
    await admin.storage().bucket().getMetadata();
    checks.firebaseStorage = { healthy: true };
  } catch (err) {
    checks.firebaseStorage = { healthy: false, message: err.message };
  }

  const allHealthy = Object.keys(checks).every(k => checks[k].healthy);
  return { healthy: allHealthy, status: allHealthy ? 'ok' : 'degraded', checks, checkedAt: new Date().toISOString() };
}

module.exports = { publicHealth, systemHealth };
