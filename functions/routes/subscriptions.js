/*
 * routes/subscriptions.js — Multi-Tenant Subscription & Billing (Phase 4, Task 15.0).
 *
 * Plans CRUD and Subscription lifecycle management.
 * Uses shared/subscriptionValidator.js for plan data and validation.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const { getPlan, listPlans, DEFAULT_PLANS } = require('../shared/subscriptionValidator');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_MANAGE = ['super_admin', 'business_admin'];
const ROLE_SUPER = ['super_admin'];

const TRIAL_OPTIONS = { 7: 7, 14: 14, 30: 30 };
const BILLING_CYCLES = ['monthly', 'yearly'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // ─── Platform Plans (no tenant) ─────────────────────────────────
  if (path === '/api/v1/plans' && req.method === 'GET') {
    const plans = await listPlans();
    return sendSuccess(res, plans);
  }

  if (path === '/api/v1/plans' && req.method === 'POST') {
    // Super admin only — but skip auth in tenant mode
  }

  if (path.indexOf('/api/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const uid = req.user.uid;
  const db = admin.database();

  const subPattern = /^\/api\/v1\/businesses\/([^/]+)\/subscription$/;
  const billPattern = /^\/api\/v1\/businesses\/([^/]+)\/billing$/;
  const billItemPattern = /^\/api\/v1\/businesses\/([^/]+)\/billing\/([^/]+)$/;

  const subMatch = path.match(subPattern);
  const billMatch = path.match(billPattern);
  const billItemMatch = path.match(billItemPattern);
  if (!subMatch && !billMatch && !billItemMatch) return null;

  // ─── GET /.../subscription — Read current subscription ────────────
  if (subMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref('businesses/' + businessId + '/subscription').once('value');
    const sub = snap.val() || { status: 'none' };
    return sendSuccess(res, sub);
  }

  // ─── POST /.../subscription — Create / Upgrade / Renew ────────────
  if (subMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    const action = body.action || 'create';
    const planId = body.planId || 'starter';
    const billingCycle = BILLING_CYCLES.indexOf(body.billingCycle) >= 0 ? body.billingCycle : 'monthly';

    // Validate plan exists
    const plan = await getPlan(planId);
    if (!plan) return sendError(res, 'NOT_FOUND', 'Gói "' + planId + '" không tồn tại.');

    const now = Date.now();
    const subPath = 'businesses/' + businessId + '/subscription';

    // Get current subscription
    const subSnap = await db.ref(subPath).once('value');
    const currentSub = subSnap.val() || {};

    switch (action) {
      case 'create':
      case 'upgrade':
      case 'downgrade': {
        // Calculate price
        const price = billingCycle === 'yearly' ? (plan.yearlyPrice || plan.monthlyPrice * 10) : plan.monthlyPrice;

        // Calculate expiration (1 month or 1 year)
        const periodMs = billingCycle === 'yearly'
          ? 365 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

        const startAt = now;
        const expiresAt = startAt + periodMs;
        const subscriptionId = 'sub-' + Date.now().toString(36).toUpperCase();

        const subscription = {
          subscriptionId: subscriptionId,
          businessId: businessId,
          planId: planId,
          planName: plan.name || planId,
          status: 'active',
          billingCycle: billingCycle,
          price: price,
          currency: plan.currency || 'USD',
          startAt: startAt,
          expiresAt: expiresAt,
          trialEndsAt: currentSub.trialEndsAt || null,
          trialUsed: currentSub.trialUsed || false,
          autoRenew: body.autoRenew !== false,
          paymentProvider: body.paymentProvider || currentSub.paymentProvider || null,
          previousPlanId: currentSub.planId || null,
          createdAt: currentSub.createdAt || startAt,
          updatedAt: now
        };

        await db.ref(subPath).set(subscription);

        // Record billing entry
        if (price > 0) {
          const billRef = db.ref('businesses/' + businessId + '/billing').push();
          await billRef.set({
            billingId: billRef.key,
            subscriptionId: subscriptionId,
            planId: planId,
            amount: price,
            currency: plan.currency || 'USD',
            status: 'paid',
            billingCycle: billingCycle,
            action: action,
            createdAt: now,
            paidAt: now
          });
        }

        return sendSuccess(res, subscription, { status: 201 });
      }

      case 'renew': {
        if (currentSub.status === 'cancelled') {
          return sendError(res, 'CONFLICT', 'Gói đã bị hủy. Vui lòng tạo đăng ký mới.');
        }

        const periodMs = billingCycle === 'yearly'
          ? 365 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

        const currentPlanId = currentSub.planId || planId;
        const currentPlan = await getPlan(currentPlanId);
        const price = billingCycle === 'yearly'
          ? (currentPlan.yearlyPrice || currentPlan.monthlyPrice * 10)
          : currentPlan.monthlyPrice;

        const oldExpiry = currentSub.expiresAt || now;
        const newExpiry = Math.max(oldExpiry, now) + periodMs;

        await db.ref(subPath + '/expiresAt').set(newExpiry);
        await db.ref(subPath + '/status').set('active');
        await db.ref(subPath + '/updatedAt').set(now);

        // Record billing
        if (price > 0) {
          const billRef = db.ref('businesses/' + businessId + '/billing').push();
          await billRef.set({
            billingId: billRef.key,
            subscriptionId: currentSub.subscriptionId || 'renew-' + Date.now().toString(36),
            planId: currentPlanId,
            amount: price,
            currency: currentPlan.currency || 'USD',
            status: 'paid',
            billingCycle: billingCycle,
            action: 'renew',
            createdAt: now,
            paidAt: now
          });
        }

        const updated = await db.ref(subPath).once('value');
        return sendSuccess(res, updated.val());
      }

      case 'cancel': {
        await db.ref(subPath).update({
          status: 'cancelled',
          autoRenew: false,
          updatedAt: now
        });
        const updated = await db.ref(subPath).once('value');
        return sendSuccess(res, updated.val());
      }

      default:
        return sendError(res, 'INVALID_REQUEST', 'Hành động không hợp lệ. Hỗ trợ: create, upgrade, downgrade, renew, cancel.');
    }
  }

  // ─── PATCH /.../subscription — Update subscription settings ──────
  if (subMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_MANAGE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    const changes = {};
    ['autoRenew', 'paymentProvider', 'billingCycle'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });

    if (Object.keys(changes).length === 0) {
      return sendError(res, 'INVALID_REQUEST', 'Không có trường nào để cập nhật.');
    }

    changes.updatedAt = Date.now();
    await db.ref('businesses/' + businessId + '/subscription').update(changes);
    const updated = await db.ref('businesses/' + businessId + '/subscription').once('value');
    return sendSuccess(res, updated.val());
  }

  // ─── GET /.../billing — List billing history ─────────────────────
  if (billMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref('businesses/' + businessId + '/billing').once('value');
    const val = snap.val() || {};
    const items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    }).sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    return sendSuccess(res, items);
  }

  // ─── GET /.../billing/{id} — Read billing entry ──────────────────
  if (billItemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref('businesses/' + businessId + '/billing/' + billItemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Giao dịch thanh toán không tồn tại.');
    return sendSuccess(res, Object.assign({ id: billItemMatch[2] }, snap.val()));
  }

  return null;
}

module.exports = { handle };
