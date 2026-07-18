/*
 * Blog AI V2 (Sprint 12 Requirement #5 — Media AI: Product & Blog Media) —
 * sinh 1 bài blog mới (draft) theo chủ đề. TUỲ CHỌN chọn 1 Sản phẩm có sẵn
 * (productId) để tự động chèn ẢNH/VIDEO THẬT của sản phẩm đó vào bài viết —
 * KHÔNG BAO GIỜ để AI tự bịa URL ảnh/video (AI_RULES.md mục 2): mọi ảnh/
 * video trong bài đều lấy nguyên văn từ dữ liệu CMS thật qua DataProvider,
 * chỉ phần văn bản (tiêu đề/mở bài/các mục/kết bài) do AI viết.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['blog-writer']` (js/ai/modules-core.js) — the
 * single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Prompt wording and parsing
 * logic did NOT change — only where the code physically lives. `loadContext`
 * stays here (the one genuinely client-specific piece — uses DataProvider,
 * where the server uses shared/listResource.js).
 */
AIModuleRegistry.register({
  id: 'blog-writer',
  label: 'Blog AI V2',
  description: 'Viết bài blog mới theo chủ đề — tuỳ chọn chèn tự động ảnh/video thật của 1 sản phẩm có sẵn + link sản phẩm liên quan cuối bài.',
  targetCollection: AiModulesCore.MODULES['blog-writer'].targetCollection,

  inputFields: [
    { key: 'topic', label: 'Chủ đề bài viết', type: 'text', placeholder: 'VD: Cách chọn loa kiểm âm cho phòng thu tại nhà' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Hài hước'] },
    { key: 'keywords', label: 'Từ khóa SEO (phân tách bằng dấu phẩy)', type: 'text', placeholder: 'loa kiểm âm, phòng thu tại nhà', optional: true },
    { key: 'images', label: 'Ảnh bài viết (tối đa 5 — ảnh đầu tiên = ảnh đại diện)', type: 'imageList', optional: true, maxImages: 5 },
    { key: 'productId', label: 'Sản phẩm liên quan (không bắt buộc — nếu chưa tự cấp Ảnh bài viết ở trên, tự chèn ảnh/video thật của sản phẩm này)', type: 'productSelect', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['blog-writer'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['blog-writer'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
