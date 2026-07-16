/*
 * shared/rateLimit.js — Rate Limiter (Sprint 14 Phase 1, FINAL mục 7). Dùng
 * Firebase RTDB làm bộ đếm (dự án không có Firestore/Redis) — cùng kiểu
 * transaction() đã dùng cho aiJobs lock (Sprint 8 Req #3), đảm bảo đếm đúng
 * dù nhiều Cloud Function instance chạy song song. Node riêng `rateLimits/`
 * — KHÔNG đụng tới `aiJobs`/node nào Frontend cũ đang đọc.
 */
const admin = require('firebase-admin');

// LIMITS — đúng con số đã định ở FINAL mục 7. windowMs = cửa sổ tính giới
// hạn (ms), max = số request tối đa trong cửa sổ đó.
const LIMITS = {
  public: { windowMs: 60 * 1000, max: 60 },              // 60 req/phút/IP
  authenticated: { windowMs: 60 * 1000, max: 120 },        // 120 req/phút/uid
  aiGenerate: { windowMs: 60 * 1000, max: 10 },             // 10 req/phút/uid
  aiGenerateDaily: { windowMs: 24 * 60 * 60 * 1000, max: 100 }, // 100 req/ngày/uid
  structuralWrite: { windowMs: 60 * 60 * 1000, max: 20 },   // 20 req/giờ/uid
  repair: { windowMs: 60 * 60 * 1000, max: 5 },             // 5 req/giờ/uid
  healthPublic: { windowMs: 60 * 1000, max: 300 }           // 300 req/phút/IP
};

// checkAndIncrement — 1 bucket THEO CỬA SỔ CỐ ĐỊNH (fixed window), đơn giản
// và đủ đúng cho Phase 1 hạ tầng (không cần sliding-window phức tạp hơn).
// key: định danh duy nhất (vd "uid:xxx:aiGenerate" hoặc "ip:1.2.3.4:public").
async function checkAndIncrement(key, limitName) {
  const limit = LIMITS[limitName];
  if (!limit) throw new Error('Rate limit "' + limitName + '" không tồn tại.');
  const windowId = Math.floor(Date.now() / limit.windowMs);
  const ref = admin.database().ref('rateLimits/' + limitName + '/' + safeKey(key) + '/' + windowId);
  const result = await ref.transaction(current => (current || 0) + 1);
  const count = result.snapshot.val();
  // Dọn cửa sổ cũ (best-effort, không chặn request nếu lỗi) — tránh rateLimits/ phình vô hạn.
  ref.parent.once('value').then(snap => {
    const val = snap.val();
    if (!val) return;
    Object.keys(val).forEach(w => {
      if (Number(w) < windowId) ref.parent.child(w).remove().catch(() => {});
    });
  }).catch(() => {});
  return { allowed: count <= limit.max, count, max: limit.max, windowMs: limit.windowMs };
}

function safeKey(key) {
  return String(key).replace(/[.#$/[\]]/g, '_');
}

module.exports = { checkAndIncrement, LIMITS };
