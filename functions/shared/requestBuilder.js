/*
 * shared/requestBuilder.js — REQUEST BUILDER dùng chung (PROVIDER ARCHITECTURE REFINEMENT)
 * MISSION — PROVIDER ARCHITECTURE (03:28). REUSE FIRST.
 *
 * Adapter KHÔNG tự dựng HTTP Header/retry/timeout nữa — tất cả dùng chung ở đây:
 * - Authorization header từ apiKey
 * - headers tùy biến theo API style
 * - retry (withRetry) + timeout
 * - JSON body
 * - (streaming hỗ trợ nếu có)
 */
const { withRetry } = require('./retry');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRY = { attempts: 3, backoffMs: function (i) { return 500 * Math.pow(2, i); } };

/**
 * buildHeaders(apiStyle, apiKey, extra) — dựng header HTTP theo API style.
 * Không hard-code header trong adapter.
 */
function buildHeaders(apiStyle, apiKey, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  if (apiKey) {
    if (apiStyle === 'anthropic-messages') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = 'Bearer ' + apiKey;
    }
  }
  return headers;
}

/**
 * postJSON(url, body, opts) — gửi request JSON qua fetch với retry + timeout.
 * opts: { apiStyle, apiKey, headers, timeoutMs, retry }
 * KHÔNG builder adapter nào tự tạo fetch → dùng chung hàm này.
 */
function postJSON(url, body, opts) {
  opts = opts || {};
  const apiStyle = opts.apiStyle || 'openai-completions';
  const headers = buildHeaders(apiStyle, opts.apiKey, opts.headers);
  const retry = opts.retry || DEFAULT_RETRY;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  return withRetry(async function () {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (data.error && data.error.message) || JSON.stringify(data) || ('HTTP ' + r.status);
        const err = new Error(msg);
        err.status = r.status;
        throw err;
      }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, retry);
}

module.exports = { buildHeaders, postJSON, DEFAULT_TIMEOUT_MS };
