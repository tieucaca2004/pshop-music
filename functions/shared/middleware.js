/**
 * shared/middleware.js — Standardized middleware cho PSH Business Platform.
 * Thay thế hoàn toàn shared/auth.js cho các route đã chuyển đổi.
 */
const admin = require('firebase-admin');
const db = admin.database();

async function authenticate(req) {
  const auth = req.get('Authorization') || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return { ok: false, code: 401, error: 'Thi\u1ebfu Authorization Bearer token.' };
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return { ok: true, uid: decoded.uid, email: decoded.email || '' };
  } catch (err) {
    return { ok: false, code: 401, error: 'Token kh\u00f4ng h\u1ee3p l\u1ec7.' };
  }
}

async function authorizeBusiness(authUid, businessId, allowedRoles) {
  if (!authUid || !businessId) return { ok: false, code: 403, error: 'Thi\u1ebfu uid ho\u1eb7c businessId.' };
  if (businessId === 'pshop-music') {
    const snap = await db.ref('roles/' + authUid + '/role').once('value');
    const role = snap.val();
    if (!role) return { ok: false, code: 403, error: 'Kh\u00f4ng c\u00f3 quy\u1ec1n trong pshop-music.' };
    if (allowedRoles && allowedRoles.indexOf(role) < 0) return { ok: false, code: 403, error: 'Kh\u00f4ng \u0111\u1ee7 quy\u1ec1n.' };
    return { ok: true, role: role, businessId: 'pshop-music' };
  }
  const snap = await db.ref('businessMembers/' + businessId + '/' + authUid).once('value');
  const member = snap.val();
  if (!member) return { ok: false, code: 403, error: 'Kh\u00f4ng c\u00f3 quy\u1ec1n trong doanh nghi\u1ec7p n\u00e0y.' };
  if (allowedRoles && allowedRoles.indexOf(member.role) < 0) return { ok: false, code: 403, error: 'Kh\u00f4ng \u0111\u1ee7 quy\u1ec1n.' };
  return { ok: true, role: member.role, businessId: businessId };
}

function sendSuccess(res, data, opts) {
  return res.status((opts && opts.status) || 200).json({ success: true, data: data });
}

function sendError(res, code, message, details) {
  var statusMap = { UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409, INVALID_REQUEST: 400 };
  return res.status(statusMap[code] || 400).json({ success: false, error: { code: code, message: message, details: details || null } });
}

module.exports = { authenticate, authorizeBusiness, sendSuccess, sendError };
