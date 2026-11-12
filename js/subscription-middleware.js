/**
 * js/subscription-middleware.js — Subscription & Billing Context
 *
 * Handles subscription lifecycle, feature access control, trial
 * management, and billing notifications for every Business.
 *
 * Integrates with existing Business Context and AuthContext.
 * Must be loaded AFTER firebase-config.js and business-context.js.
 */
(function() {
  'use strict';

  var TRIAL_DURATION_DAYS = 14;

  // ─── Subscription Model ────────────────────────────────────────────
  function getSubscription(businessId) {
    if (!businessId) return Promise.resolve(null);
    return firebase.database().ref('businesses/' + businessId + '/subscription').once('value')
      .then(function(snap) { return snap.val(); });
  }

  function calculateTrialEnd() {
    var now = Date.now();
    return now + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  }

  function getSubscriptionStatus(sub) {
    if (!sub) return { status: 'unknown', label: 'Unknown', canAccess: false };
    var now = Date.now();
    var status = sub.status || 'trial';

    // Trial expired?
    if (status === 'trial' && sub.trialEnd && now > sub.trialEnd) {
      return { status: 'expired', label: 'Expired', canAccess: false, reason: 'Trial ended' };
    }

    var canAccess = true;
    if (status === 'suspended') canAccess = false;
    if (status === 'cancelled') canAccess = false;
    if (status === 'expired') canAccess = false;

    var labelMap = {
      trial: 'Trial',
      active: 'Active',
      expired: 'Expired',
      suspended: 'Suspended',
      cancelled: 'Cancelled'
    };

    return {
      status: status,
      label: labelMap[status] || status,
      canAccess: canAccess,
      plan: sub.plan || 'starter'
    };
  }

  function getDaysRemaining(sub) {
    if (!sub || !sub.trialEnd) return null;
    var now = Date.now();
    var diff = sub.trialEnd - now;
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  // ─── Feature Access Control ────────────────────────────────────────
  var FEATURE_LIMITS = {
    trial: {
      products: 10,
      blog: 5,
      banners: 3,
      sliders: 3,
      media: 50,
      ai: true,
      users: 1
    },
    starter: {
      products: 50,
      blog: 20,
      banners: 10,
      sliders: 10,
      media: 200,
      ai: true,
      users: 3
    },
    pro: {
      products: -1, // unlimited
      blog: -1,
      banners: -1,
      sliders: -1,
      media: -1,
      ai: true,
      users: 10
    },
    enterprise: {
      products: -1,
      blog: -1,
      banners: -1,
      sliders: -1,
      media: -1,
      ai: true,
      users: -1
    }
  };

  function getFeatureLimits(sub) {
    var plan = (sub && sub.plan) || 'trial';
    return FEATURE_LIMITS[plan] || FEATURE_LIMITS.trial;
  }

  function hasFeatureAccess(feature, sub, count) {
    if (!sub) return false;
    var statusInfo = getSubscriptionStatus(sub);
    if (!statusInfo.canAccess) return false;

    var limits = getFeatureLimits(sub);
    var limit = limits[feature];
    if (limit === -1) return true; // unlimited
    if (limit === undefined) return true; // not limited
    if (count === undefined) return true; // no count check

    return count < limit;
  }

  function isSubscriptionActive(sub) {
    if (!sub) return false;
    var statusInfo = getSubscriptionStatus(sub);
    return statusInfo.canAccess;
  }

  // ─── Notifications ────────────────────────────────────────────────
  function getSubscriptionAlerts(sub) {
    var alerts = [];
    if (!sub) return alerts;

    var daysLeft = getDaysRemaining(sub);
    var statusInfo = getSubscriptionStatus(sub);

    if (statusInfo.status === 'trial') {
      if (daysLeft !== null && daysLeft <= 3) {
        alerts.push({
          type: 'warning',
          icon: '⏰',
          message: 'Trial ends in ' + daysLeft + ' day' + (daysLeft > 1 ? 's' : '') + '. Upgrade to keep full access.'
        });
      } else if (daysLeft !== null && daysLeft <= 7) {
        alerts.push({
          type: 'info',
          icon: 'ℹ️',
          message: 'Your trial has ' + daysLeft + ' days remaining.'
        });
      }
    }

    if (statusInfo.status === 'expired') {
      alerts.push({
        type: 'error',
        icon: '🚫',
        message: 'Subscription expired. Some features are restricted.'
      });
    }

    if (statusInfo.status === 'suspended') {
      alerts.push({
        type: 'error',
        icon: '🔒',
        message: 'Account suspended. Contact support to reactivate.'
      });
    }

    return alerts;
  }

  // ─── Create Trial Subscription ─────────────────────────────────────
  function createTrialSubscription(businessId) {
    if (!businessId) return Promise.resolve(null);
    var now = Date.now();
    var trialEnd = calculateTrialEnd();

    var subscription = {
      plan: 'trial',
      status: 'trial',
      trialStart: now,
      trialEnd: trialEnd,
      billingCycle: 'monthly',
      renewalDate: trialEnd,
      createdAt: now,
      updatedAt: now
    };

    return firebase.database().ref('businesses/' + businessId + '/subscription').set(subscription)
      .then(function() { return subscription; });
  }

  // ─── Admin: Change Plan ────────────────────────────────────────────
  function changePlan(businessId, newPlan, newStatus) {
    if (!businessId) return Promise.reject(new Error('No business ID'));
    var updates = {};
    updates['businesses/' + businessId + '/subscription/plan'] = newPlan;
    updates['businesses/' + businessId + '/subscription/status'] = newStatus || 'active';
    updates['businesses/' + businessId + '/subscription/updatedAt'] = Date.now();
    return firebase.database().ref().update(updates);
  }

  function extendTrial(businessId, extraDays) {
    if (!businessId) return Promise.reject(new Error('No business ID'));
    var ref = firebase.database().ref('businesses/' + businessId + '/subscription/trialEnd');
    return ref.once('value').then(function(snap) {
      var currentEnd = snap.val() || Date.now();
      var newEnd = currentEnd + (extraDays * 24 * 60 * 60 * 1000);
      return ref.set(newEnd);
    });
  }

  function setSubscriptionStatus(businessId, status) {
    if (!businessId) return Promise.reject(new Error('No business ID'));
    return firebase.database().ref('businesses/' + businessId + '/subscription/status').set(status);
  }

  // ─── Middleware: Check Access Before Module Load ────────────────────
  function checkModuleAccess(businessId, moduleName, currentCount) {
    return getSubscription(businessId).then(function(sub) {
      return {
        allowed: hasFeatureAccess(moduleName, sub, currentCount),
        subscription: sub,
        statusInfo: getSubscriptionStatus(sub),
        limits: getFeatureLimits(sub),
        alerts: getSubscriptionAlerts(sub)
      };
    });
  }

  // ─── Public API ────────────────────────────────────────────────────
  window.Subscription = {
    TRIAL_DURATION_DAYS: TRIAL_DURATION_DAYS,

    // Read
    get: getSubscription,
    getStatus: getSubscriptionStatus,
    getDaysRemaining: getDaysRemaining,
    getFeatureLimits: getFeatureLimits,
    getAlerts: getSubscriptionAlerts,

    // Access control
    hasAccess: hasFeatureAccess,
    isActive: isSubscriptionActive,
    checkModule: checkModuleAccess,

    // Write
    createTrial: createTrialSubscription,
    changePlan: changePlan,
    extendTrial: extendTrial,
    setStatus: setSubscriptionStatus,

    // UI helpers
    getPlanLabel: function(plan) {
      var labels = { trial: 'Trial', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
      return labels[plan] || plan || 'Unknown';
    },
    getStatusLabel: function(status) {
      var labels = { trial: 'Trial', active: 'Active', expired: 'Expired', suspended: 'Suspended', cancelled: 'Cancelled' };
      return labels[status] || status || 'Unknown';
    },
    getStatusClass: function(status) {
      var classes = { trial: 'badge-info', active: 'badge-up', expired: 'badge-down', suspended: 'badge-warn', cancelled: 'badge-down' };
      return classes[status] || 'badge-info';
    }
  };

  // ─── Auto-init: inject subscription alerts into dashboard ──────────
  function initAlerts() {
    var businessId = window.__PSH_BUSINESS_ID__ || null;
    if (!businessId && typeof BusinessContext !== 'undefined') {
      businessId = BusinessContext.getCurrentBusinessId();
    }
    if (!businessId) return;

    getSubscription(businessId).then(function(sub) {
      if (!sub) {
        // No subscription yet — auto-create trial
        return createTrialSubscription(businessId);
      }
      return sub;
    }).then(function(sub) {
      if (!sub) return;

      var alerts = getSubscriptionAlerts(sub);
      var container = document.querySelector('.admin-wrap');
      if (!container || alerts.length === 0) return;

      // Inject alerts at top of admin page
      var alertDiv = document.createElement('div');
      alertDiv.id = 'subAlerts';
      alertDiv.style.cssText = 'margin-bottom:1rem';

      alerts.forEach(function(a) {
        var color = a.type === 'error' ? '#fef2f2' : a.type === 'warning' ? '#fffbeb' : '#eef2ff';
        var textColor = a.type === 'error' ? '#991b1b' : a.type === 'warning' ? '#92400e' : '#1e40af';
        alertDiv.innerHTML += '<div style="padding:.65rem .85rem;border-radius:8px;background:' + color + ';color:' + textColor + ';font-size:.82rem;margin-bottom:.35rem;display:flex;align-items:center;gap:.5rem">' +
          '<span>' + a.icon + '</span><span>' + a.message + '</span></div>';
      });

      if (alerts.length > 0) {
        container.insertBefore(alertDiv, container.firstChild);
      }
    });
  }

  // Auto-init after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAlerts);
  } else {
    setTimeout(initAlerts, 800);
  }
})();
