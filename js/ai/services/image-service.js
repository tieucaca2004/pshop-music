/*
 * ImageService — Image Generation Service
 * =========================================
 * Wraps the existing image-generator module through the pipeline. Every
 * image generation request must route through this service.
 *
 * Uses PipelineAdapter.generateThroughPipeline() for execution (Phase 2.7 —
 * GenerationService.run() was removed, see PipelineAdapter/WorkflowEngine).
 * Reuses existing AIModuleRegistry.get('image-generator') for prompt/mapping.
 *
 * Dependencies (existing):
 *   js/ai/services/pipeline-adapter.js    → PipelineAdapter (entry point)
 *   js/ai/module-registry.js              → AIModuleRegistry
 *   js/ai/providers/openai.js             → DALL-E (existing image provider)
 */

const ImageService = (function () {
  var MODULE_ID = 'image-generator';

  /**
   * generate(params, userId, userEmail) — Generate an image through the pipeline.
   *
   * params = {
   *   imageType: string,         // 'Product Hero Image', 'Banner Image', etc.
   *   productId?: string,
   *   promotion?: string,
   *   blogPostId?: string,
   *   customPrompt?: string,
   *   style?: string,
   *   size?: string               // '1:1', '4:5', '16:9'
   * }
   *
   * Returns PipelineAdapter.generateThroughPipeline() result.
   */
  function generate(params, userId, userEmail) {
    // GenerationService.run()/runBatch() were removed in Phase 2.7 (moved to
    // WorkflowEngine) — this call was never updated and would throw
    // "GenerationService.run is not a function" the moment ImageService is
    // wired into a page (found during full-CMS audit 2026-08-15; not
    // currently loaded by any admin page, so no live impact yet). Route
    // through PipelineAdapter, the same blessed entry point VideoService
    // already uses correctly.
    if (typeof PipelineAdapter === 'undefined') {
      return Promise.reject(new Error('ImageService: PipelineAdapter not loaded'));
    }
    return PipelineAdapter.generateThroughPipeline(MODULE_ID, params, userId, userEmail);
  }

  /**
   * getSupportedTypes() — Returns available image types.
   */
  function getSupportedTypes() {
    var module = typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(MODULE_ID) : null;
    if (!module) return [];
    var field = (module.inputFields || []).find(function (f) { return f.key === 'imageType'; });
    return field ? (field.options || []) : [];
  }

  /**
   * getPipelineStatus() — Returns the image pipeline status.
   */
  function getPipelineStatus() {
    return {
      service: 'ImageService',
      moduleId: MODULE_ID,
      moduleRegistered: typeof AIModuleRegistry !== 'undefined' && !!AIModuleRegistry.get(MODULE_ID),
      pipelineAvailable: typeof PipelineAdapter !== 'undefined' && typeof PipelineAdapter.generateThroughPipeline === 'function'
    };
  }

  return {
    generate: generate,
    getSupportedTypes: getSupportedTypes,
    getPipelineStatus: getPipelineStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ImageService: ImageService };
}
