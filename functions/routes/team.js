// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/team.js — Team Management (Self-Service, Sprint: Business Profile + Team Management).
 *
 * Business Owner can invite, list, update, and remove team members
 * within their own tenant. Members receive business_editor or business_viewer role.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ALLOWED_ROLES = ['business_editor', 'business_viewer'];
const ROLE_MANAGE = ['super_admin', 'business_admin'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // Only handle team paths
  if (path.indexOf('/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  // ─── Route patterns ──────────────────────────────────────────────
  const invitePattern = /^\/v1\/businesses\/([^/]+)\/team\/invite$/;
  const listPattern = /^\/v1\/businesses\/([^/]+)\/team$/;
  const memberPattern = /^\/v1\/businesses\/([^/]+)\/team\/([^/]+)$/;

  const inviteMatch = path.match(invitePattern);
  const listMatch = path.match(listPattern);
  const memberMatch = path.match(memberPattern);

  // Not a team route — pass through to the next handler
  if (!inviteMatch && !listMatch && !memberMatch) return null;

  // Team management requires business_admin or super_admin
  const roleRes = await requireRole(req, ROLE_MANAGE);
  if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

  const businessId = req.tenant.businessId;
  const callerUid = req.user.uid;
  const db = admin.database();
  const usersRef = 'businesses/' + businessId + '/users';

  // ─── POST /.../team/invite — Invite team member ──────────────────
  if (inviteMatch && req.method === 'POST') {
    const body = req.body || {};
    if (!body.email || typeof body.email !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Email là bắt buộc.');
    }
    if (!body.role || ALLOWED_ROLES.indexOf(body.role) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'role phải là: ' + ALLOWED_ROLES.join(', ') + '.');
    }

    // Check for duplicate email in this business
    const existingSnap = await db.ref(usersRef).once('value');
    if (existingSnap.exists()) {
      var dup = false;
      existingSnap.forEach(function(s) {
        if (s.val().email === body.email) dup = true;
      });
      if (dup) {
        return sendError(res, 'CONFLICT', 'Email "' + body.email + '" đã là thành viên của doanh nghiệp này.');
      }
    }

    // Check if email already exists in Firebase Auth
    try {
      await admin.auth().getUserByEmail(body.email);
      return sendError(res, 'CONFLICT', 'Email "' + body.email + '" đã được sử dụng bởi tài khoản khác.');
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        return sendError(res, 'PROVIDER_ERROR', 'Lỗi xác thực email: ' + err.message);
      }
    }

    // Create Firebase Auth user
    const tempPassword = 'Temp@' + Math.random().toString(36).slice(2, 10);
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: body.email,
        password: tempPassword,
        displayName: body.displayName || '',
        emailVerified: false
      });
    } catch (err) {
      return sendError(res, 'INVALID_REQUEST', 'Tạo tài khoản thất bại: ' + err.message);
    }

    const uid = userRecord.uid;

    // Set custom claims
    await admin.auth().setCustomUserClaims(uid, {
      businessId: businessId,
      roles: (function() {
        var r = {};
        r[body.role] = true;
        return r;
      })()
    });

    // Add to business users
    const now = admin.database.ServerValue.TIMESTAMP;
    const memberRecord = {
      role: body.role,
      email: body.email,
      displayName: body.displayName || '',
      assignedAt: now,
      invitedBy: callerUid,
      isOwner: false
    };
    await db.ref(usersRef + '/' + uid).set(memberRecord);

    return sendSuccess(res, {
      uid: uid,
      email: body.email,
      role: body.role,
      displayName: body.displayName || '',
      tempPassword: tempPassword,
      message: 'Mời thành viên thành công. Tài khoản đã được tạo.'
    }, { status: 201 });
  }

  // ─── GET /.../team — List team members ──────────────────────────
  if (listMatch && req.method === 'GET') {
    const snap = await db.ref(usersRef).once('value');
    const val = snap.val() || {};
    const members = Object.keys(val).map(function(uid) {
      return Object.assign({ uid: uid }, val[uid]);
    }).sort(function(a, b) {
      // Owner first, then by role, then by name
      if (a.isOwner && !b.isOwner) return -1;
      if (!a.isOwner && b.isOwner) return 1;
      return (a.displayName || a.email).localeCompare(b.displayName || b.email);
    });

    return sendSuccess(res, members);
  }

  // ─── PATCH /.../team/{uid} — Update member role ─────────────────
  if (memberMatch && req.method === 'PATCH') {
    const uid = memberMatch[2];

    // Cannot modify self
    if (uid === callerUid) {
      return sendError(res, 'INVALID_REQUEST', 'Bạn không thể thay đổi vai trò của chính mình.');
    }

    const snap = await db.ref(usersRef + '/' + uid).once('value');
    if (!snap.exists()) {
      return sendError(res, 'NOT_FOUND', 'Thành viên không tồn tại.');
    }

    const member = snap.val();

    // Cannot modify owner
    if (member.isOwner) {
      return sendError(res, 'INVALID_REQUEST', 'Không thể thay đổi vai trò của chủ doanh nghiệp.');
    }

    const body = req.body || {};
    if (!body.role || ALLOWED_ROLES.indexOf(body.role) < 0) {
      return sendError(res, 'INVALID_REQUEST', 'role phải là: ' + ALLOWED_ROLES.join(', ') + '.');
    }

    // Update role in database
    await db.ref(usersRef + '/' + uid + '/role').set(body.role);

    // Update custom claims
    await admin.auth().setCustomUserClaims(uid, {
      businessId: businessId,
      roles: (function() {
        var r = {};
        r[body.role] = true;
        return r;
      })()
    });

    const updated = await db.ref(usersRef + '/' + uid).once('value');
    return sendSuccess(res, Object.assign({ uid: uid }, updated.val()));
  }

  // ─── DELETE /.../team/{uid} — Remove member ─────────────────────
  if (memberMatch && req.method === 'DELETE') {
    const uid = memberMatch[2];

    // Cannot remove self
    if (uid === callerUid) {
      return sendError(res, 'INVALID_REQUEST', 'Bạn không thể tự xóa mình khỏi doanh nghiệp.');
    }

    const snap = await db.ref(usersRef + '/' + uid).once('value');
    if (!snap.exists()) {
      return sendError(res, 'NOT_FOUND', 'Thành viên không tồn tại.');
    }

    const member = snap.val();

    // Cannot remove owner
    if (member.isOwner) {
      return sendError(res, 'INVALID_REQUEST', 'Không thể xóa chủ doanh nghiệp.');
    }

    // Remove from business users
    await db.ref(usersRef + '/' + uid).remove();

    // Remove legacy roles entry if exists
    try {
      await db.ref('roles/' + uid).remove();
    } catch (_) {}

    // Clear custom claims (remove businessId and role)
    await admin.auth().setCustomUserClaims(uid, {});

    return sendSuccess(res, { removed: true, uid: uid, message: 'Thành viên đã được xóa khỏi doanh nghiệp.' });
  }

  return null;
}

module.exports = { handle };
