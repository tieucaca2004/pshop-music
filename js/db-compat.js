/**
 * js/db-compat.js — Compatibility Layer (Phase 1).
 * Chuyển tiếp giữa legacy DB (node phẳng) và multi-tenant DB (businesses/{businessId}/...).
 * PShop Music dùng legacy, business mới dùng DBMT.
 * KHÔNG xóa API cũ. KHÔNG phá vỡ gì.
 */
var DBCompat = (function() {
  'use strict';

  // Registry: businessId -> { type: 'legacy' | 'mt' }
  var BUSINESS_MAP = {
    'pshop-music': { type: 'legacy' },
    'a-tieu': { type: 'mt' }
  };

  function getType(businessId) {
    var entry = BUSINESS_MAP[businessId];
    if (!entry) return 'mt'; // default: new businesses use mt
    return entry.type;
  }

  function isLegacy(businessId) {
    return getType(businessId) === 'legacy';
  }

  function register(businessId, type) {
    BUSINESS_MAP[businessId] = { type: type };
  }

  return { getType: getType, isLegacy: isLegacy, register: register };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = DBCompat; }
