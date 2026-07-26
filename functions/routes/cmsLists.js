// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/cmsLists.js — Sprint 14 Phase 2 (FINAL mục 20 Phase 1 gốc, đổi số
 * Phase theo điều chỉnh Founder; mục 17.2-17.9). CRUD API cho 7 module CMS
 * dạng danh sách: Products/Categories/Brands/Tags/Blog/Banners/Videos.
 *
 * Products/Categories/Blog/Banners/Videos NGUỒN THẬT = đúng node RTDB đang
 * dùng bởi `DB`/`CategoryDB`/`BlogDB`/`BannerDB`/`VideoDB` phía client
 * (js/db.js, js/cms-db.js) — KHÔNG đổi field/shape, chỉ thêm đường ghi API.
 * Brands/Tags là node MỚI HOÀN TOÀN, đúng quyết định tài liệu FINAL mục
 * 17.4/17.5 ("cần DB node + CRUD mới") — hiện tại `brand`/`tags` trên
 * Product/Blog VẪN là field tự do như cũ, module này KHÔNG tự động đồng bộ
 * 2 phía (ngoài phạm vi Phase 2 — chỉ xây API, chưa đổi UI Admin).
 */
const listResource = require('../shared/listResource');
const { validateSchema } = require('../shared/validation');

function activeFilter(items) {
  return items.filter(i => i.active !== false);
}
function productFilter(items) {
  return items.filter(i => (i.pubStatus || 'published') === 'published');
}
function blogFilter(items) {
  return items.filter(i => i.status === 'published');
}

const MODULES = {
  products: { node: 'products', createSchema: { name: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: productFilter },
  categories: { node: 'categories', createSchema: { code: { required: true, type: 'string' }, label: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: activeFilter },
  brands: { node: 'brands', createSchema: { name: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: activeFilter },
  tags: { node: 'tags', createSchema: { name: { required: true, type: 'string' } }, patchable: false, deletable: true, publicFilter: null },
  blog: { node: 'blogPosts', createSchema: { title: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: blogFilter, slugLookup: true },
  banners: { node: 'banners', createSchema: { title: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: activeFilter },
  videos: { node: 'videos', createSchema: { title: { required: true, type: 'string' }, url: { required: true, type: 'string' } }, patchable: true, deletable: true, publicFilter: activeFilter },
};

const MODULE_PATH_RE = /^\/v1\/(products|categories|brands|tags|blog|banners|videos)(?:\/([^/]+))?$/;

function matchRoute(path) {
  const m = path.match(MODULE_PATH_RE);
  if (!m) return null;
  return { moduleKey: m[1], itemKey: m[2] || null, config: MODULES[m[1]] };
}

function isStaffRole(role) {
  return role === 'admin' || role === 'editor';
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const route = matchRoute(req.__pshPath);
  if (!route) return null; // not handled by this router
  const { moduleKey, itemKey, config } = route;
  const staff = auth.ok && isStaffRole(auth.role);

  if (req.method === 'GET' && !itemKey) {
    let items = await listResource.getAll(config.node);
    if (!staff && config.publicFilter) items = config.publicFilter(items);
    return sendSuccess(res, items);
  }

  if (req.method === 'GET' && itemKey) {
    let item = await listResource.getOne(config.node, itemKey);
    if (!item && config.slugLookup) {
      const all = await listResource.getAll(config.node);
      item = all.find(i => i.slug === itemKey) || null;
    }
    if (!item) return sendError(res, 'NOT_FOUND', moduleKey + ' không tồn tại.');
    if (!staff && config.publicFilter && config.publicFilter([item]).length === 0) {
      return sendError(res, 'NOT_FOUND', moduleKey + ' không tồn tại.');
    }
    return sendSuccess(res, item);
  }

  if (req.method === 'POST' && !itemKey) {
    if (!staff) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được tạo mới.');
    const check = validateSchema(req.body, config.createSchema);
    if (!check.valid) return sendError(res, 'INVALID_REQUEST', check.issues.join(' '));
    const created = await listResource.add(config.node, req.body || {});
    return sendSuccess(res, created, { status: 201 });
  }

  if (req.method === 'PATCH' && itemKey) {
    if (!config.patchable) return sendError(res, 'METHOD_NOT_ALLOWED', moduleKey + ' không hỗ trợ PATCH.');
    if (!staff) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được sửa.');
    const updated = await listResource.update(config.node, itemKey, req.body || {});
    if (!updated) return sendError(res, 'NOT_FOUND', moduleKey + ' không tồn tại.');
    return sendSuccess(res, updated);
  }

  if (req.method === 'DELETE' && itemKey) {
    if (!config.deletable) return sendError(res, 'METHOD_NOT_ALLOWED', moduleKey + ' không hỗ trợ xoá.');
    if (!auth.ok || auth.role !== 'admin') return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xoá.');
    const ok = await listResource.remove(config.node, itemKey);
    if (!ok) return sendError(res, 'NOT_FOUND', moduleKey + ' không tồn tại.');
    return sendSuccess(res, { deleted: true, id: itemKey });
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ cho route này.');
}

module.exports = { handle, matchRoute, MODULES, activeFilter, productFilter, blogFilter };
