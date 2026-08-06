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
  // CAPABILITY 9B: RequestBuilder MUST NOT build Authorization — chỉ Content-Type
  // + provider-independent headers. Adapter tự build Authorization.
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  if (apiStyle === 'anthropic-messages') {
    headers['anthropic-version'] = '2023-06-01';
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

module.exports = {
  buildHeaders,
  postJSON,
  DEFAULT_TIMEOUT_MS,
  // CAPABILITY 4 API
  buildRequest,
  buildBody,
  normalizeMessages,
  normalizeTools,
  normalizeResponseFormat,
  normalizeGenerationConfig,
  validateRequest
};

// ─── CAPABILITY 4: Request Builder là Single Source of Truth payload ────────
// Request Builder KHÔNG đọc Model Registry trực tiếp. Provider Router truyền
// { provider, model, apiStyle, ... } đã resolve. Adapter CHỈ gọi buildRequest()
// + gửi HTTP + parse + throw — KHÔNG build payload trong adapter.
// Không hard-code provider/model (chỉ dùng apiStyle truyền vào).

const VALID_API_STYLES = ['openai-completions', 'anthropic-messages', 'google-generative-ai'];

/**
 * validateRequest(payload) — throw Runtime Error nếu format sai.
 * payload: { provider?, model, apiStyle, messages }
 */
function validateRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('RequestBuilder: payload không hợp lệ (cần object).');
  }
  if (!payload.model) throw new Error('RequestBuilder: thiếu model.');
  if (!payload.apiStyle || VALID_API_STYLES.indexOf(payload.apiStyle) < 0) {
    throw new Error('RequestBuilder: apiStyle không hợp lệ (' + payload.apiStyle + ').');
  }
  if (!payload.messages || !Array.isArray(payload.messages) || !payload.messages.length) {
    throw new Error('RequestBuilder: thiếu messages.');
  }
  if (payload && typeof payload !== 'object') {
    throw new Error('RequestBuilder: payload sai format.');
  }
  return true;
}

/**
 * normalizeMessages(messages, opts) — chuẩn hóa messages (hỗ trợ system riêng,
 * multimodal/image input). Trả { system, contents/messages } theo apiStyle.
 */
function normalizeMessages(messages, opts) {
  opts = opts || {};
  const apiStyle = opts.apiStyle || 'openai-completions';
  const list = Array.isArray(messages) ? messages.slice() : (messages ? [messages] : []);
  let system = opts.system || null;
  // tách system role nếu có
  const nonSystem = list.filter((m) => m && m.role !== 'system');
  const sys = list.find((m) => m && m.role === 'system');
  if (!system && sys) system = typeof sys.content === 'string' ? sys.content : (sys.content && sys.content.text);
  if (apiStyle === 'anthropic-messages') {
    // anthropic: system riêng + contents mảng
    return {
      system: system || undefined,
      contents: nonSystem.map((m) => ({ role: (m.role === 'assistant' ? 'assistant' : 'user'), content: m.content }))
    };
  }
  if (apiStyle === 'google-generative-ai') {
    // gemini: contents [{ role:'user'|'model', parts:[{text}] }]
    return {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: nonSystem.map((m) => ({ role: (m.role === 'assistant' ? 'model' : 'user'), parts: [{ text: typeof m.content === 'string' ? m.content : (m.content && m.content.text || JSON.stringify(m.content)) }] }))
    };
  }
  // openai-completions mặc định
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  nonSystem.forEach((m) => msgs.push({ role: m.role || 'user', content: m.content }));
  return { messages: msgs };
}

/**
 * normalizeTools(tools) — chuẩn hóa tool definitions (openai format).
 */
function normalizeTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return undefined;
  return tools.map((t) => {
    if (t && t.type === 'function' && t.function) return { type: 'function', function: { name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } } };
    return t;
  });
}

/**
 * normalizeResponseFormat(format) — json mode / structured response.
 * format: 'json' | { type:'json_object' } | { type:'json_schema', json_schema }
 */
function normalizeResponseFormat(format) {
  if (!format) return undefined;
  if (format === 'json' || format === 'json_object') return { type: 'json_object' };
  if (typeof format === 'object' && format.type) return format;
  return { type: 'json_object' };
}

/**
 * normalizeGenerationConfig(cfg) — chuẩn hóa temperature/top_p/max_tokens/stop/stream/seed.
 */
function normalizeGenerationConfig(cfg) {
  cfg = cfg || {};
  return {
    temperature: cfg.temperature != null ? cfg.temperature : 0.7,
    top_p: cfg.top_p != null ? cfg.top_p : 0.95,
    max_tokens: cfg.max_tokens || cfg.maxTokens || 1024,
    stop: Array.isArray(cfg.stop) ? cfg.stop : (cfg.stop ? [cfg.stop] : undefined),
    stream: cfg.stream === true,
    seed: cfg.seed
  };
}

/**
 * buildBody(input) — build payload body theo apiStyle. Input nhận từ Provider Router:
 * { provider, model, apiStyle, messages, tools, tool_choice, response_format, temperature, top_p, max_tokens, stop, stream, seed, system }
 * Không hard-code provider/model — dùng input.apiStyle/model.
 */
function buildBody(input) {
  validateRequest({ model: input.model, apiStyle: input.apiStyle, messages: input.messages });
  const apiStyle = input.apiStyle;
  const nd = normalizeMessages(input.messages, { apiStyle, system: input.system });
  const gen = normalizeGenerationConfig(input);
  const tools = normalizeTools(input.tools);

  if (apiStyle === 'anthropic-messages') {
    const body = { model: input.model, max_tokens: gen.max_tokens, messages: nd.contents };
    if (nd.system) body.system = nd.system;
    if (tools) body.tools = tools;
    if (input.tool_choice) body.tool_choice = input.tool_choice;
    if (gen.temperature != null) body.temperature = gen.temperature;
    if (gen.stop) body.stop_sequences = gen.stop;
    if (gen.stream) body.stream = true;
    return body;
  }
  if (apiStyle === 'google-generative-ai') {
    const body = { model: input.model, contents: nd.contents, generationConfig: { temperature: gen.temperature, topP: gen.top_p, maxOutputTokens: gen.max_tokens } };
    if (nd.systemInstruction) body.systemInstruction = nd.systemInstruction;
    if (gen.stop) body.generationConfig.stopSequences = gen.stop;
    if (gen.stream) body.stream = true;
    return body;
  }
  // openai-completions
  const body = { model: input.model, messages: nd.messages, temperature: gen.temperature, top_p: gen.top_p, max_tokens: gen.max_tokens };
  if (tools) body.tools = tools;
  if (input.tool_choice) body.tool_choice = input.tool_choice;
  if (gen.stop) body.stop = gen.stop;
  if (gen.stream) body.stream = true;
  if (input.seed != null) body.seed = input.seed;
  const rf = normalizeResponseFormat(input.response_format);
  if (rf) body.response_format = rf;
  return body;
}

/**
 * buildRequest(input) — API chính: build headers + body cho 1 request.
 * Trả { url, headers, body, apiStyle, model } — Adapter chỉ dùng kết quả này để gửi.
 */
function buildRequest(input) {
  input = input || {};
  validateRequest({ model: input.model, apiStyle: input.apiStyle, messages: input.messages });
  const apiStyle = input.apiStyle;
  const body = buildBody(input);
  const headers = buildHeaders(apiStyle, input.apiKey, input.headers);
  // baseUrl từ input (Provider Router truyền — resolve từ modelRegistry trước đó)
  const base = input.baseUrl || 'https://api.openai.com/v1';
  let url = base;
  if (apiStyle === 'anthropic-messages') url = base.replace(/\/$/, '') + '/messages';
  else if (apiStyle === 'google-generative-ai') url = base.replace(/\/$/, '') + '/models/' + input.model + ':generateContent';
  else url = base.replace(/\/$/, '') + '/chat/completions';
  return { url, headers, body, apiStyle, model: input.model };
}

