/*
 * routes/users.js — Sprint 14 Phase 2 (FINAL mục 17.22). Node RTDB thật:
 * `roles/{uid}` = { email, name, role, createdAt } (đúng shape xác nhận từ
 * js/admin-users.js:66, js/admin-auth.js:108-109). Toàn bộ route Admin-only.
 *
 * `POST /v1/users` — tài liệu FINAL ghi "Nguồn: Tạo qua Secondary App
 * instance" (cơ chế phía CLIENT để không tự đăng xuất Admin đang thao tác
 * khi tạo tài khoản mới) — cơ chế đó CHỈ áp dụng được trong trình duyệt,
 * không chạy được trong Cloud Function. Ở Backend dùng thẳng Admin SDK
 * (`admin.auth().createUser()`) — không có vấn đề "tự đăng xuất" vì đây là
 * request server-side, không phải phiên đăng nhập của Admin đang gọi API.
 *
 * `DELETE /v1/users/{uid}` — ĐÚNG "Nâng cấp thật" tài liệu yêu cầu: xoá cả
 * `roles/{uid}` LẪN tài khoản Firebase Auth thật qua Admin SDK (Client SDK
 * cũ chỉ xoá được node `roles`, để lại tài khoản Auth mồ côi).
 */
const admin = require('firebase-admin');

async function listUsers() {
  const snap = await admin.database().ref('roles').once('value');
  const val = snap.val() || {};
  return Object.keys(val).map(uid => Object.assign({ uid }, val[uid]));
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (!auth.ok || auth.role !== 'admin') {
    if (path === '/v1/users' || path.indexOf('/v1/users/') === 0 || path.indexOf('/v1/roles/') === 0) {
      return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được quản lý Users/Roles.');
    }
  }

  if (path === '/v1/users' && req.method === 'GET') {
    return sendSuccess(res, await listUsers());
  }

  if (path === '/v1/users' && req.method === 'POST') {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) return sendError(res, 'INVALID_REQUEST', 'Thiếu email hoặc password.');
    if (role !== 'admin' && role !== 'editor') return sendError(res, 'INVALID_REQUEST', 'role phải là admin hoặc editor.');
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password, displayName: name || undefined });
    } catch (err) {
      return sendError(res, 'INVALID_REQUEST', 'Tạo tài khoản thất bại: ' + err.message);
    }
    const record = { email, name: name || '', role, createdAt: admin.database.ServerValue.TIMESTAMP };
    await admin.database().ref('roles/' + userRecord.uid).set(record);
    return sendSuccess(res, Object.assign({ uid: userRecord.uid }, record), { status: 201 });
  }

  if (path === '/v1/users/custom-claims' && req.method === 'POST') {
    // Set Firebase Auth custom claims for multi-tenant business assignment
    const { uid, businessId, role } = req.body || {};
    if (!uid) return sendError(res, 'INVALID_REQUEST', 'Thiếu uid.');
    const validRoles = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
    if (!role || validRoles.indexOf(role) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'role phải là: ' + validRoles.join(', ') + '.');
    }
    if (role !== 'super_admin' && (!businessId || typeof businessId !== 'string')) {
      return sendError(res, 'INVALID_REQUEST', 'businessId là bắt buộc cho business roles.');
    }
    try {
      const claims = { businessId: businessId || null };
      if (role === 'super_admin') claims.roles = { super_admin: true };
      else if (role === 'business_admin') claims.roles = { business_admin: true };
      else if (role === 'business_editor') claims.roles = { business_editor: true };
      else if (role === 'business_viewer') claims.roles = { business_viewer: true };
      await admin.auth().setCustomUserClaims(uid, claims);
    } catch (err) {
      return sendError(res, 'INVALID_REQUEST', 'Gán custom claims thất bại: ' + err.message);
    }
    return sendSuccess(res, { uid, businessId: businessId || null, role, claimsSet: true });
  }

  if (path.indexOf('/v1/users/') === 0 && req.method === 'DELETE') {
    const uid = path.slice('/v1/users/'.length);
    if (!uid) return sendError(res, 'INVALID_REQUEST', 'Thiếu uid.');
    await admin.database().ref('roles/' + uid).remove();
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
    return sendSuccess(res, { deleted: true, uid });
  }

  if (path.indexOf('/v1/roles/') === 0) {
    const uid = path.slice('/v1/roles/'.length);
    if (!uid) return sendError(res, 'INVALID_REQUEST', 'Thiếu uid.');
    if (req.method === 'GET') {
      const snap = await admin.database().ref('roles/' + uid).once('value');
      if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Không tìm thấy user.');
      return sendSuccess(res, Object.assign({ uid }, snap.val()));
    }
    if (req.method === 'PATCH') {
      const snap = await admin.database().ref('roles/' + uid).once('value');
      if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Không tìm thấy user.');
      await admin.database().ref('roles/' + uid).update(req.body || {});
      const updated = await admin.database().ref('roles/' + uid).once('value');
      return sendSuccess(res, Object.assign({ uid }, updated.val()));
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PATCH cho /v1/roles/{uid}.');
  }

  return null; // not handled by this router
}

module.exports = { handle };
