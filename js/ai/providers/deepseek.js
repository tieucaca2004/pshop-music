/**
 * js/ai/providers/deepseek.js — Provider stub (standardized).
 *
 * TRẠNG THÁI THẬT: STUB — CHƯA có code gọi API nào (không có Cloud Function
 * proxy, không có HTTP call). generate() luôn reject "chưa được cấu hình",
 * validate()/health() luôn false. Thêm API Key KHÔNG đủ để kích hoạt — cần
 * viết integration thật (Cloud Function proxy + nhánh generate) theo mẫu
 * js/ai/providers/openai.js khi có Requirement.
 *
 * Implements IAIProvider interface (3 methods: generate, validate, health).
 */
const DeepSeekProvider = (function() {
  'use strict';
  var deepseek = 'deepseek';
  function generate() {
    return Promise.reject(new Error(deepseek + ' chưa được cấu hình. Cần API Key để kích hoạt.'));
  }
  function validate() {
    return Promise.resolve({ valid: false, reason: deepseek + ' API Key chưa được cấu hình.' });
  }
  function health() {
    return Promise.resolve({ healthy: false, message: deepseek + ' chưa kết nối. Cần API Key.' });
  }
  return { id: deepseek, generate: generate, validate: validate, health: health };
})();
if (typeof AIProviderRegistry !== 'undefined') AIProviderRegistry.register(DeepSeekProvider);
