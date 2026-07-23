/*
 * shared/logger.js — Structured Logging (Phase 5, Task 21.0).
 *
 * Lightweight structured logger with levels and request context.
 * Prepares abstraction layer for Cloud Logging, Sentry, OpenTelemetry.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.info;

function formatLog(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    requestId: (meta && meta.requestId) || '',
    businessId: (meta && meta.businessId) || '',
    userId: (meta && meta.userId) || '',
    endpoint: (meta && meta.endpoint) || '',
    method: (meta && meta.method) || '',
    duration: (meta && meta.duration) || 0
  };
  if (meta && meta.error) entry.error = meta.error.message || String(meta.error);
  if (meta && meta.details) entry.details = meta.details;

  if (CURRENT_LEVEL <= LOG_LEVELS[level]) {
    var output = '[' + level.toUpperCase() + '] ' + entry.timestamp;
    if (entry.requestId) output += ' [' + entry.requestId + ']';
    if (entry.businessId) output += ' {' + entry.businessId + '}';
    output += ' ' + message;
    console.log(JSON.stringify(entry));
  }
}

const logger = {
  debug: function(msg, meta) { formatLog('debug', msg, meta); },
  info: function(msg, meta) { formatLog('info', msg, meta); },
  warn: function(msg, meta) { formatLog('warn', msg, meta); },
  error: function(msg, meta) { formatLog('error', msg, meta); }
};

module.exports = logger;
