/*
 * shared/permissions.js — Permission Middleware (Sprint 14 Phase 1, FINAL
 * mục 6). Port khung RBAC hiện có (js/ai/permission-service.js) sang
 * Backend — CHỈ port khung/bảng quyền, KHÔNG gán quyền cho API nghiệp vụ
 * nào (Products/Categories/... thuộc Phase sau). Role "agent" đưa vào bảng
 * ở dạng ĐỀ XUẤT — CHƯA áp dụng cho route nào cho tới khi có Decision
 * Record riêng được Founder PASS (FINAL mục 6.4) — nguyên nhân KHÔNG viết
 * `role/{uid}` nào cấp "agent" trong Database Rules ở Phase 1 này.
 *
 * Sprint 15 — Agent RBAC Foundation (Founder directive, sau khi xác nhận
 * OpenClaw đã gọi API thật tạo Draft nhưng KHÔNG hề dùng "role: agent" —
 * bảng này khi đó vẫn rỗng, và audit riêng (AGENT_RBAC_AUDIT.md) xác nhận
 * hầu hết route KHÔNG hề tham chiếu bảng này, chỉ kiểm tra cứng
 * role==='admin'/'editor'). "role: agent" giờ CHÍNH THỨC kích hoạt, phạm vi
 * hẹp đúng 4 nhóm Founder chỉ định: Nháp AI (drafts.manage), Blog Draft
 * (ai.generate.blog), Sinh Media (ai.generate.image/imagePrompt), AI Jobs
 * chỉ xem (jobs.view) — KHÔNG có gì khác. Xem AGENT_SERVICE_ACCOUNT_DESIGN.md
 * cho mô hình tài khoản đề xuất, AGENT_RBAC_IMPLEMENTATION_REPORT.md cho chi
 * tiết route nào đã nối vào bảng này.
 */

// ROLE_PERMISSIONS — khung bảng quyền, dùng chung mọi route tương lai.
// "*" = toàn quyền. Danh sách quyền cụ thể (ai.generate.*, structural.write.*...)
// giữ nguyên đặt tên đã có trong js/ai/permission-service.js — không đổi để
// tránh 2 hệ thống tên quyền lệch nhau giữa Frontend cũ và Backend mới.
const ROLE_PERMISSIONS = {
  admin: ['*'],
  editor: [
    'ai.generate.product', 'ai.generate.slider', 'ai.generate.seo', 'ai.generate.faq',
    'ai.generate.blog', 'ai.generate.facebook', 'ai.generate.banner',
    'ai.generate.imagePrompt', 'ai.generate.image', 'ai.readonly.*',
    'facebook.publish', 'media.write'
  ],
  // agent — Sprint 15 Agent RBAC Foundation. Phạm vi hẹp ĐÚNG 4 nhóm Founder
  // chỉ định, không hơn: xem/duyệt/từ chối Nháp AI (KHÔNG xoá — Delete vẫn
  // Admin-only), sinh nội dung Blog + Ảnh/Prompt Ảnh (KHÔNG phải 9 module —
  // chỉ 3), xem AI Jobs (KHÔNG retry/cancel). Không có structural.write.*,
  // không quản lý Users/Webhooks/Self-Healing/Settings.
  agent: [
    'drafts.manage', 'ai.generate.blog', 'ai.generate.image', 'ai.generate.imagePrompt', 'jobs.view'
  ]
};

function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  if (granted.indexOf('*') !== -1) return true;
  if (granted.indexOf(permission) !== -1) return true;
  // Hỗ trợ wildcard dạng "ai.readonly.*" khớp "ai.readonly.qualityScore"
  return granted.some(p => p.endsWith('.*') && permission.startsWith(p.slice(0, -1)));
}

// canAccess(auth, permission) — Sprint 15 Agent RBAC Foundation. Trung tâm
// hoá đúng 1 chỗ pattern "Admin/Editor luôn qua (giữ NGUYÊN hành vi cũ,
// KHÔNG đổi) HOẶC role khác có permission cụ thể qua ROLE_PERMISSIONS" —
// route nào cần mở truy cập hẹp cho "agent" gọi hàm này THAY vì tự viết lại
// `role==='admin'||role==='editor'` cục bộ. Route KHÔNG cần agent truy cập
// (Users/Webhooks/Self-Healing/Settings/Founder Agent...) GIỮ NGUYÊN
// isStaff()/isAdmin() cục bộ như cũ — không bắt buộc đổi toàn bộ codebase
// (đúng "No redesign" — chỉ thêm 1 con đường phụ, không thay con đường cũ).
function canAccess(auth, permission) {
  if (!auth || !auth.ok) return false;
  if (auth.role === 'admin' || auth.role === 'editor') return true;
  return hasPermission(auth.role, permission);
}

module.exports = { ROLE_PERMISSIONS, hasPermission, canAccess };
