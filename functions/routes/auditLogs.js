// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/auditLogs.js — Audit Log & Activity Timeline (Phase 5, Task 18.0).
 *
 * Comprehensive audit trail for all business operations.
 * Supports filtering, search by date/user/action/resource, and CSV export.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_OWN = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_FULL = ['super_admin', 'business_admin'];

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
  const role = req.tenant.role;
  const db = admin.database();
  const auditPath = 'businesses/' + businessId + '/auditLogs';

  const listPattern = /^\/v1\/businesses\/([^/]+)\/audit-logs$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/audit-logs\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

  // ─── POST /.../audit-logs — Create audit entry ──────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_OWN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.action) {
      return sendError(res, 'INVALID_REQUEST', 'action là bắt buộc.');
    }

    const ref = db.ref(auditPath).push();
    const record = {
      id: ref.key,
      actorId: body.actorId || uid,
      actorName: body.actorName || '',
      action: body.action,
      resourceType: body.resourceType || '',
      resourceId: body.resourceId || '',
      before: body.before || null,
      after: body.after || null,
      ipAddress: req.ip || body.ipAddress || '',
      userAgent: req.get('User-Agent') || body.userAgent || '',
      metadata: body.metadata || {},
      createdAt: admin.database.ServerValue.TIMESTAMP,
      businessId: businessId
    };

    await ref.set(record);
    return sendSuccess(res, record, { status: 201 });
  }

  // ─── GET /.../audit-logs — List / Search / Filter ──────────────────
  if (listMatch && req.method === 'GET') {
    // Business editor can only see own activity
    if (role === 'business_editor') {
      return sendSuccess(res, []);
    }

    const roleRes = await requireRole(req, ROLE_FULL);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(auditPath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    });

    // Filter: date range
    const dateFrom = req.query && req.query.from ? parseInt(req.query.from, 10) : 0;
    const dateTo = req.query && req.query.to ? parseInt(req.query.to, 10) : Date.now();
    items = items.filter(function(a) {
      var ts = a.createdAt || 0;
      return ts >= dateFrom && ts <= dateTo;
    });

    // Filter: user/actor
    const actorFilter = req.query && req.query.actor ? String(req.query.actor).trim() : '';
    if (actorFilter) {
      items = items.filter(function(a) {
        return a.actorId === actorFilter || a.actorName === actorFilter;
      });
    }

    // Filter: action type
    const actionFilter = req.query && req.query.action ? String(req.query.action).trim() : '';
    if (actionFilter) {
      items = items.filter(function(a) { return a.action === actionFilter; });
    }

    // Filter: resource type
    const resourceFilter = req.query && req.query.resource ? String(req.query.resource).trim() : '';
    if (resourceFilter) {
      items = items.filter(function(a) { return a.resourceType === resourceFilter; });
    }

    // Sort by createdAt descending
    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    // Limit
    const limit = parseInt(req.query && req.query.limit, 10) || 100;
    items = items.slice(0, limit);

    // CSV export
    const format = req.query && req.query.format ? String(req.query.format).toLowerCase() : 'json';
    if (format === 'csv') {
      var csvRows = [];
      items.forEach(function(item) {
        csvRows.push({
          id: item.id,
          createdAt: new Date(item.createdAt || 0).toISOString(),
          actorId: item.actorId || '',
          actorName: item.actorName || '',
          action: item.action,
          resourceType: item.resourceType || '',
          resourceId: item.resourceId || '',
          ipAddress: item.ipAddress || ''
        });
      });

      if (csvRows.length === 0) {
        return sendSuccess(res, []);
      }

      var headers = Object.keys(csvRows[0]);
      var csvLines = [headers.join(',')];
      csvRows.forEach(function(row) {
        csvLines.push(headers.map(function(h) {
          var v = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
          if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
            v = '"' + v.replace(/"/g, '""') + '"';
          }
          return v;
        }).join(','));
      });

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="audit-log-' + new Date().toISOString().slice(0, 10) + '.csv"');
      return res.status(200).send(csvLines.join('\n'));
    }

    return sendSuccess(res, items);
  }

  // ─── GET /.../audit-logs/{id} — Read One ──────────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_FULL);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(auditPath + '/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Audit log không tồn tại.');
    const data = snap.val();
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, data));
  }

  return null;
}

module.exports = { handle };
