/*
 * ProviderRouter — Content-Type to Provider Routing
 * ==================================================
 * Routes content generation requests to the optimal AI provider based on
 * content type. This is a THIN abstraction over AIProviderRegistry — it
 * does NOT reimplement provider selection logic, only adds content-type
 * awareness (e.g., images → OpenAI DALL-E, text → any chat provider).
 *
 * Dependencies (existing, not duplicated):
 *   js/ai/provider-registry.js  → AIProviderRegistry
 *   js/ai/plugin-db.js          → PluginDB (for per-plugin overrides)
 */

const ProviderRouter = (function () {
  // Content type → preferred provider hints
  // These are SUGGESTIONS, not constraints. The actual provider selection
  // is delegated to AIProviderRegistry.resolveForPlugin().
  var CONTENT_TYPE_ROUTES = {
    'image':     { preferred: 'openai',   reason: 'DALL-E image generation' },
    'video':     { preferred: 'seedance', reason: 'Seedance video generation' },
    'voice':     { preferred: null,       reason: 'Voice generation not yet available' },
    'text':      { preferred: null,       reason: 'Use active provider' },
    'facebook':  { preferred: null,       reason: 'Use active provider' },
    'blog':      { preferred: null,       reason: 'Use active provider' },
    'seo':       { preferred: null,       reason: 'Use active provider' },
    'product':   { preferred: null,       reason: 'Use active provider' },
    'banner':    { preferred: null,       reason: 'Use active provider' },
    'slider':    { preferred: null,       reason: 'Use active provider' },
    'prompt':    { preferred: null,       reason: 'Use active provider' }
  };

  var MEDIA_TYPE_MAP = {
    'image-generator':           'image',
    'image-prompt-generator':    'prompt',
    'blog-writer':               'blog',
    'faq-generator':             'blog',
    'seo-generator':             'seo',
    'facebook-post-generator':   'facebook',
    'product-description-writer':'product',
    'banner-generator':          'banner',
    'slider-generator':          'slider',
    'video-generator':           'video'
  };

  /**
   * getMediaType(moduleId) — Derives the media/content type from module ID.
   */
  function getMediaType(moduleId) {
    return MEDIA_TYPE_MAP[moduleId] || 'text';
  }

  /**
   * getPreferredProvider(mediaType) — Returns the preferred provider id for
   * a given media type, or null if no preference.
   */
  function getPreferredProvider(mediaType) {
    var route = CONTENT_TYPE_ROUTES[mediaType];
    return route ? route.preferred : null;
  }

  /**
   * route(moduleId) — Resolves the best provider for a module.
   * 
   * Flow:
   * 1. Check PluginDB for per-plugin provider override (existing behavior)
   * 2. Fall back to AIProviderRegistry.resolveForPlugin() (existing)
   * 3. If provider supports the content type, use it
   * 4. Otherwise, check if a preferred provider exists and is available
   * 5. Final fallback: getActive()
   *
   * Returns Promise<{ provider, config, providerId, mediaType }>
   */
  function route(moduleId) {
    var mediaType = getMediaType(moduleId);
    var preferredId = getPreferredProvider(mediaType);

    if (typeof AIProviderRegistry === 'undefined') {
      return Promise.reject(new Error('ProviderRouter: AIProviderRegistry not loaded'));
    }

    // Step 1-2: Delegate to existing registry
    return AIProviderRegistry.resolveForPlugin(moduleId)
      .then(function (result) {
        result.mediaType = mediaType;
        result.preferredId = preferredId;
        return result;
      })
      .catch(function () {
        // Step 3-5: Fallback to active provider or preferred
        if (preferredId) {
          var prefProvider = AIProviderRegistry.get(preferredId);
          if (prefProvider) {
            return { provider: prefProvider, config: {}, providerId: preferredId, mediaType: mediaType, preferredId: preferredId, fallback: true };
          }
        }
        return AIProviderRegistry.getActive().then(function (result) {
          result.mediaType = mediaType;
          result.preferredId = preferredId;
          result.fallback = true;
          return result;
        });
      });
  }

  /**
   * getAllRoutes() — Returns the content type routing table.
   */
  function getAllRoutes() {
    var routes = {};
    Object.keys(CONTENT_TYPE_ROUTES).forEach(function (type) {
      routes[type] = {
        preferred: CONTENT_TYPE_ROUTES[type].preferred,
        reason: CONTENT_TYPE_ROUTES[type].reason,
        modules: Object.keys(MEDIA_TYPE_MAP).filter(function (m) { return MEDIA_TYPE_MAP[m] === type; })
      };
    });
    return routes;
  }

  return {
    route: route,
    getMediaType: getMediaType,
    getPreferredProvider: getPreferredProvider,
    getAllRoutes: getAllRoutes
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProviderRouter: ProviderRouter };
}
