/*
 * tests/telegramVerifyBot.test.js — scripts/telegram-verify-bot.js: kiểm token đúng bot PSH / sai bot / thiếu token / không lộ token.
 * Chạy: node tests/telegramVerifyBot.test.js (từ functions/). Server Telegram GIẢ chỉ nghe 127.0.0.1 — không gọi Telegram thật.
 */
'use strict';
const http = require('http');
const path = require('path');
const { run } = require(path.join(__dirname, '..', '..', 'scripts', 'telegram-verify-bot.js'));

const PSH_TOKEN = '9281952823:AAFAKEpshTOKENfakeFAKEtokenFAKE0001';
const OTHER_TOKEN = '8814262543:AAFAKEotherTOKENfakeFAKEtoken0002';
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };

function startMock(webhookUrl, redirectTo) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.method + ' ' + req.url.replace(/bot[^/]+/, 'bot***'));
    if (redirectTo && /getMe$/.test(req.url)) { res.writeHead(302, { Location: redirectTo }); return res.end(); }
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
    const send = (o, code) => { res.writeHead(code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (!m) return send({ ok: false }, 404);
    const tok = m[1];
    const known = { [PSH_TOKEN]: { id: 9281952823, username: 'PSH_Flatform_Bot' }, [OTHER_TOKEN]: { id: 8814262543, username: 'OtherBot' } }[tok];
    if (!known) return send({ ok: false, description: 'Unauthorized' }, 401);
    if (m[2] === 'getMe') return send({ ok: true, result: Object.assign({ is_bot: true }, known) });
    if (m[2] === 'getWebhookInfo') return send({ ok: true, result: { url: webhookUrl, pending_update_count: 2, last_error_message: 'Wrong response from the webhook: 403' } });
    return send({ ok: false }, 404);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, seen, base: 'http://127.0.0.1:' + srv.address().port })));
}
async function exec(argv, env) { const lines = []; const code = await run(argv, env, (l) => lines.push(l)); return { code, out: lines.join('\n') }; }

(async () => {
  console.log('\n=== telegram-verify-bot (server Telegram giả, 127.0.0.1) ===');
  const m = await startMock('https://example.invalid/telegramWebhook');
  await t('Token đúng bot PSH → exit 0, in id/username và webhook, KHÔNG in token', async () => {
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m.base });
    ok(r.code === 0, 'code=' + r.code + ' ' + r.out); ok(/id=9281952823 username=@PSH_Flatform_Bot/.test(r.out)); ok(/example\.invalid\/telegramWebhook/.test(r.out));
    ok(r.out.indexOf(PSH_TOKEN) < 0 && r.out.indexOf('AAFAKE') < 0, 'lộ token'); ok(/Lỗi giao hàng gần nhất: Wrong response/.test(r.out));
  });
  await t('Token của bot KHÁC (8814262543) → exit 4, KHÔNG gọi getWebhookInfo, KHÔNG lộ token', async () => {
    const before = m.seen.length;
    const r = await exec([], { TELEGRAM_BOT_TOKEN: OTHER_TOKEN, TELEGRAM_API_BASE: m.base });
    ok(r.code === 4, 'code=' + r.code); ok(/KHÔNG thuộc bot PSH/.test(r.out)); ok(r.out.indexOf('AAFAKE') < 0);
    ok(m.seen.slice(before).every((s) => /getMe$/.test(s)), 'không được gọi gì ngoài getMe: ' + m.seen.slice(before).join(','));
  });
  await t('Thiếu TELEGRAM_BOT_TOKEN → exit 2, không gọi gì', async () => {
    const before = m.seen.length; const r = await exec([], { TELEGRAM_API_BASE: m.base });
    ok(r.code === 2 && m.seen.length === before);
  });
  await t('Token qua tham số dòng lệnh bị từ chối (không để token vào shell history)', async () => {
    const r = await exec(['--token', PSH_TOKEN], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m.base });
    ok(r.code === 2 && r.out.indexOf('AAFAKE') < 0);
  });
  await t('--expect-webhook-url khác webhook thật → exit 5', async () => {
    const r = await exec(['--expect-webhook-url', 'https://khac.example/x'], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m.base });
    ok(r.code === 5 && /KHÔNG KHỚP/.test(r.out));
  });
  await t('--expect-webhook-url khớp → exit 0', async () => {
    const r = await exec(['--expect-webhook-url', 'https://example.invalid/telegramWebhook'], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m.base });
    ok(r.code === 0);
  });
  await t('Token sai/thu hồi → exit 3, không lộ token', async () => {
    const r = await exec([], { TELEGRAM_BOT_TOKEN: '1:AAFAKEbadTOKENbadBADtokenBAD0003xx', TELEGRAM_API_BASE: m.base });
    ok(r.code === 3 && r.out.indexOf('AAFAKE') < 0);
  });
  await t('TELEGRAM_API_BASE khác 127.0.0.1 bị từ chối (token không bao giờ gửi tới host lạ)', async () => {
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: 'https://evil.example' });
    ok(r.code === 2);
  });
  await t('URL webhook có query/secret → chỉ in scheme+host+path, KHÔNG in query', async () => {
    const m2 = await startMock('https://example.invalid/hook?key=SUPERSECRETVALUE#frag');
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m2.base });
    m2.srv.close();
    ok(r.code === 0 && /example\.invalid\/hook/.test(r.out) && r.out.indexOf('SUPERSECRETVALUE') < 0 && /đã ẩn query/.test(r.out), r.out);
  });
  await t('Chưa đăng ký webhook (url rỗng) → exit 6', async () => {
    const m3 = await startMock('');
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m3.base });
    m3.srv.close();
    ok(r.code === 6 && /CHƯA/.test(r.out), 'code=' + r.code);
  });
  await t('Server trả redirect → không đi theo, exit 3, không lộ token', async () => {
    const m4 = await startMock('x', 'http://127.0.0.1:1/steal');
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH_TOKEN, TELEGRAM_API_BASE: m4.base });
    m4.srv.close();
    ok(r.code === 3 && r.out.indexOf('AAFAKE') < 0, 'code=' + r.code + ' ' + r.out);
  });
  m.srv.close();
  console.log('\nPASSED: ' + pass + '  FAILED: ' + fail);
  process.exit(fail ? 1 : 0);
})();
