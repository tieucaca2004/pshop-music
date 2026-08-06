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
        'deepseek-chat':    { label: 'DeepSeek Chat',    capability: 'chat',   default: true },
        'deepseek-reasoner':{ label: 'DeepSeek Reason',  capability: 'reasoning' },
        'deepseek-coder':   { label: 'DeepSeek Coder',   capability: 'coder' }
      }
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      api: 'anthropic-messages',
      enabled: true,
      priority: 2,
      models: {
        'claude-sonnet-5':  { label: 'Claude Sonnet', capability: 'chat', default: true },
        'claude-opus-5':    { label: 'Claude Opus',   capability: 'reasoning' }
      }
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 3,
      models: {
        'gpt-5.6': { label: 'ChatGPT GPT-5.6', capability: 'chat', default: true },
        'gpt-4o-mini': { label: 'GPT-4o Mini', capability: 'chat' }
      }
    },
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      api: 'google-generative-ai',
      enabled: true,
      priority: 4,
      models: {
        'gemini-pro':   { label: 'Gemini Pro',   capability: 'reasoning', default: true },
        'gemini-flash': { label: 'Gemini Flash', capability: 'chat' }
      }
    },
    kimi: {
      baseUrl: 'https://api.moonshot.ai/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 5,
      models: {
        'kimi-k2.6': { label: 'Kimi 2.6', capability: 'chat', default: true }
      }
    },
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      api: 'openai-completions',
      enabled: true,
      priority: 6,
      models: {
        '*': { label: 'OpenRouter (dynamic pass-through)', capability: 'any', default: true }
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
  const p = reg.providers[providerId];
  if (!p || p.enabled === false) return [];
  return Object.keys(p.models || {}).map((id) => Object.assign({ id, provider: providerId }, p.models[id]));
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
