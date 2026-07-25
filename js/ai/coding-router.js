/**
 * js/ai/coding-router.js — AI Coding Provider Router (Architecture Update 2026-07-25).
 *
 * Coding Policy:
 * - DeepSeek: Default coding provider (CRUD, small features, bugs, tests, boilerplate)
 * - Claude: Advanced coding provider (architecture, large refactoring, multi-file, security, debugging)
 * - OpenAI: Content generation only (marketing, blog, social media — unchanged)
 *
 * This router does NOT modify existing content-generation modules.
 * It only defines which provider handles which type of coding task.
 */
const CodingRouter = (function() {
  'use strict';

  var DEFAULT_PROVIDER = 'deepseek';
  var ADVANCED_PROVIDER = 'claude';
  var CONTENT_PROVIDER = 'openai';

  // Decision rules — task complexity determines provider selection
  var COMPLEXITY_KEYWORDS = {
    advanced: [
      'architecture', 'refactor', 'migration', 'multi-file', 'multi file',
      'security', 'performance', 'optimization', 'debugging', 'complex',
      'design', 'pattern', 'strategy', 'cross-cutting', 'integration',
      'pipeline', 'deployment', 'scalability', 'database schema',
      'authentication flow', 'authorization', 'permission',
      'technical design', 'difficult', 'large'
    ],
    simple: [
      'crud', 'small', 'bug', 'fix', 'simple', 'basic', 'unit test',
      'boilerplate', 'documentation', 'template', 'style', 'format',
      'variable', 'function', 'method', 'component', 'page',
      'routine', 'minor', 'trivial', 'easy'
    ]
  };

  /**
   * resolve(complexity, affectedModules) -> { provider, reason }
   *
   * Returns which provider should handle the task.
   *
   * @param {string|number} complexity - 'low'/'high' or 1-5 scale
   * @param {number} affectedModules - number of modules affected
   * @param {string} context - task description (optional, for keyword analysis)
   * @returns {{ provider: string, reason: string }}
   */
  function resolve(complexity, affectedModules, context) {
    // Check affected modules first — multi-module changes need Claude
    if (affectedModules >= 2) {
      return { provider: ADVANCED_PROVIDER, reason: 'Affects ' + affectedModules + ' modules — needs Claude Code' };
    }

    // Check explicit complexity rating
    if (typeof complexity === 'number') {
      if (complexity >= 4) {
        return { provider: ADVANCED_PROVIDER, reason: 'Complexity ' + complexity + '/5 — needs Claude Code' };
      }
      if (complexity <= 2) {
        return { provider: DEFAULT_PROVIDER, reason: 'Complexity ' + complexity + '/5 — suitable for DeepSeek' };
      }
    }

    if (typeof complexity === 'string') {
      if (complexity === 'high' || complexity === 'hard' || complexity === 'very hard') {
        return { provider: ADVANCED_PROVIDER, reason: 'High complexity — needs Claude Code' };
      }
      if (complexity === 'low' || complexity === 'easy') {
        return { provider: DEFAULT_PROVIDER, reason: 'Low complexity — suitable for DeepSeek' };
      }
    }

    // Keyword-based context analysis
    if (context) {
      var lower = context.toLowerCase();
      for (var i = 0; i < COMPLEXITY_KEYWORDS.advanced.length; i++) {
        if (lower.indexOf(COMPLEXITY_KEYWORDS.advanced[i]) !== -1) {
          return { provider: ADVANCED_PROVIDER, reason: 'Contains advanced keywords — needs Claude Code' };
        }
      }
      for (var j = 0; j < COMPLEXITY_KEYWORDS.simple.length; j++) {
        if (lower.indexOf(COMPLEXITY_KEYWORDS.simple[j]) !== -1) {
          return { provider: DEFAULT_PROVIDER, reason: 'Contains simple keywords — suitable for DeepSeek' };
        }
      }
    }

    // Default fallback
    return { provider: DEFAULT_PROVIDER, reason: 'Default — routed to DeepSeek' };
  }

  /**
   * isContentTask(moduleId) -> boolean
   * Returns true if the module is a content-generation module (should use OpenAI).
   */
  function isContentTask(moduleId) {
    var contentModules = [
      'blog-writer', 'product-description-writer', 'seo-generator',
      'faq-generator', 'facebook-post-generator', 'banner-generator',
      'slider-generator', 'image-generator', 'image-prompt-generator',
      'video-generator'
    ];
    return contentModules.indexOf(moduleId) !== -1;
  }

  return {
    resolve: resolve,
    isContentTask: isContentTask,
    DEFAULT_PROVIDER: DEFAULT_PROVIDER,
    ADVANCED_PROVIDER: ADVANCED_PROVIDER,
    CONTENT_PROVIDER: CONTENT_PROVIDER
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodingRouter;
}
