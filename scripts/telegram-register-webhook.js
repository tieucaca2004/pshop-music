/*
 * scripts/telegram-register-webhook.js — Founder TỰ chạy để đăng ký webhook của @PSH_Flatform_Bot tới telegramWebhook production.
 *
 * Mặc định CHỈ XEM TRƯỚC (getMe + in việc sẽ làm) — không đổi gì trên Telegram. Chỉ khi có --confirm mới gọi setWebhook.
 * Luôn xác minh getMe = bot PSH (id 9281952823, @PSH_Flatform_Bot) TRƯỚC; sai bot ⇒ dừng, không gọi setWebhook.
 * URL webhook CỐ ĐỊNH (không tham số hoá) = hàm telegramWebhook production us-central1 đã xác minh.
 * Token và secret_token CHỈ đọc từ biến môi trường (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET); không nhận qua tham số,
 * không in, không ghi file. secret_token phải đúng bằng giá trị Functions secret TELEGRAM_WEBHOOK_SECRET.
 * TELEGRAM_API_BASE chỉ được là http://127.0.0.1:<port> (test cục bộ). Không theo redirect.
 *
 * Mã thoát: 0 = xong (xem trước OK, hoặc đã đăng ký và getWebhookInfo khớp) · 2 = thiếu/sai biến môi trường hoặc tham số ·
 *           3 = Telegram API lỗi · 4 = token thuộc bot KHÁC (không gọi setWebhook) · 5 = setWebhook xong nhưng webhook không khớp · 1 = lỗi khác.
 */
'use strict';

const WEBHOOK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/telegramWebhook';
const EXPECT_ID = '9281952823';
const EXPECT_USERNAME = 'PSH_Flatform_Bot';
const SECRET_RE = /^[A-Za-z0-9_-]{16,256}$/; // ký tự Telegram cho phép trong secret_token

function redact(s, token, secret) {
  let m = String(s == null ? '' : s);
  if (token) m = m.split(token).join('***');
  if (secret) m = m.split(secret).join('***');
  return m.replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, 'bot***');
}
function apiBase(env) {
  const b = env.TELEGRAM_API_BASE;
  if (!b) return 'https://api.telegram.org';
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(b)) throw new Error('TELEGRAM_API_BASE chỉ được là http://127.0.0.1:<port>.');
  return b;
}
async function call(base, token, method, body) {
  const opt = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error' }
    : { method: 'GET', redirect: 'error' };
  const r = await fetch(base + '/bot' + token + '/' + method, opt);
  let j = null;
  try { j = await r.json(); } catch (e) { /* không phải JSON */ }
  return { http: r.status, body: j };
}

async function run(argv, env, log) {
  let confirm = false;
  for (const a of argv) {
    if (a === '--confirm') confirm = true;
    else { log('Tham số không hợp lệ: ' + a + ' (chỉ nhận --confirm; token/secret chỉ qua biến môi trường).'); return 2; }
  }
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const secret = (env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!token) { log('Thiếu biến môi trường TELEGRAM_BOT_TOKEN.'); return 2; }
  if (!secret) { log('Thiếu biến môi trường TELEGRAM_WEBHOOK_SECRET.'); return 2; }
  if (!SECRET_RE.test(secret)) { log('TELEGRAM_WEBHOOK_SECRET không hợp lệ: cần 16–256 ký tự, chỉ gồm A-Z a-z 0-9 _ - (giá trị không được in).'); return 2; }
  let base;
  try { base = apiBase(env); } catch (e) { log(e.message); return 2; }

  let me;
  try { me = await call(base, token, 'getMe'); } catch (e) { log('getMe lỗi mạng: ' + redact(e && e.message, token, secret)); return 3; }
  if (!me.body || !me.body.ok || !me.body.result) { log('getMe thất bại (HTTP ' + me.http + '): token không hợp lệ hoặc đã bị thu hồi.'); return 3; }
  const bot = me.body.result;
  log('Bot của token: id=' + bot.id + ' username=@' + (bot.username || '?'));
  if (String(bot.id) !== EXPECT_ID || String(bot.username || '').toLowerCase() !== EXPECT_USERNAME.toLowerCase()) {
    log('DỪNG: token KHÔNG thuộc @' + EXPECT_USERNAME + ' (id ' + EXPECT_ID + '). Không gọi setWebhook.');
    return 4;
  }
  log('Webhook sẽ đăng ký: ' + WEBHOOK_URL + ' (kèm secret_token, allowed_updates=message,callback_query)');
  if (!confirm) { log('CHẾ ĐỘ XEM TRƯỚC — chưa đổi gì trên Telegram. Chạy lại với --confirm để đăng ký thật.'); return 0; }

  let set;
  try {
    set = await call(base, token, 'setWebhook', { url: WEBHOOK_URL, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
  } catch (e) { log('setWebhook lỗi mạng: ' + redact(e && e.message, token, secret)); return 3; }
  if (!set.body || !set.body.ok) { log('setWebhook thất bại (HTTP ' + set.http + '): ' + redact(set.body && set.body.description, token, secret)); return 3; }
  log('setWebhook: OK');
  let wh;
  try { wh = await call(base, token, 'getWebhookInfo'); } catch (e) { log('getWebhookInfo lỗi mạng: ' + redact(e && e.message, token, secret)); return 3; }
  const w = wh.body && wh.body.result;
  if (!w) { log('getWebhookInfo thất bại (HTTP ' + wh.http + ').'); return 3; }
  const same = w.url === WEBHOOK_URL;
  log('Webhook hiện tại: ' + (same ? WEBHOOK_URL + ' (KHỚP)' : '(KHÔNG KHỚP URL mong đợi)') + ' · pending_update_count=' + (w.pending_update_count == null ? '?' : w.pending_update_count));
  if (w.last_error_message) log('Lỗi giao hàng gần nhất: ' + redact(w.last_error_message, token, secret));
  return same ? 0 : 5;
}

module.exports = { run, WEBHOOK_URL };

if (require.main === module) {
  run(process.argv.slice(2), process.env, (l) => console.log(l)).then(
    (c) => process.exit(c),
    (e) => { console.error('Lỗi: ' + redact(e && e.message, process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_WEBHOOK_SECRET)); process.exit(1); }
  );
}
