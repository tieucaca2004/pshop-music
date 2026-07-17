/*
 * routes/webhooks.js — Sprint 14 Phase 6. Đăng ký/huỷ URL nhận Webhook Event
 * (`webhookSubs`) + đọc lại Event log (`apiEvents`, `shared/eventBus.js`) —
 * dự phòng cho client không có URL public để nhận callback (poll thay vì
 * push). Admin-only (đăng ký URL nhận sự kiện hệ thống là hành động vận
 * hành, không phải thao tác CMS thường ngày).
 */
const listResource = require('../shared/listResource');
const { validateSchema } = require('../shared/validation');

const SUBS_NODE = 'webhookSubs';
const EVENTS_NODE = 'apiEvents';

function isAdmin(auth) {
  return auth.ok && auth.role === 'admin';
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;

  if (path === '/v1/webhooks' && req.method === 'GET') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem danh sách Webhook.');
    return sendSuccess(res, await listResource.getAll(SUBS_NODE));
  }

  if (path === '/v1/webhooks' && req.method === 'POST') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được đăng ký Webhook.');
    const check = validateSchema(req.body, { url: { required: true, type: 'string' }, eventType: { required: true, type: 'string' } });
    if (!check.valid) return sendError(res, 'INVALID_REQUEST', check.issues.join(' '));
    if (!/^https:\/\//i.test(req.body.url)) return sendError(res, 'INVALID_REQUEST', 'url phải bắt đầu bằng https://.');
    const sub = await listResource.add(SUBS_NODE, { url: req.body.url, eventType: req.body.eventType, active: true, createdBy: auth.uid });
    return sendSuccess(res, sub, { status: 201 });
  }

  if (path.indexOf('/v1/webhooks/') === 0 && req.method === 'DELETE') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được huỷ Webhook.');
    const id = path.slice('/v1/webhooks/'.length);
    const ok = await listResource.remove(SUBS_NODE, id);
    if (!ok) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Webhook.');
    return sendSuccess(res, { deleted: true, id });
  }

  if (path === '/v1/events' && req.method === 'GET') {
    if (!isAdmin(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được đọc Event log.');
    const all = await listResource.getAll(EVENTS_NODE);
    const eventTypeFilter = req.query && req.query.eventType;
    const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 200);
    const filtered = eventTypeFilter ? all.filter(e => e.eventType === eventTypeFilter) : all;
    const sorted = filtered.sort((a, b) => (b.emittedAt || 0) - (a.emittedAt || 0)).slice(0, limit);
    return sendSuccess(res, sorted);
  }

  return null; // not handled by this router
}

module.exports = { handle };
