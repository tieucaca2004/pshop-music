/*
 * shared/subscriptionValidator.js — Subscription Validation Middleware (Phase 4, Task 15.0).
 *
 * Validates subscription status, plan limits, and feature availability
 * for every business request. Called after requireBusiness().
 *
 * Checks:
 *   - Subscription is active
 *   - Plan has not expired
 *   - Feature is available in current plan
 *   - Usage within plan limits
 *
 * Plan limits are stored centrally at /platform/plans/{planId}
 * Business subscription at /businesses/{businessId}/subscription/
 * Usage counters at /businesses/{businessId}/subscription/usage/
 */
const admin = require('firebase-admin');

const DEFAULT_PLANS = {
  free: {
    planId: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'USD',
    usersLimit: 1,
    storageLimit: 100, // MB
    apiLimit: 1000,
    aiCredits: 10000,
    featureFlags: ['cms', 'products', 'orders'],
    isActive: true
  },
  starter: {
    planId: 'starter',
    name: 'Starter',
    monthlyPrice: 29,
    yearlyPrice: 290,
    currency: 'USD',
    usersLimit: 3,
    storageLimit: 1000,
    apiLimit: 10000,
    aiCredits: 100000,
    featureFlags: ['cms', 'products', 'orders', 'customers', 'inventory', 'reports', 'ai'],
    isActive: true
  },
  professional: {
    planId: 'professional',
    name: 'Professional',
    monthlyPrice: 99,
    yearlyPrice: 990,
    currency: 'USD',
    usersLimit: 10,
    storageLimit: 10000,
    apiLimit: 100000,
    aiCredits: 1000000,
    featureFlags: ['cms', 'products', 'orders', 'customers', 'inventory', 'reports', 'ai',
      'integrations', 'facebook', 'telegram'],
    isActive: true
  },
  business: {
    planId: 'business',
    name: 'Business',
    monthlyPrice: 299,
    yearlyPrice: 2990,
    currency: 'USD',
    usersLimit: 50,
    storageLimit: 50000,
    apiLimit: 500000,
    aiCredits: 5000000,
    featureFlags: ['cms', 'products', 'orders', 'customers', 'inventory', 'reports', 'ai',
      'integrations', 'facebook', 'telegram', 'home-assistant', 'white-label'],
    isActive: true
  },
  enterprise: {
    planId: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 999,
    yearlyPrice: 9990,
    currency: 'USD',
    usersLimit: 9999,
    storageLimit: 999999,
    apiLimit: 9999999,
    aiCredits: 99999999,
    featureFlags: ['*'],
    isActive: true
  }
};

/**
 * Returns the plan definition from DB or falls back to defaults.
 */
async function getPlan(planId) {
  const planSnap = await admin.database()
    .ref('platform/plans/' + planId)
    .once('value');
  if (planSnap.exists()) return planSnap.val();
  return DEFAULT_PLANS[planId] || null;
}

/**
 * Lists all available plans (DB or defaults).
 */
async function listPlans() {
  const snap = await admin.database().ref('platform/plans').once('value');
  if (snap.exists()) {
    const val = snap.val();
    return Object.keys(val).map(function(id) { return Object.assign({ planId: id }, val[id]); });
  }
  return Object.keys(DEFAULT_PLANS).map(function(id) { return DEFAULT_PLANS[id]; });
}

/**
 * Validates the business's subscription.
 * Returns { ok: true, plan, subscription } or { ok: false, status, code, error }.
 */
async function validateSubscription(businessId) {
  const subSnap = await admin.database()
    .ref('businesses/' + businessId + '/subscription')
    .once('value');

  if (!subSnap.exists()) {
    // No subscription yet — create a free trial
    return await createTrial(businessId);
  }

  const sub = subSnap.val();
  const now = Date.now();

  // Check status
  if (sub.status === 'cancelled') {
    return { ok: false, status: 402, code: 'SUBSCRIPTION_CANCELLED',
      error: 'Gói đăng ký đã bị hủy. Vui lòng gia hạn để tiếp tục sử dụng.' };
  }
  if (sub.status === 'expired') {
    return { ok: false, status: 402, code: 'SUBSCRIPTION_EXPIRED',
      error: 'Gói đăng ký đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' };
  }

  // Check expiration
  if (sub.expiresAt && sub.expiresAt > 0 && now > sub.expiresAt) {
    // Auto-expire
    await admin.database().ref('businesses/' + businessId + '/subscription/status').set('expired');
    return { ok: false, status: 402, code: 'SUBSCRIPTION_EXPIRED',
      error: 'Gói đăng ký đã hết hạn.' };
  }

  // Check trial
  if (sub.trialEndsAt && sub.trialEndsAt > 0 && now > sub.trialEndsAt) {
    await admin.database().ref('businesses/' + businessId + '/subscription/status').set('expired');
    return { ok: false, status: 402, code: 'TRIAL_EXPIRED',
      error: 'Thời gian dùng thử đã kết thúc. Vui lòng đăng ký gói trả phí.' };
  }

  // Load plan
  const plan = await getPlan(sub.planId || 'free');
  if (!plan) {
    return { ok: false, status: 500, code: 'PLAN_NOT_FOUND',
      error: 'Gói dịch vụ không tồn tại.' };
  }

  return { ok: true, plan: plan, subscription: sub };
}

/**
 * Checks if a specific feature is available in the current plan.
 */
async function checkFeature(businessId, feature) {
  const result = await validateSubscription(businessId);
  if (!result.ok) return result;

  const plan = result.plan;
  const flags = plan.featureFlags || [];

  if (flags.indexOf('*') >= 0) return { ok: true, feature: feature, plan: plan.planId };
  if (flags.indexOf(feature) >= 0) return { ok: true, feature: feature, plan: plan.planId };

  return { ok: false, status: 403, code: 'FEATURE_NOT_AVAILABLE',
    error: 'Tính năng "' + feature + '" không có trong gói ' + (plan.name || plan.planId) + '.' };
}

/**
 * Checks if usage is within plan limits.
 */
async function checkUsageLimit(businessId, limitType) {
  const result = await validateSubscription(businessId);
  if (!result.ok) return result;

  const plan = result.plan;
  const usageSnap = await admin.database()
    .ref('businesses/' + businessId + '/subscription/usage')
    .once('value');
  const usage = usageSnap.val() || {};

  var limit = 0;
  var used = usage[limitType] || 0;
  var limitMap = {
    'users': plan.usersLimit || 9999,
    'storage': plan.storageLimit || 999999,
    'apiCalls': plan.apiLimit || 9999999,
    'aiTokens': plan.aiCredits || 99999999
  };
  limit = limitMap[limitType] || 99999999;

  if (used >= limit) {
    return { ok: false, status: 429, code: 'LIMIT_EXCEEDED',
      error: 'Đã vượt quá giới hạn ' + limitType + ' của gói ' + (plan.name || plan.planId) + ' (' + used + '/' + limit + ').' };
  }

  return { ok: true, used: used, limit: limit, remaining: limit - used };
}

/**
 * Creates a trial subscription for a new business.
 */
async function createTrial(businessId, trialDays) {
  trialDays = trialDays || 14;
  const now = Date.now();
  const trialEndsAt = now + (trialDays * 24 * 60 * 60 * 1000);

  // Prevent duplicate trials
  const existingSnap = await admin.database()
    .ref('businesses/' + businessId + '/subscription/trialUsed')
    .once('value');
  if (existingSnap.val() === true) {
    return { ok: false, status: 402, code: 'TRIAL_ALREADY_USED',
      error: 'Doanh nghiệp này đã sử dụng bản dùng thử.' };
  }

  const subscription = {
    subscriptionId: 'trial-' + Date.now().toString(36),
    businessId: businessId,
    planId: 'starter',
    status: 'active',
    billingCycle: 'trial',
    startAt: now,
    expiresAt: trialEndsAt,
    trialEndsAt: trialEndsAt,
    trialDays: trialDays,
    trialUsed: true,
    autoRenew: false,
    paymentProvider: null,
    createdAt: now,
    updatedAt: now
  };

  await admin.database()
    .ref('businesses/' + businessId + '/subscription')
    .update(subscription);

  return { ok: true, plan: DEFAULT_PLANS.starter, subscription: subscription };
}

/**
 * Increments a usage counter.
 */
async function incrementUsage(businessId, type, amount) {
  amount = amount || 1;
  const ref = admin.database()
    .ref('businesses/' + businessId + '/subscription/usage/' + type);
  try {
    await ref.set(admin.database.ServerValue.increment(amount));
  } catch (err) {
    // Fallback for environments without increment support
    const snap = await ref.once('value');
    await ref.set((snap.val() || 0) + amount);
  }
}

module.exports = {
  getPlan, listPlans, validateSubscription,
  checkFeature, checkUsageLimit, incrementUsage, DEFAULT_PLANS
};
