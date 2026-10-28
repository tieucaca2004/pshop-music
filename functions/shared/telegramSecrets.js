/*
 * shared/telegramSecrets.js — nơi DUY NHẤT đọc các secret của luồng Telegram→Facebook.
 *
 * Secret KHÔNG nằm trong Realtime Database (quyền gốc `superAdmins` cho phép super_admin đọc/ghi toàn cây từ trình duyệt, và
 * rule con `false` không chặn được — xem tests/telegram-config-rules-exposure.test.js). Secret nằm trong Secret Manager và chỉ
 * được Cloud Functions đọc qua biến môi trường khi hàm ĐƯỢC BIND secret đó (index.js: defineSecret + `secrets: [...]`):
 *
 *   TELEGRAM_BOT_TOKEN       — telegramWebhook, apiGateway (gửi bản xem trước từ route /v1/facebook-publisher)
 *   TELEGRAM_WEBHOOK_SECRET  — telegramWebhook (so với header X-Telegram-Bot-Api-Secret-Token)
 *   COMPOSITOR_SECRET        — telegramWebhook (header gọi máy chủ compositor)
 *   WEBHOOK_SIGNING_SECRET   — apiGateway (đã có từ trước; thay cho RTDB `webhookSigningSecret`)
 *
 * RTDB `telegramConfig` chỉ còn cấu hình KHÔNG bí mật: chatId, approverIds, approverMap, publishRoles, dryRun, allowedPageIds,
 * allowGatewayCallback. Nếu RTDB vẫn còn trường bí mật cũ (token/botToken/secret/…) thì chúng BỊ BỎ QUA (không bao giờ được dùng)
 * và có cảnh báo trong log — chỉ ghi TÊN khoá, KHÔNG ghi giá trị.
 *
 * Mọi hàm ở đây KHÔNG trả secret ra response, KHÔNG ghi log giá trị secret.
 */
'use strict';
const admin = require('firebase-admin');

const LEGACY_SECRET_KEYS = ['token', 'botToken', 'bot_token', 'secret', 'webhookSecret', 'webhook_secret', 'apiKey'];

function fromEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}
const getBotToken = () => fromEnv('TELEGRAM_BOT_TOKEN');
const getTelegramWebhookSecret = () => fromEnv('TELEGRAM_WEBHOOK_SECRET');
const getCompositorSecret = () => fromEnv('COMPOSITOR_SECRET');
const getGatewaySigningSecret = () => fromEnv('WEBHOOK_SIGNING_SECRET');

const warned = new Set();
function warnOnce(key, msg) { if (warned.has(key)) return; warned.add(key); console.warn(msg); }

// loadTelegramConfig — cấu hình Telegram = RTDB (phần không bí mật) + bot token từ Functions secret.
// `token` rỗng nghĩa là chưa cấu hình secret: các nơi dùng đều coi là "chưa cấu hình" và dừng an toàn.
async function loadTelegramConfig() {
  const snap = await admin.database().ref('telegramConfig').once('value');
  const raw = snap.val() || {};
  const cfg = {};
  const legacy = [];
  for (const k of Object.keys(raw)) { if (LEGACY_SECRET_KEYS.indexOf(k) >= 0) legacy.push(k); else cfg[k] = raw[k]; }
  if (legacy.length) {
    warnOnce('legacy-telegramConfig', '[telegramConfig] CẢNH BÁO: RTDB còn trường bí mật cũ (' + legacy.join(', ') + ') — BỊ BỎ QUA, chỉ Functions secret được dùng. Hãy xoá các trường này khỏi RTDB. (không in giá trị)');
  }
  cfg.token = getBotToken();
  return cfg;
}

// getCompositorConfig — cấu hình provider compositor từ RTDB (không bí mật) + secret từ Functions secret.
function withCompositorSecret(comp) {
  if (!comp || typeof comp !== 'object') return comp;
  const out = Object.assign({}, comp);
  if ('secret' in out) { warnOnce('legacy-imageRouter', '[imageRouterConfig] CẢNH BÁO: RTDB còn trường "secret" — BỊ BỎ QUA, chỉ COMPOSITOR_SECRET (Functions secret) được dùng. (không in giá trị)'); delete out.secret; }
  out.secret = getCompositorSecret();
  return out;
}

module.exports = { getBotToken, getTelegramWebhookSecret, getCompositorSecret, getGatewaySigningSecret, loadTelegramConfig, withCompositorSecret, LEGACY_SECRET_KEYS };
