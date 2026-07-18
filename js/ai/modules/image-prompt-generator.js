/*
 * Image Prompt Generator — sinh prompt mô tả ảnh (để dán vào công cụ tạo
 * ảnh AI khác). targetCollection = null — chỉ tạo văn bản tham khảo.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['image-prompt-generator']`
 * (js/ai/modules-core.js) — the single source of truth also used verbatim
 * by `functions/shared/aiModules.js` server-side. Wording did NOT change —
 * only where the code physically lives.
 */
AIModuleRegistry.register({
  id: 'image-prompt-generator',
  label: 'Image Prompt Generator',
  description: 'Tạo prompt mô tả ảnh chi tiết để dùng với công cụ tạo ảnh AI khác.',
  targetCollection: AiModulesCore.MODULES['image-prompt-generator'].targetCollection,

  inputFields: [
    { key: 'subject', label: 'Chủ thể ảnh', type: 'text', placeholder: 'VD: Loa kiểm âm KRK đặt trên bàn DJ, ánh sáng studio' },
    { key: 'style', label: 'Phong cách hình ảnh', type: 'select', options: ['Ảnh sản phẩm studio', 'Chụp đời thực (lifestyle)', 'Poster quảng cáo'] }
  ],

  loadContext() {
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return AiModulesCore.MODULES['image-prompt-generator'].buildPrompt(inputParams);
  },

  mapToDraftContent(providerOutput) {
    return AiModulesCore.MODULES['image-prompt-generator'].mapToDraftContent(providerOutput);
  }
});
