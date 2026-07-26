/**
 * routes/TEMPLATE.js — Multi-tenant API template.
 * Copy and adapt for each collection.
 * Legacy route giữ nguyên, KHÔNG xóa.
 */
const admin = require('firebase-admin');
const { resolveBusinessId, checkBusinessRole, resolveRef } = require('../shared/apiAdapter');

const ALLOWED_WRITE = ['owner', 'admin', 'editor'];
const ALLOWED_READ = ['owner', 'admin', 'editor', 'viewer'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath || req.path;
  const auth = await helpers.auth || req.auth;

  // Match: /v1/businesses/{businessId}/{collection} hoặc /v1/businesses/{businessId}/{collection}/{id}
  const match = path.match(/^\/v1\/businesses\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null; // Không phải MT route → handle bởi route khác

  const businessId = match[1];
  const collection = match[2];
  const itemId = match[3];

  if (!auth || !auth.ok) return sendError(res, 'UNAUTHENTICATED', 'Thiếu Authorization.');

  const roleOk = await checkBusinessRole(auth.uid, businessId,
    req.method === 'GET' ? ALLOWED_READ : ALLOWED_WRITE);
  if (!roleOk) return sendError(res, 'PERMISSION_DENIED', 'Không có quyền trong doanh nghiệp này.');

  const ref = resolveRef(businessId, collection);

  if (req.method === 'GET') {
    if (itemId) {
      const snap = await ref.child(itemId).once('value');
      if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Không tìm thấy.');
      return sendSuccess(res, Object.assign({ id: itemId }, snap.val()));
    }
    const snap = await ref.once('value');
    const data = snap.val();
    const list = data ? Object.keys(data).map(k => Object.assign({ id: k }, data[k])) : [];
    return sendSuccess(res, list);
  }

  if (req.method === 'POST') {
    const ref2 = await ref.push(req.body || {});
    return sendSuccess(res, { id: ref2.key }, { status: 201 });
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (!itemId) return sendError(res, 'INVALID_REQUEST', 'Cần itemId.');
    const target = ref.child(itemId);
    if (req.method === 'PUT') await target.set(req.body);
    else await target.update(req.body);
    return sendSuccess(res, { id: itemId });
  }

  if (req.method === 'DELETE') {
    if (!itemId) return sendError(res, 'INVALID_REQUEST', 'Cần itemId.');
    await ref.child(itemId).remove();
    return sendSuccess(res, { deleted: itemId });
  }

  return null;
}

module.exports = { handle };
