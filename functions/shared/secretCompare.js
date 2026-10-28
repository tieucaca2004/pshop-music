/*
 * shared/secretCompare.js — so sánh secret theo thời gian không đổi (chống timing attack).
 * Dùng cho X-PSH-Webhook-Secret và X-Telegram-Bot-Api-Secret-Token.
 */
const crypto = require('crypto');

function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!expected) return false;
  // Băm cả hai về độ dài cố định để timingSafeEqual không rò độ dài secret.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { safeEqual };
