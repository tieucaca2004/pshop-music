/*
 * shared/response.js — Standard Response/Error Format (Sprint 14 Phase 1,
 * SPRINT14_API_ARCHITECTURE_FINAL.md mục 10-11). Dùng CHUNG cho mọi route
 * mới đi qua API Gateway — KHÔNG áp dụng ngược lại cho openaiProxy/Facebook
 * Functions hiện có (giữ nguyên response shape cũ, tránh phá vỡ client đang
 * chạy — đó là việc của Phase 4 khi bọc lại Media AI thành API thật).
 */

const ERROR_CODES = {
  INVALID_REQUEST: 400,
  INVALID_WEBHOOK: 400,
  INVALID_TENANT: 400,
  UNAUTHENTICATED: 401,
  MISSING_API_KEY: 401,
  INVALID_AUTH_FORMAT: 401,
  INVALID_API_KEY: 401,
  API_KEY_NOT_FOUND: 401,
  PERMISSION_DENIED: 403,
  FORBIDDEN: 403,
  SUPER_ADMIN_REQUIRED: 403,
  TENANT_FORBIDDEN: 403,
  BUSINESS_DISABLED: 403,
  API_KEY_INACTIVE: 403,
  API_KEY_EXPIRED: 403,
  INVALID_CLAIMS: 403,
  FEATURE_NOT_AVAILABLE: 403,
  EMAIL_NOT_VERIFIED: 403,
  AUTH_FAILED: 403,
  NOT_FOUND: 404,
  BUSINESS_NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  METHOD_NOT_ALLOWED: 405,
  BUSINESS_SUSPENDED: 402,
  SUBSCRIPTION_CANCELLED: 402,
  SUBSCRIPTION_EXPIRED: 402,
  TRIAL_EXPIRED: 402,
  TRIAL_ALREADY_USED: 402,
  PAYMENT_FAILED: 402,
  REFUND_FAILED: 402,
  RATE_LIMITED: 429,
  LIMIT_EXCEEDED: 429,
  PROVIDER_ERROR: 502,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
  PROVISIONING_FAILED: 500,
  PLAN_NOT_FOUND: 500,
  EMAIL_FAILED: 502,
  CONFIG_ERROR: 500
};

function makeRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// setSecurityHeaders — Sprint 15 Phase 1 (Security & Verification
// Foundation). apiGateway trả về JSON luôn — nosniff chặn trình duyệt tự
// đoán content-type khác đi; no-store vì mọi response (kể cả GET công khai
// như Products) có thể đi kèm dữ liệu theo phiên đăng nhập (staff thấy
// nhiều hơn khách qua cùng route) nên không nên để proxy/browser cache lại.
function setSecurityHeaders(res) {
  if (!res || typeof res.set !== 'function') return;
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
}

function sendSuccess(res, data, extra) {
  setSecurityHeaders(res);
  const meta = Object.assign({
    requestId: res.locals && res.locals.requestId || makeRequestId(),
    timestamp: new Date().toISOString(),
    apiVersion: 'v1'
  }, (extra && extra.meta) || {});
  const body = { success: true, data, meta };
  if (extra && extra.pagination) body.pagination = extra.pagination;
  res.status((extra && extra.status) || 200).json(body);
}

function sendError(res, code, message, details) {
  setSecurityHeaders(res);
  const status = ERROR_CODES[code] || 500;
  const meta = {
    requestId: (res.locals && res.locals.requestId) || makeRequestId(),
    timestamp: new Date().toISOString()
  };
  res.status(status).json({
    success: false,
    error: { code, message, details: details || null },
    meta
  });
}

module.exports = { ERROR_CODES, makeRequestId, sendSuccess, sendError, setSecurityHeaders };
