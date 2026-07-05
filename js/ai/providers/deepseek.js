/*
 * Stub DeepSeek Provider — implement đúng hợp đồng IAIProvider trong
 * provider-interface.js (generate/validate/health, không thêm gì khác).
 * TODO (Roadmap V2): gọi DeepSeek API thật ở đây, key lấy qua proxy Cloud
 * Function (không lưu key trong Realtime Database ở client).
 */
AIProviderRegistry.register({
  id: 'deepseek',
  label: 'DeepSeek',

  validate(config) {
    if (!config || !config.enabled) {
      return { valid: false, reason: 'DeepSeek chưa được bật trong Nhà cung cấp AI (admin/ai/providers.html).' };
    }
    return { valid: true, reason: '' };
  },

  health() {
    // TODO (Roadmap V2): gọi thử endpoint DeepSeek thật để kiểm tra kết nối.
    return Promise.resolve({ healthy: false, message: 'Chưa tích hợp API DeepSeek thật.' });
  },

  generate({ moduleId, prompt, params, config }) {
    return Promise.reject(createProviderNotConfiguredError('DeepSeek'));
  }
});
