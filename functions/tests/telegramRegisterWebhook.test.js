/*
 * tests/telegramRegisterWebhook.test.js — scripts/telegram-register-webhook.js với server Telegram GIẢ (127.0.0.1).
 * Không gọi Telegram thật. Chạy: node tests/telegramRegisterWebhook.test.js (từ functions/).
 */
'use strict';
const http = require('http');
const path = require('path');
const { run, WEBHOOK_URL } = require(path.join(__dirname, '..', '..', 'scripts', 'telegram-register-webhook.js'));

const PSH = '9281952823:AAFAKEpshTOKENfakeFAKEtokenFAKE0001';
const OTHER = '8814262543:AAFAKEotherTOKENfakeFAKEtoken0002';
const SECRET = 'SECRETfake_0123456789-abcdef';
let pass = 0, fail = 0;
async function t(n, f) { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const leak = (s) => s.indexOf('AAFAKE') >= 0 || s.indexOf(SECRET) >= 0;

function mock(opts) {
  opts = opts || {};
  const calls = [];
  let url = '';
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => {
      const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
      const send = (o, c) => { res.writeHead(c || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (!m) return send({ ok: false }, 404);
      const bots = {};
      bots[PSH] = { id: 9281952823, username: 'PSH_Flatform_Bot' };
      bots[OTHER] = { id: 8814262543, username: 'OtherBot' };
      const bot = bots[m[1]];
      if (!bot) return send({ ok: false }, 401);
      calls.push({ method: m[2], body: b ? JSON.parse(b) : null });
      if (m[2] === 'getMe') return send({ ok: true, result: bot });
      if (m[2] === 'setWebhook') {
        if (opts.setFail) return send({ ok: false, description: 'Bad Request: bad webhook ' + SECRET }, 400);
        url = JSON.parse(b).url;
        return send({ ok: true, result: true });
      }
      if (m[2] === 'getWebhookInfo') return send({ ok: true, result: { url: opts.wrongUrl ? 'https://khac.example/x' : url, pending_update_count: 0 } });
      return send({ ok: false }, 404);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, base: 'http://127.0.0.1:' + srv.address().port })));
}
async function exec(argv, env) {
  const out = [];
  const code = await run(argv, env, (l) => out.push(l));
  return { code, out: out.join('\n') };
}

(async () => {
  console.log('\n=== telegram-register-webhook (server Telegram giả, 127.0.0.1) ===');
  await t('Không có --confirm: chỉ getMe, KHÔNG gọi setWebhook, exit 0', async () => {
    const m = await mock();
    const r = await exec([], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(r.code === 0 && /XEM TRƯỚC/.test(r.out) && m.calls.map((c) => c.method).join() === 'getMe', m.calls.map((c) => c.method).join());
    ok(!leak(r.out), 'lộ');
  });
  await t('--confirm: getMe → setWebhook (URL cố định + secret_token + allowed_updates) → getWebhookInfo, exit 0, không lộ', async () => {
    const m = await mock();
    const r = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(r.code === 0, r.out);
    ok(m.calls.map((c) => c.method).join() === 'getMe,setWebhook,getWebhookInfo');
    const s = m.calls[1].body;
    ok(s.url === WEBHOOK_URL && s.url === 'https://us-central1-pshop-music.cloudfunctions.net/telegramWebhook', 'url');
    ok(s.secret_token === SECRET, 'secret_token');
    ok(s.drop_pending_updates === false, 'drop_pending_updates');
    ok(s.allowed_updates.join() === 'message,callback_query', 'allowed_updates');
    ok(/KHỚP/.test(r.out) && !leak(r.out), 'output');
  });
  await t('Token bot KHÁC + --confirm → exit 4, KHÔNG setWebhook', async () => {
    const m = await mock();
    const r = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: OTHER, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(r.code === 4 && m.calls.every((c) => c.method === 'getMe') && !leak(r.out));
  });
  await t('Thiếu token / thiếu secret / secret sai định dạng → exit 2, không gọi gì, không in secret', async () => {
    const m = await mock();
    const a = await exec(['--confirm'], { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    const b = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_API_BASE: m.base });
    const c = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: 'ngan!', TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(a.code === 2 && b.code === 2 && c.code === 2 && m.calls.length === 0 && !leak(a.out + b.out + c.out));
  });
  await t('Tham số khác (url/token qua dòng lệnh) bị từ chối', async () => {
    const r = await exec(['--confirm', '--url', 'https://evil.example'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET });
    ok(r.code === 2);
  });
  await t('API base lạ bị từ chối', async () => {
    const r = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: 'https://evil.example' });
    ok(r.code === 2);
  });
  await t('setWebhook thất bại (Telegram echo secret trong lỗi) → exit 3, secret bị che', async () => {
    const m = await mock({ setFail: true });
    const r = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(r.code === 3 && !leak(r.out), r.out);
  });
  await t('getWebhookInfo lệch URL sau khi đăng ký → exit 5', async () => {
    const m = await mock({ wrongUrl: true });
    const r = await exec(['--confirm'], { TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_API_BASE: m.base });
    m.srv.close();
    ok(r.code === 5);
  });
  console.log('\nPASSED: ' + pass + '  FAILED: ' + fail);
  process.exit(fail ? 1 : 0);
})();
