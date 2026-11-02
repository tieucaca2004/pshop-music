/*
 * scripts/telegram-verify-bot.js — kiểm chứng CHỈ ĐỌC: token Telegram có thuộc đúng bot PSH không, và webhook đang trỏ đâu.
 *
 * Chỉ gọi getMe + getWebhookInfo (không đổi gì trên Telegram: KHÔNG setWebhook/deleteWebhook, không gửi tin nhắn).
 * Token CHỈ đọc từ biến môi trường TELEGRAM_BOT_TOKEN của tiến trình này — không nhận qua tham số dòng lệnh,
 * không in token, không in URL gọi API. Chỉ in: id/username của bot, kết quả so khớp, webhook (url đã che nếu chứa token),
 * số update đang chờ, lỗi giao hàng gần nhất.
 *
 *   $env:TELEGRAM_BOT_TOKEN = '<token của @PSH_Flatform_Bot>'    # Founder tự đặt, không dán vào chat
 *   node scripts/telegram-verify-bot.js [--expect-id 9281952823] [--expect-username PSH_Flatform_Bot] [--expect-webhook-url <url>]
 *
 * Mã thoát: 0 = token đúng bot + có webhook (khớp --expect-webhook-url nếu có) · 2 = thiếu token/tham số sai/API base không hợp lệ ·
 *           3 = Telegram API lỗi (token bị thu hồi/sai, lỗi mạng) · 4 = token thuộc bot KHÁC · 5 = webhook khác URL mong đợi ·
 *           6 = chưa đăng ký webhook · 1 = lỗi ngoài dự kiến.
 * TELEGRAM_API_BASE chỉ được trỏ về http://127.0.0.1:<port> (để test cục bộ); mọi giá trị khác bị từ chối.
 */
'use strict';

const DEFAULT_EXPECT_ID = '9281952823';
const DEFAULT_EXPECT_USERNAME = 'PSH_Flatform_Bot';

function parseArgs(argv) {
  const out = { expectId: DEFAULT_EXPECT_ID, expectUsername: DEFAULT_EXPECT_USERNAME, expectWebhookUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--expect-id' && v) { out.expectId = String(v); i++; }
    else if (a === '--expect-username' && v) { out.expectUsername = String(v).replace(/^@/, ''); i++; }
    else if (a === '--expect-webhook-url' && v) { out.expectWebhookUrl = String(v); i++; }
    else return { error: 'Tham số không hợp lệ: ' + a + ' (token chỉ nhận qua biến môi trường TELEGRAM_BOT_TOKEN).' };
  }
  return out;
}

function redact(s, token) {
  let m = String(s == null ? '' : s);
  if (token) m = m.split(token).join('***');
  return m.replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, 'bot***');
}

// safeUrl — chỉ in scheme+host+path; bỏ query/fragment/userinfo (có thể chứa khoá/secret do người cấu hình tự thêm).
function safeUrl(u, token) {
  const raw = String(u == null ? '' : u);
  try {
    const p = new URL(raw);
    const extra = (p.search || p.hash || p.username || p.password) ? ' [đã ẩn query/thông tin đăng nhập]' : '';
    return redact(p.protocol + '//' + p.host + p.pathname, token) + extra;
  } catch (e) { return '(URL không phân tích được — đã ẩn)'; }
}

function apiBase(env) {
  const b = env.TELEGRAM_API_BASE;
  if (!b) return 'https://api.telegram.org';
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(b)) throw new Error('TELEGRAM_API_BASE chỉ được là http://127.0.0.1:<port>.');
  return b;
}

async function call(base, token, method) {
  // redirect:'error' — không bao giờ đi theo chuyển hướng (token nằm trong đường dẫn URL).
  const r = await fetch(base + '/bot' + token + '/' + method, { method: 'GET', redirect: 'error' });
  let j = null;
  try { j = await r.json(); } catch (e) { /* body không phải JSON */ }
  return { http: r.status, body: j };
}

async function run(argv, env, log) {
  const args = parseArgs(argv);
  if (args.error) { log(args.error); return 2; }
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) { log('Thiếu biến môi trường TELEGRAM_BOT_TOKEN. Không có gì được gọi.'); return 2; }
  const idPrefix = token.split(':')[0];
  let base;
  try { base = apiBase(env); } catch (e) { log(e.message); return 2; }

  let me;
  try { me = await call(base, token, 'getMe'); } catch (e) { log('getMe lỗi mạng: ' + redact(e && e.message, token)); return 3; }
  if (!me.body || !me.body.ok || !me.body.result) { log('getMe thất bại (HTTP ' + me.http + '): token không hợp lệ hoặc đã bị thu hồi.'); return 3; }
  const bot = me.body.result;
  const idOk = String(bot.id) === args.expectId;
  const userOk = String(bot.username || '').toLowerCase() === args.expectUsername.toLowerCase();
  log('Bot của token: id=' + bot.id + ' username=@' + (bot.username || '?') + ' is_bot=' + !!bot.is_bot);
  log('Bot mong đợi:  id=' + args.expectId + ' username=@' + args.expectUsername);
  log('So khớp: id ' + (idOk ? 'KHỚP' : 'KHÔNG KHỚP') + ' · username ' + (userOk ? 'KHỚP' : 'KHÔNG KHỚP') + (String(idPrefix) === String(bot.id) ? '' : ' (lưu ý: tiền tố token khác id Telegram trả về)'));
  let code = idOk && userOk ? 0 : 4;
  if (code !== 0) { log('KẾT LUẬN: token này KHÔNG thuộc bot PSH — không dùng để cấu hình TELEGRAM_BOT_TOKEN.'); return code; }

  let wh;
  try { wh = await call(base, token, 'getWebhookInfo'); } catch (e) { log('getWebhookInfo lỗi mạng: ' + redact(e && e.message, token)); return 3; }
  if (!wh.body || !wh.body.ok || !wh.body.result) { log('getWebhookInfo thất bại (HTTP ' + wh.http + ').'); return 3; }
  const w = wh.body.result;
  log('Webhook: ' + (w.url ? safeUrl(w.url, token) : '(CHƯA ĐĂNG KÝ)'));
  if (!w.url) { log('KẾT LUẬN: token đúng bot PSH nhưng webhook CHƯA được đăng ký (Telegram sẽ không gửi update tới function).'); return 6; }
  log('pending_update_count=' + (w.pending_update_count == null ? '?' : w.pending_update_count) + ' · has_custom_certificate=' + !!w.has_custom_certificate);
  if (w.last_error_message) log('Lỗi giao hàng gần nhất: ' + redact(w.last_error_message, token) + (w.last_error_date ? ' (unix ' + w.last_error_date + ')' : ''));
  else log('Lỗi giao hàng gần nhất: (không có)');
  if (args.expectWebhookUrl) {
    const same = w.url === args.expectWebhookUrl;
    log('Webhook so với URL mong đợi: ' + (same ? 'KHỚP' : 'KHÔNG KHỚP'));
    if (!same) code = 5;
  }
  log(code === 0 ? 'KẾT LUẬN: token đúng bot PSH. (Chưa chứng minh secret_token của webhook hay việc xử lý update thành công.)' : 'KẾT LUẬN: webhook chưa đúng.');
  return code;
}

module.exports = { run, parseArgs, redact };

if (require.main === module) {
  run(process.argv.slice(2), process.env, (l) => console.log(l)).then((c) => process.exit(c), (e) => { console.error('Lỗi: ' + redact(e && e.message, process.env.TELEGRAM_BOT_TOKEN)); process.exit(1); });
}
