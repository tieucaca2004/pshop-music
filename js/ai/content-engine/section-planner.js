/**
 * Content Section Planner — Page Outline with Auto Depth
 * =======================================================
 * Generates a structured page outline based on Product Knowledge Model.
 * Determines section count, hierarchy, reading flow, and content depth
 * automatically based on price, complexity, features, and target audience.
 */

const ContentSectionPlanner = (function () {
  var SECTION_TYPES = {
    HERO:        'hero',
    OVERVIEW:    'quick_overview',
    GALLERY:     'product_gallery',
    INTRO:       'product_introduction',
    FEATURES:    'core_features',
    DESIGN:      'design_build_quality',
    CONNECTIVITY:'connectivity',
    WORKFLOW:    'real_world_workflow',
    PERFORMANCE: 'performance_analysis',
    COMPARISON:  'comparison',
    SPECS:       'specifications',
    TUTORIALS:   'tutorials',
    FAQ:         'faq',
    VIDEOS:      'videos',
    DOWNLOADS:   'downloads',
    REVIEWS:     'customer_reviews',
    BUYING:      'buying_advice',
    SEO:         'seo',
    CONCLUSION:  'conclusion'
  };

  var BASE_SECTIONS = [
    SECTION_TYPES.HERO,
    SECTION_TYPES.OVERVIEW,
    SECTION_TYPES.GALLERY,
    SECTION_TYPES.INTRO,
    SECTION_TYPES.FEATURES,
    SECTION_TYPES.DESIGN,
    SECTION_TYPES.CONNECTIVITY,
    SECTION_TYPES.SPECS,
    SECTION_TYPES.VIDEOS,
    SECTION_TYPES.DOWNLOADS,
    SECTION_TYPES.SEO,
    SECTION_TYPES.CONCLUSION
  ];

  var OPTIONAL_SECTIONS = [
    SECTION_TYPES.WORKFLOW,
    SECTION_TYPES.PERFORMANCE,
    SECTION_TYPES.COMPARISON,
    SECTION_TYPES.TUTORIALS,
    SECTION_TYPES.FAQ,
    SECTION_TYPES.REVIEWS,
    SECTION_TYPES.BUYING
  ];

  /**
   * planPage(knowledgeModel) — Generate a complete page plan.
   *
   * Returns {
   *   outline: [ { sectionId, sectionType, title, depth, estimatedWords } ],
   *   contentDepth: { level, wordRange, featureDepth, comparisonCount },
   *   readingFlow: [ "section_id", ... ],
   *   estimatedTotalWords: number,
   *   metadata: { planVersion, generatedAt }
   * }
   */
  function planPage(knowledgeModel) {
    if (!knowledgeModel) {
      return minimalPlan();
    }

    var product = knowledgeModel.product || {};
    var classification = knowledgeModel.classification || {};
    var specs = knowledgeModel.specifications || [];
    var features = knowledgeModel.features || [];
    var images = knowledgeModel.images || [];
    var priceTier = classification.priceTier || {};

    // Determine content depth
    var depth = determineDepth(classification, features.length, specs.length);

    // Select sections based on depth
    var outline = buildOutline(depth, product, classification, features, images);

    // Build reading flow
    var readingFlow = outline.map(function (s) { return s.sectionId; });

    // Estimate total words
    var estimatedTotalWords = outline.reduce(function (sum, s) { return sum + s.estimatedWords; }, 0);

    return {
      outline: outline,
      contentDepth: depth,
      readingFlow: readingFlow,
      estimatedTotalWords: estimatedTotalWords,
      metadata: {
        planVersion: '2.0',
        generatedAt: Date.now(),
        sectionsCount: outline.length,
        featuresAnalyzed: features.length,
        specsAnalyzed: specs.length
      }
    };
  }

  /* ─── Depth Determination ─── */

  function determineDepth(classification, featureCount, specCount) {
    var priceTier = classification.priceTier ? (classification.priceTier.value || '') : '';
    var complexity = classification.complexity ? (classification.complexity.value || '') : '';
    var audience = classification.targetAudience ? (classification.targetAudience.value || []) : [];

    var level = 1;  // 1=brief, 2=standard, 3=comprehensive, 4=encyclopedic
    var wordRange = [800, 1500];
    var featureDepth = 'brief';
    var comparisonCount = 1;

    // Price tier
    if (priceTier === 'high-end') { level += 2; wordRange = [4000, 8000]; comparisonCount = 3; featureDepth = 'detailed'; }
    else if (priceTier === 'mid-range') { level += 1; wordRange = [2000, 5000]; comparisonCount = 2; featureDepth = 'detailed'; }

    // Complexity
    if (complexity === 'complex') { level += 1; wordRange = [wordRange[0] + 1000, wordRange[1] + 3000]; }

    // Audience
    if (audience.indexOf('professional') !== -1) { level += 1; featureDepth = 'expert'; }
    if (audience.indexOf('beginner') !== -1) { level = Math.max(level, 2); }

    // Feature & spec count boost
    if (featureCount > 5) { level += 1; featureDepth = 'detailed'; }
    if (specCount > 10) { level += 1; }

    // Clamp
    level = Math.min(Math.max(level, 1), 4);

    return {
      level: level,
      label: level === 1 ? 'brief' : level === 2 ? 'standard' : level === 3 ? 'comprehensive' : 'encyclopedic',
      wordRange: wordRange,
      featureDepth: featureDepth,
      comparisonCount: comparisonCount
    };
  }

  /* ─── Outline Builder ─── */

  function buildOutline(depth, product, classification, features, images) {
    var outline = [];
    var level = depth.level;
    var hasImages = images.length > 0;
    var productName = (product.name && product.name.value) || 'Product';
    var hasFeatures = features.length > 1;

    /* ─── Core sections (always included) ─── */

    // 1. Hero
    outline.push(makeSection(SECTION_TYPES.HERO, 'Hero: ' + productName, 'h1', 0, 100, level));

    // 2. Quick Overview (always present)
    outline.push(makeSection(SECTION_TYPES.OVERVIEW, 'Tổng Quan Nhanh', 'h2', 1, 300, level));

    // 3. Product Gallery (only if images exist)
    if (hasImages && level >= 2) {
      outline.push(makeSection(SECTION_TYPES.GALLERY, 'Thư Viện Hình Ảnh', 'h2', 2, hasImages ? 150 * images.length : 200, level));
    }

    // 4. Product Introduction (level 2+)
    if (level >= 2) {
      outline.push(makeSection(SECTION_TYPES.INTRO, 'Giới Thiệu Sản Phẩm', 'h2', 3, 400 + (level * 150), level));
    }

    /* ─── Feature sections (depends on feature count and depth) ─── */
    var featureWordsPer = 250;
    if (depth.featureDepth === 'detailed') featureWordsPer = 600;
    if (depth.featureDepth === 'expert') featureWordsPer = 800;

    if (hasFeatures) {
      outline.push({
        sectionId: SECTION_TYPES.FEATURES,
        sectionType: SECTION_TYPES.FEATURES,
        sectionTitle: 'Tính Năng Cốt Lõi',
        seoHeading: 'h2',
        order: 4,
        estimatedWords: Math.min(features.length * featureWordsPer, 8000),
        subSections: features.map(function (f, i) {
          return {
            featureId: 'feature-' + (i + 1),
            featureTitle: typeof f === 'string' ? f : f.feature || 'Tính năng ' + (i + 1),
            estimatedWords: featureWordsPer
          };
        })
      });
    }

    /* ─── Design section ─── */
    var designOrder = outline.length;
    outline.push(makeSection(SECTION_TYPES.DESIGN, 'Thiết Kế & Chất Lượng Hoàn Thiện', 'h2', designOrder, 400 + (level * 100), level));

    /* ─── Connectivity section ─── */
    var connOrder = outline.length;
    outline.push(makeSection(SECTION_TYPES.CONNECTIVITY, 'Kết Nối & Cổng Giao Tiếp', 'h2', connOrder, 350 + (level * 80), level));

    /* ─── Optional sections based on level ─── */
    var order = outline.length;

    if (level >= 3) {
      // Workflow
      outline.push(makeSection(SECTION_TYPES.WORKFLOW, 'Workflow Thực Tế', 'h2', order++, 600 + (level * 150), level));

      // Performance analysis
      outline.push(makeSection(SECTION_TYPES.PERFORMANCE, 'Phân Tích Hiệu Năng', 'h2', order++, 500 + (level * 100), level));

      // Comparison
      outline.push(makeSection(SECTION_TYPES.COMPARISON, 'So Sánh Đối Thủ', 'h2', order++, 800 + (level * 200), level));

      // Tutorials
      outline.push(makeSection(SECTION_TYPES.TUTORIALS, 'Hướng Dẫn Sử Dụng', 'h2', order++, 800 + (level * 200), level));

      // FAQ
      outline.push(makeSection(SECTION_TYPES.FAQ, 'Câu Hỏi Thường Gặp', 'h2', order++, 1000 + (level * 200), level));
    }

    if (level >= 2) {
      // Specs
      outline.push(makeSection(SECTION_TYPES.SPECS, 'Thông Số Kỹ Thuật', 'h2', order++, 500 + (level * 50), level));

      // Videos
      outline.push(makeSection(SECTION_TYPES.VIDEOS, 'Video', 'h2', order++, 300, level));

      // Downloads
      outline.push(makeSection(SECTION_TYPES.DOWNLOADS, 'Tải Về', 'h2', order++, 200, level));

      // Reviews
      outline.push(makeSection(SECTION_TYPES.REVIEWS, 'Đánh Giá Khách Hàng', 'h2', order++, 400 + (level * 100), level));

      // Buying advice
      outline.push(makeSection(SECTION_TYPES.BUYING, 'Lời Khuyên Mua Hàng', 'h2', order++, 500 + (level * 150), level));
    }

    // SEO (always included, small)
    outline.push(makeSection(SECTION_TYPES.SEO, 'SEO', 'h2', order++, 200, level));

    // Conclusion
    outline.push(makeSection(SECTION_TYPES.CONCLUSION, 'Kết Luận', 'h2', order++, 300 + (level * 100), level));

    return outline;
  }

  function makeSection(type, title, seoHeading, order, words, level) {
    return {
      sectionId: type,
      sectionType: type,
      sectionTitle: title,
      seoHeading: seoHeading,
      order: order,
      estimatedWords: words
    };
  }

  function minimalPlan() {
    return {
      outline: [
        makeSection('hero', 'Product', 'h1', 0, 100, 1),
        makeSection('quick_overview', 'Overview', 'h2', 1, 200, 1),
        makeSection('seo', 'SEO', 'h2', 2, 100, 1),
        makeSection('conclusion', 'Conclusion', 'h2', 3, 100, 1)
      ],
      contentDepth: { level: 1, label: 'brief', wordRange: [400, 800], featureDepth: 'brief', comparisonCount: 0 },
      readingFlow: ['hero', 'quick_overview', 'seo', 'conclusion'],
      estimatedTotalWords: 500,
      metadata: { planVersion: '2.0', generatedAt: Date.now(), sectionsCount: 4, featuresAnalyzed: 0, specsAnalyzed: 0 }
    };
  }

  /* ─── Public API ─── */

  return {
    planPage: planPage,
    SECTION_TYPES: SECTION_TYPES,
    BASE_SECTIONS: BASE_SECTIONS,
    OPTIONAL_SECTIONS: OPTIONAL_SECTIONS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentSectionPlanner: ContentSectionPlanner };
}
