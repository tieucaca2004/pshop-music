/*
 * VoiceService — Voice/Audio Generation Service
 * ===============================================
 * Provides voice and audio generation capabilities through the unified
 * pipeline. Uses the GenerationService for orchestration.
 *
 * Currently no provider implements voice generation — this service
 * provides the abstraction layer so frontend modules can request voice
 * generation without knowing provider details.
 *
 * Dependencies:
 *   js/ai/services/generation-service.js  → GenerationService (pipeline)
 *   js/ai/services/provider-router.js      → ProviderRouter (type routing)
 *   js/ai/services/asset-manager.js         → AssetManager (storage)
 */

const VoiceService = (function () {
  var MODULE_ID = null; // No voice module registered yet

  /**
   * generate(params, userId, userEmail) — Generate voice content.
   * Will be functional once a voice provider is registered.
   *
   * params = {
   *   text: string,              // Text to convert to speech
   *   voice?: string,            // Voice style/model
   *   language?: string,         // Language code
   *   speed?: number,            // Speech speed (0.5-2.0)
   *   format?: string            // 'mp3' | 'wav' | 'ogg'
   * }
   */
  function generate(params, userId, userEmail) {
    if (!MODULE_ID) {
      return Promise.resolve({
        success: false,
        error: 'Voice generation not yet available — no voice provider registered. ' +
               'Install a voice module (e.g., ElevenLabs, Google TTS) and register ' +
               'it in js/ai/modules/ to enable this feature.',
        stage: 'provider_not_available'
      });
    }
    // GenerationService.run() was removed in Phase 2.7 (moved to
    // WorkflowEngine); route through PipelineAdapter like VideoService does
    // — same fix applied across ImageService/SubtitleService/TemplateEngine/
    // BatchEngine (full-CMS audit 2026-08-15).
    if (typeof PipelineAdapter === 'undefined') {
      return Promise.reject(new Error('VoiceService: PipelineAdapter not loaded'));
    }
    return PipelineAdapter.generateThroughPipeline(MODULE_ID, params, userId, userEmail);
  }

  /**
   * getStatus() — Returns the availability status of voice generation.
   */
  function getStatus() {
    return {
      service: 'VoiceService',
      available: MODULE_ID !== null && typeof PipelineAdapter !== 'undefined',
      moduleId: MODULE_ID,
      needsModule: 'voice-generator or tts-provider',
      supportedFormats: ['mp3', 'wav', 'ogg'],
      supportedLanguages: ['vi', 'en'],
      notes: 'Requires a voice generation module (ElevenLabs, Google Cloud TTS, or custom API)'
    };
  }

  return {
    generate: generate,
    getStatus: getStatus
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VoiceService: VoiceService };
}
