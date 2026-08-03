/*!
 * psh-workflow-auto.js — WORKFLOW-01: Auto Trigger (client side)
 * Sprint WORKFLOW. Khi Product được Publish (pubStatus === 'published')
 * hoặc bật Auto Workflow, tự khởi chạy chuỗi WorkflowEngine:
 *   Product → AI Content → Blog → Facebook → Banner
 *
 * Chỉ tái sử dụng hạ tầng đã có:
 *   - Queue apiAsyncJobs (pattern aiGenerateWorker, functions/index.js)
 *   - createJob / updateJobStatus (functions/shared/asyncJob.js)
 *   - runGeneration (functions/shared/aiGenerate.js)
 * Không tạo kiến trúc mới, không cron/polling/scheduler/webhook ngoài.
 *
 * Client chỉ GHI một job `workflow:auto` vào apiAsyncJobs — worker
 * (aiGenerateWorker mở rộng, backend) tiêu thụ và chạy từng step.
 */
(function () {
  var PSHWorkflowAuto = {
    enabled: true,

    /**
     * trigger(productId, productData) — Ghi job auto-workflow vào
     * apiAsyncJobs để worker backend tự chạy chuỗi Plugin.
     * Dùng đúng pattern createJob (firebase push) đã có.
     */
    trigger: function (productId, productData) {
      if (!this.enabled) return Promise.resolve(null);
      if (typeof firebase === 'undefined' || !firebase.database) {
        console.warn('[PSHWorkflowAuto] firebase not ready — skip auto workflow');
        return Promise.resolve(null);
      }
      var data = productData || {};
      // Chuỗi workflow cố định: Product → AI Content → Blog → Facebook → Banner
      var steps = [
        { type: 'generation', moduleId: 'product-content' },
        { type: 'generation', moduleId: 'blog-post' },
        { type: 'generation', moduleId: 'facebook-post' },
        { type: 'generation', moduleId: 'banner' }
      ];
      var ref = firebase.database().ref('apiAsyncJobs').push();
      var job = {
        type: 'workflow:auto',
        status: 'queued',
        createdAt: Date.now(),
        uid: (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : 'system',
        payload: {
          async: true,
          productId: productId,
          productName: data.name || '',
          steps: steps.map(function (s) { return { type: s.type, moduleId: s.moduleId }; })
        }
      };
      return ref.set(job).then(function () {
        return { jobId: ref.key, steps: steps.length };
      }).catch(function (err) {
        console.error('[PSHWorkflowAuto] trigger failed', err);
        return null;
      });
    }
  };

  window.PSHWorkflowAuto = PSHWorkflowAuto;

  // Auto-trigger hook: nếu trang khai báo autoWorkflow trên product db,
  // (vd từ website renderer) — giữ phía client tối giản, chỉ expose API.
})();
