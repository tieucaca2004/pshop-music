/*
 * routes/drafts.js — Sprint 14 Phase 3 (FINAL mục 17.14). Node RTDB thật
 * `aiDrafts`, đúng `DraftDB` (js/ai/ai-db.js:8). Publish/Reject port từ
 * `publishDraftById()`/`rejectDraftById()` (js/admin-ai.js:627-636) — cùng
 * hành vi: publish gọi `publishToTarget()` rồi đánh dấu Draft
 * `status:'published'`; reject CHỈ đổi status, KHÔNG xoá Draft.
 */
const listResource = require('../shared/listResource');
const { publishToTarget } = require('../shared/publishToTarget');

const NODE = 'aiDrafts';

function isStaff(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (path !== '/v1/drafts' && path.indexOf('/v1/drafts/') !== 0) return null;

  if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được xem/xử lý Nháp.');

  if (path === '/v1/drafts' && req.method === 'GET') {
    return sendSuccess(res, await listResource.getAll(NODE));
  }

  const rest = path.slice('/v1/drafts/'.length);
  const [id, action] = rest.split('/');
  if (!id) return sendError(res, 'INVALID_REQUEST', 'Thiếu id Nháp.');

  if (!action && req.method === 'GET') {
    const draft = await listResource.getOne(NODE, id);
    if (!draft) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Nháp.');
    return sendSuccess(res, draft);
  }

  if (action === 'publish' && req.method === 'POST') {
    const draft = await listResource.getOne(NODE, id);
    if (!draft) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Nháp.');
    try {
      await publishToTarget(draft);
    } catch (err) {
      return sendError(res, 'UPSTREAM_ERROR', 'Publish thất bại: ' + err.message);
    }
    const updated = await listResource.update(NODE, id, { status: 'published', publishedAt: Date.now() });
    return sendSuccess(res, updated);
  }

  if (action === 'reject' && req.method === 'POST') {
    const updated = await listResource.update(NODE, id, { status: 'rejected' });
    if (!updated) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Nháp.');
    return sendSuccess(res, updated);
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Route/method Draft không hợp lệ.');
}

module.exports = { handle };
