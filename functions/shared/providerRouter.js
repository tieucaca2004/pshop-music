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
const openaiProvider = require('./providers/openaiProvider');

// Registry provider — thêm provider mới tại đây (mỗi provider 1 file riêng).
const registry = {
  openai: openaiProvider,
  // claude: require('./providers/claudeProvider'),
  // gemini: require('./providers/geminiProvider'),
  // deepseek: require('./providers/deepseekProvider'),
  // openrouter: require('./providers/openrouterProvider'),
};

const DEFAULT_PROVIDER_ID = 'openai';

/**
 * route({ type, prompt, size, providerId, model }) — quyết định provider.
 * - type: 'text' | 'image'
 * - providerId (optional): tên provider; rơi về DEFAULT (openai) khi thiếu/không có.
 * - model (optional): truyền xuống provider (mỗi provider đọc model riêng).
 * Trả Promise<result> — shape do provider quyết (text: {text,..}, image: {imageUrl,..}).
 */
function route(opts) {
  const providerId = (opts && opts.providerId) || DEFAULT_PROVIDER_ID;
  const provider = registry[providerId] || registry[DEFAULT_PROVIDER_ID];
  if (!provider) return Promise.reject(new Error('Provider not available: ' + providerId));

  const type = opts && opts.type;
  if (type === 'image') {
    return provider.image(opts.prompt, opts.size);
  }
  return provider.text(opts.prompt, opts);
}

// Expose registry cho aiGenerate/tools inspect (nếu cần liệt kê provider).
function availableProviders() {
  return Object.keys(registry);
}

module.exports = { route, availableProviders, DEFAULT_PROVIDER_ID };
