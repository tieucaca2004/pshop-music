/*
 * shared/providerRouter.js — AI Router Backend (PHASE D).
 *
 * Provider Abstraction Layer: aiGenerate.js KHÔNG hardcode provider, chỉ
 * gọi ProviderRouter.route({ type, prompt, size, providerId, model }).
 * Đây là nơi DUY NHẤT quyết định provider — theo id (mặc định 'openai'),
 * khả năng cắm thêm provider mới (Claude/Gemini/DeepSeek/OpenRouter...)
 * bằng cách thêm vào registry, KHÔNG sửa aiGenerate.js.
 *
 * Backward-compat: OpenAI là DEFAULT provider — khi không có providerId,
 * hành vi giữ NGUYÊN như trước khi có Abstraction (gpt-4o-mini/dall-e-3).
 */
const openaiCompatibleProvider = require('./providers/openaiCompatibleProvider');
const claudeProvider = require('./providers/claudeProvider');
const geminiProvider = require('./providers/geminiProvider');
const modelRegistry = require('./modelRegistry');
const requestBuilder = require('./requestBuilder');

// Registry provider (backend) — REUSE FIRST: map theo API STYLE, không 1 adapter/provider.
// openai-completions → openaiCompatibleProvider (OpenAI, DeepSeek, Kimi, OpenRouter)
// anthropic-messages → claudeProvider (Anthropic)
// google-generative-ai → geminiProvider (Google)
const registry = {
  openai: openaiCompatibleProvider,
  deepseek: openaiCompatibleProvider,
  kimi: openaiCompatibleProvider,
  openrouter: openaiCompatibleProvider,
  anthropic: claudeProvider,
  gemini: geminiProvider
};

const DEFAULT_PROVIDER_ID = 'openai';

/**
 * route(opts) — DYNAMIC ROUTING (MISSION MODEL REGISTRY):
 * nhận { type, prompt, size, providerId, model, capability, task, policy }
 * → resolve provider+model qua modelRegistry (không hard-code) → gọi adapter.
 */
function route(opts) {
  return Promise.resolve().then(function () {
    const res = modelRegistry.resolveModel({ capability: opts && opts.capability, provider: opts && opts.providerId }, opts && opts.policy);
    const providerId = (opts && opts.providerId) || (res && res.provider) || DEFAULT_PROVIDER_ID;
    const provider = registry[providerId] || registry[DEFAULT_PROVIDER_ID];
    if (!provider) return Promise.reject(new Error('Provider not available: ' + providerId));

    // provider metadata từ modelRegistry (apiStyle/baseUrl) — không hard-code
    const meta = modelRegistry.getProvider ? modelRegistry.getProvider(providerId) : null;
    const apiStyle = (meta && meta.api) || 'openai-completions';
    const baseUrl = (meta && meta.baseUrl) || (opts && opts.baseUrl);
    const model = (opts && opts.model) || (res && res.model);

    // FIX: route() được document nhận cả { prompt } (xem JSDoc phía trên,
    // và mọi caller thật — aiGenerate.js runGeneration/callOpenAiText,
    // runtimeManager.execute()/runChat's underlying runTask — đều truyền
    // opts.prompt, KHÔNG phải opts.messages), nhưng req.messages trước đây
    // chỉ forward thẳng opts.messages, không bao giờ chuyển prompt→messages.
    // RequestBuilder.validateRequest() bắt buộc messages (mảng khác rỗng)
    // nên MỌI lời gọi kiểu prompt-string đều throw "thiếu messages" trước
    // khi tới bất kỳ HTTP request nào — không phân biệt provider (DeepSeek/
    // Claude/Kimi/OpenAI/Gemini), không phân biệt module AI nào.
    // Chuyển đổi ĐÚNG 1 chỗ ở boundary chung này — không đụng aiGenerate.js/
    // runtimeManager.js/từng AI module — giữ nguyên các caller đã tự truyền
    // opts.messages hợp lệ (opts.messages ưu tiên, không bị ghi đè).
    const messages = (Array.isArray(opts && opts.messages) && opts.messages.length)
      ? opts.messages
      : ((opts && opts.prompt) ? [{ role: 'user', content: opts.prompt }] : (opts && opts.messages));

    // Build payload qua RequestBuilder (adapter không tự build body) + gọi adapter.execute()
    const req = {
      apiStyle: apiStyle,
      model: model,
      baseUrl: baseUrl,
      apiKey: opts && opts.apiKey,
      providerId: providerId,
      messages: messages,
      system: opts && opts.system,
      temperature: opts && opts.temperature,
      max_tokens: (opts && opts.max_tokens) || (opts && opts.maxTokens)
    };
    try {
      const built = requestBuilder.buildRequest(req);
      return provider.execute({
        endpoint: built.url,
        headers: built.headers,
        payload: built.body,
        apiKey: opts && opts.apiKey,
        providerId: providerId,
        model: model
      });
    } catch (err) {
      return Promise.reject(err);
    }
  });
}

// Expose registry cho aiGenerate/tools inspect (nếu cần liệt kê provider).
function availableProviders() {
  return Object.keys(registry);
}

// ─── CAPABILITY 3: bổ sung API (đọc duy nhất từ modelRegistry, không hard-code) ──

/**
 * resolveProvider(task, policy) — resolve provider từ modelRegistry (không hard-code).
 */
function resolveProvider(task, policy) {
  const res = modelRegistry.resolveModel(task, policy);
  return { providerId: (res && res.provider) || DEFAULT_PROVIDER_ID, model: res && res.model, meta: res };
}

/**
 * resolveAdapter(providerId) — trả adapter tương ứng (theo API style map), fallback DEFAULT.
 */
function resolveAdapter(providerId) {
  return registry[providerId] || registry[DEFAULT_PROVIDER_ID];
}

/**
 * getPriority(providerId) — priority từ modelRegistry (không hard-code).
 */
function getPriority(providerId) {
  const p = modelRegistry.getProvider ? modelRegistry.getProvider(providerId) : null;
  return p ? (p.priority || 0) : null;
}

/**
 * isEnabled(providerId) — enabled từ modelRegistry (không hard-code).
 */
function isEnabled(providerId) {
  const p = modelRegistry.getProvider ? modelRegistry.getProvider(providerId) : null;
  return p ? p.enabled !== false : false;
}

/**
 * chooseFallback(providerId) — fallback provider/model từ modelRegistry (không hard-code).
 */
function chooseFallback(providerId, modelId) {
  const target = modelId || providerId;
  const fb = modelRegistry.getFallback ? modelRegistry.getFallback(target) : null;
  if (fb && fb.provider) {
    return { providerId: fb.provider, model: fb.model, adapter: registry[fb.provider] || registry[DEFAULT_PROVIDER_ID] };
  }
  return { providerId: DEFAULT_PROVIDER_ID, model: null, adapter: registry[DEFAULT_PROVIDER_ID] };
}

module.exports = {
  route,
  availableProviders,
  resolveProvider,
  resolveAdapter,
  getPriority,
  isEnabled,
  chooseFallback,
  DEFAULT_PROVIDER_ID
};
