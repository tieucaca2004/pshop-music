// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/founder.js — Sprint 14 Phase 3 (`/v1/founder/home`) + Phase 5
 * (`/v1/ai/one-click-marketing` nối logic thật).
 *
 * - `GET /v1/founder/home` ("Founder Home") — không có đặc tả cụ thể trong
 *   tài liệu, chỉ được liệt kê tên. Thay vì tự bịa 1 khái niệm mới, endpoint
 *   này CHỈ tổng hợp lại các số liệu đã có API đọc thật ở trên (Drafts đang
 *   chờ duyệt, Log gần nhất) — 1 lệnh gọi thay vì Founder/OpenClaw phải tự
 *   gọi 2-3 API riêng để dựng màn hình tổng quan.
 *
 * - `POST /v1/ai/one-click-marketing` ("One Click Marketing orchestration",
 *   mục 17.19) — ĐÚNG nguyên văn tài liệu: "gọi LẠI các API
 *   /v1/ai/{module}/generate ở trên theo đúng 4/6 nhánh đã nối AI thật
 *   (Blog/Facebook/Banner/ImagePrompt), KHÔNG viết logic sinh nội dung
 *   riêng" — orchestration THUẦN, gọi `generateForModule()` (CÙNG hàm 4
 *   route generate dùng), không tự viết prompt/parse nào mới ở đây. Chạy
 *   song song (`Promise.allSettled`) — 1 module lỗi không chặn 3 module còn
 *   lại, trả về kết quả từng module riêng.
 */
const listResource = require('../shared/listResource');
const { generateForModule } = require('../shared/aiGenerate');

function isStaff(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;

  if (path === '/v1/founder/home' && req.method === 'GET') {
    if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được xem Founder Home.');
    const [drafts, logs] = await Promise.all([listResource.getAll('aiDrafts'), listResource.getAll('aiLogs')]);
    const pendingDrafts = drafts.filter(d => d.status === 'draft');
    const recentLogs = logs.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10);
    return sendSuccess(res, {
      pendingDraftsCount: pendingDrafts.length,
      pendingDrafts: pendingDrafts.slice(0, 10),
      recentLogs
    });
  }

  if (path === '/v1/ai/one-click-marketing' && req.method === 'POST') {
    if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng One Click Marketing.');
    const body = req.body || {};
    const { productId, topic, promotion, tone, keywords } = body;
    if (!productId && !topic && !promotion) {
      return sendError(res, 'INVALID_REQUEST', 'Cần ít nhất 1 trong 3: productId, topic, hoặc promotion.');
    }
    let productName = '';
    if (productId) {
      const product = await listResource.getOne('products', productId);
      productName = (product && product.name) || '';
    }

    const jobs = {
      blog: generateForModule('blog-writer', { topic: topic || (productName ? `Giới thiệu ${productName}` : promotion), tone, keywords, productId }, auth.uid, auth.email),
      facebook: generateForModule('facebook-post-generator', { productId, topic, promotion }, auth.uid, auth.email),
      banner: generateForModule('banner-generator', { productId, promotion }, auth.uid, auth.email),
      imagePrompt: generateForModule('image-prompt-generator', { subject: productName || topic || promotion, style: 'Ảnh sản phẩm studio' }, auth.uid, auth.email)
    };
    const keys = Object.keys(jobs);
    const settled = await Promise.allSettled(keys.map(k => jobs[k]));
    const results = {};
    keys.forEach((k, i) => {
      const r = settled[i];
      results[k] = r.status === 'fulfilled' ? { ok: true, draftId: r.value.id } : { ok: false, error: r.reason.message };
    });
    return sendSuccess(res, results);
  }

  return null; // not handled by this router
}

module.exports = { handle };
