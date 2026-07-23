/*
 * routes/tenantCms.js — Phase 1, Customer Workspace CMS sprint.
 *
 * Generic tenant-scoped CRUD for CMS list collections that don't yet have
 * their own dedicated tenant route: Banners/Blog/Videos. (Categories and
 * Products already have dedicated tenant routes with their own extra logic —
 * intentionally excluded here to avoid two URLs managing the same data.)
 *
 * Reuses shared/listResource.js and shared/validation.js verbatim — same
 * primitives the legacy flat cmsLists.js already uses, scoped to
 * businesses/{businessId}/cms/{collection} instead of a flat node.
 *
 * Uses production middleware: verifyAuth() → requireBusiness() → requireRole()
 */
const listResource = require('../shared/listResource');
const { validateSchema } = require('../shared/validation');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

const COLLECTIONS = {
  banners: { createSchema: { title: { required: true, type: 'string' } } },
  blog: { createSchema: { title: { required: true, type: 'string' } } },
  videos: { createSchema: { title: { required: true, type: 'string' }, url: { required: true, type: 'string' } } }
};

const ROUTE_RE = /^\/v1\/businesses\/([^/]+)\/cms\/([^/]+)(?:\/([^/]+))?$/;

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  const match = path.match(ROUTE_RE);
  if (!match) return null;

  const collection = match[2];
  const config = COLLECTIONS[collection];
  if (!config) return null; // not one of ours — not a real 404 here, let other routers/fallback handle it

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const node = 'businesses/' + businessId + '/cms/' + collection;
  const itemId = match[3] || null;

  // ─── GET .../cms/{collection} — List ────────────────────────────────
  if (!itemId && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);
    return sendSuccess(res, await listResource.getAll(node));
  }

  // ─── POST .../cms/{collection} — Create ─────────────────────────────
  if (!itemId && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const check = validateSchema(req.body, config.createSchema);
    if (!check.valid) return sendError(res, 'INVALID_REQUEST', check.issues.join(' '));

    const created = await listResource.add(node, Object.assign({}, req.body || {}, { businessId: businessId }));
    return sendSuccess(res, created, { status: 201 });
  }

  // ─── GET .../cms/{collection}/{id} — Read One ───────────────────────
  if (itemId && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const item = await listResource.getOne(node, itemId);
    if (!item) return sendError(res, 'NOT_FOUND', collection + ' không tồn tại.');
    return sendSuccess(res, item);
  }

  // ─── PATCH .../cms/{collection}/{id} — Update ───────────────────────
  if (itemId && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const updated = await listResource.update(node, itemId, req.body || {});
    if (!updated) return sendError(res, 'NOT_FOUND', collection + ' không tồn tại.');
    return sendSuccess(res, updated);
  }

  // ─── DELETE .../cms/{collection}/{id} — Delete ──────────────────────
  if (itemId && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const deleted = await listResource.remove(node, itemId);
    if (!deleted) return sendError(res, 'NOT_FOUND', collection + ' không tồn tại.');
    return sendSuccess(res, { deleted: true, id: itemId });
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ.');
}

module.exports = { handle };
