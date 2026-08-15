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

// Private/internal IP ranges — blocks SSRF to internal networks
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/127\.0\.0\./,
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/localhost/i,
  /^https?:\/\/[\[::\]f{0,2}]/  // IPv6 loopback
];

// Allowed Content-Type prefixes for image responses
const ALLOWED_IMAGE_CONTENT_TYPES = ['image/', 'application/octet-stream'];

function validateModel(model) {
  return ALLOWED_AI_MODELS.indexOf(model) !== -1;
}
function validateSize(size) {
  return ALLOWED_IMAGE_SIZES.indexOf(size) !== -1;
}

/**
 * Validates an image URL for SSRF safety.
 * Returns null if valid, or an error message string if rejected.
 */
function validateImageUrlOrigin(url) {
  if (typeof url !== 'string' || !url.trim()) return 'URL is empty';
  const trimmed = url.trim();
  // Scheme: https only
  if (!trimmed.startsWith('https://')) return 'Only HTTPS URLs are allowed';
  // Allowlisted prefix: project Storage bucket
  if (trimmed.indexOf(ALLOWED_IMAGE_URL_PREFIX) === 0) return null;
  // Block private/internal IP ranges written directly in the URL text
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(trimmed)) return 'URL points to a private/internal network address';
  }
  // Chấp nhận MỌI host HTTPS công khai — Founder cần dán link ảnh sản phẩm
  // thật từ trang nhà sản xuất (vd krkmusic.com) để Xóa phông/AI Edit, không
  // giới hạn 1 danh sách domain cố định (danh sách cũ chỉ có
  // firebasestorage/pshopmusic/atieu.com — chặn đứng đúng use case chính của
  // ô "DÙNG URL", Founder báo lỗi live 2026-08-15). An toàn thật KHÔNG dựa
  // vào allowlist domain tĩnh (vừa dễ thiếu domain hợp lệ, vừa KHÔNG chặn
  // được DNS rebinding — 1 domain "hợp lệ" vẫn có thể trỏ DNS sang IP nội bộ)
  // mà dựa vào 2 lớp bảo vệ NGAY SAU hàm này trong editImageWithOpenAI():
  // resolveAndValidateIps() phân giải DNS THẬT của host và chặn nếu IP thật
  // sự là private/internal (chặn được DNS rebinding, allowlist tĩnh không
  // chặn nổi), rồi validateContentType() chỉ nhận response thật là ảnh.
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return 'Invalid URL format';
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

/**
 * Validates the Content-Type of a fetched response.
 * Accepts only image/* or application/octet-stream.
 * Returns null if valid, or an error message string if rejected.
 */
function validateContentType(contentType) {
  if (!contentType || typeof contentType !== 'string') return 'Missing Content-Type header';
  const lower = contentType.toLowerCase();
  for (const prefix of ALLOWED_IMAGE_CONTENT_TYPES) {
    if (lower.startsWith(prefix)) return null;
  }
  return 'Response Content-Type "' + contentType + '" is not an accepted image type';
}

const dnsPromises = require('dns').promises;

// Well-known private/reserved IPv4 prefixes for DNS-based validation
function ipIsPrivate(ip) {
  // IPv4 private ranges
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^0\.0\.0\.0$/.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^224\./.test(ip)) return true; // multicast
  if (/^240\./.test(ip)) return true; // reserved
  // IPv6 loopback
  if (/^::1$/.test(ip)) return true;
  if (/^fe80:/i.test(ip)) return true; // link-local
  if (/^fc00:/i.test(ip)) return true; // unique local
  if (/^fd00:/i.test(ip)) return true; // unique local
  return false;
}

/**
 * Resolves a hostname to IP addresses and validates none are private.
 * Provides defense against DNS rebinding attacks.
 * Returns null if all IPs are public, or an error message string if private IP found.
 */
async function resolveAndValidateIps(hostname) {
  if (!hostname || typeof hostname !== 'string') return 'Invalid hostname for DNS validation';
  let ips = [];
  try {
    const v4 = await dnsPromises.resolve4(hostname);
    ips = ips.concat(v4);
  } catch { /* no IPv4 records */ }
  try {
    const v6 = await dnsPromises.resolve6(hostname);
    ips = ips.concat(v6);
  } catch { /* no IPv6 records */ }
  if (ips.length === 0) return 'Could not resolve hostname "' + hostname + '" to any IP address';
  for (const ip of ips) {
    if (ipIsPrivate(ip)) {
      return 'Hostname "' + hostname + '" resolved to private IP: ' + ip;
    }
  }
  return null;
}

module.exports = {
  validateSchema,
  validateModel, validateSize, validateImageUrlOrigin,
  validateContentType, resolveAndValidateIps,
  ALLOWED_AI_MODELS, ALLOWED_IMAGE_SIZES, ALLOWED_IMAGE_URL_PREFIX,
  ALLOWED_IMAGE_CONTENT_TYPES, PRIVATE_IP_PATTERNS
};
