/**
 * js/workspace-engine.js — Workspace Engine (Phase 6).
 * Sinh Workspace động theo Business Context.
 * Không hard-code module. Mọi doanh nghiệp dùng chung engine.
 */
var WorkspaceEngine = (function() {
  'use strict';

  var MODULE_REGISTRY = [];

  function registerModule(mod) {
    if (!mod || !mod.id) return;
    // Check duplicate
    for (var i = 0; i < MODULE_REGISTRY.length; i++) {
      if (MODULE_REGISTRY[i].id === mod.id) return;
    }
    MODULE_REGISTRY.push({
      id: mod.id, name: mod.name || mod.id,
      icon: mod.icon || '&#128196;',
      route: mod.route || '/' + mod.id,
      permission: mod.permission || 'viewer',
      category: mod.category || 'general',
      order: mod.order || 99,
      enabled: mod.enabled !== false,
      description: mod.description || ''
    });
  }

  function getModules(businessId) {
    var config = getBusinessConfig(businessId);
    return MODULE_REGISTRY
      .filter(function(m) { return config[m.id] !== false && m.enabled; })
      .sort(function(a, b) { return (config[a.id + '_order'] || a.order) - (config[b.id + '_order'] || b.order); });
  }

  function getNavigation(businessId) {
    var modules = getModules(businessId);
    var nav = { top: [], sidebar: [], settings: [] };
    modules.forEach(function(m) {
      var category = m.category;
      if (category === 'settings') { nav.settings.push(m); }
      else if (category === 'top') { nav.top.push(m); }
      else { nav.sidebar.push(m); }
    });
    return nav;
  }

  var BUSINESS_CONFIGS = {};
  function setBusinessConfig(businessId, config) { BUSINESS_CONFIGS[businessId] = config || {}; }
  function getBusinessConfig(businessId) { return BUSINESS_CONFIGS[businessId] || {}; }

  // === Dashboard Engine ===
  var WIDGET_REGISTRY = [];

  function registerWidget(widget) {
    if (!widget || !widget.id) return;
    WIDGET_REGISTRY.push(widget);
  }

  function getDashboard(businessId) {
    var config = getBusinessConfig(businessId);
    return WIDGET_REGISTRY
      .filter(function(w) { return config['widget_' + w.id] !== false; })
      .sort(function(a, b) { return (a.order || 99) - (b.order || 99); });
  }

  // === Feature Flags ===
  var FEATURE_FLAGS = {};
  function setFeatureFlag(name, value, scope) {
    scope = scope || 'platform';
    if (!FEATURE_FLAGS[scope]) FEATURE_FLAGS[scope] = {};
    FEATURE_FLAGS[scope][name] = value;
  }
  function getFeatureFlag(name, businessId) {
    var bizScope = businessId ? FEATURE_FLAGS[businessId] : null;
    if (bizScope && bizScope[name] !== undefined) return bizScope[name];
    if (FEATURE_FLAGS.platform && FEATURE_FLAGS.platform[name] !== undefined) return FEATURE_FLAGS.platform[name];
    return false;
  }

  // === Workspace API ===
  function getWorkspace(businessId, role) {
    return {
      businessId: businessId,
      modules: getModules(businessId),
      navigation: getNavigation(businessId),
      dashboard: getDashboard(businessId),
      features: getFeatureFlags(businessId),
      role: role
    };
  }

  function getFeatureFlags(businessId) {
    var result = {};
    Object.keys(FEATURE_FLAGS).forEach(function(scope) {
      if (scope === 'platform' || scope === businessId) {
        Object.keys(FEATURE_FLAGS[scope]).forEach(function(key) {
          result[key] = FEATURE_FLAGS[scope][key];
        });
      }
    });
    return result;
  }

  return {
    registerModule: registerModule,
    getModules: getModules,
    getNavigation: getNavigation,
    setBusinessConfig: setBusinessConfig,
    getBusinessConfig: getBusinessConfig,
    registerWidget: registerWidget,
    getDashboard: getDashboard,
    setFeatureFlag: setFeatureFlag,
    getFeatureFlag: getFeatureFlag,
    getWorkspace: getWorkspace
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = WorkspaceEngine; }

// Register core modules
(function() {
  var engine = typeof module !== 'undefined' ? require('./workspace-engine') : WorkspaceEngine;
  var modules = [
    {id:'dashboard',name:'Dashboard',icon:'📊',route:'/workspace/dashboard',permission:'viewer',category:'top',order:1},
    {id:'products',name:'Products',icon:'📦',route:'/workspace/products',permission:'editor',category:'content',order:2},
    {id:'orders',name:'Orders',icon:'📋',route:'/workspace/orders',permission:'editor',category:'content',order:3},
    {id:'customers',name:'Customers',icon:'👥',route:'/workspace/customers',permission:'editor',category:'content',order:4},
    {id:'categories',name:'Categories',icon:'🏷️',route:'/workspace/categories',permission:'editor',category:'content',order:5},
    {id:'cms',name:'CMS',icon:'📝',route:'/workspace/cms',permission:'editor',category:'content',order:6},
    {id:'media',name:'Media',icon:'🖼️',route:'/workspace/media',permission:'editor',category:'content',order:7},
    {id:'ai',name:'AI Assistant',icon:'🤖',route:'/workspace/ai',permission:'editor',category:'content',order:8},
    {id:'reports',name:'Reports',icon:'📈',route:'/workspace/reports',permission:'viewer',category:'general',order:9},
    {id:'team',name:'Team',icon:'👤',route:'/workspace/team',permission:'admin',category:'settings',order:10},
    {id:'settings',name:'Settings',icon:'⚙️',route:'/workspace/settings',permission:'admin',category:'settings',order:11},
  ];
  modules.forEach(function(m) { engine.registerModule(m); });

  engine.setFeatureFlag('ai_generation', true, 'platform');
  engine.setFeatureFlag('facebook_integration', false, 'platform');
  engine.setFeatureFlag('multi_business', true, 'platform');
})();
