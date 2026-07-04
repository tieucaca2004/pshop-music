/*
 * Stub Gemini Provider — implement đúng hợp đồng trong provider-interface.js.
 * TODO (Roadmap V2): gọi Google Gemini API thật ở đây, key lấy qua proxy
 * Cloud Function (không lưu key trong Realtime Database ở client).
 */
AIProviderRegistry.register({
  id: 'gemini',
  label: 'Gemini',
  isConfigured(config) {
    return !!(config && config.enabled);
  },
  generate({ moduleId, prompt, params, config }) {
    return Promise.reject(createProviderNotConfiguredError('Gemini'));
  }
});
