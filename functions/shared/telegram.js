/*
 * shared/telegram.js — Telegram Sender (PHASE D Telegram Router).
 *
 * Sender đơn giản — gửi tin nhắn Telegram qua Bot API. KHÔNG phụ thuộc
 * secret Cloud Function (token truyền vào qua tham số), để dùng được ở:
 *   - notification workflow (notification.created → gửi telegram cho founder)
 *   - retry/workflow notify (eventBus consumer)
 *   - fbPublisher: gửi preview bài đăng + inline keyboard approve/cancel
 *   - bất kỳ nơi nào cần notify qua Telegram.
 *
 * Sprint 15 Phase FB: thêm sendPhoto (ảnh + caption + replyMarkup) và
 * answerCallbackQuery (ack callback từ inline keyboard). sendMessage mở
 * rộng nhận optional replyMarkup — backward-compatible hoàn toàn.
 */

// sendMessage — gửi 1 tin nhắn Telegram (best-effort, không throw ra ngoài nếu bot token chưa set).
// replyMarkup (optional) — Telegram InlineKeyboardMarkup object, vd:
//   { inline_keyboard: [[{ text: '✅ Duyệt', callback_data: 'fb_approve:draftId' }]] }
async function sendMessage({ token, chatId, text, replyMarkup }) {
  if (!token || !chatId || !text) {
    return { ok: false, error: 'Missing token/chatId/text' };
  }
  try {
    const body = { chat_id: chatId, text: text, disable_web_page_preview: true };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return { ok: !!data.ok, result: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// sendPhoto — gửi ảnh kèm caption và inline keyboard (tùy chọn).
// photo: URL ảnh công khai hoặc file_id Telegram.
async function sendPhoto({ token, chatId, photo, caption, replyMarkup }) {
  if (!token || !chatId || !photo) {
    return { ok: false, error: 'Missing token/chatId/photo' };
  }
  try {
    const body = { chat_id: chatId, photo };
    if (caption) body.caption = caption;
    if (replyMarkup) body.reply_markup = replyMarkup;
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return { ok: !!data.ok, result: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// answerCallbackQuery — ack callback_query sau khi xử lý inline keyboard button.
// Telegram yêu cầu phải answer trong 30s hoặc user thấy loading mãi.
async function answerCallbackQuery({ token, callbackQueryId, text }) {
  if (!token || !callbackQueryId) {
    return { ok: false, error: 'Missing token/callbackQueryId' };
  }
  try {
    const body = { callback_query_id: callbackQueryId };
    if (text) body.text = text;
    const r = await fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return { ok: !!data.ok, result: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMessage, sendPhoto, answerCallbackQuery };
