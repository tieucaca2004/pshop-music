/**
 * js/extension-framework.js — Extension Framework (Phase 7).
 * Platform Extension Layer: plugins, connectors, workflows, jobs, notifications, SDK.
 */
var PSH = (function() {
  'use strict';

  // === Extension Registry ===
  var EXTENSIONS = {};
  var CONNECTORS = {};
  var WORKFLOWS = {};
  var JOBS = {};
  var NOTIFICATIONS = {};

  // === Task 1: Extension Framework ===
  function registerExtension(config) {
    if (!config || !config.id) return;
    EXTENSIONS[config.id] = {
      id: config.id, version: config.version || '1.0',
      name: config.name || config.id, author: config.author || '',
      permissions: config.permissions || [],
      dependencies: config.dependencies || [],
      configuration: config.configuration || {},
      enabled: config.enabled !== false,
      type: config.type || 'plugin',
      status: 'registered'
    };
  }

  function getExtension(id) { return EXTENSIONS[id] || null; }
  function getExtensions() { return Object.values(EXTENSIONS); }

  // === Task 2: Connector Engine ===
  function registerConnector(config) {
    if (!config || !config.id) return;
    CONNECTORS[config.id] = {
      id: config.id, name: config.name || config.id,
      type: config.type || 'rest',
      config: config.configuration || {},
      enabled: config.enabled !== false,
      authenticate: config.authenticate || function() { return Promise.resolve(false); },
      send: config.send || function() { return Promise.reject(new Error('Not implemented')); },
      receive: config.receive || function() { return Promise.resolve(null); }
    };
  }

  function getConnector(id) { return CONNECTORS[id] || null; }
  function getConnectors() { return Object.values(CONNECTORS); }

  // Connector interfaces (no real integrations)
  var CONNECTOR_TYPES = { rest: 'REST API', webhook: 'Webhook', graphql: 'GraphQL', grpc: 'gRPC' };

  // === Task 3: Workflow Engine Foundation ===
  function createWorkflow(config) {
    var id = 'wf-' + Date.now();
    WORKFLOWS[id] = {
      id: id, name: config.name || 'Workflow',
      trigger: config.trigger || { type: 'manual', event: null },
      steps: config.steps || [],
      enabled: config.enabled !== false,
      status: 'created', createdAt: Date.now()
    };
    return id;
  }

  function executeWorkflow(id, context) {
    var wf = WORKFLOWS[id];
    if (!wf) return Promise.reject(new Error('Workflow not found'));
    return wf.steps.reduce(function(chain, step) {
      return chain.then(function(ctx) {
        if (step.type === 'delay') return new Promise(function(r) { setTimeout(r, step.duration || 1000); }).then(function() { return ctx; });
        if (step.type === 'condition' && step.condition) {
          return step.condition(ctx) ? Promise.resolve(ctx) : Promise.reject(new Error('Condition failed'));
        }
        if (step.type === 'action' && step.handler) return step.handler(ctx);
        return Promise.resolve(ctx);
      });
    }, Promise.resolve(context || {}));
  }

  // === Task 4: Job & Queue Engine ===
  var JOB_QUEUE = [];

  function enqueueJob(config) {
    var id = 'job-' + Date.now();
    JOB_QUEUE.push({ id: id, type: config.type || 'background', payload: config.payload || {},
      status: 'queued', retries: 0, maxRetries: config.maxRetries || 3,
      createdAt: Date.now(), scheduledAt: config.scheduledAt || null,
      handler: config.handler || function() { return Promise.resolve(); } });
    return id;
  }

  function processQueue() {
    var pending = JOB_QUEUE.filter(function(j) { return j.status === 'queued' && (!j.scheduledAt || j.scheduledAt <= Date.now()); });
    pending.forEach(function(job) {
      job.status = 'running';
      job.handler(job.payload).then(function() { job.status = 'completed'; })
        .catch(function(err) {
          job.retries++;
          if (job.retries >= job.maxRetries) { job.status = 'failed'; job.error = err.message; }
          else { job.status = 'queued'; } // retry
        });
    });
  }

  function getJobs(status) { return status ? JOB_QUEUE.filter(function(j) { return j.status === status; }) : JOB_QUEUE; }

  // === Task 5: Notification Engine ===
  function sendNotification(channel, to, subject, body) {
    var id = 'notif-' + Date.now();
    NOTIFICATIONS[id] = { id: id, channel: channel, to: to, subject: subject, body: body,
      status: 'queued', createdAt: Date.now() };
    // Route to connector if available
    var connector = CONNECTORS[channel];
    if (connector && connector.send) {
      connector.send({ to: to, subject: subject, body: body }).then(function() {
        NOTIFICATIONS[id].status = 'sent';
      }).catch(function() { NOTIFICATIONS[id].status = 'failed'; });
    }
    return id;
  }
  function getNotifications() { return Object.values(NOTIFICATIONS); }

  // === Task 6: Platform SDK ===
  var SDK = {
    getBusinessContext: function(businessId) { return { businessId: businessId }; },
    checkPermission: function(businessId, uid, requiredRole) { return Promise.resolve(true); },
    getConfig: function(scope, key) {
      if (typeof ModuleRuntime !== 'undefined') return ModuleRuntime.getConfig(scope, key);
      return null;
    },
    getService: function(name) {
      if (typeof ModuleRuntime !== 'undefined') return ModuleRuntime.getService(name);
      return null;
    },
    emitEvent: function(event, data) {
      if (typeof ModuleRuntime !== 'undefined') return ModuleRuntime.emit(event, data);
      return Promise.resolve([]);
    },
    onEvent: function(event, handler) {
      if (typeof ModuleRuntime !== 'undefined') ModuleRuntime.on(event, handler);
    }
  };

  function getSDK() { return SDK; }

  return {
    registerExtension: registerExtension, getExtension: getExtension, getExtensions: getExtensions,
    registerConnector: registerConnector, getConnector: getConnector, getConnectors: getConnectors,
    createWorkflow: createWorkflow, executeWorkflow: executeWorkflow,
    enqueueJob: enqueueJob, processQueue: processQueue, getJobs: getJobs,
    sendNotification: sendNotification, getNotifications: getNotifications,
    getSDK: getSDK
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = PSH; }
