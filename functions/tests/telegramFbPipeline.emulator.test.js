/*
 * tests/telegramFbPipeline.emulator.test.js — TÍCH HỢP với Firebase Emulator (Admin SDK THẬT: RTDB transaction + Storage).
 *
 * Khác telegramFbPipeline.test.js (RTDB/Storage giả trong bộ nhớ): ở đây RTDB và Storage là emulator thật, index.js thật
 * (exports.telegramWebhook gắn qua HTTP/express), aiGenerate thật (job + aiDrafts ghi vào RTDB). Chỉ các dịch vụ NGOÀI
 * (Telegram, Facebook Graph, OpenAI) là mock cục bộ — KHÔNG có request nào ra ngoài localhost.
 *
 *   firebase emulators:exec --only database,storage --project demo-pshop "node tests/telegramFbPipeline.emulator.test.js"
 * (đặt NODE_PATH tới functions/node_modules nếu chạy từ thư mục khác)
 */
'use strict';
const hostDb = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
const hostSt = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
const okHost = (h) => /^(127\.0\.0\.1|localhost):\d+$/.test(h);
if (!okHost(hostDb) || !okHost(hostSt)) { console.error('Từ chối chạy: cần emulator database + storage trên localhost.'); process.exit(2); }
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';
process.env.FACEBOOK_APP_SECRET = 'dummy'; process.env.OPENAI_API_KEY = 'sk-test-dummy'; process.env.WEBHOOK_SIGNING_SECRET = 'dummy'; process.env.DEEPSEEK_API_KEY = 'dummy';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-pshop', databaseURL: 'http://' + hostDb + '?ns=demo-pshop', storageBucket: 'demo-pshop.appspot.com' });

const path = require('path');
const F = path.join(__dirname, '..') + '/';
const rq = require('module').createRequire(F + 'index.js');

// ── fetch: localhost đi thật (emulator); dịch vụ ngoài là mock; còn lại bị chặn ──
const realFetch = global.fetch;
let calls = [], sentTg = [], blocked = [], nPost = 0, feedFail = false, openaiMode = 'ok';
const BOT = '987654:EMU-bot_tokenTOKENtokenTOKENtoken99';
const jres = (b, ok = true, st = 200) => ({ ok, status: st, json: async () => b, arrayBuffer: async () => Buffer.from(JSON.stringify(b)) });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
global.fetch = async (url, opts) => {
  url = String(url); const body = opts && typeof opts.body === 'string' ? opts.body : null;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return realFetch(url, opts);
  calls.push({ url, method: (opts && opts.method) || 'GET', body });
  if (url.startsWith('https://api.telegram.org/bot' + BOT + '/getFile')) return jres({ ok: true, result: { file_path: 'photos/x.jpg', file_size: JPEG.length } });
  if (url.startsWith('https://api.telegram.org/file/bot' + BOT + '/')) return { ok: true, status: 200, arrayBuffer: async () => JPEG };
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(sendMessage|sendPhoto|answerCallbackQuery)/);
  if (m) { sentTg.push(Object.assign({ kind: m[1] }, JSON.parse(body || '{}'))); return jres({ ok: true, result: { message_id: 500 + sentTg.length } }); }
  if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
    if (openaiMode === 'fail') return jres({ error: { message: 'insufficient_quota' } }, false, 429);
    return jres({ choices: [{ message: { content: JSON.stringify({ versions: [{ hook: 'Deck DJ cực chất', caption: 'Pioneer DDJ-400 phù hợp người mới học mix nhạc.', cta: 'Nhắn Pshop Music ngay', hashtags: ['DJ', 'Pioneer'] }] }) } }] });
  }
  const g = url.match(/graph\.facebook\.com\/v19\.0\/([^/?]+)(\/photos|\/feed)?(\?fields=id,name)?/);
  if (g) {
    if (g[3]) return jres({ id: g[1], name: 'Fanpage Emulator' });
    if (g[2] === '/photos') return jres({ id: 'ph_' + (++nPost) });
    if (g[2] === '/feed') return feedFail ? jres({ error: { message: '(#200) Permissions error' } }, false, 403) : jres({ id: g[1] + '_post' + (++nPost) });
  }
  blocked.push(url); throw new Error('Test chặn request ra ngoài: ' + url.replace(BOT, '***'));
};
const logs = []; const origLog = console.log;
console.log = (...a) => { const t = a.map(String).join(' '); if (t.startsWith('[TRACE]')) return; logs.push(t); origLog(...a); };

const fx = require(F + 'index.js');
const admin = rq('firebase-admin'); const express = rq('express');
const db = admin.database(); const bucket = admin.storage().bucket();
const SECRET = 'emu-telegram-secret';
let passed = 0, failed = 0; const failures = [];
async function test(name, fn) { try { await fn(); origLog('  ✓ ' + name); passed++; } catch (e) { origLog('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

async function reset() {
  calls = []; sentTg = []; nPost = 0; feedFail = false; openaiMode = 'ok'; logs.length = 0;
  await db.ref().set(null);
  process.env.TELEGRAM_BOT_TOKEN = BOT; process.env.TELEGRAM_WEBHOOK_SECRET = SECRET; // Phase 5: secret ở env (Functions secret), không ở RTDB
  await db.ref('telegramConfig').set({ chatId: '555', approverIds: ['777'], approverMap: { '777': 'uid_ok' } });
  await db.ref('roles/uid_ok').set('admin');
  await db.ref('facebookConnection').set({ status: 'connected', pageId: 'page_1' });
  await db.ref('facebookActiveToken').set({ pageId: 'page_1', accessToken: 'PAGE_TOKEN_SECRET', isMock: false, expiresAt: Date.now() + 1e9 });
}
let upd = 1000;
const product = (o) => { o = o || {}; return { update_id: o.update_id || ++upd, message: { message_id: 1, date: Math.floor(Date.now() / 1000), from: o.from || { id: 777 }, chat: { id: 555 }, caption: 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Like new 95%', photo: [{ file_id: 'F', width: 1280, height: 960, file_size: 5000 }] } }; };
const cb = (action, id, v, from, chat) => ({ update_id: ++upd, callback_query: { id: 'q' + upd, data: action + ':' + id + (v != null ? ':' + v : ''), from: from || { id: 777 }, message: { chat: chat || { id: 555 } } } });
const feeds = () => calls.filter((c) => c.method === 'POST' && /\/feed/.test(c.url));
const drafts = async () => Object.entries((await db.ref('fbPostDrafts').once('value')).val() || {}).map(([id, d]) => Object.assign({ id }, d));

(async () => {
  const app = express(); app.use(express.json());
  app.post('/tg', (q, s) => fx.telegramWebhook(q, s));
  app.all('/gw/*', (q, s) => { q.url = q.url.slice(3); fx.apiGateway(q, s); });
  const server = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/tg';
  const send = async (update, secret) => { const r = await realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret === undefined ? SECRET : secret }, body: JSON.stringify(update) }); return { status: r.status, json: await r.json() }; };

  origLog('\n=== Emulator (Admin SDK thật + HTTP thật tới telegramWebhook) ===');
  await test('Webhook HTTP: sai secret bị chặn; đúng secret → nhận sản phẩm → ảnh vào Storage emulator → draft PENDING_APPROVAL', async () => {
    await reset(); let r = await send(product(), 'sai'); eq(r.json.reason, 'auth'); eq((await drafts()).length, 0);
    r = await send(product()); eq(r.status, 200);
    const [d] = await drafts(); eq(d.status, 'PENDING_APPROVAL'); eq(d.pageId, 'page_1'); eq(d.pageName, 'Fanpage Emulator');
    const [exists] = await bucket.file('fbDrafts/' + d.id + '/original.jpg').exists(); assert(exists, 'ảnh phải nằm trong Storage emulator');
    const [buf] = await bucket.file('fbDrafts/' + d.id + '/original.jpg').download(); assert(buf.equals(JPEG), 'nội dung ảnh nguyên vẹn');
    assert(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/demo-pshop\.appspot\.com\/o\//.test(d.imageUrls[0]) && !d.imageUrls[0].includes('telegram'), 'URL lâu dài, không phải URL Telegram');
    assert(!JSON.stringify(d).includes(BOT), 'draft không chứa token');
    eq(feeds().length, 0);
  });
  await test('aiGenerate THẬT (job + aiDrafts trong RTDB emulator, OpenAI mock): caption AI + khối Giá/Tình trạng; AI lỗi → mẫu + cảnh báo', async () => {
    await reset(); await send(product()); let [d] = await drafts();
    eq(d.contentSource, 'ai'); assert(d.aiCaption.includes('Pioneer DDJ-400 phù hợp') && d.aiCaption.includes('💰 Giá: 3.500.000đ'));
    const aiDrafts = (await db.ref('aiDrafts').once('value')).val(); assert(aiDrafts && Object.keys(aiDrafts).length >= 1, 'aiDrafts được ghi');
    const openaiCall = calls.find((c) => c.url.includes('api.openai.com')); assert(openaiCall && !openaiCall.body.includes('sk-test-dummy'), 'không đưa API key vào body');
    await reset(); openaiMode = 'fail'; await send(product()); [d] = await drafts(); eq(d.contentSource, 'template'); assert(d.notices.some((n) => /nội dung mẫu/.test(n)));
    assert(!logs.some((l) => l.includes('sk-test-dummy')), 'API key không xuất hiện trong log');
  });
  await test('Webhook trùng song song (3 request cùng update_id) với transaction RTDB thật → đúng 1 draft, 1 bản xem trước', async () => {
    await reset(); const u = product({ update_id: 424242 }); await Promise.all([send(u), send(u), send(u)]);
    eq((await drafts()).length, 1); eq(sentTg.filter((s) => s.reply_markup).length, 1);
  });
  await test('Người không có quyền không gửi sản phẩm / không duyệt được; draft giữ nguyên', async () => {
    await reset(); await send(product({ from: { id: 999 } })); eq((await drafts()).length, 0);
    await send(product()); const [d] = await drafts();
    await send(cb('fb_approve', d.id, 1, { id: 999 })); await send(cb('fb_approve', d.id, 1, { id: 777 }, { id: 4242 }));
    await db.ref('roles/uid_ok').set('agent'); await send(cb('fb_approve', d.id, 1)); await db.ref('roles/uid_ok').set('admin');
    eq((await drafts())[0].status, 'PENDING_APPROVAL'); eq(feeds().length, 0);
  });
  await test('DUYỆT hợp lệ → đăng đúng 1 bài lên đúng Page; Telegram nhận URL; DUYỆT lặp song song ×4 vẫn chỉ 1 bài', async () => {
    await reset(); await send(product()); const [d] = await drafts();
    await Promise.all([1, 2, 3, 4].map(() => send(cb('fb_approve', d.id, 1))));
    const x = (await drafts())[0]; eq(x.status, 'PUBLISHED'); eq(feeds().length, 1); assert(/\/page_1\/feed/.test(feeds()[0].url));
    eq(x.approvedBy.pshUid, 'uid_ok'); assert(sentTg.some((s) => s.kind === 'sendMessage' && s.text.includes('https://www.facebook.com/' + x.facebookPostId)));
    assert(!sentTg.some((s) => JSON.stringify(s).includes('PAGE_TOKEN_SECRET')), 'không lộ page token');
  });
  await test('HỦY ∥ DUYỆT chạy song song (transaction thật) ×6 → trạng thái cuối nhất quán với số bài đăng', async () => {
    for (let i = 0; i < 6; i++) {
      await reset(); await send(product()); const [d] = await drafts();
      await Promise.all([send(cb('fb_approve', d.id, 1)), send(cb('fb_cancel', d.id))]);
      const st = (await drafts())[0].status; assert(st === 'PUBLISHED' || st === 'CANCELLED', st); eq(feeds().length, st === 'PUBLISHED' ? 1 : 0, 'đồng nhất, vòng ' + i);
    }
  });
  await test('Huỷ rồi duyệt → không đăng', async () => {
    await reset(); await send(product()); const [d] = await drafts(); await send(cb('fb_cancel', d.id)); await send(cb('fb_approve', d.id, 1)); eq(feeds().length, 0); eq((await drafts())[0].status, 'CANCELLED');
  });
  await test('Facebook từ chối → FAILED(publish) + Telegram báo lỗi thật; /retry → duyệt lại → đúng 1 bài; nút cũ vô hiệu', async () => {
    await reset(); await send(product()); const [d] = await drafts(); feedFail = true; await send(cb('fb_approve', d.id, 1));
    let x = (await drafts())[0]; eq(x.status, 'FAILED'); eq(x.failStage, 'publish'); assert(!x.facebookPostId);
    assert(/THẤT BẠI/.test(sentTg.filter((s) => s.kind === 'sendMessage').pop().text));
    feedFail = false; await send({ update_id: ++upd, message: { date: Math.floor(Date.now() / 1000), from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } });
    x = (await drafts())[0]; eq(x.status, 'PENDING_APPROVAL'); eq(x.version, 2);
    const attempts = feeds().length; await send(cb('fb_approve', d.id, 1)); eq(feeds().length, attempts, 'nút v1 không còn hiệu lực');
    await send(cb('fb_approve', d.id, 2)); eq((await drafts())[0].status, 'PUBLISHED'); eq(feeds().length, attempts + 1);
  });
  await test('Client KHÔNG lấy được secret qua API: gateway (không token / token giả / sai secret webhook) + webhook — mọi response và log không chứa secret; RTDB không có secret', async () => {
    await reset(); process.env.WEBHOOK_SIGNING_SECRET = 'GATEWAY-SIGNING-SECRET-VALUE'; process.env.COMPOSITOR_SECRET = 'COMPOSITOR-SECRET-VALUE-0123456789';
    const gwBase = 'http://127.0.0.1:' + server.address().port + '/gw'; const bodies = [];
    for (const [m, p, h, b] of [['POST', '/v1/facebook-publisher/drafts', {}, { pageId: 'page_1', caption: 'x' }], ['POST', '/v1/facebook-publisher/drafts', { Authorization: 'Bearer abc.def.ghi' }, {}],
      ['POST', '/v1/facebook-publisher/callback', { 'X-PSH-Webhook-Secret': 'doan-mo' }, { callback_query: { id: 'q', data: 'fb_approve:x:1', from: { id: 777 }, message: { chat: { id: 555 } } } }],
      ['POST', '/v1/facebook-publisher/callback', { 'X-PSH-Webhook-Secret': 'GATEWAY-SIGNING-SECRET-VALUE' }, { callback_query: { id: 'q', data: 'fb_cancel:x', from: { id: 777 }, message: { chat: { id: 555 } } } }],
      ['GET', '/v1/telegramConfig', {}, null], ['GET', '/v1/system/health', {}, null]]) {
      const r = await realFetch(gwBase + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: b ? JSON.stringify(b) : undefined }); bodies.push(m + ' ' + p + ' ' + r.status + ' ' + (await r.text()));
    }
    await send(product()); await send(product({ update_id: 1 })); 
    const hay = JSON.stringify({ bodies, logs, sentTg, rtdb: (await db.ref().once('value')).val() });
    const secrets = [BOT, SECRET, 'GATEWAY-SIGNING-SECRET-VALUE', 'COMPOSITOR-SECRET-VALUE-0123456789', 'sk-test-dummy'];
    const leaked = secrets.filter((x) => hay.includes(x)); assert(leaked.length === 0, 'rò rỉ ' + leaked.length + ' secret');
  });
  await test('G1 qua apiGateway KHÔNG phụ thuộc Telegram Publisher: env KHÔNG có secret Telegram/compositor + RTDB KHÔNG có telegramConfig ⇒ route G1 vẫn đáp ứng; route publisher không còn mount (404)', async () => {
    await db.ref().set(null); for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'COMPOSITOR_SECRET']) delete process.env[k];
    const gwBase = 'http://127.0.0.1:' + server.address().port + '/gw'; const out = {};
    for (const [m, p] of [['GET', '/v1/health'], ['GET', '/v1/facebook/connection'], ['POST', '/v1/facebook/publish'], ['POST', '/v1/facebook/oauth/start'], ['GET', '/v1/products'], ['POST', '/v1/facebook-publisher/drafts'], ['POST', '/v1/facebook-publisher/callback'], ['GET', '/v1/khong-ton-tai']]) {
      const r = await realFetch(gwBase + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined }); out[m + ' ' + p] = r.status;
    }
    eq(out['GET /v1/health'], 200); assert([401, 403].includes(out['GET /v1/facebook/connection']), 'G1 connection phải đòi đăng nhập: ' + out['GET /v1/facebook/connection']);
    assert([401, 403].includes(out['POST /v1/facebook/publish']) && [401, 403].includes(out['POST /v1/facebook/oauth/start']), 'G1 publish/oauth phải đòi đăng nhập');
    eq(out['POST /v1/facebook-publisher/drafts'], 404); eq(out['POST /v1/facebook-publisher/callback'], 404); eq(out['GET /v1/khong-ton-tai'], 404);
    eq(blocked.length, 0, 'không có request ra ngoài');
  });
  await test('DRY-RUN trên RTDB thật: duyệt → PUBLISHED(dryRun), KHÔNG có request Graph, Telegram báo rõ', async () => {
    await reset(); await db.ref('telegramConfig/dryRun').set(true); await send(product()); const [d] = await drafts();
    const g0 = calls.filter((c) => c.url.includes('graph.facebook.com')).length;
    await Promise.all([send(cb('fb_approve', d.id, 1)), send(cb('fb_approve', d.id, 1))]);
    const x = (await drafts())[0]; eq(x.status, 'PUBLISHED'); eq(x.dryRun, true); eq(feeds().length, 0); eq(calls.filter((c) => c.url.includes('graph.facebook.com')).length, g0);
    assert(sentTg.some((m) => m.kind === 'sendMessage' && /DRY-RUN/.test(m.text)));
  });
  await test('Page không hợp lệ / Ngắt kết nối → từ chối, không tạo draft; không có request ngoài localhost ngoài các mock', async () => {
    await reset(); let u = product(); u.message.caption += '\nPage: ../facebookActiveToken'; await send(u); eq((await drafts()).length, 0);
    await db.ref('facebookConnection/status').set('not_connected'); await send(product()); eq((await drafts()).length, 0);
    eq(blocked.length, 0, 'không có request lạ: ' + blocked.join(','));
  });

  server.close();
  origLog('\n─────────────────────────────────────────────');
  origLog('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { origLog('FAILURES: ' + failures.join(' | ')); process.exit(1); }
  origLog('telegramFbPipeline.emulator: OK (' + passed + ' case, Emulator + Admin SDK thật)');
  process.exit(0);
})().catch((e) => { origLog('LỖI: ' + (e && e.stack || e)); process.exit(2); });
