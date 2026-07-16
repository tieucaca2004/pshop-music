/*
 * shared/validation.js — Validation Middleware (Sprint 14 Phase 1, FINAL
 * mục 8). Đây là KHUNG validate generic (kiểu dữ liệu, field bắt buộc,
 * allowlist) — KHÔNG wire vào action generate_image/edit_image/
 * remove_background hiện có trong openaiProxy ở Phase này (đó là "Media AI",
 * thuộc Phase 4, ngoài phạm vi Phase 1 theo đúng yêu cầu Founder). Khi
 * Phase 4 xây API AI thật, import validateModel/validateSize/
 * validateImageUrlOrigin từ đây thay vì viết lại.
 */

// validateSchema — kiểm tra body có đủ field required + đúng kiểu cơ bản.
// schema: { fieldName: { required: bool, type: 'string'|'number'|'boolean'|'array' } }
function validateSchema(body, schema) {
  const issues = [];
  body = body || {};
  Object.keys(schema).forEach(field => {
    const rule = schema[field];
    const value = body[field];
    const present = value !== undefined && value !== null && value !== '';
    if (rule.required && !present) {
      issues.push(`Thiếu field bắt buộc "${field}".`);
      return;
    }
    if (present && rule.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rule.type) {
        issues.push(`Field "${field}" phải là kiểu ${rule.type}, nhận được ${actualType}.`);
      }
    }
  });
  return { valid: issues.length === 0, issues };
}

// ALLOWED_AI_MODELS/ALLOWED_IMAGE_SIZES — allowlist cụ thể audit đã yêu cầu
// (ARCHITECTURE_AUDIT_SPRINT1-13.md Phần 4.4) — SẴN SÀNG để Phase 4 dùng lại,
// chưa gọi ở đâu trong Phase 1.
const ALLOWED_AI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'dall-e-3', 'gpt-image-1'];
const ALLOWED_IMAGE_SIZES = ['1:1', '4:5', '16:9'];
// Chỉ chấp nhận imageUrl thuộc đúng bucket Storage của dự án — chặn bề mặt
// SSRF đã phát hiện ở edit_image/remove_background (audit Phần 4.4).
const ALLOWED_IMAGE_URL_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/pshop-music';

function validateModel(model) {
  return ALLOWED_AI_MODELS.indexOf(model) !== -1;
}
function validateSize(size) {
  return ALLOWED_IMAGE_SIZES.indexOf(size) !== -1;
}
function validateImageUrlOrigin(url) {
  return typeof url === 'string' && url.indexOf(ALLOWED_IMAGE_URL_PREFIX) === 0;
}

module.exports = {
  validateSchema,
  validateModel, validateSize, validateImageUrlOrigin,
  ALLOWED_AI_MODELS, ALLOWED_IMAGE_SIZES, ALLOWED_IMAGE_URL_PREFIX
};
