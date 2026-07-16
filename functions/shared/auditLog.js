/*
 * shared/auditLog.js — Audit Log (Sprint 14 Phase 1, FINAL mục 0 nguyên tắc
 * #4, mục 9 Request Flow). Node RIÊNG `apiAuditLog` — KHÔNG dùng chung
 * `aiLogs` (node đó thuộc AI Plugin Framework cũ, Phase 4 mới đụng tới, giữ
 * tách biệt để không lẫn log hạ tầng mới với log nghiệp vụ AI cũ).
 */
const admin = require('firebase-admin');

// logIntent — ghi TRƯỚC KHI thực thi hành động rủi ro cao (FINAL mục 9: "Action
// rủi ro cao: ghi Audit Log Ý ĐỊNH TRƯỚC KHI thực thi — có vết dù request
// timeout/crash giữa chừng"). Trả về key để logResult() cập nhật lại đúng bản ghi.
async function logIntent({ uid, email, action, requestId, details }) {
  const ref = admin.database().ref('apiAuditLog').push();
  await ref.set({
    uid: uid || null,
    email: email || null,
    action,
    requestId: requestId || null,
    details: details || null,
    intentAt: admin.database.ServerValue.TIMESTAMP,
    status: 'pending'
  });
  return ref.key;
}

async function logResult(key, { status, resultDetails }) {
  if (!key) return;
  await admin.database().ref('apiAuditLog/' + key).update({
    status,
    resultDetails: resultDetails || null,
    resolvedAt: admin.database.ServerValue.TIMESTAMP
  });
}

// logSimple — ghi 1 lần cho hành động KHÔNG thuộc nhóm rủi ro cao (không cần
// tách intent/result 2 bước) — vd log mọi request bị Permission từ chối.
async function logSimple({ uid, email, action, requestId, status, details }) {
  await admin.database().ref('apiAuditLog').push({
    uid: uid || null,
    email: email || null,
    action,
    requestId: requestId || null,
    status,
    details: details || null,
    at: admin.database.ServerValue.TIMESTAMP
  });
}

module.exports = { logIntent, logResult, logSimple };
