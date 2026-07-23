/*
 * routes/customers.js — Multi-Tenant Customers (Phase 2, Task 10.0).
 *
 * CRUD for business customers under /businesses/{businessId}/customers/.
 * Soft delete only. Duplicate phone prevention within the same business.
 * Search by name, phone, email.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/api/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const db = admin.database();
  const nodePath = 'businesses/' + businessId + '/customers';

  const listPattern = /^\/api\/v1\/businesses\/([^/]+)\/customers$/;
  const itemPattern = /^\/api\/v1\/businesses\/([^/]+)\/customers\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

  // ─── GET /.../customers — List / Search ─────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(nodePath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    });

    // Search filter (server-side for now — RTDB doesn't support native search)
    const q = req.query && req.query.q ? String(req.query.q).toLowerCase().trim() : '';
    if (q) {
      items = items.filter(function(c) {
        return (c.fullName && c.fullName.toLowerCase().indexOf(q) >= 0)
          || (c.phone && c.phone.indexOf(q) >= 0)
          || (c.email && c.email.toLowerCase().indexOf(q) >= 0);
      });
    }

    // Filter soft-deleted unless explicitly requested
    const showDeleted = req.query && req.query.deleted === 'true';
    if (!showDeleted) {
      items = items.filter(function(c) { return c.status !== 'deleted'; });
    }

    // Sort by createdAt descending
    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    return sendSuccess(res, items);
  }

  // ─── POST /.../customers — Create ───────────────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.fullName || typeof body.fullName !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Họ tên khách hàng là bắt buộc.');
    }
    if (!body.phone && !body.email) {
      return sendError(res, 'INVALID_REQUEST', 'Số điện thoại hoặc email là bắt buộc.');
    }

    // Duplicate phone check
    if (body.phone) {
      const phoneSnap = await db.ref(nodePath)
        .orderByChild('phone')
        .equalTo(body.phone)
        .once('value');
      if (phoneSnap.exists()) {
        return sendError(res, 'CONFLICT', 'Số điện thoại "' + body.phone + '" đã tồn tại trong hệ thống.');
      }
    }

    // Duplicate email check
    if (body.email) {
      const emailSnap = await db.ref(nodePath)
        .orderByChild('email')
        .equalTo(body.email)
        .once('value');
      if (emailSnap.exists()) {
        return sendError(res, 'CONFLICT', 'Email "' + body.email + '" đã tồn tại trong hệ thống.');
      }
    }

    const ref = db.ref(nodePath).push();
    const record = {
      id: ref.key,
      fullName: body.fullName,
      phone: body.phone || '',
      email: body.email || '',
      birthday: body.birthday || '',
      gender: body.gender || '',
      address: body.address || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: body.notes || '',
      status: body.status || 'active',
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: null,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: req.user.uid,
      updatedBy: req.user.uid,
      businessId: businessId
    };
    await ref.set(record);
    return sendSuccess(res, record, { status: 201 });
  }

  // ─── GET /.../customers/{id} — Read One ────────────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(nodePath + '/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Khách hàng không tồn tại.');
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, snap.val()));
  }

  // ─── PATCH /.../customers/{id} — Update ────────────────────────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(nodePath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Khách hàng không tồn tại.');

    const body = req.body || {};
    const changes = {};

    // Check duplicate phone (if phone changed)
    if (body.phone !== undefined) {
      changes.phone = body.phone;
      const phoneSnap = await db.ref(nodePath)
        .orderByChild('phone')
        .equalTo(body.phone)
        .once('value');
      if (phoneSnap.exists()) {
        var isDuplicate = false;
        phoneSnap.forEach(function(s) {
          if (s.key !== id) isDuplicate = true;
        });
        if (isDuplicate) {
          return sendError(res, 'CONFLICT', 'Số điện thoại "' + body.phone + '" đã được sử dụng bởi khách hàng khác.');
        }
      }
    }

    // Check duplicate email (if email changed)
    if (body.email !== undefined) {
      changes.email = body.email;
      const emailSnap = await db.ref(nodePath)
        .orderByChild('email')
        .equalTo(body.email)
        .once('value');
      if (emailSnap.exists()) {
        var isDupEmail = false;
        emailSnap.forEach(function(s) {
          if (s.key !== id) isDupEmail = true;
        });
        if (isDupEmail) {
          return sendError(res, 'CONFLICT', 'Email "' + body.email + '" đã được sử dụng bởi khách hàng khác.');
        }
      }
    }

    ['fullName', 'birthday', 'gender', 'address', 'tags', 'notes', 'status'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });

    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
    changes.updatedBy = req.user.uid;

    await db.ref(nodePath + '/' + id).update(changes);
    const updated = await db.ref(nodePath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── DELETE /.../customers/{id} — Soft Delete ──────────────────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(nodePath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Khách hàng không tồn tại.');

    await db.ref(nodePath + '/' + id).update({
      status: 'deleted',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      updatedBy: req.user.uid
    });

    return sendSuccess(res, { deleted: true, id: id, status: 'deleted' });
  }

  return null;
}

module.exports = { handle };
