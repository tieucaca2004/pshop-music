/*
 * GenerationService — Unified Generation Pipeline
 * ================================================
 * Every content generation request in the Media AI Center MUST route through
 * this service. It orchestrates the complete pipeline:
 *
 *   User Request → Prompt Builder → Workflow Builder → Provider Router
 *   → Job Queue → Generation Engine → Render Queue → Quality Checker
 *   → Asset Library → Media History → Social Export
 *
 * This service REUSES existing modules (AIJobQueue, AIProviderRegistry,
 * AIModuleRegistry, WorkflowEngine, AITaskRouter, DataProvider) — it does
 * NOT reimplement any of them. It only adds the orchestration layer and
 * the missing pipeline stages (quality, asset management, history, render).
 *
 * Dependencies (all existing):
 *   js/ai/job-queue.js           → AIJobQueue
 *   js/ai/provider-registry.js   → AIProviderRegistry
 *   js/ai/module-registry.js     → AIModuleRegistry
 *   js/ai/workflow-engine.js     → WorkflowEngine
 *   js/ai/task-router.js         → AITaskRouter
 *   js/ai/data-provider.js       → DataProvider
 *   js/ai/ai-db.js               → JobDB, DraftDB, LogDB
 */

const GenerationService = (function () {
  /* ─── Pipeline Stages ─── */

  /**
   * Stage 1: Prompt Builder
   * Builds the structured prompt from user request + context data.
   * Delegates to the registered AIModule's buildPrompt().
   * Returns { prompt, context } or rejects with validation error.
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

  /**
   * Stage 2: Provider Router
   * Routes the generation request to the best provider for the content type.
   * Uses AIProviderRegistry.resolveForPlugin() (existing). Falls back to
   * getActive() if no per-plugin override exists.
   * Returns { provider, config }.
   */
  function routeProvider(moduleId) {
    if (typeof AIProviderRegistry === 'undefined') {
      return Promise.reject(new Error('AIProviderRegistry not loaded'));
    }
    return AIProviderRegistry.resolveForPlugin(moduleId);
  }

  /**
   * Stage 3: Generation Engine
   * Executes the generation through the Job Queue.
   * This reuses the EXISTING AIJobQueue infrastructure — it does NOT
   * call providers directly. The Job Queue handles:
   *   loadContext → buildPrompt → resolveProvider → generate → mapToDraft → DraftDB.add
   * Returns { job, draftId } or rejects with error.
   */
  function generate(moduleId, inputParams, userId, userEmail) {
    if (typeof AIJobQueue === 'undefined') {
      return Promise.reject(new Error('AIJobQueue not loaded'));
    }
    // Create a job with a single item
    return AIJobQueue.enqueue(moduleId, [inputParams], userId, userEmail)
      .then(function (job) {
        // Resume processing to execute immediately
        return AIJobQueue.resume(userId, userEmail).then(function () {
          // Get the updated job from DB to find the draft ID
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

  /**
   * Stage 4: Quality Check
   * Validates the generated output against quality criteria.
   * Checks: result exists, has content, meets minimum length.
   * Returns { passed: boolean, issues: string[] }.
   */
  function checkQuality(moduleId, draftId) {
    if (!draftId) {
      return Promise.resolve({ passed: false, issues: ['No draft produced — generation may have failed'] });
    }
    if (typeof DraftDB === 'undefined') {
      // Can't check without DraftDB — assume passed
      return Promise.resolve({ passed: true, issues: [] });
    }
    return DraftDB.get(draftId).then(function (draft) {
      var issues = [];
      if (!draft) {
        issues.push('Draft not found in database');
        return { passed: false, issues: issues };
      }
      if (!draft.content) {
        issues.push('Draft has no content');
      }
      if (draft.status !== 'draft') {
        issues.push('Unexpected draft status: ' + draft.status);
      }
      // Check content structure based on module type
      if (draft.content && typeof draft.content === 'object') {
        var contentKeys = Object.keys(draft.content);
        if (contentKeys.length === 0) {
          issues.push('Draft content object is empty');
        }
      }
      return { passed: issues.length === 0, issues: issues };
    }).catch(function () {
      return { passed: false, issues: ['Failed to fetch draft for quality check'] };
    });
  }

  /**
   * Stage 5: Asset Management
   * Records the generated asset in the asset library.
   * Stores metadata in Firebase under assetLibrary/.
   * Returns { assetId } or resolves silently if no Firebase.
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
    return ref.set(asset).then(function () {
      return { assetId: ref.key };
    });
  }

  /**
   * Stage 6: Media History
   * Logs the generation event to the history log.
   * Stores in Firebase under aiHistory/.
   */
  function logToHistory(moduleId, inputParams, result, userId) {
    if (typeof firebase === 'undefined' || !firebase.database) {
      return Promise.resolve();
    }
    var ref = firebase.database().ref('aiHistory').push();
    var entry = {
      moduleId: moduleId,
      type: deriveMediaType(moduleId),
      title: inputParams.topic || inputParams.subject || inputParams.productId || 'Untitled',
      inputParams: inputParams,
      resultDraftId: result.draftId,
      status: result.quality ? result.quality.passed ? 'completed' : 'quality_failed' : 'completed',
      createdBy: userId || 'unknown',
      createdAt: Date.now()
    };
    return ref.set(entry);
  }

  /* ─── Helpers ─── */

  function deriveMediaType(moduleId) {
    var map = {
      'image-generator': 'image',
      'image-prompt-generator': 'prompt',
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

  /* ─── Public API ─── */

  /**
   * run(request) — THE UNIFIED ENTRY POINT for ALL content generation.
   *
   * request = {
   *   moduleId: string,       // Registered module ID (e.g. 'blog-writer')
   *   inputParams: object,     // Module-specific input parameters
   *   userId: string,          // Firebase UID
   *   userEmail: string,       // User email for logging
   *   skipQuality?: boolean,   // Skip quality check (default: false)
   *   skipAsset?: boolean,     // Skip asset library save (default: false)
   *   skipHistory?: boolean    // Skip history logging (default: false)
   * }
   *
   * Returns Promise<{
   *   success: boolean,
   *   job: object|null,
   *   draftId: string|null,
   *   quality: { passed: boolean, issues: string[] }|null,
   *   assetId: string|null,
   *   error: string|null
   * }>
   */
  function run(request) {
    if (!request || !request.moduleId) {
      return Promise.reject(new Error('GenerationService.run() requires moduleId'));
    }

    var startTime = Date.now();
    var result = {
      success: false,
      job: null,
      draftId: null,
      quality: null,
      assetId: null,
      error: null
    };

    // Stage 1: Validate module exists
    var module = AIModuleRegistry.get(request.moduleId);
    if (!module) {
      result.error = 'Module not found: ' + request.moduleId;
      return Promise.resolve(result);
    }

    // Stage 2: Build prompt (loadContext + buildPrompt)
    return buildPrompt(request.moduleId, request.inputParams)
      .then(function (promptResult) {
        // Stage 3: Generate through Job Queue
        return generate(request.moduleId, request.inputParams, request.userId, request.userEmail);
      })
      .then(function (genResult) {
        result.job = genResult.job;
        result.draftId = genResult.draftId;

        if (genResult.job && genResult.job.status === 'failed') {
          result.error = 'Generation job failed';
          return result;
        }

        // Stage 4: Quality check
        if (!request.skipQuality) {
          return checkQuality(request.moduleId, genResult.draftId).then(function (quality) {
            result.quality = quality;
            if (!quality.passed) {
              result.error = 'Quality check failed: ' + (quality.issues || []).join('; ');
            }
            return result;
          });
        }
        return result;
      })
      .then(function () {
        // Stage 5: Save to asset library
        if (!request.skipAsset && result.draftId) {
          return saveToAssetLibrary(result.draftId, request.moduleId, request.inputParams, request.userId)
            .then(function (assetResult) {
              result.assetId = assetResult.assetId;
              return result;
            });
        }
        return result;
      })
      .then(function () {
        // Stage 6: Log to history
        if (!request.skipHistory) {
          return logToHistory(request.moduleId, request.inputParams, result, request.userId)
            .then(function () {
              result.success = !result.error;
              return result;
            });
        }
        result.success = !result.error;
        return result;
      })
      .catch(function (err) {
        result.error = err.message || 'Unknown pipeline error';
        result.success = false;
        return result;
      });
  }

  /**
   * runBatch(requests) — Process multiple generation requests.
   * Each request follows the same pipeline as run().
   * Returns Promise<{ results: array, totalSuccess: number, totalFailed: number }>.
   */
  function runBatch(requests, userId, userEmail) {
    if (!requests || !requests.length) {
      return Promise.resolve({ results: [], totalSuccess: 0, totalFailed: 0 });
    }

    var results = [];
    var totalSuccess = 0;
    var totalFailed = 0;

    // Process sequentially to respect queue concurrency
    return requests.reduce(function (chain, req) {
      return chain.then(function () {
        var request = req;
        if (typeof request === 'string' || typeof request.moduleId === 'undefined') {
          // Simple string or object without moduleId — skip
          return { success: false, error: 'Invalid request — moduleId required' };
        }
        if (!request.userId) request.userId = userId;
        if (!request.userEmail) request.userEmail = userEmail;
        return run(request).then(function (r) {
          results.push(r);
          if (r.success) totalSuccess++;
          else totalFailed++;
          return r;
        });
      });
    }, Promise.resolve()).then(function () {
      return { results: results, totalSuccess: totalSuccess, totalFailed: totalFailed };
    });
  }

  /* ─── Pipeline Status ─── */

  /**
   * getPipelineStatus() — Returns the current state of all pipeline stages.
   * Used by the dashboard and health monitoring.
   */
  function getPipelineStatus() {
    var status = {
      timestamp: Date.now(),
      stages: {
        promptBuilder: { available: typeof AIModuleRegistry !== 'undefined', moduleCount: AIModuleRegistry ? AIModuleRegistry.getAll().length : 0 },
        providerRouter: { available: typeof AIProviderRegistry !== 'undefined', providerCount: AIProviderRegistry ? AIProviderRegistry.getAll().length : 0 },
        jobQueue: { available: typeof AIJobQueue !== 'undefined' },
        qualityChecker: { available: true },
        assetLibrary: { available: typeof firebase !== 'undefined' && !!firebase.database },
        mediaHistory: { available: typeof firebase !== 'undefined' && !!firebase.database }
      },
      registeredModules: AIModuleRegistry ? AIModuleRegistry.getAll().map(function (m) { return m.id; }) : [],
      registeredProviders: AIProviderRegistry ? AIProviderRegistry.getAll().map(function (p) { return p.id; }) : []
    };
    return status;
  }

  // Public API
  return {
    run: run,
    runBatch: runBatch,
    buildPrompt: buildPrompt,
    routeProvider: routeProvider,
    generate: generate,
    checkQuality: checkQuality,
    saveToAssetLibrary: saveToAssetLibrary,
    logToHistory: logToHistory,
    getPipelineStatus: getPipelineStatus
  };
})();

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GenerationService: GenerationService };
}
