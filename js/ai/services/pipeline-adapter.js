/*
 * PipelineAdapter — Bridge between existing Media AI pages and pipeline services
 * =================================================================================
 * This adapter allows existing Media AI pages (admin-ai.js, admin-image-ai.js,
 * admin-social-center.js, images.html, etc.) to use the pipeline services
 * WITHOUT rewriting the pages themselves.
 *
 * Every function here replaces a direct Firebase/DB/provider call with a
 * pipeline service call. Pages remain UI-only.
 *
 * Dependencies (all pipeline services, already existing):
 *   js/ai/services/generation-service.js  → GenerationService
 *   js/ai/services/asset-manager.js        → AssetManager
 *   js/ai/services/quality-engine.js       → QualityEngine
 *   js/ai/services/render-queue.js          → RenderQueue
 *   js/ai/services/provider-router.js       → ProviderRouter
 *
 * Existing pages that need this bridge:
 *   js/admin-ai.js        → publishToTarget(), publishDraft(), runModule()
 *   js/admin-image-ai.js  → direct image generation and draft save
 *   admin/ai/images.html  → inline image logic
 *   admin/social-media-center.html → inline social media logic
 */

const PipelineAdapter = (function () {
  /* ─── DRAFT MANAGEMENT ─── */

  /**
   * publishDraft(draftId) — publish a draft through the AssetManager.
   * Replaces direct DraftDB + BlogDB/DB/BannerDB calls.
   * Returns Promise<{ success, assetId, error }>
   */
  function publishDraft(draftId) {
    if (typeof DraftDB === 'undefined' || typeof AssetManager === 'undefined') {
      return Promise.reject(new Error('PipelineAdapter: DraftDB or AssetManager not available'));
    }
    return DraftDB.get(draftId).then(function (draft) {
      if (!draft) return { success: false, error: 'Draft not found' };

      // Route through AssetManager instead of direct DB write
      return AssetManager.save({
        type: deriveAssetType(draft.moduleId),
        name: draft.content && (draft.content.title || draft.content.name || 'Untitled'),
        draftId: draftId,
        moduleId: draft.moduleId,
        metadata: { content: draft.content, inputParams: draft.inputParams, targetCollection: draft.targetCollection },
        createdBy: draft.createdBy
      }).then(function (assetResult) {
        // Mark draft as published
        return DraftDB.update(draftId, { status: 'published', publishedAt: Date.now(), publishedVia: 'pipeline-adapter', assetId: assetResult.id })
          .then(function () { return { success: true, assetId: assetResult.id }; });
      });
    });
  }

  /**
   * saveToAssetLibrary(draftId, moduleId, content, tags) — save generated
   * content to the asset library. Replaces direct Firebase .push() calls
   * in admin-image-ai.js and other pages.
   */
  function saveToAssetLibrary(draftId, moduleId, content, tags, userId) {
    if (typeof AssetManager === 'undefined') {
      return Promise.reject(new Error('PipelineAdapter: AssetManager not available'));
    }
    return AssetManager.save({
      type: deriveAssetType(moduleId),
      name: content && (content.title || content.name || 'Generated'),
      draftId: draftId,
      moduleId: moduleId,
      tags: tags || [],
      metadata: { content: content },
      createdBy: userId || 'system'
    });
  }

  /**
   * generateThroughPipeline(moduleId, inputParams, userId, userEmail) —
   * wrapper that routes through WorkflowEngine (orchestration) →
   * GenerationService (execution).
   *
   * Phase 2.7: Replaced direct GenerationService.run() call with
   * WorkflowEngine.execute(). WorkflowEngine handles all orchestration
   * (retry, fallback, branching, approval) — this function does NOT
   * bypass the orchestration layer.
   */
  function generateThroughPipeline(moduleId, inputParams, userId, userEmail) {
    if (typeof WorkflowEngine === 'undefined') {
      return Promise.reject(new Error('PipelineAdapter: WorkflowEngine not available — load workflow-engine.js'));
    }
    var step = {
      type: 'generation',
      index: 0,
      moduleId: moduleId,
      inputParams: inputParams,
      config: {}
    };
    return WorkflowEngine.execute(step, userId, userEmail).then(function (result) {
      return {
        success: result.status === 'completed',
        job: result.job || null,
        draftId: result.draftId || null,
        quality: null,
        assetId: null,
        error: result.error || null
      };
    });
  }

  /**
   * checkContentQuality(content, type) — run quality validation.
   * Replaces any ad-hoc content checks in pages.
   */
  function checkContentQuality(content, type) {
    if (typeof QualityEngine === 'undefined') {
      // Degrade gracefully without QualityEngine
      return { passed: true, score: 100, issues: [], note: 'QualityEngine not loaded — skipped' };
    }
    return QualityEngine.validateAll(content, type || 'text');
  }

  /* ─── HISTORY LOGGING ─── */

  /**
   * logGenerationEvent(event) — log an AI generation event.
   * Replaces direct Firebase .push() calls in pages.
   *
   * event = { moduleId, type, title, inputParams, draftId, status, userId }
   */
  function logGenerationEvent(event) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve();
    }
    var ref = firebase.database().ref('aiHistory').push();
    return ref.set({
      moduleId: event.moduleId,
      type: event.type || 'generation',
      title: event.title || 'Untitled',
      inputParams: event.inputParams || {},
      resultDraftId: event.draftId || null,
      status: event.status || 'completed',
      createdBy: event.userId || 'system',
      createdAt: Date.now()
    });
  }

  /* ─── ASSISTANT ─── */

  /**
   * dispatchAssistantRequest(text, candidates, userId, userEmail) —
   * AI Assistant request routed through the Task Router + WorkflowEngine.
   * Replaces direct AITaskRouter.dispatch() calls.
   *
   * Phase 2.7: Uses WorkflowEngine via generateThroughPipeline() — never
   * calls GenerationService or PluginManager directly.
   */
  function dispatchAssistantRequest(text, candidates, userId, userEmail) {
    if (typeof AITaskRouter === 'undefined') {
      return Promise.reject(new Error('PipelineAdapter: AITaskRouter not available'));
    }
    var route = AITaskRouter.route(text, candidates);
    if (!route.pluginId || route.reason !== 'ok') {
      return Promise.resolve(route);
    }
    // Routes through WorkflowEngine (orchestration) which calls
    // GenerationService (execution) — never bypasses orchestration.
    return generateThroughPipeline(route.pluginId, route.inputParams, userId, userEmail).then(function (result) {
      return { dispatched: true, result: result, originalRoute: route };
    });
  }

  /* ─── HELPERS ─── */

  function deriveAssetType(moduleId) {
    var map = {
      'image-generator': 'image',
      'blog-writer': 'document',
      'faq-generator': 'document',
      'seo-generator': 'document',
      'facebook-post-generator': 'document',
      'product-description-writer': 'document',
      'banner-generator': 'document',
      'slider-generator': 'document',
      'image-prompt-generator': 'prompt'
    };
    return map[moduleId] || 'document';
  }

  /* ─── STATUS ─── */

  function getStatus() {
    return {
      adapter: 'PipelineAdapter',
      architecture: 'PipelineAdapter → WorkflowEngine → GenerationService (execution only)',
      servicesAvailable: {
        WorkflowEngine: typeof WorkflowEngine !== 'undefined',
        GenerationService: typeof GenerationService !== 'undefined',
        AssetManager: typeof AssetManager !== 'undefined',
        QualityEngine: typeof QualityEngine !== 'undefined',
        RenderQueue: typeof RenderQueue !== 'undefined',
        ProviderRouter: typeof ProviderRouter !== 'undefined'
      },
      modulesRegistered: typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.getAll().map(function (m) { return m.id; }) : [],
      timestamp: Date.now()
    };
  }

  return {
    publishDraft: publishDraft,
    saveToAssetLibrary: saveToAssetLibrary,
    generateThroughPipeline: generateThroughPipeline,
    checkContentQuality: checkContentQuality,
    logGenerationEvent: logGenerationEvent,
    dispatchAssistantRequest: dispatchAssistantRequest,
    getStatus: getStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PipelineAdapter: PipelineAdapter };
}
