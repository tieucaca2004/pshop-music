/*
 * Stub DeepSeek Provider — implement đúng hợp đồng trong provider-interface.js.
 * TODO (Roadmap V2): gọi DeepSeek API thật ở đây, key lấy qua proxy Cloud
 * Function (không lưu key trong Realtime Database ở client).
 */
AIProviderRegistry.register({
  id: 'deepseek',
  label: 'DeepSeek',
  isConfigured(config) {
    return !!(config && config.enabled);
  },
  generate({ moduleId, prompt, params, config }) {
    return Promise.reject(createProviderNotConfiguredError('DeepSeek'));
  }
});
