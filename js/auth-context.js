/*
 * js/auth-context.js — Centralized Authentication & Tenant Context Module.
 *
 * Provides a stable getter API consumed by all shared modules (db.js,
 * cms-db.js, media-library.js, admin-auth.js, workspace-auth.js) instead
 * of reading window globals directly.
 *
 * Exposes:
 *   init()                          → Promise that resolves when auth state is ready
 *   getCurrentUser()                → Firebase user object or null
 *   getCurrentRole()                → role string or null
 *   getCurrentBusinessId()          → business ID string or null
 *   isSuperAdmin()                  → boolean
 *   isBusinessUser()                → boolean (has a businessId claim)
 *   getDataVersion(collection)      → Promise resolving to {version:"migrated"} or null
 *
 * Deferred init: getters called before init() resolves return null/false.
 * Internal state is an unexposed object. getDataVersion() caches by collection
 * name within the same page load.
 *
 * Dependencies: Requires firebase-app-compat, firebase-auth-compat,
 * firebase-database-compat loaded BEFORE this file.
 */
var AuthContext = (function () {
  'use strict';

  // ─── Internal State ────────────────────────────────────────────────
  var state = {
    ready: false,
    user: null,
    role: null,
    businessId: null,
    isSuperAdmin: false,
    isBusinessUser: false,
    dataVersionCache: {}
  };

  var initPromise = null;
  var cacheTTL = 0; // 0 = cache forever within the same page load

  // ─── Role Resolution ────────────────────────────────────────────────
  function resolveRole(decodedClaims, legacyRole) {
    // Priority: custom claims > legacy /roles/{uid}
    if (decodedClaims && decodedClaims.roles) {
      if (decodedClaims.roles.super_admin) return 'super_admin';
      if (decodedClaims.roles.business_admin) return 'business_admin';
      if (decodedClaims.roles.business_editor) return 'business_editor';
      if (decodedClaims.roles.business_viewer) return 'business_viewer';
    }
    // Legacy role (admin/editor from /roles/{uid})
    if (legacyRole) return legacyRole;
    return null;
  }

  // ─── Init: Called once on page load ─────────────────────────────────
  function init() {
    if (initPromise) return initPromise;

    initPromise = new Promise(function (resolve) {
      // Wait for Firebase Auth to initialize
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
          // Not logged in — all getters return null/false
          state.ready = true;
          resolve({ authenticated: false });
          return;
        }

        state.user = user;

        // Fetch custom claims from the ID token
        user.getIdTokenResult().then(function (idTokenResult) {
          var claims = idTokenResult.claims || {};
          state.businessId = claims.businessId || null;
          state.isBusinessUser = !!claims.businessId;

          // Check super_admin claim
          if (claims.roles && claims.roles.super_admin) {
            state.isSuperAdmin = true;
          }

          // Check legacy /roles/{uid} for backward compatibility
          firebase.database().ref('roles/' + user.uid).once('value').then(function (snap) {
            var legacyRole = null;
            if (snap.exists()) {
              var roleData = snap.val();
              legacyRole = (roleData && roleData.role) || roleData;
            }

            state.role = resolveRole(claims, legacyRole);

            // Also check superAdmins/{uid} for super_admin detection
            if (!state.isSuperAdmin) {
              return firebase.database().ref('superAdmins/' + user.uid).once('value').then(function (superSnap) {
                if (superSnap.exists()) {
                  state.isSuperAdmin = true;
                  state.role = 'super_admin';
                }
                state.ready = true;
                resolve({ authenticated: true, role: state.role, businessId: state.businessId });
              });
            }

            state.ready = true;
            resolve({ authenticated: true, role: state.role, businessId: state.businessId });
          }).catch(function () {
            // If /roles/{uid} read fails, still resolve with what we have
            state.ready = true;
            resolve({ authenticated: true, role: state.role, businessId: state.businessId });
          });
        }).catch(function () {
          // If getIdTokenResult fails, role is null
          state.ready = true;
          resolve({ authenticated: true, role: null, businessId: null });
        });
      });
    });

    return initPromise;
  }

  // ─── Getters (safe to call before init() — return null/false) ──────
  function getCurrentUser() {
    return state.ready ? state.user : null;
  }

  function getCurrentRole() {
    return state.ready ? state.role : null;
  }

  function getCurrentBusinessId() {
    return state.ready ? state.businessId : null;
  }

  function isSuperAdmin() {
    return state.ready ? state.isSuperAdmin : false;
  }

  function isBusinessUser() {
    return state.ready ? state.isBusinessUser : false;
  }

  // ─── Migration Data Version ────────────────────────────────────────
  function getDataVersion(collection) {
    // Return cached value if available
    if (state.dataVersionCache.hasOwnProperty(collection)) {
      return Promise.resolve(state.dataVersionCache[collection]);
    }

    return initPromise.then(function () {
      if (!state.businessId) {
        // Legacy user or not logged in — no migration flag
        state.dataVersionCache[collection] = null;
        return null;
      }

      return firebase.database()
        .ref('businesses/' + state.businessId + '/_meta/migration/' + collection)
        .once('value')
        .then(function (snap) {
          var result = snap.exists() ? snap.val() : null;
          state.dataVersionCache[collection] = result;
          return result;
        })
        .catch(function () {
          state.dataVersionCache[collection] = null;
          return null;
        });
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────
  return {
    init: init,
    getCurrentUser: getCurrentUser,
    getCurrentRole: getCurrentRole,
    getCurrentBusinessId: getCurrentBusinessId,
    isSuperAdmin: isSuperAdmin,
    isBusinessUser: isBusinessUser,
    getDataVersion: getDataVersion
  };
})();
