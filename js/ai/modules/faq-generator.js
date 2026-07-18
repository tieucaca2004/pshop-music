/*
 * FAQ Generator — sinh 1 bài blog dạng hỏi-đáp (FAQ) mới theo chủ đề.
 * Publish sẽ gọi BlogDB.add() có sẵn, giống Blog Writer.
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` now delegate
 * to `AiModulesCore.MODULES['faq-generator']` (js/ai/modules-core.js) — the
 * single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Wording did NOT change —
 * only where the code physically lives.
 */
AIModuleRegistry.register({
  id: 'faq-generator',
  label: 'FAQ Generator',
  description: 'Tạo bài viết dạng hỏi-đáp (FAQ) mới theo chủ đề hoặc nhóm sản phẩm.',
  targetCollection: AiModulesCore.MODULES['faq-generator'].targetCollection,

  inputFields: [
    { key: 'topic', label: 'Chủ đề FAQ', type: 'text', placeholder: 'VD: Câu hỏi thường gặp khi mua loa kiểm âm' },
    { key: 'questionCount', label: 'Số câu hỏi', type: 'select', options: ['5', '8', '10'] }
  ],

  loadContext() {
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return AiModulesCore.MODULES['faq-generator'].buildPrompt(inputParams);
  },

  mapToDraftContent(providerOutput, inputParams) {
    return AiModulesCore.MODULES['faq-generator'].mapToDraftContent(providerOutput, inputParams);
  }
});
