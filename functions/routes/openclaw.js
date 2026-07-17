/*
 * routes/openclaw.js — Sprint 14 Phase 6 (FINAL mục 19, OpenClaw Integration
 * — chuẩn hoá). "Nguyên tắc": OpenClaw KHÔNG BAO GIỜ chạm Firebase trực
 * tiếp, mọi thứ qua API, dùng CHUNG cơ chế Auth/Permission/Rate-Limit như
 * mọi client khác, KHÔNG có quyền đặc biệt — vì vậy KHÔNG có 1 "OpenClaw
 * API" tách biệt/trùng lặp nào ở đây, chỉ có ĐÚNG 1 endpoint discovery duy
 * nhất: `GET /v1/openclaw/capabilities` — trả về danh sách nhóm API đã sẵn
 * sàng theo ĐÚNG quyền thật của người gọi (Admin/Editor/Agent — Agent vẫn
 * RỖNG, chưa kích hoạt) — để OpenClaw tự biết được làm gì, KHÔNG cần đoán/
 * thử-sai qua 403. Mọi request nghiệp vụ thật (đọc/ghi CMS, generate AI,
 * publish...) đi thẳng qua các route đã có ở Phase 1-5, KHÔNG qua endpoint
 * này.
 */
const { hasPermission } = require('../shared/permissions');

const CAPABILITY_GROUPS = [
  { group: 'Read CMS', endpoints: ['GET /v1/products', 'GET /v1/categories', 'GET /v1/blog', 'GET /v1/banners', 'GET /v1/sliders', 'GET /v1/videos'], requires: null },
  { group: 'Create/Update Products', endpoints: ['POST /v1/products', 'PATCH /v1/products/{id}'], requires: 'staff' },
  { group: 'Manage Categories', endpoints: ['POST /v1/categories', 'PATCH /v1/categories/{id}'], requires: 'staff' },
  { group: 'Generate AI Content', endpoints: ['POST /v1/ai/{module}/generate (blog|product-description|seo|facebook-post|banner|image|image-prompt|slider|faq)'], requires: 'staff' },
  { group: 'Manage Drafts', endpoints: ['GET /v1/drafts', 'POST /v1/drafts/{id}/publish', 'POST /v1/drafts/{id}/reject'], requires: 'staff' },
  { group: 'Read Logs/Queue/Jobs', endpoints: ['GET /v1/logs', 'GET /v1/jobs', 'GET /v1/history/conversations'], requires: 'staff' },
  { group: 'Validate/Detect Errors', endpoints: ['GET /v1/system/diagnostics', 'GET /v1/{module}/status', 'POST /v1/{module}/validate'], requires: 'admin' },
  { group: 'Repair (safe operations only, requires explicit call)', endpoints: ['POST /v1/{module}/repair', 'POST /v1/queue/retry'], requires: 'admin' },
  { group: 'Retry Failed Jobs', endpoints: ['POST /v1/jobs/{id}/retry'], requires: 'staff' },
  { group: 'Founder Agent (Plan/Execute)', endpoints: ['POST /v1/agent/plan', 'POST /v1/agent/plan/{id}/steps/{i}/execute'], requires: 'staff' },
  { group: 'Structural Direct Write (create-product/detect-category via Agent)', endpoints: ['(qua Founder Agent, tool group "write-direct")'], requires: 'structural.write.product — KHÔNG mở mặc định, role agent hiện RỖNG' },
  { group: 'Webhook Events', endpoints: ['POST /v1/webhooks', 'GET /v1/events'], requires: 'admin' }
];

function isStaff(auth) { return auth.ok && (auth.role === 'admin' || auth.role === 'editor'); }

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (path !== '/v1/openclaw/capabilities' || req.method !== 'GET') return null;
  if (!auth.ok) return sendError(res, 'UNAUTHENTICATED', auth.error || 'Cần đăng nhập để xem Capabilities.');

  const capabilities = CAPABILITY_GROUPS.map(g => {
    let available;
    if (g.requires === null) available = true;
    else if (g.requires === 'admin') available = auth.role === 'admin';
    else if (g.requires === 'staff') available = isStaff(auth);
    else available = hasPermission(auth.role, g.requires); // permission string, thường false vì role agent rỗng
    return Object.assign({ available }, g);
  });

  return sendSuccess(res, {
    role: auth.role,
    principle: 'OpenClaw dùng chung Auth/Permission/Rate-Limit như mọi client khác — không có quyền đặc biệt, không bao giờ chạm Firebase trực tiếp.',
    capabilities
  });
}

module.exports = { handle };
