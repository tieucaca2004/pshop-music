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

    const type = opts && opts.type;
    if (type === 'image') {
      return provider.image(opts.prompt, opts.size);
    }
    return provider.text(opts.prompt, Object.assign({}, opts, { model: (opts && opts.model) || (res && res.model) }));
  });
}

// Expose registry cho aiGenerate/tools inspect (nếu cần liệt kê provider).
function availableProviders() {
  return Object.keys(registry);
}

module.exports = { route, availableProviders, DEFAULT_PROVIDER_ID };
