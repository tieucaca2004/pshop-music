const admin = require('firebase-admin');
const db = admin.database();

function authenticate(req) {
  const auth = req.get('Authorization') || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return { ok: false, code: 401, error: 'Thiếu Authorization Bearer token.' };
  return admin.auth().verifyIdToken(match[1]).then(decoded => {
    return { ok: true, uid: decoded.uid, email: decoded.email || '' };
  }).catch(() => ({ ok: false, code: 401, error: 'Token không hợp lệ.' }));
}

async function authorizeBusiness(authUid, businessId) {
  if (!authUid || !businessId) return { ok: false, code: 403, error: 'Không có quyền.' };
  if (businessId === 'pshop-music') {
    const snap = await db.ref('roles/' + authUid + '/role').once('value');
    if (snap.val()) return { ok: true, role: snap.val() };
    return { ok: false, code: 403, error: 'Không có quyền trong pshop-music.' };
  }
  const snap = await db.ref('businessMembers/' + businessId + '/' + authUid).once('value');
  const member = snap.val();
  if (!member) return { ok: false, code: 403, error: 'Không có quyền trong doanh nghiệp này.' };
  return { ok: true, role: member.role };
}

function sendSuccess(res, data, opts) {
  return res.status((opts && opts.status) || 200).json({ success: true, data: data });
}

function sendError(res, code, message, details) {
  return res.status(code === 'UNAUTHENTICATED' ? 401 : code === 'PERMISSION_DENIED' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : 400).json({ success: false, error: { code, message, details: details || null } });
}

module.exports = { authenticate, authorizeBusiness, sendSuccess, sendError };
