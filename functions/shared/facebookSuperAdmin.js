'use strict';

/*
 * psh / functions/shared/facebookSuperAdmin.js
 *
 * Kiểm tra quyền Super Admin cho các thao tác Facebook nhạy cảm.
 *
 * Nguồn sự thật DUY NHẤT là node RTDB `superAdmins/{uid}` — không hardcode
 * UID trong source, không dựa vào email client gửi lên.
 *
 * Lý do tồn tại: `validateRequest()` (index.js) và `authenticate()`
 * (shared/auth.js) chỉ kiểm `roles/{uid}` TỒN TẠI. Hiện có 23 bản ghi
 * `roles/` đều `role: 'admin'` (1 Founder + 22 tài khoản test/UAT), nên kiểm
 * `role === 'admin'` KHÔNG giới hạn được ai. Phải dùng lớp riêng.
 *
 * Node `superAdmins/` đã tồn tại thật, chỉ chứa đúng 1 UID Founder, cấu trúc:
 *   superAdmins/{uid} = { email, name, role: 'super_admin', grantedAt }
 * Rules: `.write: false` → chỉ Admin SDK (Cloud Function) ghi được, browser
 * không thể tự cấp quyền.
 *
 * Điều kiện PASS: record tồn tại VÀ `role === 'super_admin'`.
 * Fail-closed: mọi lỗi đọc DB đều trả false.
 */

const admin = require('firebase-admin');

/** TTL cache ngắn — tránh đọc DB mỗi request trong cùng một CF instance. */
const CACHE_TTL_MS = 30 * 1000;

let cache = new Map();

/**
 * Trả true nếu uid là Super Admin (có record superAdmins/{uid} với
 * role === 'super_admin').
 *
 * @param {string} uid UID đã xác thực từ Firebase ID token (KHÔNG lấy từ body).
 * @returns {Promise<boolean>}
 */
async function isFacebookSuperAdmin(uid) {
  if (!uid || typeof uid !== 'string') return false;

  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.ok;

  let ok = false;
  try {
    const snap = await admin.database().ref('superAdmins/' + uid).once('value');
    const val = snap.val();
    ok = !!val && val.role === 'super_admin';
  } catch (e) {
    // Fail-closed: lỗi DB hoặc mất mạng → không cấp quyền.
    ok = false;
  }

  cache.set(uid, { ok, ts: now });
  return ok;
}

/**
 * Trả 403 và false nếu UID không phải Super Admin; trả true nếu được phép.
 * Dùng trong Cloud Functions HTTP handlers.
 *
 * @param {{uid?: string}|null|undefined} check kết quả validateRequest()
 * @param {object} res Express-like response
 * @returns {Promise<boolean>}
 */
async function requireFacebookSuperAdmin(check, res) {
  const ok = await isFacebookSuperAdmin(check && check.uid);
  if (!ok) {
    res.status(403).json({
      error: 'Chỉ Super Admin được thực hiện thao tác Facebook.'
    });
    return false;
  }
  return true;
}

/** Xoá cache — dùng cho test. */
function clearSuperAdminCache() {
  cache = new Map();
}

module.exports = {
  isFacebookSuperAdmin,
  requireFacebookSuperAdmin,
  clearSuperAdminCache
};
