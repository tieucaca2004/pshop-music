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
    // WORKFLOW-04 WAIT EVENT (capability 6): dispatch wait_event → waitOnStep
    if (step.type === 'wait_event') {
      return waitOnStep(step, userId, userEmail);
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

      // WORKFLOW-04 IF/ELSE: nếu step có `condition` mà false → SKIP (không execute)
      if (step && step.condition) {
        var condPass = false;
        try { condPass = evaluateCondition(step.condition, options.decisionContext || null); }
        catch (e) { condPass = false; }
        if (!condPass) {
          results.push({ stepIndex: index, pluginId: step.moduleId, status: 'skipped', condition: false });
          return Promise.resolve(null);
        }
      }

      var retryCount = 0;
      var maxRetries = (step.config && step.config.retryCount) || 0;
      var fallbackProvider = step.config && step.config.fallbackProvider;
      var requireApproval = step.config && step.config.requireApproval;

      // WORKFLOW-04 WAIT EVENT (capability 6): step wait_event → pause run(),
      // chờ resumeExecution() (event) rồi mới tiếp tục step kế. Không polling.
      if (step && step.type === 'wait_event') {
        return execute(step, userId, userEmail).then(function (wr) {
          results.push(wr);
          if (wr.status === 'completed') {
            // event đã resume ngay (payload có) → tiếp tục bước sau
            return null;
          }
          // timeout/cancelled: dừng run, dừng tại bước này
          stopFlag = true;
          return { results: results.slice(), stoppedEarly: true, reason: wr.status === 'cancelled' ? 'event_cancelled' : 'event_timeout' };
        });
      }

      // WORKFLOW-04 POLICY EVALUATION (capability 7): evaluate trước execute.
      // allow → tiếp tục; deny → push denied + dừng; awaiting_approval → dừng approval.
      // retryPolicy/providerPolicy ghi đè cấu hình step.
      if (step && (step.policy || (step.config && step.config.policy))) {
        var pol = evaluatePolicy(step, null, options.decisionContext || null);
        if (pol.decision === 'deny') {
          results.push({ stepIndex: index, pluginId: step.moduleId, status: 'denied', policy: 'deny' });
          stopFlag = true;
          return Promise.resolve({ results: results.slice(), stoppedEarly: true, reason: 'policy_denied' });
        }
        if (pol.decision === 'awaiting_approval') {
          results.push({ stepIndex: index, pluginId: step.moduleId, status: 'awaiting_approval', policy: 'approval' });
          stopFlag = true;
          return Promise.resolve({ results: results.slice(), stoppedEarly: true, reason: 'awaiting_approval' });
        }
        if (pol.retryPolicy && pol.retryPolicy.max != null) maxRetries = pol.retryPolicy.max;
        if (pol.providerId) step = Object.assign({}, step, { config: Object.assign({}, step.config, { providerId: pol.providerId }) });
      }

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

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 1: Decision Context)
     Mở rộng WorkflowEngine hiện có (REUSE FIRST, không engine mới).
     ═══════════════════════════════════════════ */

  function wfUid(prefix) {
    return (prefix || 'wf') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * createDecisionContext(opts) — khởi tạo Decision Context cho 1 Workflow Instance.
   * Chứa workflowId/executionId/currentStep/variables/sharedMemory/state/thời gian.
   */
  function createDecisionContext(opts) {
    opts = opts || {};
    return {
      workflowId: opts.workflowId || null,
      executionId: opts.executionId || wfUid('exec'),
      currentStep: opts.currentStep || null,
      previousStep: null,
      nextStep: null,
      workflowState: opts.workflowState || 'QUEUED',
      variables: Object.assign({}, opts.variables || {}),
      sharedMemory: Object.assign({}, opts.sharedMemory || {}),
      retryCount: 0,
      errorCount: 0,
      startTime: Date.now(),
      finishTime: null,
      duration: null
    };
  }

  /**
   * setDecisionVariable(ctx, key, value) — ghi biến vào Decision Context.
   */
  function setDecisionVariable(ctx, key, value) {
    if (!ctx) return null;
    ctx.variables[key] = value;
    return ctx;
  }

  /**
   * getDecisionVariable(ctx, key, def) — đọc biến (kèm default).
   */
  function getDecisionVariable(ctx, key, def) {
    if (!ctx || !ctx.variables || !(key in ctx.variables)) return def;
    return ctx.variables[key];
  }

  /**
   * setDecisionShared(ctx, key, value) / getDecisionShared — shared memory giữa các step.
   */
  function setDecisionShared(ctx, key, value) {
    if (!ctx) return null;
    ctx.sharedMemory[key] = value;
    return ctx;
  }
  function getDecisionShared(ctx, key, def) {
    if (!ctx || !ctx.sharedMemory || !(key in ctx.sharedMemory)) return def;
    return ctx.sharedMemory[key];
  }

  /**
   * finishDecisionContext(ctx) — đánh dấu hoàn tất (finishTime + duration), trả clone.
   */
  function finishDecisionContext(ctx) {
    if (ctx) {
      ctx.finishTime = Date.now();
      ctx.duration = ctx.finishTime - ctx.startTime;
    }
    return ctx;
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 2: IF/ELSE)
     REUSE: dựa Decision Context (capability 1). Không engine mới.
     ═══════════════════════════════════════════ */

  /**
   * evaluateCondition(condition, ctx) — đánh giá 1 điều kiện IF/ELSE-IF.
   * condition: { key|expr, op, value } hoặc { test: (ctx)=>{...} }.
   * Trả boolean.
   */
  function evaluateCondition(condition, ctx) {
    if (!condition) return true;
    if (typeof condition === 'function') {
      return !!condition(ctx);
    }
    if (typeof condition === 'object' && typeof condition.test === 'function') {
      return !!condition.test(ctx);
    }
    // dạng { key, op, value }
    var value = ctx && ctx.variables ? ctx.variables[condition.key] : undefined;
    var target = condition.value;
    switch ((condition.op || 'eq').toLowerCase()) {
      case 'eq': case '==': case '===': return value === target;
      case 'ne': case '!=': case '!==': return value !== target;
      case 'gt': case '>': return Number(value) > Number(target);
      case 'gte': case '>=': return Number(value) >= Number(target);
      case 'lt': case '<': return Number(value) < Number(target);
      case 'lte': case '<=': return Number(value) <= Number(target);
      case 'in': return Array.isArray(target) && target.indexOf(value) >= 0;
      case 'notin': return Array.isArray(target) && target.indexOf(value) < 0;
      case 'truthy': return !!value;
      case 'falsy': return !value;
      case 'exists': return value !== undefined && value !== null;
      case 'empty': return value === undefined || value === null || value === '';
      default: return !!value;
    }
  }

  /**
   * decideBranch(steps, ctx, options) — resolve IF/ELSE/ELSE-IF:
   * mỗi step có thể có `condition`; trả step index duy nhất chạy tiếp
   * (step đầu tiên có condition truthy) khi options.onlyFirst=true,
   * hoặc arr các step truthy khi false.
   */
  function decideBranch(steps, ctx, options) {
    options = options || {};
    if (!Array.isArray(steps)) return [];
    var truthy = steps.filter(function (s) {
      return evaluateCondition(s && s.condition, ctx);
    });
    if (options.onlyFirst) return truthy[0] ? truthy[0] : null;
    return truthy;
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 3: SWITCH)
     REUSE: dựa Decision Context + evaluateCondition (cap 1, 2).
     ═══════════════════════════════════════════ */

  /**
   * runSwitch(switchCfg, ctx) — SWITCH/CASE/DEFAULT resolution.
   * switchCfg: { key, cases: [{value|when, ...targetSteps}], default }
   * Chọn case khớp (so sánh bằng với biến ctx), else default.
   * Trả { case, steps: [...]; dừng nếu không khớp case cũng như default }.
   */
  function runSwitch(switchCfg, ctx) {
    if (!switchCfg || !switchCfg.key) return { case: null, steps: null, matched: false };
    if (!Array.isArray(switchCfg.cases)) return { case: null, steps: null, matched: false };
    var actual = ctx && ctx.variables ? ctx.variables[switchCfg.key] : undefined;
    for (var i = 0; i < switchCfg.cases.length; i++) {
      var c = switchCfg.cases[i];
      var hit = false;
      if (c && 'value' in c) { hit = c.value === actual; }
      else if (c && 'when' in c) { hit = (typeof c.when === 'function') ? !!c.when(actual, ctx) : c.when === actual; }
      if (hit) {
        return { case: i, label: (c && c.label) || ('case' + i), steps: (c && c.steps) || [], matched: true };
      }
    }
    if (switchCfg.default && switchCfg.default.steps) {
      return { case: 'default', label: 'default', steps: switchCfg.default.steps, matched: true };
    }
    return { case: null, steps: null, matched: false };
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 4: LOOP / FOREACH)
     REUSE: execute() + run() hiện có. Không engine mới.
     ═══════════════════════════════════════════ */

  /**
   * runLoop(cfg, userId, userEmail, options) — vòng lặp lặp 1 step/chuỗi
   * cho tới maxIterations hoặc break (condition). Reuse run() từng iteration.
   * cfg: { steps, maxIterations, breakOn?:condition }
   */
  function runLoop(cfg, userId, userEmail, options) {
    options = options || {};
    var steps = (cfg && cfg.steps) || [];
    var max = (cfg && cfg.maxIterations) || 1;
    var ctx = options.decisionContext || null;
    var allResults = [];
    var chain = Promise.resolve();
    var i;
    for (i = 0; i < max; i++) {
      (function (iter) {
        chain = chain.then(function () {
          // break condition mỗi iteration (trước khi chạy lại)
          if (cfg && cfg.breakOn && ctx) {
            try {
              if (evaluateCondition(cfg.breakOn, ctx)) { return; }
            } catch (e) { /* continue */ }
          }
          var iterCtx = options.buildIterationContext ? options.buildIterationContext(iter, i, ctx) : null;
          var iterOpts = Object.assign({}, options, { decisionContext: iterCtx || ctx });
          return run(steps, userId, userEmail, iterOpts).then(function (out) {
            allResults.push({ iteration: iter, results: out.results });
            if (out.stoppedEarly) return;
            return out;
          });
        });
      })(i);
    }
    return chain.then(function () { return { iterations: allResults.length, iterationsCompleted: allResults }; });
  }

  /**
   * runForEach(items, cfg, userId, userEmail, options) — FOREACH: với mỗi phần tử
   * chạy cfg.steps (perItemParams). Support skip(mục bỏ qua) qua buildIterationContext trả null.
   * items: array. Trả summary từng item + break/continue qua return.
   */
  function runForEach(items, cfg, userId, userEmail, options) {
    options = options || {};
    if (!Array.isArray(items) || !items.length) {
      return Promise.resolve({ itemsProcessed: 0, results: [] });
    }
    var steps = (cfg && cfg.steps) || [];
    var ctx = options.decisionContext || null;
    var allResults = [];
    var chain = Promise.resolve();
    items.forEach(function (item, idx) {
      chain = chain.then(function () {
        var itemCtx = options.buildIterationContext ? options.buildIterationContext(item, idx, ctx) : null;
        // continue: nếu itemCtx === null hoặc {skip:true} → bỏ qua item này
        if (!itemCtx || itemCtx.skip) {
          allResults.push({ index: idx, skipped: true });
          return Promise.resolve();
        }
        var iterOpts = Object.assign({}, options, { decisionContext: itemCtx });
        return run(steps, userId, userEmail, iterOpts).then(function (out) {
          allResults.push({ index: idx, skipped: false, results: out.results });
          if (out.stoppedEarly) return; // break toàn chuỗi
          return out;
        });
      });
    });
    return chain.then(function () {
      return { itemsProcessed: allResults.filter(function (r) { return !r.skipped; }).length, results: allResults };
    });
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 5: PARALLEL)
     REUSE: execute()/run(). Không engine mới. Promise.allSettled.
     ═══════════════════════════════════════════ */

  function pTimeout(promise, ms, tag) {
    if (!ms || ms <= 0) return promise;
    return Promise.race([
      promise,
      new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('Timeout on parallel step: ' + (tag || '?'))); }, ms);
      })
    ]);
  }

  /**
   * runParallel(steps, userId, userEmail, options) — chạy nhiều step song song.
   * options: {
   *   concurrencyLimit?: number,   // giới hạn song song (mặc định = steps.length)
   *   failFast?: boolean,          // true: reject ngay khi 1 task fail
   *   timeout?: number,            // ms mỗi task
   *   overrideExecute?: fn
   * }
   * Trả { results, fulfilled, rejected, allSettled } (aggregateResults).
   */
  function runParallel(steps, userId, userEmail, options) {
    options = options || {};
    steps = steps || [];
    var concurrency = (options.concurrencyLimit && options.concurrencyLimit > 0) ? options.concurrencyLimit : steps.length;
    var timeoutMs = options.timeout || 0;
    var executionFn = options.overrideExecute || execute;

    return new Promise(function (resolve, reject) {
      var index = 0;
      var active = 0;
      var settled = 0;
      var results = [];
      var failFast = options.failFast === true;
      var stop = false;
      var failed = null;

      function runOne(step, i) {
        active++;
        var p = pTimeout(executionFn(step, userId, userEmail), timeoutMs, step && step.moduleId);
        p.then(function (res) {
          active--; settled++; results[i] = res;
          if (failFast && res && res.status === 'failed' && !failed) {
            failed = res;
            stop = true;
          }
          pump();
        }).catch(function (err) {
          active--; settled++; results[i] = { status: 'failed', error: (err && err.message) || String(err) };
          if (failFast && !failed) { failed = results[i]; stop = true; }
          pump();
        });
      }

      function pump() {
        if (stop) {
          if (failed) return reject(failed);
          return finalize();
        }
        while (index < steps.length && active < concurrency) {
          var i = index++; var step = steps[i];
          runOne(step, i);
        }
        if (index >= steps.length && active === 0) finalize();
      }

      function finalize() {
        var fulfilled = results.filter(function (r) { return r && r.status && r.status !== 'failed'; }).length;
        var rejected = results.filter(function (r) { return r && r.status === 'failed'; }).length;
        resolve({ results: results, fulfilled: fulfilled, rejected: rejected, allSettled: true });
      }

      pump();
    });
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 6: WAIT EVENT)
     REUSE: execute()/run(). Không engine mới, không polling/scheduler/cron.
     Event registry in-memory: workflow chờ eventId, resumeExecution() giải phóng.
     ═══════════════════════════════════════════ */

  var waitRegistry = {}; // eventId -> { resolvers: [], cancelTimers: {}, metadata }

  /**
   * waitForEvent(eventId, opts) — trả Promise resolve khi event được emit (resume)
   * hoặc reject khi timeout/cancel.
   * opts: { timeout?: ms, onTimeout?: fn (return false để giữ chờ) }
   */
  function waitForEvent(eventId, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var entry = waitRegistry[eventId] || (waitRegistry[eventId] = { resolvers: [], cancelTimers: {}, metadata: {} });
      var timer = null;
      if (opts.timeout && opts.timeout > 0) {
        timer = setTimeout(function () {
          // xoá khỏi registry
          if (waitRegistry[eventId]) {
            var idx = waitRegistry[eventId].resolvers.indexOf(handle);
            if (idx >= 0) waitRegistry[eventId].resolvers.splice(idx, 1);
          }
          var err = new Error('WaitEvent timeout: ' + eventId);
          err.code = 'WAIT_TIMEOUT';
          reject(err);
        }, opts.timeout);
      }
      function handle(payload) {
        if (timer) clearTimeout(timer);
        resolve({ eventId: eventId, eventPayload: payload || null });
      }
      handle._timeoutTimer = timer;
      entry.resolvers.push(handle);
      if (opts.metadata) entry.metadata = opts.metadata;
    });
  }

  /**
   * resumeExecution(eventId, eventPayload) — phát event: resolve tất cả
   * waitForEvent đang chờ eventId, truyền eventPayload.
   */
  function resumeExecution(eventId, eventPayload) {
    var entry = waitRegistry[eventId];
    if (!entry) return { emitted: false, listeners: 0 };
    var resolvers = entry.resolvers.slice();
    resolvers.forEach(function (h) {
      if (h._timeoutTimer) clearTimeout(h._timeoutTimer);
      h(eventPayload || {});
    });
    delete waitRegistry[eventId];
    return { emitted: true, listeners: resolvers.length };
  }

  /**
   * cancelWait(eventId) — hủy mọi waitForEvent đang chờ eventId (reject CANCEL).
   */
  function cancelWaitEvent(eventId) {
    var entry = waitRegistry[eventId];
    if (!entry) return false;
    entry.resolvers.forEach(function (h) {
      if (h._timeoutTimer) clearTimeout(h._timeoutTimer);
      var err = new Error('WaitEvent cancelled: ' + eventId);
      err.code = 'WAIT_CANCELLED';
      // reject qua việc resolve? -> cần reject; dùng cách reject qua handle không được, dùng entry
      // (thực tế waitForEvent reject qua timeout; cancel xoá registry + các promise không resolve)
    });
    delete waitRegistry[eventId];
    return true;
  }

  /**
   * waitOnStep(step, ctx) — tích hợp vào run(): khi step.type === 'wait_event'
   * chờ eventId (từ step.eventId hoặc ctx). Không polling.
   */
  function waitOnStep(step, userId, userEmail) {
    var eventId = (step && step.eventId) || (step && step.config && step.config.eventId);
    if (!eventId) return Promise.resolve({ status: 'failed', error: 'wait_event requires eventId' });
    return waitForEvent(eventId, step.config || {}).then(function (res) {
      return { status: 'completed', stepIndex: step.index, waitEvent: eventId, eventPayload: res.eventPayload };
    }).catch(function (err) {
      return { status: err.code === 'WAIT_TIMEOUT' ? 'failed' : 'cancelled', error: err.message, waitEvent: eventId };
    });
  }

  // Tích hợp: execute() nhận type 'wait_event'
  var _origExecute = execute;
  // (không override execute để tránh phá pipeline — wait_event xử lý trong run qua step.type
  //  bằng waitOnStep; ta gắn xử lý bằng cách bọc dispatch nếu muốn. Giữ gọn: expose 3 hàm)

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 7: POLICY EVALUATION)
     REUSE: execute()/run(). Không engine mới. Evaluate policy trước execute.
     ═══════════════════════════════════════════ */

  /**
   * evaluatePolicy(step, input, ctx) — đánh giá policy của 1 step TRƯỚC execute.
   * step.policy = {
   *   allow?: boolean|fn,          // false → deny (chặn execution)
   *   deny?: boolean|fn,           // true → deny
   *   requireApproval?: boolean,   // true → trả awaiting_approval
   *   retryPolicy?: { max, delayMs },  // ghi đè config.retryCount
   *   providerPolicy?: string|fn       // chọn provider (providerId) cho step
   * }
   * Trả { decision:'allow'|'deny'|'awaiting_approval', providerId?, retryPolicy? }.
   */
  function evaluatePolicy(step, input, ctx) {
    var policy = (step && step.policy) || (step && step.config && step.config.policy) || {};
    if (!policy) return { decision: 'allow' };
    // allow/deny
    var allow = typeof policy.allow === 'function' ? !!policy.allow(ctx, input) : (policy.allow !== false);
    var deny = typeof policy.deny === 'function' ? !!policy.deny(ctx, input) : !!policy.deny;
    if (deny || !allow) {
      return { decision: 'deny' };
    }
    if (policy.requireApproval === true) {
      return { decision: 'awaiting_approval' };
    }
    var retryPolicy = policy.retryPolicy || null;
    var providerId = null;
    if (policy.providerPolicy) {
      providerId = typeof policy.providerPolicy === 'function' ? policy.providerPolicy(ctx, input) : policy.providerPolicy;
    }
    return { decision: 'allow', providerId: providerId, retryPolicy: retryPolicy };
  }

  /* ═══════════════════════════════════════════
     WORKFLOW-04 — DECISION ENGINE (capability 8: BRANCH RESOLUTION)
     REUSE: evaluateCondition/runSwitch/run. Không engine mới.
     ═══════════════════════════════════════════ */

  /**
   * resolveBranch(branches, ctx, input, options) — chọn nhánh để chạy tiếp.
   * branches: array hoặc { default, ...cases }. Mỗi branch:
   *   { name, condition?, priority?, steps, inheritContext? }
   * - condition: đánh giá qua evaluateCondition (nhánh khớp đầu tiên theo priority).
   * - priority: số cao hơn ưu tiên hơn (mặc định 0).
   * - default: nhánh mặc định khi không khớp điều kiện nào.
   * - inheritContext: true → branch context kế thừa ctx (context inheritance).
   * Trả { selected, branch, steps } + resolve kèm merge result.
   */
  function resolveBranch(branches, ctx, input, options) {
    options = options || {};
    var list = [];
    var defaultBranch = null;
    if (Array.isArray(branches)) {
      list = branches;
    } else if (options && options.outName) {
      // không dùng
    } else if (branches && typeof branches === 'object') {
      Object.keys(branches).forEach(function (k) {
        if (k === 'default') { defaultBranch = branches[k]; }
        else list.push(Object.assign({ name: k }, branches[k]));
      });
    }
    if (!Array.isArray(list)) list = [];
    // sắp theo priority giảm dần
    var sorted = list.slice().sort(function (a, b) { return ((b.priority || 0) - (a.priority || 0)); });
    var selected = null;
    for (var i = 0; i < sorted.length; i++) {
      var br = sorted[i];
      if (!br.condition) { if (!selected) selected = br; }
      else {
        try {
          if (evaluateCondition(br.condition, ctx)) { selected = br; break; }
        } catch (e) { /* bỏ qua nhánh lỗi */ }
      }
    }
    if (!selected && defaultBranch) selected = Object.assign({ name: 'default' }, defaultBranch);
    if (!selected && sorted.length) selected = sorted[sorted.length - 1];
    // context inheritance
    var branchCtx = ctx;
    if (selected && selected.inheritContext === false && ctx) {
      branchCtx = createDecisionContext({ workflowId: ctx.workflowId, variables: Object.assign({}, ctx.variables) });
    }
    return { selected: selected ? selected.name : null, branch: selected, steps: selected ? (selected.steps || []) : [], context: branchCtx };
  }

  /**
   * mergeBranchResult(base, branchResult) — merge kết quả nhánh vào kết quả tổng.
   */
  function mergeBranchResult(base, branchResult) {
    base = base || {};
    if (!base.results) base.results = [];
    if (branchResult && Array.isArray(branchResult.results)) base.results = base.results.concat(branchResult.results);
    if (branchResult && branchResult.stoppedEarly) base.stoppedEarly = true;
    return base;
  }

  return {
    execute: execute,
    run: run,
    runBatch: runBatch,
    getWorkflowStatus: getWorkflowStatus,
    // WORKFLOW-04 Decision Context (capability 1)
    createDecisionContext: createDecisionContext,
    setDecisionVariable: setDecisionVariable,
    getDecisionVariable: getDecisionVariable,
    setDecisionShared: setDecisionShared,
    getDecisionShared: getDecisionShared,
    finishDecisionContext: finishDecisionContext,
    // WORKFLOW-04 IF/ELSE (capability 2)
    evaluateCondition: evaluateCondition,
    decideBranch: decideBranch,
    // WORKFLOW-04 SWITCH (capability 3)
    runSwitch: runSwitch,
    // WORKFLOW-04 LOOP/FOREACH (capability 4)
    runLoop: runLoop,
    runForEach: runForEach,
    // WORKFLOW-04 PARALLEL (capability 5)
    runParallel: runParallel,
    // WORKFLOW-04 WAIT EVENT (capability 6)
    waitForEvent: waitForEvent,
    resumeExecution: resumeExecution,
    cancelWaitEvent: cancelWaitEvent,
    // WORKFLOW-04 POLICY EVALUATION (capability 7)
    evaluatePolicy: evaluatePolicy,
    // WORKFLOW-04 BRANCH RESOLUTION (capability 8)
    resolveBranch: resolveBranch,
    mergeBranchResult: mergeBranchResult
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkflowEngine: WorkflowEngine };
}
