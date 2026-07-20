/**
 * Missing Information — Gap Detector & Task Generator
 * =====================================================
 * Analyzes the Product Knowledge Model and generates tasks for
 * missing information across all content dimensions.
 */

const ContentMissingInfo = (function () {
  /* ─── Gap Categories ─── */
  var GAP_CATEGORIES = {
    IMAGES:          'missing_images',
    VIDEOS:          'missing_videos',
    SPECIFICATIONS:  'missing_specifications',
    MEASUREMENTS:    'missing_measurements',
    COMPATIBILITY:   'missing_compatibility',
    ACCESSORIES:     'missing_accessories',
    TUTORIALS:       'missing_tutorials',
    COMPARISON:      'missing_comparison',
    FAQ:             'missing_faq',
    DOWNLOADS:       'missing_downloads',
    DIAGRAMS:        'missing_diagrams',
    CERTIFICATION:   'missing_certification'
  };

  var SEVERITY_CRITICAL = 'critical';
  var SEVERITY_HIGH     = 'high';
  var SEVERITY_MEDIUM   = 'medium';
  var SEVERITY_LOW      = 'low';

  /**
   * detectGaps(knowledgeModel) — Analyze Knowledge Model for gaps.
   *
   * Returns {
   *   gaps: [ { category, severity, description, task, contexts } ],
   *   summary: { total, critical, high, medium, low },
   *   taskList: [ "task description", ... ]
   * }
   */
  function detectGaps(knowledgeModel) {
    if (!knowledgeModel) {
      return noDataResult();
    }

    var gaps = [];
    var product = knowledgeModel.product || {};
    var classification = knowledgeModel.classification || {};
    var specs = knowledgeModel.specifications || [];
    var features = knowledgeModel.features || [];
    var connectivity = knowledgeModel.connectivity || [];
    var dimensions = knowledgeModel.dimensions || {};
    var images = knowledgeModel.images || [];

    // 1. Missing Images
    gaps = gaps.concat(checkImageGaps(images));

    // 2. Missing Videos
    gaps.push({
      category: GAP_CATEGORIES.VIDEOS,
      severity: SEVERITY_MEDIUM,
      description: 'No product videos',
      task: 'Add at least one product video (official, review, or tutorial)',
      contexts: ['video_embed', 'youtube', 'product_page']
    });

    // 3. Missing Specifications
    gaps = gaps.concat(checkSpecGaps(specs));

    // 4. Missing Measurements
    gaps = gaps.concat(checkMeasurementGaps(dimensions));

    // 5. Missing Compatibility
    gaps = gaps.concat(checkCompatibilityGaps(product, classification));

    // 6. Missing Accessories
    gaps.push({
      category: GAP_CATEGORIES.ACCESSORIES,
      severity: SEVERITY_MEDIUM,
      description: 'No accessory information',
      task: 'List included and recommended accessories',
      contexts: ['accessories_section', 'buying_guide']
    });

    // 7. Missing Tutorials
    gaps.push({
      category: GAP_CATEGORIES.TUTORIALS,
      severity: SEVERITY_MEDIUM,
      description: 'No tutorials or guides',
      task: 'Create beginner setup guide, advanced usage guide, and maintenance tips',
      contexts: ['tutorials_section', 'blog_post']
    });

    // 8. Missing Comparison
    gaps.push({
      category: GAP_CATEGORIES.COMPARISON,
      severity: SEVERITY_HIGH,
      description: 'No product comparison',
      task: 'Compare with at least 2 competing products',
      contexts: ['comparison_table', 'buying_advice']
    });

    // 9. Missing FAQ
    gaps.push({
      category: GAP_CATEGORIES.FAQ,
      severity: SEVERITY_MEDIUM,
      description: 'No frequently asked questions',
      task: 'Create 10-15 professional FAQs covering key concerns',
      contexts: ['faq_section', 'schema_faq']
    });

    // 10. Missing Downloads
    gaps.push({
      category: GAP_CATEGORIES.DOWNLOADS,
      severity: SEVERITY_LOW,
      description: 'No downloads available',
      task: 'Provide links to manual, firmware, software, drivers',
      contexts: ['downloads_section', 'support']
    });

    // 11. Missing Diagrams
    gaps.push({
      category: GAP_CATEGORIES.DIAGRAMS,
      severity: SEVERITY_LOW,
      description: 'No diagrams or connection illustrations',
      task: 'Create connection diagram, port layout diagram, and signal flow diagram',
      contexts: ['connectivity_section', 'tutorials_section']
    });

    // 12. Certification
    if (!specs.some(function (s) { return s.key && s.key.toLowerCase().indexOf('certif') !== -1; })) {
      gaps.push({
        category: GAP_CATEGORIES.CERTIFICATION,
        severity: SEVERITY_LOW,
        description: 'No certification or compliance info',
        task: 'Add certifications (CE, FCC, RoHS, etc.)',
        contexts: ['specifications_section', 'footer']
      });
    }

    // Score severity based on classification
    gaps = scoreGapsByTier(gaps, classification);

    // Generate summary
    var summary = summarizeGaps(gaps);

    // Generate task list
    var taskList = gaps.map(function (g) {
      return '[' + g.severity.toUpperCase() + '] ' + g.description + ': ' + g.task;
    });

    return {
      gaps: gaps,
      summary: summary,
      taskList: taskList
    };
  }

  /* ─── Image Gap Check ─── */

  function checkImageGaps(images) {
    var gaps = [];
    var orientations = {};
    images.forEach(function (img) {
      if (img.analysis && img.analysis.orientation) {
        orientations[img.analysis.orientation.orientation] = true;
      }
    });

    var requiredOrientations = ['front', 'rear', 'angle'];
    requiredOrientations.forEach(function (orient) {
      if (!orientations[orient]) {
        gaps.push({
          category: GAP_CATEGORIES.IMAGES,
          severity: orient === 'front' ? SEVERITY_CRITICAL : SEVERITY_HIGH,
          description: 'Missing ' + orient + ' view image',
          task: 'Upload or generate ' + orient + ' view image of the product',
          contexts: ['gallery', orient + '_view']
        });
      }
    });

    return gaps;
  }

  /* ─── Spec Gap Check ─── */

  function checkSpecGaps(specs) {
    var gaps = [];
    var specKeys = specs.map(function (s) { return (s.key || '').toLowerCase(); });

    var required = [
      { key: 'brand', label: 'Brand', severity: SEVERITY_CRITICAL },
      { key: 'model', label: 'Model number', severity: SEVERITY_CRITICAL },
      { key: 'weight', label: 'Weight', severity: SEVERITY_HIGH },
      { key: 'power', label: 'Power consumption', severity: SEVERITY_MEDIUM },
      { key: 'connectivity', label: 'Connectivity / I/O', severity: SEVERITY_CRITICAL },
      { key: 'dimension', label: 'Dimensions', severity: SEVERITY_HIGH }
    ];

    required.forEach(function (r) {
      var found = specKeys.some(function (k) { return k.indexOf(r.key) !== -1; });
      if (!found) {
        gaps.push({
          category: GAP_CATEGORIES.SPECIFICATIONS,
          severity: r.severity,
          description: 'Missing specification: ' + r.label,
          task: 'Find or verify ' + r.label + ' from official source',
          contexts: ['specifications_table', 'technical_specs']
        });
      }
    });

    return gaps;
  }

  /* ─── Measurement Gap Check ─── */

  function checkMeasurementGaps(dims) {
    var gaps = [];
    if (!dims.weight) {
      gaps.push({
        category: GAP_CATEGORIES.MEASUREMENTS,
        severity: SEVERITY_HIGH,
        description: 'Missing weight information',
        task: 'Add product weight from official specifications',
        contexts: ['specifications', 'shipping_info']
      });
    }
    if (!dims.width || !dims.depth || !dims.height) {
      gaps.push({
        category: GAP_CATEGORIES.MEASUREMENTS,
        severity: SEVERITY_HIGH,
        description: 'Missing dimensions (width/depth/height)',
        task: 'Add product dimensions from official specifications',
        contexts: ['specifications', 'shipping_info']
      });
    }
    return gaps;
  }

  /* ─── Compatibility Gap Check ─── */

  function checkCompatibilityGaps(product, classification) {
    var gaps = [];
    var productName = (product.name && product.name.value) || '';
    var nameLower = productName.toLowerCase();

    if (nameLower.indexOf('dj') !== -1 || nameLower.indexOf('controller') !== -1) {
      gaps.push({
        category: GAP_CATEGORIES.COMPATIBILITY,
        severity: SEVERITY_HIGH,
        description: 'Missing software compatibility info',
        task: 'List compatible DJ software (rekordbox, Serato, Traktor, etc.)',
        contexts: ['compatibility_section', 'specifications']
      });
      gaps.push({
        category: GAP_CATEGORIES.COMPATIBILITY,
        severity: SEVERITY_HIGH,
        description: 'Missing operating system compatibility',
        task: 'List compatible OS (Windows, macOS, iOS, Android)',
        contexts: ['compatibility_section', 'specifications']
      });
    }

    return gaps;
  }

  /* ─── Severity Scoring by Product Tier ─── */

  function scoreGapsByTier(gaps, classification) {
    var tier = classification.priceTier ? (classification.priceTier.value || '') : '';

    // For high-end products, all gaps are more severe
    if (tier === 'high-end') {
      return gaps.map(function (g) {
        if (g.severity === SEVERITY_LOW) return Object.assign({}, g, { severity: SEVERITY_MEDIUM });
        if (g.severity === SEVERITY_MEDIUM) return Object.assign({}, g, { severity: SEVERITY_HIGH });
        return g;
      });
    }

    return gaps;
  }

  /* ─── Summary ─── */

  function summarizeGaps(gaps) {
    var total = gaps.length;
    var bySeverity = {};
    bySeverity[SEVERITY_CRITICAL] = 0;
    bySeverity[SEVERITY_HIGH] = 0;
    bySeverity[SEVERITY_MEDIUM] = 0;
    bySeverity[SEVERITY_LOW] = 0;

    gaps.forEach(function (g) {
      bySeverity[g.severity] = (bySeverity[g.severity] || 0) + 1;
    });

    return {
      total: total,
      critical: bySeverity[SEVERITY_CRITICAL],
      high: bySeverity[SEVERITY_HIGH],
      medium: bySeverity[SEVERITY_MEDIUM],
      low: bySeverity[SEVERITY_LOW],
      readinessScore: calculateReadiness(gaps)
    };
  }

  function calculateReadiness(gaps) {
    var score = 100;
    gaps.forEach(function (g) {
      if (g.severity === SEVERITY_CRITICAL) score -= 15;
      if (g.severity === SEVERITY_HIGH) score -= 8;
      if (g.severity === SEVERITY_MEDIUM) score -= 4;
      if (g.severity === SEVERITY_LOW) score -= 1;
    });
    return Math.max(0, score);
  }

  function noDataResult() {
    return {
      gaps: [
        {
          category: GAP_CATEGORIES.SPECIFICATIONS,
          severity: SEVERITY_CRITICAL,
          description: 'No product data provided',
          task: 'Provide product name, brand, specifications or existing content',
          contexts: ['source_intelligence']
        }
      ],
      summary: { total: 1, critical: 1, high: 0, medium: 0, low: 0, readinessScore: 85 },
      taskList: ['[CRITICAL] No product data provided: Provide product name, brand, specifications or existing content']
    };
  }

  /* ─── Public API ─── */

  return {
    detectGaps: detectGaps,
    GAP_CATEGORIES: GAP_CATEGORIES,
    SEVERITY_CRITICAL: SEVERITY_CRITICAL,
    SEVERITY_HIGH: SEVERITY_HIGH,
    SEVERITY_MEDIUM: SEVERITY_MEDIUM,
    SEVERITY_LOW: SEVERITY_LOW
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentMissingInfo: ContentMissingInfo };
}
