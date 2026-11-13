/**
 * js/module-runtime.js — Module Runtime (Phase 6 Part 2).
 * Module hoạt động như Plugin: khai báo id, version, deps, permissions, hooks.
 * Service Registry: đăng ký service, không import chéo.
 * Event Bus: publish/subscribe giữa các module.
 */
var ModuleRuntime = (function() {
  'use strict';

  // === Module Registry ===
  var MODULES = {};
  var SERVICES = {};
  var EVENTS = {};
  var HOOKS = {};

  // === Module Lifecycle ===
  function registerModule(config) {
    if (!config || !config.id) return;
    MODULES[config.id] = {
      id: config.id,
      version: config.version || '1.0.0',
      name: config.name || config.id,
      dependencies: config.dependencies || [],
      permissions: config.permissions || [],
      routes: config.routes || [],
      services: config.services || [],
      hooks: config.hooks || [],
      enabled: config.enabled !== false,
      status: 'registered',
      order: config.order || 99,
      category: config.category || 'general'
    };
    // Register services
    (config.services || []).forEach(function(svc) {
      registerService(config.id + '.' + svc.name, svc.impl);
    });
    // Register hooks
    (config.hooks || []).forEach(function(hk) {
      if (!HOOKS[hk.point]) HOOKS[hk.point] = [];
      HOOKS[hk.point].push({ moduleId: config.id, handler: hk.handler, priority: hk.priority || 10 });
    });
  }

  function getModule(id) { return MODULES[id] || null; }
  function getModules() { return Object.values(MODULES); }
  function getEnabledModules() { return Object.values(MODULES).filter(function(m) { return m.enabled; }); }

  function enableModule(id) { if (MODULES[id]) { MODULES[id].enabled = true; MODULES[id].status = 'active'; } }
  function disableModule(id) { if (MODULES[id]) { MODULES[id].enabled = false; MODULES[id].status = 'disabled'; } }

  function resolveDependencies(id) {
    var mod = MODULES[id];
    if (!mod) return [];
    var unresolved = [];
    (mod.dependencies || []).forEach(function(dep) {
      if (!MODULES[dep] || !MODULES[dep].enabled) unresolved.push(dep);
    });
    return unresolved;
  }

  // === Event Bus ===
  function on(event, handler) {
    if (!EVENTS[event]) EVENTS[event] = [];
    EVENTS[event].push(handler);
  }

  function emit(event, data) {
    var handlers = EVENTS[event] || [];
    var results = [];
    handlers.forEach(function(h) {
      try { results.push(h(data)); } catch(e) { results.push(Promise.reject(e)); }
    });
    return Promise.all(results);
  }

  function off(event, handler) {
    if (!EVENTS[event]) return;
    EVENTS[event] = EVENTS[event].filter(function(h) { return h !== handler; });
  }

  // === Hook System ===
  function runHook(point, context) {
    var handlers = HOOKS[point] || [];
    var sorted = handlers.sort(function(a, b) { return a.priority - b.priority; });
    return sorted.reduce(function(chain, h) {
      return chain.then(function(ctx) { return h.handler(ctx); });
    }, Promise.resolve(context));
  }

  // === Service Registry ===
  function registerService(name, impl) {
    SERVICES[name] = impl;
  }

  function getService(name) {
    return SERVICES[name] || null;
  }

  function getServices() { return Object.keys(SERVICES); }

  // === Configuration Engine ===
  var CONFIG = { platform: {}, business: {}, module: {}, ai: {}, security: {} };

  function setConfig(scope, key, value) {
    if (!CONFIG[scope]) CONFIG[scope] = {};
    CONFIG[scope][key] = value;
  }

  function getConfig(scope, key) {
    if (!CONFIG[scope]) return null;
    if (key) return CONFIG[scope][key];
    return CONFIG[scope];
  }

  function getAllConfig() { return CONFIG; }

  return {
    registerModule: registerModule, getModule: getModule, getModules: getModules,
    getEnabledModules: getEnabledModules, enableModule: enableModule, disableModule: disableModule,
    resolveDependencies: resolveDependencies,
    on: on, emit: emit, off: off,
    runHook: runHook,
    registerService: registerService, getService: getService, getServices: getServices,
    setConfig: setConfig, getConfig: getConfig, getAllConfig: getAllConfig
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = ModuleRuntime; }
