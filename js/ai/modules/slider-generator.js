/*
 * Slider Generator (Sprint 2 — plugin chính thức #2) — sinh nội dung 1 slide
 * mới cho hero slider trang chủ, dựa trên 1 sản phẩm CÓ SẴN (đọc qua
 * DataProvider.getProduct()/getMedia() — không gọi thẳng DB.get()). Dùng
 * ảnh có sẵn của chính sản phẩm (DataProvider.getMedia) làm gợi ý — CMS
 * hiện chưa có module Media Library riêng, xem ROADMAP.md.
 *
 * targetCollection dùng ký hiệu "siteContent.heroSlides" — Publish (trong
 * admin/ai/drafts.html) đọc SiteContentDB.get(), nối thêm slide vào mảng
 * heroSlides rồi SiteContentDB.save() lại, đúng hàm dữ liệu có sẵn.
 * Không tích hợp API tạo ảnh — "imagePrompt" chỉ là gợi ý để admin tự dùng
 * với công cụ tạo ảnh AI khác, không tự sinh ảnh.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['slider-generator']` (js/ai/modules-core.js) —
 * the single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Prompt wording and mapping
 * logic did NOT change — only where the code physically lives.
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'slider-generator',
  label: 'Slider Generator',
  description: 'Tạo Headline/Subheadline/CTA + gợi ý ảnh cho 1 slide mới, dựa trên 1 sản phẩm đã có.',
  targetCollection: AiModulesCore.MODULES['slider-generator'].targetCollection,

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm làm chủ đề slide', type: 'productSelect' },
    { key: 'ctaStyle', label: 'Kiểu kêu gọi hành động (CTA)', type: 'select', options: ['Mua ngay', 'Xem chi tiết', 'Liên hệ tư vấn'] }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getMedia(inputParams.productId)
    ]).then(([product, media]) => ({ product, media }));
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['slider-generator'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['slider-generator'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
