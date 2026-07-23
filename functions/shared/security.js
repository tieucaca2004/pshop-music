/*
 * shared/security.js — Production Security Middleware (Phase 5, Task 22.0).
 *
 * Centralized security middleware:
 *   - Security headers
 *   - Sensitive data masking
 *   - Abuse protection (brute-force, suspicious IP)
 *   - Authentication hardening
 *   - Request validation helpers
 *
 * Integrates with existing shared/rateLimit.js, shared/apiKeyAuth.js.
 */

// ─── Security Headers ────────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function applySecurityHeaders(res) {
  Object.keys(SECURITY_HEADERS).forEach(function(name) {
    if (!res.getHeader(name)) {
      res.setHeader(name, SECURITY_HEADERS[name]);
    }
  });
}

// ─── Sensitive Data Masking ──────────────────────────────────────────
const SENSITIVE_FIELDS = [
  'password', 'token', 'apiKey', 'secret', 'authorization',
  'firebaseConfig', 'privateKey', 'clientSecret', 'accessToken',
  'refreshToken', 'idToken'
];

function maskSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var masked = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach(function(key) {
    var lower = key.toLowerCase();
    if (SENSITIVE_FIELDS.indexOf(lower) >= 0) {
      masked[key] = '***MASKED***';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      masked[key] = maskSensitive(obj[key]);
    } else {
      masked[key] = obj[key];
    }
  });
  return masked;
}

// ─── Abuse Protection ─────────────────────────────────────────────────
const abuseStore = {};

const ABUSE_CONFIG = {
  maxAttempts: 10,
  windowMs: 60000,
  blockMs: 300000
};

function checkAbuse(ip) {
  var now = Date.now();
  var entry = abuseStore[ip];

  // Cleanup old entries
  if (entry && entry.blockedUntil && now < entry.blockedUntil) {
    return { blocked: true, remaining: 0, blockedUntil: entry.blockedUntil };
  }

  if (!entry || (now - entry.start) > ABUSE_CONFIG.windowMs) {
    abuseStore[ip] = { count: 1, start: now, blockedUntil: 0 };
    return { blocked: false, remaining: ABUSE_CONFIG.maxAttempts - 1 };
  }

  entry.count++;
  if (entry.count > ABUSE_CONFIG.maxAttempts) {
    entry.blockedUntil = now + ABUSE_CONFIG.blockMs;
    return { blocked: true, remaining: 0, blockedUntil: entry.blockedUntil };
  }

  return { blocked: false, remaining: ABUSE_CONFIG.maxAttempts - entry.count };
}

// ─── Authentication Hardening ────────────────────────────────────────
const { authenticate } = require('./auth');

async function hardenAuth(req) {
  var result = await authenticate(req);
  if (!result.ok) return result;

  // Check custom claims validity
  var token = req.auth;
  if (token && token.firebase && token.firebase.claims) {
    var claims = token.firebase.claims;
    if (claims.businessId && typeof claims.businessId !== 'string') {
      return { ok: false, status: 403, code: 'INVALID_CLAIMS', error: 'Custom claims không hợp lệ.' };
    }
  }

  return result;
}

// ─── Request Validation ──────────────────────────────────────────────
// Simple lightweight validation — use shared/validation.js for complex schemas
function validateRequest(body, schema) {
  var errors = [];
  if (!body) body = {};
  schema = schema || {};

  Object.keys(schema).forEach(function(field) {
    var rules = schema[field];
    var value = body[field];
    var present = value !== undefined && value !== null && value !== '';

    if (rules.required && !present) {
      errors.push({ field: field, message: 'Trường "' + field + '" là bắt buộc.' });
      return;
    }

    if (present) {
      if (rules.type && typeof value !== rules.type) {
        errors.push({ field: field, message: 'Trường "' + field + '" phải là kiểu ' + rules.type + '.' });
      }
      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push({ field: field, message: 'Trường "' + field + '" phải có ít nhất ' + rules.minLength + ' ký tự.' });
      }
      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push({ field: field, message: 'Trường "' + field + '" không được vượt quá ' + rules.maxLength + ' ký tự.' });
      }
      if (rules.enum && rules.enum.indexOf(value) < 0) {
        errors.push({ field: field, message: 'Trường "' + field + '" phải là một trong: ' + rules.enum.join(', ') + '.' });
      }
      if (rules.regex && typeof value === 'string' && !rules.regex.test(value)) {
        errors.push({ field: field, message: 'Trường "' + field + '" không đúng định dạng.' });
      }
    }
  });

  return errors;
}

module.exports = {
  applySecurityHeaders,
  maskSensitive,
  checkAbuse,
  hardenAuth,
  validateRequest,
  SECURITY_HEADERS,
  SENSITIVE_FIELDS
};
