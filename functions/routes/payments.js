// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/payments.js — Multi-Tenant Payments (Phase 3, Task 12.0).
 *
 * Payment CRUD with Provider Adapter Architecture.
 * Supports: Cash, Bank Transfer, VietQR, VNPay, MoMo, ZaloPay, Stripe, PayPal.
 *
 * Each payment provider implements a common interface via shared/paymentAdapters.js.
 * Real API integration can be swapped in without changing business logic.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const { getAdapter, listProviders } = require('../shared/paymentAdapters');

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
  const uid = req.user.uid;
  const db = admin.database();
  const paymentsPath = 'businesses/' + businessId + '/payments';

  const listPattern = /^\/v1\/businesses\/([^/]+)\/payments$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/payments\/([^/]+)$/;
  const callbackPattern = /^\/v1\/businesses\/([^/]+)\/payments\/callback\/([a-z_]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  const cbMatch = path.match(callbackPattern);
  if (!listMatch && !itemMatch && !cbMatch) return null;

  // ─── Provider list endpoint ─────────────────────────────────────────
  if (listMatch && req.method === 'GET' && req.query && req.query.providers === 'true') {
    return sendSuccess(res, listProviders());
  }

  // ─── GET /.../payments — List ───────────────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(paymentsPath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    });
    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return sendSuccess(res, items);
  }

  // ─── POST /.../payments — Create Payment ───────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.orderId) return sendError(res, 'INVALID_REQUEST', 'orderId là bắt buộc.');
    if (!body.provider) return sendError(res, 'INVALID_REQUEST', 'provider là bắt buộc (ví dụ: cash, bank_transfer, momo, vnpay, stripe).');

    const provider = String(body.provider).toLowerCase().replace(/[^a-z_]/g, '');
    const adapter = getAdapter(provider);

    // Verify order exists
    const orderSnap = await db.ref('businesses/' + businessId + '/orders/' + body.orderId).once('value');
    if (!orderSnap.exists()) return sendError(res, 'NOT_FOUND', 'Đơn hàng không tồn tại.');
    const order = orderSnap.val();

    // Prevent duplicate successful payments
    if (order.paymentStatus === 'paid') {
      return sendError(res, 'CONFLICT', 'Đơn hàng này đã được thanh toán.');
    }

    // Check for existing successful payment for this order
    const existingSnap = await db.ref(paymentsPath)
      .orderByChild('orderId')
      .equalTo(body.orderId)
      .once('value');
    if (existingSnap.exists()) {
      var alreadyPaid = false;
      existingSnap.forEach(function(s) {
        var p = s.val();
        if (p.status === 'paid') alreadyPaid = true;
      });
      if (alreadyPaid) {
        return sendError(res, 'CONFLICT', 'Đã có giao dịch thanh toán thành công cho đơn hàng này.');
      }
    }

    // Load tenant payment config
    const configSnap = await db.ref('businesses/' + businessId + '/settings/payments').once('value');
    const tenantConfig = configSnap.val() || {};

    // Create payment via provider adapter
    var paymentResult;
    try {
      paymentResult = await adapter.createPayment(order, tenantConfig[provider] || {});
    } catch (err) {
      return sendError(res, 'PROVIDER_ERROR', 'Lỗi từ nhà cung cấp thanh toán: ' + err.message);
    }

    if (!paymentResult.success) {
      return sendError(res, 'PAYMENT_FAILED', paymentResult.message || 'Tạo thanh toán thất bại.');
    }

    // Save payment record
    const ref = db.ref(paymentsPath).push();
    const record = {
      id: ref.key,
      paymentId: ref.key,
      orderId: body.orderId,
      provider: provider,
      amount: body.amount || order.total || 0,
      currency: body.currency || 'VND',
      status: 'pending',
      transactionId: paymentResult.transactionId || '',
      qrCode: paymentResult.qrCode || null,
      paymentUrl: paymentResult.paymentUrl || null,
      bankAccount: paymentResult.bankAccount || null,
      paidAt: null,
      refundedAt: null,
      note: body.note || '',
      providerResponse: paymentResult,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid,
      updatedBy: uid,
      businessId: businessId
    };
    await ref.set(record);

    return sendSuccess(res, record, { status: 201 });
  }

  // ─── POST /.../payments/callback/{provider} — Webhook ─────────────
  if (cbMatch && req.method === 'POST') {
    // Payment callbacks bypass normal auth — validated via transactionId
    const provider = cbMatch[2];
    const adapter = getAdapter(provider);

    // Verify webhook payload
    var webhookResult;
    try {
      webhookResult = await adapter.verifyWebhook(req.body || {}, '');
    } catch (err) {
      return sendError(res, 'INVALID_WEBHOOK', 'Xác thực webhook thất bại: ' + err.message);
    }

    if (!webhookResult.valid) {
      return sendError(res, 'INVALID_WEBHOOK', 'Webhook không hợp lệ.');
    }

    const transactionId = webhookResult.transactionId;
    if (!transactionId) {
      return sendError(res, 'INVALID_WEBHOOK', 'Thiếu transactionId từ webhook.');
    }

    // Find payment by transactionId
    const allSnap = await db.ref(paymentsPath).once('value');
    var paymentRef = null;
    var paymentData = null;
    if (allSnap.exists()) {
      allSnap.forEach(function(s) {
        var p = s.val();
        if (p.transactionId === transactionId) {
          paymentRef = s.key;
          paymentData = p;
        }
      });
    }

    if (!paymentData) {
      return sendError(res, 'NOT_FOUND', 'Không tìm thấy giao dịch với transactionId: ' + transactionId);
    }

    // Prevent duplicate callback
    if (paymentData.status === 'paid') {
      return sendSuccess(res, { received: true, message: 'Callback đã được xử lý trước đó.', status: 'paid' });
    }

    // Update payment status
    var newStatus = 'paid';
    if (webhookResult.event === 'payment.failed') newStatus = 'failed';
    else if (webhookResult.event === 'payment.cancelled') newStatus = 'cancelled';

    var updateData = {
      status: newStatus,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    };
    if (newStatus === 'paid') {
      updateData.paidAt = admin.database.ServerValue.TIMESTAMP;
    }

    await db.ref(paymentsPath + '/' + paymentRef).update(updateData);

    // Update order payment status
    var orderStatus = 'pending';
    if (newStatus === 'paid') orderStatus = 'paid';
    else if (newStatus === 'failed') orderStatus = 'payment_failed';
    else if (newStatus === 'cancelled') orderStatus = 'payment_cancelled';

    if (paymentData.orderId) {
      db.ref('businesses/' + businessId + '/orders/' + paymentData.orderId).update({
        paymentStatus: orderStatus,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
    }

    return sendSuccess(res, {
      received: true,
      transactionId: transactionId,
      paymentId: paymentRef,
      status: newStatus
    });
  }

  // ─── GET /.../payments/{id} — Read One ─────────────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(paymentsPath + '/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch không tồn tại.');
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, snap.val()));
  }

  // ─── PATCH /.../payments/{id} — Update (status changes) ───────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(paymentsPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch không tồn tại.');

    const body = req.body || {};
    const changes = {};

    ['status', 'note'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });
    if (body.status === 'paid') changes.paidAt = admin.database.ServerValue.TIMESTAMP;
    if (body.status === 'refunded') changes.refundedAt = admin.database.ServerValue.TIMESTAMP;

    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
    changes.updatedBy = uid;

    await db.ref(paymentsPath + '/' + id).update(changes);
    const updated = await db.ref(paymentsPath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── POST /.../payments/{id}/refund — Refund ──────────────────────
  if (itemMatch && req.method === 'POST' && req.query && req.query.action === 'refund') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(paymentsPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch không tồn tại.');

    const payment = snap.val();
    if (payment.status !== 'paid') {
      return sendError(res, 'INVALID_REQUEST', 'Chỉ có thể hoàn tiền cho giao dịch đã thanh toán.');
    }

    const amount = req.body && typeof req.body.amount === 'number' ? req.body.amount : payment.amount;
    const adapter = getAdapter(payment.provider);

    try {
      const refundResult = await adapter.refundPayment(payment.transactionId, amount, {});
      if (!refundResult.success) {
        return sendError(res, 'REFUND_FAILED', refundResult.message || 'Hoàn tiền thất bại.');
      }
    } catch (err) {
      return sendError(res, 'PROVIDER_ERROR', 'Lỗi từ nhà cung cấp: ' + err.message);
    }

    await db.ref(paymentsPath + '/' + id).update({
      status: 'refunded',
      refundedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      updatedBy: uid
    });

    // Update order payment status
    if (payment.orderId) {
      db.ref('businesses/' + businessId + '/orders/' + payment.orderId).update({
        paymentStatus: 'refunded',
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
    }

    const updated = await db.ref(paymentsPath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  return null;
}

module.exports = { handle };
