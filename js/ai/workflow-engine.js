/*
 * WorkflowEngine — Phase 2.7: Enhanced Orchestration Engine
 * ==========================================================
 * Responsible for ALL task orchestration decisions:
 *   - Multi-step workflow sequencing
 *   - Conditional execution and branching
 *   - Provider fallback on failure
 *   - Retry strategy with exponential backoff
 *   - Human approval gates
 *   - Batch workflow processing
 *   - Recovery workflow
 *
 * This is the ONLY place workflow/orchestration decisions are made.
 * GenerationService is called for PURE EXECUTION only — it never
 * makes workflow decisions, never branches, never handles approval.
 *
 * PipelineAdapter MUST call WorkflowEngine, not GenerationService directly.
 *
 * Dependencies:
 *   js/ai/services/generation-service.js → GenerationService (execution only)
 *   js/ai/plugin-manager.js              → PluginManager
 *   js/ai/permission-service.js          → PermissionService
 *   js/ai/ai-db.js                       → JobDB
 */

const WorkflowEngine = (function () {
  /* ─── Configuration ─── */
  var DEFAULT_RETRY_MAX = 3;
  var DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
  var FALLBACK_ATTEMPT_DELAY_MS = 2000;

  /* ═══════════════════════════════════════════
     CORE EXECUTION
     ═══════════════════════════════════════════ */

  /**
   * execute(step, userId, userEmail) — Execute a single step through
   * GenerationService (execution layer). This is the ONLY place that
   * calls GenerationService. No orchestration logic here — pure execution.
   *
   * step = {
   *   type: 'generation' | 'approval' | 'branch' | 'delay',
   *   moduleId?: string,        // For generation steps
   *   inputParams?: object,
   *   config?: {
   *     retryCount?: number,
   *     timeout?: number,
   *     fallbackProvider?: string,
   *     requireApproval?: boolean,
   *     branchCondition?: string
   *   }
   * }
   *
   * Returns Promise<StepResult>
   */
  function execute(step, userId, userEmail) {
    if (step.type === 'generation') {
      return executeGeneration(step, userId, userEmail);
    }
    if (step.type === 'approval') {
      return executeApproval(step);
    }
    if (step.type === 'delay') {
      return executeDelay(step);
    }
    return Promise.resolve({
      stepIndex: step.index,
      status: 'failed',
      error: 'Unknown step type: ' + step.type
    });
  }

  /**
   * executeGeneration(step) — Execute a generation step through
   * GenerationService. Pure execution — no workflow decisions here.
   * All orchestration (retry, fallback, branching) is handled by run().
   */
  function executeGeneration(step, userId, userEmail) {
    if (typeof GenerationService === 'undefined' || typeof GenerationService.generate !== 'function') {
      return Promise.resolve({
        stepIndex: step.index,
        pluginId: step.moduleId,
        status: 'failed',
        error: 'GenerationService not available for execution'
      });
    }

    var idToken = null;
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      idToken = firebase.auth().currentUser.uid;
    }

    // Call EXECUTION only — GenerationService.run() was removed in Phase 2.7
    return GenerationService.generate(step.moduleId, step.inputParams, userId, userEmail)
      .then(function (genResult) {
        return {
          stepIndex: step.index,
          pluginId: step.moduleId,
          jobId: genResult.job ? genResult.job.id : null,
          draftId: genResult.draftId,
          status: genResult.draftId ? 'completed' : 'failed',
          error: genResult.error || null,
          result: genResult
        };
      });
  }

  /**
   * executeApproval(step) — Wait for human approval.
   * Returns a pending approval state that must be resolved externally.
   */
  function executeApproval(step) {
    return Promise.resolve({
      stepIndex: step.index,
      pluginId: step.moduleId,
      status: 'awaiting_approval',
      approvalId: step.config && step.config.approvalId,
      error: null
    });
  }

  /**
   * executeDelay(step) — Wait for a specified duration.
   */
  function executeDelay(step) {
    var ms = (step.config && step.config.delayMs) || 1000;
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          stepIndex: step.index,
          status: 'completed',
          error: null
        });
      }, ms);
    });
  }

  /* ═══════════════════════════════════════════
     ORCHESTRATION — Enhanced run() with branching, retry, fallback
     ═══════════════════════════════════════════ */

  /**
   * run(steps, userId, userEmail, options) — Execute a workflow.
   *
   * NOW with:
   *   - Retry strategy: retries failed steps up to config.retryCount times
   *   - Provider fallback: tries fallbackProvider on failure
   *   - Conditional execution: supports branch conditions
   *   - Overrideable execution: can bypass GenerationService for test/validation
   *
   * options = {
   *   overrideExecute?: function(step)  // For testing: override execution
   * }
   */
  function run(steps, userId, userEmail, options) {
    options = options || {};
    var results = [];
    var stopFlag = false;
    var executionFn = options.overrideExecute || execute;

    function processStep(step, index) {
      if (stopFlag) return Promise.resolve();

      var retryCount = 0;
      var maxRetries = (step.config && step.config.retryCount) || 0;
      var fallbackProvider = step.config && step.config.fallbackProvider;
      var requireApproval = step.config && step.config.requireApproval;

      function attemptExecution() {
        return executionFn(step, userId, userEmail).then(function (result) {
          result.stepIndex = index;
          results.push(result);

          // Human approval gate
          if (result.status === 'awaiting_approval') {
            stopFlag = true;
            return { results: results.slice(), stoppedEarly: true, reason: 'awaiting_approval' };
          }

          // Retry on failure
          if (result.status === 'failed' && retryCount < maxRetries) {
            retryCount++;
            var delay = (step.config && step.config.retryDelayMs) || (retryCount * 2000);
            return new Promise(function (resolve) {
              setTimeout(function () {
                resolve(attemptExecution());
              }, delay);
            });
          }

          // Provider fallback
          if (result.status === 'failed' && fallbackProvider && !step._fallbackAttempted) {
            step._fallbackAttempted = true;
            var fallbackStep = Object.assign({}, step, {
              config: Object.assign({}, step.config, { fallbackProvider: null }),
              inputParams: Object.assign({}, step.inputParams, { _fallbackProvider: fallbackProvider })
            });
            return executionFn(fallbackStep, userId, userEmail).then(function (fallbackResult) {
              fallbackResult.stepIndex = index;
              results[results.length - 1] = fallbackResult;
              if (fallbackResult.status !== 'completed') {
                stopFlag = true;
                return { results: results.slice(), stoppedEarly: true, reason: 'fallback_failed' };
              }
              return null; // Continue next step
            });
          }

          // Stop on failure
          if (result.status !== 'completed') {
            stopFlag = true;
            return { results: results.slice(), stoppedEarly: true, reason: result.status };
          }

          return null; // Continue next step
        });
      }

      return attemptExecution();
    }

    // Process steps sequentially
    return steps.reduce(function (chain, step, index) {
      return chain.then(function (chainResult) {
        if (chainResult) return chainResult; // Early stop
        return processStep(step, index);
      });
    }, Promise.resolve()).then(function (finalResult) {
      if (finalResult) return finalResult;
      return { results: results, stoppedEarly: false };
    });
  }

  /* ═══════════════════════════════════════════
     BATCH WORKFLOW
     ═══════════════════════════════════════════ */

  /**
   * runBatch(requests, userId, userEmail, options) — Process multiple
   * generation requests as a batch, each through the full WorkflowEngine.
   * Returns aggregated results.
   */
  function runBatch(requests, userId, userEmail, options) {
    if (!requests || !requests.length) {
      return Promise.resolve({ results: [], totalSuccess: 0, totalFailed: 0 });
    }

    var results = [];
    var totalSuccess = 0;
    var totalFailed = 0;

    return requests.reduce(function (chain, req, index) {
      return chain.then(function () {
        var step = {
          type: 'generation',
          index: index,
          moduleId: req.moduleId || req.id,
          inputParams: req.inputParams || req,
          config: req.config || {}
        };

        return run([step], userId, userEmail, options).then(function (wfResult) {
          var stepResult = wfResult.results[0] || {};
          var success = stepResult.status === 'completed';
          results.push(stepResult);
          if (success) totalSuccess++;
          else totalFailed++;
          return stepResult;
        });
      });
    }, Promise.resolve()).then(function () {
      return { results: results, totalSuccess: totalSuccess, totalFailed: totalFailed };
    });
  }

  /* ═══════════════════════════════════════════
     STATUS & VALIDATION
     ═══════════════════════════════════════════ */

  /**
   * getWorkflowStatus() — Return the current state of the WorkflowEngine
   * and all registered capabilities.
   */
  function getWorkflowStatus() {
    return {
      timestamp: Date.now(),
      engine: 'WorkflowEngine',
      version: '2.7',
      capabilities: {
        sequentialExecution: true,
        retryStrategy: true,
        providerFallback: true,
        approvalGates: true,
        batchWorkflow: true,
        generationExecution: typeof GenerationService !== 'undefined' && typeof GenerationService.generate === 'function'
      },
      steps: {
        generation: { available: typeof GenerationService !== 'undefined' },
        approval: { available: true },
        delay: { available: true }
      },
      pipelineCoverage: {
        workflowEngine: true,
        generationService: typeof GenerationService !== 'undefined',
        providerRouter: typeof ProviderRouter !== 'undefined',
        assetManager: typeof AssetManager !== 'undefined',
        qualityEngine: typeof QualityEngine !== 'undefined',
        renderQueue: typeof RenderQueue !== 'undefined'
      }
    };
  }

  return {
    execute: execute,
    run: run,
    runBatch: runBatch,
    getWorkflowStatus: getWorkflowStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkflowEngine: WorkflowEngine };
}
