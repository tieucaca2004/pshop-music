// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/categories.js — Multi-Tenant Categories (Phase 2, Task 9.0).
 *
 * CRUD for product categories under /businesses/{businessId}/categories/.
 * Prevents deletion of categories that have active product references.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const { getAll, getOne, add, update, remove } = require('../shared/listResource');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // Only handle tenant-scoped paths
  if (path.indexOf('/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const node = 'businesses/' + businessId + '/categories';

  const listPattern = /^\/v1\/businesses\/([^/]+)\/categories$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/categories\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

  // ─── GET /.../categories — List ─────────────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);
    return sendSuccess(res, await getAll(node));
  }

  // ─── POST /.../categories — Create ──────────────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.label || typeof body.label !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Tên danh mục là bắt buộc.');
    }

    const record = await add(node, {
      code: body.code || '',
      label: body.label,
      description: body.description || '',
      order: typeof body.order === 'number' ? body.order : 0,
      image: body.image || '',
      status: body.status || 'active',
      businessId: businessId
    });
    return sendSuccess(res, record, { status: 201 });
  }

  // ─── GET /.../categories/{id} — Read One ────────────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const item = await getOne(node, itemMatch[2]);
    if (!item) return sendError(res, 'NOT_FOUND', 'Danh mục không tồn tại.');
    return sendSuccess(res, item);
  }

  // ─── PATCH /.../categories/{id} — Update ────────────────────────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const body = req.body || {};
    const changes = {};
    ['code', 'label', 'description', 'order', 'image', 'status'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });

    const result = await update(node, id, changes);
    if (!result) return sendError(res, 'NOT_FOUND', 'Danh mục không tồn tại.');
    return sendSuccess(res, result);
  }

  // ─── DELETE /.../categories/{id} — Delete (with reference check) ───
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];

    // Check if any product references this category
    const prodSnap = await admin.database()
      .ref('businesses/' + businessId + '/products')
      .orderByChild('category')
      .equalTo(id)
      .once('value');
    if (prodSnap.exists()) {
      const prodCount = Object.keys(prodSnap.val()).length;
      return sendError(res, 'CONFLICT',
        'Không thể xóa danh mục này vì có ' + prodCount + ' sản phẩm đang tham chiếu. Hãy đổi danh mục của các sản phẩm đó trước.');
    }

    // Also check legacy products
    const legacySnap = await admin.database()
      .ref('products')
      .orderByChild('category')
      .equalTo(id)
      .once('value');
    if (legacySnap.exists()) {
      const prodCount = Object.keys(legacySnap.val()).length;
      return sendError(res, 'CONFLICT',
        'Không thể xóa danh mục — có ' + prodCount + ' sản phẩm legacy đang tham chiếu.');
    }

    const deleted = await remove(node, id);
    if (!deleted) return sendError(res, 'NOT_FOUND', 'Danh mục không tồn tại.');
    return sendSuccess(res, { deleted: true, id: id });
  }

  return null;
}

module.exports = { handle };
