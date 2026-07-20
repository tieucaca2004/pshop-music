/**
 * CMS Block Generator — Structured JSON CMS Block Output (V2)
 * ============================================================
 * Transforms Product Knowledge Model + Section Plan into structured
 * CMS blocks. CMS handles presentation — this generates data only.
 *
 * Every block is reusable, self-contained, and contains evidence-linked
 * content for each section.
 */

const ContentCmsBlockGenerator = (function () {
  /* ─── Public API ─── */

  /**
   * generateBlocks(knowledgeModel, sectionPlan, gapAnalysis) — Generate
   * complete CMS block structure for all planned sections.
   *
   * Returns {
   *   $schema: "psh-content-block-v2",
   *   meta: { ... },
   *   pagePlan: { ... },
   *   sections: [ { sectionId, sectionType, ... } ],
   *   images: [ { imageId, purpose, altText, ... } ],
   *   videos: [ { videoId, videoType, ... } ],
   *   seo: { metaTitle, metaDescription, schema, ... },
   *   evidence: [ { claim, confidence, sources } ]
   * }
   */
  function generateBlocks(knowledgeModel, sectionPlan, gapAnalysis) {
    if (!knowledgeModel || !sectionPlan) {
      return minimalOutput();
    }

    var product = knowledgeModel.product || {};
    var classification = knowledgeModel.classification || {};
    var specifications = knowledgeModel.specifications || [];
    var features = knowledgeModel.features || [];
    var connectivity = knowledgeModel.connectivity || [];
    var dimensions = knowledgeModel.dimensions || {};
    var existingImages = knowledgeModel.images || [];
    var outline = sectionPlan.outline || [];
    var depth = sectionPlan.contentDepth || { level: 1 };
    var gaps = (gapAnalysis && gapAnalysis.gaps) || [];

    var productName = (product.name && product.name.value) || 'Sản phẩm';
    var brandName = (product.brand && product.brand.value) || '';

    /* ─── Build Sections ─── */
    var sections = [];
    var images = [];
    var videos = [];

    outline.forEach(function (sectionPlan) {
      var section = buildSection(sectionPlan, knowledgeModel);

      // Generate image slots per section
      var sectionImages = generateSectionImages(sectionPlan, product);
      images = images.concat(sectionImages);

      // Generate video slots for video section
      if (sectionPlan.sectionType === 'videos') {
        videos = videos.concat(generateSectionVideos(sectionPlan, product));
      }

      sections.push(section);
    });

    /* ─── Build SEO ─── */
    var seo = buildSEO(product, classification, specifications, sections);

    /* ─── Build Evidence ─── */
    var evidence = buildEvidence(sections, specifications, features);

    /* ─── Assemble ─── */
    return {
      $schema: 'psh-content-block-v2',
      meta: {
        generator: 'ContentCmsBlockGenerator',
        product: productName,
        brand: brandName,
        locale: 'vi-VN',
        generatedAt: Date.now(),
        contentDepth: depth.label || 'comprehensive',
        priceTier: (classification.priceTier && classification.priceTier.value) || 'unknown',
        estimatedWordCount: sectionPlan.estimatedTotalWords || 3000
      },
      pagePlan: {
        title: productName + ' | ' + (brandName || 'Pshop Music'),
        slug: generateSlug(productName),
        readingTime: Math.ceil((sectionPlan.estimatedTotalWords || 3000) / 200) + ' phút',
        sectionCount: sections.length,
        imageCount: images.length,
        videoCount: videos.length,
        faqCount: sections.filter(function (s) { return s.sectionType === 'faq'; }).length > 0 ? 15 : 0,
        sectionHierarchy: sections.map(function (s) { return s.sectionId; })
      },
      sections: sections,
      images: images,
      videos: videos,
      seo: seo,
      evidence: evidence,
      missingInfo: gapAnalysis ? {
        gaps: gapAnalysis.gaps,
        summary: gapAnalysis.summary,
        taskList: gapAnalysis.taskList
      } : {}
    };
  }

  /* ─── Section Builder ─── */

  function buildSection(sectionPlan, model) {
    var section = {
      sectionId: sectionPlan.sectionId,
      sectionType: sectionPlan.sectionType,
      sectionTitle: sectionPlan.sectionTitle || '',
      sectionSubtitle: '',
      seoHeading: sectionPlan.seoHeading || 'h2',
      content: {},
      imageSlots: [],
      videoSlots: [],
      callToAction: null
    };

    // Generate content based on section type
    switch (sectionPlan.sectionType) {
      case 'hero':
        section.content = generateHeroContent(model);
        section.callToAction = { label: 'Liên hệ mua hàng', url: '/lien-he', style: 'hero' };
        break;

      case 'quick_overview':
        section.content = generateOverviewContent(model);
        break;

      case 'product_introduction':
        section.content = generateIntroContent(model);
        break;

      case 'product_gallery':
        section.imageSlots = generateGallerySlots(6);
        break;

      case 'core_features':
        section.features = generateFeatureBlocks(model);
        section.imageSlots = (model.features || []).map(function (f, i) {
          return { imageId: 'feature-' + (i + 1), placement: 'feature_header', priority: 'recommended' };
        });
        break;

      case 'design_build_quality':
        section.content = generateDesignContent(model);
        section.tables = generateDimensionTable(model);
        break;

      case 'connectivity':
        section.content = generateConnectivityContent(model);
        section.tables = generateConnectivityTable(model);
        break;

      case 'specifications':
        section.specGroups = generateSpecGroups(model);
        section.tables = [{
          tableId: 'specifications',
          title: 'Thông số kỹ thuật',
          headers: ['Thông số', 'Giá trị'],
          rows: (model.specifications || []).map(function (s) { return [s.key || '', s.value || '']; })
        }];
        break;

      case 'performance_analysis':
        section.content = generatePerformanceContent(model);
        break;

      case 'comparison':
        section.comparisonTable = generateComparisonTable(model);
        break;

      case 'tutorials':
        section.tutorials = generateTutorials(model);
        break;

      case 'faq':
        section.questions = generateFAQs(model);
        break;

      case 'customer_reviews':
        section.reviewSummary = generateReviewSummary(model);
        break;

      case 'buying_advice':
        section.content = generateBuyingAdvice(model);
        break;

      case 'seo':
        section.content = {};
        break;
    }

    return section;
  }

  /* ─── Content Generators ─── */

  function generateHeroContent(model) {
    var productName = (model.product.name && model.product.name.value) || 'Sản phẩm';
    var brand = (model.product.brand && model.product.brand.value) || '';
    var features = model.features || [];

    return {
      introduction: productName + (brand ? ' — sản phẩm từ ' + brand : ''),
      keySellingPoints: features.slice(0, 6).map(function (f) {
        return typeof f === 'string' ? f : (f.feature || '');
      }),
      cta: { label: 'Liên hệ tư vấn', url: '/lien-he', priority: 'primary' }
    };
  }

  function generateOverviewContent(model) {
    var productName = (model.product.name && model.product.name.value) || 'Sản phẩm';
    var audience = (model.classification.targetAudience && model.classification.targetAudience.value) || [];
    var features = model.features || [];

    return {
      body: productName + ' dành cho ' +
        (audience.length ? audience.join(', ') : 'người yêu âm nhạc chuyên nghiệp') +
        '. Với ' + features.length + ' tính năng nổi bật, sản phẩm này mang đến trải nghiệm vượt trội.'
    };
  }

  function generateIntroContent(model) {
    return {
      paragraphs: [
        { heading: 'Giới Thiệu', text: (model.product.name && model.product.name.value) || '' },
        { heading: 'Nhà Sản Xuất', text: (model.product.manufacturer && model.product.manufacturer.value) || '' }
      ]
    };
  }

  function generateFeatureBlocks(model) {
    return (model.features || []).map(function (f, i) {
      return {
        featureId: 'feature-' + (i + 1),
        featureTitle: typeof f === 'string' ? f : (f.feature || 'Tính năng ' + (i + 1)),
        featureOrder: i + 1,
        content: {
          intro: typeof f === 'object' ? (f.description || '') : '',
          advantages: [],
          limitations: []
        },
        imageSlots: [{ imageId: 'feature-' + (i + 1), placement: 'feature_header', priority: 'optional' }]
      };
    });
  }

  function generateDesignContent(model) {
    return { body: 'Thông tin thiết kế và chất lượng hoàn thiện.' };
  }

  function generateConnectivityContent(model) {
    var conn = model.connectivity || [];
    return {
      body: 'Các cổng kết nối: ' + conn.map(function (c) { return c.port; }).join(', '),
      connectionGroups: [{ groupName: 'Kết nối', items: conn.map(function (c) { return c.port + ': ' + c.details; }) }]
    };
  }

  function generatePerformanceContent(model) {
    return {
      pros: [],
      cons: [],
      professionalOpinion: 'Chưa có đánh giá',
      bestUseCases: []
    };
  }

  function generateBuyingAdvice(model) {
    return {
      whoShouldBuy: [],
      whoShouldNotBuy: [],
      alternatives: []
    };
  }

  function generateReviewSummary(model) {
    return {
      communityPros: [],
      communityCons: [],
      professionalFeedback: [],
      aggregateRating: { score: 0, maxScore: 5, reviewCount: 0 }
    };
  }

  /* ─── Table Generators ─── */

  function generateDimensionTable(model) {
    var dims = model.dimensions || {};
    var rows = [];
    if (dims.weight) rows.push(['Trọng lượng', dims.weight.value + ' ' + (dims.weight.unit || '')]);
    if (dims.width) rows.push(['Chiều rộng', dims.width.value + ' ' + (dims.width.unit || '')]);
    if (dims.depth) rows.push(['Chiều sâu', dims.depth.value + ' ' + (dims.depth.unit || '')]);
    if (dims.height) rows.push(['Chiều cao', dims.height.value + ' ' + (dims.height.unit || '')]);

    if (rows.length === 0) return [];

    return [{
      tableId: 'dimensions',
      title: 'Kích thước & trọng lượng',
      headers: ['Thông số', 'Giá trị'],
      rows: rows
    }];
  }

  function generateConnectivityTable(model) {
    var conn = model.connectivity || [];
    if (conn.length === 0) return [];

    return [{
      tableId: 'connectivity',
      title: 'Kết nối',
      headers: ['Cổng', 'Loại'],
      rows: conn.map(function (c) { return [c.port, c.type || 'connection']; })
    }];
  }

  function generateComparisonTable(model) {
    return {
      title: 'So sánh',
      headers: ['Tiêu chí', 'Sản phẩm này'],
      rows: []
    };
  }

  function generateSpecGroups(model) {
    var specs = model.specifications || [];
    if (specs.length === 0) return [];
    return [{
      groupName: 'Thông số chung',
      specs: specs.map(function (s) { return [s.key || '', s.value || '']; })
    }];
  }

  function generateTutorials(model) {
    var name = (model.product.name && model.product.name.value) || 'Sản phẩm';
    return [
      {
        tutorialName: 'Hướng dẫn sử dụng ' + name,
        level: 'beginner',
        steps: [
          { step: 1, action: 'Mở hộp và kiểm tra phụ kiện', detail: 'Kiểm tra đầy đủ phụ kiện đi kèm' },
          { step: 2, action: 'Kết nối nguồn', detail: 'Cắm dây nguồn và bật thiết bị' },
          { step: 3, action: 'Kết nối âm thanh', detail: 'Kết nối với loa hoặc hệ thống âm thanh' },
          { step: 4, action: 'Kết nối nguồn nhạc', detail: 'Kết nối USB hoặc thiết bị phát' },
          { step: 5, action: 'Bắt đầu sử dụng', detail: 'Làm quen với các điều khiển cơ bản' }
        ]
      },
      {
        tutorialName: 'Mẹo & Thủ thuật',
        level: 'advanced',
        steps: [
          { step: 1, action: 'Tối ưu hiệu suất', detail: 'Cập nhật firmware và phần mềm' },
          { step: 2, action: 'Kết nối mở rộng', detail: 'Kết nối với thiết bị ngoại vi' }
        ]
      }
    ];
  }

  function generateFAQs(model) {
    var questions = [];
    var productName = (model.product.name && model.product.name.value) || 'sản phẩm';

    questions.push({ q: productName + ' có bảo hành không?', a: 'Sản phẩm có bảo hành 12 tháng chính hãng.' });
    questions.push({ q: productName + ' có hỗ trợ kết nối không dây không?', a: 'Kiểm tra thông số kỹ thuật để biết chi tiết.' });
    questions.push({ q: 'Làm thế nào để cập nhật firmware?', a: 'Tải firmware từ website nhà sản xuất và làm theo hướng dẫn.' });
    questions.push({ q: productName + ' có tương thích với Windows/Mac không?', a: 'Kiểm tra thông số tương thích trên website sản phẩm.' });
    questions.push({ q: 'Có thể mua phụ kiện thay thế ở đâu?', a: 'Liên hệ Pshop Music để được tư vấn phụ kiện chính hãng.' });

    return questions;
  }

  /* ─── Image Generators ─── */

  function generateSectionImages(sectionPlan, product) {
    var productName = (product.name && product.name.value) || 'Sản phẩm';
    var images = [];

    switch (sectionPlan.sectionType) {
      case 'hero':
        images.push(createImageBlock('hero-main', 'product_hero', productName + ' hero'));
        break;
      case 'product_introduction':
        images.push(createImageBlock('intro', 'product_intro', productName));
        break;
      case 'design_build_quality':
        images.push(createImageBlock('design', 'design_detail', 'Thiết kế ' + productName));
        break;
      case 'connectivity':
        images.push(createImageBlock('connectivity', 'connectivity_diagram', 'Kết nối ' + productName));
        break;
    }

    return images;
  }

  function createImageBlock(id, purpose, alt) {
    return {
      imageId: id + '-' + Date.now() % 1000,
      purpose: purpose,
      source: 'ai_generated',
      altText: alt,
      caption: '',
      suggestedFilename: id + '.jpg',
      prompt: alt + ' — professional product photography'
    };
  }

  function generateGallerySlots(count) {
    var slots = [];
    var views = ['front', 'angle', 'top', 'rear', 'side', 'detail'];
    for (var i = 0; i < Math.min(count, views.length); i++) {
      slots.push({
        imageId: 'gallery-' + views[i],
        placement: 'gallery_grid',
        priority: i < 4 ? 'required' : 'optional'
      });
    }
    return slots;
  }

  /* ─── Video Generators ─── */

  function generateSectionVideos(sectionPlan, product) {
    var productName = (product.name && product.name.value) || 'Sản phẩm';
    return [
      {
        videoId: 'vid-official-' + Date.now() % 1000,
        videoType: 'hero_video',
        provider: 'youtube',
        title: 'Official ' + productName + ' Video',
        description: 'Video chính thức từ nhà sản xuất',
        position: 'section_start',
        priority: 'required'
      },
      {
        videoId: 'vid-review-' + Date.now() % 1000,
        videoType: 'review_video',
        provider: 'youtube',
        title: productName + ' Review',
        description: 'Đánh giá chi tiết từ chuyên gia',
        position: 'section_middle',
        priority: 'recommended'
      }
    ];
  }

  /* ─── SEO Builder ─── */

  function buildSEO(product, classification, specs, sections) {
    var productName = (product.name && product.name.value) || 'Sản phẩm';
    var brand = (product.brand && product.brand.value) || '';
    var category = (classification.category) || 'product';

    return {
      metaTitle: (productName + (brand ? ' | ' + brand : '') + ' | Pshop Music').substring(0, 65),
      metaDescription: (productName + ' chính hãng — ' + (brand ? brand + ' ' : '') + 'tại Pshop Music. Bảo hành 12 tháng.').substring(0, 160),
      metaSlug: generateSlug(productName),
      ogTitle: productName,
      ogDescription: 'Sản phẩm chính hãng tại Pshop Music',
      keywords: [brand, productName, category, 'Pshop Music', 'thiết bị DJ', 'âm thanh chuyên nghiệp'].filter(Boolean),
      breadcrumb: [
        { position: 1, name: 'Trang chủ', url: 'https://pshopmusic.com' },
        { position: 2, name: 'Danh mục ' + (classification.category || ''), url: '/danh-muc/' + (classification.category || '') },
        { position: 3, name: productName, url: '/products/' + generateSlug(productName) }
      ],
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: productName,
        brand: brand
      }
    };
  }

  /* ─── Evidence Builder ─── */

  function buildEvidence(sections, specs, features) {
    var evidence = [];

    sections.forEach(function (section) {
      if (section.content && section.content.body) {
        evidence.push({
          claim: section.content.body.substring(0, 150),
          confidence: 'Medium',
          category: section.sectionType,
          sources: []
        });
      }
    });

    specs.forEach(function (spec) {
      evidence.push({
        claim: spec.key + ': ' + spec.value,
        confidence: spec.confidence || 'Medium',
        category: 'specification',
        sources: [{ type: spec.source || 'inference', confidence: spec.confidence || 'Medium' }]
      });
    });

    return evidence;
  }

  /* ─── Helpers ─── */

  function generateSlug(text) {
    if (!text) return 'product';
    var slug = text.toLowerCase();
    slug = slug.replace(/[^a-z0-9\s-]/g, '');
    slug = slug.replace(/\s+/g, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/^-|-$/g, '');
    return slug.substring(0, 80) || 'product';
  }

  function minimalOutput() {
    return {
      $schema: 'psh-content-block-v2',
      meta: { generator: 'ContentCmsBlockGenerator', generatedAt: Date.now() },
      pagePlan: { slug: 'product', readingTime: '1 phút', sectionCount: 1 },
      sections: [],
      images: [],
      videos: [],
      seo: {},
      evidence: []
    };
  }

  /* ─── Public API ─── */

  return {
    generateBlocks: generateBlocks
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentCmsBlockGenerator: ContentCmsBlockGenerator };
}
