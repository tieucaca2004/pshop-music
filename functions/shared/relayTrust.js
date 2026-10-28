/*
 * shared/relayTrust.js — dấu "request đã được relay Telegram xác thực" (G1Q).
 *
 * Vấn đề: handler /v1/facebook-publisher/callback tin payload callback_query (from.id, message.chat.id)
 * để biết AI bấm Duyệt. Payload đó chỉ đáng tin khi nó thật sự đến từ Telegram — tức là đã qua
 * X-Telegram-Bot-Api-Secret-Token ở shared/telegramWebhookRelay.js. Một request HTTP bất kỳ gửi thẳng vào
 * gateway (chỉ cần biết X-PSH-Webhook-Secret) thì có thể tự điền from.id/chat.id.
 *
 * Giải pháp: relay gắn vào đối tượng request NỘI BỘ (tạo trong tiến trình, không phải request HTTP) một
 * thuộc tính mang token ngẫu nhiên sinh khi tiến trình khởi động. Request HTTP không thể đặt thuộc tính JS
 * tuỳ ý lên đối tượng req (header/body không ánh xạ thành thuộc tính này), nên handler phân biệt được
 * "đã qua relay" với "gọi thẳng". Token không bao giờ rời tiến trình, không ghi log.
 */
const crypto = require('crypto');

const RELAY_TRUST_TOKEN = crypto.randomBytes(32).toString('hex');
const RELAY_TRUST_KEY = '__pshRelayTrust';

function markRelayTrusted(internalReq) {
  internalReq[RELAY_TRUST_KEY] = RELAY_TRUST_TOKEN;
  return internalReq;
}

function isRelayTrusted(req) {
  return !!req && typeof req[RELAY_TRUST_KEY] === 'string' && req[RELAY_TRUST_KEY] === RELAY_TRUST_TOKEN;
}

module.exports = { markRelayTrusted, isRelayTrusted };
