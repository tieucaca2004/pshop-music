/*
 * shared/providers/geminiProvider.js — Google Gemini Adapter (backend)
 * MISSION — CAPABILITY 7 RECOVERY (LOCKED, 05:15). Architecture LOCK, Capability 1-6 PASS.
 *
 * Adapter CHỈ nhận payload từ RequestBuilder (không build request/body/messages),
 * không routing/fallback/retry/timeout/business logic, không hard-code model/provider.
 * Chỉ chuyển payload sang đúng Gemini API (google-generative-ai / generateContent).
 *
 * API: execute(), parseResponse(), parseError(), getUsage(). export tối thiểu:
 * id, label, execute, parseResponse, parseError, getUsage.
 * Validation: throw Runtime Error nếu thiếu apiKey / endpoint / payload.
 */

function requireApiKey(input) {
  if (!input || !input.apiKey) throw new Error('GeminiAdapter: thiếu apiKey trong request.');
}
function requireEndpoint(input) {
  if (!input || !input.endpoint) throw new Error('GeminiAdapter: thiếu endpoint trong request.');
}
function requirePayload(input) {
  if (!input || typeof input.payload !== 'object' || !input.payload) throw new Error('GeminiAdapter: thiếu payload (RequestBuilder.buildRequest) trong request.');
}
function isValid(input) { requireApiKey(input); requireEndpoint(input); requirePayload(input); return true; }

/**
 * parseResponse(body) — trích text từ response Gemini (candidates[].content.parts[].text).
 */
function parseResponse(body) {
  let text = '';
  const candidates = body && body.candidates;
  if (Array.isArray(candidates)) {
    text = candidates.map((c) => {
      const parts = c && c.content && c.content.parts;
      return Array.isArray(parts) ? parts.map((p) => (p && p.text ? p.text : '')).join(' ') : '';
    }).join(' ');
  }
  return { text: text.trim(), raw: body };
}

/**
 * parseError(resp, body) — Error với thông điệp lỗi Gemini.
 */
function parseError(resp, body) {
  const errObj = body && body.error;
  const msg = (errObj && errObj.message) || ('Gemini API HTTP ' + (resp && resp.status));
  const err = new Error(msg);
  err.status = resp && resp.status;
  return err;
}

/**
 * getUsage(body) — trích usage từ response Gemini (usageMetadata nếu có).
 */
function getUsage(body) {
  const u = body && body.usageMetadata;
  return {
    promptTokens: (u && (u.promptTokenCount || u.prompt_token_count)) || 0,
    completionTokens: (u && (u.candidatesTokenCount || u.candidates_token_count)) || 0,
    totalTokens: (u && (u.totalTokenCount || u.total_token_count)) || 0
  };
}

const geminiProvider = {
  id: 'gemini',
  label: 'Google Gemini',

  /**
   * execute(request) — gửi request từ RequestBuilder (Gemini generateContent).
   * request: { endpoint, headers, payload, apiKey, model }
   * KHÔNG build payload, KHÔNG retry/timeout/fallback (Capability 7 cấm).
   */
  execute: function (request) {
    requireApiKey(request);
    requireEndpoint(request);
    requirePayload(request);
    // Gemini: apiKey truyền qua query ?key= (không trong header) — do adapter setup URL
    const url = request.endpoint + (request.endpoint.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(request.apiKey);
    return fetch(url, {
      method: (request && request.method) || 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, request.headers || {}),
      body: JSON.stringify(request.payload)
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (body) {
        if (!resp.ok) throw parseError(resp, body);
        const parsed = parseResponse(body);
        parsed.usage = getUsage(body);
        parsed.provider = request.providerId || 'gemini';
        parsed.model = request.model || (request.payload && request.payload.model) || null;
        return parsed;
      });
    });
  },

  parseResponse: parseResponse,
  parseError: parseError,
  getUsage: getUsage,

  // tương thích giao diện cũ — buộc dùng execute()
  text: function () { throw new Error('GeminiAdapter: use execute() with RequestBuilder payload (không build body trong adapter).'); },
  image: function () { throw new Error('GeminiAdapter: image không hỗ trợ qua adapter này.'); }
};

module.exports = geminiProvider;
