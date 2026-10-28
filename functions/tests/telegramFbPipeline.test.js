/*
 * tests/telegramFbPipeline.test.js — luồng đăng Facebook qua Telegram (intake → AI → ảnh → xem trước → duyệt → đăng → kết quả).
 *
 * Chạy: node tests/telegramFbPipeline.test.js   (từ thư mục functions/)
 * Không dùng Firebase/Telegram/Facebook/OpenAI thật: RTDB + Storage là bộ nhớ trong; fetch là mock cục bộ.
 * Test tích hợp compositor chạy tiến trình Python THẬT (compositor_server + segmenter giả trong tools/compositor/
 * stub_segmenter_server.py) nếu có Python+Pillow+numpy (PSH_COMPOSITOR_PYTHON); nếu không → ghi rõ SKIPPED (không tính PASS).
 */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── RTDB + Storage giả (trong bộ nhớ) ─────────────────────────────────────────
let db = {};
let storageFiles = {};
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
function getPath(obj, p) {
  let cur = obj;
  for (const k of p.split('/').filter(Boolean)) { if (cur == null || typeof cur !== 'object') return null; cur = cur[k]; }
  return cur === undefined ? null : cur;
}
function setPath(obj, p, val) {
  const parts = p.split('/').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
  if (val === null) delete cur[parts[parts.length - 1]]; else cur[parts[parts.length - 1]] = val;
}
let keyCounter = 0;
function mockRef(p) {
  return {
    once: async () => { if (failRead && (p === failRead || p.indexOf(failRead + '/') === 0)) throw new Error('RTDB unavailable'); return { exists: () => getPath(db, p) !== null, val: () => clone(getPath(db, p)) }; },
    set: async (v) => setPath(db, p, clone(v)),
    update: async (ch) => { for (const k of Object.keys(ch)) setPath(db, p + '/' + k, ch[k] === null ? null : clone(ch[k])); },
    push: () => { const key = 'k' + (++keyCounter) + 'x' + Math.random().toString(36).slice(2, 6); return { key, set: async (v) => setPath(db, p + '/' + key, clone(v)) }; },
    // Mô phỏng RTDB THẬT: updateFunction được gọi LẦN ĐẦU với cache cục bộ RỖNG (null) — trả undefined ở lần đó là ABORT
    // ngay (không hỏi server); trả giá trị khác thì SDK gửi lên, server từ chối vì khác hash, rồi gọi lại với giá trị thật.
    transaction: async (fn) => {
      const cur = getPath(db, p);
      let next = fn(null);
      if (next === undefined) return { committed: false, snapshot: { val: () => cur } };
      if (cur !== null) { next = fn(clone(cur)); if (next === undefined) return { committed: false, snapshot: { val: () => cur } }; }
      setPath(db, p, clone(next));
      return { committed: true, snapshot: { val: () => next } };
    }
  };
}
const mockAdmin = {
  apps: [{}],
  database: () => ({ ref: mockRef }),
  storage: () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (pth) => ({
        save: async (buf, opts) => { storageFiles[pth] = { buf: Buffer.from(buf), opts }; },
        download: async () => { if (!storageFiles[pth]) throw new Error('not found'); return [storageFiles[pth].buf]; }
      })
    })
  })
};
mockAdmin.database.ServerValue = { TIMESTAMP: '__ts__' };

let aiImpl = async (moduleId) => ({ content: { versions: [{ hook: 'AI hook', caption: 'AI caption cho sản phẩm', cta: 'Nhắn tin ngay', hashtags: ['pshop', '#dj'] }] } });
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'firebase-admin') return mockAdmin;
  if (/(^|\/)aiGenerate$/.test(request)) return { generateForModule: (...a) => aiImpl(...a) };
  return origLoad.apply(this, arguments);
};

// ── Fetch giả ────────────────────────────────────────────────────────────────
const realFetch = global.fetch;
let calls = []; let sentTg = []; let nPost = 0;
let tgFileBytes = null; let tgGetFileFail = false; let tgSendFail = false;
let graphInfoFail = false; let photoFail = false; let feedFail = false; let feedNetErr = false; let feedOverride = null; let failRead = null;
let compositorHandler = null;
const BOT = '123456:ABC-DEF_tokenTOKENtokenTOKENtoken12';
const res = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))) });
global.fetch = async (url, opts) => {
  url = String(url);
  const body = opts && opts.body && typeof opts.body === 'string' ? opts.body : null;
  calls.push({ url, method: (opts && opts.method) || 'GET', body });
  if (url.startsWith('https://api.telegram.org/bot' + BOT + '/getFile')) return tgGetFileFail ? res({ ok: false }) : res({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: (tgFileBytes || []).length } });
  if (url.startsWith('https://api.telegram.org/file/bot' + BOT + '/')) return res(tgFileBytes || Buffer.alloc(0));
  if (/api\.telegram\.org\/bot[^/]+\/(sendMessage|sendPhoto|answerCallbackQuery)/.test(url)) {
    const kind = url.match(/\/(sendMessage|sendPhoto|answerCallbackQuery)/)[1];
    if (tgSendFail && kind !== 'answerCallbackQuery') return res({ ok: false, description: 'forbidden' });
    const b = JSON.parse(body || '{}'); sentTg.push({ kind, ...b });
    return res({ ok: true, result: { message_id: 1000 + sentTg.length } });
  }
  if (url.startsWith('https://graph.facebook.com/')) {
    const m = url.match(/graph\.facebook\.com\/v19\.0\/([^/?]+)(\/photos|\/feed)?(\?fields=id,name)?/);
    if (!m) return res({ error: { message: 'unexpected graph url' } }, false, 400);
    if (m[3]) return graphInfoFail ? res({ error: { message: 'Invalid OAuth access token.' } }, false, 400) : res({ id: m[1], name: 'Fanpage Test' });
    if (m[2] === '/photos') return photoFail ? res({ error: { message: 'Image rejected by Facebook' } }, false, 400) : res({ id: 'ph_' + (++nPost) });
    if (m[2] === '/feed' && feedOverride) return feedOverride();
    if (m[2] === '/feed' && feedNetErr) throw new TypeError('fetch failed');
    if (m[2] === '/feed') return feedFail ? res({ error: { message: '(#200) Permissions error' } }, false, 403) : res({ id: m[1] + '_post' + (++nPost) });
  }
  if (url.startsWith('https://compositor.test/')) {
    if (compositorHandler) return compositorHandler(url, opts);
    return res({ ok: false, code: 'DOWN' }, false, 503);
  }
  return res({ error: 'unexpected fetch ' + url }, false, 500);
};

// Bắt console để chứng minh không lộ token
const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) { const o = console[k]; console[k] = (...a) => { logs.push(a.map(String).join(' ')); }; console['_' + k] = o; }
const out = (...a) => console._log(...a);

// ── Nạp module sau khi đã mock ───────────────────────────────────────────────
const orch = require('../shared/contentOrchestrator');
const fbDraftStore = require('../shared/fbDraftStore');
const { handleTelegramWebhook } = require('../shared/telegramWebhookRelay');
const imageRouter = require('../shared/imageRouter');
const media = require('../shared/telegramMedia');

// ── Tiện ích test ────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); out('  ✓ ' + name); passed++; }
  catch (e) { out('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
function skip(name, why) { out('  ○ SKIPPED: ' + name + ' — ' + why); skipped++; }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

function crc(buf) { return zlib.crc32(buf) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function makePng(w, h) { // PNG RGB hợp lệ, nội dung dải màu (nén được)
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = ((x + y) * 7) & 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const SECRET = 'tg-webhook-secret-for-tests';

function resetAll(opts) {
  db = {}; storageFiles = {}; calls = []; sentTg = []; nPost = 0; keyCounter = 0; logs.length = 0;
  tgFileBytes = JPEG_BYTES; tgGetFileFail = false; tgSendFail = false; graphInfoFail = false; photoFail = false; feedFail = false; feedNetErr = false; feedOverride = null; failRead = null; compositorHandler = null;
  aiImpl = async () => ({ content: { versions: [{ hook: 'AI hook', caption: 'AI caption cho sản phẩm', cta: 'Nhắn tin ngay', hashtags: ['pshop', '#dj'] }] } });
  // Phase 5: secret = Functions secret (env), KHÔNG ở RTDB; RTDB chỉ có cấu hình không bí mật.
  process.env.TELEGRAM_BOT_TOKEN = BOT; process.env.TELEGRAM_WEBHOOK_SECRET = SECRET; delete process.env.COMPOSITOR_SECRET;
  setPath(db, 'telegramConfig', { chatId: '555', approverIds: ['777'], approverMap: { '777': 'uid_ok' }, dryRun: false }); // đăng thật bật TƯỜNG MINH (mặc định an toàn: xem [3d])
  setPath(db, 'roles/uid_ok', 'admin');
  setPath(db, 'facebookConnection', { status: 'connected' });
  setPath(db, 'facebookActiveToken', { pageId: 'page_1', accessToken: 'PAGE_TOKEN_SECRET', isMock: false, expiresAt: Date.now() + 1e9 });
  if (opts && opts.router) {
    const r = Object.assign({ enabled: true, approvedForProductPhotos: true, url: 'https://compositor.test', secret: 'c'.repeat(32), timeoutMs: 2000 }, opts.router);
    const sec = r.secret; delete r.secret; if (sec) process.env.COMPOSITOR_SECRET = sec; // secret compositor = Functions secret COMPOSITOR_SECRET
    setPath(db, 'imageRouterConfig', { providers: { compositor: r } });
  }
}
let updSeq = 100;
function productUpdate(over) {
  const o = over || {};
  return { update_id: o.update_id || (++updSeq), message: {
    message_id: 5, from: o.from || { id: 777, username: 'founder' }, chat: o.chat || { id: 555, type: 'private' },
    caption: o.caption === undefined ? 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Like new 95%' : o.caption,
    photo: o.photo === undefined ? [{ file_id: 'SMALL', width: 90, height: 60, file_size: 100 }, { file_id: 'BIG', width: 1280, height: 960, file_size: 90000 }] : o.photo,
    media_group_id: o.media_group_id
  } };
}
function cbUpdate(action, draftId, v, from, chat) {
  return { update_id: ++updSeq, callback_query: { id: 'cb' + updSeq, data: action + ':' + draftId + (v != null ? ':' + v : ''), from: from || { id: 777 }, message: { chat: chat || { id: 555 } } } };
}
async function webhook(update, secret) {
  let status = null, json = null;
  await handleTelegramWebhook({ method: 'POST', get: (h) => (h === 'X-Telegram-Bot-Api-Secret-Token' ? (secret === undefined ? SECRET : secret) : null), body: update },
    { status(c) { status = c; return this; }, json(d) { json = d; return this; } });
  return { status, json };
}
const drafts = () => Object.entries(getPath(db, 'fbPostDrafts') || {}).map(([id, d]) => Object.assign({ id }, d));
const only = () => { const d = drafts(); assert(d.length === 1, 'cần đúng 1 draft, có ' + d.length); return d[0]; };
const feedPosts = () => calls.filter((c) => c.method === 'POST' && /graph\.facebook\.com\/v19\.0\/[^/]+\/feed/.test(c.url));
const photoPosts = () => calls.filter((c) => c.method === 'POST' && /\/photos/.test(c.url));
const lastPreview = () => sentTg.filter((s) => (s.kind === 'sendPhoto' || s.kind === 'sendMessage') && s.reply_markup).pop();

(async () => {
  // ═════ [1] Parse + nhận sản phẩm ═════
  out('\n=== [1] Nhận ảnh + dữ liệu sản phẩm ===');
  await test('parseProductCaption: đủ trường (nhãn không phân biệt dấu/hoa thường)', async () => {
    const p = orch.parseProductCaption('TÊN: Sony A7\ngiá: 3tr5\nTinh trang: Mới 100%\nPage: 123_4');
    assert(p.ok); eq(p.product, { name: 'Sony A7', price: 3500000, condition: 'Mới 100%' }); eq(p.pageHint, '123_4');
  });
  await test('parsePriceVnd: các dạng giá hợp lệ + bác bỏ giá vô lý', async () => {
    eq(orch.parsePriceVnd('3.500.000'), 3500000); eq(orch.parsePriceVnd('3,500,000đ'), 3500000); eq(orch.parsePriceVnd('3tr'), 3000000);
    eq(orch.parsePriceVnd('3tr5'), 3500000); eq(orch.parsePriceVnd('3.5tr'), 3500000); eq(orch.parsePriceVnd('850k'), 850000); eq(orch.parsePriceVnd('2500000'), 2500000);
    for (const bad of ['', 'abc', '0', '-5', '12', '99999999999999', '3.5.5', 'miễn phí']) assert(orch.parsePriceVnd(bad) === null, 'phải từ chối: ' + bad);
  });
  await test('Luồng đầy đủ: ảnh+Tên/Giá/Tình trạng → ảnh lưu Storage (không URL Telegram) → bản nháp PENDING_APPROVAL → xem trước có nút', async () => {
    resetAll();
    const r = await orch.handleTelegramMessage(productUpdate());
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.status, 'PENDING_APPROVAL'); eq(d.product, { name: 'Pioneer DDJ-400', price: 3500000, condition: 'Like new 95%' });
    eq(d.pageId, 'page_1'); eq(d.source, 'telegram'); eq(d.pshUid, 'uid_ok');
    assert(storageFiles['fbDrafts/' + d.id + '/original.jpg'], 'ảnh gốc phải được lưu Storage');
    assert(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\//.test(d.imageUrls[0]), 'URL lâu dài của Firebase Storage');
    assert(!JSON.stringify(d).includes('api.telegram.org') && !JSON.stringify(d).includes(BOT), 'draft không chứa URL/token Telegram');
    // Ảnh lớn nhất được chọn
    assert(calls.some((c) => c.url.includes('getFile?file_id=BIG')), 'phải chọn ảnh lớn nhất');
    const pv = lastPreview(); assert(pv && pv.reply_markup.inline_keyboard[0].length === 2, 'xem trước phải có 2 nút');
    eq(pv.reply_markup.inline_keyboard[0][0].callback_data, 'fb_approve:' + d.id + ':1'); eq(pv.reply_markup.inline_keyboard[0][1].callback_data, 'fb_cancel:' + d.id);
    assert(!JSON.stringify(pv.reply_markup).includes(BOT), 'callback_data không chứa token');
    const text = pv.caption || pv.text;
    assert(text.includes('Fanpage Test') && text.includes('3.500.000đ') && text.includes('Like new 95%') && text.includes('page_1'), 'xem trước phải có Page, tên, giá, tình trạng');
    assert(d.steps.intake.status === 'ok' && d.steps.content.status === 'ok' && d.steps.image.status === 'ok' && d.steps.preview.status === 'ok', 'steps phải được ghi nhận');
    eq(feedPosts().length, 0); // CHƯA đăng gì
  });
  await test('Thiếu dữ liệu: thiếu giá / giá sai / thiếu tình trạng / thiếu tên → từ chối, không tạo draft, hướng dẫn mẫu', async () => {
    for (const cap of ['Tên: A\nTình trạng: Mới', 'Tên: A\nGiá: abc\nTình trạng: Mới', 'Tên: A\nGiá: 1tr', 'Giá: 1tr\nTình trạng: Mới', null]) {
      resetAll(); const r = await orch.handleTelegramMessage(productUpdate({ caption: cap }));
      assert(r.rejected, 'phải rejected: ' + cap); eq(drafts().length, 0);
      assert(sentTg.some((s) => s.kind === 'sendMessage' && /Mẫu chú thích/.test(s.text)), 'phải gửi mẫu hướng dẫn');
    }
  });
  await test('Không có ảnh → nhắc gửi ảnh; không tạo draft', async () => {
    resetAll(); const r = await orch.handleTelegramMessage(productUpdate({ photo: [] }));
    eq(drafts().length, 0); assert(r.skipped);
  });
  await test('Ảnh lỗi: getFile thất bại / không phải ảnh / quá lớn → draft FAILED, báo lỗi, KHÔNG lộ token, không đăng', async () => {
    resetAll(); tgGetFileFail = true; let r = await orch.handleTelegramMessage(productUpdate());
    assert(r.failed && only().status === 'FAILED' && only().failStage === 'intake');
    resetAll(); tgFileBytes = Buffer.from('<html>not an image at all, long enough........</html>'); r = await orch.handleTelegramMessage(productUpdate());
    assert(r.failed && /JPEG\/PNG\/WEBP/.test(only().failReason));
    resetAll(); tgFileBytes = Buffer.concat([JPEG_BYTES, Buffer.alloc(media.MAX_BYTES + 10, 1)]); r = await orch.handleTelegramMessage(productUpdate());
    assert(r.failed && /quá lớn/.test(only().failReason));
    assert(!JSON.stringify(db).includes(BOT), 'bot token không được xuất hiện ở bất kỳ đâu trong RTDB');
    assert(!sentTg.some((s) => JSON.stringify(s).includes(BOT)) && !logs.some((l) => l.includes(BOT)), 'token không có trong tin nhắn/log');
    eq(feedPosts().length, 0);
  });
  await test('Webhook gửi lặp (cùng update_id): chỉ 1 draft, 1 bản xem trước; gửi song song 2 request cũng chỉ 1', async () => {
    resetAll(); const u = productUpdate({ update_id: 9001 });
    const a = await orch.handleTelegramMessage(u); const b = await orch.handleTelegramMessage(u);
    assert(a.result && b.duplicate, JSON.stringify(b)); eq(drafts().length, 1); eq(sentTg.filter((s) => s.reply_markup).length, 1);
    resetAll(); const u2 = productUpdate({ update_id: 9002 });
    const rs = await Promise.all([orch.handleTelegramMessage(u2), orch.handleTelegramMessage(u2)]);
    eq(drafts().length, 1); assert(rs.filter((x) => x.duplicate).length === 1, 'đúng 1 request bị coi là trùng');
  });
  await test('Claim treo > 5 phút (function chết giữa chừng) → tiếp quản và chạy tiếp ĐÚNG draft cũ, không tạo draft mới', async () => {
    resetAll(); const u = productUpdate({ update_id: 9003 });
    // Giả lập: đã tạo draft + ảnh, chết trước bước nội dung
    const d = await fbDraftStore.createDraft({ telegramUpdateId: 9003, pageId: 'page_1', caption: '', imageUrls: [], requestedBy: 'telegram:uid_ok', extra: { source: 'telegram', product: { name: 'X', price: 1500000, condition: 'Mới' }, pageName: 'Fanpage Test', steps: {}, notices: [] } });
    await fbDraftStore.updateStatus(d.id, 'PROCESSING');
    const sv = await media.saveToStorage('fbDrafts/' + d.id + '/original.jpg', JPEG_BYTES, 'image/jpeg');
    await fbDraftStore.patchFields(d.id, { imageUrls: [sv.url], originalStoragePath: sv.path });
    setPath(db, 'telegramUpdates/9003', { state: 'processing', startedAt: Date.now() - 6 * 60 * 1000, draftId: d.id });
    const r = await orch.handleTelegramMessage(u);
    assert(r.resumed && r.draftId === d.id, JSON.stringify(r)); eq(drafts().length, 1); eq(only().status, 'PENDING_APPROVAL');
    // claim còn mới → không tiếp quản
    resetAll(); setPath(db, 'telegramUpdates/9004', { state: 'processing', startedAt: Date.now() - 1000 });
    const r2 = await orch.handleTelegramMessage(productUpdate({ update_id: 9004 })); assert(r2.duplicate); eq(drafts().length, 0);
  });
  await test('Album (media_group_id) không có chú thích bị bỏ qua im lặng', async () => {
    resetAll(); const r2 = await orch.handleTelegramMessage(productUpdate({ caption: null, media_group_id: 'g1' }));
    assert(r2.skipped && r2.reason === 'album_without_caption'); eq(drafts().length, 0);
  });

  // ═════ [2] AI nội dung ═════
  out('\n=== [2] AI tạo nội dung ===');
  await test('AI thành công: caption AI + khối Giá/Tình trạng do HỆ THỐNG chèn đúng dữ liệu người gửi; gọi đúng module với dữ liệu sản phẩm', async () => {
    resetAll(); let seen = null; aiImpl = async (m, input) => { seen = { m, input }; return { content: { versions: [{ hook: 'H', caption: 'Giá chỉ 1.000đ!!', cta: 'C', hashtags: ['x'] }] } }; };
    await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(seen.m, 'facebook-post-generator'); assert(/Pioneer DDJ-400/.test(seen.input.topic) && /Like new 95%/.test(seen.input.topic));
    assert(d.aiCaption.includes('💰 Giá: 3.500.000đ') && d.aiCaption.includes('📦 Tình trạng: Like new 95%'), 'sự thật về giá/tình trạng luôn đúng');
    eq(d.contentSource, 'ai');
  });
  await test('AI lỗi: dùng nội dung mẫu + CẢNH BÁO cho người duyệt; luồng vẫn tiếp tục', async () => {
    resetAll(); aiImpl = async () => { throw new Error('quota'); }; await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(d.contentSource, 'template'); eq(d.status, 'PENDING_APPROVAL'); assert(d.notices.some((n) => /nội dung mẫu/.test(n)));
    assert((lastPreview().caption || lastPreview().text).includes('⚠️'), 'cảnh báo phải hiện trong xem trước');
  });
  await test('AI treo quá thời hạn → nội dung mẫu + cảnh báo (không treo webhook)', async () => {
    resetAll(); aiImpl = () => new Promise(() => {}); // không bao giờ trả
    const t0 = Date.now(); await orch.handleTelegramMessage(productUpdate(), { aiTimeoutMs: 80 }); const d = only();
    assert(Date.now() - t0 < 5000, 'không được chờ vô hạn'); eq(d.contentSource, 'template'); assert(d.notices.some((n) => /nội dung mẫu/.test(n)));
  });
  await test('telegramWebhook được bind secret OPENAI_API_KEY (aiGenerate đọc OPENAI_API_KEY.value(); thiếu ⇒ AI luôn lỗi âm thầm)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    assert(src.includes('exports.telegramWebhook = onRequest({ secrets: [OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, COMPOSITOR_SECRET]'), 'index.js phải khai báo secrets cho telegramWebhook');
  });
  await test('Tin nhắn quá cũ (phát lại) bị bỏ qua; tin nhắn mới có date hợp lệ vẫn nhận', async () => {
    resetAll(); const old = productUpdate(); old.message.date = Math.floor(Date.now() / 1000) - 2 * 3600;
    let r = await orch.handleTelegramMessage(old); eq(r.reason, 'stale_message'); eq(drafts().length, 0);
    const fresh = productUpdate(); fresh.message.date = Math.floor(Date.now() / 1000) - 30; r = await orch.handleTelegramMessage(fresh); assert(r.result && r.result.ok);
  });
  await test('Người chưa được cấp quyền (trong chat đúng) nhận Telegram ID của chính họ để gửi Founder cấu hình', async () => {
    resetAll(); await orch.handleTelegramMessage(productUpdate({ from: { id: 888 } })); assert(sentTg.some((x) => /Telegram ID của bạn: 888/.test(x.text || '')));
    resetAll(); setPath(db, 'telegramConfig/approverIds', ['777', '888']); await orch.handleTelegramMessage(productUpdate({ from: { id: 888 } })); assert(sentTg.some((x) => /Telegram ID của bạn: 888/.test(x.text || '') && /approverMap/.test(x.text)));
  });
  await test('Tên sản phẩm chứa ký tự điều khiển/quá dài bị làm sạch', async () => {
    const p = orch.parseProductCaption('Tên: ' + 'A\u0000\u0007B'.repeat(100) + '\nGiá: 2tr\nTình trạng: Mới'); assert(p.ok && p.product.name.length <= 120 && !/[\u0000-\u001f]/.test(p.product.name));
  });

  // ═════ [3] Image Router ═════
  out('\n=== [3] Image Router ===');
  await test('Mặc định (chưa bật provider): bỏ qua ảnh, dùng ảnh GỐC và báo rõ; compositor KHÔNG nhận ảnh', async () => {
    resetAll(); await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(d.imageMode, 'original'); eq(d.publishImages, d.imageUrls); assert(d.notices.some((n) => /CHƯA được tạo/.test(n))); eq(d.steps.image.result, 'skipped');
    assert(!calls.some((c) => c.url.startsWith('https://compositor.test')), 'không được gọi compositor');
  });
  await test('Provider bật nhưng CHƯA được duyệt nhận ảnh sản phẩm → blocked, ảnh sản phẩm KHÔNG rời hệ thống', async () => {
    resetAll({ router: { approvedForProductPhotos: false } }); compositorHandler = async () => { throw new Error('không được gọi'); };
    await orch.handleTelegramMessage(productUpdate()); eq(only().steps.image.result, 'blocked'); assert(!calls.some((c) => c.url.startsWith('https://compositor.test')));
  });
  await test('Cấu hình sai (URL http / thiếu secret) → blocked, không gửi ảnh', async () => {
    for (const bad of [{ url: 'http://compositor.test' }, { secret: '' }]) { resetAll({ router: bad }); await orch.handleTelegramMessage(productUpdate()); eq(only().steps.image.result, 'blocked'); assert(!calls.some((c) => /compositor\.test/.test(c.url))); }
  });
  const okPng = makePng(64, 64);
  const okResp = (over) => async () => res(Object.assign({ ok: true, image_b64: okPng.toString('base64'), report: { product_pixels_preserved: true, width: 64, height: 64, background: 'procedural:studio' } }, over || {}));
  await test('Compositor thành công: ảnh quảng cáo lưu Storage, publishImages = ảnh quảng cáo; gửi đúng header secret + ảnh gốc base64', async () => {
    resetAll({ router: {} }); let hdr = null, bodyObj = null;
    compositorHandler = async (url, opts) => { hdr = opts.headers; bodyObj = JSON.parse(opts.body); return okResp()(); };
    await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(d.imageMode, 'composited'); assert(d.publishImages[0] === d.generatedImageUrl && /final\.png/.test(d.generatedImageUrl));
    assert(storageFiles['fbDrafts/' + d.id + '/final.png'], 'ảnh kết quả phải lưu Storage');
    eq(hdr['X-Compositor-Secret'], 'c'.repeat(32)); eq(Buffer.from(bodyObj.image_b64, 'base64').equals(JPEG_BYTES), true);
    assert(!d.notices.length, 'không cần cảnh báo khi ảnh thành công');
    assert(lastPreview().kind === 'sendPhoto' && lastPreview().photo === d.generatedImageUrl, 'xem trước phải là ảnh quảng cáo');
  });
  await test('Compositor lỗi (5xx / mạng / timeout / ảnh không hợp lệ / không cam kết giữ pixel / NO_SEGMENTATION) → quay về ảnh gốc + cảnh báo rõ', async () => {
    const cases = {
      '5xx': async () => res({ ok: false, code: 'INTERNAL' }, false, 500),
      'mạng': async () => { throw new Error('ECONNREFUSED'); },
      'timeout': (url, opts) => new Promise((_, rej) => { opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }),
      'ảnh rác': okResp({ image_b64: Buffer.from('not an image').toString('base64') }),
      'không cam kết pixel': okResp({ report: { product_pixels_preserved: false } }),
      'không có mô hình tách nền': async () => res({ ok: false, code: 'NO_SEGMENTATION', message: 'x' }, false, 422)
    };
    for (const [name, h] of Object.entries(cases)) {
      resetAll({ router: { timeoutMs: 60 } }); compositorHandler = h; await orch.handleTelegramMessage(productUpdate()); const d = only();
      eq(d.imageMode, name === 'x' ? 'composited' : 'original', name); eq(d.status, 'PENDING_APPROVAL', name);
      assert(d.notices.some((n) => /ảnh GỐC/.test(n)), 'cảnh báo cho: ' + name); assert(!storageFiles['fbDrafts/' + d.id + '/final.png'], 'không lưu ảnh kết quả khi lỗi: ' + name);
    }
  });
  await test('Nền AI (aiBackground) mặc định TẮT: không gọi image-generator; chỉ chạy khi chủ dự án bật, prompt KHÔNG chứa ảnh sản phẩm', async () => {
    resetAll({ router: {} }); let imgCalls = 0; aiImpl = async (m) => { if (m === 'image-generator') { imgCalls++; return { content: { imageUrl: 'https://img.test/bg.png' } }; } return { content: { versions: [{ hook: 'h', caption: 'c', cta: 'x', hashtags: [] }] } }; };
    compositorHandler = okResp(); await orch.handleTelegramMessage(productUpdate()); eq(imgCalls, 0);
    resetAll({ router: {} }); setPath(db, 'imageRouterConfig/providers/aiBackground', { enabled: true, approvedForBackgrounds: true });
    let imgInput = null; aiImpl = async (m, input) => { if (m === 'image-generator') { imgInput = input; return { content: { imageUrl: 'https://img.test/bg.png' } }; } return { content: { versions: [{ hook: 'h', caption: 'c', cta: 'x', hashtags: [] }] } }; };
    const prevFetch = global.fetch; global.fetch = async (u, o) => (String(u) === 'https://img.test/bg.png' ? res(okPng) : prevFetch(u, o));
    compositorHandler = async (u, o) => { const b = JSON.parse(o.body); assert(b.background_b64, 'phải gửi nền'); return okResp()(); };
    await orch.handleTelegramMessage(productUpdate()); global.fetch = prevFetch;
    assert(imgInput && !('imageUrl' in imgInput) && !/Pioneer/.test(JSON.stringify(imgInput)), 'prompt nền không chứa dữ liệu/ảnh sản phẩm'); eq(only().imageMode, 'composited');
  });
  // Tích hợp Python thật
  const py = process.env.PSH_COMPOSITOR_PYTHON || 'D:/PshopMusicSite-release-artifacts/work/pyvenv/Scripts/python.exe';
  const stub = path.join(__dirname, '..', '..', 'tools', 'compositor', 'stub_segmenter_server.py');
  let srv = null;
  if (fs.existsSync(py) && fs.existsSync(stub)) {
    try {
      const secret = 'integration-secret-0123456789abcdef';
      srv = spawn(py, [stub], { cwd: path.dirname(stub), env: Object.assign({}, process.env, { COMPOSITOR_SECRET: secret }) });
      const port = await new Promise((ok, bad) => { let b = ''; srv.stdout.on('data', (d) => { b += d; const m = b.match(/^(\d+)\s/); if (m) ok(Number(m[1])); }); srv.on('error', bad); srv.on('exit', () => bad(new Error('compositor stub exited'))); setTimeout(() => bad(new Error('stub timeout')), 15000); });
      await test('TÍCH HỢP (Python thật): Node→compositor_server→compose→PNG; báo cáo giữ pixel; ảnh kết quả là PNG hợp lệ lưu Storage', async () => {
        resetAll({ router: { secret } });
        compositorHandler = (url, opts) => realFetch(url.replace('https://compositor.test', 'http://127.0.0.1:' + port), opts);
        tgFileBytes = makePng(600, 450);
        await orch.handleTelegramMessage(productUpdate()); const d = only();
        eq(d.imageMode, 'composited', JSON.stringify(d.notices)); const f = storageFiles['fbDrafts/' + d.id + '/final.png'];
        assert(f && f.buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG hợp lệ');
        assert(f.buf.readUInt32BE(16) >= 600 && f.buf.readUInt32BE(20) >= 450, 'khung không nhỏ hơn sản phẩm (không thu nhỏ sản phẩm)');
        // Bộ nhớ: phần pixel gốc nằm nguyên trong ảnh kết quả được kiểm bởi test Python (core_pixels_mismatched == 0)
      });
      await test('TÍCH HỢP (Python thật): secret sai → 401 → quay về ảnh gốc + cảnh báo', async () => {
        resetAll({ router: { secret: 'wrong-secret-wrong-secret-wrong-1' } });
        compositorHandler = (url, opts) => realFetch(url.replace('https://compositor.test', 'http://127.0.0.1:' + port), opts);
        tgFileBytes = makePng(600, 450); await orch.handleTelegramMessage(productUpdate()); eq(only().imageMode, 'original');
      });
    } catch (e) { skip('Tích hợp compositor Python thật', 'không khởi động được (' + e.message + ')'); }
    finally { if (srv) srv.kill(); }
  } else skip('Tích hợp compositor Python thật', 'không tìm thấy Python/Pillow (đặt PSH_COMPOSITOR_PYTHON). Test Python chạy riêng: tools/compositor `python -m unittest`');

  // Tích hợp Python THẬT + mô hình tách nền rembg THẬT (không stub). SKIPPED nếu rembg/mô hình chưa có.
  const realSrv = path.join(__dirname, '..', '..', 'tools', 'compositor', 'compositor_server.py');
  const demoMaker = path.join(__dirname, '..', '..', 'tools', 'compositor', 'make_demo_product.py');
  let haveRembg = false;
  if (fs.existsSync(py)) { try { require('child_process').execFileSync(py, ['-c', 'import rembg, onnxruntime'], { stdio: 'ignore' }); haveRembg = true; } catch (e) { haveRembg = false; } }
  if (haveRembg && fs.existsSync(realSrv)) {
    let srv2 = null;
    try {
      const secret2 = 'real-model-secret-0123456789abcdef';
      const demoPng = path.join(require('os').tmpdir(), 'psh_demo_product_' + process.pid + '.png');
      require('child_process').execFileSync(py, [demoMaker, demoPng], { cwd: path.dirname(demoMaker) });
      const demoBytes = fs.readFileSync(demoPng); fs.unlinkSync(demoPng);
      const port2 = 18700 + Math.floor(Math.random() * 200);
      srv2 = spawn(py, [realSrv, '--host', '127.0.0.1', '--port', String(port2)], { cwd: path.dirname(realSrv), env: Object.assign({}, process.env, { COMPOSITOR_SECRET: secret2 }) });
      await new Promise((ok, bad) => { const t0 = Date.now(); (function poll() { realFetch('http://127.0.0.1:' + port2 + '/health').then((r) => (r.ok ? ok() : Promise.reject())).catch(() => (Date.now() - t0 > 20000 ? bad(new Error('compositor thật không lên')) : setTimeout(poll, 300))); })(); });
      await test('TÍCH HỢP THẬT (compositor_server + rembg + mô hình thật): ảnh sản phẩm → ảnh quảng cáo PNG; sản phẩm 1:1; báo cáo giữ pixel', async () => {
        resetAll({ router: { secret: secret2, timeoutMs: 120000 } });
        compositorHandler = (url, opts) => realFetch(url.replace('https://compositor.test', 'http://127.0.0.1:' + port2), opts);
        tgFileBytes = demoBytes; await orch.handleTelegramMessage(productUpdate()); const d = only();
        eq(d.imageMode, 'composited', JSON.stringify(d.notices)); eq(d.steps.image.result, 'ok');
        const fin = storageFiles['fbDrafts/' + d.id + '/final.png']; assert(fin && fin.buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
        assert(fin.buf.length > 20000 && fin.buf.length < 4500000, 'cỡ ảnh hợp lý: ' + fin.buf.length);
        if (process.env.PSH_SAVE_OUTPUT) { fs.writeFileSync(process.env.PSH_SAVE_OUTPUT + '.final.png', fin.buf); fs.writeFileSync(process.env.PSH_SAVE_OUTPUT + '.original.png', demoBytes); }
      });
    } catch (e) { skip('Tích hợp THẬT compositor + rembg', 'không khởi động được: ' + e.message); }
    finally { if (srv2) srv2.kill(); }
  } else skip('Tích hợp THẬT compositor + rembg (mô hình thật)', 'rembg/onnxruntime chưa cài trong ' + py);

  // ═════ [3c] Phase 5 — secret KHÔNG ở RTDB ═════
  out('\n=== [3c] Bảo vệ secret (Functions secret / env, không RTDB) ===');
  await test('Bot token CHỈ từ TELEGRAM_BOT_TOKEN: RTDB còn trường token cũ → BỊ BỎ QUA (không gửi gì tới Telegram); cảnh báo chỉ nêu TÊN khoá', async () => {
    resetAll(); delete process.env.TELEGRAM_BOT_TOKEN; setPath(db, 'telegramConfig/token', BOT); setPath(db, 'telegramConfig/botToken', BOT);
    const r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'telegram_token_missing'); eq(drafts().length, 0);
    assert(!calls.some((c) => /api\.telegram\.org/.test(c.url)), 'không được gọi Telegram bằng token đọc từ RTDB');
    const secretsMod = require('../shared/telegramSecrets'); const cfg = await secretsMod.loadTelegramConfig(); eq(cfg.token, ''); assert(!('botToken' in cfg), 'trường bí mật cũ bị loại khỏi cấu hình');
    assert(logs.some((l) => /RTDB còn trường bí mật cũ \(token, botToken\)/.test(l)) && !logs.some((l) => l.includes(BOT)), 'cảnh báo nêu tên khoá, KHÔNG nêu giá trị');
  });
  await test('Thiếu TELEGRAM_BOT_TOKEN → dừng an toàn: không tạo draft, không gọi Telegram, log lỗi cấu hình không chứa secret', async () => {
    resetAll(); delete process.env.TELEGRAM_BOT_TOKEN; const r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'telegram_token_missing'); eq(drafts().length, 0); eq(sentTg.length, 0);
    assert(logs.some((l) => /TELEGRAM_BOT_TOKEN chưa được cấu hình/.test(l)));
    const w = await webhook(productUpdate()); eq(w.status, 200); eq(drafts().length, 0); // webhook vẫn trả 200 (Telegram không retry), không lỗi
  });
  await test('Relay KHÔNG chấp nhận secret nằm trong RTDB: telegramWebhookSecret/webhookSigningSecret trong RTDB vô hiệu; chỉ TELEGRAM_WEBHOOK_SECRET', async () => {
    resetAll(); delete process.env.TELEGRAM_WEBHOOK_SECRET; db.telegramWebhookSecret = 'rtdb-secret'; db.webhookSigningSecret = 'rtdb-gateway';
    for (const h of ['rtdb-secret', 'rtdb-gateway', SECRET, '']) { const r = await webhook(productUpdate(), h); eq(r.json.reason, 'auth', 'header ' + h); }
    eq(drafts().length, 0); assert(logs.some((l) => /TELEGRAM_WEBHOOK_SECRET chưa được cấu hình/.test(l)) && !logs.some((l) => l.includes('rtdb-secret') || l.includes('rtdb-gateway')), 'log lỗi cấu hình, không lộ giá trị');
    process.env.TELEGRAM_WEBHOOK_SECRET = 'env-secret'; let r2 = await webhook(productUpdate(), 'rtdb-secret'); eq(r2.json.reason, 'auth'); r2 = await webhook(productUpdate(), 'env-secret'); eq(r2.status, 200); assert(r2.json.handled === true, 'đúng secret env được nhận');
  });
  await test('Compositor: thiếu COMPOSITOR_SECRET hoặc chỉ có "secret" trong RTDB → blocked, ảnh sản phẩm KHÔNG rời hệ thống; secret RTDB bị bỏ qua (có cảnh báo, không in giá trị)', async () => {
    resetAll({ router: { secret: '' } }); setPath(db, 'imageRouterConfig/providers/compositor/secret', 'c'.repeat(32));
    compositorHandler = async () => { throw new Error('không được gọi'); };
    await orch.handleTelegramMessage(productUpdate()); eq(only().steps.image.result, 'blocked'); assert(!calls.some((c) => /compositor\.test/.test(c.url)), 'không gửi ảnh');
    assert(only().notices.some((n) => /COMPOSITOR_SECRET/.test(n)), 'cảnh báo cho người duyệt nêu COMPOSITOR_SECRET'); assert(logs.some((l) => /imageRouterConfig\] CẢNH BÁO/.test(l)) && !logs.some((l) => l.includes('c'.repeat(32))));
  });
  await test('KHÔNG lộ secret: toàn bộ luồng (intake→AI→ảnh→preview→duyệt→đăng) + route gateway tạo draft — quét log, tin Telegram, RTDB, mọi response', async () => {
    resetAll({ router: { secret: 'COMPOSITOR-SECRET-VALUE-0123456789' } });
    process.env.WEBHOOK_SIGNING_SECRET = 'GATEWAY-SIGNING-SECRET-VALUE'; process.env.OPENAI_API_KEY = 'sk-test-OPENAI-VALUE-0123456789';
    compositorHandler = async () => res({ ok: true, image_b64: makePng(64, 64).toString('base64'), report: { product_pixels_preserved: true } });
    const responses = [];
    responses.push(await webhook(productUpdate())); const d = only(); responses.push(await webhook(cbUpdate('fb_approve', d.id, 1)));
    const fbPublisher = require('../routes/fbPublisher'); let gw = null;
    await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body: { pageId: 'page_1', caption: 'x' }, get: () => null },
      { status() { return this; }, json(x) { gw = x; } }, { sendSuccess: (r2, data) => r2.json({ success: true, data }), sendError: (r2, code, m) => r2.json({ success: false, code, m }), auth: { ok: true, role: 'admin', uid: 'u', email: 'a@x' } });
    responses.push(gw);
    const secretsList = [BOT, SECRET, 'COMPOSITOR-SECRET-VALUE-0123456789', 'GATEWAY-SIGNING-SECRET-VALUE', 'sk-test-OPENAI-VALUE-0123456789'];
    const hay = JSON.stringify({ logs, sentTg, db, responses }); const leaked = secretsList.filter((x) => hay.includes(x));
    assert(!JSON.stringify({ logs, sentTg, responses }).includes('PAGE_TOKEN_SECRET'), 'page token (G1, lưu trong facebookActiveToken theo thiết kế) không được lộ ra log/Telegram/response');
    assert(leaked.length === 0, 'rò rỉ ' + leaked.length + '/' + secretsList.length + ' secret: ' + leaked.map((x) => x.slice(0, 6) + '…').join(','));
    assert(gw && gw.success === true, 'route gateway tạo draft vẫn hoạt động (dùng bot token từ env)'); assert(sentTg.filter((x) => x.reply_markup).length >= 2, 'preview gửi cả từ webhook lẫn route gateway');
  });
  await test('Mã nguồn không còn đọc secret từ RTDB: không có tham chiếu tới RTDB webhookSigningSecret/telegramWebhookSecret/telegramConfig.token ngoài telegramSecrets.js', async () => {
    const dirs = [path.join(__dirname, '..', 'shared'), path.join(__dirname, '..', 'routes')]; const offenders = [];
    for (const dir of dirs) for (const fn of fs.readdirSync(dir)) {
      if (!fn.endsWith('.js') || fn === 'telegramSecrets.js') continue; const src = fs.readFileSync(path.join(dir, fn), 'utf8');
      if (/ref\(\s*['"](webhookSigningSecret|telegramWebhookSecret)['"]/.test(src) || /tgConfig\.token\s*=/.test(src)) offenders.push(fn);
    }
    eq(offenders.join(','), '');
  });

  // ═════ [3d] Phase 8 — F1 (kết quả đăng không xác định) & F2 (dryRun fail-safe) ═════
  out('\n=== [3d] Phase 8: F1 retry/đăng trùng · F2 dryRun fail-safe ===');
  const { resolvePublishMode } = require('../shared/publishMode');
  await test('F2 resolvePublishMode: CHỈ boolean false tường minh mới là live; mọi giá trị khác (thiếu/null/sai kiểu/true/cấu hình hỏng) là dry-run', async () => {
    eq(resolvePublishMode({ dryRun: false }), { live: true, reason: 'dryRun_false' });
    eq(resolvePublishMode({ dryRun: true }), { live: false, reason: 'dryRun_true' });
    eq(resolvePublishMode({}).live, false); eq(resolvePublishMode({}).reason, 'dryRun_missing');
    eq(resolvePublishMode({ dryRun: null }).reason, 'dryRun_missing'); eq(resolvePublishMode({ dryRun: undefined }).reason, 'dryRun_missing');
    for (const bad of ['false', 'true', 'FALSE', 0, 1, -1, NaN, [], [false], {}, { x: 1 }, '', ' ']) { const m = resolvePublishMode({ dryRun: bad }); eq(m.live, false, 'dryRun=' + JSON.stringify(bad)); eq(m.reason, 'dryRun_invalid_type'); }
    for (const bad of [null, undefined, 'garbage', 5, true, [], [{ dryRun: false }], { __configInvalid: true, dryRun: false }]) { const m = resolvePublishMode(bad); eq(m.live, false, 'cfg=' + JSON.stringify(bad)); eq(m.reason, 'config_invalid'); }
  });
  await test('F2 đầu-cuối: dryRun thiếu/null/"false"/"true"/0/1/[]/{}/true ⇒ DUYỆT KHÔNG gọi Facebook (0 POST photos/feed), draft dryRun; CHỈ false ⇒ đăng 1 bài', async () => {
    const cases = [['thiếu', undefined, 'dryRun_missing'], ['null', null, 'dryRun_missing'], ['"false"', 'false', 'dryRun_invalid_type'], ['"true"', 'true', 'dryRun_invalid_type'], ['0', 0, 'dryRun_invalid_type'], ['1', 1, 'dryRun_invalid_type'],
      ['[]', [], 'dryRun_invalid_type'], ['{}', {}, 'dryRun_invalid_type'], ['true', true, 'dryRun_true']];
    for (const [label, val, reason] of cases) {
      const d = await pending(); if (val === undefined) delete db.telegramConfig.dryRun; else db.telegramConfig.dryRun = val;
      await webhook(cbUpdate('fb_approve', d.id, 1)); const x = getPath(db, 'fbPostDrafts/' + d.id);
      eq(feedPosts().length, 0, 'dryRun=' + label + ': không được đăng'); eq(photoPosts().length, 0, 'dryRun=' + label); eq(x.status, 'PUBLISHED'); eq(x.dryRun, true, label); eq(x.dryRunReason, reason, label); assert(!x.facebookPostId);
      assert(sentTg.filter((s) => s.kind === 'sendMessage').pop().text.includes('KHÔNG đăng'), 'thông báo dry-run: ' + label);
    }
    const d = await pending(); db.telegramConfig.dryRun = false; await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 1, 'dryRun=false tường minh ⇒ đăng'); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED'); assert(!getPath(db, 'fbPostDrafts/' + d.id + '/dryRun'));
  });
  await test('F2: thông báo dry-run mặc định nêu rõ lý do và cách bật đăng thật (không dán giá trị cấu hình)', async () => {
    const d = await pending(); delete db.telegramConfig.dryRun; await webhook(cbUpdate('fb_approve', d.id, 1)); const t = sentTg.filter((s) => s.kind === 'sendMessage').pop().text;
    assert(/mặc định an toàn/.test(t) && /dryRun_missing/.test(t) && /dryRun = false \(boolean\)/.test(t), t);
  });
  await test('F2: cấu hình telegramConfig sai dạng (chuỗi/số/mảng) ⇒ không nhận sản phẩm, DUYỆT bị từ chối, 0 đăng', async () => {
    for (const garbage of ['garbage', 42, [false], true]) {
      const d = await pending(); db.telegramConfig = garbage; await webhook(cbUpdate('fb_approve', d.id, 1));
      eq(feedPosts().length, 0, 'cfg=' + JSON.stringify(garbage)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL');
      const before = drafts().length; await orch.handleTelegramMessage(productUpdate()); eq(drafts().length, before, 'không tạo draft khi cấu hình hỏng');
    }
  });
  await test('F2: LỖI ĐỌC RTDB telegramConfig lúc DUYỆT ⇒ không đăng, draft giữ PENDING_APPROVAL, callback trả 200; lúc nhận sản phẩm ⇒ không tạo draft; log không lộ secret', async () => {
    const d = await pending(); failRead = 'telegramConfig'; logs.length = 0;
    const r = await webhook(cbUpdate('fb_approve', d.id, 1)); eq(r.status, 200); eq((r.json.data || {}).reason, 'config_unreadable', JSON.stringify(r.json));
    eq(feedPosts().length, 0); eq(photoPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL');
    const n = drafts().length; const w = await webhook(productUpdate()); eq(w.status, 200); eq(drafts().length, n, 'không tạo draft');
    assert(!logs.some((l) => l.includes(BOT) || l.includes(SECRET)), 'log không lộ secret'); failRead = null;
    await webhook(cbUpdate('fb_approve', d.id, 1)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED', 'sau khi RTDB hồi phục luồng bình thường');
  });
  await test('F2: bản xem trước nêu chế độ — dry-run mặc định / DRY-RUN / ĐĂNG THẬT — để người duyệt biết nút DUYỆT làm gì', async () => {
    resetAll(); delete db.telegramConfig.dryRun; await orch.handleTelegramMessage(productUpdate()); let t = lastPreview(); t = t.caption || t.text; assert(/Chế độ: DRY-RUN mặc định an toàn/.test(t) && /KHÔNG đăng lên Facebook/.test(t), t);
    resetAll(); db.telegramConfig.dryRun = true; await orch.handleTelegramMessage(productUpdate()); t = lastPreview(); t = t.caption || t.text; assert(/DRY-RUN \(telegramConfig\.dryRun = true\)/.test(t), t);
    resetAll(); await orch.handleTelegramMessage(productUpdate()); t = lastPreview(); t = t.caption || t.text; assert(/ĐĂNG THẬT/.test(t) && /sẽ ĐĂNG lên Fanpage/.test(t), t);
  });
  const ambiguousCases = {
    'HTTP 500': () => res({ error: { message: 'Internal', code: 190 } }, false, 500),
    'HTTP 503': () => res({ error: { message: 'Service unavailable' } }, false, 503),
    'Graph code 1 (HTTP 500)': () => res({ error: { message: 'An unknown error has occurred.', code: 1 } }, false, 500),
    'Graph code 1 (HTTP 400)': () => res({ error: { message: 'An unknown error occurred', code: 1 } }, false, 400),
    'Graph code 2 (HTTP 503)': () => res({ error: { message: 'Service temporarily unavailable', code: 2 } }, false, 503),
    'Graph code 2 (HTTP 400)': () => res({ error: { message: 'Service temporarily unavailable', code: 2 } }, false, 400),
    'HTTP 200 thiếu post ID': () => res({}, true, 200),
    'HTTP 200 id rỗng': () => res({ id: '' }, true, 200),
    'mất kết nối (TypeError)': () => { throw new TypeError('fetch failed'); },
    'timeout (AbortError)': () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
  };
  await test('F1: kết quả KHÔNG xác định (HTTP 500/503, Graph code 1/2, HTTP 200 thiếu id, mất kết nối/timeout) ⇒ FAILED(publish_unknown), đúng 1 lần gọi feed, /retry bị khoá, báo kiểm tra Fanpage', async () => {
    for (const [label, mk] of Object.entries(ambiguousCases)) {
      const d = await pending(); feedOverride = mk; const before = feedPosts().length; await webhook(cbUpdate('fb_approve', d.id, 1)); feedOverride = null;
      const x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.status, 'FAILED', label); eq(x.failStage, 'publish_unknown', label); assert(!x.facebookPostId, label); eq(feedPosts().length - before, 1, label + ': không tự thử lại');
      const m = sentTg.filter((s) => s.kind === 'sendMessage').pop().text; assert(/KHÔNG RÕ KẾT QUẢ/.test(m) && /KIỂM TRA Fanpage/.test(m) && /ĐÃ có trên Fanpage/.test(m) && /CHƯA có/.test(m) && !/Bài đã lên sóng/.test(m), label + ': ' + m);
      const rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } });
      eq(rr.reason, 'publish_outcome_unknown', label); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED', label); eq(feedPosts().length - before, 1, label + ': /retry không được phát sinh lời gọi feed');
      assert(sentTg.filter((s) => s.kind === 'sendMessage').pop().text.includes('KHÔNG RÕ'), label + ': /retry giải thích lý do');
    }
  });
  await test('F1: lỗi RÕ RÀNG chưa đăng (HTTP 403 #200 lỗi quyền, HTTP 400 #100) vẫn là FAILED(publish) ⇒ /retry được (version +1, nút cũ vô hiệu) ⇒ đăng đúng 1 lần; thông báo không hứa exactly-once', async () => {
    for (const [label, mk] of [['403 #200', () => res({ error: { message: '(#200) Permissions error', code: 200 } }, false, 403)], ['400 #100', () => res({ error: { message: 'Invalid parameter', code: 100 } }, false, 400)]]) {
      const d = await pending(); feedOverride = mk; await webhook(cbUpdate('fb_approve', d.id, 1)); feedOverride = null;
      let x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.failStage, 'publish', label); eq(x.status, 'FAILED');
      const m = sentTg.filter((s) => s.kind === 'sendMessage').pop().text; assert(/THẤT BẠI/.test(m) && /Facebook trả lỗi rõ ràng/.test(m) && /không thể bảo đảm tuyệt đối/.test(m) && !/KHÔNG RÕ/.test(m), m);
      assert(!/exactly-once|đảm bảo duy nhất|chắc chắn không trùng/i.test(m), 'không được tuyên bố exactly-once');
      const before = feedPosts().length; const rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } }); assert(rr.retried && rr.version === 2, label);
      await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, before, 'nút v1 không còn hiệu lực'); await webhook(cbUpdate('fb_approve', d.id, 2)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED'); eq(feedPosts().length, before + 1, label);
    }
  });
  await test('F1: ảnh lỗi rõ ràng (photos 400) vẫn chưa tạo bài ⇒ FAILED(publish); lỗi mạng khi UPLOAD ảnh KHÔNG khoá retry (ảnh upload là published:false, không tạo bài)', async () => {
    const d = await pending(); photoFail = true; await webhook(cbUpdate('fb_approve', d.id, 1)); photoFail = false; eq(getPath(db, 'fbPostDrafts/' + d.id + '/failStage'), 'publish'); eq(feedPosts().length, 0);
  });

  // ═════ [4] Chọn Fanpage ═════
  out('\n=== [4] Chọn Fanpage / xác thực Page ===');
  await test('Mặc định dùng Page đang active; hiện tên Page lấy từ Graph', async () => {
    resetAll(); await orch.handleTelegramMessage(productUpdate()); eq(only().pageId, 'page_1'); eq(only().pageName, 'Fanpage Test');
  });
  await test('pageId trong tin nhắn KHÔNG được tin: Page lạ / ký tự nguy hiểm / không có token → từ chối, không tạo draft', async () => {
    for (const hint of ['page_999', '../facebookActiveToken', 'a/b', 'x'.repeat(80)]) {
      resetAll(); const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: A\nGiá: 1tr\nTình trạng: Mới\nPage: ' + hint })); assert(r.rejected, hint); eq(drafts().length, 0);
    }
  });
  await test('Page khác Page đang chọn: token "chờ chọn" KHÔNG đủ → bị từ chối; chỉ nhận khi Founder liệt kê trong telegramConfig.allowedPageIds (và có token)', async () => {
    resetAll(); setPath(db, 'facebookPageTokens/uidSuper/page_2', { accessToken: 'T2', isMock: false });
    let r0 = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: A\nGiá: 1tr\nTình trạng: Mới\nPage: page_2' })); assert(r0.rejected && /không phải Page đang được chọn/.test(sentTg.filter((s) => s.kind === 'sendMessage').pop().text), 'phải bị từ chối'); eq(drafts().length, 0);
    resetAll(); setPath(db, 'facebookPageTokens/uidSuper/page_2', { accessToken: 'T2', isMock: false }); setPath(db, 'telegramConfig/allowedPageIds', ['page_2']);
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: A\nGiá: 1tr\nTình trạng: Mới\nPage: page_2' })); assert(r.result && r.result.ok); eq(only().pageId, 'page_2');
  });
  await test('Super Admin đổi Page đang chọn GIỮA lúc xem trước và lúc duyệt → KHÔNG đăng (kể cả còn token chờ chọn của Page cũ)', async () => {
    const d = await pending(); setPath(db, 'facebookActiveToken', { pageId: 'page_other', accessToken: 'OTHER', isMock: false, expiresAt: Date.now() + 1e9 });
    setPath(db, 'facebookPageTokens/uidSuper/page_1', { accessToken: 'OLD_PENDING', isMock: false });
    await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 0); eq(photoPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED');
    assert(/không còn là Page đang được chọn/.test(sentTg.filter((s) => s.kind === 'sendMessage').pop().text));
  });
  await test('Đã "Ngắt kết nối" (not_connected) hoặc chưa chọn Page → từ chối; token không hợp lệ với Page (Graph từ chối) → từ chối', async () => {
    resetAll(); setPath(db, 'facebookConnection/status', 'not_connected'); let r = await orch.handleTelegramMessage(productUpdate()); assert(r.rejected); eq(drafts().length, 0);
    resetAll(); setPath(db, 'facebookActiveToken', null); r = await orch.handleTelegramMessage(productUpdate()); assert(r.rejected); eq(drafts().length, 0);
    resetAll(); graphInfoFail = true; r = await orch.handleTelegramMessage(productUpdate()); assert(r.rejected); eq(drafts().length, 0);
    assert(sentTg.some((s) => /Token không truy cập/.test(s.text || '')), 'báo lỗi thật cho người dùng');
  });

  // ═════ [5] Quyền & Approval Gate ═════
  out('\n=== [5] Quyền người duyệt / Approval Gate ===');
  async function pending() { resetAll(); await orch.handleTelegramMessage(productUpdate()); return only(); }
  await test('Người gửi không có quyền (ngoài approverIds / chưa ánh xạ / role không đủ / uid mất quyền) → không nhận sản phẩm; chat lạ im lặng', async () => {
    resetAll(); let r = await orch.handleTelegramMessage(productUpdate({ from: { id: 888 } })); assert(r.skipped && r.reason === 'approver_not_allowed'); eq(drafts().length, 0);
    resetAll(); setPath(db, 'telegramConfig/approverIds', ['777', '888']); r = await orch.handleTelegramMessage(productUpdate({ from: { id: 888 } })); eq(r.reason, 'approver_unmapped');
    resetAll(); setPath(db, 'roles/uid_ok', 'agent'); r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_role_not_allowed');
    resetAll(); setPath(db, 'roles/uid_ok', null); r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_role_not_allowed');
    resetAll(); setPath(db, 'telegramConfig/approverMap', { '777': '../superAdmins' }); r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_map_invalid');
    resetAll(); sentTg.length = 0; r = await orch.handleTelegramMessage(productUpdate({ chat: { id: 4242 } })); eq(r.reason, 'chat_mismatch'); eq(sentTg.length, 0); eq(drafts().length, 0);
    resetAll(); setPath(db, 'telegramConfig/approverIds', null); r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_ids_not_configured'); eq(drafts().length, 0);
  });
  await test('super_admin (superAdmins/{uid}.role) được phép; role admin/editor mặc định được phép', async () => {
    resetAll(); setPath(db, 'roles/uid_ok', null); setPath(db, 'superAdmins/uid_ok', { role: 'super_admin' }); let r = await orch.handleTelegramMessage(productUpdate()); assert(r.result && r.result.ok);
    resetAll(); setPath(db, 'roles/uid_ok', 'editor'); r = await orch.handleTelegramMessage(productUpdate()); assert(r.result && r.result.ok);
    resetAll(); setPath(db, 'superAdmins/uid_ok', { role: 'admin' }); setPath(db, 'roles/uid_ok', null); r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_role_not_allowed');
  });
  await test('Người KHÔNG có quyền bấm DUYỆT/HỦY → không đăng, draft giữ PENDING_APPROVAL (kể cả cùng chat)', async () => {
    const d = await pending();
    for (const from of [{ id: 888 }, { id: 1 }]) {
      const r = await webhook(cbUpdate('fb_approve', d.id, 1, from)); eq(r.status, 200);
      await webhook(cbUpdate('fb_cancel', d.id, null, from));
    }
    setPath(db, 'telegramConfig/approverIds', ['777', '888']); await webhook(cbUpdate('fb_approve', d.id, 1, { id: 888 })); // trong approverIds nhưng chưa ánh xạ
    setPath(db, 'roles/uid_ok', 'agent'); await webhook(cbUpdate('fb_approve', d.id, 1)); // đã ánh xạ nhưng mất quyền
    await webhook(cbUpdate('fb_approve', d.id, 1, { id: 777 }, { id: 9999 })); // sai chat
    eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL'); eq(feedPosts().length, 0); eq(photoPosts().length, 0);
  });
  await test('Callback giả mạo: sai secret Telegram → bỏ qua; callback_data độc hại (path traversal) → bị từ chối; gọi thẳng gateway (không qua relay) không duyệt được', async () => {
    const d = await pending();
    let r = await webhook(cbUpdate('fb_approve', d.id, 1), 'sai-secret'); eq(r.json.reason, 'auth');
    const evilSeen = []; for (const evil of ['../superAdmins', 'a/b', '.', 'x'.repeat(80), '$x']) { r = await webhook(cbUpdate('fb_approve', evil, 1)); evilSeen.push(r.status); }
    assert(evilSeen.every((st) => st >= 200), 'webhook không được văng lỗi'); eq(getPath(db, 'superAdmins'), null); eq(getPath(db, 'fbPostDrafts/..'), null);
    eq(feedPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL');
    const fbPublisher = require('../routes/fbPublisher'); let out2 = null;
    await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/callback', body: cbUpdate('fb_approve', d.id, 1), get: () => null },
      { status() { return this; }, json(x) { out2 = x; } }, { sendSuccess: (r2, data) => r2.json({ success: true, data }), sendError: (r2, code) => r2.json({ success: false, code }), auth: { ok: false } });
    assert(out2 && out2.success === false, 'không secret/không relay phải bị từ chối'); eq(feedPosts().length, 0);
  });
  await test('DUYỆT hợp lệ: đăng đúng Page + đúng nội dung/ảnh đã xem; lưu post id + người duyệt (uid PSH); Telegram nhận URL bài', async () => {
    const d = await pending(); const r = await webhook(cbUpdate('fb_approve', d.id, 1)); eq(r.status, 200);
    const x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.status, 'PUBLISHED'); assert(/^page_1_post/.test(x.facebookPostId));
    eq(x.approvedBy.pshUid, 'uid_ok'); eq(x.approvedBy.id, '777');
    const feed = feedPosts(); eq(feed.length, 1); const fb = JSON.parse(feed[0].body);
    eq(fb.message, x.aiCaption); assert(fb.attached_media && fb.attached_media.length === 1, 'đúng 1 ảnh');
    const ph = JSON.parse(photoPosts()[0].body); eq(ph.url, x.publishImages[0]);
    assert(/\/page_1\/(photos|feed)/.test(feed[0].url) && photoPosts().every((c) => c.url.includes('/page_1/')), 'đăng đúng Page đã chọn');
    const msg = sentTg.filter((s) => s.kind === 'sendMessage').pop(); assert(msg.text.includes('https://www.facebook.com/' + x.facebookPostId), 'Telegram trả URL bài');
    assert(!JSON.stringify(sentTg).includes('PAGE_TOKEN_SECRET') && !logs.join('\n').includes('PAGE_TOKEN_SECRET'), 'không lộ page token');
  });
  await test('Ảnh được đăng = ảnh quảng cáo người duyệt đã xem (publishImages), KHÔNG kèm ảnh gốc', async () => {
    resetAll({ router: {} }); compositorHandler = okResp(); await orch.handleTelegramMessage(productUpdate()); const d = only();
    await webhook(cbUpdate('fb_approve', d.id, 1)); const ph = photoPosts(); eq(ph.length, 1); eq(JSON.parse(ph[0].body).url, d.generatedImageUrl);
  });
  await test('DUYỆT hai lần (tuần tự và song song) → chỉ 1 bài; replay callback cũ không đăng thêm', async () => {
    let d = await pending(); await webhook(cbUpdate('fb_approve', d.id, 1)); await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 1);
    d = await pending(); await Promise.all([webhook(cbUpdate('fb_approve', d.id, 1)), webhook(cbUpdate('fb_approve', d.id, 1)), webhook(cbUpdate('fb_approve', d.id, 1))]); eq(feedPosts().length, 1);
    // gửi lại CHÍNH update (cùng update_id) cũng không đăng thêm
    const u = cbUpdate('fb_approve', d.id, 1); await webhook(u); await webhook(u); eq(feedPosts().length, 1);
  });
  await test('HỦY: huỷ rồi duyệt → không đăng; duyệt rồi huỷ → huỷ bị từ chối, bài đăng đúng 1 lần; huỷ song song với duyệt → không thể cùng thắng', async () => {
    let d = await pending(); await webhook(cbUpdate('fb_cancel', d.id)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'CANCELLED'); await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 0);
    d = await pending(); await webhook(cbUpdate('fb_approve', d.id, 1)); await webhook(cbUpdate('fb_cancel', d.id)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED'); eq(feedPosts().length, 1);
    for (let i = 0; i < 5; i++) { d = await pending(); const before = feedPosts().length; await Promise.all([webhook(cbUpdate('fb_approve', d.id, 1)), webhook(cbUpdate('fb_cancel', d.id))]);
      const st = getPath(db, 'fbPostDrafts/' + d.id + '/status'); assert(st === 'PUBLISHED' || st === 'CANCELLED', st);
      eq(feedPosts().length - before, st === 'PUBLISHED' ? 1 : 0, 'đăng khớp trạng thái'); }
  });
  await test('DRY-RUN (telegramConfig.dryRun=true): duyệt xong KHÔNG gọi Facebook (không photos/feed), draft PUBLISHED+dryRun, Telegram báo rõ "KHÔNG đăng", không có URL; duyệt lặp vẫn 1 lần', async () => {
    const d = await pending(); setPath(db, 'telegramConfig/dryRun', true);
    const gBefore = calls.filter((c) => c.url.includes("graph.facebook.com")).length;
    await Promise.all([webhook(cbUpdate('fb_approve', d.id, 1)), webhook(cbUpdate('fb_approve', d.id, 1))]);
    const x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.status, 'PUBLISHED'); eq(x.dryRun, true); assert(!x.facebookPostId);
    eq(calls.filter((c) => c.url.includes("graph.facebook.com")).length, gBefore, 'không được có request Graph nào trong dry-run');
    eq(feedPosts().length, 0); eq(photoPosts().length, 0);
    const msgs = sentTg.filter((s2) => s2.kind === 'sendMessage'); assert(msgs.some((m) => /DRY-RUN/.test(m.text) && /KHÔNG đăng/.test(m.text)) && !msgs.some((m) => m.text.includes("facebook.com/")));
    // tắt dry-run → draft mới đăng thật (ở đây là Graph mock)
    setPath(db, 'telegramConfig/dryRun', false); await orch.handleTelegramMessage(productUpdate()); const d2 = drafts().find((q) => q.id !== d.id);
    await webhook(cbUpdate('fb_approve', d2.id, 1)); eq(feedPosts().length, 1);
  });
  await test('Nút Duyệt cũ (sai version) vô hiệu sau khi bản nháp được chỉnh sửa/duyệt lại', async () => {
    const d = await pending(); await webhook(cbUpdate('fb_approve', d.id, 7)); eq(feedPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL');
  });

  // ═════ [6] Lỗi Facebook + retry ═════
  out('\n=== [6] Facebook lỗi / retry an toàn ===');
  await test('Facebook từ chối ĐĂNG: draft FAILED(publish), Telegram nhận lỗi THẬT (không báo thành công giả); không có URL', async () => {
    const d = await pending(); feedFail = true; await webhook(cbUpdate('fb_approve', d.id, 1));
    const x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.status, 'FAILED'); eq(x.failStage, 'publish'); assert(/Permissions error/.test(x.failReason) && !x.facebookPostId);
    const msg = sentTg.filter((s) => s.kind === 'sendMessage').pop().text; assert(/THẤT BẠI/.test(msg) && /Permissions error/.test(msg) && !/Bài đã lên sóng|facebook\.com\//.test(msg));
  });
  await test('Facebook từ chối ẢNH: KHÔNG đăng "chỉ chữ"; FAILED; không có bài nào được tạo', async () => {
    const d = await pending(); photoFail = true; await webhook(cbUpdate('fb_approve', d.id, 1));
    eq(feedPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED'); assert(/Image rejected/.test(getPath(db, 'fbPostDrafts/' + d.id + '/failReason')));
  });
  await test('Token không còn hiệu lực cho Page lúc đăng (Graph kiểm tra) → dừng trước khi đăng, báo lỗi', async () => {
    const d = await pending(); graphInfoFail = true; await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED');
  });
  await test('Sau "Ngắt kết nối" giữa lúc xem trước và duyệt → không đăng', async () => {
    const d = await pending(); setPath(db, 'facebookConnection/status', 'not_connected'); await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED');
  });
  await test('/retry sau lỗi đăng: về PENDING_APPROVAL với version mới, nút cũ vô hiệu, duyệt lại đăng đúng 1 lần', async () => {
    const d = await pending(); feedFail = true; await webhook(cbUpdate('fb_approve', d.id, 1)); feedFail = false;
    const rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } }); assert(rr.retried && rr.version === 2, JSON.stringify(rr));
    eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL'); const attemptsBefore = feedPosts().length; // 1 lần đăng bị Facebook từ chối
    await webhook(cbUpdate('fb_approve', d.id, 1)); eq(feedPosts().length, attemptsBefore, 'nút Duyệt cũ (v1) không được gọi Facebook nữa');
    eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PENDING_APPROVAL');
    await webhook(cbUpdate('fb_approve', d.id, 2)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED');
    eq(feedPosts().length, attemptsBefore + 1, 'đúng 1 lần đăng thành công sau retry');
  });
  await test('/retry bị từ chối khi bài ĐÃ được Facebook ghi nhận, khi lỗi không ở bước đăng, hoặc bởi người không có quyền', async () => {
    let d = await pending(); await webhook(cbUpdate('fb_approve', d.id, 1)); // PUBLISHED
    let rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } }); eq(rr.reason, 'not_failed');
    setPath(db, 'fbPostDrafts/' + d.id + '/status', 'FAILED'); setPath(db, 'fbPostDrafts/' + d.id + '/failStage', 'publish'); setPath(db, 'fbPostDrafts/' + d.id + '/facebookPostId', 'x_1'); rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } }); eq(rr.reason, 'already_posted');
    setPath(db, 'fbPostDrafts/' + d.id + '/facebookPostId', null); setPath(db, 'fbPostDrafts/' + d.id + '/failStage', 'intake'); rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } }); eq(rr.reason, 'not_publish_failure');
    rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 888 }, chat: { id: 555 }, text: '/retry ' + d.id } }); assert(rr.skipped);
    rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ../../x' } }); eq(rr.reason, 'bad_id');
  });
  await test('Facebook feed MẤT KẾT NỐI/không rõ kết quả: FAILED(publish_unknown), /retry bị KHOÁ (tránh đăng trùng), Telegram yêu cầu kiểm tra Fanpage', async () => {
    const d = await pending(); feedNetErr = true; await webhook(cbUpdate('fb_approve', d.id, 1));
    const x = getPath(db, 'fbPostDrafts/' + d.id); eq(x.status, 'FAILED'); eq(x.failStage, 'publish_unknown'); assert(!x.facebookPostId);
    const msg = sentTg.filter((s) => s.kind === 'sendMessage').pop().text; assert(/KHÔNG RÕ KẾT QUẢ/.test(msg) && /KIỂM TRA Fanpage/.test(msg) && !/Bài đã lên sóng/.test(msg));
    feedNetErr = false; const rr = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry ' + d.id } });
    eq(rr.reason, 'publish_outcome_unknown'); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED'); eq(feedPosts().length, 1, 'chỉ đúng 1 lần gọi feed (không tự thử lại)');
  });
  await test('telegram.js: lỗi mạng chứa bot token được che trong kết quả trả về', async () => {
    const tg = require('../shared/telegram'); const prev = global.fetch; global.fetch = async () => { throw new Error('connect ECONNRESET https://api.telegram.org/bot' + BOT + '/sendMessage'); };
    const r = await tg.sendMessage({ token: BOT, chatId: '1', text: 'x' }); global.fetch = prev; assert(r.ok === false && !String(r.error).includes(BOT), 'token phải bị che: ' + r.error);
    global.fetch = async () => { throw new Error('x ' + BOT); }; const r2 = await tg.answerCallbackQuery({ token: BOT, callbackQueryId: 'q' }); const r3 = await tg.sendPhoto({ token: BOT, chatId: '1', photo: 'u' }); global.fetch = prev;
    assert(!String(r2.error).includes(BOT) && !String(r3.error).includes(BOT));
  });
  await test('Gửi xem trước Telegram thất bại → draft KHÔNG treo ở PENDING (CANCELLED + lý do), không thể duyệt', async () => {
    resetAll(); tgSendFail = true; const r = await orch.handleTelegramMessage(productUpdate()); assert(r.result && r.result.reason === 'preview_failed'); eq(only().status, 'CANCELLED'); eq(feedPosts().length, 0);
  });

  // ═════ [7] Qua webhook đầy đủ ═════
  out('\n=== [7] Webhook end-to-end (secret → intake → duyệt → đăng → kết quả) ===');
  await test('Telegram → webhook (có secret) → bản nháp → nút DUYỆT → đăng → tin nhắn kết quả có URL; sai secret bị chặn', async () => {
    resetAll(); let r = await webhook(productUpdate(), 'sai'); eq(r.json.reason, 'auth'); eq(drafts().length, 0);
    r = await webhook(productUpdate()); eq(r.status, 200); const d = only(); eq(d.status, 'PENDING_APPROVAL');
    await webhook(cbUpdate('fb_approve', d.id, 1)); eq(only().status, 'PUBLISHED');
    assert(sentTg.some((s) => s.kind === 'sendMessage' && /Bài đã lên sóng: https:\/\/www\.facebook\.com\//.test(s.text)));
    // Telegram retry cùng update → vẫn 200, không thêm gì
    const n = sentTg.length; const u = productUpdate({ update_id: 777001 }); await webhook(u); const c1 = drafts().length; await webhook(u); eq(drafts().length, c1); assert(sentTg.length >= n);
  });
  await test('Lỗi nội bộ trong handler không làm webhook trả non-200 và không lộ token trong log', async () => {
    resetAll(); aiImpl = async () => { throw new Error('boom ' + BOT); }; const r = await webhook(productUpdate()); eq(r.status, 200);
    assert(!logs.some((l) => l.includes(BOT)), 'log không chứa token');
  });

  out('\n─────────────────────────────────────────────');
  out('PASSED: ' + passed + '  FAILED: ' + failed + '  SKIPPED: ' + skipped);
  if (failed) { out('FAILURES: ' + failures.join(' | ')); process.exit(1); }
  out('RESULT: PASS' + (skipped ? ' (có ' + skipped + ' test SKIPPED — xem ở trên)' : ''));
  process.exit(0);
})().catch((e) => { out('LỖI KHÔNG BẮT ĐƯỢC: ' + (e && e.stack || e)); process.exit(2); });
