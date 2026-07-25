/**
 * js/ai/coding-router.js — AI Coding Provider Router (Architecture Update 2026-07-25).
 *
 * Coding Policy:
 * - DeepSeek: Default coding provider (CRUD, small features, bugs, tests, boilerplate)
 * - Claude: Advanced coding provider (architecture, large refactoring, multi-file, security, debugging)
 * - OpenAI: Content generation only (marketing, blog, social media — unchanged)
 *
 * Complexity Score (primary decision factor):
 *   1-2: DeepSeek (low complexity)
 *     3: DeepSeek default, Claude if low confidence (medium complexity)
 *   4-5: Claude (high complexity)
 *
 * Affected modules is a secondary signal only.
 */
const CodingRouter = (function() {
  'use strict';

  var DEFAULT_PROVIDER = 'deepseek';
  var ADVANCED_PROVIDER = 'claude';
  var CONTENT_PROVIDER = 'openai';

  // Keyword-to-complexity mapping — used when no explicit score is given
  var COMPLEXITY_MAP = {
    // Score 1-2 keywords (simple)
    level1: ['crud', 'boilerplate', 'trivial', 'typo', 'rename', 'format', 'style', 'comment'],
    level2: ['small', 'simple', 'basic', 'easy', 'minor', 'routine', 'unit test', 'documentation',
             'template', 'variable', 'function', 'method', 'component', 'page', 'ui', 'bug fix'],

    // Score 3 keywords (medium)
    level3: ['medium', 'enhancement', 'multiple modules', 'related files', 'service',
             'implementation', 'middleware', 'controller', 'route', 'integration'],

    // Score 4-5 keywords (complex)
    level4: ['architecture', 'design', 'refactor', 'large', 'complex', 'migration',
             'security', 'authentication', 'authorization', 'performance', 'optimization',
             'difficult', 'debugging', 'strategy', 'pattern', 'multi-system'],
    level5: ['critical', 'database migration', 'schema change', 'cross-cutting',
             'pipeline', 'deployment', 'scalability', 'fundamental']
  };

  /**
   * assessComplexity(context) -> number (1-5)
   * Analyze task description to estimate complexity score.
   */
  function assessComplexity(context) {
    if (!context) return 3;
    var lower = context.toLowerCase();
    var totalScore = 0;

    // Count keyword matches per level, weighted
    totalScore += countMatches(lower, COMPLEXITY_MAP.level1) * 1.0;
    totalScore += countMatches(lower, COMPLEXITY_MAP.level2) * 1.5;
    totalScore += countMatches(lower, COMPLEXITY_MAP.level3) * 2.5;
    totalScore += countMatches(lower, COMPLEXITY_MAP.level4) * 3.5;
    totalScore += countMatches(lower, COMPLEXITY_MAP.level5) * 4.5;

    // Find highest matching level
    var maxLevel = 0;
    if (matchAny(lower, COMPLEXITY_MAP.level5)) maxLevel = Math.max(maxLevel, 5);
    if (matchAny(lower, COMPLEXITY_MAP.level4)) maxLevel = Math.max(maxLevel, 4);
    if (matchAny(lower, COMPLEXITY_MAP.level3)) maxLevel = Math.max(maxLevel, 3);
    if (matchAny(lower, COMPLEXITY_MAP.level2)) maxLevel = Math.max(maxLevel, 2);
    if (matchAny(lower, COMPLEXITY_MAP.level1)) maxLevel = Math.max(maxLevel, 1);

    // Weighted score: combine hit density with highest level
    var hitDensity = totalScore / Math.max(lower.split(/\s+/).length, 1);
    var score = Math.max(maxLevel, Math.min(5, Math.round(hitDensity + maxLevel * 0.5)));
    return Math.max(1, Math.min(5, score));
  }

  function countMatches(text, keywords) {
    var count = 0;
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) count++;
    }
    return count;
  }

  function matchAny(text, keywords) {
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * resolve(complexity, affectedModules, context) -> { provider, reason, complexityScore }
   *
   * Primary decision: complexity score
   * Secondary signal: affected modules count
   *
   * @param {number|string} complexity - Explicit score (1-5) or 'low'/'medium'/'high'
   * @param {number} affectedModules - Number of modules affected (secondary signal)
   * @param {string} context - Task description for keyword analysis
   * @returns {{ provider: string, reason: string, complexityScore: number }}
   */
  function resolve(complexity, affectedModules, context) {
    var score;
    var scoreReason = '';

    // Determine complexity score
    if (typeof complexity === 'number') {
      score = Math.max(1, Math.min(5, Math.round(complexity)));
      scoreReason = 'Explicit score ' + score + '/5';
    } else if (typeof complexity === 'string') {
      switch (complexity.toLowerCase()) {
        case 'low': case 'easy': score = 2; scoreReason = 'Low complexity'; break;
        case 'medium': case 'moderate': score = 3; scoreReason = 'Medium complexity'; break;
        case 'high': case 'hard': case 'very hard': score = 4; scoreReason = 'High complexity'; break;
        default: score = assessComplexity(context || complexity);
      }
    } else if (context) {
      score = assessComplexity(context);
      scoreReason = 'Estimated score ' + score + '/5 from context';
    } else {
      score = 3;
      scoreReason = 'Default score 3/5';
    }

    // Primary decision: complexity score
    if (score >= 4) {
      return {
        provider: ADVANCED_PROVIDER,
        reason: scoreReason + ' — needs Claude Code',
        complexityScore: score
      };
    }

    if (score <= 2) {
      return {
        provider: DEFAULT_PROVIDER,
        reason: scoreReason + ' — suitable for DeepSeek',
        complexityScore: score
      };
    }

    // Score 3: medium complexity — affected modules as tiebreaker
    if (affectedModules >= 2) {
      return {
        provider: ADVANCED_PROVIDER,
        reason: scoreReason + ' + ' + affectedModules + ' modules — Claude Code recommended',
        complexityScore: score
      };
    }

    return {
      provider: DEFAULT_PROVIDER,
      reason: scoreReason + ' — DeepSeek default. Claude if low confidence.',
      complexityScore: score
    };
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
    assessComplexity: assessComplexity,
    DEFAULT_PROVIDER: DEFAULT_PROVIDER,
    ADVANCED_PROVIDER: ADVANCED_PROVIDER,
    CONTENT_PROVIDER: CONTENT_PROVIDER
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodingRouter;
}
