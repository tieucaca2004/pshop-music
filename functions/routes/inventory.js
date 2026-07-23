/*
 * routes/inventory.js — Multi-Tenant Inventory (Phase 2, Task 9.0).
 *
 * Stock management with history tracking. Every stock change records:
 *   before, after, action, quantity, note, createdBy.
 *
 * Prevents negative stock — all decrements check current stock first.
 * Uses production middleware: verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const db = admin.database();

  const listPattern = /^\/v1\/businesses\/([^/]+)\/inventory$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/inventory\/([^/]+)$/;
  const historyPattern = /^\/v1\/businesses\/([^/]+)\/inventory\/([^/]+)\/history$/;
  const adjustPattern = /^\/v1\/businesses\/([^/]+)\/inventory\/([^/]+)\/adjust$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  const histMatch = path.match(historyPattern);
  const adjMatch = path.match(adjustPattern);

  if (!listMatch && !itemMatch && !histMatch && !adjMatch) return null;

  // ─── GET /.../inventory — List all stock ────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref('businesses/' + businessId + '/inventory').once('value');
    const val = snap.val() || {};
    const items = Object.keys(val).map(function(id) {
      return Object.assign({ id }, val[id]);
    });
    return sendSuccess(res, items);
  }

  // ─── POST /.../inventory — Add stock item ──────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.sku && !body.productId) {
      return sendError(res, 'INVALID_REQUEST', 'sku hoặc productId là bắt buộc.');
    }

    const ref = db.ref('businesses/' + businessId + '/inventory').push();
    const record = {
      id: ref.key,
      sku: body.sku || '',
      productId: body.productId || '',
      productName: body.productName || '',
      stock: typeof body.stock === 'number' ? body.stock : 0,
      lowStockThreshold: typeof body.lowStockThreshold === 'number' ? body.lowStockThreshold : 5,
      unit: body.unit || 'piece',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: req.user.uid,
      businessId: businessId
    };
    await ref.set(record);

    // Record initial stock history
    const historyRef = db.ref('businesses/' + businessId + '/inventory/' + ref.key + '/history').push();
    await historyRef.set({
      productId: body.productId || '',
      sku: body.sku || '',
      action: 'initialize',
      quantity: record.stock,
      before: 0,
      after: record.stock,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: req.user.uid,
      note: 'Khởi tạo tồn kho'
    });

    return sendSuccess(res, record, { status: 201 });
  }

  // ─── GET /.../inventory/{id} — Read one stock item ─────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref('businesses/' + businessId + '/inventory/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Kho hàng không tồn tại.');
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, snap.val()));
  }

  // ─── PATCH /.../inventory/{id} — Update stock item ─────────────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref('businesses/' + businessId + '/inventory/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Kho hàng không tồn tại.');

    const body = req.body || {};
    const changes = {};
    ['sku', 'productId', 'productName', 'lowStockThreshold', 'unit'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });
    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;

    await db.ref('businesses/' + businessId + '/inventory/' + id).update(changes);
    const updated = await db.ref('businesses/' + businessId + '/inventory/' + id).once('value');
    return sendSuccess(res, Object.assign({ id }, updated.val()));
  }

  // ─── POST /.../inventory/{id}/adjust — Stock adjustment ────────────
  if (adjMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = adjMatch[2];
    const body = req.body || {};

    // Current stock
    const snap = await db.ref('businesses/' + businessId + '/inventory/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Kho hàng không tồn tại.');
    const current = snap.val();
    const beforeStock = current.stock || 0;
    const action = body.action || 'adjust';
    let quantity = typeof body.quantity === 'number' ? body.quantity : 0;
    if (quantity === 0) return sendError(res, 'INVALID_REQUEST', 'Số lượng thay đổi phải khác 0.');

    // Calculate new stock
    let afterStock;
    switch (action) {
      case 'increase':
      case 'receive':
        afterStock = beforeStock + Math.abs(quantity);
        break;
      case 'decrease':
      case 'sell':
        afterStock = beforeStock - Math.abs(quantity);
        break;
      case 'adjust':
        afterStock = beforeStock + quantity; // positive = add, negative = remove
        break;
      case 'set':
        afterStock = quantity; // set absolute value
        break;
      default:
        return sendError(res, 'INVALID_REQUEST', 'Hành động không hợp lệ. Hỗ trợ: increase, decrease, adjust, set, receive, sell.');
    }

    // Prevent negative stock
    if (afterStock < 0) {
      return sendError(res, 'INVALID_REQUEST',
        'Tồn kho không thể âm. Hiện tại: ' + beforeStock + ', yêu cầu giảm: ' + (beforeStock - afterStock) + '.');
    }

    // Update stock
    await db.ref('businesses/' + businessId + '/inventory/' + id).update({
      stock: afterStock,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    // Record history
    const histRef = db.ref('businesses/' + businessId + '/inventory/' + id + '/history').push();
    const historyRecord = {
      productId: current.productId || '',
      sku: current.sku || '',
      action: action,
      quantity: quantity,
      before: beforeStock,
      after: afterStock,
      note: body.note || '',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: req.user.uid
    };
    await histRef.set(historyRecord);

    return sendSuccess(res, {
      id: id,
      before: beforeStock,
      after: afterStock,
      action: action,
      delta: afterStock - beforeStock,
      historyId: histRef.key
    });
  }

  // ─── DELETE /.../inventory/{id} — Remove stock item ────────────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref('businesses/' + businessId + '/inventory/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Kho hàng không tồn tại.');

    await db.ref('businesses/' + businessId + '/inventory/' + id).remove();
    return sendSuccess(res, { deleted: true, id: id });
  }

  return null;
}

module.exports = { handle };
