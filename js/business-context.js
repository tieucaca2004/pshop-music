/**
 * js/business-context.js — Multi-Tenant Business Context
 *
 * Loads the active business for the current user from businessMembers,
 * patches AuthContext.getEffectiveBusinessId() to return the correct
 * business ID, provides route protection, and displays business info.
 *
 * Must be loaded AFTER firebase-config.js and auth-context.js.
 * Must be loaded BEFORE admin module scripts.
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'psh_active_business';
  var PENDING_KEY = 'psh_pending_business';

  // ─── Get or determine the active business ID ───────────────────────
  function resolveBusinessId(user) {
    // 1. Check URL parameter ?bid=
    var params = new URLSearchParams(window.location.search);
    var bidFromUrl = params.get('bid');
    if (bidFromUrl) {
      localStorage.setItem(STORAGE_KEY, bidFromUrl);
      return Promise.resolve(bidFromUrl);
    }

    // 2. Check localStorage
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return Promise.resolve(stored);

    // 3. Check pending business (set during registration redirect)
    var pending = localStorage.getItem(PENDING_KEY);
    if (pending) {
      localStorage.removeItem(PENDING_KEY);
      localStorage.setItem(STORAGE_KEY, pending);
      return Promise.resolve(pending);
    }

    // 4. Query businessMembers for this user
    if (!user) return Promise.resolve(null);
    return firebase.database().ref('businessMembers').once('value').then(function(snap) {
      var data = snap.val();
      if (!data) return null;

      var uid = user.uid;
      var businessIds = [];

      Object.keys(data).forEach(function(bizId) {
        if (data[bizId] && data[bizId][uid]) {
          businessIds.push({
            businessId: bizId,
            role: data[bizId][uid].role || 'member',
            name: data[bizId][uid].name || '',
            email: data[bizId][uid].email || ''
          });
        }
      });

      if (businessIds.length === 0) return null;

      // Use the first business (most users have only one)
      var biz = businessIds[0];
      localStorage.setItem(STORAGE_KEY, biz.businessId);
      return biz.businessId;
    });
  }

  // ─── Patch AuthContext.getEffectiveBusinessId ──────────────────────
  function patchAuthContext(businessId) {
    if (typeof AuthContext === 'undefined') return;

    // Store original
    var _orig = AuthContext.getEffectiveBusinessId;

    // Override to return our resolved business ID
    AuthContext.getEffectiveBusinessId = function() {
      if (businessId) return businessId;
      return _orig ? _orig() : null;
    };

    // Also set internal business ID if possible
    if (AuthContext.getCurrentBusinessId) {
      var _origBiz = AuthContext.getCurrentBusinessId;
      AuthContext.getCurrentBusinessId = function() {
        if (businessId) return businessId;
        return _origBiz ? _origBiz() : null;
      };
    }
  }

  // ─── Route Protection ─────────────────────────────────────────────
  function protectRoute(user, businessId) {
    // Not authenticated → redirect to login
    if (!user) {
      var returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = '/psh-console/auth.html?redirect=' + returnUrl;
      return false;
    }

    // No business access → redirect to create or pending
    if (!businessId) {
      // Redirect to auth page which will handle auto-creation
      window.location.href = '/psh-console/auth.html';
      return false;
    }

    return true;
  }

  // ─── Display Business Info in Admin Header ─────────────────────────
  function displayBusinessInfo(businessId) {
    if (!businessId) return;

    // Read business info and update header
    firebase.database().ref('businesses/' + businessId + '/info').once('value').then(function(snap) {
      var info = snap.val();
      if (!info) return;

      // Update sidebar brand to show business name
      var brand = document.querySelector('.admin-brand');
      if (brand) {
        var currentText = brand.innerHTML || '';
        if (currentText.indexOf('PSH') >= 0 && info.displayName) {
          brand.innerHTML = brand.innerHTML.replace(/PSH/g, info.displayName);
        }
      }

      // Update topbar with business info
      var topbar = document.querySelector('.admin-topbar div h2');
      if (topbar && info.displayName) {
        topbar.textContent = info.displayName.toUpperCase();
      }
    });

    // Read subscription info
    firebase.database().ref('businesses/' + businessId + '/subscription').once('value').then(function(snap) {
      var sub = snap.val();
      if (!sub) return;

      var userInfo = document.querySelector('.admin-topbar div');
      if (userInfo && sub.plan) {
        // Add plan badge to topbar if it doesn't exist
        var existingBadge = document.querySelector('.plan-badge');
        if (!existingBadge) {
          var badge = document.createElement('span');
          badge.className = 'plan-badge';
          badge.style.cssText = 'font-size:0.65rem;background:var(--primary-light);color:var(--primary);padding:0.15rem 0.5rem;border-radius:4px;margin-left:0.5rem;font-weight:600;text-transform:uppercase';
          badge.textContent = sub.plan;
          userInfo.appendChild(badge);
        }
      }
    });
  }

  // ─── Init ──────────────────────────────────────────────────────────
  function init() {
    // Wait for Firebase Auth
    firebase.auth().onAuthStateChanged(function(user) {
      if (!user) {
        protectRoute(null, null);
        return;
      }

      // Resolve business ID
      resolveBusinessId(user).then(function(businessId) {
        // Patch AuthContext so all data operations use tenant paths
        patchAuthContext(businessId);

        // Route protection
        if (!protectRoute(user, businessId)) return;

        // Display business info in admin header
        displayBusinessInfo(businessId);

        // Store for other scripts to read
        window.__PSH_BUSINESS_ID__ = businessId;

        // Emit event for other scripts
        var event = new CustomEvent('businessContextReady', {
          detail: { businessId: businessId }
        });
        document.dispatchEvent(event);
      });
    });
  }

  // ─── Expose public API ────────────────────────────────────────────
  window.BusinessContext = {
    getCurrentBusinessId: function() {
      return window.__PSH_BUSINESS_ID__ || localStorage.getItem(STORAGE_KEY) || null;
    },
    clear: function() {
      window.__PSH_BUSINESS_ID__ = null;
      localStorage.removeItem(STORAGE_KEY);
    },
    setPendingBusiness: function(bizId) {
      localStorage.setItem(PENDING_KEY, bizId);
    }
  };

  // ─── Start ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
