/*
 * RenderQueue — Render Job Management Service
 * =============================================
 * Manages the render queue for media generation. This is separate from
 * AIJobQueue — the Job Queue handles AI generation (text/image creation),
 * while the Render Queue handles the delivery/packaging/rendering of
 * generated content into final formats.
 *
 * Flow: GenerationService → RenderQueue.enqueue() → status tracking →
 *       completion → Asset Library → Social Export
 *
 * Dependencies (existing):
 *   Firebase Realtime Database (aiJobs node, reused)
 *   JobDB (js/ai/ai-db.js, existing)
 */

const RenderQueue = (function () {
  var QUEUE_REF = null;

  function getRef() {
    if (QUEUE_REF) return QUEUE_REF;
    if (typeof firebase !== 'undefined' && firebase.database) {
      QUEUE_REF = firebase.database().ref('aiJobs');
    }
    return QUEUE_REF;
  }

  /**
   * enqueue(renderJob) — Add a render job to the queue.
   *
   * renderJob = {
   *   type: 'image' | 'video' | 'audio' | 'document',
   *   sourceDraftId: string,    // Source draft to render
   *   moduleId: string,          // source module
   *   format: 'png' | 'mp4' | 'mp3' | 'pdf' | string,
   *   options?: object,          // Format-specific options
   *   userId: string,
   *   priority?: number          // 1 (highest) to 5 (lowest)
   * }
   *
   * Returns Promise<{ id: string }>
   */
  function enqueue(renderJob) {
    var ref = getRef();
    if (!ref) {
      return Promise.reject(new Error('RenderQueue: Firebase not available'));
    }
    var entry = {
      type: 'render',
      renderType: renderJob.type || 'document',
      sourceDraftId: renderJob.sourceDraftId || null,
      moduleId: renderJob.moduleId || null,
      format: renderJob.format || 'auto',
      options: renderJob.options || {},
      priority: renderJob.priority || 5,
      status: 'queued',
      createdBy: renderJob.userId || 'system',
      createdAt: Date.now(),
      progress: null
    };
    var newRef = ref.push();
    return newRef.set(entry).then(function () {
      return { id: newRef.key };
    });
  }

  /**
   * getStatus(jobId) — Get the current status of a render job.
   */
  function getStatus(jobId) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('RenderQueue: Firebase not available'));
    return ref.child(jobId).once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return null;
      return { id: jobId, status: data.status, progress: data.progress, error: data.error };
    });
  }

  /**
   * list(filters) — List render jobs with optional filters.
   */
  function list(filters) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('RenderQueue: Firebase not available'));
    filters = filters || {};

    return ref.orderByChild('type').equalTo('render').once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return [];
      var items = Object.keys(data).map(function (key) {
        var item = data[key];
        item._id = key;
        return item;
      }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

      if (filters.status) items = items.filter(function (i) { return i.status === filters.status; });
      if (filters.renderType) items = items.filter(function (i) { return i.renderType === filters.renderType; });
      if (filters.limit) items = items.slice(0, filters.limit);

      return items;
    });
  }

  /**
   * updateStatus(jobId, status, progress) — Update render job status.
   */
  function updateStatus(jobId, status, progress) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('RenderQueue: Firebase not available'));
    var update = { status: status, updatedAt: Date.now() };
    if (progress !== undefined && progress !== null) update.progress = progress;
    if (status === 'completed') update.completedAt = Date.now();
    if (status === 'failed') update.failedAt = Date.now();
    return ref.child(jobId).update(update);
  }

  /**
   * cancel(jobId) — Cancel a pending render job.
   */
  function cancel(jobId) {
    return updateStatus(jobId, 'cancelled');
  }

  /**
   * remove(jobId) — Remove a completed/render job from the queue.
   */
  function remove(jobId) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('RenderQueue: Firebase not available'));
    return ref.child(jobId).remove();
  }

  return {
    enqueue: enqueue,
    getStatus: getStatus,
    list: list,
    updateStatus: updateStatus,
    cancel: cancel,
    remove: remove
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RenderQueue: RenderQueue };
}
