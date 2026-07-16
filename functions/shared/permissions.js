/*
 * shared/permissions.js — Permission Middleware (Sprint 14 Phase 1, FINAL
 * mục 6). Port khung RBAC hiện có (js/ai/permission-service.js) sang
 * Backend — CHỈ port khung/bảng quyền, KHÔNG gán quyền cho API nghiệp vụ
 * nào (Products/Categories/... thuộc Phase sau). Role "agent" đưa vào bảng
 * ở dạng ĐỀ XUẤT — CHƯA áp dụng cho route nào cho tới khi có Decision
 * Record riêng được Founder PASS (FINAL mục 6.4) — nguyên nhân KHÔNG viết
 * `role/{uid}` nào cấp "agent" trong Database Rules ở Phase 1 này.
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
  // agent: CHƯA kích hoạt — giữ khung sẵn, không gán quyền nào cho tới khi
  // Decision Record được PASS riêng (FINAL mục 6.4).
  agent: []
};

function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  if (granted.indexOf('*') !== -1) return true;
  if (granted.indexOf(permission) !== -1) return true;
  // Hỗ trợ wildcard dạng "ai.readonly.*" khớp "ai.readonly.qualityScore"
  return granted.some(p => p.endsWith('.*') && permission.startsWith(p.slice(0, -1)));
}

module.exports = { ROLE_PERMISSIONS, hasPermission };
