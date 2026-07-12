/*
 * SEO Generator (Sprint 2 — plugin chính thức #3) — sinh gói SEO đầy đủ
 * (Meta Title, Meta Description, Keywords, Open Graph, gợi ý Schema) cho 1
 * bài blog CÓ SẴN, dựa trên đúng nội dung bài viết đó (đọc qua
 * DataProvider.getBlogPost() — không gọi thẳng BlogDB.get()).
 * Publish sẽ gọi BlogDB.update(targetId, {...}) có sẵn — các field
 * keywords/ogTitle/ogDescription/ogImage/schemaSuggestion là field MỚI được
 * bổ sung thêm vào bản ghi blogPosts khi publish (không phá field cũ).
 *
 * Nhắm vào Blog Post (không nhắm Product) vì Product hiện không có trang
 * riêng để áp Meta Title/OG/Schema — xem AI_RULES.md mục "Giới hạn kiến
 * trúc" và ROADMAP.md "SEO cho trang sản phẩm riêng".
 */
AIModuleRegistry.register({
  id: 'seo-generator',
  label: 'SEO Generator',
  description: 'Tạo gói SEO đầy đủ (Meta Title/Description, Keywords, Open Graph, gợi ý Schema) cho 1 bài blog đã có.',
  targetCollection: 'blogPosts',

  inputFields: [
    { key: 'postId', label: 'Chọn bài viết', type: 'blogSelect' }
  ],

  // loadContext — Sprint 13 (Product Management V2: Category Assignment):
  // "Reuse the selected Categories" cho SEO AI. SEO Generator chỉ nhắm Blog
  // Post (không nhắm Product trực tiếp — xem ghi chú đầu file), nên chỉ có
  // thể "reuse" categoryIds NẾU bài viết có sẵn relatedProductId (do Blog AI
  // gán khi Founder chọn Sản phẩm lúc sinh bài, xem blog-writer.js). Không có
  // relatedProductId (đa số bài viết cũ/viết tay) → bỏ qua hoàn toàn, đúng
  // hành vi hiện tại, không phá gì.
  loadContext(inputParams) {
    if (!inputParams.postId) return Promise.resolve({});
    return DataProvider.getBlogPost(inputParams.postId).then(post => {
      if (!post || !post.relatedProductId) return { post };
      return Promise.all([
        DataProvider.getProduct(post.relatedProductId),
        DataProvider.getCategories()
      ]).then(([product, categories]) => ({ post, product, categories: categories || [] }));
    });
  },

  productCategoryLabels(p, categories) {
    if (!p) return [];
    const ids = Array.isArray(p.categoryIds) && p.categoryIds.length ? p.categoryIds : (p.category ? [p.category] : []);
    const byCode = {};
    (categories || []).forEach(c => { byCode[c.code] = c; });
    return ids.map(id => byCode[id]).filter(Boolean).map(c => c.label);
  },

  buildPrompt(inputParams, context) {
    const post = context.post || {};
    const categoryLabels = this.productCategoryLabels(context.product, context.categories);
    const categoryLine = categoryLabels.length ? ` Sản phẩm liên quan thuộc danh mục: ${categoryLabels.join(', ')}.` : '';
    return [
      `Dựa trên bài viết sau, tạo gói SEO gồm đúng 6 dòng:`,
      `dòng 1 = Meta Title (dưới 60 ký tự),`,
      `dòng 2 = Meta Description (dưới 160 ký tự),`,
      `dòng 3 = danh sách từ khóa (phân tách bằng dấu phẩy),`,
      `dòng 4 = Open Graph Title,`,
      `dòng 5 = Open Graph Description,`,
      `dòng 6 = gợi ý loại Schema.org phù hợp (vd: Article, Product, FAQPage) kèm lý do ngắn gọn.`,
      `Tiêu đề gốc: "${post.title || ''}". Mô tả ngắn: "${post.excerpt || ''}".${categoryLine}`
    ].join(' ');
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    const lines = (providerOutput.text || '').split('\n').filter(Boolean);
    return {
      seoTitle: lines[0] || '',
      seoDescription: lines[1] || '',
      keywords: (lines[2] || '').split(',').map(k => k.trim()).filter(Boolean),
      ogTitle: lines[3] || '',
      ogDescription: lines[4] || '',
      ogImage: (context.post && context.post.coverImage) || '',
      schemaSuggestion: lines[5] || '',
      _postTitle: (context.post && context.post.title) || inputParams.postId
    };
  }
});
