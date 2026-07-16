/*
 * shared/response.js — Standard Response/Error Format (Sprint 14 Phase 1,
 * SPRINT14_API_ARCHITECTURE_FINAL.md mục 10-11). Dùng CHUNG cho mọi route
 * mới đi qua API Gateway — KHÔNG áp dụng ngược lại cho openaiProxy/Facebook
 * Functions hiện có (giữ nguyên response shape cũ, tránh phá vỡ client đang
 * chạy — đó là việc của Phase 4 khi bọc lại Media AI thành API thật).
 */

const ERROR_CODES = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503
};

function makeRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function sendSuccess(res, data, extra) {
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

module.exports = { ERROR_CODES, makeRequestId, sendSuccess, sendError };
