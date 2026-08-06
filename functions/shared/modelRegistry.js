/*
 * shared/modelRegistry.js — MODEL REGISTRY & DYNAMIC AI ROUTING (backend)
 * MISSION — MODEL REGISTRY (directive 2026-08-06). REUSE FIRST.
 *
 * Mục tiêu: toàn bộ AI backend dùng Dynamic Model Registry — KHÔNG hard-code
 * tên model trong Router. Thêm Provider/Model mới, đổi default/priority/
 * fallback/temperature KHÔNG cần sửa code.
 *
 * Provider Registry mặc định: DeepSeek, Anthropic, OpenAI, Gemini, Kimi, OpenRouter.
 * Routing chỉ nhận: Task → Capability → Policy → Model Registry → Provider Adapter.
 * Không chọn model bằng if/else.
 *
 * Config đọc từ: env (MODEL_REGISTRY_JSON chuỗi JSON) hoặc default bên dưới.
 * Founder đổi trực tiếp qua env này (CMS client đọc/ghi sau — backend trước).
 */

// ─── Default Model Registry (6 provider + model) ─────────────────────────────
const DEFAULT_MODEL_REGISTRY = {
  providers: {
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      api: 'openai-completions',
      enabled: true,
      priority: 1,
      models: {
        'deepseek-chat':    { provider: 'deepseek', family: 'deepseek', series: 'chat', model: 'deepseek-chat', version: '1', alias: 'deepseek-chat', lifecycle: 'stable', apiStyle: 'openai-completions', capability: 'chat', contextWindow: 64000, maxOutput: 8192, supportsVision: false, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: false, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.2, qualityWeight: 0.5, latencyWeight: 0.6, reliabilityWeight: 0.8, enabled: true, default: true, priority: 1, fallback: 'gpt-4o-mini' },
        'deepseek-reasoner':{ provider: 'deepseek', family: 'deepseek', series: 'reasoner', model: 'deepseek-reasoner', version: '1', alias: 'deepseek-reasoner', lifecycle: 'preview', apiStyle: 'openai-completions', capability: 'reasoning', contextWindow: 64000, maxOutput: 8192, supportsVision: false, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: false, costWeight: 0.3, qualityWeight: 0.7, latencyWeight: 0.4, reliabilityWeight: 0.7, enabled: true, default: false, priority: 1, fallback: 'claude-opus-5' },
        'deepseek-coder':   { provider: 'deepseek', family: 'deepseek', series: 'coder', model: 'deepseek-coder', version: '1', alias: 'deepseek-coder', lifecycle: 'stable', apiStyle: 'openai-completions', capability: 'coder', contextWindow: 64000, maxOutput: 8192, supportsVision: false, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.25, qualityWeight: 0.6, latencyWeight: 0.5, reliabilityWeight: 0.75, enabled: true, default: false, priority: 1, fallback: 'gpt-4o-mini' }
      }
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      api: 'anthropic-messages',
      enabled: true,
      priority: 2,
      models: {
        'claude-sonnet-5':  { provider: 'anthropic', family: 'claude', series: 'sonnet', model: 'claude-sonnet-5', version: '5', alias: 'claude-sonnet', lifecycle: 'stable', apiStyle: 'anthropic-messages', capability: 'chat', contextWindow: 200000, maxOutput: 64000, supportsVision: true, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: false, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.5, qualityWeight: 0.9, latencyWeight: 0.5, reliabilityWeight: 0.9, enabled: true, default: true, priority: 2, fallback: 'gemini-pro' },
        'claude-opus-5':    { provider: 'anthropic', family: 'claude', series: 'opus', model: 'claude-opus-5', version: '5', alias: 'claude-opus', lifecycle: 'preview', apiStyle: 'anthropic-messages', capability: 'reasoning', contextWindow: 200000, maxOutput: 64000, supportsVision: true, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.8, qualityWeight: 1.0, latencyWeight: 0.3, reliabilityWeight: 0.95, enabled: true, default: false, priority: 2, fallback: 'deepseek-reasoner' }
      }
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 3,
      models: {
        'gpt-5.6': { provider: 'openai', family: 'gpt', series: 'gpt-5', model: 'gpt-5.6', version: '5.6', alias: 'gpt', lifecycle: 'latest', apiStyle: 'openai-completions', capability: 'chat', contextWindow: 128000, maxOutput: 32768, supportsVision: true, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: false, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.6, qualityWeight: 0.85, latencyWeight: 0.5, reliabilityWeight: 0.8, enabled: true, default: true, priority: 3, fallback: 'deepseek-chat' },
        'gpt-4o-mini': { provider: 'openai', family: 'gpt', series: 'gpt-4o', model: 'gpt-4o-mini', version: '4o-mini', alias: 'gpt-4o-mini', lifecycle: 'deprecated', apiStyle: 'openai-completions', capability: 'chat', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: false, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.1, qualityWeight: 0.6, latencyWeight: 0.7, reliabilityWeight: 0.7, enabled: true, default: false, priority: 3, fallback: 'gpt-5.6' }
      }
    },
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      api: 'google-generative-ai',
      enabled: true,
      priority: 4,
      models: {
        'gemini-pro':   { provider: 'gemini', family: 'gemini', series: 'pro', model: 'gemini-pro', version: '1', alias: 'gemini-pro', lifecycle: 'stable', apiStyle: 'google-generative-ai', capability: 'reasoning', contextWindow: 1048576, maxOutput: 8192, supportsVision: true, supportsImage: true, supportsAudio: true, supportsEmbedding: true, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.3, qualityWeight: 0.75, latencyWeight: 0.5, reliabilityWeight: 0.8, enabled: true, default: true, priority: 4, fallback: 'claude-opus-5' },
        'gemini-flash': { provider: 'gemini', family: 'gemini', series: 'flash', model: 'gemini-flash', version: '1', alias: 'gemini-flash', lifecycle: 'latest', apiStyle: 'google-generative-ai', capability: 'chat', contextWindow: 1048576, maxOutput: 8192, supportsVision: true, supportsImage: true, supportsAudio: true, supportsEmbedding: true, supportsReasoning: false, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.1, qualityWeight: 0.7, latencyWeight: 0.8, reliabilityWeight: 0.75, enabled: true, default: false, priority: 4, fallback: 'deepseek-chat' }
      }
    },
    kimi: {
      baseUrl: 'https://api.moonshot.ai/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 5,
      models: {
        'kimi-k2.6': { provider: 'kimi', family: 'kimi', series: 'k2', model: 'kimi-k2.6', version: '2.6', alias: 'kimi', lifecycle: 'stable', apiStyle: 'openai-completions', capability: 'chat', contextWindow: 128000, maxOutput: 8192, supportsVision: false, supportsImage: false, supportsAudio: false, supportsEmbedding: false, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.15, qualityWeight: 0.65, latencyWeight: 0.7, reliabilityWeight: 0.7, enabled: true, default: true, priority: 5, fallback: 'deepseek-chat' }
      }
    },
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 6,
      models: {
        '*': { provider: 'openrouter', family: 'openrouter', series: 'passthrough', model: '*', version: '*', alias: 'openrouter', lifecycle: 'latest', apiStyle: 'openai-completions', capability: 'any', contextWindow: 128000, maxOutput: 8192, supportsVision: true, supportsImage: true, supportsAudio: false, supportsEmbedding: true, supportsReasoning: true, supportsStreaming: true, supportsToolCalling: true, costWeight: 0.5, qualityWeight: 0.5, latencyWeight: 0.5, reliabilityWeight: 0.5, enabled: true, default: true, priority: 6, fallback: 'deepseek-chat' }
      }
    }
  },
  defaults: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    fallbackProvider: 'openai',
    temperature: 0.7,
    contextWindow: 8000,
    retry: { max: 3, delayMs: 2000 }
  }
};

// ─── Loader: đọc config từ env MODEL_REGISTRY_JSON (thêm/đổi provider/model) ──
function loadRegistry() {
  if (typeof process !== 'undefined' && process.env && process.env.MODEL_REGISTRY_JSON) {
    try {
      const parsed = JSON.parse(process.env.MODEL_REGISTRY_JSON);
      return deepMerge(DEFAULT_MODEL_REGISTRY, parsed);
    } catch (e) {
      // config env sai → dùng default (đừng phá runtime)
    }
  }
  return DEFAULT_MODEL_REGISTRY;
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!override || typeof override !== 'object') return out;
  Object.keys(override).forEach((k) => {
    const v = override[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

// ─── Registry API ────────────────────────────────────────────────────────────

/**
 * listProviders() — danh sách provider enabled (theo priority).
 */
function listProviders() {
  const reg = loadRegistry();
  return Object.keys(reg.providers)
    .filter((id) => reg.providers[id].enabled !== false)
    .sort((a, b) => (reg.providers[a].priority || 0) - (reg.providers[b].priority || 0));
}

/**
 * listModels(providerId) — model của 1 provider (enabled).
 */
function listModels(providerId) {
  const reg = loadRegistry();
  // Không có providerId → trả toàn bộ model mọi provider (enabled)
  if (!providerId) {
    const all = [];
    Object.keys(reg.providers).forEach((pid) => {
      const p = reg.providers[pid];
      if (!p || p.enabled === false) return;
      Object.keys(p.models || {}).forEach((mid) => {
        const m = p.models[mid];
        if (m.enabled === false) return;
        all.push(Object.assign({ id: mid, provider: pid }, m));
      });
    });
    return all;
  }
  const p = reg.providers[providerId];
  if (!p || p.enabled === false) return [];
  return Object.keys(p.models || {})
    .filter((mid) => (p.models[mid].enabled !== false))
    .map((id) => Object.assign({ id, provider: providerId }, p.models[id]));
}

/**
 * resolveModel(task, policy) — ROUTING: resolve provider+model từ task/capability.
 * policy: { provider?, model?, capability?, modelRegistry? }
 * Không if/else trên từng tên — dùng registry + capability priority.
 */
function resolveModel(task, policy) {
  const reg = loadRegistry();
  const policyObj = policy || {};
  // 1) policy.model cụ thể (vd 'claude-sonnet-5')
  if (policyObj.model) {
    const found = findModel(policyObj.model);
    if (found) return found;
  }
  // 2) policy.provider cụ thể → model default của provider đó
  if (policyObj.provider) {
    const p = reg.providers[policyObj.provider];
    if (p && p.enabled !== false) {
      const def = providerDefaultModel(policyObj.provider);
      return { provider: policyObj.provider, model: def.model || def.prefix, ...def };
    }
    // fallback theo policy
    if (reg.defaults.fallbackProvider) {
      return providerDefaultModel(reg.defaults.fallbackProvider);
    }
  }
  // 3) task.capability → provider/model khớp capability
  const cap = (task && task.capability) || (policyObj.capability) || 'chat';
  const providerOrder = listProviders();
  if (task && task.provider) providerOrder.unshift(task.provider);
  for (const pid of providerOrder) {
    const p = reg.providers[pid];
    if (!p || p.enabled === false) continue;
    const models = p.models || {};
    // model có capability khớp
    const match = Object.keys(models).find((mid) => {
      const m = models[mid];
      return m.enabled !== false && (m.capability === cap || m.capability === 'any' || cap === 'any' || (m.capability && m.capability === 'default'));
    });
    if (match) return { provider: pid, model: match, label: models[match].label, capability: models[match].capability, temperature: reg.defaults.temperature };
    // nếu không, model default của provider
    const dm = Object.keys(models).find((mid) => models[mid].default);
    if (dm) return { provider: pid, model: dm, label: models[dm].label, capability: models[dm].capability, temperature: reg.defaults.temperature };
  }
  // 4) global default trị
  return { provider: reg.defaults.provider, model: reg.defaults.model, temperature: reg.defaults.temperature, fallback: reg.defaults.fallbackProvider };
}

function findModel(modelIdOrProviderModel) {
  const reg = loadRegistry();
  const providerOrder = listProviders();
  // dạng "provider/model"
  if (typeof modelIdOrProviderModel === 'string' && modelIdOrProviderModel.indexOf('/') > 0) {
    const [pp, mm] = modelIdOrProviderModel.split('/');
    const p = reg.providers[pp];
    if (p && p.models && p.models[mm]) {
      return { provider: pp, model: mm, label: p.models[mm].label, capability: p.models[mm].capability };
    }
    return null;
  }
  // model id thuần → tìm trong mọi provider
  for (const pid of providerOrder) {
    const p = reg.providers[pid];
    if (p && p.models && p.models[modelIdOrProviderModel]) {
      const m = p.models[modelIdOrProviderModel];
      return { provider: pid, model: modelIdOrProviderModel, label: m.label, capability: m.capability };
    }
  }
  return null;
}

function providerDefaultModel(providerId) {
  const reg = loadRegistry();
  const p = reg.providers[providerId];
  if (!p || !p.models) return null;
  const dm = Object.keys(p.models).find((mid) => p.models[mid].default);
  const mid = dm || Object.keys(p.models)[0];
  if (!mid) return null;
  const m = p.models[mid];
  return { provider: providerId, model: mid, label: m.label, capability: m.capability, temperature: reg.defaults.temperature };
}

module.exports = {
  DEFAULT_MODEL_REGISTRY,
  loadRegistry,
  listProviders,
  listModels,
  resolveModel,
  findModel,
  providerDefaultModel
};

// ─── CAPABILITY 2: bổ sung API + Validation (không sửa resolveModel) ──────

/**
 * getProvider(providerId) — trả metadata 1 provider (gồm baseUrl/api/enabled/priority/models).
 */
function getProvider(providerId) {
  const reg = loadRegistry();
  const p = reg.providers[providerId];
  return p ? Object.assign({ id: providerId }, p) : null;
}

/**
 * getModel(modelId, providerId?) — trả metadata đầy đủ 1 model (cả provider).
 */
function getModel(modelId, providerId) {
  const reg = loadRegistry();
  if (providerId) {
    const p = reg.providers[providerId];
    const m = p && p.models && p.models[modelId];
    return m ? Object.assign({ id: modelId, provider: providerId }, m) : null;
  }
  // không provider → tìm trong mọi provider
  const found = findModel(modelId);
  return found;
}

/**
 * getFallback(modelOrProvider) — trả model fallback của 1 model/provider.
 */
function getFallback(modelIdOrProvider) {
  const reg = loadRegistry();
  // model id
  const m = findModel(modelIdOrProvider);
  if (m && m.fallback) return findModel(m.fallback) || { provider: null, model: m.fallback };
  // provider id → fallback provider
  const provider = getProvider(modelIdOrProvider);
  if (provider && provider.fallback) return { provider: provider.fallback, model: null };
  if (reg.defaults && reg.defaults.fallbackProvider) return { provider: reg.defaults.fallbackProvider, model: null };
  return null;
}

/**
 * getDefaultModel(providerId?) — model default (1 provider hoặc toàn registry).
 */
function getDefaultModel(providerId) {
  const reg = loadRegistry();
  if (providerId) return providerDefaultModel(providerId);
  const all = listProviders();
  for (const pid of all) {
    const d = providerDefaultModel(pid);
    if (d) return d;
  }
  return { provider: reg.defaults.provider, model: reg.defaults.model };
}

/**
 * getCapabilityModels(capability) — danh sách model khớp capability (mọi provider enabled).
 */
function getCapabilityModels(capability) {
  const reg = loadRegistry();
  const out = [];
  Object.keys(reg.providers).forEach((pid) => {
    const p = reg.providers[pid];
    if (!p || p.enabled === false) return;
    Object.keys(p.models || {}).forEach((mid) => {
      const m = p.models[mid];
      if (m.enabled === false) return;
      if (m.capability === capability || m.capability === 'any' || capability === 'any') {
        out.push(Object.assign({ id: mid, provider: pid }, m));
      }
    });
  });
  return out;
}

/**
 * validateRegistry() — validate cấu trúc registry; throw Error (Runtime Error) nếu sai format.
 */
function validateRegistry() {
  const reg = loadRegistry();
  if (!reg || typeof reg !== 'object' || !reg.providers || typeof reg.providers !== 'object') {
    throw new Error('ModelRegistry invalid: thiếu providers object.');
  }
  const ids = Object.keys(reg.providers);
  if (!ids.length) throw new Error('ModelRegistry invalid: không có provider nào.');
  ids.forEach((pid) => {
    const p = reg.providers[pid];
    if (!p || typeof p !== 'object') throw new Error('ModelRegistry invalid: provider ' + pid + ' không phải object.');
    if (!p.models || typeof p.models !== 'object') throw new Error('ModelRegistry invalid: provider ' + pid + ' thiếu models object.');
    Object.keys(p.models).forEach((mid) => {
      const m = p.models[mid];
      if (!m || typeof m !== 'object') throw new Error('ModelRegistry invalid: model ' + pid + '/' + mid + ' không phải object.');
      if (!m.capability) throw new Error('ModelRegistry invalid: model ' + pid + '/' + mid + ' thiếu capability.');
    });
  });
  return true;
}

module.exports.getProvider = getProvider;
module.exports.getModel = getModel;
module.exports.getFallback = getFallback;
module.exports.getDefaultModel = getDefaultModel;
module.exports.getCapabilityModels = getCapabilityModels;
module.exports.validateRegistry = validateRegistry;

