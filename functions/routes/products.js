// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/products.js — Multi-Tenant Products Module (Phase 2, Task 7.0).
 *
 * Uses the production middleware pipeline:
 *   verifyAuth() → requireBusiness() → requireRole()
 *
 * Tenant isolation via req.tenant.businessId — NEVER trusts client-supplied
 * businessId. Data stored under /businesses/{businessId}/products/.
 *
 * Legacy /products path remains untouched for backward compatibility.
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');
const { getAll, getOne, add, update, remove } = require('../shared/listResource');

// Valid product roles mapped to required roles for requireRole
const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // Only handle tenant-scoped product paths
  // Legacy /v1/products (flat, non-tenant) handled by cmsLists.js
  if (path.indexOf('/v1/businesses/') !== 0) return null;

  // ─── Authentication & Tenant Context ────────────────────────────────
  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const node = 'businesses/' + businessId + '/products';

  // ─── Pattern: /v1/businesses/{businessId}/products ──────────────
  // List all products (GET) and create product (POST)
  const listPattern = /^\/v1\/businesses\/([^/]+)\/products$/;
  const itemPattern = /^\/v1\/businesses\/([^/]+)\/products\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);

  // ─── GET /v1/businesses/{bid}/products — List ──────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const items = await getAll(node);
    return sendSuccess(res, items);
  }

  // ─── POST /v1/businesses/{bid}/products — Create ────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Tên sản phẩm là bắt buộc.');
    }

    const record = await add(node, {
      name: body.name,
      description: body.description || '',
      price: typeof body.price === 'number' ? body.price : 0,
      originalPrice: typeof body.originalPrice === 'number' ? body.originalPrice : null,
      category: body.category || '',
      images: Array.isArray(body.images) ? body.images : [],
      image: body.image || '',
      slug: body.slug || '',
      status: body.status || 'draft',
      sku: body.sku || '',
      stock: typeof body.stock === 'number' ? body.stock : 0,
      unit: body.unit || '',
      order: typeof body.order === 'number' ? body.order : 0,
      tags: Array.isArray(body.tags) ? body.tags : [],
      featured: !!body.featured,
      businessId: businessId  // stored for query safety
    });

    return sendSuccess(res, record, { status: 201 });
  }

  // ─── GET /v1/businesses/{bid}/products/{id} — Read One ─────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const item = await getOne(node, id);
    if (!item) return sendError(res, 'NOT_FOUND', 'Sản phẩm không tồn tại.');
    return sendSuccess(res, item);
  }

  // ─── PATCH /v1/businesses/{bid}/products/{id} — Update ─────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const body = req.body || {};
    const changes = {};

    // Only allow updating specific fields
    const updatable = ['name', 'description', 'price', 'originalPrice', 'category',
      'images', 'image', 'slug', 'status', 'sku', 'stock', 'unit', 'order',
      'tags', 'featured'];

    updatable.forEach(function(field) {
      if (body[field] !== undefined) {
        changes[field] = body[field];
      }
    });

    const result = await update(node, id, changes);
    if (!result) return sendError(res, 'NOT_FOUND', 'Sản phẩm không tồn tại.');
    return sendSuccess(res, result);
  }

  // ─── DELETE /v1/businesses/{bid}/products/{id} — Delete ────────
  if (itemMatch && req.method === 'DELETE') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const deleted = await remove(node, id);
    if (!deleted) return sendError(res, 'NOT_FOUND', 'Sản phẩm không tồn tại.');
    return sendSuccess(res, { deleted: true, id });
  }

  return null; // not handled
}

module.exports = { handle };
