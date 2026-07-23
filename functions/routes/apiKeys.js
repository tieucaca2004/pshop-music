/*
 * routes/apiKeys.js — API Key Management (Phase 5, Task 19.0).
 *
 * Manages API keys for third-party integrations. Keys are hashed with
 * SHA-256 before storage — never stored in plaintext.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const { generateApiKey, hashApiKey } = require('../shared/apiKeyAuth');

const ROLE_MANAGE = ['super_admin', 'business_admin'];

const ALLOWED_PERMISSIONS = [
  'products.read', 'products.write',
  'customers.read', 'customers.write',
  'orders.read', 'orders.write',
  'inventory.read', 'inventory.write',
  'reports.read'
];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/api/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const uid = req.user.uid;
  const db = admin.database();
  const keysPath = 'businesses/' + businessId + '/apiKeys';

  const listPattern = /^\/api\/v1\/businesses\/([^/]+)\/api-keys$/;
  const itemPattern = /^\/api\/v1\/businesses\/([^/]+)\/api-keys\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

  // ─── GET /.../api-keys — List API Keys ────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(keysPath).once('value');
    const val = snap.val() || {};
    var items = Object.keys(val).map(function(id) {
      var k = Object.assign({ id: id }, val[id]);
      // Never expose hashedKey in responses
      delete k.hashedKey;
      return k;
    });
    return sendSuccess(res, items);
  }

  // ─── POST /.../api-keys — Create API Key ──────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Tên API key là bắt buộc.');
    }

    // Validate permissions
    var permissions = body.permissions || [];
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return sendError(res, 'INVALID_REQUEST', 'Cần ít nhất một quyền. Hỗ trợ: ' + ALLOWED_PERMISSIONS.join(', ') + '.');
    }

    var invalidPerms = permissions.filter(function(p) { return ALLOWED_PERMISSIONS.indexOf(p) < 0; });
    if (invalidPerms.length > 0) {
      return sendError(res, 'INVALID_REQUEST', 'Quyền không hợp lệ: ' + invalidPerms.join(', ') + '.');
    }

    // Generate key pair
    const { key, hashedKey } = generateApiKey();

    var ref = db.ref(keysPath).push();
    var record = {
      apiKeyId: ref.key,
      name: body.name,
      hashedKey: hashedKey,
      permissions: permissions,
      allowedIPs: Array.isArray(body.allowedIPs) ? body.allowedIPs : [],
      lastUsedAt: null,
      expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : 0,
      status: 'active',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid
    };

    await ref.set(record);

    // Return the key ONCE — never again
    var response = {
      apiKeyId: ref.key,
      name: body.name,
      key: key, // plaintext — shown only at creation
      permissions: permissions,
      allowedIPs: record.allowedIPs,
      expiresAt: record.expiresAt,
      status: 'active',
      createdAt: record.createdAt
    };

    return sendSuccess(res, response, { status: 201 });
  }

  // ─── POST /.../api-keys/{id}/regenerate — Regenerate ─────────────
  if (itemMatch && req.method === 'POST' && req.query && req.query.action === 'regenerate') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(keysPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'API key không tồn tại.');

    const { key, hashedKey } = generateApiKey();
    await db.ref(keysPath + '/' + id).update({
      hashedKey: hashedKey,
      lastUsedAt: null,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    return sendSuccess(res, {
      apiKeyId: id,
      key: key, // plaintext — shown only at regeneration
      message: 'API key đã được tạo lại. Key cũ không còn hiệu lực.'
    });
  }

  // ─── PATCH /.../api-keys/{id} — Update (name, permissions, IPs, status) ─
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(keysPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'API key không tồn tại.');

    const body = req.body || {};
    const changes = {};

    if (body.name !== undefined) changes.name = body.name;
    if (body.status !== undefined) {
      if (['active', 'disabled'].indexOf(body.status) < 0) {
        return sendError(res, 'INVALID_REQUEST', 'status phải là active hoặc disabled.');
      }
      changes.status = body.status;
    }
    if (body.allowedIPs !== undefined) {
      changes.allowedIPs = Array.isArray(body.allowedIPs) ? body.allowedIPs : [];
    }
    if (body.expiresAt !== undefined) changes.expiresAt = body.expiresAt;
    if (body.permissions !== undefined) {
      var perms = body.permissions;
      if (!Array.isArray(perms)) perms = [perms];
      var invalid = perms.filter(function(p) { return ALLOWED_PERMISSIONS.indexOf(p) < 0; });
      if (invalid.length > 0) {
        return sendError(res, 'INVALID_REQUEST', 'Quyền không hợp lệ: ' + invalid.join(', ') + '.');
      }
      changes.permissions = perms;
    }

    if (Object.keys(changes).length === 0) {
      return sendError(res, 'INVALID_REQUEST', 'Không có trường nào để cập nhật.');
    }

    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
    await db.ref(keysPath + '/' + id).update(changes);

    var updated = await db.ref(keysPath + '/' + id).once('value');
    var response = Object.assign({ id: id }, updated.val());
    delete response.hashedKey; // never expose
    return sendSuccess(res, response);
  }

  // ─── DELETE /.../api-keys/{id} — Revoke (soft delete) ────────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(keysPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'API key không tồn tại.');

    await db.ref(keysPath + '/' + id).update({
      status: 'revoked',
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    return sendSuccess(res, { revoked: true, id: id, status: 'revoked' });
  }

  return null;
}

module.exports = { handle };
