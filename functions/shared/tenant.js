/*
 * shared/tenant.js — Tenant Context Resolver (Phase 1, Task 1.0).
 *
 * Resolves the active business/tenant context for every authenticated request.
 * Resolution priority:
 *   1. Firebase Auth custom claim (auth.token.businessId)
 *   2. X-Business-Id request header
 *   3. URL path pattern (/v1/businesses/{businessId}/...)
 *   4. Default: "pshop-music" (backward compatible with legacy single-tenant)
 *
 * After resolution, verifies the authenticated UID has access to the identified
 * business (super admin bypass, business member check).
 *
 * Attaches { businessId, uid, role } to req.tenant for downstream middleware
 * and route handlers.
 */
const admin = require('firebase-admin');

// The default/legacy business — all existing PSH data lives here.
const LEGACY_BUSINESS = 'pshop-music';

/**
 * Resolves the businessId from the request context.
 * Returns a businessId string, or null if no business can be determined.
 */
function resolveBusinessId(req) {
  // Priority 1: Firebase Auth custom claim
  if (req.auth && req.auth.businessId) {
    return req.auth.businessId;
  }
  // Priority 2: X-Business-Id request header
  const header = req.get('X-Business-Id');
  if (header && typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  // Priority 3: URL path pattern — /v1/businesses/{businessId}/
  const path = req.path || req.url || '';
  const match = path.match(/\/v1\/businesses\/([^/]+)/);
  if (match) {
    return match[1];
  }
  // Priority 4: Default (legacy single-tenant)
  return LEGACY_BUSINESS;
}

/**
 * Validates that uid has access to the given businessId.
 * Returns { ok: true, role } or { ok: false, error }.
 */
async function validateBusinessAccess(uid, businessId) {
  // Super admin check — platform-wide access
  const superSnap = await admin.database()
    .ref('superAdmins/' + uid)
    .once('value');
  if (superSnap.exists()) {
    const adminData = superSnap.val();
    const role = (adminData && adminData.role) || 'super_admin';
    return { ok: true, role };
  }

  // Business member check
  const memberSnap = await admin.database()
    .ref('businesses/' + businessId + '/users/' + uid)
    .once('value');
  if (memberSnap.exists()) {
    const memberData = memberSnap.val();
    const role = (memberData && memberData.role) || 'business_viewer';
    return { ok: true, role };
  }

  // Legacy check: user exists in /roles/{uid} — grant access to legacy business
  if (businessId === LEGACY_BUSINESS) {
    const legacySnap = await admin.database()
      .ref('roles/' + uid)
      .once('value');
    if (legacySnap.exists()) {
      const roleData = legacySnap.val();
      const role = (roleData && roleData.role) || roleData;
      return { ok: true, role };
    }
  }

  return { ok: false, error: 'Tài khoản không có quyền truy cập vào doanh nghiệp này.' };
}

/**
 * Attaches tenant context to the request object.
 * Must be called AFTER authentication — requires req.auth (from shared/auth.js).
 *
 * Returns { ok: true, businessId, uid, role } on success.
 * Returns { ok: false, status, code, error } on failure.
 */
async function resolveTenant(req) {
  // Must be authenticated first
  if (!req.auth || !req.auth.uid) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Cần xác thực trước khi phân giải tenant.' };
  }

  const uid = req.auth.uid;
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    return { ok: false, status: 400, code: 'INVALID_TENANT', error: 'Không thể xác định doanh nghiệp.' };
  }

  const access = await validateBusinessAccess(uid, businessId);
  if (!access.ok) {
    return { ok: false, status: 403, code: 'TENANT_FORBIDDEN', error: access.error };
  }

  // Attach tenant context to request for downstream middleware/routes
  req.tenant = {
    businessId,
    uid,
    role: access.role
  };

  return { ok: true, businessId, uid, role: access.role };
}

module.exports = { resolveTenant, resolveBusinessId, validateBusinessAccess, LEGACY_BUSINESS };
