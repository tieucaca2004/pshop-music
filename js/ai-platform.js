/**
 * js/ai-platform.js — AI Platform (Phase 8).
 * AI là Platform Capability dùng chung cho mọi business.
 * Provider Engine, Prompt Engine, Memory, Knowledge, Agent Runtime, Tool Registry.
 */
var AIPlatform = (function() {
  'use strict';

  // === Task 1: AI Provider Engine ===
  var PROVIDERS = {};
  function registerProvider(config) {
    if (!config || !config.id) return;
    PROVIDERS[config.id] = {
      id: config.id, name: config.name || config.id,
      generate: config.generate || function() { return Promise.reject(new Error('Not implemented')); },
      embed: config.embed || function() { return Promise.reject(new Error('Embedding not supported')); },
      enabled: config.enabled !== false, model: config.model || 'default',
      config: config.config || {}
    };
  }
  function getProvider(id) { return PROVIDERS[id] || null; }
  function getProviders() { return Object.values(PROVIDERS); }
  function generate(providerId, prompt, options) {
    var p = PROVIDERS[providerId];
    if (!p) return Promise.reject(new Error('Provider ' + providerId + ' not found'));
    return p.generate(prompt, options || {});
  }

  // === Task 2: Prompt Engine ===
  var PROMPT_TEMPLATES = {};
  function registerTemplate(config) {
    if (!config || !config.id) return;
    PROMPT_TEMPLATES[config.id] = {
      id: config.id, version: config.version || '1',
      template: config.template || '',
      variables: config.variables || [],
      description: config.description || '',
      createdAt: Date.now()
    };
  }
  function renderTemplate(templateId, variables) {
    var tpl = PROMPT_TEMPLATES[templateId];
    if (!tpl) return Promise.reject(new Error('Template not found: ' + templateId));
    var result = tpl.template;
    (tpl.variables || []).forEach(function(v) {
      result = result.replace(new RegExp('\\$\\{' + v + '\\}', 'g'), (variables[v] || ''));
    });
    return Promise.resolve(result);
  }
  function getTemplate(id) { return PROMPT_TEMPLATES[id] || null; }

  // === Task 3: Business Memory ===
  var BUSINESS_MEMORY = {};
  var USER_MEMORY = {};
  var SESSION_MEMORY = {};
  var TEMP_MEMORY = {};

  function remember(scope, key, value, businessId, userId) {
    var store = scope === 'user' ? USER_MEMORY : scope === 'session' ? SESSION_MEMORY : scope === 'temp' ? TEMP_MEMORY : BUSINESS_MEMORY;
    var namespace = businessId || 'default';
    if (!store[namespace]) store[namespace] = {};
    if (scope === 'user' && userId) {
      if (!store[namespace][userId]) store[namespace][userId] = {};
      store[namespace][userId][key] = { value: value, timestamp: Date.now() };
    } else {
      store[namespace][key] = { value: value, timestamp: Date.now() };
    }
  }
  function recall(scope, key, businessId, userId) {
    var store = scope === 'user' ? USER_MEMORY : scope === 'session' ? SESSION_MEMORY : scope === 'temp' ? TEMP_MEMORY : BUSINESS_MEMORY;
    var namespace = businessId || 'default';
    if (!store[namespace]) return null;
    if (scope === 'user' && userId && store[namespace][userId]) return store[namespace][userId][key] || null;
    return store[namespace][key] || null;
  }
  function clearMemory(scope, businessId) {
    var store = scope === 'user' ? USER_MEMORY : scope === 'session' ? SESSION_MEMORY : scope === 'temp' ? TEMP_MEMORY : BUSINESS_MEMORY;
    if (businessId) delete store[businessId];
    else { Object.keys(store).forEach(function(k) { delete store[k]; }); }
  }

  // === Task 4: Knowledge Base Engine ===
  var KNOWLEDGE = {};
  function indexDocument(businessId, docId, content, metadata) {
    if (!KNOWLEDGE[businessId]) KNOWLEDGE[businessId] = {};
    KNOWLEDGE[businessId][docId] = { content: content, metadata: metadata || {}, indexedAt: Date.now() };
  }
  function searchKnowledge(businessId, query) {
    var docs = KNOWLEDGE[businessId];
    if (!docs) return [];
    var q = query.toLowerCase();
    return Object.keys(docs).map(function(id) {
      var doc = docs[id];
      var score = (doc.content || '').toLowerCase().indexOf(q) >= 0 ? 1 : 0;
      return { id: id, score: score, content: doc.content, metadata: doc.metadata };
    }).filter(function(r) { return r.score > 0; }).sort(function(a, b) { return b.score - a.score; });
  }
  function getEmbedding(_text) { return Promise.resolve([]); } // Interface stub
  function retrieve(businessId, query, limit) { var r = searchKnowledge(businessId, query); return Promise.resolve(r.slice(0, limit || 5)); }

  // === Task 5: AI Agent Runtime ===
  var AGENTS = {};
  function createAgent(config) {
    var id = 'agent-' + Date.now();
    AGENTS[id] = {
      id: id, name: config.name || 'Agent', systemPrompt: config.systemPrompt || '',
      provider: config.provider || 'openai', model: config.model || 'gpt-4o-mini',
      memory: { business: config.businessMemory || true, user: config.userMemory || false, session: true },
      knowledge: config.knowledge || { enabled: false, businessId: null },
      tools: config.tools || [], enabled: config.enabled !== false,
      permissions: config.permissions || [], createdAt: Date.now()
    };
    return id;
  }
  function runAgent(agentId, input, context) {
    var agent = AGENTS[agentId];
    if (!agent) return Promise.reject(new Error('Agent not found'));
    var provider = PROVIDERS[agent.provider];
    if (!provider) return Promise.reject(new Error('Provider ' + agent.provider + ' not configured'));
    var prompt = agent.systemPrompt + '\n\nUser: ' + input + '\n\nContext: ' + JSON.stringify(context || {});
    return provider.generate(prompt, { model: agent.model });
  }

  // === Task 6: Tool Registry ===
  var TOOLS = {};
  function registerTool(config) {
    if (!config || !config.id) return;
    TOOLS[config.id] = {
      id: config.id, name: config.name || config.id,
      description: config.description || '',
      execute: config.execute || function() { return Promise.reject(new Error('Not implemented')); },
      parameters: config.parameters || [],
      permission: config.permission || 'admin',
      enabled: config.enabled !== false
    };
  }
  function getTool(id) { return TOOLS[id] || null; }
  function getTools() { return Object.values(TOOLS); }
  function executeTool(id, params, context) {
    var tool = TOOLS[id];
    if (!tool) return Promise.reject(new Error('Tool not found: ' + id));
    return tool.execute(params, context || {});
  }

  return {
    registerProvider: registerProvider, getProvider: getProvider, getProviders: getProviders, generate: generate,
    registerTemplate: registerTemplate, renderTemplate: renderTemplate, getTemplate: getTemplate,
    remember: remember, recall: recall, clearMemory: clearMemory,
    indexDocument: indexDocument, searchKnowledge: searchKnowledge, getEmbedding: getEmbedding, retrieve: retrieve,
    createAgent: createAgent, runAgent: runAgent,
    registerTool: registerTool, getTool: getTool, getTools: getTools, executeTool: executeTool
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = AIPlatform; }
