/*
 * Product AI V2 (Sprint 12 Requirement #1) — sinh đầy đủ nội dung
 * publish-ready cho 1 sản phẩm CÓ SẴN: Tên/Mô tả ngắn/Mô tả dài/Thông số/
 * Tính năng/FAQ/SEO Title/Meta Description/SEO Keywords/Slug/Tags/Danh mục/
 * ALT Text. Đọc dữ liệu sản phẩm + danh mục hợp lệ thật qua DataProvider
 * (js/ai/data-provider.js) — không gọi thẳng DB/CategoryDB — làm căn cứ,
 * không bịa thông số.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['product-description-writer']`
 * (js/ai/modules-core.js) — the single source of truth also used verbatim
 * by `functions/shared/aiModules.js` server-side. Prompt wording and
 * parsing logic did NOT change — only where the code physically lives.
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'product-description-writer',
  label: 'Product AI V2',
  description: 'Sinh đầy đủ nội dung publish-ready cho 1 sản phẩm: mô tả, thông số, tính năng, FAQ, SEO, slug, tags, danh mục, ALT text.',
  targetCollection: AiModulesCore.MODULES['product-description-writer'].targetCollection,

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm', type: 'productSelect' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Nhấn mạnh khuyến mãi'] }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['product-description-writer'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['product-description-writer'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
