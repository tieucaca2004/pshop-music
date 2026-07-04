/*
 * SEO Generator (Sprint 2 — plugin chính thức #3) — sinh gói SEO đầy đủ
 * (Meta Title, Meta Description, Keywords, Open Graph, gợi ý Schema) cho 1
 * bài blog CÓ SẴN, dựa trên đúng nội dung bài viết đó (đọc qua BlogDB.get()).
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

  loadContext(inputParams) {
    if (typeof BlogDB === 'undefined' || !inputParams.postId) return Promise.resolve({});
    return BlogDB.get(inputParams.postId).then(post => ({ post }));
  },

  buildPrompt(inputParams, context) {
    const post = context.post || {};
    return [
      `Dựa trên bài viết sau, tạo gói SEO gồm đúng 6 dòng:`,
      `dòng 1 = Meta Title (dưới 60 ký tự),`,
      `dòng 2 = Meta Description (dưới 160 ký tự),`,
      `dòng 3 = danh sách từ khóa (phân tách bằng dấu phẩy),`,
      `dòng 4 = Open Graph Title,`,
      `dòng 5 = Open Graph Description,`,
      `dòng 6 = gợi ý loại Schema.org phù hợp (vd: Article, Product, FAQPage) kèm lý do ngắn gọn.`,
      `Tiêu đề gốc: "${post.title || ''}". Mô tả ngắn: "${post.excerpt || ''}".`
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
