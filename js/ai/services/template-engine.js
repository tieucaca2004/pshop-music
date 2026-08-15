/*
 * TemplateEngine — Template Management Service
 * ===============================================
 * Manages reusable content templates for the Media AI Center. Templates
 * provide pre-defined structures for different content types (blog posts,
 * product descriptions, social media posts, etc.).
 *
 * Each template defines:
 *   - Field structure (what inputs the template needs)
 *   - Prompt template (how to build the AI prompt)
 *   - Output schema (structure of the generated content)
 *
 * Dependencies:
 *   js/ai/services/generation-service.js → GenerationService (pipeline)
 *   Firebase Realtime Database (templates/) → template storage
 */

const TemplateEngine = (function () {
  var TEMPLATES_REF = null;

  function getRef() {
    if (TEMPLATES_REF) return TEMPLATES_REF;
    if (typeof firebase !== 'undefined' && firebase.database) {
      TEMPLATES_REF = firebase.database().ref('templates');
    }
    return TEMPLATES_REF;
  }

  /**
   * register(template) — Register a new content template.
   *
   * template = {
   *   id: string,                    // Unique template ID
   *   name: string,                   // Human-readable name
   *   description: string,            // Template description
   *   moduleId: string,               // Target AI module (e.g., 'blog-writer')
   *   category: string,               // 'blog' | 'product' | 'social' | 'image' | 'seo'
   *   fields: array,                  // Input field definitions
   *   defaults: object,               // Default values for fields
   *   promptTemplate: string,         // Prompt template (can have {{field}} placeholders)
   *   outputSchema: object|null       // Expected output structure
   * }
   */
  function register(template) {
    if (!template || !template.id) {
      return Promise.reject(new Error('TemplateEngine.register() requires a template with an id'));
    }
    var entry = {
      id: template.id,
      name: template.name || template.id,
      description: template.description || '',
      moduleId: template.moduleId || null,
      category: template.category || 'general',
      fields: template.fields || [],
      defaults: template.defaults || {},
      promptTemplate: template.promptTemplate || '',
      outputSchema: template.outputSchema || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };

    var ref = getRef();
    if (ref) {
      return ref.child(template.id).set(entry).then(function () {
        return { id: template.id, template: entry };
      });
    }
    // Fallback: in-memory storage
    return Promise.resolve({ id: template.id, template: entry });
  }

  /**
   * get(id) — Retrieve a template by ID.
   */
  function get(id) {
    var ref = getRef();
    if (ref) {
      return ref.child(id).once('value').then(function (snap) { return snap.val(); });
    }
    return Promise.resolve(null);
  }

  /**
   * list(category) — List all templates, optionally filtered by category.
   */
  function list(category) {
    var ref = getRef();
    if (!ref) return Promise.resolve([]);

    return ref.once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return [];
      var items = Object.keys(data).map(function (key) {
        var item = data[key];
        item._id = key;
        return item;
      });
      if (category) items = items.filter(function (i) { return i.category === category; });
      return items;
    });
  }

  /**
   * apply(templateId, values) — Apply a template with given values.
   * Replaces {{field}} placeholders with provided values and returns
   * the filled prompt ready for a module.
   */
  function apply(templateId, values) {
    return get(templateId).then(function (template) {
      if (!template) {
        return Promise.reject(new Error('Template not found: ' + templateId));
      }

      var prompt = template.promptTemplate || '';
      var filled = {};

      // Replace placeholders
      Object.keys(values || {}).forEach(function (key) {
        var placeholder = '{{' + key + '}}';
        while (prompt.indexOf(placeholder) !== -1) {
          prompt = prompt.replace(placeholder, String(values[key]));
        }
        filled[key] = values[key];
      });

      // Fill in defaults for missing values
      Object.keys(template.defaults || {}).forEach(function (key) {
        if (!filled[key]) {
          filled[key] = template.defaults[key];
        }
      });

      return {
        templateId: templateId,
        templateName: template.name,
        moduleId: template.moduleId,
        prompt: prompt,
        filledValues: filled,
        inputParams: buildInputParams(template, filled)
      };
    });
  }

  /**
   * buildInputParams(template, values) — Build input parameters from template + values.
   * Matches the expected format of the target module.
   */
  function buildInputParams(template, values) {
    var params = {};
    (template.fields || []).forEach(function (field) {
      if (values[field.key] !== undefined && values[field.key] !== null) {
        params[field.key] = values[field.key];
      } else if (template.defaults[field.key] !== undefined) {
        params[field.key] = template.defaults[field.key];
      }
    });
    // Merge any extra values that match module input fields
    Object.keys(values).forEach(function (key) {
      if (params[key] === undefined) {
        params[key] = values[key];
      }
    });
    return params;
  }

  /**
   * execute(templateId, values, userId, userEmail) — Apply a template and
   * execute generation through the pipeline in one call.
   */
  function execute(templateId, values, userId, userEmail) {
    return apply(templateId, values).then(function (result) {
      // GenerationService.run() was removed in Phase 2.7 (moved to
      // WorkflowEngine); route through PipelineAdapter like VideoService
      // does — same fix applied across ImageService/VoiceService/
      // SubtitleService/BatchEngine (full-CMS audit 2026-08-15).
      if (!result.moduleId || typeof PipelineAdapter === 'undefined') {
        return { success: false, error: 'Module not available for this template', templateResult: result };
      }
      return PipelineAdapter.generateThroughPipeline(result.moduleId, result.inputParams, userId, userEmail).then(function (genResult) {
        genResult.templateResult = result;
        return genResult;
      });
    });
  }

  /**
   * remove(id) — Delete a template.
   */
  function remove(id) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(id).remove();
  }

  /**
   * createDefaultTemplates() — Creates a set of built-in templates for
   * common content types. These are the foundation for the Template Library.
   */
  function createDefaultTemplates() {
    var templates = [
      {
        id: 'blog-product-review',
        name: 'Blog — Đánh giá sản phẩm',
        description: 'Bài blog đánh giá chi tiết một sản phẩm âm thanh',
        moduleId: 'blog-writer',
        category: 'blog',
        fields: [
          { key: 'topic', label: 'Chủ đề', type: 'text' },
          { key: 'productId', label: 'Sản phẩm', type: 'productSelect' },
          { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Hài hước'] }
        ],
        defaults: { tone: 'Chuyên nghiệp' },
        promptTemplate: 'Viết bài blog đánh giá sản phẩm {{productId}} với chủ đề {{topic}}, văn phong {{tone}}.'
      },
      {
        id: 'product-description-standard',
        name: 'Mô tả sản phẩm — Tiêu chuẩn',
        description: 'Mô tả sản phẩm đầy đủ: tên, mô tả ngắn, mô tả dài, thông số, SEO',
        moduleId: 'product-description-writer',
        category: 'product',
        fields: [
          { key: 'productId', label: 'Sản phẩm', type: 'productSelect' },
          { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Nhấn mạnh khuyến mãi'] }
        ],
        defaults: { tone: 'Chuyên nghiệp' }
      },
      {
        id: 'facebook-promo',
        name: 'Facebook — Bài quảng bá',
        description: 'Bài đăng Facebook quảng bá sản phẩm với 3 phiên bản A/B/C',
        moduleId: 'facebook-post-generator',
        category: 'social',
        fields: [
          { key: 'productId', label: 'Sản phẩm', type: 'productSelect', optional: true },
          { key: 'topic', label: 'Chủ đề', type: 'text', optional: true },
          { key: 'promotion', label: 'Khuyến mãi', type: 'text', optional: true }
        ]
      },
      {
        id: 'seo-blog-post',
        name: 'SEO — Tối ưu bài blog',
        description: 'SEO metadata cho bài blog: meta title, description, keywords, OG tags',
        moduleId: 'seo-generator',
        category: 'seo',
        fields: [
          { key: 'postId', label: 'Bài viết', type: 'blogSelect' }
        ]
      },
      {
        id: 'image-product-hero',
        name: 'Ảnh — Product Hero',
        description: 'Ảnh sản phẩm chính cho trang danh mục',
        moduleId: 'image-generator',
        category: 'image',
        fields: [
          { key: 'productId', label: 'Sản phẩm', type: 'productSelect' },
          { key: 'style', label: 'Phong cách', type: 'select', options: ['Studio', 'Lifestyle', 'Dark', 'Luxury'] }
        ],
        defaults: { imageType: 'Product Hero Image', size: '1:1', style: 'Studio' }
      }
    ];

    return Promise.all(templates.map(function (t) { return register(t); }));
  }

  return {
    register: register,
    get: get,
    list: list,
    apply: apply,
    execute: execute,
    remove: remove,
    createDefaultTemplates: createDefaultTemplates
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TemplateEngine: TemplateEngine };
}
