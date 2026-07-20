/*
 * ImageService — Image Generation Service
 * =========================================
 * Wraps the existing image-generator module through the GenerationService
 * pipeline. Every image generation request must route through this service.
 *
 * Uses GenerationService.run() for pipeline execution.
 * Reuses existing AIModuleRegistry.get('image-generator') for prompt/mapping.
 *
 * Dependencies (existing):
 *   js/ai/services/generation-service.js  → GenerationService (pipeline)
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
   * Returns GenerationService.run() result.
   */
  function generate(params, userId, userEmail) {
    return GenerationService.run({
      moduleId: MODULE_ID,
      inputParams: params,
      userId: userId,
      userEmail: userEmail,
      skipQuality: false,
      skipAsset: false,
      skipHistory: false
    });
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
      pipelineAvailable: typeof GenerationService !== 'undefined' && !!GenerationService.run
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
