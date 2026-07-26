// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/productMedia.js — Product Media & Storage (Phase 2, Task 8.0).
 *
 * Manages product images under tenant-isolated storage paths:
 *   /businesses/{businessId}/products/{productId}/{filename}
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 *
 * Media metadata stored in RTDB at:
 *   /businesses/{businessId}/products/{productId}/media/{mediaId}
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const crypto = require('crypto');

function extractBase64(body) {
  if (body.dataUrl && typeof body.dataUrl === 'string') {
    const m = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { contentType: m[1], base64: m[2] };
  }
  if (body.base64 && typeof body.base64 === 'string') {
    return { contentType: body.contentType || 'application/octet-stream', base64: body.base64 };
  }
  return null;
}

// Allowed roles
const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

function safeFilename(name) {
  return String(name || 'upload.png').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // Pattern: /v1/businesses/{bid}/products/{pid}/media
  const listPattern = /^\/v1\/businesses\/([^/]+)\/products\/([^/]+)\/media$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/products\/([^/]+)\/media\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);

  if (!listMatch && !itemMatch) return null;

  // ─── Authentication & Tenant Context ────────────────────────────────
  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const db = admin.database();
  const bucket = admin.storage().bucket();

  // ─── POST /.../products/{pid}/media — Upload image ──────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const productId = listMatch[2];
    const decoded = extractBase64(req.body || {});
    if (!decoded) return sendError(res, 'INVALID_REQUEST', 'Thiếu dataUrl hoặc base64 hợp lệ.');

    const rawName = (req.body && req.body.filename) || 'product.png';
    const safeName = safeFilename(rawName);
    const storagePath = 'businesses/' + businessId + '/products/' + productId + '/' + Date.now() + '-' + safeName;
    const buffer = Buffer.from(decoded.base64, 'base64');
    const token = crypto.randomUUID();

    // Upload to Storage
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: decoded.contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
          businessId: businessId,
          productId: productId,
          uploadedBy: req.user.uid
        }
      }
    });

    // Save metadata in RTDB
    const mediaRef = db.ref('businesses/' + businessId + '/products/' + productId + '/media').push();
    const mediaRecord = {
      id: mediaRef.key,
      filename: rawName,
      storagePath: storagePath,
      mimeType: decoded.contentType,
      size: buffer.length,
      token: token,
      uploadedAt: admin.database.ServerValue.TIMESTAMP,
      uploadedBy: req.user.uid,
      url: 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/'
        + encodeURIComponent(storagePath) + '?alt=media&token=' + token
    };
    await mediaRef.set(mediaRecord);

    return sendSuccess(res, mediaRecord, { status: 201 });
  }

  // ─── GET /.../products/{pid}/media — List images ────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const productId = listMatch[2];
    const snap = await db.ref('businesses/' + businessId + '/products/' + productId + '/media')
      .once('value');
    const val = snap.val() || {};
    const items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    }).sort(function(a, b) {
      return (b.uploadedAt || 0) - (a.uploadedAt || 0);
    });

    return sendSuccess(res, items);
  }

  // ─── DELETE /.../products/{pid}/media/{mid} — Delete image ──────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const productId = itemMatch[2];
    const mediaId = itemMatch[3];

    // Get metadata
    const snap = await db.ref('businesses/' + businessId + '/products/' + productId + '/media/' + mediaId)
      .once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Media không tồn tại.');
    const record = snap.val();

    // Delete from Storage
    const storagePath = record.storagePath || 'businesses/' + businessId + '/products/' + productId + '/media/' + mediaId;
    try {
      await bucket.file(storagePath).delete();
    } catch (err) {
      if (err.code !== 404) throw err;
      // File already deleted — continue to clean up metadata
    }

    // Delete metadata from RTDB
    await db.ref('businesses/' + businessId + '/products/' + productId + '/media/' + mediaId).remove();

    return sendSuccess(res, { deleted: true, mediaId: mediaId });
  }

  return null; // not handled
}

module.exports = { handle };
