/*
 * shared/providers/claudeProvider.js — Anthropic/Claude Adapter (backend)
 * MISSION — CAPABILITY 6 (LOCKED). Architecture LOCK, Capability 1-5 PASS.
 *
 * Adapter CHỈ nhận payload từ RequestBuilder (không build request/body/messages),
 * không routing/fallback/retry/timeout/business logic, không hard-code model.
 * API style: anthropic-messages.
 *
 * API: execute(), parseResponse(), parseError(), getUsage().
 * Validation: throw Runtime Error nếu thiếu apiKey / endpoint / payload.
 */

function requireApiKey(input) {
  if (!input || !input.apiKey) throw new Error('ClaudeAdapter: thiếu apiKey trong request.');
}
function requireEndpoint(input) {
  if (!input || !input.endpoint) throw new Error('ClaudeAdapter: thiếu endpoint trong request.');
}
function requirePayload(input) {
  if (!input || typeof input.payload !== 'object' || !input.payload) throw new Error('ClaudeAdapter: thiếu payload (RequestBuilder.buildRequest) trong request.');
}
function isValid(input) { requireApiKey(input); requireEndpoint(input); requirePayload(input); return true; }

/**
 * parseResponse(body) — trích text từ response Anthropic (content[].text).
 */
function parseResponse(body) {
  const content = body && body.content;
  let text = '';
  if (Array.isArray(content)) {
    text = content.map((b) => (b && b.type === 'text' ? b.text : '')).join(' ');
  } else if (content && typeof content === 'string') {
    text = content;
  }
  return { text: text.trim(), raw: body };
}

/**
 * parseError(resp, body) — Error với thông điệp lỗi Anthropic.
 */
function parseError(resp, body) {
  const errObj = body && body.error;
  const msg = (errObj && (errObj.message || JSON.stringify(errObj))) || ('Anthropic API HTTP ' + (resp && resp.status));
  const err = new Error(msg);
  err.status = resp && resp.status;
  return err;
}

/**
 * getUsage(body) — trích usage từ response Anthropic.
 */
function getUsage(body) {
  const u = body && body.usage;
  return {
    inputTokens: (u && (u.input_tokens || u.inputTokens)) || 0,
    outputTokens: (u && (u.output_tokens || u.outputTokens)) || 0,
    totalTokens: (u && (u.input_tokens + u.output_tokens)) || ((u && (u.inputTokens + u.outputTokens))) || 0
  };
}

const claudeProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',

  /**
   * execute(request) — gửi request từ RequestBuilder (anthropic-messages).
   * request: { endpoint, headers, payload, apiKey, model }
   * KHÔNG build payload, KHÔNG retry/timeout (Capability 6 cấm).
   */
  execute: function (request) {
    requireApiKey(request);
    requireEndpoint(request);
    requirePayload(request);
    const url = request.endpoint || request.url;
    return fetch(url, {
      method: (request && request.method) || 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'x-api-key': request.apiKey, 'anthropic-version': '2023-06-01' },
        request.headers || {}
      ),
      body: JSON.stringify(request.payload)
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (body) {
        if (!resp.ok) throw parseError(resp, body);
        const parsed = parseResponse(body);
        parsed.usage = getUsage(body);
        parsed.provider = request.providerId || 'anthropic';
        parsed.model = request.model || (request.payload && request.payload.model) || null;
        return parsed;
      });
    });
  },

  parseResponse: parseResponse,
  parseError: parseError,
  getUsage: getUsage,

  // tương thích giao diện cũ nếu có chỗ gọi — buộc dùng execute() (không build body trong adapter)
  text: function () { throw new Error('ClaudeAdapter: use execute() with RequestBuilder payload (không build body trong adapter).'); },
  image: function () { throw new Error('ClaudeAdapter: image không hỗ trợ qua adapter này.'); }
};

module.exports = claudeProvider;
