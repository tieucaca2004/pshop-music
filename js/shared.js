/**
 * js/shared.js — Shared utility functions for PSH Platform.
 * Central location for commonly duplicated helpers.
 * All modules should import from here instead of redefining.
 */
var PSH = (function() {
  'use strict';

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    var src = (name || '?').trim();
    var parts = src.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : src.slice(0, 2).toUpperCase();
  }

  return {
    escapeHtml: escapeHtml,
    formatBytes: formatBytes,
    formatDate: formatDate,
    initials: initials
  };
})();
