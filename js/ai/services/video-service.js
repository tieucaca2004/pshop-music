/*
 * VideoService — Video Generation Service
 * =========================================
 * Provides video generation capabilities through the unified pipeline.
 * Routes through GenerationService for consistency with all other media types.
 *
 * Currently no video module is registered — this service provides the
 * abstraction layer for frontend modules to request video generation
 * consistently, even when the actual implementation doesn't exist yet.
 *
 * Dependencies:
 *   js/ai/services/generation-service.js → GenerationService (pipeline)
 *   js/ai/services/provider-router.js     → ProviderRouter (type routing)
 *   js/ai/services/asset-manager.js       → AssetManager (storage)
 */

const VideoService = (function () {
  var MODULE_ID = null; // No video module registered yet

  /**
   * generate(params, userId, userEmail) — Generate video content.
   *
   * params = {
   *   script: string,              // Video script/storyboard text
   *   scenes?: string[],          // Scene descriptions
   *   duration?: number,          // Target duration in seconds
   *   resolution?: string,        // '720p' | '1080p' | '4K'
   *   images?: string[],          // Background images/urls
   *   audio?: string,             // Background audio url
   *   style?: string,             // Visual style
   *   format?: string             // 'mp4' | 'mov' | 'gif'
   * }
   */
  function generate(params, userId, userEmail) {
    if (!MODULE_ID) {
      return Promise.resolve({
        success: false,
        error: 'Video generation not yet available — no video module registered. ' +
               'Install a video generation module (e.g., RunwayML, Stable Video, ' +
               'or custom API) and register it in js/ai/modules/ to enable this feature.',
        stage: 'provider_not_available'
      });
    }
    return GenerationService.run({
      moduleId: MODULE_ID,
      inputParams: params,
      userId: userId,
      userEmail: userEmail
    });
  }

  /**
   * getStatus() — Returns the availability status of video generation.
   */
  function getStatus() {
    return {
      service: 'VideoService',
      available: MODULE_ID !== null && typeof GenerationService !== 'undefined',
      moduleId: MODULE_ID,
      needsModule: 'video-generator or video-provider',
      supportedResolutions: ['720p', '1080p', '4K'],
      supportedFormats: ['mp4', 'mov', 'gif'],
      notes: 'Requires a video generation module (RunwayML, Stable Video Diffusion, or custom API)'
    };
  }

  return {
    generate: generate,
    getStatus: getStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VideoService: VideoService };
}
