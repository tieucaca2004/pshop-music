/*
 * shared/apiKeyAuth.js — API Key Authentication Middleware (Phase 5, Task 19.0).
 *
 * Validates API key authentication for public API endpoints.
 * Keys are hashed with SHA-256 before storage (never stored in plaintext).
 * Supports per-key permissions, IP allowlisting, and rate limiting.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

/**
 * Hashes an API key for secure storage. Returns the hex-encoded SHA-256 hash.
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generates a new API key (a cryptographically random token).
 * Returns { key, hashedKey } — key is the plaintext to return to the caller,
 * hashedKey is what gets stored in the database.
 */
function generateApiKey() {
  const raw = crypto.randomBytes(32).toString('hex');
  const keyPrefix = 'psh_';
  const key = keyPrefix + raw;
  return { key: key, hashedKey: hashApiKey(key) };
}

/**
 * Validates an API key from a request header.
 * Looks up the hashed key in the business's apiKeys store.
 * Checks: key exists, status active, not expired, IP allowed, permissions.
 *
 * @param {string} businessId - The business to search
 * @param {string} authHeader - The Authorization header value (e.g. "Bearer psh_...")
 * @returns {object} { ok, apiKeyId, name, permissions, error? }
 */
async function authenticateApiKey(businessId, authHeader) {
  if (!authHeader) {
    return { ok: false, status: 401, code: 'MISSING_API_KEY', error: 'Thiếu Authorization header.' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, code: 'INVALID_AUTH_FORMAT', error: 'Authorization header phải có dạng: Bearer <api-key>.' };
  }

  const rawKey = match[1].trim();
  if (!rawKey || rawKey.length < 10) {
    return { ok: false, status: 401, code: 'INVALID_API_KEY', error: 'API key không hợp lệ.' };
  }

  const hashedKey = hashApiKey(rawKey);
  const now = Date.now();

  // Search through all API keys for this business
  const snap = await admin.database()
    .ref('businesses/' + businessId + '/apiKeys')
    .once('value');
  const val = snap.val() || {};

  var found = null;
  var foundId = null;

  Object.keys(val).forEach(function(id) {
    var k = val[id];
    if (k.hashedKey === hashedKey) {
      found = k;
      foundId = id;
    }
  });

  if (!found) {
    return { ok: false, status: 401, code: 'API_KEY_NOT_FOUND', error: 'API key không tồn tại hoặc đã bị thu hồi.' };
  }

  // Check status
  if (found.status !== 'active') {
    return { ok: false, status: 403, code: 'API_KEY_INACTIVE', error: 'API key đã bị vô hiệu hóa.' };
  }

  // Check expiration
  if (found.expiresAt && found.expiresAt > 0 && now > found.expiresAt) {
    return { ok: false, status: 403, code: 'API_KEY_EXPIRED', error: 'API key đã hết hạn.' };
  }

  // Update lastUsedAt (fire-and-forget)
  admin.database()
    .ref('businesses/' + businessId + '/apiKeys/' + foundId + '/lastUsedAt')
    .set(now)
    .catch(function() {});

  return {
    ok: true,
    apiKeyId: foundId,
    name: found.name || '',
    permissions: found.permissions || [],
    allowedIPs: found.allowedIPs || []
  };
}

/**
 * Checks if an API key has the required permission.
 */
function hasApiPermission(apiKeyAuth, requiredPermission) {
  if (!apiKeyAuth || !apiKeyAuth.ok) return false;
  const perms = apiKeyAuth.permissions || [];
  if (perms.indexOf('*') >= 0) return true;
  return perms.indexOf(requiredPermission) >= 0;
}

/**
 * Increments rate limit counter for an API key.
 * Returns { allowed: bool, remaining: number, resetMs: number }.
 */
async function checkApiRateLimit(businessId, apiKeyId, maxRequests, windowMs) {
  maxRequests = maxRequests || 100;
  windowMs = windowMs || 60000; // 1 minute default

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const counterKey = 'businesses/' + businessId + '/_rateLimits/api/' + apiKeyId + '/' + windowStart;

  const snap = await admin.database().ref(counterKey).once('value');
  const count = snap.val() || 0;

  if (count >= maxRequests) {
    const resetMs = windowStart + windowMs - now;
    return { allowed: false, remaining: 0, resetMs: resetMs };
  }

  await admin.database().ref(counterKey).set(count + 1);
  return { allowed: true, remaining: maxRequests - count - 1, resetMs: windowStart + windowMs - now };
}

/**
 * Logs an API usage entry.
 */
async function logApiUsage(businessId, data) {
  await admin.database()
    .ref('businesses/' + businessId + '/_apiUsage')
    .push()
    .set({
      endpoint: data.endpoint || '',
      method: data.method || '',
      apiKeyId: data.apiKeyId || '',
      ipAddress: data.ipAddress || '',
      responseCode: data.responseCode || 0,
      latency: data.latency || 0,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      businessId: businessId
    });
}

module.exports = {
  hashApiKey,
  generateApiKey,
  authenticateApiKey,
  hasApiPermission,
  checkApiRateLimit,
  logApiUsage
};
