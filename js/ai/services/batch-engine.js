/*
 * BatchEngine — Batch Processing Service
 * =========================================
 * Handles batch processing of multiple generation requests through the
 * GenerationService pipeline. Provides progress tracking, concurrency
 * control, and result aggregation.
 *
 * Flow: Batch request → GenerationService.runBatch() → progress tracking
 *       → per-item results → summary report
 *
 * Dependencies:
 *   js/ai/services/generation-service.js → GenerationService (pipeline)
 *   Firebase Realtime Database (aiBatchJobs/) → batch state tracking
 */

const BatchEngine = (function () {
  var BATCH_REF = null;
  var DEFAULT_CONCURRENCY = 3; // Max concurrent items

  function getRef() {
    if (BATCH_REF) return BATCH_REF;
    if (typeof firebase !== 'undefined' && firebase.database) {
      BATCH_REF = firebase.database().ref('aiBatchJobs');
    }
    return BATCH_REF;
  }

  /**
   * run(batchConfig) — Execute a batch of generation requests.
   *
   * batchConfig = {
   *   name: string,                    // Batch name/description
   *   requests: array,                 // Array of GenerationService.run()-compatible requests
   *   concurrency?: number,            // Max concurrent items (default: 3)
   *   userId: string,
   *   userEmail: string,
   *   onProgress?: function(info)      // Progress callback
   * }
   *
   * Returns Promise<{
   *   batchId: string,
   *   total: number,
   *   success: number,
   *   failed: number,
   *   results: array,
   *   duration: number
   * }>
   */
  function run(batchConfig) {
    if (!batchConfig || !batchConfig.requests || !batchConfig.requests.length) {
      return Promise.reject(new Error('BatchEngine.run() requires at least one request'));
    }

    var startTime = Date.now();
    var requests = batchConfig.requests.slice();
    var total = requests.length;
    var results = [];
    var successCount = 0;
    var failedCount = 0;
    var processed = 0;
    var concurrency = Math.min(
      batchConfig.concurrency || DEFAULT_CONCURRENCY,
      10 // Hard cap to prevent overload
    );

    // Create batch tracking entry
    var batchId = null;
    var ref = getRef();
    var batchEntryPromise = ref ? ref.push().then(function (r) { batchId = r.key; return r; }) : Promise.resolve();

    return batchEntryPromise.then(function () {
      // Track batch metadata
      if (batchId && ref) {
        ref.child(batchId).set({
          name: batchConfig.name || 'Unnamed batch',
          total: total,
          concurrency: concurrency,
          status: 'running',
          startedAt: Date.now(),
          createdBy: batchConfig.userId || 'system'
        });
      }

      // Process with controlled concurrency
      return processQueue(requests, concurrency, function (req, index) {
        // GenerationService.run() was removed in Phase 2.7 (moved to
        // WorkflowEngine); route through PipelineAdapter like VideoService
        // does — same fix applied across ImageService/VoiceService/
        // SubtitleService/TemplateEngine (full-CMS audit 2026-08-15).
        // PipelineAdapter's result already carries a real `success` boolean
        // (GenerationService.generate()'s raw {job, draftId} shape did not),
        // so the `result.success` check right below now works correctly too.
        if (typeof PipelineAdapter === 'undefined') {
          return Promise.reject(new Error('BatchEngine: PipelineAdapter not loaded'));
        }
        return PipelineAdapter.generateThroughPipeline(
          req.moduleId, req.inputParams || req, batchConfig.userId, batchConfig.userEmail
        ).then(function (result) {
          results[index] = result;
          processed++;
          if (result.success) successCount++;
          else failedCount++;

          // Update batch progress
          if (batchId && ref) {
            ref.child(batchId + '/progress').set({
              processed: processed,
              success: successCount,
              failed: failedCount,
              total: total,
              percent: Math.round((processed / total) * 100)
            });
          }

          // Call progress callback
          if (typeof batchConfig.onProgress === 'function') {
            batchConfig.onProgress({
              index: index,
              total: total,
              processed: processed,
              success: successCount,
              failed: failedCount,
              result: result
            });
          }

          return result;
        });
      });
    }).then(function () {
      var duration = Date.now() - startTime;

      // Finalize batch
      if (batchId && ref) {
        ref.child(batchId).update({
          status: 'completed',
          completedAt: Date.now(),
          duration: duration,
          results: {
            total: total,
            success: successCount,
            failed: failedCount,
            percent: total > 0 ? Math.round((successCount / total) * 100) : 0
          }
        });
      }

      return {
        batchId: batchId,
        total: total,
        success: successCount,
        failed: failedCount,
        results: results,
        duration: duration
      };
    }).catch(function (err) {
      if (batchId && ref) {
        ref.child(batchId).update({
          status: 'failed',
          error: err.message,
          completedAt: Date.now()
        });
      }
      throw err;
    });
  }

  /**
   * processQueue(items, concurrency, processor) — Process items with controlled concurrency.
   * Internal helper that limits how many items are processed simultaneously.
   */
  function processQueue(items, concurrency, processor) {
    var index = 0;
    var results = [];

    function next() {
      if (index >= items.length) return Promise.resolve(results);
      var currentIndex = index++;
      return Promise.resolve(processor(items[currentIndex], currentIndex)).then(function (result) {
        results[currentIndex] = result;
        return next();
      });
    }

    // Start N concurrent workers
    var workers = [];
    for (var i = 0; i < Math.min(concurrency, items.length); i++) {
      workers.push(next());
    }
    return Promise.all(workers).then(function () { return results; });
  }

  /**
   * getBatchStatus(batchId) — Get the status of a running/completed batch.
   */
  function getBatchStatus(batchId) {
    var ref = getRef();
    if (!ref) return Promise.resolve(null);
    return ref.child(batchId).once('value').then(function (snap) { return snap.val(); });
  }

  /**
   * cancelBatch(batchId) — Mark a batch as cancelled.
   */
  function cancelBatch(batchId) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(batchId).update({
      status: 'cancelled',
      cancelledAt: Date.now()
    });
  }

  /**
   * listBatches(filters) — List batch jobs.
   */
  function listBatches(filters) {
    var ref = getRef();
    if (!ref) return Promise.resolve([]);
    filters = filters || {};

    return ref.orderByChild('startedAt').limitToLast(50).once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return [];
      var items = Object.keys(data).map(function (key) {
        var item = data[key];
        item._id = key;
        return item;
      }).reverse();

      if (filters.status) items = items.filter(function (i) { return i.status === filters.status; });
      if (filters.createdBy) items = items.filter(function (i) { return i.createdBy === filters.createdBy; });
      if (filters.limit) items = items.slice(0, filters.limit);

      return items;
    });
  }

  return {
    run: run,
    getBatchStatus: getBatchStatus,
    cancelBatch: cancelBatch,
    listBatches: listBatches
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BatchEngine: BatchEngine };
}
