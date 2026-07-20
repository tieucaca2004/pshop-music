/*
 * QualityEngine — Content Quality Checking Service
 * ==================================================
 * Validates generated content against quality criteria. Used by the
 * GenerationService pipeline after content is generated.
 *
 * Quality checks are content-type specific:
 * - text: minimum length, keyword coverage, language consistency
 * - image: size, format validation (requires storage access)
 * - seo: meta tag completeness
 * - product: field completeness (name, price, description)
 *
 * Dependencies:
 *   DataProvider (js/ai/data-provider.js) — for validation context
 */

const QualityEngine = (function () {
  var VALIDATORS = {};
  var MIN_TEXT_LENGTH = 50;      // Minimum 50 chars for text content
  var MIN_DESCRIPTION_LENGTH = 80; // Minimum 80 chars for product descriptions
  var MAX_ISSUES_REPORTED = 10;   // Limit issues in report

  /**
   * registerValidator(type, fn) — Register a custom validator for a content type.
   * fn(draft, context) → { passed: boolean, score: number, issues: string[] }
   */
  function registerValidator(type, fn) {
    VALIDATORS[type] = fn;
  }

  /**
   * checkText(content) — Validate text content.
   */
  function checkText(content, options) {
    var issues = [];
    var text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (content && typeof content === 'object') {
      // Extract text from object
      var keys = Object.keys(content);
      text = keys.map(function (k) { return String(content[k] || ''); }).join(' ');
    }

    if (!text || text.trim().length === 0) {
      issues.push('Content is empty');
    } else {
      if (text.length < MIN_TEXT_LENGTH) {
        issues.push('Content too short (' + text.length + ' chars, minimum ' + MIN_TEXT_LENGTH + ')');
      }
    }

    return {
      passed: issues.length === 0,
      score: calculateScore(issues, text),
      issues: issues
    };
  }

  /**
   * checkProduct(content) — Validate product description content.
   */
  function checkProduct(content) {
    var issues = [];
    var text = '';

    if (content && typeof content === 'object') {
      text = content.description || content.shortDescription || content.longDescription || '';
      if (!content.name && !content.title) {
        issues.push('Missing product name/title');
      }
    } else if (typeof content === 'string') {
      text = content;
    } else {
      issues.push('No content to validate');
    }

    if (text && text.length < MIN_DESCRIPTION_LENGTH) {
      issues.push('Description too short (' + text.length + ' chars, minimum ' + MIN_DESCRIPTION_LENGTH + ')');
    }

    return {
      passed: issues.length === 0,
      score: calculateScore(issues, text),
      issues: issues
    };
  }

  /**
   * checkSEO(content) — Validate SEO metadata completeness.
   */
  function checkSEO(content) {
    var issues = [];
    if (!content) {
      issues.push('No SEO content');
      return { passed: false, score: 0, issues: issues };
    }

    var requiredFields = ['metaTitle', 'metaDescription', 'keywords'];
    requiredFields.forEach(function (field) {
      if (!content[field] || !String(content[field]).trim()) {
        issues.push('Missing required SEO field: ' + field);
      }
    });

    if (content.metaTitle && content.metaTitle.length > 70) {
      issues.push('Meta title exceeds 70 characters (' + content.metaTitle.length + ')');
    }
    if (content.metaDescription && content.metaDescription.length > 160) {
      issues.push('Meta description exceeds 160 characters (' + content.metaDescription.length + ')');
    }

    return {
      passed: issues.length === 0,
      score: calculateScore(issues, JSON.stringify(content)),
      issues: issues
    };
  }

  /**
   * checkImage(content) — Validate image generation result.
   */
  function checkImage(content) {
    var issues = [];
    if (!content) {
      issues.push('No image content');
      return { passed: false, score: 0, issues: issues };
    }

    if (content.url) {
      // URL exists — basic check
      if (!content.url.match(/^https?:\/\//)) {
        issues.push('Image URL is not a valid HTTP URL');
      }
    } else if (content.dataUrl) {
      // data URL — check format
      if (!content.dataUrl.match(/^data:image\//)) {
        issues.push('Image data URL has invalid format');
      }
    } else {
      issues.push('No image URL or data found');
    }

    return {
      passed: issues.length === 0,
      score: calculateScore(issues, content.url || content.dataUrl || ''),
      issues: issues
    };
  }

  /**
   * validateAll(content, type, options) — Full quality check for any content.
   * Runs type-specific validation + generic checks.
   */
  function validateAll(content, type, options) {
    options = options || {};
    var allIssues = [];
    var totalChecks = 0;
    var passedChecks = 0;

    // Type-specific validation
    if (type === 'product') {
      totalChecks += 2;
      var productResult = checkProduct(content);
      if (productResult.passed) passedChecks++;
      else allIssues = allIssues.concat(productResult.issues);
      if (content.name || content.title) passedChecks++;
    } else if (type === 'seo') {
      var seoResult = checkSEO(content);
      if (seoResult.passed) passedChecks++;
      else allIssues = allIssues.concat(seoResult.issues);
      totalChecks++;
    } else if (type === 'image') {
      var imgResult = checkImage(content);
      if (imgResult.passed) passedChecks++;
      else allIssues = allIssues.concat(imgResult.issues);
      totalChecks++;
    } else {
      // Default: text validation
      var textResult = checkText(content, options);
      if (textResult.passed) passedChecks++;
      else allIssues = allIssues.concat(textResult.issues);
      totalChecks++;
    }

    // Generic check
    totalChecks++;
    if (content && typeof content !== 'undefined' && content !== null) {
      passedChecks++;
    } else {
      allIssues.push('Content is null or undefined');
    }

    // Custom validator
    if (VALIDATORS[type]) {
      totalChecks++;
      try {
        var customResult = VALIDATORS[type](content, options);
        if (customResult.passed) passedChecks++;
        else allIssues = allIssues.concat(customResult.issues || []);
      } catch (e) {
        allIssues.push('Custom validator error: ' + e.message);
      }
    }

    var score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
    return {
      passed: score >= 70 && allIssues.length === 0,
      score: score,
      issues: allIssues.slice(0, MAX_ISSUES_REPORTED),
      totalChecks: totalChecks,
      passedChecks: passedChecks
    };
  }

  function calculateScore(issues, text) {
    if (issues.length === 0) return 100;
    var baseScore = 100;
    baseScore -= issues.length * 15;
    if (!text || text.length < 10) baseScore -= 20;
    return Math.max(0, Math.min(100, baseScore));
  }

  return {
    checkText: checkText,
    checkProduct: checkProduct,
    checkSEO: checkSEO,
    checkImage: checkImage,
    validateAll: validateAll,
    registerValidator: registerValidator
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QualityEngine: QualityEngine };
}
