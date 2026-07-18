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
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['seo-generator']` (js/ai/modules-core.js) — the
 * single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Prompt wording and parsing
 * logic did NOT change — only where the code physically lives.
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'seo-generator',
  label: 'SEO Generator',
  description: 'Tạo gói SEO đầy đủ (Meta Title/Description, Keywords, Open Graph, gợi ý Schema) cho 1 bài blog đã có.',
  targetCollection: AiModulesCore.MODULES['seo-generator'].targetCollection,

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

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['seo-generator'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['seo-generator'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
