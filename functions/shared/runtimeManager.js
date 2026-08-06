/*
 * shared/runtimeManager.js — AI RUNTIME MANAGER (backend)
 * MISSION — AI RUNTIME MANAGER (directive 2026-08-06 03:48). REUSE FIRST.
 *
 * Là nơi DUY NHẤT điều phối Runtime. Flow:
 *   Task → AI Runtime Manager → Capability Evaluation → Policy Evaluation
 *        → Model Registry → Provider Router → Request Builder → Adapter
 *
 * - KHÔNG tạo Registry mới (metadata nằm trong modelRegistry; policy cũng vậy).
 * - Health là RUNTIME STATE (không hard-code): Runtime Manager đọc trạng thái
 *   health để quyết định Routing (fallback provider/model khi provider lỗi/offline).
 * - Cost Strategy dùng WEIGHT (Cost/Quality/Latency/Reliability) — Founder chỉ
 *   chỉnh weight, không dùng Cheap/Balanced/Premium.
 * - Provider Router chỉ làm Provider→Adapter (không resolve model ở đây).
 */
const modelRegistry = require('./modelRegistry');
const providerRouter = require('./providerRouter');
const requestBuilder = require('./requestBuilder');

// ─── Cost Strategy (Weight) — Founder chỉnh được qua env COST_STRATEGY_JSON ──
const DEFAULT_COST_WEIGHT = {
  cost: 0.25,
  quality: 0.25,
  latency: 0.25,
  reliability: 0.25
};
const DEFAULT_STRATEGY = 'balanced';

function loadCostStrategy() {
  if (typeof process !== 'undefined' && process.env && process.env.COST_STRATEGY_JSON) {
    try { return Object.assign({}, DEFAULT_COST_WEIGHT, JSON.parse(process.env.COST_STRATEGY_JSON)); }
    catch (e) { return DEFAULT_COST_WEIGHT; }
  }
  const strategyName = (typeof process !== 'undefined' && process.env && process.env.COST_STRATEGY) || DEFAULT_STRATEGY;
  // chiến lược tham chiếu → weight (Founder có thể override bằng weight trực tiếp)
  const PRESETS = {
    cost_first:      { cost: 0.6, quality: 0.1, latency: 0.15, reliability: 0.15 },
    balanced:        { cost: 0.25, quality: 0.25, latency: 0.25, reliability: 0.25 },
    quality_first:   { cost: 0.1, quality: 0.6, latency: 0.15, reliability: 0.15 },
    latency_first:   { cost: 0.1, quality: 0.1, latency: 0.7, reliability: 0.1 },
    reliability_first:{ cost: 0.1, quality: 0.1, latency: 0.15, reliability: 0.65 }
  };
  return PRESETS[strategyName] || DEFAULT_COST_WEIGHT;
}

// ─── Health Runtime State (KHÔNG hard-code — được nạp từ runtime/nơi gọi) ──
// Runtime Manager nhận `healthState` (đối tượng { provider: 'healthy'|'busy'|'rate_limited'|'offline'|'disabled' })
// từ hệ thống gọi (vd API layer) — nó chỉ đọc, không lưu cấu hình.
function isReady(providerHealth, providerId, task) {
  const h = (providerHealth && providerHealth[providerId]) || (task && task.providerHealth && task.providerHealth[providerId]);
  if (!h) return true; // không có health data → giả định ready (không hard-code offline)
  return h !== 'offline' && h !== 'disabled' && h !== 'rate_limited';
}

// ─── Capability Evaluation ────────────────────────────────────────────────────
// Map task.capability → danh sách provider khả dụng (từ modelRegistry + health)
function capabilityEval(task, policy, healthState) {
  const reg = modelRegistry.loadRegistry ? modelRegistry.loadRegistry() : modelRegistry.DEFAULT_MODEL_REGISTRY;
  const cap = (task && task.capability) || (policy && policy.capability) || 'chat';
  const providers = modelRegistry.listProviders ? modelRegistry.listProviders() : Object.keys(reg.providers);
  // provider khớp capability + không offline/disabled
  const candidates = [];
  providers.forEach((pid) => {
    if (!isReady(healthState, pid, task)) return;
    const p = reg.providers[pid];
    const models = (p && p.models) || {};
    const hasCap = Object.keys(models).some((mid) => {
      const m = models[mid];
      const mcap = (m && m.capability) || 'chat';
      return mcap === cap || mcap === 'any' || cap === 'any';
    });
    if (hasCap || cap === 'any') candidates.push(pid);
  });
  return { capability: cap, candidates: candidates };
}

// ─── Policy Evaluation ────────────────────────────────────────────────────────
// policy: { strategy/weight, provider?, model?, capability?, modelRegistry? } → resolve provider+model
function policyEval(task, policy, healthState, costWeight) {
  const res = modelRegistry.resolveModel(task, policy);
  // override theo weight/strategy nếu policy không chỉ định provider/model cụ thể
  if (!policy || (!policy.provider && !policy.model)) {
    // chọn provider khả dụng, score theo weight (cost/quality/latency/reliability) từ registry metadata
    const weighted = pickByWeight(costWeight, healthState, task);
    if (weighted) return weighted;
  }
  return res;
}
function pickByWeight(weight, healthState, task) {
  const reg = modelRegistry.loadRegistry ? modelRegistry.loadRegistry() : modelRegistry.DEFAULT_MODEL_REGISTRY;
  const providers = modelRegistry.listProviders ? modelRegistry.listProviders() : Object.keys(reg.providers);
  let best = null; let bestScore = -Infinity;
  providers.forEach((pid) => {
    if (!isReady(healthState, pid, task)) return;
    const p = reg.providers[pid];
    // metadata cost/latency/reliability từ registry (0..1) — nếu thiếu mặc định 0.5
    const meta = (p && p.costPolicy) || { cost: 0.5, quality: 0.5, latency: 0.5, reliability: 0.5 };
    const score = (weight.cost * (1 - meta.cost)) + (weight.quality * meta.quality) + (weight.latency * (1 - meta.latency)) + (weight.reliability * meta.reliability);
    if (score > bestScore) { bestScore = score; best = pid; }
  });
  if (best) return modelRegistry.providerDefaultModel(best);
  return null;
}

// ─── Runtime Flow: Task → Capability → Policy → Model Registry → Router → Builder ──
/**
 * execute(task, policy, opts) — điều phối toàn bộ:
 * opts: { type, prompt, size, healthState, context? } (healthState là runtime data)
 */
function execute(task, policy, opts) {
  opts = opts || {};
  const weights = loadCostStrategy();
  const health = opts.healthState || {};
  return Promise.resolve().then(function () {
    // 1. Capability Evaluation
    const capEval = capabilityEval(task, policy, health);
    // 2. Policy Evaluation → provider+model
    const res = policyEval(task, policy, health, weights);
    const providerId = (res && res.provider) || (capEval.candidates[0]) || modelRegistry.DEFAULT_MODEL_REGISTRY.defaults.provider;
    // 3. Provider Router → Adapter (router không resolve model — nhận model từ đây)
    return providerRouter.route(Object.assign({}, opts, {
      providerId: providerId,
      model: (res && res.model) || (opts && opts.model),
      capability: capEval.capability,
      baseUrl: opts.baseUrl, apiKey: opts.apiKey,
      temperature: (res && res.temperature) || (opts && opts.temperature)
    }));
  });
}

module.exports = {
  execute,
  capabilityEval,
  policyEval,
  loadCostStrategy,
  isReady,
  DEFAULT_COST_WEIGHT
};

/* ═══════════════════════════════════════════
 * AI OPERATING SYSTEM (MISSION 03:52) — mở rộng Runtime Manager
 * Kiến trúc (không VERIFY/syntax/commit — chỉ hoàn thiện thiết kế):
 *
 * Runtime Manager không chỉ Routing — quản lý: Session, Conversation,
 * Memory, Context Window, Workflow, Tool Calling, Plugin Runtime, MCP,
 * Health, Provider.
 *
 * Flow: Task → AI Runtime Manager → Session → Conversation → Memory
 *     → Workflow → Capability → Policy → Model Registry → Health
 *     → Provider Router → Request Builder → Plugin Runtime → Adapter → AI Provider
 *
 * Metadata (Session/Conversation/Memory/Context/Workflow/Tool/Plugin/MCP)
 * được giữ trong runtime state của task — KHÔNG tạo Registry mới (REUSE FIRST,
 * metadata thuộc Model Registry / runtimeManager).
 */

/**
 * buildRuntimeMeta(task, opts) — tập hợp metadata runtime của 1 Task.
 * Nguồn: task.session/conversation/memory/contextWindow/workflow/tools/plugin/mcp
 * (do người gọi truyền; runtimeManager chỉ tổ chức lại, không lưu mới).
 */
function buildRuntimeMeta(task, opts) {
  task = task || {};
  opts = opts || {};
  return {
    sessionId: task.sessionId || opts.sessionId || null,
    conversationId: task.conversationId || opts.conversationId || null,
    memory: task.memory || opts.memory || null,          // context từ memory backend
    contextWindow: task.contextWindow || opts.contextWindow || null,
    workflow: task.workflow || opts.workflow || null,     // workflow definition nếu có
    tools: task.tools || opts.tools || null,              // tool calling list
    pluginRuntime: task.pluginRuntime || opts.pluginRuntime || null, // OpenClaw Plugin/MCP/tools
    mcp: task.mcp || opts.mcp || null
  };
}

/**
 * runTask(task, policy, opts) — AI Operating System entry-point.
 * Điều phối toàn bộ runtime (mục 4 flow). Trả kết quả adapter + runtime meta.
 * Không sửa syntax adapter (sẽ cleanup ở bước VERIFY theo directive sau).
 */
function runTask(task, policy, opts) {
  opts = opts || {};
  const meta = buildRuntimeMeta(task, opts);
  return execute(task, policy, opts).then(function (res) {
    return Object.assign({}, res, { runtimeMeta: meta });
  });
}

module.exports.runTask = runTask;
module.exports.buildRuntimeMeta = buildRuntimeMeta;

