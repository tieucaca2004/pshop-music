/*
 * shared/auth.js — Authentication & Tenant Middleware (Phase 1, Task 6.0).
 *
 * Extended from the original Sprint 14 authenticate() to support multi-tenant:
 *
 * Request pipeline:
 *   verifyAuth(req)        → verify Firebase ID Token → populate req.user
 *   resolveTenant(req)     → resolve businessId → populate req.tenant (from shared/tenant.js)
 *   requireBusiness(req)   → validate business exists & active
 *   requireRole(...roles)  → check user has one of the allowed roles
 *   requireSuperAdmin()    → check user is super admin
 *
 * The original authenticate() is preserved unchanged for backward compatibility
 * with existing routes (openaiProxy, etc.).
 */
const admin = require('firebase-admin');
const { resolveTenant, resolveBusinessId, LEGACY_BUSINESS } = require('./tenant');

// PUBLIC_PATHS — duy nhất GET /v1/health không cần token để uptime monitor/load
// balancer bên ngoài gọi được.
const PUBLIC_PATHS = new Set(['/v1/health']);

// ─── Retained: Original authenticate() — BACKWARD COMPATIBLE ──────────────
//
// Legacy signature used by openaiProxy, facebookRoutes, and the apiGateway's
// initial auth pass. Returns { ok, uid, email, role }.
// Does NOT resolve tenant or check business status.

async function authenticate(req) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Thiếu Authorization Bearer token.' };
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Token không hợp lệ hoặc đã hết hạn.' };
  }
  const roleSnap = await admin.database().ref('roles/' + decoded.uid).once('value');
  if (!roleSnap.exists()) {
    return { ok: false, status: 403, code: 'PERMISSION_DENIED', error: 'Tài khoản chưa được cấp quyền CMS.' };
  }
  const roleData = roleSnap.val();
  const role = (roleData && roleData.role) || roleData;
  return { ok: true, uid: decoded.uid, email: decoded.email || '', role };
}

function isPublicPath(path) {
  return PUBLIC_PATHS.has(path);
}

// ─── New: verifyAuth() — Full Auth Pipeline ───────────────────────────────
//
// Verifies the Firebase ID Token and populates req.user with:
//   { uid, email, role, claims }
// Also attaches the decoded token as req.auth for downstream use by
// shared/tenant.js resolver.

async function verifyAuth(req) {
  const authHeader = req.get('Authorization') || '';
  console.log('[TRACE] verifyAuth ENTER | hasAuthHeader:', /^Bearer .+$/.test(authHeader));
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    console.log('[TRACE] verifyAuth EXIT | ERROR missing token');
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Thiếu Authorization Bearer token.' };
  }
  console.log('[TRACE] verifyAuth INPUT | token prefix:', match[1].slice(0, 12), 'len:', match[1].length);
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
    console.log('[TRACE] verifyAuth OUTPUT | uid:', decoded.uid, 'email:', decoded.email, 'email_verified:', decoded.email_verified, 'claims:', JSON.stringify(decoded.firebase && decoded.firebase.claims || {}));
  } catch (err) {
    console.log('[TRACE] verifyAuth ERROR |', (err && err.message) ? err.message : err);
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Token không hợp lệ hoặc đã hết hạn.' };
  }

  // Attach decoded token for tenant resolver
  req.auth = decoded;

  // Populate req.user
  req.user = {
    uid: decoded.uid,
    email: decoded.email || '',
    claims: decoded.firebase && decoded.firebase.claims ? decoded.firebase.claims : {},
    role: null // resolved in requireBusiness/requireRole
  };

  console.log('[TRACE] verifyAuth EXIT | OK uid:', decoded.uid);
  return { ok: true, uid: decoded.uid, email: decoded.email || '' };
}

// ─── New: requireBusiness() — Business Loading & Validation ──────────────

/**
 * Loads the business record and validates its status.
 * Must be called AFTER verifyAuth().
 * Populates req.tenant with full business context.
 *
 * Supported business statuses:
 *   - active: normal operations
 *   - suspended: returns 402 Payment Required
 *
 * Returns { ok: true, businessId, business, plan, status } on success.
 * Returns { ok: false, status, code, error } on failure.
 */
async function requireBusiness(req) {
  console.log('[TRACE] requireBusiness ENTER | hasAuth:', !!req.auth, '| uid:', req.auth && req.auth.uid);
  // Must be authenticated first
  if (!req.auth || !req.auth.uid) {
    console.log('[TRACE] requireBusiness EXIT | ERROR no auth:');
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Cần xác thực trước khi xác định doanh nghiệp.' };
  }

  // Resolve tenant via shared/tenant.js
  console.log('[TRACE] requireBusiness INPUT | calling resolveTenant');
  const tenant = await resolveTenant(req);
  console.log('[TRACE] requireBusiness OUTPUT | resolveTenant ok:', tenant.ok, '| businessId:', tenant.businessId, '| role:', tenant.role);
  if (!tenant.ok) {
    console.log('[TRACE] requireBusiness EXIT | tenant fail status:', tenant.status, 'code:', tenant.code, 'err:', tenant.error);
    return tenant; // propagate error from tenant resolver
  }

  // Load business info
  const businessSnap = await admin.database()
    .ref('businesses/' + tenant.businessId + '/info')
    .once('value');

  let businessData = null;
  let businessStatus = 'active';
  let businessPlan = null;

  if (businessSnap.exists()) {
    businessData = businessSnap.val();
    businessStatus = businessData.status || 'active';
    businessPlan = businessData.plan || null;
  } else {
    // Legacy business (no /businesses/{id} node yet)
    // Only valid for pshop-music
    if (tenant.businessId !== LEGACY_BUSINESS) {
      return { ok: false, status: 404, code: 'BUSINESS_NOT_FOUND', error: 'Doanh nghiệp không tồn tại.' };
    }
  }

  // Check email verification (skip for super admins — legacy users)
  if (req.auth && !req.auth.email_verified && tenant.role !== 'super_admin') {
    return { ok: false, status: 403, code: 'EMAIL_NOT_VERIFIED', error: 'Vui lòng xác thực email trước khi sử dụng hệ thống.' };
  }

  // Validate business status
  if (businessStatus === 'suspended') {
    return { ok: false, status: 402, code: 'BUSINESS_SUSPENDED', error: 'Doanh nghiệp đã bị tạm ngưng. Vui lòng liên hệ quản trị viên.' };
  }
  if (businessStatus === 'disabled' || businessStatus === 'deleted') {
    return { ok: false, status: 403, code: 'BUSINESS_DISABLED', error: 'Doanh nghiệp không khả dụng.' };
  }

  // Attach tenant context to request
  req.tenant = {
    businessId: tenant.businessId,
    uid: tenant.uid,
    role: tenant.role,
    business: businessData ? {
      displayName: businessData.displayName || tenant.businessId,
      slug: businessData.slug || tenant.businessId,
      status: businessStatus,
      timezone: businessData.timezone || 'Asia/Bangkok',
      currency: businessData.currency || 'VND'
    } : null,
    plan: businessPlan
  };

  // Also set role on req.user
  if (req.user) {
    req.user.role = tenant.role;
  }

  return { ok: true, businessId: tenant.businessId, status: businessStatus, role: tenant.role };
}

// ─── New: requireRole() — RBAC Middleware ─────────────────────────────────

/**
 * Returns a middleware-like check that validates the user has one of the
 * allowed roles.
 *
 * Usage:
 *   const allowed = await requireRole(req, ['super_admin', 'business_admin']);
 *   if (!allowed.ok) return sendError(res, allowed.code, allowed.error);
 *
 * Supports role hierarchy:
 *   super_admin → any business
 *   business_admin → inheritss business_editor + business_viewer
 *   business_editor → inherits business_viewer
 */
const ROLE_HIERARCHY = {
  'super_admin': ['super_admin', 'business_admin', 'business_editor', 'business_viewer'],
  'business_admin': ['business_admin', 'business_editor', 'business_viewer'],
  'business_editor': ['business_editor', 'business_viewer'],
  'business_viewer': ['business_viewer'],
  'admin': ['admin', 'editor'],        // legacy roles
  'editor': ['editor']
};

function getEffectiveRoles(role) {
  return ROLE_HIERARCHY[role] || [role];
}

async function requireRole(req, allowedRoles) {
  const role = (req.tenant && req.tenant.role) || (req.user && req.user.role) || null;
  if (!role) {
    return { ok: false, status: 403, code: 'PERMISSION_DENIED', error: 'Không xác định được vai trò người dùng.' };
  }

  // Super admin bypass — can do anything
  if (role === 'super_admin') {
    return { ok: true, role };
  }

  const effective = getEffectiveRoles(role);
  const hasRole = allowedRoles.some(function(allowed) {
    return effective.indexOf(allowed) >= 0;
  });

  if (!hasRole) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Tài khoản không có quyền thực hiện thao tác này. Cần vai trò: ' + allowedRoles.join(', ') + '.'
    };
  }

  return { ok: true, role };
}

// ─── New: requireSuperAdmin() — Super Admin Check ────────────────────────

/**
 * Validates that the authenticated user is a super admin.
 * Super admins have platform-wide access bypassing tenant restrictions.
 */
async function requireSuperAdmin(req) {
  const role = (req.tenant && req.tenant.role) || (req.user && req.user.role) || null;
  if (role === 'super_admin') {
    return { ok: true };
  }

  // Also check superAdmins node directly
  if (req.user && req.user.uid) {
    const superSnap = await admin.database()
      .ref('superAdmins/' + req.user.uid)
      .once('value');
    if (superSnap.exists()) {
      return { ok: true };
    }
  }

  return { ok: false, status: 403, code: 'SUPER_ADMIN_REQUIRED', error: 'Chỉ Super Admin mới có quyền thực hiện thao tác này.' };
}

// ─── New: fullAuthPipeline() — Complete Flow ──────────────────────────────

/**
 * Runs the full authentication pipeline for multi-tenant routes:
 *   verifyAuth → resolveTenant → requireBusiness → requireRole
 *
 * Returns { ok, ... } with error details on failure.
 * On success, req.user and req.tenant are populated.
 */
async function fullAuthPipeline(req, options) {
  // 1. Verify Firebase ID Token
  const authResult = await verifyAuth(req);
  if (!authResult.ok) return authResult;

  // 2. Resolve tenant & validate business
  const bizResult = await requireBusiness(req);
  if (!bizResult.ok) return bizResult;

  // 3. Role check (if required)
  if (options && options.allowedRoles && options.allowedRoles.length > 0) {
    const roleResult = await requireRole(req, options.allowedRoles);
    if (!roleResult.ok) return roleResult;
  }

  return { ok: true, uid: req.user.uid, businessId: req.tenant.businessId, role: req.tenant.role };
}

// ─── New: requireEmailVerified() — Email Verification Middleware ────────────

/**
 * Checks that the authenticated user has verified their email address.
 * The `email_verified` field comes from the decoded Firebase ID token.
 *
 * Skips check for super admins (legacy users with full platform access).
 *
 * Returns { ok: true } on success.
 * Returns { ok: false, status: 403, code, error } if email is not verified.
 */
async function requireEmailVerified(req) {
  if (!req.auth || !req.auth.uid) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Cần xác thực trước.' };
  }

  // Super admins bypass email verification (legacy)
  if (req.auth.email_verified) {
    return { ok: true };
  }

  // Check superAdmins node directly
  const superSnap = await admin.database()
    .ref('superAdmins/' + req.auth.uid)
    .once('value');
  if (superSnap.exists()) {
    return { ok: true };
  }

  return { ok: false, status: 403, code: 'EMAIL_NOT_VERIFIED', error: 'Vui lòng xác thực email trước khi sử dụng hệ thống.' };
}

module.exports = {
  // Backward compatible (unchanged)
  authenticate,
  isPublicPath,
  PUBLIC_PATHS,

  // New multi-tenant middleware
  verifyAuth,
  requireBusiness,
  requireRole,
  requireSuperAdmin,
  fullAuthPipeline,

  // Email verification
  requireEmailVerified
};
