/*
 * Seedance Provider — Video Generation Provider
 * ===============================================
 * Integrates Seedance AI (or any video generation API) into the AI Provider
 * Framework. Follows the EXACT IAIProvider contract (generate/validate/
 * health) — no extra methods, no architectural changes.
 *
 * Architecture (same as OpenAI):
 *   Browser (CMS) → Cloud Function Proxy (seedanceProxy) → Seedance API
 *
 * The Cloud Function proxy handles:
 *   - API key storage (never exposed to client)
 *   - Job submission to video generation API
 *   - Progress polling
 *   - Video download URL management
 *   - Result format normalization
 *
 * To enable: Add API key to Firebase Config or env in Cloud Function,
 *           then enable in admin/ai/providers.html.
 *
 * Dependencies:
 *   js/ai/provider-registry.js  → AIProviderRegistry (registration)
 *   Firebase Auth (existing)    → idToken for proxy auth
 */

var SEEDANCE_PROXY_URL = 'https://us-central1-pshop-music.cloudfunctions.net/seedanceProxy';

/**
 * callSeedanceProxy(body) — Call the Seedance Cloud Function proxy.
 * Uses Firebase Auth idToken for authentication (same pattern as OpenAI).
 */
function callSeedanceProxy(body) {
  if (typeof firebase === 'undefined' || !firebase.auth() || !firebase.auth().currentUser) {
    return Promise.reject(new Error('Seedance: Chưa đăng nhập CMS — cần đăng nhập để gọi Cloud Function Proxy.'));
  }
  return firebase.auth().currentUser.getIdToken().then(function (idToken) {
    return fetch(SEEDANCE_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + idToken
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  });
}

AIProviderRegistry.register({
  id: 'seedance',
  label: 'Seedance (Video AI)',

  /**
   * validate(config) — Check if Seedance provider is ready to use.
   *   enabled === true means the user has configured it in the provider admin.
   */
  validate: function (config) {
    if (!config || !config.enabled) {
      return { valid: false, reason: 'Seedance chưa được bật trong Nhà cung cấp AI (admin/ai/providers.html).' };
    }
    if (typeof firebase === 'undefined' || !firebase.auth().currentUser) {
      return { valid: false, reason: 'Chưa đăng nhập CMS — cần đăng nhập để gọi Cloud Function Proxy.' };
    }
    return { valid: true, reason: '' };
  },

  /**
   * health() — Check Seedance API health through Cloud Function proxy.
   * The proxy pings Seedance API to verify the connection and key.
   */
  health: function () {
    return callSeedanceProxy({ action: 'health' }).then(function (result) {
      if (!result.ok) {
        return { healthy: false, message: result.data.error || 'Seedance Cloud Function Proxy báo lỗi.' };
      }
      return {
        healthy: result.data.healthy !== false,
        message: result.data.message || (result.data.healthy !== false ? 'Kết nối Seedance ổn định.' : 'Seedance API không khả dụng.'),
        details: result.data.details || null
      };
    }).catch(function (err) {
      return { healthy: false, message: 'Không gọi được Cloud Function Proxy: ' + err.message };
    });
  },

  /**
   * generate({ moduleId, prompt, params, config }) — Submit a video
   * generation job through the Seedance Cloud Function proxy.
   *
   * For video-generator module → Submits a video creation job.
   * For text modules → Falls back gracefully (Seedance is video-only).
   *
   * Returns { text: (storyboard/generated script), videoUrl: (video URL),
   *           thumbnailUrl, raw: (full provider response) }
   *
   * The Cloud Function proxy handles:
   *   1. Job submission to Seedance API
   *   2. Progress tracking
   *   3. Video download URL management
   *   4. Result normalization
   */
  generate: function (_a) {
    var moduleId = _a.moduleId, prompt = _a.prompt, params = _a.params, config = _a.config;

    if (!config || !config.enabled) {
      return Promise.reject(new Error(
        'Seedance chưa được kích hoạt. Vào admin/ai/providers.html để bật Seedance ' +
        'và cấu hình API key trong Cloud Function seedanceProxy.'
      ));
    }

    // Only handle video generation modules
    if (moduleId !== 'video-generator') {
      return Promise.reject(new Error(
        'Seedance chỉ hỗ trợ video generation. Module "' + moduleId + '" không được hỗ trợ.'
      ));
    }

    // Build the video generation request for Seedance API
    var videoRequest = {
      action: 'generate_video',
      moduleId: moduleId,
      prompt: prompt,
      params: {
        duration: params && params.duration ? parseDurationToSeconds(params.duration) : 15,
        resolution: params && params.resolution ? params.resolution : '1080p',
        style: params && params.style ? mapStyle(params.style) : 'realistic',
        scenes: params && params.scenes ? parseSceneCount(params.scenes) : 2,
        backgroundMusic: params && params.backgroundMusic ? params.backgroundMusic : null,
        voiceOver: params && params.voiceOver ? params.voiceOver : null,
        format: 'mp4'
      }
    };

    return callSeedanceProxy(videoRequest).then(function (result) {
      if (!result.ok) {
        throw new Error(result.data.error || 'Seedance Cloud Function Proxy báo lỗi.');
      }

      // Normalize response to standard provider format
      // { text, raw } — the video URL is stored in raw for the pipeline
      // to extract and save via AssetManager.
      var response = result.data;

      // If the video was generated successfully, return the storyboard text
      // and full metadata for the pipeline to process
      return {
        text: response.storyboard || response.script || prompt,
        videoUrl: response.videoUrl || null,
        thumbnailUrl: response.thumbnailUrl || null,
        jobId: response.jobId || null,
        raw: response
      };
    });
  }
});

/* ─── Helpers ─── */

/**
 * parseDurationToSeconds(durationStr) — Parse duration string like "15 giây"
 * to number of seconds. Defaults to 15.
 */
function parseDurationToSeconds(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 15;
  var match = durationStr.match(/(\d+)/);
  if (!match) return 15;
  var num = parseInt(match[1], 10);
  if (durationStr.indexOf('phút') !== -1 || durationStr.indexOf('min') !== -1) {
    return Math.min(num * 60, 300); // Max 5 minutes
  }
  return Math.min(Math.max(num, 5), 300); // Clamp 5-300s
}

/**
 * parseSceneCount(scenesStr) — Parse scenes string like "3 cảnh" to number.
 */
function parseSceneCount(scenesStr) {
  if (!scenesStr || typeof scenesStr !== 'string') return 2;
  var match = scenesStr.match(/(\d+)/);
  return match ? Math.min(Math.max(parseInt(match[1], 10), 1), 10) : 2;
}

/**
 * mapStyle(styleStr) — Map UI style selection to Seedance API style value.
 */
function mapStyle(styleStr) {
  var styleMap = {
    'Chân thực (Realistic)': 'realistic',
    'Điện ảnh (Cinematic)': 'cinematic',
    'Hoạt hình (Animated)': 'animated',
    'Ấm cúng (Warm)': 'warm',
    'Sang trọng (Luxury)': 'luxury',
    'Năng động (Dynamic)': 'dynamic'
  };
  return styleMap[styleStr] || 'realistic';
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { callSeedanceProxy: callSeedanceProxy };
}
