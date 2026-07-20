/*
 * VideoService — Video Generation Service
 * =========================================
 * Provides video generation capabilities through the unified pipeline.
 * Routes through PipelineAdapter → WorkflowEngine for orchestration, then
 * GenerationService for execution, then Seedance/video provider for generation.
 *
 * Phase 2.7: Uses WorkflowEngine via PipelineAdapter — never calls
 * GenerationService or Seedance provider directly.
 *
 * Module ID is set after AIModuleRegistry registration (module registry
 * must be loaded before VideoService can detect the registered module).
 *
 * Dependencies:
 *   js/ai/services/pipeline-adapter.js     → PipelineAdapter (to workflow)
 *   js/ai/services/provider-router.js      → ProviderRouter (type routing)
 *   js/ai/services/asset-manager.js        → AssetManager (storage)
 *   js/ai/modules/video-generator.js       → Must be loaded for module detection
 *   js/ai/providers/seedance.js            → Must be loaded for provider access
 */

const VideoService = (function () {
  /* ─── Module Detection ─── */
  // Self-detects; no manual ID strings. If AIModuleRegistry has 'video-generator',
  // VideoService automatically uses it.

  function getModuleId() {
    if (typeof AIModuleRegistry !== 'undefined' && typeof AIModuleRegistry.get === 'function') {
      var mod = AIModuleRegistry.get('video-generator');
      return mod ? 'video-generator' : null;
    }
    return null;
  }

  /**
   * generate(params, userId, userEmail) — Generate video through the
   * unified pipeline.
   *
   * params = {
   *   scriptType: string,         // 'Quảng cáo sản phẩm' | 'Quảng cáo nhà hàng' | 'Giới thiệu thương hiệu' | 'Kịch bản tự do'
   *   productId?: string,         // Firebase product key (nếu quảng cáo sản phẩm)
   *   customScript?: string,      // Mô tả video tự do
   *   duration: string,           // '15 giây' | '30 giây' | '45 giây' | '60 giây'
   *   resolution: string,         // '720p' | '1080p' | '4K'
   *   style: string,              // 'Chân thực (Realistic)' | 'Điện ảnh (Cinematic)' | ...
   *   backgroundMusic?: string,   // 'Không nhạc' | 'Nhạc sôi động' | ...
   *   scenes: string,             // '1 cảnh' | '2 cảnh' | '3 cảnh' | ...
   *   voiceOver?: string          // 'Không giọng đọc' | 'Giọng nam' | ...
   * }
   *
   * Pipeline flow:
   *   VideoService.generate()
   *     → PipelineAdapter.generateThroughPipeline()
   *       → WorkflowEngine.execute()     (orchestration)
   *         → GenerationService.execution (pure execution)
   *           → ProviderRouter.route()   (find video provider)
   *             → Seedance provider       (video generation)
   *
   * Returns Promise<{
   *   success: boolean,
   *   job?: object,       // AIJobQueue job
   *   draftId?: string,   // Generated content ID
   *   assetId?: string,   // Asset library ID (saved after generation)
   *   error?: string
   * }>
   */
  function generate(params, userId, userEmail) {
    var moduleId = getModuleId();
    if (!moduleId) {
      return Promise.resolve({
        success: false,
        error: 'Video generation module chưa được tải. ' +
               'Đảm bảo js/ai/modules/video-generator.js đã được include trong trang.',
        stage: 'module_not_loaded'
      });
    }

    if (typeof PipelineAdapter === 'undefined') {
      return Promise.reject(new Error('VideoService: PipelineAdapter not loaded'));
    }

    // Route through PipelineAdapter → WorkflowEngine → GenerationService
    return PipelineAdapter.generateThroughPipeline(moduleId, params, userId, userEmail);
  }

  /**
   * generateWithWorkflow(params, userId, userEmail) — Generate video through
   * a full multi-step workflow with progress tracking.
   *
   * Workflow steps:
   *   1. Build script/storyboard from input
   *   2. Generate video scenes
   *   3. Check quality
   *   4. Save to asset library
   *   5. Log to media history
   *
   * Returns Promise<{
   *   success: boolean,
   *   results: array,    // Step-by-step results
   *   assetId?: string,
   *   error?: string
   * }>
   */
  function generateWithWorkflow(params, userId, userEmail) {
    var moduleId = getModuleId();
    if (!moduleId) {
      return Promise.resolve({
        success: false,
        error: 'Video generation module chưa được tải.',
        stage: 'module_not_loaded'
      });
    }

    if (typeof WorkflowEngine === 'undefined') {
      return Promise.reject(new Error('VideoService: WorkflowEngine not loaded'));
    }

    // Build the full video generation workflow
    var steps = [
      // Step 1: Script/storyboard generation
      {
        type: 'generation',
        index: 0,
        moduleId: moduleId,
        inputParams: params,
        config: {
          retryCount: 1,
          retryDelayMs: 2000
        }
      },
      // Step 2: Quality check (handled by GenerationService.checkQuality internally)
      //        WorkflowEngine handles retry/fallback around generation itself.
      //        Quality check is a built-in step of GenerationService execution.
      // Step 3: No additional steps — the pipeline handles quality, asset save,
      //        and history logging inside GenerationService.generate() →
      //        checkQuality → saveToAssetLibrary → logToHistory.
    ];

    // For longer/advanced workflows, add approval and retry steps
    if (params.resolution === '4K' || params.duration === '60 giây') {
      // High-res or long videos get an approval gate before rendering
      steps.push({
        type: 'approval',
        index: 1,
        moduleId: moduleId,
        config: {
          requireApproval: true,
          approvalId: 'video-quality-review',
          message: 'Video storyboard đã sẵn sàng. Kiểm tra và phê duyệt để tiếp tục render.'
        }
      });
    }

    return WorkflowEngine.run(steps, userId, userEmail);
  }

  /**
   * getProgress(jobId) — Check video generation job progress.
   * For long-running video jobs, polls the provider for status.
   * Returns job progress from AIJobQueue or from the video provider.
   */
  function getProgress(jobId) {
    if (!jobId) {
      return Promise.resolve({ status: 'unknown', error: 'No job ID provided' });
    }

    if (typeof JobDB !== 'undefined') {
      return JobDB.get(jobId).then(function (job) {
        if (!job) return { status: 'not_found', jobId: jobId };
        return {
          jobId: jobId,
          status: job.status || 'unknown',
          progress: job.progress || 0,
          itemsTotal: (job.items && job.items.length) || 0,
          itemsCompleted: (job.items && job.items.filter(function (i) { return i.status === 'completed'; }).length) || 0,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          error: job.error || null
        };
      }).catch(function () {
        return { status: 'error', jobId: jobId, error: 'Failed to fetch job progress' };
      });
    }

    return Promise.resolve({ status: 'unknown', jobId: jobId, note: 'JobDB not available' });
  }

  /**
   * getStatus() — Return the availability status of video generation.
   * Checks that the module is registered and the pipeline is accessible.
   */
  function getStatus() {
    var moduleId = getModuleId();
    var moduleAvailable = moduleId !== null;
    var pipelineAvailable = typeof PipelineAdapter !== 'undefined';
    var workflowAvailable = typeof WorkflowEngine !== 'undefined';

    return {
      service: 'VideoService',
      available: moduleAvailable && pipelineAvailable,
      moduleId: moduleId,
      moduleRegistered: moduleAvailable,
      pipelineReady: pipelineAvailable,
      workflowReady: workflowAvailable,
      architecture: 'VideoService → PipelineAdapter → WorkflowEngine → GenerationService → ProviderRouter → Seedance',
      flows: {
        simpleGeneration: 'PipelineAdapter.generateThroughPipeline()',
        workflowGeneration: 'VideoService.generateWithWorkflow() — WorkflowEngine.run()',
        progressTracking: 'VideoService.getProgress() — JobDB',
        assetManagement: 'PipelineAdapter.saveToAssetLibrary() — AssetManager',
        qualityCheck: 'PipelineAdapter.checkContentQuality() — QualityEngine'
      },
      supportedResolutions: ['720p', '1080p', '4K'],
      supportedFormats: ['mp4'],
      supportedDurations: ['15 giây', '30 giây', '45 giây', '60 giây'],
      provider: 'Seedance (AI Provider — cần kích hoạt trong admin/ai/providers.html)'
    };
  }

  return {
    generate: generate,
    generateWithWorkflow: generateWithWorkflow,
    getProgress: getProgress,
    getStatus: getStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VideoService: VideoService };
}
