/*
 * SubtitleService — Subtitle Generation Service
 * ===============================================
 * Handles subtitle/caption generation for video and audio content.
 * Routes through the unified GenerationService pipeline.
 *
 * Dependencies:
 *   js/ai/services/generation-service.js → GenerationService (pipeline)
 *   js/ai/services/asset-manager.js       → AssetManager (storage)
 */

const SubtitleService = (function () {
  var MODULE_ID = null; // No subtitle module registered yet

  /**
   * generate(params, userId, userEmail) — Generate subtitles from text/audio.
   *
   * params = {
   *   text: string,            // Full text to time-align
   *   language: string,        // Language code (e.g., 'vi', 'en')
   *   format: string,          // 'srt' | 'vtt' | 'ass' (default: 'srt')
   *   maxLength: number,       // Max characters per subtitle line
   *   sourceType: string       // 'text' | 'audio' (future: auto-transcribe)
   * }
   */
  function generate(params, userId, userEmail) {
    if (!MODULE_ID) {
      // Even without a registered module, we can generate basic SRT/VTT
      // from plain text by splitting into timed chunks
      return generateBasic(params);
    }
    // GenerationService.run() was removed in Phase 2.7 (moved to
    // WorkflowEngine); route through PipelineAdapter like VideoService does
    // — same fix applied across ImageService/VoiceService/TemplateEngine/
    // BatchEngine (full-CMS audit 2026-08-15).
    if (typeof PipelineAdapter === 'undefined') {
      return Promise.reject(new Error('SubtitleService: PipelineAdapter not loaded'));
    }
    return PipelineAdapter.generateThroughPipeline(MODULE_ID, params, userId, userEmail);
  }

  /**
   * generateBasic(params) — Generate basic subtitles from plain text.
   * Creates SRT or VTT format subtitles by splitting text into timed chunks.
   * This is a FALLBACK when no AI subtitle module exists.
   *
   * Returns { success, format, subtitles, lines }
   */
  function generateBasic(params) {
    var text = params.text || params.script || '';
    var format = (params.format || 'srt').toLowerCase();
    var maxLength = params.maxLength || 80;
    var language = params.language || 'vi';
    var fps = 30;
    var charsPerSecond = 15; // Average reading speed

    if (!text) {
      return Promise.resolve({
        success: false,
        error: 'No text provided for subtitle generation',
        format: format,
        subtitles: '',
        lines: 0
      });
    }

    // Split text into subtitle-sized chunks
    var words = text.split(/\s+/);
    var lines = [];
    var currentLine = [];
    var currentLength = 0;

    words.forEach(function (word, index) {
      if (currentLength + word.length + 1 > maxLength && currentLine.length > 0) {
        lines.push(currentLine.join(' '));
        currentLine = [word];
        currentLength = word.length;
      } else {
        currentLine.push(word);
        currentLength += word.length + (currentLine.length > 1 ? 1 : 0);
      }
    });
    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    // Generate subtitle entries with timing
    var result = '';
    var totalDuration = Math.ceil(text.length / charsPerSecond);

    lines.forEach(function (line, index) {
      var startTime = Math.floor((index * totalDuration * fps) / lines.length) / fps;
      var endTime = Math.floor(((index + 1) * totalDuration * fps) / lines.length) / fps;

      if (format === 'vtt') {
        result += formatTimeVTT(startTime) + ' --> ' + formatTimeVTT(endTime) + '\n';
        result += line + '\n\n';
      } else {
        // Default: SRT
        result += (index + 1) + '\n';
        result += formatTimeSRT(startTime) + ' --> ' + formatTimeSRT(endTime) + '\n';
        result += line + '\n\n';
      }
    });

    return Promise.resolve({
      success: true,
      format: format,
      language: language,
      subtitles: result,
      lines: lines.length,
      totalDuration: totalDuration,
      note: MODULE_ID ? 'Generated via module' : 'Basic subtitle generation (no AI module)'
    });
  }

  function formatTimeSRT(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 1000);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + ',' + pad(ms, 3);
  }

  function formatTimeVTT(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 1000);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(ms, 3);
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /**
   * getSupportedFormats() — Returns supported subtitle formats.
   */
  function getSupportedFormats() {
    return ['srt', 'vtt', 'ass'];
  }

  return {
    generate: generate,
    generateBasic: generateBasic,
    getSupportedFormats: getSupportedFormats
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubtitleService: SubtitleService };
}
