/*
 * Facebook AI V3 (Sprint 12 Requirement #7 — Media AI: Facebook AI V3) —
 * nâng cấp Facebook AI V2 (Requirement #6) để dùng được cho marketing thật:
 * Founder chọn 1 TRONG 3 nguồn (Sản phẩm HOẶC Chủ đề HOẶC Khuyến mãi — cả 3
 * field đều optional, chỉ cần điền đúng 1) và nhận về 3 PHIÊN BẢN khác nhau
 * (A/B/C) để tự chọn bản ưng ý nhất, thay vì chỉ 1 bản như V2.
 *
 * Media (Featured Image/Gallery/YouTube/Product Link) CHỈ gắn khi có chọn
 * Sản phẩm — lấy nguyên văn từ dữ liệu Product thật qua DataProvider, AI
 * KHÔNG BAO GIỜ tự bịa URL (AI_RULES.md mục 2). Không chọn Sản phẩm (dùng
 * Chủ đề/Khuyến mãi) → chỉ sinh văn bản, đúng "Generate text only."
 *
 * targetCollection vẫn = null — Facebook chưa có tích hợp đăng bài thật,
 * "Publish" chỉ đánh dấu Draft đã duyệt để Founder tự copy đăng thủ công,
 * KHÔNG tự động đăng lên Facebook.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['facebook-post-generator']`
 * (js/ai/modules-core.js) — the single source of truth also used verbatim
 * by `functions/shared/aiModules.js` server-side. Prompt wording and
 * parsing logic did NOT change — only where the code physically lives
 * (the server inlines `buildProductHighlights`/`buildPostText`; the shared
 * core does the same, matching AI_CONSOLIDATION_REPORT.md's finding that
 * this was a packaging-only difference, not a behavioral one).
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'facebook-post-generator',
  label: 'Facebook AI V3',
  description: 'Sinh 3 phiên bản bài đăng Facebook (Hook/Caption/CTA/Hashtags) từ Sản phẩm, Chủ đề, hoặc Khuyến mãi — tự chèn ảnh/video/link thật nếu chọn Sản phẩm.',
  targetCollection: AiModulesCore.MODULES['facebook-post-generator'].targetCollection,

  inputFields: [
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 3: Sản phẩm / Chủ đề / Khuyến mãi)', type: 'productSelect', optional: true },
    { key: 'topic', label: 'Chủ đề (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Bí quyết setup dàn âm thanh phòng khách', optional: true },
    { key: 'promotion', label: 'Chương trình khuyến mãi (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Giảm 10% cuối tuần, tặng kèm phụ kiện', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['facebook-post-generator'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['facebook-post-generator'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
