/*
 * shared/providers/openaiCompatibleProvider.js — OpenAI Compatible Adapter (backend)
 * MISSION — CAPABILITY 5 (LOCKED). Architecture LOCK, Capability 1-4 PASS.
 *
 * Adapter CHỈ nhận payload từ RequestBuilder (không tự build messages/body),
 * không hard-code model/provider (đọc từ request đã resolve), không retry/timeout/
 * fallback/business logic/routing/metrics.
 * Hỗ trợ OpenAI-compatible: OpenAI, DeepSeek, Kimi, OpenRouter.
 *
 * API: execute(), parseResponse(), parseError(), getUsage().
 * Validation: throw Runtime Error nếu thiếu apiKey / endpoint / payload.
 */
const modelRegistry = require('../modelRegistry');

function requireApiKey(input) {
  if (!input || !input.apiKey) {
    throw new Error('OpenAICompatible: thiếu apiKey trong request.');
  }
}
function requireEndpoint(input) {
  if (!input || !input.endpoint) {
    throw new Error('OpenAICompatible: thiếu endpoint (baseUrl/resolved url) trong request.');
  }
}
function requirePayload(input) {
  if (!input || typeof input.payload !== 'object' || !input.payload) {
    throw new Error('OpenAICompatible: thiếu payload (RequestBuilder.buildRequest) trong request.');
  }
}

function isValid(input) {
  requireApiKey(input); requireEndpoint(input); requirePayload(input);
  return true;
}

/**
 * parseResponse(body) — parse response OpenAI-compatible → text + raw.
 */
function parseResponse(body) {
  const text = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  return { text: (text || '').trim(), raw: body };
}

/**
 * parseError(resp, body) — trả Error với thông điệp provider lỗi.
 */
function parseError(resp, body) {
  const msg = (body && body.error && body.error.message) || ('OpenAI-Compatible API HTTP ' + (resp && resp.status));
  const err = new Error(msg);
  err.status = resp && resp.status;
  return err;
}

/**
 * getUsage(body) — trích usage từ response (nếu có).
 */
function getUsage(body) {
  const u = body && body.usage;
  if (!u) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  return {
    promptTokens: u.prompt_tokens || u.promptTokens || 0,
    completionTokens: u.completion_tokens || u.completionTokens || 0,
    totalTokens: u.total_tokens || u.totalTokens || 0
  };
}

// helper: lấy metadata provider từ modelRegistry (đọc — không build nội dung AI)
function providerMeta(providerId) {
  return modelRegistry.getProvider ? modelRegistry.getProvider(providerId) : null;
}

const openaiCompatibleProvider = {
  id: 'openai-compatible',
  label: 'OpenAI Compatible',

  /**
   * execute(request) — gửi request từ RequestBuilder (đã có url/headers/body).
   * request: { endpoint, method?, headers, body, apiKey, providerId }
   * KHÔNG build payload, KHÔNG retry/timeout/fallback (Capability 5 cấm).
   */
  execute: function (request) {
    // validation: thiếu apiKey / endpoint / payload → throw Runtime Error
    requireApiKey(request);
    requireEndpoint(request);
    requirePayload(request);
    const url = request.endpoint || request.url;
    return fetch(url, {
      method: (request && request.method) || 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, request.headers, { Authorization: 'Bearer ' + request.apiKey }),
      body: JSON.stringify(request.payload)
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (body) {
        if (!resp.ok) throw parseError(resp, body);
        // đọc metadata provider (không hard-code) + parse
        const meta = providerMeta(request.providerId);
        const parsed = parseResponse(body);
        parsed.usage = getUsage(body);
        parsed.provider = request.providerId || (meta && meta.id) || null;
        parsed.model = request.model || (request.payload && request.payload.model) || null;
        return parsed;
      });
    });
  },

  parseResponse: parseResponse,
  parseError: parseError,
  getUsage: getUsage,

  // tương thích giao diện cũ nếu có chỗ gọi (đọc từ request, không hard-code)
  text: function (prompt, opts) {
    // không còn tự build payload — nếu bị gọi phải qua RequestBuilder
    throw new Error('OpenAICompatible: use execute() with RequestBuilder payload (không build body trong adapter).');
  },
  image: function () {
    throw new Error('OpenAICompatible: image chưa hỗ trợ qua adapter này — dùng execute() với payload từ RequestBuilder.');
  }
};

module.exports = openaiCompatibleProvider;
