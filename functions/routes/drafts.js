// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/drafts.js — Sprint 14 Phase 3 (FINAL mục 17.14). Node RTDB thật
 * `aiDrafts`, đúng `DraftDB` (js/ai/ai-db.js:8). Publish/Reject port từ
 * `publishDraftById()`/`rejectDraftById()` (js/admin-ai.js:627-636) — cùng
 * hành vi: publish gọi `publishToTarget()` rồi đánh dấu Draft
 * `status:'published'`; reject CHỈ đổi status, KHÔNG xoá Draft.
 *
 * `DELETE /v1/drafts/{id}` — Sprint 15, AI Draft Lifecycle Audit (Founder
 * directive). Draft lifecycle trước đây KHÔNG có cách xoá thật (chỉ "reject"
 * đổi status, bản ghi tồn tại vĩnh viễn) — xác nhận qua Audit là 1 khoảng
 * trống thật (AI_DRAFT_AUDIT.md), không phải thiết kế cố ý. Admin-only
 * (đúng nguyên tắc DELETE của mọi module khác trong routes/cmsLists.js —
 * xoá là hành động phá huỷ, giới hạn chặt hơn view/publish/reject).
 *
 * Agent RBAC Foundation (Sprint 15) — View/Publish/Reject giờ dùng
 * `canAccess(auth, 'drafts.manage')` (shared/permissions.js) thay vì
 * `isStaff()` cục bộ — Admin/Editor KHÔNG đổi hành vi (canAccess luôn cho
 * qua 2 role này y hệt isStaff() cũ), CHỈ mở thêm đường cho role "agent" có
 * permission "drafts.manage" (đúng phạm vi Founder chỉ định: xem/duyệt/từ
 * chối, KHÔNG xoá). DELETE giữ NGUYÊN isAdmin() cục bộ, KHÔNG mở cho agent
 * (không nằm trong 4 nhóm được chỉ định).
 */
const listResource = require('../shared/listResource');
const { publishToTarget } = require('../shared/publishToTarget');
const eventBus = require('../shared/eventBus');
const { canAccess } = require('../shared/permissions');

const NODE = 'aiDrafts';
const PERMISSION = 'drafts.manage';

function isAdmin(auth) {
  return auth.ok && auth.role === 'admin';
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (path !== '/v1/drafts' && path.indexOf('/v1/drafts/') !== 0) return null;

  if (!canAccess(auth, PERMISSION)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor/Agent (drafts.manage) được xem/xử lý Nháp.');

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

  if (!action && req.method === 'DELETE') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xoá Nháp.');
    const ok = await listResource.remove(NODE, id);
    if (!ok) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Nháp.');
    return sendSuccess(res, { deleted: true, id });
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
    await eventBus.emit('draft.published', { draftId: id, moduleId: draft.moduleId, targetCollection: draft.targetCollection });
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
