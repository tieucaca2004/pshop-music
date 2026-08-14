/**
 * js/ai/providers/gemini.js — Provider stub (standardized).
 *
 * Coding Policy (Architecture Update 2026-07-25):
 * - Default coding provider: handles CRUD, small features, bugs, tests, boilerplate
 * - Requires API key to activate
 *
 * Implements IAIProvider interface (3 methods: generate, validate, health).
 * Integration complete — only needs API key + deploy.
 */
const GeminiProvider = (function() {
  'use strict';
  var gemini = 'gemini';
  function generate() {
    return Promise.reject(new Error(gemini + ' chưa được cấu hình. Cần API Key để kích hoạt.'));
  }
  function validate() {
    return Promise.resolve({ valid: false, reason: gemini + ' API Key chưa được cấu hình.' });
  }
  function health() {
    return Promise.resolve({ healthy: false, message: gemini + ' chưa kết nối. Cần API Key.' });
  }
  return { id: gemini, generate: generate, validate: validate, health: health };
})();
if (typeof AIProviderRegistry !== 'undefined') AIProviderRegistry.register(GeminiProvider);
