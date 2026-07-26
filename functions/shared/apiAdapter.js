/**
 * shared/apiAdapter.js — Multi-tenant API Adapter Layer (Phase 3).
 * Chuyển tiếp giữa Legacy API và Multi-tenant API.
 * Mọi route mới nhận businessId tường minh.
 * Route cũ giữ nguyên (backward compatible).
 */
const admin = require('firebase-admin');
const db = admin.database();

const BUSINESS_MEMBERS_NODE = 'businessMembers';
const BUSINESSES_NODE = 'businesses';

// Resolve businessId từ request path hoặc token
function resolveBusinessId(req) {
  const match = req.path.match(/\/v1\/businesses\/([^/]+)/);
  if (match) return match[1];
  // Fallback: read from auth context
  if (req.tenant && req.tenant.businessId) return req.tenant.businessId;
  return null;
}

// Check user role trong business
async function checkBusinessRole(authUid, businessId, allowedRoles) {
  if (!authUid || !businessId) return false;
  const snap = await db.ref(BUSINESS_MEMBERS_NODE + '/' + businessId + '/' + authUid + '/role').once('value');
  const role = snap.val();
  if (!role) return false;
  return allowedRoles.indexOf(role) >= 0;
}

// Build multi-tenant ref path
function mtRef(businessId, collection) {
  return db.ref(BUSINESSES_NODE + '/' + businessId + '/' + collection);
}

// Legacy ref (giữ nguyên)
function legacyRef(collection) {
  return db.ref(collection);
}

// Decide which ref to use: legacy for pshop-music, mt for others
function resolveRef(businessId, collection) {
  if (businessId === 'pshop-music') return legacyRef(collection);
  return mtRef(businessId, collection);
}

module.exports = { resolveBusinessId, checkBusinessRole, mtRef, legacyRef, resolveRef };
