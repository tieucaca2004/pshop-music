/*
 * shared/webhook.js — Webhook Framework (Sprint 14 Phase 1, FINAL mục 14).
 * Gửi callback tới URL client cung cấp (vd OpenClaw) khi 1 Async Job xong,
 * kèm chữ ký HMAC (header X-PSH-Signature) để client xác thực đúng nguồn,
 * chống giả mạo webhook — KHÔNG có logic nghiệp vụ nào ở đây (thuần hạ tầng
 * gửi + ký, nội dung payload do caller ở Phase sau tự quyết định).
 */
const crypto = require('crypto');
const { defineSecret } = require('firebase-functions/params');

// WEBHOOK_SIGNING_SECRET — khoá ký riêng cho webhook, KHÔNG dùng chung
// OPENAI_API_KEY/FACEBOOK_APP_SECRET (mỗi secret 1 mục đích, tách rủi ro).
const WEBHOOK_SIGNING_SECRET = defineSecret('WEBHOOK_SIGNING_SECRET');

function sign(payloadString, secretValue) {
  return crypto.createHmac('sha256', secretValue).update(payloadString).digest('hex');
}

// sendWebhook — best-effort, KHÔNG throw ra ngoài (1 webhook lỗi không được
// làm hỏng luồng chính đã hoàn tất) — trả {ok, status, error} để caller tự
// quyết định có retry/log lại không (Retry Framework, shared/retry.js).
async function sendWebhook(url, payload) {
  if (!url) return { ok: false, error: 'Thiếu webhookUrl.' };
  try {
    const secretValue = WEBHOOK_SIGNING_SECRET.value();
    const payloadString = JSON.stringify(payload);
    const signature = sign(payloadString, secretValue);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PSH-Signature': signature
      },
      body: payloadString
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendWebhook, sign, WEBHOOK_SIGNING_SECRET };
