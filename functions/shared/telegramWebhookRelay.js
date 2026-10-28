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
  // G1Q — secret dành riêng cho Telegram: RTDB `telegramWebhookSecret` (ưu tiên). Nếu chưa cấu hình thì
  // dùng tạm `webhookSigningSecret` (hành vi cũ). Khi hai giá trị trùng nhau, ai biết secret gateway
  // (X-PSH-Webhook-Secret) cũng giả được Telegram → nên cấu hình `telegramWebhookSecret` khác biệt và
  // chạy lại setWebhook (thao tác của chủ dự án, xem docs/FACEBOOK_INTEGRATION_SETUP.md).
  const providedToken = (req.get && req.get('X-Telegram-Bot-Api-Secret-Token')) || '';
  const dedicated = await admin.database().ref('telegramWebhookSecret').once('value').then(s => s.val() || '');
  const sharedFallback = !dedicated;
  const expectedSecret = dedicated || await admin.database().ref('webhookSigningSecret').once('value').then(s => s.val() || '');
  if (!expectedSecret || !safeEqual(providedToken, expectedSecret)) {
    return res.status(200).json({ ok: false, handled: false, reason: 'auth' });
  }
  // Fallback CÓ GIỚI HẠN và KHÔNG im lặng: chỉ để không làm hỏng luồng duyệt hiện tại trước khi chủ dự án
  // cấu hình telegramWebhookSecret. Mỗi request hợp lệ đi qua fallback đều ghi cảnh báo (không chứa giá trị secret)
  // để thấy rõ trong log rằng secret dùng chung CHƯA an toàn bằng secret riêng.
  if (sharedFallback) {
    console.warn('[telegramWebhook] CANH BAO: telegramWebhookSecret chua duoc cau hinh — dang dung chung webhookSigningSecret (fallback tam thoi, kem an toan hon secret rieng). Xem docs/FACEBOOK_INTEGRATION_SETUP.md.');
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
    get: (header) => header === 'X-PSH-Webhook-Secret' ? expectedSecret : undefined,
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
