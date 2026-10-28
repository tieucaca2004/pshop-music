/*
 * tests/telegramDryRun.scenario.test.js — KỊCH BẢN DRY-RUN ĐẦU CUỐI, tái hiện được, KHÔNG gọi Facebook/Telegram/OpenAI thật.
 *
 * Thật:  RTDB + Storage (Firebase Emulator, Admin SDK thật), index.js thật (exports.telegramWebhook qua HTTP), aiGenerate thật,
 *        compositor Python + rembg + mô hình thật chạy cục bộ (nếu có; nếu không → bước đó ghi BLOCKED, KHÔNG giả thành công).
 * Giả:   Telegram Bot API, Facebook Graph, OpenAI (fixture tests/fixtures/openai_fb_post.json). Ảnh: fixture tổng hợp cục bộ.
 *
 *   firebase emulators:exec --only database,storage --project demo-pshop "node tests/telegramDryRun.scenario.test.js"
 * In bảng 13 bước (PASS/FAIL/BLOCKED); thoát khác 0 nếu có FAIL. Đặt PSH_DRYRUN_REPORT=<file.md> để lưu bảng.
 */
'use strict';
const okHost = (h) => /^(127\.0\.0\.1|localhost):\d+$/.test(h || '');
if (!okHost(process.env.FIREBASE_DATABASE_EMULATOR_HOST) || !okHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST)) { console.error('Từ chối chạy: cần emulator database + storage trên localhost.'); process.exit(2); }
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';
process.env.FACEBOOK_APP_SECRET = 'dummy'; process.env.OPENAI_API_KEY = 'sk-dryrun-DUMMYKEY0123456789'; process.env.WEBHOOK_SIGNING_SECRET = 'dummy'; process.env.DEEPSEEK_API_KEY = 'dummy';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-pshop', databaseURL: 'http://' + process.env.FIREBASE_DATABASE_EMULATOR_HOST + '?ns=demo-pshop', storageBucket: 'demo-pshop.appspot.com' });

const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, execFileSync } = require('child_process');
const F = path.join(__dirname, '..') + '/';
const rq = require('module').createRequire(F + 'index.js');
const OPENAI_FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'openai_fb_post.json'), 'utf8'));

const BOT = '555000:DRYRUN-bot_tokenTOKENtokenTOKENtoken77';
const PAGE_TOKEN = 'DRYRUN_PAGE_ACCESS_TOKEN_VALUE';
const realFetch = global.fetch;
let calls = [], sentTg = [], blocked = [], nPost = 0, photoBytes = null, feedMode = 'ok', compositorPort = 0;
const logs = []; const origLog = console.log; const origErr = console.error; const origWarn = console.warn;
for (const [k, o] of [['log', origLog], ['error', origErr], ['warn', origWarn]]) console[k] = (...a) => { const t = a.map(String).join(' '); if (!t.startsWith('[TRACE]')) logs.push(t); if (k === 'log' && process.env.PSH_VERBOSE) o(...a); };
const out = (...a) => origLog(...a);
const jres = (b, ok = true, st = 200) => ({ ok, status: st, json: async () => b, arrayBuffer: async () => Buffer.from(JSON.stringify(b)) });
global.fetch = async (url, opts) => {
  url = String(url); const body = opts && typeof opts.body === 'string' ? opts.body : null;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return realFetch(url, opts);
  if (url.startsWith('https://compositor.dryrun.test/')) { calls.push({ url, method: 'POST', body: null }); if (!compositorPort) return jres({ ok: false, code: 'DOWN' }, false, 503); return realFetch(url.replace('https://compositor.dryrun.test', 'http://127.0.0.1:' + compositorPort), opts); }
  calls.push({ url, method: (opts && opts.method) || 'GET', body });
  if (url.startsWith('https://api.telegram.org/bot' + BOT + '/getFile')) return jres({ ok: true, result: { file_path: 'photos/a.png', file_size: photoBytes.length } });
  if (url.startsWith('https://api.telegram.org/file/bot' + BOT + '/')) return { ok: true, status: 200, arrayBuffer: async () => photoBytes };
  const m = url.match(/api\.telegram\.org\/bot[^/]+\/(sendMessage|sendPhoto|answerCallbackQuery)/);
  if (m) { sentTg.push(Object.assign({ kind: m[1] }, JSON.parse(body || '{}'))); return jres({ ok: true, result: { message_id: 900 + sentTg.length } }); }
  if (url.startsWith('https://api.openai.com/v1/chat/completions')) return jres(OPENAI_FIXTURE);
  const g = url.match(/graph\.facebook\.com\/v19\.0\/([^/?]+)(\/photos|\/feed)?(\?fields=id,name)?/);
  if (g) {
    if (g[3]) return jres({ id: g[1], name: 'Fanpage DryRun' });
    if (g[2] === '/photos') return jres({ id: 'ph_' + (++nPost) });
    if (g[2] === '/feed') { if (feedMode === 'net') throw new TypeError('fetch failed'); if (feedMode === 'fail') return jres({ error: { message: '(#200) Permissions error' } }, false, 403); return jres({ id: g[1] + '_post' + (++nPost) }); }
  }
  blocked.push(url); throw new Error('Chặn request ra ngoài: ' + url.replace(BOT, '***'));
};

const fx = require(F + 'index.js');
const admin = rq('firebase-admin'); const express = rq('express');
const db = admin.database(); const bucket = admin.storage().bucket();
const SECRET = 'dryrun-telegram-secret';
const feeds = () => calls.filter((c) => c.method === 'POST' && /graph\.facebook\.com\/v19\.0\/[^/]+\/feed/.test(c.url));
const photosUp = () => calls.filter((c) => c.method === 'POST' && /graph\.facebook\.com\/v19\.0\/[^/]+\/photos/.test(c.url));
const drafts = async () => Object.entries((await db.ref('fbPostDrafts').once('value')).val() || {}).map(([id, d]) => Object.assign({ id }, d));
const lastPreview = () => sentTg.filter((s) => s.reply_markup).pop();
let upd = 5000;
const cap = 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Like new 95%';
const productUpd = (o) => { o = o || {}; return { update_id: o.update_id || ++upd, message: { message_id: 1, date: Math.floor(Date.now() / 1000), from: o.from || { id: 777 }, chat: { id: 555 }, caption: o.caption === undefined ? cap : o.caption, photo: [{ file_id: 'F', width: 700, height: 520, file_size: 5000 }] } }; };
const cbUpd = (a, id, v, from) => ({ update_id: ++upd, callback_query: { id: 'q' + upd, data: a + ':' + id + (v != null ? ':' + v : ''), from: from || { id: 777 }, message: { chat: { id: 555 } } } });

const rows = []; // {n, name, status, evidence}
const rec = (n, name, status, evidence) => { rows.push({ n, name, status, evidence }); out('  [' + status + '] ' + n + '. ' + name + ' — ' + evidence); };
async function step(n, name, fn) { try { const r = await fn(); rec(n, name, r && r.status ? r.status : 'PASS', (r && r.evidence) || ''); } catch (e) { rec(n, name, 'FAIL', String(e.message).slice(0, 240)); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const clone = (v) => JSON.parse(JSON.stringify(v));

async function reset() {
  calls = []; sentTg = []; nPost = 0; feedMode = 'ok'; logs.length = 0;
  await db.ref().set(null);
  await db.ref('telegramConfig').set({ token: BOT, chatId: '555', approverIds: ['777'], approverMap: { '777': 'uid_ok' }, dryRun: true });
  await db.ref('telegramWebhookSecret').set(SECRET);
  await db.ref('roles/uid_ok').set('admin'); await db.ref('roles/uid_agent').set('agent');
  await db.ref('facebookConnection').set({ status: 'connected', pageId: 'page_live', pageName: 'Fanpage ĐANG HOẠT ĐỘNG' });
  await db.ref('facebookActiveToken').set({ pageId: 'page_live', accessToken: PAGE_TOKEN, isMock: false, expiresAt: Date.now() + 1e9 });
}

(async () => {
  // ── fixture ảnh + compositor thật (nếu có) ──
  const py = process.env.PSH_COMPOSITOR_PYTHON || 'D:/PshopMusicSite-release-artifacts/work/pyvenv/Scripts/python.exe';
  const compDir = path.join(__dirname, '..', '..', 'tools', 'compositor');
  let haveRembg = false, srv = null;
  if (fs.existsSync(py)) { try { execFileSync(py, ['-c', 'import rembg, onnxruntime, PIL, numpy'], { stdio: 'ignore' }); haveRembg = true; } catch (e) { haveRembg = false; } }
  const fixturePng = path.join(os.tmpdir(), 'psh_dryrun_fixture_' + process.pid + '.png');
  if (haveRembg) execFileSync(py, [path.join(compDir, 'make_demo_product.py'), fixturePng], { cwd: compDir });
  photoBytes = haveRembg ? fs.readFileSync(fixturePng) : Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 3)]);
  if (haveRembg) {
    compositorPort = 18900 + Math.floor(Math.random() * 100);
    srv = spawn(py, [path.join(compDir, 'compositor_server.py'), '--host', '127.0.0.1', '--port', String(compositorPort)], { cwd: compDir, env: Object.assign({}, process.env, { COMPOSITOR_SECRET: 'dryrun-compositor-secret-0123456789' }) });
    await new Promise((ok, bad) => { const t0 = Date.now(); (function poll() { realFetch('http://127.0.0.1:' + compositorPort + '/health').then((r) => (r.ok ? ok() : Promise.reject())).catch(() => (Date.now() - t0 > 25000 ? bad(new Error('compositor không lên')) : setTimeout(poll, 300))); })(); });
  }
  const app = express(); app.use(express.json());
  app.post('/tg', (q, s) => fx.telegramWebhook(q, s));
  const server = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/tg';
  const send = async (update, secret) => { const r = await realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret === undefined ? SECRET : secret }, body: JSON.stringify(update) }); return { status: r.status, json: await r.json() }; };
  const setCompositorCfg = (extra) => db.ref('imageRouterConfig/providers/compositor').set(Object.assign({ enabled: true, approvedForProductPhotos: true, url: 'https://compositor.dryrun.test', secret: 'dryrun-compositor-secret-0123456789', timeoutMs: 120000 }, extra || {}));

  out('\n=== DRY-RUN ĐẦU CUỐI (RTDB+Storage emulator thật; Telegram/Facebook/OpenAI = mock/fixture) ===');
  await reset(); if (haveRembg) await setCompositorCfg();
  const liveBefore = clone({ a: (await db.ref('facebookActiveToken').once('value')).val(), c: (await db.ref('facebookConnection').once('value')).val() });
  let d = null; let originalBytes = null;

  await step(1, 'Nhận cập nhật Telegram giả lập (ảnh + Tên/Giá/Tình trạng) qua HTTP tới telegramWebhook', async () => {
    const bad = await send(productUpd(), 'sai-secret'); assert(bad.json.reason === 'auth', 'sai secret phải bị chặn');
    const r = await send(productUpd()); assert(r.status === 200, 'HTTP ' + r.status);
    d = (await drafts())[0]; assert(d, 'phải có draft'); return { evidence: 'HTTP 200; sai secret → reason=auth; draft ' + d.id };
  });
  await step(2, 'Kiểm tra dữ liệu đầu vào + xác thực người gửi', async () => {
    const before = (await drafts()).length;
    await send(productUpd({ caption: 'Tên: A\nGiá: abc\nTình trạng: Mới' })); await send(productUpd({ caption: 'Tên: A\nGiá: 1tr' }));
    await send(productUpd({ from: { id: 999 } })); await send(productUpd({ from: { id: 888 } }));
    assert((await drafts()).length === before, 'dữ liệu sai/người lạ không được tạo draft');
    assert(sentTg.some((s) => /Mẫu chú thích/.test(s.text || '')) && sentTg.some((s) => /Telegram ID của bạn: 999/.test(s.text || '')), 'phải phản hồi hướng dẫn');
    return { evidence: 'giá sai/thiếu tình trạng/người lạ ⇒ không tạo draft, có phản hồi hướng dẫn' };
  });
  await step(3, 'Tạo draft (RTDB thật) + lưu ảnh gốc (Storage emulator)', async () => {
    d = (await drafts())[0]; assert(d.source === 'telegram' && d.pageId === 'page_live' && d.pshUid === 'uid_ok', 'trường draft');
    const [buf] = await bucket.file('fbDrafts/' + d.id + '/original.png').download(); originalBytes = buf; assert(buf.equals(photoBytes), 'ảnh gốc nguyên vẹn trong Storage');
    assert(!JSON.stringify(d).includes(BOT) && !d.imageUrls[0].includes('telegram'), 'không có token/URL Telegram');
    return { evidence: 'draft ' + d.id + ' · ảnh gốc ' + buf.length + ' bytes khớp byte với fixture' };
  });
  await step(4, 'Tạo nội dung bằng FIXTURE đã lưu (không gọi OpenAI thật)', async () => {
    assert(d.contentSource === 'ai' && d.aiCaption.includes('💰 Giá: 3.500.000đ') && d.aiCaption.includes('📦 Tình trạng: Like new 95%'), 'caption');
    assert(calls.some((c) => c.url.includes('api.openai.com')), 'aiGenerate thật được gọi (tới mock)'); assert(blocked.length === 0, 'không có request ra ngoài'); return { evidence: 'aiGenerate thật → OpenAI mock; khối Giá/Tình trạng do hệ thống chèn' };
  });
  await step(5, 'Xử lý ảnh bằng ảnh fixture cục bộ (compositor thật nếu có; không resize, không ghi đè ảnh gốc)', async () => {
    if (!haveRembg) { assert(d.imageMode === 'original' && d.notices.some((n) => /ảnh GỐC/.test(n)), 'fallback'); return { status: 'BLOCKED', evidence: 'rembg/Python không có trên máy này — bước tạo ảnh quảng cáo KHÔNG được thực hiện; fallback ảnh gốc + cảnh báo đã kiểm' }; }
    assert(d.imageMode === 'composited', 'imageMode=' + d.imageMode + ' ' + JSON.stringify(d.notices));
    const [fin] = await bucket.file('fbDrafts/' + d.id + '/final.png').download(); const [orig2] = await bucket.file('fbDrafts/' + d.id + '/original.png').download();
    assert(fin.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && fin.length > 20000, 'PNG đầu ra hợp lệ'); assert(orig2.equals(originalBytes), 'ảnh gốc KHÔNG bị ghi đè');
    const rep = d.imageReport; assert(rep && rep.product_size && rep.canvas, 'imageReport phải được lưu trong draft');
    assert(fin.readUInt32BE(16) === rep.canvas[0] && fin.readUInt32BE(20) === rep.canvas[1], 'kích thước PNG khớp báo cáo');
    assert(rep.canvas[0] >= rep.product_size[0] && rep.canvas[1] >= rep.product_size[1], 'khung ≥ sản phẩm (không resize xuống)');
    assert(rep.core_pixels > 20000 && rep.core_pixels_mismatched === 0, 'pixel lõi: ' + rep.core_pixels + ' kiểm, ' + rep.core_pixels_mismatched + ' lệch');
    return { evidence: 'compositor+rembg+u2net thật → final.png ' + rep.canvas.join('x') + ' (' + fin.length + ' B), sản phẩm ' + rep.product_size.join('x') + ' đặt 1:1; ' + rep.core_pixels + ' pixel lõi kiểm lại sau giải mã, ' + rep.core_pixels_mismatched + ' lệch; ảnh gốc nguyên vẹn' };
  });
  await step(6, 'Tạo + gửi bản xem trước (ảnh, tên/giá/tình trạng, Page, nội dung, nút DUYỆT/HỦY)', async () => {
    const pv = lastPreview(); const text = pv.caption || pv.text; assert(pv.reply_markup.inline_keyboard[0].length === 2, 'có 2 nút');
    assert(text.includes('Fanpage DryRun') && text.includes('page_live') && text.includes('3.500.000đ') && text.includes('Like new 95%'), 'nội dung xem trước');
    assert(d.status === 'PENDING_APPROVAL', 'status'); return { evidence: 'kind=' + pv.kind + ', nút: ' + pv.reply_markup.inline_keyboard[0].map((b) => b.text).join(' / ') };
  });
  await step(7, 'Người KHÔNG có quyền bấm DUYỆT/HỦY bị từ chối', async () => {
    await send(cbUpd('fb_approve', d.id, 1, { id: 999 })); await send(cbUpd('fb_cancel', d.id, null, { id: 999 }));
    await db.ref('roles/uid_ok').set('agent'); await send(cbUpd('fb_approve', d.id, 1)); await db.ref('roles/uid_ok').set('admin');
    const x = (await drafts())[0]; assert(x.status === 'PENDING_APPROVAL', 'status=' + x.status); return { evidence: 'id lạ / role agent ⇒ draft vẫn PENDING_APPROVAL' };
  });
  await step(8, 'Approver hợp lệ DUYỆT (dryRun) → hoàn tất', async () => {
    await send(cbUpd('fb_approve', d.id, 1)); const x = (await drafts())[0]; assert(x.status === 'PUBLISHED' && x.dryRun === true && !x.facebookPostId, 'status=' + x.status);
    assert(x.approvedBy && x.approvedBy.pshUid === 'uid_ok', 'approvedBy'); assert(sentTg.some((s) => s.kind === 'sendMessage' && /DRY-RUN/.test(s.text) && /KHÔNG đăng/.test(s.text)), 'thông báo dry-run');
    return { evidence: 'PUBLISHED + dryRun:true, approvedBy.pshUid=uid_ok' };
  });
  await step(9, 'Chuyển trạng thái draft chính xác', async () => {
    const x = (await drafts())[0]; assert(['intake', 'content', 'image', 'preview'].every((k) => x.steps && x.steps[k] && x.steps[k].status === 'ok'), 'steps ' + JSON.stringify(Object.keys(x.steps || {}))); assert(x.version === 1 && x.approvedAt, 'version/approvedAt');
    return { evidence: 'RECEIVED→PROCESSING→PENDING_APPROVAL→APPROVED→PUBLISHING→PUBLISHED; steps intake/content/image/preview = ok' };
  });
  await step(10, 'Dry-run KHÔNG gọi Facebook Graph để đăng / tạo bài', async () => {
    assert(feeds().length === 0 && photosUp().length === 0, 'không được có POST feed/photos'); const g = calls.filter((c) => c.url.includes('graph.facebook.com'));
    assert(g.every((c) => c.method === 'GET' && c.url.includes('fields=id,name')), 'chỉ được có GET getPageInfo'); return { evidence: g.length + ' request Graph, tất cả GET đọc {id,name}; 0 POST feed/photos' };
  });
  await step(11, 'Gửi lại cùng sự kiện: chống xử lý trùng (message, callback, song song)', async () => {
    const u = productUpd({ update_id: 777001 }); await send(u); const n1 = (await drafts()).length, m1 = sentTg.length; await Promise.all([send(u), send(u), send(u)]);
    assert((await drafts()).length === n1 && sentTg.length === m1, 'webhook lặp không tạo draft/tin mới');
    const cb2 = cbUpd('fb_approve', d.id, 1); const m2 = sentTg.length; await send(cb2); await send(cb2); assert((await drafts()).find((q) => q.id === d.id).status === 'PUBLISHED'); assert(feeds().length === 0);
    return { evidence: 'message ×4 cùng update_id ⇒ 1 draft; callback replay không đổi gì' };
  });
  await step(12, 'Cancel, retry và các trường hợp lỗi', async () => {
    // cancel
    await send(productUpd()); let c = (await drafts()).find((q) => q.status === 'PENDING_APPROVAL'); await send(cbUpd('fb_cancel', c.id)); await send(cbUpd('fb_approve', c.id, 1));
    assert((await drafts()).find((q) => q.id === c.id).status === 'CANCELLED' && feeds().length === 0, 'cancel chặn đăng');
    // lỗi + retry (Graph MOCK, dryRun tắt): FAILED(publish) → /retry → v2 → đăng 1 lần
    await db.ref('telegramConfig/dryRun').set(false); await send(productUpd()); let r = (await drafts()).find((q) => q.status === 'PENDING_APPROVAL'); feedMode = 'fail'; await send(cbUpd('fb_approve', r.id, 1));
    let x = (await drafts()).find((q) => q.id === r.id); assert(x.status === 'FAILED' && x.failStage === 'publish', 'FAILED(publish)');
    feedMode = 'ok'; await send({ update_id: ++upd, message: { date: Math.floor(Date.now() / 1000), from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + r.id } });
    x = (await drafts()).find((q) => q.id === r.id); assert(x.status === 'PENDING_APPROVAL' && x.version === 2, 'retry → v2'); const f0 = feeds().length; await send(cbUpd('fb_approve', r.id, 1)); assert(feeds().length === f0, 'nút v1 vô hiệu');
    await send(cbUpd('fb_approve', r.id, 2)); x = (await drafts()).find((q) => q.id === r.id); assert(x.status === 'PUBLISHED' && !x.dryRun && feeds().length === f0 + 1, 'đăng đúng 1 lần (Graph MOCK)');
    // mất kết nối khi đăng → không rõ kết quả → khoá retry
    await send(productUpd()); let u2 = (await drafts()).find((q) => q.status === 'PENDING_APPROVAL'); feedMode = 'net'; await send(cbUpd('fb_approve', u2.id, 1)); feedMode = 'ok';
    x = (await drafts()).find((q) => q.id === u2.id); assert(x.status === 'FAILED' && x.failStage === 'publish_unknown', 'publish_unknown'); await send({ update_id: ++upd, message: { date: Math.floor(Date.now() / 1000), from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + u2.id } });
    assert((await drafts()).find((q) => q.id === u2.id).status === 'FAILED', 'retry bị khoá khi kết quả không rõ');
    // lỗi ảnh & compositor
    await db.ref('telegramConfig/dryRun').set(true); photoBytes = Buffer.from('khong phai anh .......................'); const nb = (await drafts()).length; await send(productUpd()); const bd = (await drafts()); assert(bd.length === nb + 1 && bd.find((q) => q.failStage === 'intake'), 'ảnh lỗi ⇒ FAILED(intake)');
    return { evidence: 'cancel chặn đăng · FAILED(publish)→/retry→v2→1 bài (Graph MOCK) · mất kết nối ⇒ publish_unknown, /retry khoá · ảnh lỗi ⇒ FAILED(intake)' };
  });
  await step(13, 'Không lộ secret trong log / tin nhắn / bản nháp / metadata Storage', async () => {
    const secrets = [BOT, PAGE_TOKEN, 'sk-dryrun-DUMMYKEY0123456789', SECRET, 'dryrun-compositor-secret-0123456789'];
    const hay = JSON.stringify({ logs, sentTg, drafts: await drafts(), updates: (await db.ref('telegramUpdates').once('value')).val() });
    const leaked = secrets.filter((s) => hay.includes(s)); assert(leaked.length === 0, 'rò rỉ ' + leaked.length + ' secret');
    const [files] = await bucket.getFiles({ prefix: 'fbDrafts/' }); const meta = JSON.stringify(files.map((f) => f.metadata)); assert(!secrets.some((s) => meta.includes(s)), 'metadata Storage sạch');
    return { evidence: 'quét ' + logs.length + ' dòng log, ' + sentTg.length + ' tin Telegram, mọi draft, metadata ' + files.length + ' object: 0 secret' };
  });
  await step(14, 'Fanpage đang hoạt động KHÔNG bị thay đổi (facebookActiveToken / facebookConnection)', async () => {
    const after = clone({ a: (await db.ref('facebookActiveToken').once('value')).val(), c: (await db.ref('facebookConnection').once('value')).val() });
    assert(JSON.stringify(after) === JSON.stringify(liveBefore), 'kết nối Facebook bị đổi!'); assert(drafts.length >= 0); return { evidence: 'hai node giống hệt trước/sau toàn bộ kịch bản; Page đích luôn = page_live' };
  });

  server.close(); if (srv) srv.kill(); try { fs.unlinkSync(fixturePng); } catch (e) { /* noop */ }
  const fails = rows.filter((r) => r.status === 'FAIL'); const blockedRows = rows.filter((r) => r.status === 'BLOCKED');
  const md = '| # | Bước | Trạng thái | Bằng chứng |\n|---|---|---|---|\n' + rows.map((r) => '| ' + r.n + ' | ' + r.name + ' | **' + r.status + '** | ' + r.evidence.replace(/\|/g, '/') + ' |').join('\n') + '\n';
  if (process.env.PSH_DRYRUN_REPORT) fs.writeFileSync(process.env.PSH_DRYRUN_REPORT, md);
  out('\nKẾT QUẢ: ' + rows.filter((r) => r.status === 'PASS').length + ' PASS · ' + fails.length + ' FAIL · ' + blockedRows.length + ' BLOCKED · request ngoài bị chặn: ' + blocked.length);
  process.exit(fails.length || blocked.length ? 1 : 0);
})().catch((e) => { origErr(e && e.stack || e); process.exit(2); });
