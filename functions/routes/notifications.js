/*
 * routes/notifications.js — Notification Center (Phase 5, Task 17.0).
 *
 * Centralized notification system for all business events.
 * Supports auto-generation, broadcast, read/unread tracking,
 * and delivery preferences (in-app, email, telegram, webhook).
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_MANAGE = ['super_admin', 'business_admin'];

const NOTIFICATION_TYPES = ['system', 'order', 'payment', 'inventory', 'customer', 'subscription', 'security', 'ai'];

async function autoNotify(businessId, data) {
  const db = admin.database();
  const now = admin.database.ServerValue.TIMESTAMP;
  const ref = db.ref('businesses/' + businessId + '/notifications').push();

  const notification = {
    id: ref.key,
    type: data.type || 'system',
    title: data.title || '',
    message: data.message || '',
    priority: data.priority || 'normal',
    category: data.category || '',
    targetUserId: data.targetUserId || null,
    isRead: false,
    broadcast: !!data.broadcast,
    metadata: data.metadata || {},
    createdAt: now,
    readAt: null,
    createdBy: data.createdBy || 'system',
    businessId: businessId
  };

  await ref.set(notification);
  return notification;
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const uid = req.user.uid;
  const db = admin.database();
  const notifPath = 'businesses/' + businessId + '/notifications';

  const listPattern = /^\/v1\/businesses\/([^/]+)\/notifications$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/notifications\/([^/]+)$/;
  const readAllPattern = /^\/v1\/businesses\/([^/]+)\/notifications\/read-all$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  const readAllMatch = path.match(readAllPattern);

  if (!listMatch && !itemMatch && !readAllMatch) return null;

  // ─── POST /.../notifications — Create (system/broadcast) ──────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.title || !body.message) {
      return sendError(res, 'INVALID_REQUEST', 'Title và message là bắt buộc.');
    }

    const notifType = body.type || 'system';
    if (NOTIFICATION_TYPES.indexOf(notifType) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'Loại thông báo không hợp lệ. Hỗ trợ: ' + NOTIFICATION_TYPES.join(', ') + '.');
    }

    const result = await autoNotify(businessId, {
      type: notifType,
      title: body.title,
      message: body.message,
      priority: body.priority || 'normal',
      category: body.category || '',
      targetUserId: body.targetUserId || (body.broadcast ? null : uid),
      broadcast: !!body.broadcast,
      metadata: body.metadata || {},
      createdBy: uid
    });

    return sendSuccess(res, result, { status: 201 });
  }

  // ─── POST /.../notifications/read-all — Mark all as read ──────────
  if (readAllMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const now = admin.database.ServerValue.TIMESTAMP;
    const snap = await db.ref(notifPath).once('value');
    const val = snap.val() || {};
    var updateCount = 0;
    var updates = {};

    Object.keys(val).forEach(function(id) {
      var n = val[id];
      // Mark if targeted to this user or broadcast
      if (!n.isRead && (!n.targetUserId || n.targetUserId === uid || n.broadcast)) {
        updates[notifPath + '/' + id + '/isRead'] = true;
        updates[notifPath + '/' + id + '/readAt'] = now;
        updateCount++;
      }
    });

    if (updateCount > 0) {
      await db.ref().update(updates);
    }

    return sendSuccess(res, { markedRead: updateCount });
  }

  // ─── GET /.../notifications — List ─────────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(notifPath).once('value');
    const val = snap.val() || {};
    var items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    });

    // Filter by user (targeted or broadcast)
    items = items.filter(function(n) {
      return !n.targetUserId || n.targetUserId === uid || n.broadcast;
    });

    // Filter by type
    const typeFilter = req.query && req.query.type ? String(req.query.type).trim() : '';
    if (typeFilter) {
      items = items.filter(function(n) { return n.type === typeFilter; });
    }

    // Filter read/unread
    const unreadOnly = req.query && req.query.unread === 'true';
    if (unreadOnly) {
      items = items.filter(function(n) { return !n.isRead; });
    }

    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    // Limit
    const limit = parseInt(req.query && req.query.limit, 10) || 50;
    items = items.slice(0, limit);

    return sendSuccess(res, items);
  }

  // ─── GET /.../notifications/{id} — Read One ──────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(notifPath + '/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Thông báo không tồn tại.');
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, snap.val()));
  }

  // ─── PATCH /.../notifications/{id} — Mark read/unread ─────────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(notifPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Thông báo không tồn tại.');

    const body = req.body || {};
    const changes = {};

    if (body.isRead === true || body.isRead === false) {
      changes.isRead = body.isRead;
      if (body.isRead) changes.readAt = admin.database.ServerValue.TIMESTAMP;
      else changes.readAt = null;
    }

    if (Object.keys(changes).length === 0) {
      return sendError(res, 'INVALID_REQUEST', 'Không có trường nào để cập nhật.');
    }

    await db.ref(notifPath + '/' + id).update(changes);
    const updated = await db.ref(notifPath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── DELETE /.../notifications/{id} — Delete ─────────────────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(notifPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Thông báo không tồn tại.');

    await db.ref(notifPath + '/' + id).remove();
    return sendSuccess(res, { deleted: true, id: id });
  }

  return null;
}

module.exports = { handle, autoNotify };
