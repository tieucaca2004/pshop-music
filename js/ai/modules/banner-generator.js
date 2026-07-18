/*
 * Banner AI V2 (Sprint 12 Requirement #8 — Media AI: Banner AI V2) — nâng
 * cấp Banner Generator để sinh banner publish-ready từ Sản phẩm, Khuyến mãi,
 * hoặc Sự kiện có sẵn — Founder chọn ĐÚNG 1 trong 3, cả 3 field đều tuỳ
 * chọn. Có Sản phẩm → tự động gắn Featured Product Image/Gallery THẬT qua
 * DataProvider (AI KHÔNG BAO GIỜ tự bịa URL ảnh, AI_RULES.md mục 2); không
 * có Sản phẩm → chỉ sinh văn bản, đúng "Generate text only."
 *
 * Publish vẫn gọi BannerDB.add() có sẵn trong js/cms-db.js (ngoài phạm vi
 * plugin, xem js/admin-ai.js publishToTarget() — không cần sửa, field mới
 * chỉ CỘNG THÊM vào content đã có, không đổi field cũ).
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['banner-generator']` (js/ai/modules-core.js) —
 * the single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Prompt wording and parsing
 * logic did NOT change — only where the code physically lives.
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'banner-generator',
  label: 'Banner AI V2',
  description: 'Sinh banner quảng cáo publish-ready (Tiêu đề/Phụ đề/CTA) từ Sản phẩm, Khuyến mãi, hoặc Sự kiện — tự gắn ảnh sản phẩm thật nếu có, không tự bịa ảnh.',
  targetCollection: AiModulesCore.MODULES['banner-generator'].targetCollection,

  inputFields: [
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 3: Sản phẩm / Khuyến mãi / Sự kiện)', type: 'productSelect', optional: true },
    { key: 'promotion', label: 'Chương trình khuyến mãi (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Giảm 15% dịp 30/4', optional: true },
    { key: 'event', label: 'Sự kiện (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Hội chợ âm thanh Nha Trang 2026', optional: true },
    { key: 'link', label: 'Link khi bấm vào banner (không bắt buộc)', type: 'text', placeholder: 'category.html?cat=tainghe', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['banner-generator'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['banner-generator'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
