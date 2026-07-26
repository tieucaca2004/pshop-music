// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/tenantSettings.js — Phase 1, Customer Workspace CMS sprint.
 *
 * Generic tenant-scoped read/write for the "1 node = 1 config object" style
 * settings: heroSlides (Sliders)/seo/general/theme, all living under the
 * existing businesses/{businessId}/settings node created at registration
 * (registration.js initializeBusinessData) — no new top-level node.
 *
 * Reuses shared/objectResource.js verbatim — same primitive cmsSingletons.js
 * already uses for the legacy flat Sliders/SEO/Settings.
 *
 * heroSlides is an array (Save-All semantics, same as legacy Sliders) → PUT.
 * seo/general/theme are objects (shallow-merge, same as legacy SEO/Settings) → PATCH.
 *
 * Uses production middleware: verifyAuth() → requireBusiness() → requireRole()
 */
const objectResource = require('../shared/objectResource');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];

const KEYS = ['heroSlides', 'seo', 'general', 'theme'];

const ROUTE_RE = /^\/v1\/businesses\/([^/]+)\/settings\/([^/]+)$/;

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  const match = path.match(ROUTE_RE);
  if (!match) return null;

  const key = match[2];
  if (KEYS.indexOf(key) < 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const nodePath = 'businesses/' + businessId + '/settings/' + key;

  if (req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);
    const value = await objectResource.getPath(nodePath);
    return sendSuccess(res, key === 'heroSlides' ? (value || []) : (value || null));
  }

  if (key === 'heroSlides' && req.method === 'PUT') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);
    if (!Array.isArray(req.body)) return sendError(res, 'INVALID_REQUEST', 'Body phải là 1 mảng Slide.');
    return sendSuccess(res, await objectResource.setPath(nodePath, req.body));
  }

  if ((key === 'seo' || key === 'general' || key === 'theme') && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);
    return sendSuccess(res, await objectResource.mergePath(nodePath, req.body || {}));
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ cho key này.');
}

module.exports = { handle };
