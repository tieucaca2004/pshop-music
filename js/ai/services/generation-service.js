/*
 * GenerationService — Execution Layer ONLY (Phase 2.7 Refactored)
 * ===============================================================
 * Phase 2.7: REMOVED all orchestration/workflow logic.
 *   - run() and runBatch() moved to WorkflowEngine
 *   - getPipelineStatus() moved to WorkflowEngine
 *
 * This service now handles PURE EXECUTION only:
 *   buildPrompt → generate → checkQuality → saveToAssetLibrary → logToHistory
 *
 * No workflow decisions. No branching. No approval logic.
 * WorkflowEngine is responsible for all orchestration.
 *
 * Dependencies (all existing):
 *   js/ai/job-queue.js           → AIJobQueue
 *   js/ai/provider-registry.js   → AIProviderRegistry
 *   js/ai/module-registry.js     → AIModuleRegistry
 *   js/ai/data-provider.js       → DataProvider
 */

const GenerationService = (function () {
  /* ─── Stage 1: Prompt Builder (execution only) ─── */

  /**
   * buildPrompt(moduleId, inputParams) — Build a structured prompt.
   * Delegates to module.loadContext() + module.buildPrompt().
   * Returns { prompt, context, module }.
   */
  function buildPrompt(moduleId, inputParams) {
    const module = AIModuleRegistry.get(moduleId);
    if (!module) return Promise.reject(new Error('Module not found: ' + moduleId));

    return Promise.resolve()
      .then(function () {
        return module.loadContext ? module.loadContext(inputParams) : {};
      })
      .then(function (context) {
        if (typeof module.buildPrompt !== 'function') {
          return Promise.reject(new Error('Module "' + moduleId + '" has no buildPrompt()'));
        }
        const prompt = module.buildPrompt(inputParams, context);
        return { prompt: prompt, context: context, module: module };
      });
  }

  /* ─── Stage 2: Provider Router (execution only) ─── */

  /**
   * routeProvider(moduleId) — Route to the best provider for the content type.
   * Delegates to AIProviderRegistry.resolveForPlugin().
   * Returns { provider, config }.
   */
  function routeProvider(moduleId) {
    if (typeof AIProviderRegistry === 'undefined') {
      return Promise.reject(new Error('AIProviderRegistry not loaded'));
    }
    return AIProviderRegistry.resolveForPlugin(moduleId);
  }

  /* ─── Stage 3: Generation Engine (execution only) ─── */

  /**
   * generate(moduleId, inputParams, userId, userEmail) — Execute generation.
   * Reuses AIJobQueue.enqueue() + resume() for execution.
   * Returns { job, draftId }.
   *
   * This is PURE EXECUTION. No retry logic, no branching, no fallback.
   * WorkflowEngine handles those decisions.
   */
  function generate(moduleId, inputParams, userId, userEmail) {
    if (typeof AIJobQueue === 'undefined') {
      return Promise.reject(new Error('AIJobQueue not loaded'));
    }
    return AIJobQueue.enqueue(moduleId, [inputParams], userId, userEmail)
      .then(function (job) {
        return AIJobQueue.resume(userId, userEmail).then(function () {
          if (typeof JobDB === 'undefined') {
            return { job: job, draftId: null };
          }
          return JobDB.get(job.id).then(function (finalJob) {
            var draftId = null;
            if (finalJob && finalJob.items && finalJob.items.length > 0) {
              draftId = finalJob.items[0].resultDraftId || null;
            }
            return { job: finalJob || job, draftId: draftId };
          });
        });
      });
  }

  /* ─── Stage 4: Quality Check (execution only) ─── */

  /**
   * checkQuality(moduleId, draftId) — Validate output quality.
   * Returns { passed: boolean, issues: string[] }.
   */
  function checkQuality(moduleId, draftId) {
    if (!draftId) {
      return Promise.resolve({ passed: false, issues: ['No draft produced'] });
    }
    if (typeof DraftDB === 'undefined') {
      return Promise.resolve({ passed: true, issues: [] });
    }
    return DraftDB.get(draftId).then(function (draft) {
      var issues = [];
      if (!draft) { issues.push('Draft not found in database'); return { passed: false, issues: issues }; }
      if (!draft.content) { issues.push('Draft has no content'); }
      if (draft.status !== 'draft') { issues.push('Unexpected draft status: ' + draft.status); }
      if (draft.content && typeof draft.content === 'object' && Object.keys(draft.content).length === 0) {
        issues.push('Draft content object is empty');
      }
      return { passed: issues.length === 0, issues: issues };
    }).catch(function () {
      return { passed: false, issues: ['Failed to fetch draft for quality check'] };
    });
  }

  /* ─── Stage 5: Asset Management (execution only) ─── */

  /**
   * saveToAssetLibrary(draftId, moduleId, inputParams, userId) — Save to
   * asset library. Stores in Firebase under assetLibrary/.
   * Returns { assetId }.
   */
  function saveToAssetLibrary(draftId, moduleId, inputParams, userId) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve({ assetId: null });
    }
    var ref = firebase.database().ref('assetLibrary').push();
    var asset = {
      draftId: draftId,
      moduleId: moduleId,
      inputParams: inputParams,
      createdBy: userId || 'unknown',
      createdAt: Date.now(),
      mediaType: deriveMediaType(moduleId),
      tags: []
    };
    return ref.set(asset).then(function () { return { assetId: ref.key }; });
  }

  /* ─── Stage 6: Media History (execution only) ─── */

  /**
   * logToHistory(moduleId, inputParams, draftId, status, userId) — Log
   * generation event. Stores in Firebase under aiHistory/.
   */
  function logToHistory(moduleId, inputParams, draftId, status, userId) {
    if (typeof firebase === 'undefined' || !firebase.database) return Promise.resolve();
    var ref = firebase.database().ref('aiHistory').push();
    return ref.set({
      moduleId: moduleId,
      type: deriveMediaType(moduleId),
      title: inputParams.topic || inputParams.subject || inputParams.productId || 'Untitled',
      inputParams: inputParams,
      resultDraftId: draftId || null,
      status: status || 'completed',
      createdBy: userId || 'unknown',
      createdAt: Date.now()
    });
  }

  /* ─── Helpers ─── */

  function deriveMediaType(moduleId) {
    var map = {
      'image-generator': 'image',
      'image-prompt-generator': 'prompt',
      'video-generator': 'video',
      'blog-writer': 'blog',
      'faq-generator': 'blog',
      'seo-generator': 'seo',
      'facebook-post-generator': 'facebook',
      'product-description-writer': 'product',
      'banner-generator': 'banner',
      'slider-generator': 'slider'
    };
    return map[moduleId] || 'other';
  }

  /* ─── Public API (execution only) ─── */

  return {
    buildPrompt: buildPrompt,
    routeProvider: routeProvider,
    generate: generate,
    checkQuality: checkQuality,
    saveToAssetLibrary: saveToAssetLibrary,
    logToHistory: logToHistory
  };
})();

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GenerationService: GenerationService };
}
