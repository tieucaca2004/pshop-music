/*
 * shared/telegramWebhookRelay.js — Telegram → fbPublisher relay logic.
 *
 * Tách riêng để test được độc lập (không cần Firebase Functions SDK).
 * index.js gọi handleTelegramWebhook() bên trong exports.telegramWebhook.
 *
 * Xem comment chi tiết tại exports.telegramWebhook trong index.js.
 */
'use strict';

const admin = require('firebase-admin');
const { sendSuccess, sendError } = require('./middleware');
const fbPublisherRoutes = require('../routes/fbPublisher');
const { safeEqual } = require('./secretCompare');
const { markRelayTrusted } = require('./relayTrust');
const secrets = require('./telegramSecrets');

/**
 * handleTelegramWebhook — xử lý 1 Telegram update.
 *
 * @param {object} req  — Express-like request (cần .method, .get(), .body)
 * @param {object} res  — Express-like response (cần .status().json() / .json())
 */
async function handleTelegramWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Validate X-Telegram-Bot-Api-Secret-Token — do Telegram tự thêm khi setWebhook
  // có secret_token. Trả 200 khi fail để Telegram không retry liên tục.
  // Phase 5 — secret CHỈ lấy từ Functions secret TELEGRAM_WEBHOOK_SECRET (Secret Manager), KHÔNG đọc RTDB và KHÔNG có fallback
  // sang secret dùng chung của gateway. Chưa cấu hình ⇒ từ chối mọi request (fail-closed), chỉ ghi log lý do (không có giá trị).
  const providedToken = (req.get && req.get('X-Telegram-Bot-Api-Secret-Token')) || '';
  const expectedSecret = secrets.getTelegramWebhookSecret();
  if (!expectedSecret) {
    console.error('[telegramWebhook] TELEGRAM_WEBHOOK_SECRET chưa được cấu hình (Functions secret) — từ chối mọi request.');
    return res.status(200).json({ ok: false, handled: false, reason: 'auth' });
  }
  if (!safeEqual(providedToken, expectedSecret)) {
    return res.status(200).json({ ok: false, handled: false, reason: 'auth' });
  }
  const update = req.body || {};
  const { callback_query } = update;

  // Tin nhắn thường: luồng nhận sản phẩm qua Telegram (ảnh + Tên/Giá/Tình trạng). Mọi kiểm tra quyền/idempotency nằm
  // trong contentOrchestrator. Luôn trả 200 (Telegram retry khi non-200); lỗi nội bộ chỉ ghi log KHÔNG kèm dữ liệu nhạy cảm.
  if (!callback_query) {
    if (update.message) {
      try {
        const out = await require('./contentOrchestrator').handleTelegramMessage(update);
        return res.status(200).json({ ok: true, handled: !!(out && out.handled) });
      } catch (e) {
        console.error('[telegramWebhook] message handler error:', String((e && e.message) || e).replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, 'bot***').slice(0, 200));
        return res.status(200).json({ ok: true, handled: false });
      }
    }
    return res.status(200).json({ ok: true, handled: false });
  }

  // Chỉ xử lý callback bắt đầu bằng "fb_" — bỏ qua callback của module khác
  if (!(callback_query.data || '').startsWith('fb_')) {
    return res.status(200).json({ ok: true, handled: false });
  }

  // Gọi fbPublisher callback handler trong process — inject X-PSH-Webhook-Secret
  const internalReq = markRelayTrusted({
    method: 'POST',
    __pshPath: '/v1/facebook-publisher/callback',
    body: { callback_query },
    get: () => undefined, // request nội bộ đã được tin cậy qua relayTrust; KHÔNG truyền secret nào
    query: {}
  });

  let capturedCode = 200;
  let capturedBody = null;
  const internalRes = {
    status: function (code) { capturedCode = code; return this; },
    json: function (data) { capturedBody = data; }
  };

  await fbPublisherRoutes.handle(internalReq, internalRes, { sendSuccess, sendError });

  return res.status(capturedCode).json(capturedBody || { ok: true });
}

module.exports = { handleTelegramWebhook };
