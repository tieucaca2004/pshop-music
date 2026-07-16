/*
 * routes/cmsSingletons.js — Sprint 14 Phase 2 (FINAL mục 17.8, 17.10-17.12,
 * 17.22 "Settings" phần site identity/contact). 5 module dạng "1 node = 1
 * object cấu hình", KHÔNG phải danh sách CRUD từng item: Sliders (mảng
 * `siteContent.heroSlides`, ghi đè toàn bộ mảng — đúng hành vi Save-All hiện
 * tại của `admin/sliders.html`, module này KHÔNG thêm add/update/remove
 * từng slide vì client cũng chưa có), Menu (`siteContent.menu`), Footer
 * (`siteContent.footer`), SEO (node riêng `seoSettings`, đúng `SeoDB`), và
 * Settings (phần CÒN LẠI của `siteContent` — identity/contact — KHÔNG cho
 * PATCH đè lên `heroSlides`/`menu`/`footer`, phải dùng đúng endpoint riêng).
 */
const objectResource = require('../shared/objectResource');

const FORBIDDEN_SETTINGS_KEYS = ['heroSlides', 'menu', 'footer'];

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  const staff = auth.ok && (auth.role === 'admin' || auth.role === 'editor');
  const isAdmin = auth.ok && auth.role === 'admin';

  if (path === '/v1/sliders') {
    if (req.method === 'GET') {
      const slides = (await objectResource.getPath('siteContent/heroSlides')) || [];
      return sendSuccess(res, slides);
    }
    if (req.method === 'PUT') {
      if (!staff) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được sửa Slider.');
      if (!Array.isArray(req.body)) return sendError(res, 'INVALID_REQUEST', 'Body phải là 1 mảng Slide.');
      const saved = await objectResource.setPath('siteContent/heroSlides', req.body);
      return sendSuccess(res, saved);
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PUT cho /v1/sliders.');
  }

  if (path === '/v1/menu') {
    if (req.method === 'GET') return sendSuccess(res, (await objectResource.getPath('siteContent/menu')) || null);
    if (req.method === 'PATCH') {
      if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được sửa Menu.');
      return sendSuccess(res, await objectResource.mergePath('siteContent/menu', req.body || {}));
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PATCH cho /v1/menu.');
  }

  if (path === '/v1/footer') {
    if (req.method === 'GET') return sendSuccess(res, (await objectResource.getPath('siteContent/footer')) || null);
    if (req.method === 'PATCH') {
      if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được sửa Footer.');
      return sendSuccess(res, await objectResource.mergePath('siteContent/footer', req.body || {}));
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PATCH cho /v1/footer.');
  }

  if (path === '/v1/seo') {
    if (req.method === 'GET') return sendSuccess(res, (await objectResource.getPath('seoSettings')) || null);
    if (req.method === 'PATCH') {
      if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được sửa SEO.');
      return sendSuccess(res, await objectResource.mergePath('seoSettings', req.body || {}));
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PATCH cho /v1/seo.');
  }

  if (path === '/v1/settings') {
    if (req.method === 'GET') return sendSuccess(res, (await objectResource.getPath('siteContent')) || null);
    if (req.method === 'PATCH') {
      if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được sửa Settings.');
      const body = req.body || {};
      const blocked = FORBIDDEN_SETTINGS_KEYS.filter(k => Object.prototype.hasOwnProperty.call(body, k));
      if (blocked.length) {
        return sendError(res, 'INVALID_REQUEST', 'Dùng đúng endpoint riêng cho: ' + blocked.join(', ') + ' (không sửa qua /v1/settings).');
      }
      return sendSuccess(res, await objectResource.mergePath('siteContent', body));
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET/PATCH cho /v1/settings.');
  }

  return null; // not handled by this router
}

module.exports = { handle };
