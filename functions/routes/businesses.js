/*
 * routes/businesses.js — Business Onboarding & CRUD (Phase 1, Task 3.0).
 *
 * Manages the business/tenant lifecycle:
 *   CREATE — onboard a new business with default structure
 *   GET    — list all businesses (super admin) or read one
 *   PATCH  — update business info
 *   DELETE — soft-delete a business
 *
 * All endpoints require super_admin role.
 */
const admin = require('firebase-admin');
const { resolveBusinessId } = require('../shared/tenant');
const { verifyAuth, requireBusiness, requireRole, requireSuperAdmin } = require('../shared/auth');

const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise'];
const DEFAULT_TZ = 'Asia/Bangkok';
const DEFAULT_CURRENCY = 'VND';
const DEFAULT_COUNTRY = 'VN';
const DEFAULT_LANG = 'vi';

/**
 * Generates a URL-safe slug from displayName.
 */
function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'business';
}

/**
 * Builds the initial business tree structure.
 */
function buildBusinessTree(input) {
  const now = admin.database.ServerValue.TIMESTAMP;
  return {
    info: {
      businessId: input.businessId,
      slug: input.slug || makeSlug(input.displayName),
      displayName: input.displayName,
      ownerUid: input.ownerUid,
      status: input.status || 'active',
      plan: input.plan || 'free',
      createdAt: now,
      updatedAt: now,
      timezone: input.timezone || DEFAULT_TZ,
      currency: input.currency || DEFAULT_CURRENCY,
      country: input.country || DEFAULT_COUNTRY,
      language: input.language || DEFAULT_LANG,
      description: input.description || ''
    },
    settings: {
      seo: { title: input.displayName, description: '' },
      theme: { primaryColor: '#4F46E5', secondaryColor: '#10B981' },
      ai: { defaultProvider: 'openai', defaultModel: 'gpt-4o-mini' },
      general: {}
    },
    users: {
      [input.ownerUid]: {
        role: 'business_admin',
        email: input.ownerEmail || '',
        displayName: input.ownerName || input.displayName || 'Owner',
        assignedAt: admin.database.ServerValue.TIMESTAMP
      }
    },
    subscription: {
      plan: input.plan || 'free',
      status: 'active',
      currentPeriodStart: admin.database.ServerValue.TIMESTAMP,
      trialEndsAt: null,
      usage: { aiTokens: 0, storageMb: 0, apiCalls: 0, staffCount: 1 }
    }
  };
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // ─── Self-service Business Profile (before super_admin guard) ────
  // /v1/businesses/{id}/profile — owner can view/edit their own profile
  const profileMatch = path.match(/^\/v1\/businesses\/([^/]+)\/profile$/);
  if (profileMatch) {
    // Authenticate and resolve tenant context
    const authRes = await verifyAuth(req);
    if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

    const bizRes = await requireBusiness(req);
    if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

    // Business admin role required (owner/administrator)
    const roleRes = await requireRole(req, ['super_admin', 'business_admin']);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const businessId = req.tenant.businessId;
    const db = admin.database();
    const infoRef = 'businesses/' + businessId + '/info';

    // GET /v1/businesses/{id}/profile — View own profile
    if (req.method === 'GET') {
      const snap = await db.ref(infoRef).once('value');
      if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Business không tồn tại.');
      return sendSuccess(res, Object.assign({ businessId: businessId }, snap.val()));
    }

    // PATCH /v1/businesses/{id}/profile — Edit own profile
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const changes = {};

      // Editable fields — only accept known profile fields
      const editable = ['displayName', 'description', 'logo', 'coverImage', 'email',
        'phone', 'website', 'address', 'workingHours', 'timezone',
        'brandInformation', 'socialLinks'];

      editable.forEach(function(f) {
        if (body[f] !== undefined) changes[f] = body[f];
      });

      if (Object.keys(changes).length === 0) {
        return sendError(res, 'INVALID_REQUEST', 'Không có trường nào để cập nhật.');
      }

      // Reject changing ownerUid, businessId, slug (immutable fields)
      if (changes.ownerUid !== undefined || changes.businessId !== undefined || changes.slug !== undefined) {
        return sendError(res, 'INVALID_REQUEST', 'Không thể thay đổi ownerUid, businessId hoặc slug.');
      }

      changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
      await db.ref(infoRef).update(changes);

      const updated = await db.ref(infoRef).once('value');
      return sendSuccess(res, Object.assign({ businessId: businessId }, updated.val()));
    }

    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET và PATCH cho profile.');
  }

  // All business operations require super_admin — use production middleware
  // verifyAuth() must run first so req.user is populated for requireSuperAdmin()'s
  // superAdmins/{uid} RTDB check (otherwise req.user is undefined and the check
  // silently never runs, always falling through to the 403 branch below).
  const authCheck = await verifyAuth(req);
  if (!authCheck.ok) {
    if (path.indexOf('/v1/businesses') === 0) {
      return sendError(res, authCheck.code, authCheck.error);
    }
    return null;
  }

  const superCheck = await requireSuperAdmin(req);
  if (!superCheck.ok) {
    if (path.indexOf('/v1/businesses') === 0) {
      return sendError(res, superCheck.code, superCheck.error);
    }
    return null; // not a business path, let other routers handle it
  }

  const db = admin.database();
  const ref = db.ref('businesses');

  // ─── POST /v1/businesses — Create new business ─────────────────────
  if (path === '/v1/businesses' && req.method === 'POST') {
    const body = req.body || {};
    const { businessId, displayName, slug, ownerUid } = body;

    // Validate required fields
    if (!businessId || typeof businessId !== 'string') return sendError(res, 'INVALID_REQUEST', 'businessId là bắt buộc.');
    if (!displayName || typeof displayName !== 'string') return sendError(res, 'INVALID_REQUEST', 'displayName là bắt buộc.');
    if (!ownerUid || typeof ownerUid !== 'string') return sendError(res, 'INVALID_REQUEST', 'ownerUid là bắt buộc.');

    // Format validation
    if (!/^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/.test(businessId)) {
      return sendError(res, 'INVALID_REQUEST', 'businessId chỉ gồm chữ thường, số và dấu gạch ngang (3-64 ký tự).');
    }

    // Check duplicate businessId
    const existingSnap = await ref.child(businessId).child('info/businessId').once('value');
    if (existingSnap.exists()) return sendError(res, 'CONFLICT', 'businessId "' + businessId + '" đã tồn tại.');

    // Check duplicate slug (if explicit slug provided)
    const resolvedSlug = slug || makeSlug(displayName);
    if (slug) {
      const slugSnap = await ref.once('value');
      let slugTaken = false;
      slugSnap.forEach(function(snap) {
        const info = snap.val() && snap.val().info;
        if (info && info.slug === slug) slugTaken = true;
      });
      if (slugTaken) return sendError(res, 'CONFLICT', 'Slug "' + slug + '" đã được sử dụng.');
    }

    // Validate ownerUid exists in Firebase Auth
    try {
      await admin.auth().getUser(ownerUid);
    } catch (err) {
      return sendError(res, 'INVALID_REQUEST', 'ownerUid "' + ownerUid + '" không tồn tại trong hệ thống.');
    }

    // Validate plan
    const plan = body.plan || 'free';
    if (VALID_PLANS.indexOf(plan) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'plan phải là: ' + VALID_PLANS.join(', ') + '.');
    }

    // Build and write business tree
    const tree = buildBusinessTree({
      businessId,
      slug: resolvedSlug,
      displayName,
      ownerUid,
      ownerEmail: body.ownerEmail || '',
      ownerName: body.ownerName || '',
      plan,
      status: body.status || 'active',
      timezone: body.timezone || DEFAULT_TZ,
      currency: body.currency || DEFAULT_CURRENCY,
      country: body.country || DEFAULT_COUNTRY,
      language: body.language || DEFAULT_LANG,
      description: body.description || ''
    });

    // Atomic write — all or nothing
    const updates = {};
    updates['businesses/' + businessId] = tree;
    updates['registry/' + businessId] = {
      name: displayName,
      slug: resolvedSlug,
      created: admin.database.ServerValue.TIMESTAMP
    };
    await db.ref().update(updates);

    return sendSuccess(res, {
      businessId,
      slug: resolvedSlug,
      displayName,
      ownerUid,
      plan,
      status: tree.info.status,
      timezone: tree.info.timezone,
      currency: tree.info.currency,
      country: tree.info.country,
      language: tree.info.language,
      createdAt: Date.now()
    }, { status: 201 });
  }

  // ─── GET /v1/businesses — List all ────────────────────────────────
  if (path === '/v1/businesses' && req.method === 'GET') {
    const snap = await ref.once('value');
    const val = snap.val() || {};
    const list = Object.keys(val).map(function(id) {
      const info = (val[id] && val[id].info) || {};
      return {
        businessId: id,
        displayName: info.displayName || id,
        slug: info.slug || '',
        ownerUid: info.ownerUid || '',
        status: info.status || 'unknown',
        plan: info.plan || '',
        createdAt: info.createdAt || null
      };
    });
    return sendSuccess(res, list);
  }

  // ─── GET /v1/businesses/{businessId} — Read one ──────────────────
  const matchPath = path.match(/^\/v1\/businesses\/([^/]+)$/);
  if (matchPath && req.method === 'GET') {
    const bid = matchPath[1];
    const snap = await ref.child(bid).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Business không tồn tại.');
    return sendSuccess(res, Object.assign({ businessId: bid }, snap.val()));
  }

  return null;
}

module.exports = { handle };
