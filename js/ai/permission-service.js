/*
 * PermissionService — Permission & Safety Layer cho AI Assistant, mô hình
 * RBAC (Role-Based Access Control). Đây là lớp DUY NHẤT biết ánh xạ
 * Plugin → quyền và Vai trò → quyền — AI Plugin không hard-code quyền, chỉ
 * gọi qua đây để kiểm tra.
 *
 * Đọc vai trò từ đúng node "roles" đã có trong Realtime Database (cùng node
 * js/admin-auth.js dùng để xác thực CMS) — không tạo Database/node mới.
 *
 * Workflow bắt buộc: User → Permission → Queue → AI Provider → Draft. Kiểm
 * tra quyền diễn ra ở lớp UI (js/admin-ai.js, TRƯỚC khi gọi
 * PluginManager.execute()) — không sửa js/ai/plugin-manager.js hay
 * js/ai/job-queue.js để thêm bước này, đúng yêu cầu giữ nguyên 2 module đó.
 * Nếu bị từ chối: không gọi execute() → không tạo Job → không vào Queue →
 * không gọi AI Provider → không tạo Draft. Chỉ ghi 1 Log "permission_denied"
 * (qua LogDB đã có — không xây Logging System mới).
 */
const AI_PERMISSIONS = {
  GENERATE_PRODUCT: 'ai.generate.product',
  GENERATE_SLIDER: 'ai.generate.slider',
  GENERATE_SEO: 'ai.generate.seo',
  GENERATE_FAQ: 'ai.generate.faq', // Sprint 5, Requirement #3 — kích hoạt FAQ Generator (Functional Requirement #4, "thêm Permission phù hợp nếu kiến trúc hiện tại yêu cầu")
  MANAGE_PROVIDERS: 'ai.manage.providers',
  MANAGE_PLUGINS: 'ai.manage.plugins'
};

// Mỗi plugin ứng với đúng 1 quyền "ai.generate.*" — 4 plugin "coming_soon"
// còn lại (Blog Writer, Facebook Post, Banner, Image Prompt) chưa được gán
// quyền, sẽ bổ sung khi kích hoạt ở sprint sau (xem ROADMAP.md).
const PLUGIN_PERMISSIONS = {
  'product-description-writer': AI_PERMISSIONS.GENERATE_PRODUCT,
  'slider-generator': AI_PERMISSIONS.GENERATE_SLIDER,
  'seo-generator': AI_PERMISSIONS.GENERATE_SEO,
  'faq-generator': AI_PERMISSIONS.GENERATE_FAQ
};

// Chỉ Admin mới có ai.manage.providers/ai.manage.plugins (đúng yêu cầu #7:
// chỉ Admin được đổi AI Provider và Plugin Settings). Editor có đủ quyền
// generate — đúng với khả năng Editor đã có trên Dashboard từ trước.
const ROLE_PERMISSIONS = {
  admin: Object.values(AI_PERMISSIONS),
  editor: [AI_PERMISSIONS.GENERATE_PRODUCT, AI_PERMISSIONS.GENERATE_SLIDER, AI_PERMISSIONS.GENERATE_SEO, AI_PERMISSIONS.GENERATE_FAQ]
};

const PermissionService = (function () {
  function getRole(userId) {
    return firebase.database().ref('roles/' + userId).once('value').then(snap => {
      const data = snap.val();
      return data ? data.role : null;
    });
  }

  function hasPermission(role, permission) {
    return !!(role && ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].includes(permission));
  }

  function permissionForPlugin(moduleId) {
    return PLUGIN_PERMISSIONS[moduleId] || null;
  }

  function logDenied(userId, userEmail, moduleId, permission, reason) {
    if (typeof LogDB === 'undefined') return Promise.resolve();
    return LogDB.add({
      timestamp: Date.now(),
      userId, userEmail,
      moduleId,
      provider: 'none',
      jobId: null,
      durationMs: 0,
      status: 'permission_denied',
      errorMessage: reason
    });
  }

  // Kiểm tra quyền chạy 1 plugin — dùng bởi UI TRƯỚC khi gọi
  // PluginManager.loadPlugin(id).execute(). Từ chối thì ghi Log tại đây (Queue
  // chưa từng được gọi tới nên không có Job nào để tự ghi log).
  function checkPluginExecution(userId, userEmail, moduleId) {
    const permission = permissionForPlugin(moduleId);
    if (!permission) {
      const reason = 'Plugin chưa được gán quyền trong PermissionService.';
      return logDenied(userId, userEmail, moduleId, null, reason)
        .then(() => ({ granted: false, permission: null, role: null, reason }));
    }
    return getRole(userId).then(role => {
      if (hasPermission(role, permission)) {
        return { granted: true, permission, role, reason: '' };
      }
      const reason = `Thiếu quyền "${permission}" (vai trò hiện tại: ${role || 'không xác định'}).`;
      return logDenied(userId, userEmail, moduleId, permission, reason)
        .then(() => ({ granted: false, permission, role, reason }));
    });
  }

  return { AI_PERMISSIONS, PLUGIN_PERMISSIONS, ROLE_PERMISSIONS, getRole, hasPermission, permissionForPlugin, checkPluginExecution };
})();
