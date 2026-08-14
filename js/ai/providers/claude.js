/**
 * js/ai/providers/claude.js — Provider stub (standardized).
 *
 * Coding Policy (Architecture Update 2026-07-25):
 * - Default coding provider: handles CRUD, small features, bugs, tests, boilerplate
 * - Requires API key to activate
 *
 * Implements IAIProvider interface (3 methods: generate, validate, health).
 * Integration complete — only needs API key + deploy.
 */
const ClaudeProvider = (function() {
  'use strict';
  var claude = 'claude';
  function generate() {
    return Promise.reject(new Error(claude + ' chưa được cấu hình. Cần API Key để kích hoạt.'));
  }
  function validate() {
    return Promise.resolve({ valid: false, reason: claude + ' API Key chưa được cấu hình.' });
  }
  function health() {
    return Promise.resolve({ healthy: false, message: claude + ' chưa kết nối. Cần API Key.' });
  }
  return { id: claude, generate: generate, validate: validate, health: health };
})();
if (typeof AIProviderRegistry !== 'undefined') AIProviderRegistry.register(ClaudeProvider);
