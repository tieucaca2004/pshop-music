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

  // ─── /.../payments/callback/{provider} — FAIL-CLOSED (API-01, PAY-1) ──
  // Chưa có payment provider thật: không có contract chữ ký webhook, không
  // có secret, adapter đều là stub. Firebase ID token KHÔNG phải cách xác
  // thực provider, nên không role nào (kể cả business_admin) được tạo sự
  // kiện thanh toán qua đường này. Từ chối trước auth của router này, mọi
  // method, mọi provider — không đọc/ghi DB. Xác nhận thanh toán thủ công
  // vẫn đi qua PATCH /payments/{id} (chỉ admin), tách riêng.
  if (/^\/v1\/businesses\/[^/]+\/payments\/callback(\/.*)?$/.test(path)) {
    return sendError(res, 'FORBIDDEN', 'Webhook thanh toán chưa được kích hoạt: chưa cấu hình nhà cung cấp thanh toán có xác thực chữ ký.');
  }

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

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

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
