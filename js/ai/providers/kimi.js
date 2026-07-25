/**
 * js/ai/providers/kimi.js — Kimi (Moonshot) AI Provider (standardized stub).
 * Implements IAIProvider interface.
 */
const KimiProvider = (function() {
  'use strict';
  var NAME = 'Kimi';
  function generate() {
    return Promise.reject(new Error(NAME + ' chưa được cấu hình. Vào admin/ai/providers.html để thêm API Key.'));
  }
  function validate() {
    return Promise.resolve({ valid: false, reason: NAME + ' API Key chưa được cấu hình.' });
  }
  function health() {
    return Promise.resolve({ healthy: false, message: NAME + ' chưa kết nối. Cần API Key.' });
  }
  return { generate: generate, validate: validate, health: health };
})();
if (typeof AIProviderRegistry !== 'undefined') AIProviderRegistry.register('kimi', KimiProvider);
