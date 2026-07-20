/**
 * Publication Readiness — Quality Gate Scoring Engine
 * =====================================================
 * Evaluates generated content against 12 criteria before returning output.
 *
 * Each criterion scores 0-100. Overall score is weighted average.
 * Threshold: 95/100 — if below, generates improvement tasks and retries.
 *
 * Criteria:
 *   SEO completeness
 *   Content completeness
 *   Image coverage
 *   Video coverage
 *   Comparison quality
 *   Tutorial quality
 *   FAQ quality
 *   Accessibility
 *   Schema completeness
 *   Internal links
 *   External references
 *   Evidence quality (new: links claims to sources)
 */

const ContentPublicationReadiness = (function () {
  /* ─── Weights for each criterion ─── */
  var CRITERIA_WEIGHTS = {
    seo:              15,
    content:          20,
    images:           10,
    videos:           5,
    comparison:       8,
    tutorials:        8,
    faq:              8,
    accessibility:    5,
    schema:           10,
    internalLinks:    3,
    externalRefs:     3,
    evidence:         5
  };

  var THRESHOLD = 95;   // Must score >= 95 to pass
  var MAX_SCORE  = 100;

  /**
   * evaluate(generatedOutput) — Score the generated content.
   *
   * generatedOutput = CMS block structure from ContentCmsBlockGenerator
   *
   * Returns {
   *   overallScore: 0-100,
   *   passed: boolean,
   *   criteria: { name, score, weight, findings, passed }[],
   *   improvements: [ "Improvement task", ... ],
   *   details: { totalWeight, weightedScore, rawScore }
   * }
   */
  function evaluate(generatedOutput) {
    if (!generatedOutput) {
      return failedResult('No output provided');
    }

    var output = generatedOutput;
    var sections = output.sections || [];
    var images = output.images || [];
    var videos = output.videos || [];
    var seo = output.seo || {};
    var evidence = output.evidence || [];
    var pagePlan = output.pagePlan || {};

    var criteria = [];

    // 1. SEO completeness
    criteria.push(evaluateSEO(seo, sections));

    // 2. Content completeness
    criteria.push(evaluateContent(sections, pagePlan));

    // 3. Image coverage
    criteria.push(evaluateImages(images, sections));

    // 4. Video coverage
    criteria.push(evaluateVideos(videos));

    // 5. Comparison quality
    criteria.push(evaluateComparison(sections));

    // 6. Tutorial quality
    criteria.push(evaluateTutorials(sections));

    // 7. FAQ quality
    criteria.push(evaluateFAQ(sections));

    // 8. Accessibility
    criteria.push(evaluateAccessibility(sections, images));

    // 9. Schema completeness
    criteria.push(evaluateSchema(seo));

    // 10. Internal links
    criteria.push(evaluateInternalLinks(sections, seo));

    // 11. External references
    criteria.push(evaluateExternalRefs(sections, seo));

    // 12. Evidence quality
    criteria.push(evaluateEvidence(evidence));

    // Calculate weighted score
    var totalWeight = 0;
    var weightedScore = 0;

    criteria.forEach(function (c) {
      var weight = CRITERIA_WEIGHTS[c.id] || 5;
      totalWeight += weight;
      weightedScore += c.score * weight;
    });

    var overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    // Generate improvement tasks for low-scoring criteria
    var improvements = [];
    criteria.forEach(function (c) {
      if (c.score < 70) {
        c.findings.forEach(function (f) { improvements.push(f); });
      }
    });

    // Build details
    var passedCriteria = criteria.filter(function (c) { return c.passed; }).length;

    return {
      overallScore: overallScore,
      passed: overallScore >= THRESHOLD,
      criteria: criteria,
      improvements: improvements,
      details: {
        totalWeight: totalWeight,
        weightedScore: weightedScore,
        rawScore: overallScore,
        criteriaPassed: passedCriteria + '/' + criteria.length,
        meetsThreshold: overallScore >= THRESHOLD
      }
    };
  }

  /* ─── Individual Criteria Evaluators ─── */

  function evaluateSEO(seo) {
    var score = 0;
    var findings = [];
    var checks = [];

    // Meta title
    if (seo.metaTitle && seo.metaTitle.length > 10) {
      score += 15;
      checks.push('meta_title: OK (' + seo.metaTitle.length + ' chars)');
    } else {
      findings.push('[SEO] Meta title missing or too short');
    }

    // Meta description
    if (seo.metaDescription && seo.metaDescription.length > 50) {
      score += 15;
      checks.push('meta_description: OK');
    } else {
      findings.push('[SEO] Meta description missing or too short');
    }

    // Slug
    if (seo.metaSlug && seo.metaSlug.length > 3) {
      score += 10;
      checks.push('slug: OK');
    } else {
      findings.push('[SEO] Slug missing');
    }

    // OG tags
    if (seo.ogTitle) { score += 10; checks.push('og_title: OK'); }
    else { findings.push('[SEO] OG title missing'); }

    if (seo.ogDescription) { score += 10; checks.push('og_description: OK'); }
    else { findings.push('[SEO] OG description missing'); }

    // Keywords
    if (seo.keywords && seo.keywords.length >= 5) {
      score += 15;
      checks.push('keywords: ' + seo.keywords.length + ' keywords');
    } else {
      findings.push('[SEO] Less than 5 keywords');
    }

    // Breadcrumb
    if (seo.breadcrumb && seo.breadcrumb.length >= 2) {
      score += 10;
      checks.push('breadcrumb: OK');
    } else {
      findings.push('[SEO] Breadcrumb missing');
    }

    // Schema
    if (seo.schema && seo.schema['@type']) {
      score += 15;
      checks.push('schema: ' + seo.schema['@type']);
    } else {
      findings.push('[SEO] Schema.org missing');
    }

    return {
      id: 'seo',
      name: 'SEO completeness',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 70,
      checks: checks
    };
  }

  function evaluateContent(sections, pagePlan) {
    var score = 0;
    var findings = [];
    var sectionCount = sections.length;
    var expectedCount = (pagePlan.sectionCount || 8);

    // Section count
    if (sectionCount >= expectedCount) { score += 30; }
    else if (sectionCount >= 5) { score += 20; findings.push('[Content] Only ' + sectionCount + '/' + expectedCount + ' sections'); }
    else { findings.push('[Content] Too few sections: ' + sectionCount); }

    // Has essential sections
    var sectionTypes = sections.map(function (s) { return s.sectionType; });
    if (sectionTypes.indexOf('hero') !== -1) score += 10;
    else findings.push('[Content] Missing hero section');

    if (sectionTypes.indexOf('core_features') !== -1) score += 15;
    else findings.push('[Content] Missing core features section');

    if (sectionTypes.indexOf('specifications') !== -1) score += 10;
    else findings.push('[Content] Missing specifications');

    if (sectionTypes.indexOf('seo') !== -1) score += 10;

    // Content quality
    var hasContent = sections.some(function (s) {
      return s.content && (s.content.body || (s.content.paragraphs && s.content.paragraphs.length > 0));
    });
    if (hasContent) score += 15;
    else findings.push('[Content] Most sections have no body content');

    // Feature sections
    var hasFeatures = sections.some(function (s) { return s.features && s.features.length > 0; });
    if (hasFeatures) score += 10;

    return {
      id: 'content',
      name: 'Content completeness',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 70
    };
  }

  function evaluateImages(images, sections) {
    var score = 0;
    var findings = [];

    // Total images
    if (images.length >= 3) { score += 25; }
    else if (images.length >= 1) { score += 10; findings.push('[Images] Only ' + images.length + ' images, need 3+'); }
    else { findings.push('[Images] No images provided'); }

    // Image quality
    var hasAltText = images.every(function (img) { return img.altText && img.altText.length > 5; });
    if (hasAltText) score += 20;

    // Hero image
    var hasHero = images.some(function (img) { return img.purpose === 'product_hero' || img.imageId === 'hero-main'; });
    if (hasHero) score += 20;
    else findings.push('[Images] No hero image');

    // Gallery images
    var hasGallery = images.some(function (img) { return img.purpose === 'gallery'; });
    if (hasGallery) score += 15;

    // Image prompts
    var hasPrompts = images.some(function (img) { return img.prompt && img.prompt.length > 10; });
    if (hasPrompts) score += 10;
    else findings.push('[Images] AI image prompts missing');

    // Coverage per section
    var sectionsWithImages = sections.filter(function (s) {
      return s.imageSlots && s.imageSlots.length > 0;
    }).length;
    if (sectionsWithImages > 0) score += 10;

    return {
      id: 'images',
      name: 'Image coverage',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 60
    };
  }

  function evaluateVideos(videos) {
    var score = 0;
    var findings = [];

    if (videos.length >= 2) { score += 40; }
    else if (videos.length === 1) { score += 20; findings.push('[Videos] Only 1 video, need 2+'); }
    else { findings.push('[Videos] No videos'); }

    var hasEmbedId = videos.some(function (v) { return v.embedId; });
    if (hasEmbedId) score += 30;

    var hasDescription = videos.every(function (v) { return v.description && v.description.length > 10; });
    if (hasDescription) score += 30;

    return {
      id: 'videos',
      name: 'Video coverage',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  function evaluateComparison(sections) {
    var score = 0;
    var findings = [];

    var comparisonSection = sections.filter(function (s) { return s.sectionType === 'comparison'; });
    var hasComparison = comparisonSection.length > 0;

    if (hasComparison) { score += 30; }
    else { findings.push('[Comparison] No comparison section'); return { id: 'comparison', name: 'Comparison quality', score: 0, findings: findings, passed: false }; }

    var comparison = comparisonSection[0];

    if (comparison.comparisonTable && comparison.comparisonTable.rows && comparison.comparisonTable.rows.length > 0) {
      score += 40;
    } else {
      findings.push('[Comparison] Comparison table has no rows');
    }

    return {
      id: 'comparison',
      name: 'Comparison quality',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  function evaluateTutorials(sections) {
    var score = 0;
    var findings = [];

    var tutorialSection = sections.filter(function (s) { return s.sectionType === 'tutorials'; });
    var hasTutorials = tutorialSection.length > 0;

    if (hasTutorials) { score += 30; }
    else { findings.push('[Tutorials] No tutorials'); return { id: 'tutorials', name: 'Tutorial quality', score: 0, findings: findings, passed: false }; }

    var tutorials = tutorialSection[0];
    if (tutorials.tutorials && tutorials.tutorials.length >= 2) {
      score += 40;
    } else {
      findings.push('[Tutorials] Less than 2 tutorials');
    }

    var hasSteps = tutorials.tutorials && tutorials.tutorials.some(function (t) { return t.steps && t.steps.length > 2; });
    if (hasSteps) score += 30;

    return {
      id: 'tutorials',
      name: 'Tutorial quality',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  function evaluateFAQ(sections) {
    var score = 0;
    var findings = [];

    var faqSection = sections.filter(function (s) { return s.sectionType === 'faq'; });
    var hasFAQ = faqSection.length > 0;

    if (hasFAQ) { score += 20; }
    else { findings.push('[FAQ] No FAQ section'); return { id: 'faq', name: 'FAQ quality', score: 0, findings: findings, passed: false }; }

    var faq = faqSection[0];
    if (faq.questions && faq.questions.length >= 10) {
      score += 50;
    } else if (faq.questions && faq.questions.length >= 5) {
      score += 30;
      findings.push('[FAQ] Only ' + faq.questions.length + ' questions, need 10+');
    } else {
      findings.push('[FAQ] Too few questions');
    }

    var hasDetail = faq.questions && faq.questions.every(function (q) { return q.a && q.a.length > 30; });
    if (hasDetail) score += 30;

    return {
      id: 'faq',
      name: 'FAQ quality',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 60
    };
  }

  function evaluateAccessibility(sections, images) {
    var score = 50; // start at mid
    var findings = [];

    // Alt text on all images
    var allImagesHaveAlt = images.every(function (img) {
      return img.altText && img.altText.length > 3;
    });
    if (allImagesHaveAlt) score += 25;
    else findings.push('[Accessibility] Some images missing alt text');

    // Proper heading hierarchy
    var headings = sections.map(function (s) { return s.seoHeading; }).filter(Boolean);
    var hasH1 = headings.indexOf('h1') !== -1;
    if (hasH1) score += 15;
    else findings.push('[Accessibility] No h1 heading');

    var hasH2 = headings.some(function (h) { return h === 'h2' || h === 'h3'; });
    if (hasH2) score += 10;

    return {
      id: 'accessibility',
      name: 'Accessibility',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 60
    };
  }

  function evaluateSchema(seo) {
    var score = 0;
    var findings = [];

    if (!seo.schema) {
      findings.push('[Schema] No schema.org data');
      return { id: 'schema', name: 'Schema completeness', score: 0, findings: findings, passed: false };
    }

    var schema = seo.schema;

    if (schema['@type'] && schema['@type'] === 'Product') score += 20;
    else findings.push('[Schema] Wrong or missing @type');

    if (schema.name) score += 20;
    else findings.push('[Schema] Product name missing in schema');

    if (schema.brand) score += 15;

    // Offers
    if (schema.offers) score += 15;
    else findings.push('[Schema] No offers data');

    // Aggregate rating
    if (schema.aggregateRating) score += 15;

    // Breadcrumb schema
    if (seo.breadcrumb && seo.breadcrumb.length >= 2) score += 15;
    else findings.push('[Schema] Breadcrumb missing');

    return {
      id: 'schema',
      name: 'Schema completeness',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 60
    };
  }

  function evaluateInternalLinks(sections, seo) {
    var score = 30; // Default: has structure
    var findings = [];

    if (seo.internalLinks && seo.internalLinks.length >= 3) { score += 40; }
    else if (seo.internalLinks && seo.internalLinks.length >= 1) { score += 20; findings.push('[Links] Only ' + (seo.internalLinks.length || 0) + ' internal links'); }
    else { findings.push('[Links] No internal links'); }

    if (seo.breadcrumb && seo.breadcrumb.length >= 2) score += 30;

    return {
      id: 'internalLinks',
      name: 'Internal links',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  function evaluateExternalRefs(sections, seo) {
    var score = 0;
    var findings = [];

    if (seo.externalReferences && seo.externalReferences.length >= 2) {
      score += 60;
    } else if (seo.externalReferences && seo.externalReferences.length === 1) {
      score += 30;
      findings.push('[References] Only 1 external reference');
    } else {
      findings.push('[References] No external references');
    }

    // Check sections for external links
    var sectionRefs = sections.filter(function (s) {
      return s.externalReferences && s.externalReferences.length > 0;
    }).length;
    if (sectionRefs > 0) score += 40;

    return {
      id: 'externalRefs',
      name: 'External references',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  function evaluateEvidence(evidence) {
    var score = 0;
    var findings = [];

    if (!evidence || evidence.length === 0) {
      findings.push('[Evidence] No evidence data');
      return { id: 'evidence', name: 'Evidence quality', score: 0, findings: findings, passed: false };
    }

    if (evidence.length >= 10) score += 30;
    else if (evidence.length >= 5) score += 15;

    var hasHighConfidence = evidence.some(function (e) { return e.confidence === 'High'; });
    if (hasHighConfidence) score += 20;

    var hasMediumConfidence = evidence.some(function (e) { return e.confidence === 'Medium'; });
    if (hasMediumConfidence) score += 15;

    var hasSources = evidence.some(function (e) { return e.sources && e.sources.length > 0; });
    if (hasSources) score += 20;
    else findings.push('[Evidence] Claims missing source references');

    var hasCategory = evidence.every(function (e) { return e.category; });
    if (hasCategory) score += 15;

    return {
      id: 'evidence',
      name: 'Evidence quality',
      score: Math.min(score, 100),
      findings: findings,
      passed: score >= 50
    };
  }

  /* ─── Helpers ─── */

  function failedResult(reason) {
    return {
      overallScore: 0,
      passed: false,
      criteria: [],
      improvements: ['[CRITICAL] ' + reason],
      details: { totalWeight: 0, weightedScore: 0, rawScore: 0, criteriaPassed: '0/0', meetsThreshold: false }
    };
  }

  /* ─── Public API ─── */

  return {
    evaluate: evaluate,
    THRESHOLD: THRESHOLD,
    MAX_SCORE: MAX_SCORE,
    CRITERIA_WEIGHTS: CRITERIA_WEIGHTS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentPublicationReadiness: ContentPublicationReadiness };
}
