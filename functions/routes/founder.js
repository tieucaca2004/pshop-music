/*
 * routes/founder.js — Sprint 14 Phase 3. 2 route KHÔNG có Nguồn cụ thể nào
 * trong FINAL mục 17 (chỉ nhắc tên ở mục 20 Phase 2 gốc, không có bảng chi
 * tiết riêng):
 *
 * - `GET /v1/founder/home` ("Founder Home") — không có đặc tả cụ thể trong
 *   tài liệu, chỉ được liệt kê tên. Thay vì tự bịa 1 khái niệm mới, endpoint
 *   này CHỈ tổng hợp lại các số liệu đã có API đọc thật ở trên (Drafts đang
 *   chờ duyệt, Log gần nhất) — 1 lệnh gọi thay vì Founder/OpenClaw phải tự
 *   gọi 2-3 API riêng để dựng màn hình tổng quan.
 *
 * - `POST /v1/ai/one-click-marketing` ("One Click Marketing orchestration",
 *   mục 17.19) — theo đúng "Lưu ý phụ thuộc" đã ghi ở mục 20 Phase 2 gốc:
 *   hàm này PHẢI gọi lại `/v1/ai/{module}/generate` (Blog/Facebook/Banner/
 *   ImagePrompt) — những API đó CHƯA xây (Phase 4/5, User gọi Phase sau).
 *   Route được mount SẴN ở đây (đúng tinh thần "endpoint xây được ở Phase
 *   này") nhưng trả 503 rõ ràng thay vì giả vờ hoạt động hoặc gọi vào chỗ
 *   không tồn tại — sẽ nối logic thật khi AI Generate APIs xong.
 */
const listResource = require('../shared/listResource');

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
    return sendError(
      res,
      'SERVICE_UNAVAILABLE',
      'One Click Marketing cần gọi /v1/ai/{module}/generate (Blog/Facebook/Banner/Image Prompt) — các API đó chưa được xây (Phase sau, chưa được Founder giao).'
    );
  }

  return null; // not handled by this router
}

module.exports = { handle };
