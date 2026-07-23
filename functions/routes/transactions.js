/*
 * routes/transactions.js — Transactions & Invoices (Phase 5, Task 20.0).
 *
 * Comprehensive transactions and invoices management with auto-numbering,
 * status tracking, and export support.
 *
 * Transactions: record payments, refunds, gateway operations.
 * Invoices: billing documents with auto-incrementing numbers.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

const TX_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'];
const INV_STATUSES = ['draft', 'issued', 'paid', 'overdue', 'void'];

const INVOICE_FORMAT = 'INV-{year}-{number}';

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

  // ─── Route patterns ──────────────────────────────────────────────
  const txListP = /^\/v1\/businesses\/([^/]+)\/transactions$/;
  const txItemP = /^\/v1\/businesses\/([^/]+)\/transactions\/([^/]+)$/;
  const invListP = /^\/v1\/businesses\/([^/]+)\/invoices$/;
  const invItemP = /^\/v1\/businesses\/([^/]+)\/invoices\/([^/]+)$/;

  const txList = path.match(txListP);
  const txItem = path.match(txItemP);
  const invList = path.match(invListP);
  const invItem = path.match(invItemP);
  const isTx = txList || txItem;
  const isInv = invList || invItem;
  if (!isTx && !isInv) return null;

  const appPath = isTx ? 'transactions' : 'invoices';
  const basePath = 'businesses/' + businessId + '/' + appPath;

  // ─── TRANSACTIONS ────────────────────────────────────────────────

  // GET /.../transactions — List
  if (txList && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(basePath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) { return Object.assign({ id: id }, val[id]); });

    // Filter by status
    const statusFilter = req.query && req.query.status ? String(req.query.status).trim() : '';
    if (statusFilter) items = items.filter(function(t) { return t.status === statusFilter; });

    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return sendSuccess(res, items);
  }

  // POST /.../transactions — Create
  if (txList && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.orderId) return sendError(res, 'INVALID_REQUEST', 'orderId là bắt buộc.');
    if (typeof body.amount !== 'number') return sendError(res, 'INVALID_REQUEST', 'amount là bắt buộc.');

    const ref = db.ref(basePath).push();
    const record = {
      id: ref.key,
      orderId: body.orderId,
      paymentMethod: body.paymentMethod || '',
      amount: body.amount,
      currency: body.currency || 'VND',
      status: body.status || 'pending',
      gateway: body.gateway || '',
      gatewayTransactionId: body.gatewayTransactionId || '',
      notes: body.notes || '',
      metadata: body.metadata || {},
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid,
      businessId: businessId
    };
    await ref.set(record);

    // Tag: auto-integrate: update order paymentStatus
    if (record.status === 'paid') {
      db.ref('businesses/' + businessId + '/orders/' + body.orderId + '/paymentStatus').set('paid');
    }

    return sendSuccess(res, record, { status: 201 });
  }

  // GET /.../transactions/{id}
  if (txItem && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(basePath + '/' + txItem[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch không tồn tại.');
    return sendSuccess(res, Object.assign({ id: txItem[2] }, snap.val()));
  }

  // PATCH /.../transactions/{id} — Update status
  if (txItem && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = txItem[2];
    const snap = await db.ref(basePath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch không tồn tại.');

    const body = req.body || {};
    const changes = {};
    ['status', 'gatewayTransactionId', 'notes', 'metadata'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });
    if (body.status && TX_STATUSES.indexOf(body.status) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'Trạng thái không hợp lệ: ' + TX_STATUSES.join(', '));
    }
    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;

    await db.ref(basePath + '/' + id).update(changes);
    const updated = await db.ref(basePath + '/' + id).once('value');

    // Tag: auto-integrate
    var tx = updated.val();
    if (tx.orderId && tx.status === 'refunded') {
      db.ref('businesses/' + businessId + '/orders/' + tx.orderId + '/paymentStatus').set('refunded');
    }

    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── INVOICES ────────────────────────────────────────────────────

  // Helper: generate next invoice number
  async function nextInvoiceNumber() {
    const counterRef = db.ref('businesses/' + businessId + '/_meta/reportId/invoiceCounter');
    const snap = await counterRef.once('value');
    var num = (snap.val() || 0) + 1;
    // Check for duplicate (safety net)
    var duplicate = true;
    var maxAttempts = 100;
    while (duplicate && maxAttempts > 0) {
      duplicate = false;
      // Construct number with padding
      var year = new Date().getFullYear();
      var formatted = year + '-' + String(num).padStart(6, '0');
      // Check for duplicate
      var checkSnap = await db.ref(basePath).orderByChild('_invNum').equalTo(formatted).once('value');
      if (checkSnap.exists()) {
        num++;
        duplicate = true;
        maxAttempts--;
      }
    }
    await counterRef.set(num);
    return { number: num, formatted: formatted };
  }

  // GET /.../invoices — List
  if (invList && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(basePath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) { return Object.assign({ id: id }, val[id]); });

    const statusFilter = req.query && req.query.status ? String(req.query.status).trim() : '';
    if (statusFilter) items = items.filter(function(i) { return i.status === statusFilter; });

    items.sort(function(a, b) { return (b.issuedAt || b.createdAt || 0) - (a.issuedAt || a.createdAt || 0); });
    return sendSuccess(res, items);
  }

  // POST /.../invoices — Create
  if (invList && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.customerId) return sendError(res, 'INVALID_REQUEST', 'customerId là bắt buộc.');
    if (typeof body.total !== 'number') return sendError(res, 'INVALID_REQUEST', 'total là bắt buộc.');

    // Generate invoice number
    const invNum = await nextInvoiceNumber();
    const invoiceNumber = INVOICE_FORMAT
      .replace('{year}', String(new Date().getFullYear()))
      .replace('{number}', invNum.formatted);

    const ref = db.ref(basePath).push();
    const record = {
      id: ref.key,
      invoiceNumber: invoiceNumber,
      _invNum: invNum.formatted,
      customerId: body.customerId,
      orderId: body.orderId || null,
      transactionId: body.transactionId || null,
      subtotal: body.subtotal || body.total || 0,
      tax: body.tax || 0,
      discount: body.discount || 0,
      total: body.total,
      currency: body.currency || 'VND',
      status: body.status || 'draft',
      issuedAt: body.status === 'issued' ? admin.database.ServerValue.TIMESTAMP : null,
      dueAt: body.dueAt || (Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidAt: null,
      lineItems: body.lineItems || [],
      notes: body.notes || '',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid,
      businessId: businessId
    };
    await ref.set(record);

    return sendSuccess(res, record, { status: 201 });
  }

  // GET /.../invoices/{id}
  if (invItem && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(basePath + '/' + invItem[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Hóa đơn không tồn tại.');
    return sendSuccess(res, Object.assign({ id: invItem[2] }, snap.val()));
  }

  // PATCH /.../invoices/{id} — Update
  if (invItem && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = invItem[2];
    const snap = await db.ref(basePath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Hóa đơn không tồn tại.');

    const body = req.body || {};
    const changes = {};
    ['subtotal', 'tax', 'discount', 'total', 'currency', 'status', 'dueAt', 'lineItems', 'notes', 'customerId', 'orderId', 'transactionId'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });
    if (body.status && INV_STATUSES.indexOf(body.status) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'Trạng thái không hợp lệ: ' + INV_STATUSES.join(', '));
    }
    if (body.status === 'issued' && !snap.val().issuedAt) changes.issuedAt = admin.database.ServerValue.TIMESTAMP;
    if (body.status === 'paid') changes.paidAt = admin.database.ServerValue.TIMESTAMP;

    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
    await db.ref(basePath + '/' + id).update(changes);

    var updated = await db.ref(basePath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  return null;
}

module.exports = { handle };
