/*
 * shared/telegram.js — Telegram Sender (PHASE D Telegram Router).
 *
 * Sender đơn giản — gửi tin nhắn Telegram qua Bot API. KHÔNG phụ thuộc
 * secret Cloud Function (token truyền vào qua tham số), để dùng được ở:
 *   - notification workflow (notification.created → gửi telegram cho founder)
 *   - retry/workflow notify (eventBus consumer)
 *   - bất kỳ nơi nào cần notify qua Telegram.
 *
 * Telegram Bot API: POST https://api.telegram.org/bot{token}/sendMessage
 * (chat_id + text). Không mã hóa thêm — đúng API công khai.
 */

// sendMessage — gửi 1 tin nhắn Telegram (best-effort, không throw ra ngoài nếu bot token chưa set).
async function sendMessage({ token, chatId, text }) {
  if (!token || !chatId || !text) {
    return { ok: false, error: 'Missing token/chatId/text' };
  }
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true })
    });
    const data = await r.json();
    return { ok: !!data.ok, result: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMessage };
