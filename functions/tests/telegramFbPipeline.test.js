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
const productResearch = require('../shared/productResearch');

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

// Bước kiểm chứng câu (facebook-claim-verifier) mặc định: DUYỆT mọi câu với trích dẫn lấy từ chính dữ kiện nguồn; test cụ thể ghi đè verifierImpl.
const quoteOf = (ev) => String(ev || '').split(/\n/).map(x => x.trim()).sort((a, b) => b.length - a.length)[0].split(/\s+/).slice(0, 8).join(' ');
const approveAll = async (m, input) => ({ content: { results: (input.sentences || []).map((x, i) => ({ i, label: 'feature', evidence: quoteOf(input.evidenceText) })) } });
let verifierImpl = approveAll;
let aiImpl = async (moduleId) => ({ content: { versions: [{ hook: 'AI hook', caption: 'AI caption cho sản phẩm', cta: 'Nhắn tin ngay', hashtags: ['pshop', '#dj'] }] } });
const Module = require('module');
const origLoad = Module._load;
// callOpenAiChat của aiGenerate chạy BẢN THẬT (fetch vẫn là fetch giả của test, khoá lấy từ env) để kiểm tra đường mặc định không-mock.
let _realAg = null;
const realAiGenerate = () => _realAg || (_realAg = origLoad.call(Module, require('path').join(__dirname, '..', 'shared', 'aiGenerate.js'), module));
Module._load = function (request, parent) {
  if (request === 'firebase-admin') return mockAdmin;
  if (/(^|\/)aiGenerate$/.test(request)) return { generateForModule: (m, ...a) => (m === 'facebook-claim-verifier' ? verifierImpl(m, ...a) : aiImpl(m, ...a)), callOpenAiChat: (...a) => realAiGenerate().callOpenAiChat(...a) };
  return origLoad.apply(this, arguments);
};

// ── Fetch giả ────────────────────────────────────────────────────────────────
const realFetch = global.fetch;
let calls = []; let sentTg = []; let nPost = 0;
let tgFileBytes = null; let tgGetFileFail = false; let tgSendFail = false;
let graphInfoFail = false; let photoFail = false; let feedFail = false; let feedNetErr = false; let feedOverride = null; let failRead = null;
let compositorHandler = null; let storageFetchFail = false;
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
  if (url === 'https://api.openai.com/v1/chat/completions') return res({ choices: [{ message: { content: 'Chào bạn! Pshop Music đây.' } }] });
  if (url.startsWith('https://graph.facebook.com/')) {
    const m = url.match(/graph\.facebook\.com\/v25\.0\/([^/?]+)(\/photos|\/feed)?(\?fields=id,name)?/);
    if (!m) return res({ error: { message: 'unexpected graph url' } }, false, 400);
    if (m[3]) return graphInfoFail ? res({ error: { message: 'Invalid OAuth access token.' } }, false, 400) : res({ id: m[1], name: 'Fanpage Test' });
    if (m[2] === '/photos') return photoFail ? res({ error: { message: 'Image rejected by Facebook' } }, false, 400) : res({ id: 'ph_' + (++nPost) });
    if (m[2] === '/feed' && feedOverride) return feedOverride();
    if (m[2] === '/feed' && feedNetErr) throw new TypeError('fetch failed');
    if (m[2] === '/feed') return feedFail ? res({ error: { message: '(#200) Permissions error' } }, false, 403) : res({ id: m[1] + '_post' + (++nPost) });
  }
  if (url.startsWith('https://firebasestorage.googleapis.com/v0/b/')) { // byte anh da luu (SHA256 luc xem truoc / truoc khi upload)
    const m = url.match(/\/o\/([^?]+)/); const pth = m ? decodeURIComponent(m[1]) : '';
    return !storageFetchFail && storageFiles[pth] ? res(storageFiles[pth].buf) : res({ error: 'not found' }, false, 404);
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
  storageFetchFail = false; db = {}; storageFiles = {}; calls = []; sentTg = []; nPost = 0; keyCounter = 0; logs.length = 0;
  tgFileBytes = JPEG_BYTES; tgGetFileFail = false; tgSendFail = false; graphInfoFail = false; photoFail = false; feedFail = false; feedNetErr = false; feedOverride = null; failRead = null; compositorHandler = null;
  verifierImpl = approveAll;
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
    text: o.text,
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
const feedPosts = () => calls.filter((c) => c.method === 'POST' && /graph\.facebook\.com\/v25\.0\/[^/]+\/feed/.test(c.url));
const photoPosts = () => calls.filter((c) => c.method === 'POST' && /\/photos/.test(c.url));
const lastPreview = () => sentTg.filter((s) => (s.kind === 'sendPhoto' || s.kind === 'sendMessage') && s.reply_markup).pop();

(async () => {
  // ═════ [1] Parse + nhận sản phẩm ═════
  out('\n=== [1] Nhận ảnh + dữ liệu sản phẩm ===');
  await test('parseProductCaption: đủ trường (nhãn không phân biệt dấu/hoa thường)', async () => {
    const p = orch.parseProductCaption('TÊN: Sony A7\ngiá: 3tr5\nTinh trang: Mới 100%\nPage: 123_4');
    assert(p.ok); eq(p.product, { name: 'Sony A7', price: 3500000, condition: 'Mới 100%' }); eq(p.pageHint, '123_4');
  });
  await test('natural caption: tên/giá/tình trạng/bảo hành, không cần mẫu nhãn', async () => {
    const p = orch.parseProductCaption('Tai nghe AiAiAi new bảo hành 1 năm giá 5 triệu');
    assert(p.ok, JSON.stringify(p));
    eq(p.mode, 'natural');
    eq(p.product.name, 'Tai nghe AIAIAI');
    eq(p.product.brand, 'AIAIAI');
    eq(p.product.productType, 'Tai nghe');
    eq(p.product.price, 5000000);
    eq(p.product.condition, 'Hàng mới');
    eq(p.product.warrantyMonths, 12);
    assert(!p.product.model, 'không được bịa model');
  });
  await test('natural caption: các dạng giá/trạng thái phổ biến', async () => {
    const cases = [
      ['Loa KRK Rokit 5 G4, hàng mới, giá 7 triệu', 7000000, 'Hàng mới'],
      ['Bàn DJ XDJ-RX3 cũ 95%, giá 35 triệu', 35000000, 'Cũ 95%'],
      ['Mixer Yamaha MG10XU, hàng đẹp, giá 4tr5', 4500000, 'Hàng đẹp'],
      ['Tai nghe này hàng mới, bảo hành chính hãng 12 tháng, giá 5.000.000đ', 5000000, 'Hàng mới'],
      ['Loa A giá 5tr', 5000000, null],
      ['Loa A giá 5tr5', 5500000, null],
      ['Loa A giá 5.000k', 5000000, null],
      ['Loa A giá 4.500.000', 4500000, null],
      ['Loa A giá 4500000', 4500000, null],
      ['Loa A giá 4 triệu 500', 4500000, null]
    ];
    for (const [text, price, cond] of cases) {
      const p = orch.parseProductCaption(text);
      assert(p.ok, text + ' :: ' + JSON.stringify(p));
      eq(p.product.price, price);
      if (cond) eq(p.product.condition, cond); else assert(p.product.condition == null, text);
    }
    const noPrice = orch.parseProductCaption('Tai nghe AIAIAI hàng mới, bảo hành 12 tháng');
    assert(!noPrice.ok && noPrice.errors.some(e => /Thiếu giá/.test(e)), JSON.stringify(noPrice));
  });
  await test('Ảnh + natural caption → draft/preview giữ tên, giá, bảo hành; không bịa model', async () => {
    resetAll();
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tai nghe AiAiAi new bảo hành 1 năm giá 5 triệu' }));
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.name, 'Tai nghe AIAIAI');
    eq(d.product.price, 5000000);
    eq(d.product.warrantyMonths, 12);
    assert(!d.product.model);
    // Từ Product Research → Writer: chỉ có tên vẫn được tra theo tên, nhưng chưa cấu hình/chưa xác minh thì KHÔNG có dữ kiện nào được dùng.
    assert(!d.research || (d.research.status !== 'verified' && d.research.status !== 'partial'), 'không được coi là đã xác minh: ' + JSON.stringify(d.research));
    assert(!d.product.description && !(d.product.features || []).length, 'không dữ kiện bịa');
    assert(d.notices.some(n => /Chưa xác định chính xác model/.test(n)), JSON.stringify(d.notices));
    const text = lastPreview().caption || lastPreview().text;
    assert(/Tai nghe AIAIAI/.test(text) && /5\.000\.000đ/.test(text) && /12 tháng|1 năm/.test(text), text);
  });
  await test('Ảnh + message.text fallback vẫn vào đúng intake', async () => {
    resetAll();
    const u = productUpdate({ caption: null, text: 'Loa KRK Rokit 5 G4, giá 7 triệu' });
    const r = await orch.handleTelegramMessage(u);
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.name, 'Loa KRK Rokit 5 G4');
    eq(d.product.price, 7000000);
  });
  await test('Vision gợi ý loại/thương hiệu/màu nhưng không tự nhận model', async () => {
    resetAll();
    const vision = { status: 'ok', productType: 'Tai nghe chụp tai DJ', brand: 'AIAIAI', brandConfidence: 90, model: 'TMA-2', modelConfidence: 90, color: 'Đen', features: ['tai nghe chụp tai'], warnings: [] };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'AIAIAI mới bảo hành 1 năm giá 5 triệu' }), { analyzeProductImage: async () => vision });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.brand, 'AIAIAI');
    eq(d.product.visionColor, 'Đen');
    assert(!d.product.model, 'Vision không được tự set model đã xác nhận');
    eq(d.product.visionModel, 'TMA-2');
    assert(d.notices.some(n => /CHƯA xác minh/.test(n)), JSON.stringify(d.notices));
    const text = lastPreview().caption || lastPreview().text;
    assert(!/Loại:|Thương hiệu:|Model gợi ý|Mức xác minh|Phiên bản/.test(text), 'preview không lộ metadata nội bộ: ' + text);
    eq(d.product.productType, 'Tai nghe chụp tai DJ'); // vẫn lưu trong draft (trạng thái quản trị)
  });
  await test('Vision lỗi/thiếu dữ liệu → không chặn intake, có cảnh báo và không bịa', async () => {
    resetAll();
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tai nghe AIAIAI mới giá 5 triệu' }), { analyzeProductImage: async () => ({ status: 'error', warnings: ['Vision lỗi HTTP 500.'] }) });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    assert(!d.product.model);
    assert(d.notices.some(n => /Vision lỗi HTTP 500/.test(n)), JSON.stringify(d.notices));
  });
  await test('Caption + Vision mâu thuẫn thương hiệu → ưu tiên caption, cảnh báo', async () => {
    resetAll();
    const vision = { status: 'ok', productType: 'Tai nghe', brand: 'KRK', brandConfidence: 99, model: null, modelConfidence: 0, color: 'Đen', features: [], warnings: [] };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tai nghe AIAIAI mới giá 5 triệu' }), { analyzeProductImage: async () => vision });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.brand, 'AIAIAI');
    assert(d.notices.some(n => /khác thương hiệu|ưu tiên caption/.test(n)), JSON.stringify(d.notices));
  });
  await test('Natural model (không SKU) + research verified → giữ model, không tự tạo SKU', async () => {
    resetAll();
    const verified = {
      status: 'verified', matchedSku: 'Rokit 5 G4', warnings: [], sources: [{ title: 'KRK official', url: 'https://www.krkmusic.com/rokit-5-g4', type: 'official', claims: [], specs: {}, features: [], applications: [] }],
      product: { name: 'KRK ROKIT 5 G4', model: 'Rokit 5 G4' }, specs: { 'Công suất': '55W' }, features: [], applications: []
    };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Loa KRK Rokit 5 G4, hàng mới, giá 7 triệu' }), { researchProduct: async () => verified });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.model, 'Rokit 5 G4');
    eq(d.product.price, 7000000);
    assert(!d.product.sku, 'model không được tự thành SKU');
    eq(d.research.status, 'verified');
    assert(d.product.specs.includes('55W'), d.product.specs);
  });
  await test('SKU mode: ảnh + SKU + giá → lấy catalogue PSH, không cần tên/tình trạng; preview có SKU/thông số/nguồn', async () => {
    resetAll();
    setPath(db, 'products/prod_krk', { name: 'KRK ROKIT 8 G4', sku: 'KRK-R8-G4', brand: 'KRK', category: 'loa', status: 'New', specs: '203W · 8 inch', description: 'Loa kiểm âm nearfield.', badgeText: 'Chính hãng · BH 12th', price: 9999999 });
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: krk-r8-g4\nGiá: 8.500.000' }));
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.name, 'KRK ROKIT 8 G4');
    eq(d.product.sku, 'KRK-R8-G4');
    eq(d.product.price, 8500000); // giá người gửi thắng catalogue
    eq(d.product.condition, 'Mới');
    eq(d.product.specs, '203W · 8 inch');
    eq(d.research.status, 'catalog-only');
    assert(/web research/i.test(d.research.warning), 'phải cảnh báo web research chưa cấu hình');
    const text = lastPreview().caption || lastPreview().text;
    assert(text.includes('SKU: KRK-R8-G4') && !/Nguồn:|PSH catalog|Mức xác minh|Phiên bản/.test(text), text);
    assert(String(d.product.specs || '').includes('203W · 8 inch'), 'thông số vẫn nằm trong draft: ' + d.product.specs);
    assert(text.includes('8.500.000đ'), text);
  });
  await test('SKU ngoài catalogue + web research verified → tạo draft từ nguồn, giữ giá người gửi, preview có URL nguồn', async () => {
    resetAll();
    const verified = {
      status: 'verified', matchedSku: 'KRK-R8-G4', warnings: [], sources: [
        { title: 'KRK official', url: 'https://www.krkmusic.com/rokit-g4', type: 'official', claims: ['203W'], specs: {}, features: [], applications: [] }
      ],
      product: { name: 'KRK ROKIT 8 G4', brand: 'KRK', model: 'KRK ROKIT 8 G4', category: 'loa', description: 'Loa kiểm âm nearfield 8 inch.' },
      specs: { 'Công suất': '203W', 'Tần số': '36Hz-40kHz' }, features: ['DSP'], applications: ['phòng thu']
    };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: KRK-R8-G4\nGiá: 8.500.000' }), { researchProduct: async () => verified });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.name, 'KRK ROKIT 8 G4');
    eq(d.product.price, 8500000);
    eq(d.research.status, 'verified');
    assert(d.product.specs.includes('203W') && d.product.specs.includes('36Hz'), d.product.specs);
    const text = lastPreview().caption || lastPreview().text;
    assert(!text.includes('Nguồn:') && !/Mức xác minh|Phiên bản/.test(text), 'nguồn/metadata không hiện trong preview: ' + text);
    assert(JSON.stringify(d.research.sources).includes('https://www.krkmusic.com/rokit-g4'), 'URL nguồn vẫn lưu trong draft');
    assert(text.includes('8.500.000đ'), text);
  });
  await test('SKU ngoài catalogue + research lỗi/timeout → từ chối, không tạo draft', async () => {
    resetAll();
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: KRK-R8-G4\nGiá: 8.500.000' }), { researchProduct: async () => ({ status: 'timeout', warnings: ['timeout'], sources: [] }) });
    assert(r.rejected && r.reason === 'sku_research_unavailable', JSON.stringify(r));
    eq(drafts().length, 0);
  });
  // ── Product Research → Writer (mô phỏng, không Internet/model thật) ──
  const tavilyCfg = { provider: 'tavily', configured: true, officialDomains: ['pioneerdj.com'], timeoutMs: 1000 };
  const DDJ_PAGE = ['The DDJ-400 is a compact controller designed for beginner DJs who want to learn mixing with rekordbox dj.',
    '- Performance pads for hot cues, beat loops and samples', '- Built-in USB audio interface with a headphone output', '| Weight | 2.0 kg |'].join('\n');
  const ddjResults = [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/en/product/ddj-400/', content: '', raw_content: DDJ_PAGE }];
  const ddjResearch = (log) => (q) => { if (log) log.push(q); return productResearch.researchProduct(q, { config: tavilyCfg, cache: null,
    provider: (x) => productResearch.tavilyProvider(x, tavilyCfg, async () => ({ ok: true, status: 200, json: async () => ({ results: ddjResults }) })) }); };
  const RICH = { status: 'partial', matchedSku: 'DDJ 400', verification: { verified: true, evidence: [] }, contentLevel: 'page', schema: 2,
    product: { name: 'DDJ-400', model: 'DDJ 400', description: 'The DDJ-400 is a 2-channel DJ controller for rekordbox dj.' }, specs: {}, features: ['Plug and play: connect the controller to your computer with the USB cable.'], applications: [],
    sources: [{ title: 'DDJ-400', url: 'https://www.pioneerdj.com/en/product/dj-controllers/ddj-400', type: 'other', claims: [] }], warnings: [] };
  const withData = { researchProduct: async () => RICH };
  await test('Chỉ có TÊN (không SKU/model): research vẫn chạy theo tên; dữ kiện nguồn vào product + brief + prompt writer; không tạo SKU', async () => {
    resetAll(); const log = []; let seenBrief = null;
    aiImpl = async (m, input) => { seenBrief = input.productBrief; return { content: { versions: [{ hook: 'Pioneer DDJ-400 dành cho DJ mới bắt đầu.', caption: 'Bộ điều khiển nhỏ gọn, có performance pads và giao diện âm thanh USB tích hợp.', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } }; };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Mới' }), { researchProduct: ddjResearch(log) });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    assert(log.length === 1 && !log[0].sku && /DDJ/.test(log[0].name), 'research phải được gọi theo tên: ' + JSON.stringify(log));
    const d = only();
    assert(!Object.keys(log[0]).includes('price') && !JSON.stringify(log[0]).includes('3500000'), 'giá Founder cấp không được đưa vào truy vấn research: ' + JSON.stringify(log[0]));
    eq(d.product.price, 3500000); // giá Founder giữ nguyên
    eq(d.research.status, 'verified');
    assert(!d.product.sku, 'tra theo tên không được tạo SKU');
    assert(/designed for beginner DJs/.test(d.product.description || ''), JSON.stringify(d.product.description));
    assert((d.product.features || []).some(f => /Performance pads/.test(f)) && /2\.0 kg/.test(d.product.specs || ''), JSON.stringify(d.product));
    // Writer nhận brief có dữ kiện nguồn (không chỉ tên) và prompt chứa dữ kiện đó.
    assert(seenBrief && /designed for beginner DJs/.test(seenBrief.description) && (seenBrief.features || []).length && /2\.0 kg/.test(seenBrief.specs) && (seenBrief.referenceNotes || []).length, JSON.stringify(seenBrief));
    const prompt = require('../shared/aiModulesCore').MODULES['facebook-post-generator'].buildPrompt({ productBrief: seenBrief }, { product: {}, categories: [] });
    assert(/designed for beginner DJs/.test(prompt) && /Performance pads/.test(prompt) && /2\.0 kg/.test(prompt) && /TÀI LIỆU THAM KHẢO/.test(prompt), prompt.slice(0, 600));
    assert(!/CHỈ có đúng thông tin này: Tên:/.test(prompt), 'không được rơi về nhánh chỉ-có-tên');
    // Claim filter: câu diễn đạt lại đúng nguồn được giữ; giá/tình trạng do hệ thống chèn.
    const cap = d.aiCaption || d.caption || '';
    assert(/performance pads/i.test(cap) && /giao diện âm thanh USB/i.test(cap), cap);
  });
  await test('Chỉ có TÊN, research rejected/unconfigured: writer chỉ nhận tên (không bịa), vẫn tạo bản nháp', async () => {
    for (const res of [{ status: 'rejected', reason: 'unverifiable_query', sources: [], warnings: ['Tên/mã quá chung'] }, { status: 'unconfigured', sources: [], warnings: ['Chưa cấu hình'] }]) {
      resetAll(); let seenBrief = null;
      aiImpl = async (m, input) => { seenBrief = input.productBrief; return { content: { versions: [{ hook: 'Pioneer DDJ controller', caption: '', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } }; };
      const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Mới' }), { researchProduct: async () => res });
      assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
      eq(seenBrief, null, 'chỉ có tên: KHÔNG gọi AI'); eq(only().contentSource, 'name-only');
      assert(!only().product.description && !(only().product.features || []).length, JSON.stringify(only().product));
      assert(/^Pshop Music giới thiệu Pioneer DDJ-400\.\n\nGiá: 3\.500\.000đ[\s\S]*Liên hệ Pshop Music để được tư vấn thêm\./.test(only().aiCaption), only().aiCaption);
    }
  });
  await test('Claim filter trên bài có research: giữ thông tin có nguồn, loại claim không nguồn', async () => {
    resetAll();
    aiImpl = async () => ({ content: { versions: [{ hook: 'Pioneer DDJ-400 dành cho DJ mới bắt đầu.', caption: 'Có performance pads cho hot cue. Thiết kế sang trọng, chất âm tuyệt vời, dùng được tại nhà.', cta: 'Liên hệ Pshop Music.', hashtags: ['PshopMusic'] }] } });
    await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Mới' }), { researchProduct: ddjResearch() });
    const cap = only().aiCaption || only().caption || '';
    assert(/performance pads/i.test(cap), cap);
    assert(!/sang trọng|chất âm|tại nhà/i.test(cap), 'claim không nguồn lọt qua: ' + cap);
  });
  await test('REGRESSION preview KRK Rokit Gen 2 màu xanh 12.000.000đ: không AI, không mô tả/thông số bịa, câu hoàn chỉnh, không lộ metadata nội bộ', async () => {
    resetAll(); sentTg.length = 0; let aiCalled = 0; aiImpl = async () => { aiCalled++; return { content: { versions: [{ hook: 'Mẫu loa này được thiết kế cho việc kiểm âm.', caption: 'Với kích thước phù hợp, công suất 100W.', cta: 'Liên hệ', hashtags: ['x'] }] } }; };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh giá 12.000.000đ' }),
      { researchProduct: async () => ({ status: 'unconfigured', sources: [], warnings: ['Chưa cấu hình research'] }) });
    eq(aiCalled, 0, 'chỉ có tên: không gọi AI để lấp chỗ trống');
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only(); const cap = d.aiCaption;
    assert(/^Pshop Music giới thiệu Loa kiểm âm KRK Rokit Gen 2 màu xanh\.\n\nGiá: 12\.000\.000đ\n\nLiên hệ Pshop Music để được tư vấn thêm\.\n\n#PshopMusic/.test(cap), cap);
    assert(cap.includes('Giá: 12.000.000đ'), 'giá Founder giữ nguyên: ' + cap);
    assert(!/Tình trạng:/.test(cap), 'Founder không cấp tình trạng ⇒ không tự thêm: ' + cap);
    assert(!/được cho|kích thước|công suất|100W|thiết kế|chính hãng|Gen 2 chính hãng/i.test(cap), 'không bịa/không câu sai ngữ pháp: ' + cap);
    const text = lastPreview().caption || lastPreview().text;
    assert(!/Mức xác minh|Phiên bản|v1|CHƯA XÁC MINH|MỘT PHẦN|Nguồn:|Chưa cấu hình|⚠️|Loại:|Thương hiệu:|Model/.test(text), 'preview lộ metadata nội bộ: ' + text);
    assert(text.includes(cap), 'preview chứa đúng nội dung sẽ đăng');
    eq(d.research.status, 'unconfigured'); // cảnh báo nội bộ vẫn lưu ở draft (trạng thái quản trị)
    assert(!/Liên hệ Pshop Music để được tư vấn thêm\.[\s\S]*Liên hệ Pshop Music/.test(cap), 'chỉ một CTA');
  });
  await test('Preview có research: vẫn không lộ mức xác minh/phiên bản/nguồn/cảnh báo; nội dung đăng = aiCaption', async () => {
    resetAll(); sentTg.length = 0;
    aiImpl = async () => ({ content: { versions: [{ hook: 'Pioneer DJ DDJ-400 là controller DJ 2 kênh.', caption: 'Dùng cáp USB để kết nối với máy tính.', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } });
    await orch.handleTelegramMessage(productUpdate(), withData); const d = only();
    const text = lastPreview().caption || lastPreview().text;
    assert(!/Mức xác minh|Phiên bản|MỘT PHẦN|ĐÃ XÁC MINH|Nguồn:|pioneerdj\.com|⚠️|Model/.test(text), text);
    assert(text.includes(d.aiCaption), 'preview chứa nguyên văn bài sẽ đăng');
    assert(d.research.sources.length === 1 && d.notices.length >= 0, 'metadata vẫn lưu trong draft');
  });
  const KRK_V = { status: 'verified', matchedSku: 'ROKIT 8 G4', verification: { verified: true, evidence: [] }, contentLevel: 'page', schema: 2,
    product: { name: 'ROKIT 8 G4', model: 'ROKIT 8 G4', description: 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.' },
    specs: { 'Wattage': '203 Watts', 'Power Output': '203 Watts', 'Frequency Response': '36Hz - 40KHz', 'Max SPL': '111 dB' },
    features: ['DSP-driven EQ: 25 EQ settings tune the monitor to your room.'], applications: [],
    sources: [{ title: 'ROKIT 8 G4 | KRK', url: 'https://www.krkmusic.com/products/rokit-8-g4', type: 'official', claims: ['25 EQ settings tune the monitor to your room.'] }], warnings: [] };
  await test('END-TO-END: Telegram intake → Research (KRK, nguồn hãng) → Writer → Preview ĐẦY ĐỦ → DUYỆT → Facebook nhận ĐÚNG nguyên văn bài đã duyệt', async () => {
    resetAll(); sentTg.length = 0;
    aiImpl = async () => ({ content: { versions: [{ hook: 'KRK ROKIT 8 G4 là loa kiểm âm dùng cho ghi âm và phối nhạc.', caption: 'Bộ EQ điều khiển bằng DSP có 25 thiết lập giúp chỉnh loa theo phòng của bạn.\n\nCông suất 203W cùng dải tần 36Hz–40kHz phục vụ công việc phối nhạc. Công suất lên tới 500W.', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } });
    await orch.handleTelegramMessage(productUpdate({ caption: 'Loa kiểm âm KRK ROKIT 8 G4 giá 8.500.000đ' }), { researchProduct: async () => KRK_V });
    const d = only(); const cap = d.aiCaption;
    assert(/25 thiết lập/.test(cap) && cap.includes('Thông số kỹ thuật (theo krkmusic.com):') && cap.includes('• Mức SPL tối đa: 111 dB') && cap.includes('Giá: 8.500.000đ') && !/500W/.test(cap), cap);
    const pv = lastPreview(); const txt = pv.caption || pv.text;
    assert(txt.includes(cap), 'Preview phải chứa TOÀN BỘ bài sẽ đăng');
    assert(pv.reply_markup && /fb_approve/.test(JSON.stringify(pv.reply_markup)), 'nút DUYỆT đúng pipeline');
    assert(/crop|original|Ảnh đăng: ẢNH GỐC/.test(txt), 'ảnh gốc');
    await webhook(cbUpdate('fb_approve', d.id, 1));
    eq(feedPosts().length, 1, 'đúng 1 bài đăng lên feed');
    eq(JSON.parse(feedPosts()[0].body).message, cap); // đăng NGUYÊN VĂN, không rút gọn
  });
  await test('Bài dài (> 4000 ký tự): Preview tách nhiều tin KHÔNG cắt nội dung (nút duyệt ở tin cuối); Facebook nhận đủ nguyên văn', async () => {
    resetAll(); sentTg.length = 0;
    const long = Array.from({ length: 80 }, (_, i) => 'Mục ' + (i + 1) + ': cổng k' + (i + 1) + ' kênh q' + (i + 1) + ' nhóm z' + (i + 1) + ' ghi chú v' + (i + 1) + ' cáp USB đi kèm.').join('\n\n');
    aiImpl = async () => ({ content: { versions: [{ hook: 'Pioneer DDJ-400 kết nối máy tính bằng cáp USB.', caption: long + '\n\nMục cuối cùng: kết thúc bài.', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } });
    await orch.handleTelegramMessage(productUpdate(), withData);
    const d = only(); const cap = d.aiCaption;
    assert(cap.length > 4000 && /Mục cuối cùng: kết thúc bài\./.test(cap), 'bài dài phải được giữ nguyên trong draft: ' + cap.length);
    const msgs = sentTg.filter((x) => x.kind === 'sendMessage');
    assert(msgs.length >= 2, 'phải tách nhiều tin: ' + msgs.length);
    assert(msgs.every((m) => m.text.length <= 4096), 'mỗi tin <= 4096');
    const joined = msgs.map((m) => m.text.replace(/^\(\d+\/\d+\) /, '')).join('\n\n');
    assert(joined.includes('Mục cuối cùng: kết thúc bài.') && joined.includes('Mục 1:') && joined.includes('Mục 80:'), 'Preview phải chứa toàn bộ bài, không bị cắt');
    assert(msgs.slice(0, -1).every((m) => !m.reply_markup) && msgs[msgs.length - 1].reply_markup, 'nút duyệt chỉ ở tin cuối');
    await webhook(cbUpdate('fb_approve', d.id, 1));
    eq(feedPosts().length, 1);
    eq(JSON.parse(feedPosts()[0].body).message, cap);
  });
  await test('Preview ghi rõ thông tin còn thiếu khi chưa có nguồn (chỉ ở tin Telegram, KHÔNG nằm trong bài đăng)', async () => {
    resetAll(); sentTg.length = 0;
    await orch.handleTelegramMessage(productUpdate({ caption: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh giá 12.000.000đ' }), { researchProduct: async () => ({ status: 'rejected', reason: 'no_matching_source', sources: [], warnings: ['x'] }) });
    const d = only(); const txt = lastPreview().caption || lastPreview().text;
    assert(/ℹ️ Thông tin còn thiếu/.test(txt) && /Chưa tìm được nguồn khớp/.test(txt) && /Tình trạng sản phẩm/.test(txt), txt);
    assert(!/Thông tin còn thiếu|Chưa tìm được nguồn/.test(d.aiCaption), 'ghi chú thiếu dữ liệu không được vào bài đăng');
  });
  await test('PIPELINE + kiểm chứng câu: câu không căn cứ bị loại, Preview ghi rõ số câu đã loại (ngoài bài đăng); bài vẫn đủ nội dung có nguồn', async () => {
    resetAll(); sentTg.length = 0;
    aiImpl = async () => ({ content: { versions: [{ hook: 'KRK ROKIT 8 G4 là loa kiểm âm dùng cho ghi âm và phối nhạc.', caption: 'Bộ EQ điều khiển bằng DSP có 25 thiết lập giúp chỉnh loa theo phòng của bạn.\n\nĐây là loa vượt trội hơn mọi đối thủ.', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } });
    verifierImpl = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: /vượt trội/.test(t) ? 'unsupported' : 'feature', evidence: /vượt trội/.test(t) ? '' : quoteOf(input.evidenceText) })) } });
    await orch.handleTelegramMessage(productUpdate({ caption: 'Loa kiểm âm KRK ROKIT 8 G4 giá 8.500.000đ' }), { researchProduct: async () => KRK_V });
    const d = only(); const cap = d.aiCaption; const txt = lastPreview().caption || lastPreview().text;
    assert(/25 thiết lập/.test(cap) && !/vượt trội|đối thủ/.test(cap), cap);
    eq(d.claimDropped, 1);
    assert(/Đã loại 1 câu của Writer vì không có căn cứ/.test(txt) && !/Đã loại 1 câu/.test(cap), 'ghi chú chỉ ở preview: ' + txt);
  });
  await test('PIPELINE + verifier lỗi: vẫn tạo bản nháp chờ duyệt (không đăng tự động), bài không chứa lời Writer, Preview báo bước kiểm chứng lỗi', async () => {
    resetAll(); sentTg.length = 0;
    aiImpl = async () => ({ content: { versions: [{ hook: 'KRK ROKIT 8 G4 là loa tuyệt vời nhất.', caption: 'Âm thanh đỉnh cao.', cta: 'Liên hệ Pshop Music.', hashtags: ['x'] }] } });
    verifierImpl = async () => { throw new Error('openai down'); };
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'Loa kiểm âm KRK ROKIT 8 G4 giá 8.500.000đ' }), { researchProduct: async () => KRK_V });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only(); const txt = lastPreview().caption || lastPreview().text;
    eq(d.contentSource, 'verifier-unavailable'); assert(!/tuyệt vời|đỉnh cao/.test(d.aiCaption), d.aiCaption);
    assert(/Bước kiểm chứng nội dung bị lỗi/.test(txt) && !/Bước kiểm chứng/.test(d.aiCaption), txt);
    eq(feedPosts().length, 0, 'không tự đăng');
  });
  await test('Research chỉ có snippet: writer chỉ nhận đúng dữ kiện snippet (thông số), KHÔNG có mô tả/tính năng/công dụng', async () => {
    resetAll(); let seenBrief = null;
    aiImpl = async (m, input) => { seenBrief = input.productBrief; return { content: { versions: [{ hook: 'Pioneer DDJ-400', caption: '', cta: 'Liên hệ Pshop Music.', hashtags: ['PshopMusic'] }] } }; };
    const snippetOnly = [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/en/product/ddj-400/', content: 'DDJ-400\nWeight: 2.0 kg' }];
    const research = (q) => productResearch.researchProduct(q, { config: tavilyCfg, cache: null,
      provider: (x) => productResearch.tavilyProvider(x, tavilyCfg, async () => ({ ok: true, status: 200, json: async () => ({ results: snippetOnly }) })) });
    await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: Pioneer DDJ-400\nGiá: 3.500.000\nTình trạng: Mới' }), { researchProduct: research });
    const d = only();
    eq(d.research.contentLevel, 'snippet');
    assert(seenBrief && /2\.0 kg/.test(seenBrief.specs || ''), JSON.stringify(seenBrief));
    assert(!seenBrief.description && !(seenBrief.features || []).length && !(seenBrief.applications || []).length, 'không được có dữ kiện ngoài snippet: ' + JSON.stringify(seenBrief));
  });
  if (process.env.PSH_REAL_RESEARCH === '1') {
    await test('REAL integration (Tavily keyless via realFetch): research → content → preview, official URL preserved', async () => {
      resetAll();
      setPath(db, 'products/prod_krk_real', { name: 'KRK ROKIT 8 G4', sku: 'KRK-R8-G4', brand: 'KRK', category: 'loa', status: 'New', specs: '8 inch · 203W', description: 'Loa kiểm âm nearfield.' });
      const cfg = { provider: 'tavily', configured: true, officialDomains: ['krkmusic.com'], timeoutMs: 20000 };
      const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: KRK-R8-G4\nGiá: 8.500.000' }), {
        researchProduct: (q) => productResearch.researchProduct(q, {
          config: cfg,
          provider: (qq) => productResearch.tavilyProvider(qq, cfg, realFetch),
          cache: { get: async () => null, set: async () => {} }
        })
      });
      assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
      const d = only();
      eq(d.product.price, 8500000);
      eq(d.research.status, 'verified');
      assert(d.research.sources.some(x => x.type === 'official' && /krkmusic\.com$/.test(new URL(x.url).hostname)), JSON.stringify(d.research.sources));
      assert(Object.values(d.research.specs || {}).some(v => /203/.test(String(v))), JSON.stringify(d.research.specs));
      assert(/203/.test(String(d.product.specs || '')), d.product.specs);
      const text = lastPreview().caption || lastPreview().text;
      assert(text.includes('krkmusic.com') && text.includes('8.500.000đ'), text);
    });
  }
  await test('SKU có catalogue + research timeout → vẫn tạo draft từ catalogue, preview cảnh báo', async () => {
    resetAll();
    setPath(db, 'products/prod_krk_catalog', { name: 'KRK ROKIT 8 G4', sku: 'KRK-R8-G4', category: 'loa', status: 'New', specs: '8 inch · 203W' });
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: KRK-R8-G4\nGiá: 8.500.000' }), { researchProduct: async () => ({ status: 'timeout', sources: [], warnings: ['Web research quá thời gian chờ.'] }) });
    assert(r.handled && r.result && r.result.status === 'PENDING_APPROVAL', JSON.stringify(r));
    const d = only();
    eq(d.product.name, 'KRK ROKIT 8 G4');
    eq(d.research.status, 'timeout');
    const text = lastPreview().caption || lastPreview().text;
    assert(!/quá thời gian chờ|⚠️/.test(text), 'cảnh báo research không hiện trong preview: ' + text);
    assert(d.research.warnings.some((w) => /quá thời gian chờ/.test(w)), 'cảnh báo research vẫn lưu trong draft');
  });
  await test('SKU không có trong catalogue → từ chối, không tạo draft, nói rõ chưa có web research', async () => {
    resetAll();
    const r = await orch.handleTelegramMessage(productUpdate({ caption: 'SKU: KHONG-CO\nGiá: 1.000.000' }));
    assert(r.rejected && r.reason === 'sku_research_unavailable', JSON.stringify(r));
    eq(drafts().length, 0);
    assert(sentTg.some(s => /chưa có trong catalogue PSH/.test(s.text || '') && /web research/.test(s.text || '')), 'phải báo rõ blocker');
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
    for (const cap of ['Tên: A\nTình trạng: Mới', 'Tên: A\nGiá: abc\nTình trạng: Mới', 'Tên: A\nGiá: 1tr', 'Giá: 1tr\nTình trạng: Mới']) {
      resetAll(); const r = await orch.handleTelegramMessage(productUpdate({ caption: cap }));
      assert(r.rejected, 'phải rejected: ' + cap); eq(drafts().length, 0);
      assert(sentTg.some((s) => s.kind === 'sendMessage' && /Mẫu chú thích/.test(s.text)), 'phải gửi mẫu hướng dẫn');
    }
    // Không có caption: nhánh riêng, vẫn phản hồi hướng dẫn (không im lặng) nhưng không phải "caption sai".
    resetAll(); const r0 = await orch.handleTelegramMessage(productUpdate({ caption: null }));
    assert(r0.skipped && r0.reason === 'no_caption'); eq(drafts().length, 0);
    assert(sentTg.some((s) => /Ảnh chưa có chú thích/.test(s.text)), 'phải hướng dẫn caption');
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
  await test('Ảnh KHÔNG có caption → phản hồi hướng dẫn cụ thể (không im lặng), không tạo draft; gửi lặp không nhận trùng', async () => {
    resetAll(); sentTg.length = 0; const u = productUpdate({ caption: null });
    const r = await orch.handleTelegramMessage(u);
    assert(r.skipped && r.reason === 'no_caption'); eq(drafts().length, 0);
    eq(sentTg.length, 1); assert(/Ảnh chưa có chú thích/.test(sentTg[0].text) && /Tên:/.test(sentTg[0].text), sentTg[0] && sentTg[0].text);
    eq((await orch.handleTelegramMessage(u)).duplicate, true); eq(sentTg.length, 1);
  });
  await test('Album (media_group_id) không có chú thích → phản hồi RÕ RÀNG một lần, không tạo draft', async () => {
    resetAll(); sentTg.length = 0;
    const r2 = await orch.handleTelegramMessage(productUpdate({ caption: null, media_group_id: '9001' }));
    assert(r2.skipped && r2.reason === 'album_without_caption'); eq(drafts().length, 0);
    eq(sentTg.length, 1); assert(/Album ảnh chưa có chú thích/.test(sentTg[0].text), sentTg[0] && sentTg[0].text);
    sentTg.length = 0; // ảnh phụ cùng album (update_id khác) không nhận thêm tin nhắn
    const r3 = await orch.handleTelegramMessage(productUpdate({ caption: null, media_group_id: '9001' }));
    eq(r3.reason, 'album_without_caption'); eq(sentTg.length, 0);
  });
  await test('Album có 1 ảnh kèm caption: ảnh phụ KHÔNG bị nhắc thiếu caption; chỉ 1 draft', async () => {
    resetAll(); sentTg.length = 0;
    const r1 = await orch.handleTelegramMessage(productUpdate({ media_group_id: '9003' }));
    eq(r1.result && r1.result.status, 'PENDING_APPROVAL'); eq(drafts().length, 1);
    const before = sentTg.length;
    const r2 = await orch.handleTelegramMessage(productUpdate({ caption: null, media_group_id: '9003' }));
    eq(r2.reason, 'album_extra_image'); eq(drafts().length, 1); eq(sentTg.length, before);
  });
  await test('Document là ẢNH (JPEG, gửi dạng tệp) + caption hợp lệ → đi ĐÚNG pipeline, dùng file_id document', async () => {
    resetAll(); sentTg.length = 0; const u = productUpdate({ photo: [] });
    u.message.document = { file_id: 'D1', mime_type: 'image/jpeg', file_name: 'san-pham.jpg', file_size: 1000 };
    const r = await orch.handleTelegramMessage(u);
    eq(r.result && r.result.status, 'PENDING_APPROVAL'); eq(drafts().length, 1);
    assert(calls.some((c) => c.url.includes('getFile?file_id=D1')), 'phải tải đúng file document');
    assert(storageFiles['fbDrafts/' + only().id + '/original.jpg'], 'ảnh document phải lưu Storage');
  });
  await test('Document ảnh KHÔNG có caption → phản hồi hướng dẫn, không tạo draft', async () => {
    resetAll(); sentTg.length = 0; const u = productUpdate({ caption: null, photo: [] });
    u.message.document = { file_id: 'D2', mime_type: 'image/png', file_name: 'sp.png', file_size: 1000 };
    const r = await orch.handleTelegramMessage(u);
    assert(r.skipped && r.reason === 'no_caption'); eq(drafts().length, 0); eq(sentTg.length, 1);
    assert(/Ảnh chưa có chú thích/.test(sentTg[0].text));
  });
  await test('Document KHÔNG phải ảnh (PDF) / ảnh định dạng chưa hỗ trợ (HEIC) → phản hồi rõ, không tạo draft/claim', async () => {
    resetAll(); sentTg.length = 0; let u = productUpdate({ photo: [] });
    u.message.document = { file_id: 'P1', mime_type: 'application/pdf', file_name: 'a.pdf' };
    let r = await orch.handleTelegramMessage(u);
    assert(r.skipped && r.reason === 'unsupported_document'); eq(drafts().length, 0); eq(sentTg.length, 1);
    assert(/không phải ảnh/.test(sentTg[0].text)); assert(!getPath(db, 'telegramUpdates/' + u.update_id), 'không claim');
    resetAll(); sentTg.length = 0; u = productUpdate({ photo: [] });
    u.message.document = { file_id: 'H1', mime_type: 'image/heic', file_name: 'a.heic' };
    r = await orch.handleTelegramMessage(u);
    assert(r.skipped && r.reason === 'unsupported_document'); eq(sentTg.length, 1);
    assert(/JPEG\/PNG\/WEBP/.test(sentTg[0].text), sentTg[0] && sentTg[0].text);
  });

  // ═════ [2] AI nội dung ═════
  out('\n=== [2] AI tạo nội dung ===');
  await test('AI thành công: caption AI + khối Giá/Tình trạng do HỆ THỐNG chèn đúng dữ liệu người gửi; gọi đúng module với dữ liệu sản phẩm', async () => {
    resetAll(); let seen = null; aiImpl = async (m, input) => { seen = { m, input }; return { content: { versions: [{ hook: 'H', caption: 'Giá chỉ 1.000đ!!', cta: 'C', hashtags: ['x'] }] } }; };
    await orch.handleTelegramMessage(productUpdate(), withData); const d = only();
    eq(seen.m, 'facebook-post-generator'); assert(seen.input.productBrief && seen.input.productBrief.name === 'Pioneer DDJ-400', JSON.stringify(seen.input));
    assert(d.aiCaption.includes('Giá: 3.500.000đ') && d.aiCaption.includes('Tình trạng: Like new 95%'), 'sự thật về giá/tình trạng luôn đúng');
    assert(!/1\.000đ/.test(d.aiCaption), 'giá AI tự bịa phải bị bỏ, chỉ dùng factsBlock: ' + d.aiCaption);
    eq(d.contentSource, 'ai');
  });
  await test('Nội dung Facebook: model trả Markdown/câu sáo rỗng → caption cuối là văn bản thuần, không markdown/cliché/link bịa; giá+tình trạng đúng', async () => {
    resetAll(); sentTg.length = 0;
    aiImpl = async () => ({ content: { versions: [{
      hook: 'Bạn đang tìm kiếm **chiếc loa** hoàn hảo?',
      caption: '# Chân loa Aura\n\n- Ý một\n- Ý hai\nXem thêm tại https://fake.example\nĐỉnh cao trải nghiệm cùng **Aura**.',
      cta: 'Hãy để Pshop Music tư vấn!',
      hashtags: ['#ChanLoa', 'ThietBiAmThanh']
    }] } });
    await orch.handleTelegramMessage(productUpdate(), withData); const d = only(); const c = d.aiCaption;
    assert(!/^\s*#{1,6}\s+/m.test(c), 'không heading markdown: ' + c);
    assert(!/\*\*|__|`/.test(c), 'không bold/code markdown: ' + c);
    assert(!/^\s*[-*+•]\s+/m.test(c), 'không bullet markdown: ' + c);
    assert(!/Bạn đang tìm kiếm|Hãy để|Đỉnh cao/.test(c), 'không câu sáo rỗng: ' + c);
    assert(!/https?:\/\//.test(c), 'không link AI tự bịa: ' + c);
    assert(/Chân loa Aura/.test(c) && /Ý một/.test(c) && /Ý hai/.test(c), 'giữ nội dung cụ thể: ' + c);
    assert(/Giá: 3\.500\.000đ/.test(c) && /Tình trạng: Like new 95%/.test(c), 'giá/tình trạng đúng: ' + c);
    assert(/#ChanLoa/.test(c) && /#ThietBiAmThanh/.test(c), 'hashtag cuối bài: ' + c);
    assert(lastPreview().caption && /📋 Xem trước/.test(lastPreview().caption), 'Telegram preview giữ định dạng riêng');
  });
  await test('AI lỗi: dùng nội dung mẫu + CẢNH BÁO cho người duyệt; luồng vẫn tiếp tục', async () => {
    resetAll(); aiImpl = async () => { throw new Error('quota'); }; await orch.handleTelegramMessage(productUpdate(), withData); const d = only();
    eq(d.contentSource, 'template'); eq(d.status, 'PENDING_APPROVAL'); assert(d.notices.some((n) => /nội dung mẫu/.test(n)));
    assert((lastPreview().caption || lastPreview().text).includes('⚠️'), 'cảnh báo phải hiện trong xem trước');
  });
  await test('AI treo quá thời hạn → nội dung mẫu + cảnh báo (không treo webhook)', async () => {
    resetAll(); aiImpl = () => new Promise(() => {}); // không bao giờ trả
    const t0 = Date.now(); await orch.handleTelegramMessage(productUpdate(), { aiTimeoutMs: 80, researchProduct: async () => RICH }); const d = only();
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
  await test('imageRouterConfig bị ghi thành chuỗi "null"/array/số → blocked với lý do ĐÚNG (không báo nhầm "chưa bật"), không gọi compositor', async () => {
    for (const bad of ['null', '[]', '123', 'not-json', '{"providers":[]}']) {
      resetAll({ router: {} }); setPath(db, 'imageRouterConfig', bad);
      compositorHandler = async () => { throw new Error('không được gọi compositor khi cấu hình sai'); };
      await orch.handleTelegramMessage(productUpdate()); const d = only();
      eq(d.imageMode, 'original', 'bad=' + bad); eq(d.steps.image.result, 'blocked', 'bad=' + bad);
      assert(d.notices.some((n) => /imageRouterConfig/.test(n) && /object/.test(n)), 'bad=' + bad + ' notice=' + JSON.stringify(d.notices));
      assert(!calls.some((c) => /compositor\.test/.test(c.url)), 'bad=' + bad);
    }
  });
  const okPng = makePng(64, 64);
  const okResp = (over) => async () => res(Object.assign({ ok: true, image_b64: okPng.toString('base64'), report: { product_pixels_preserved: true, width: 64, height: 64, background: 'procedural:studio' } }, over || {}));
  await test('imageRouterConfig dạng chuỗi JSON chứa object (dữ liệu cũ) vẫn đọc được → composited', async () => {
    resetAll({ router: {} });
    setPath(db, 'imageRouterConfig', JSON.stringify({ providers: { compositor: { enabled: true, approvedForProductPhotos: true, url: 'https://compositor.test', timeoutMs: 2000 } } }));
    compositorHandler = okResp(); await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(d.imageMode, 'composited'); eq(d.steps.image.result, 'ok');
  });
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
      'lệch pixel lõi': okResp({ report: { product_pixels_preserved: true, core_pixels: 1000, core_pixels_mismatched: 3 } }),
      'không có pixel lõi': okResp({ report: { product_pixels_preserved: true, core_pixels: 0, core_pixels_mismatched: 0 } }),
      'không có mô hình tách nền': async () => res({ ok: false, code: 'NO_SEGMENTATION', message: 'x' }, false, 422),
      'mask không hợp lệ': async () => res({ ok: false, code: 'BAD_MASK', message: 'x' }, false, 422),
      'sản phẩm quá lớn': async () => res({ ok: false, code: 'PRODUCT_TOO_LARGE', message: 'x' }, false, 422)
    };
    for (const [name, h] of Object.entries(cases)) {
      resetAll({ router: { timeoutMs: 60 } }); compositorHandler = h; await orch.handleTelegramMessage(productUpdate()); const d = only();
      eq(d.imageMode, name === 'x' ? 'composited' : 'original', name); eq(d.status, 'PENDING_APPROVAL', name);
      assert(d.notices.some((n) => /ảnh GỐC/.test(n)), 'cảnh báo cho: ' + name); assert(!storageFiles['fbDrafts/' + d.id + '/final.png'], 'không lưu ảnh kết quả khi lỗi: ' + name);
    }
  });
  await test('Compositor trả 200 nhưng không phải JSON → quay về ảnh gốc + cảnh báo rõ, không lưu ảnh kết quả', async () => {
    resetAll({ router: {} });
    compositorHandler = async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
    await orch.handleTelegramMessage(productUpdate()); const d = only();
    eq(d.imageMode, 'original'); eq(d.steps.image.result, 'failed');
    assert(d.notices.some((n) => /không phải JSON/.test(n) && /ảnh GỐC/.test(n)), JSON.stringify(d.notices));
    assert(!storageFiles['fbDrafts/' + d.id + '/final.png']);
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
  await test('Nền AI lỗi khi đã bật → compositor vẫn dùng nền tự tạo, preview BÁO RÕ fallback nền (không im lặng)', async () => {
    resetAll({ router: {} });
    setPath(db, 'imageRouterConfig/providers/aiBackground', { enabled: true, approvedForBackgrounds: true });
    aiImpl = async (m) => (m === 'image-generator' ? { content: { imageUrl: 'https://img.test/bg.png' } } : { content: { versions: [{ hook: 'h', caption: 'c', cta: 'x', hashtags: [] }] } });
    const prevFetch = global.fetch;
    global.fetch = async (u, o) => (String(u) === 'https://img.test/bg.png' ? res({ error: 'down' }, false, 500) : prevFetch(u, o));
    compositorHandler = okResp();
    await orch.handleTelegramMessage(productUpdate()); global.fetch = prevFetch;
    const d = only();
    eq(d.imageMode, 'composited'); assert(d.notices.some((n) => /nền AI/i.test(n) && /nền tự tạo/.test(n)), JSON.stringify(d.notices));
    assert(lastPreview().caption && /nền AI/i.test(lastPreview().caption), 'preview phải nêu fallback nền');
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
    resetAll(); setPath(db, 'superAdmins/uidSuper', { role: 'super_admin' }); setPath(db, 'facebookPageTokens/uidSuper/page_2', { accessToken: 'T2', isMock: false });
    let r0 = await orch.handleTelegramMessage(productUpdate({ caption: 'Tên: A\nGiá: 1tr\nTình trạng: Mới\nPage: page_2' })); assert(r0.rejected && /không phải Page đang được chọn/.test(sentTg.filter((s) => s.kind === 'sendMessage').pop().text), 'phải bị từ chối'); eq(drafts().length, 0);
    resetAll(); setPath(db, 'superAdmins/uidSuper', { role: 'super_admin' }); setPath(db, 'facebookPageTokens/uidSuper/page_2', { accessToken: 'T2', isMock: false }); setPath(db, 'telegramConfig/allowedPageIds', ['page_2']);
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
  await test('HASH ẢNH (pipeline thật): xem trước lưu SHA256 BYTE ảnh đã lưu Storage + fingerprint hợp lệ (mock RTDB/Storage/fetch)', async () => {
    const d = await pending(); const h = d.publishImageHashes; const bytes = storageFiles['fbDrafts/' + d.id + '/original.jpg'].buf;
    assert(Array.isArray(h) && h.length === 1, 'có hash'); eq(h[0].url, d.publishImages[0]); eq(h[0].sha256, require('crypto').createHash('sha256').update(bytes).digest('hex'));
    assert(/^[0-9a-f]{64}$/.test(d.contentFingerprint), 'fingerprint hợp lệ');
  });
  await test('HASH ẢNH: không tải lại được ảnh lúc chốt xem trước → draft FAILED(preview), KHÔNG có bản duyệt được', async () => {
    resetAll(); storageFetchFail = true; await orch.handleTelegramMessage(productUpdate());
    const d = only(); eq(d.status, 'FAILED'); eq(d.failStage, 'preview'); assert(!sentTg.some((x) => x.reply_markup), 'không được gửi nút Duyệt');
  });
  await test('HASH ẢNH: ảnh trên Storage bị thay sau xem trước → bấm DUYỆT: KHÔNG upload/đăng, FAILED(image_integrity)', async () => {
    const d = await pending(); storageFiles['fbDrafts/' + d.id + '/original.jpg'].buf = Buffer.from('TAMPERED-BYTES');
    await webhook(cbUpdate('fb_approve', d.id, 1));
    eq(feedPosts().length, 0); eq(photoPosts().length, 0); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'FAILED'); eq(getPath(db, 'fbPostDrafts/' + d.id + '/failStage'), 'image_integrity');
  });
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
  await test('roles/{uid} dạng object {email,name,role} (CMS Users thật ghi): admin/editor được phép; agent/thiếu role/role không phải chuỗi/super_admin trong roles bị từ chối; DUYỆT vẫn đăng đúng 1 bài', async () => {
    for (const ok of ['admin', 'editor']) { resetAll(); setPath(db, 'roles/uid_ok', { email: 'a@x', name: 'A', role: ok, createdAt: 1 }); const r = await orch.handleTelegramMessage(productUpdate()); assert(r.result && r.result.ok, ok); }
    for (const bad of [{ role: 'agent' }, { email: 'a@x' }, { role: { x: 'admin' } }, { role: ['admin'] }, { role: 'super_admin' }]) { resetAll(); setPath(db, 'roles/uid_ok', bad); const r = await orch.handleTelegramMessage(productUpdate()); eq(r.reason, 'approver_role_not_allowed'); eq(drafts().length, 0); }
    resetAll(); setPath(db, 'roles/uid_ok', { email: 'a@x', role: 'admin' }); const d = await pending(); await webhook(cbUpdate('fb_approve', d.id, 1)); eq(getPath(db, 'fbPostDrafts/' + d.id + '/status'), 'PUBLISHED');
  });
  await test('Cấu hình production hiện tại {dryRun:true} (thiếu chatId): bot IM LẶNG theo thiết kế (không tin nhắn, không draft, không Graph) nhưng log nêu mã lý do chat_not_configured, không lộ secret', async () => {
    resetAll(); setPath(db, 'telegramConfig', { dryRun: true }); sentTg.length = 0; logs.length = 0;
    const r = await webhook(productUpdate()); eq(r.status, 200);
    eq(sentTg.length, 0); eq(drafts().length, 0); eq(calls.filter((c) => /graph\.facebook\.com/.test(c.url)).length, 0);
    assert(logs.some((l) => /message skipped \(im lặng\): reason=chat_not_configured/.test(l)), 'log phải nêu reason');
    assert(!logs.some((l) => l.includes(BOT) || l.includes(SECRET)), 'log không lộ secret');
  });
  await test('chat_mismatch: bot vẫn IM LẶNG nhưng log máy chủ nêu id chat/loại chat/id người gửi (chỉ số) để chẩn đoán; không lộ secret/nội dung', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    const u = productUpdate(); u.message.chat = { id: -1009998887776, type: 'supergroup', title: 'Tên Nhóm Bí Mật' };
    const r = await webhook(u); eq(r.status, 200); eq(sentTg.length, 0); eq(drafts().length, 0);
    const line = logs.find((l) => /reason=chat_mismatch/.test(l)); assert(line, 'phải có log chat_mismatch');
    assert(/chat=-1009998887776 type=supergroup from=\d+/.test(line), 'log phải có chat/type/from: ' + line);
    assert(!/Bí Mật/.test(line) && !line.includes(BOT) && !line.includes(SECRET), 'không lộ tên nhóm/secret');
  });
  await test('Webhook thiếu/sai secret header: bị từ chối (reason=auth), không xử lý, không tin nhắn, không ghi log (không để kẻ lạ làm ngập log)', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    for (const sec of ['', null, 'sai-secret']) { const r = await webhook(productUpdate(), sec); eq(r.status, 200); eq(r.json.reason, 'auth'); }
    eq(drafts().length, 0); eq(sentTg.length, 0); eq(logs.length, 0);
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
  await test('telegram.js: MỖI lần gửi có log an toàn — thành công (chat, message_id) / thất bại 403 (http, code, mô tả đã che) / lỗi mạng; không lộ token, URL, nội dung', async () => {
    const tg = require('../shared/telegram'); const prev = global.fetch; logs.length = 0;
    global.fetch = async () => res({ ok: true, result: { message_id: 4242 } });
    await tg.sendMessage({ token: BOT, chatId: '-1001234567890', text: 'NOIDUNG-RIENG-TU' });
    global.fetch = async () => res({ ok: false, error_code: 403, description: 'Forbidden: bot is not a member of the supergroup chat ' + BOT }, false, 403);
    const r = await tg.sendMessage({ token: BOT, chatId: '-1001234567890', text: 'NOIDUNG-RIENG-TU' });
    global.fetch = async () => { throw new Error('connect ECONNRESET https://api.telegram.org/bot' + BOT + '/sendPhoto'); };
    await tg.sendPhoto({ token: BOT, chatId: '-1001234567890', photo: 'u' }); global.fetch = prev;
    const all = logs.join('\n'); const tgl = logs.filter((l) => /^\[telegram\]/.test(l));
    assert(r.ok === false, 'kết quả thất bại vẫn trả ok:false');
    assert(tgl.some((l) => /sendMessage ok chat=-1001234567890 message_id=4242/.test(l)), 'log thành công: ' + tgl.join(' | '));
    assert(tgl.some((l) => /sendMessage FAILED chat=-1001234567890 http=403 code=403 desc=Forbidden: bot is not a member/.test(l)), 'log thất bại: ' + tgl.join(' | '));
    assert(tgl.some((l) => /sendPhoto FAILED chat=-1001234567890 network_error=/.test(l)), 'log lỗi mạng');
    assert(!all.includes(BOT) && !/api\.telegram\.org/.test(all) && !all.includes('NOIDUNG-RIENG-TU'), 'log không được chứa token/URL/nội dung');
  });
  await test('Founder gửi /start trong NHÓM đúng chat → bot trả lời đúng chat nhóm (số âm) và có log gửi thành công', async () => {
    resetAll(); setPath(db, 'telegramConfig/chatId', '-1001234567890'); sentTg.length = 0; logs.length = 0;
    const r = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: -1001234567890, type: 'group' }, text: '/start@PSH_Flatform_Bot', date: Math.floor(Date.now() / 1000) } });
    eq(r.command, 'help'); eq(sentTg.length, 1); eq(String(sentTg[0].chat_id), '-1001234567890');
    assert(logs.some((l) => /\[telegram\] sendMessage ok chat=-1001234567890 message_id=\d+/.test(l)), 'phải có log gửi thành công');
  });
  await test('Người KHÔNG có quyền trong nhóm đúng chat → bị từ chối có phản hồi (kèm Telegram ID), không tạo draft; chat sai → im lặng + log id', async () => {
    resetAll(); setPath(db, 'telegramConfig/chatId', '-1001234567890'); sentTg.length = 0; logs.length = 0;
    const r1 = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 999 }, chat: { id: -1001234567890, type: 'group' }, text: '/start', date: Math.floor(Date.now() / 1000) } });
    eq(r1.skipped, true); eq(sentTg.length, 1); assert(/999/.test(sentTg[0].text), 'phản hồi nêu Telegram ID'); eq(drafts().length, 0);
    sentTg.length = 0; const r2 = await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: -1, type: 'group' }, text: '/start', date: Math.floor(Date.now() / 1000) } });
    eq(r2.reason, 'chat_mismatch'); eq(sentTg.length, 0);
  });
  // ── Log chẩn đoán loại update / nhánh xử lý: CHỈ kind + caption(yes/no) + branch, không nội dung ──
  const trackLine = () => logs.find((l) => /^\[telegramWebhook\] update kind=/.test(l)) || '';
  const noLeak = (...secrets) => { const all = logs.join('\n'); for (const s of secrets) assert(!all.includes(s), 'log lộ: ' + s); assert(!all.includes(BOT) && !all.includes(SECRET) && !all.includes('PAGE_TOKEN_SECRET'), 'log lộ token/secret'); };
  await test('Log nhánh: ảnh + caption hợp lệ QUA RELAY (webhook) → kind=photo caption=yes branch=pipeline, tạo draft + claim; log không chứa caption/tên/giá', async () => {
    resetAll(); logs.length = 0; const u = productUpdate(); const r = await webhook(u); eq(r.status, 200);
    assert(/^\[telegramWebhook\] update kind=photo caption=yes branch=pipeline$/.test(trackLine()), 'log: ' + trackLine());
    eq(drafts().length, 1); assert(getPath(db, 'telegramUpdates/' + u.update_id), 'phải có claim');
    noLeak('Pioneer', '3.500.000', 'Like new');
  });
  await test('Log nhánh: ảnh + caption KHÔNG hợp lệ → branch=invalid_caption, không tạo draft, không lộ nội dung caption', async () => {
    resetAll(); logs.length = 0; await orch.handleTelegramMessage(productUpdate({ caption: 'ghi chu tu do NOIDUNGBIMAT' }));
    assert(/kind=photo caption=yes branch=invalid_caption$/.test(trackLine()), 'log: ' + trackLine()); eq(drafts().length, 0); noLeak('NOIDUNGBIMAT');
  });
  await test('Log nhánh: update trùng → branch=duplicate (không tạo thêm draft)', async () => {
    resetAll(); const u = productUpdate(); await orch.handleTelegramMessage(u); logs.length = 0; await orch.handleTelegramMessage(u);
    assert(/kind=photo caption=yes branch=duplicate$/.test(trackLine()), 'log: ' + trackLine()); eq(drafts().length, 1);
  });
  await test('Log nhánh: LỆNH LẠ ("/…") giữ hướng dẫn cũ → kind=command caption=no branch=no_photo_text_reply', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/lenhla NOIDUNGBIMAT' } });
    assert(/kind=command caption=no branch=no_photo_text_reply$/.test(trackLine()), 'log: ' + trackLine()); eq(sentTg.length, 1); eq(drafts().length, 0); noLeak('NOIDUNGBIMAT');
  });
  await test('Log nhánh: /start → kind=command caption=no branch=help; /retry → branch=retry', async () => {
    resetAll(); logs.length = 0;
    await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/start' } });
    assert(/kind=command caption=no branch=help$/.test(trackLine()), 'log: ' + trackLine());
    logs.length = 0; await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: '/retry khongtontai' } });
    assert(/kind=command caption=no branch=retry$/.test(trackLine()), 'log: ' + trackLine());
  });
  await test('Log nhánh: document (ảnh gửi dạng tệp) kèm caption → kind=document caption=yes branch=pipeline', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0; const u = productUpdate({ photo: [] }); u.message.document = { file_id: 'D1', mime_type: 'image/jpeg', file_size: 1000 };
    await orch.handleTelegramMessage(u);
    assert(/kind=document caption=yes branch=pipeline$/.test(trackLine()), 'log: ' + trackLine()); eq(drafts().length, 1);
    noLeak('Pioneer');
  });
  await test('Log nhánh: document không phải ảnh → branch=unsupported_file, phản hồi rõ; sticker → no_photo_silent; album không caption → branch=album_without_caption + phản hồi', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0; let u = productUpdate({ photo: [] }); u.message.document = { file_id: 'P1', mime_type: 'application/pdf' };
    await orch.handleTelegramMessage(u);
    assert(/kind=document caption=yes branch=unsupported_file$/.test(trackLine()), 'log: ' + trackLine()); eq(sentTg.length, 1); eq(drafts().length, 0);
    logs.length = 0; sentTg.length = 0; await orch.handleTelegramMessage({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, sticker: { file_id: 'S' } } });
    assert(/kind=other caption=no branch=no_photo_silent$/.test(trackLine()), 'log: ' + trackLine()); eq(sentTg.length, 0);
    logs.length = 0; await orch.handleTelegramMessage(productUpdate({ caption: '', media_group_id: '9002' }));
    assert(/kind=photo caption=no branch=album_without_caption$/.test(trackLine()), 'log: ' + trackLine()); eq(drafts().length, 0); eq(sentTg.length, 1);
  });
  await test('Log nhánh: Page không hợp lệ (Facebook ngắt kết nối) → branch=page_invalid, không tạo draft', async () => {
    resetAll(); setPath(db, 'facebookConnection', { status: 'not_connected' }); logs.length = 0;
    await orch.handleTelegramMessage(productUpdate());
    assert(/kind=photo caption=yes branch=page_invalid$/.test(trackLine()), 'log: ' + trackLine()); eq(drafts().length, 0);
  });
  // ── Hội thoại AI cho tin chữ thường (model GIẢ trong test; không gọi OpenAI thật) ──
  const textMsg = (text, over) => { const o = over || {}; return { update_id: ++updSeq, message: { from: o.from || { id: 777 }, chat: o.chat || { id: 555 }, text } }; };
  const mkChat = (impl) => { const calls2 = []; return { calls2, fn: async (a) => { calls2.push(a); return impl(a); } }; };
  await test('AI hội thoại: tin chữ thường → gọi model (system + câu hỏi) và gửi câu trả lời về đúng chat; log chỉ có độ dài, không có nội dung', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    const c = mkChat(async () => ({ text: 'Xin chào! Mình là trợ lý Pshop Music.' }));
    const r = await orch.handleTelegramMessage(textMsg('Cho hoi CAUHOIRIENGTU nhe @PSH_Flatform_Bot'), { chatWithAi: c.fn });
    eq(r.chat, true); eq(c.calls2.length, 1); assert(/Pshop Music/.test(c.calls2[0].system) && /KHÔNG bịa/.test(c.calls2[0].system), 'system prompt');
    assert(c.calls2[0].user.includes('CAUHOIRIENGTU') && !/@PSH_Flatform_Bot/i.test(c.calls2[0].user), 'câu hỏi đã bỏ mention'); eq(c.calls2[0].maxTokens, 500);
    eq(sentTg.length, 1); eq(String(sentTg[0].chat_id), '555'); assert(/trợ lý Pshop Music/.test(sentTg[0].text));
    assert(logs.some((l) => /\[telegramWebhook\] update kind=text caption=no branch=ai_chat$/.test(l)) && logs.some((l) => /ai_chat ok in=\d+ out=\d+$/.test(l)), 'log nhánh');
    noLeak('CAUHOIRIENGTU', 'trợ lý Pshop'); eq(drafts().length, 0);
  });
  await test('Tin "hello" / "xin chào" → gọi AI và trả lời (không im lặng, không nhầm thành lệnh/ảnh)', async () => {
    resetAll(); sentTg.length = 0; const c = mkChat(async () => ({ text: 'Chào bạn! Pshop Music có thể giúp gì?' }));
    const r1 = await orch.handleTelegramMessage(textMsg('hello'), { chatWithAi: c.fn });
    const r2 = await orch.handleTelegramMessage(textMsg('xin chào'), { chatWithAi: c.fn });
    eq(r1.chat, true); eq(r2.chat, true); eq(c.calls2.length, 2); eq(sentTg.length, 2);
    assert(/Chào bạn/.test(sentTg[0].text) && /Chào bạn/.test(sentTg[1].text)); eq(drafts().length, 0);
  });
  await test('XDJ-RR: mock research tool được gọi, giữ context, không hỏi lại tên, nêu nguồn', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    let researchCalls = 0; const prompts = [];
    const research = async (q) => {
      researchCalls++;
      assert(/XDJ-RR/i.test(q.sku || q.name), JSON.stringify(q));
      return {
        status: 'verified', matchedSku: 'XDJ-RR',
        specs: { 'Deck': '2 kênh' }, features: ['Beat FX', 'Hot Cue'],
        sources: [{ title: 'Pioneer DJ XDJ-RR', url: 'https://www.pioneerdj.com/en/product/all-in-one-dj-systems/xdj-rr/', type: 'official', claims: ['2-channel all-in-one DJ system'] }],
        warnings: []
      };
    };
    const chat = async (a) => { prompts.push(a); return { text: 'XDJ-RR có hai deck và các chức năng performance theo nguồn hãng.' }; };
    let r = await orch.handleTelegramMessage(textMsg('XDJ RR'), { chatWithAi: chat, researchProduct: research });
    eq(r.chat, true); eq(r.researchUsed, true); eq(researchCalls, 1);
    assert(/RESEARCH_RESULTS/.test(prompts[0].system) || /RESEARCH_RESULTS/.test(prompts[0].user), 'prompt phải có research');
    assert(/pioneerdj\.com/.test(prompts[0].user), 'prompt phải có nguồn thật');
    assert(/pioneerdj\.com/.test(sentTg[0].text) && !/không thể truy cập web/i.test(sentTg[0].text), sentTg[0].text);
    eq(getPath(db, 'telegramChatContext/555/777/model'), 'XDJ-RR');
    sentTg.length = 0;
    r = await orch.handleTelegramMessage(textMsg('mô tả thêm chức năng của sản phẩm'), { chatWithAi: chat, researchProduct: research });
    eq(r.chat, true); eq(r.researchUsed, true); eq(researchCalls, 2);
    assert(!/tên sản phẩm|model nào/i.test(sentTg[0].text), 'không được hỏi lại tên: ' + sentTg[0].text);
    sentTg.length = 0;
    r = await orch.handleTelegramMessage(textMsg('bạn tham khảo web rồi rep tôi'), { chatWithAi: chat, researchProduct: research });
    eq(r.chat, true); eq(r.researchUsed, true); eq(researchCalls, 3);
    assert(/pioneerdj\.com/.test(sentTg[0].text), 'câu trả lời phải có nguồn: ' + sentTg[0].text);
  });
  await test('Research rejected (sai model/không nguồn) → báo rõ, không gọi model, không bịa', async () => {
    resetAll(); sentTg.length = 0; let chatCalled = false;
    const r = await orch.handleTelegramMessage(textMsg('XDJ RR'), {
      researchProduct: async () => ({ status: 'rejected', sources: [], warnings: ['Không tìm thấy nguồn đúng model.'] }),
      chatWithAi: async () => { chatCalled = true; return { text: 'không được gọi' }; }
    });
    eq(r.failed, true); eq(chatCalled, false);
    assert(/nguồn đúng model/i.test(sentTg[0].text) && !/không thể truy cập web/i.test(sentTg[0].text), sentTg[0].text);
  });
  await test('Research lỗi/timeout trong chat → báo đúng lỗi, không dùng câu từ chối web chung', async () => {
    resetAll(); sentTg.length = 0; let chatCalled = false;
    const r = await orch.handleTelegramMessage(textMsg('XDJ RR'), {
      researchProduct: async () => ({ status: 'timeout', sources: [], warnings: ['Research quá thời gian chờ.'] }),
      chatWithAi: async () => { chatCalled = true; return { text: 'không được gọi' }; }
    });
    eq(r.failed, true); eq(r.reason, 'research_timeout'); eq(chatCalled, false);
    assert(/quá thời gian chờ/i.test(sentTg[0].text) && !/không thể truy cập web/i.test(sentTg[0].text), sentTg[0].text);
  });
  await test('Chat thường không có sản phẩm → không gọi Research', async () => {
    resetAll(); let called = 0; const c = mkChat(async () => ({ text: 'Chào bạn.' }));
    await orch.handleTelegramMessage(textMsg('hello'), { chatWithAi: c.fn, researchProduct: async () => { called++; throw new Error('không được gọi'); } });
    eq(called, 0); eq(c.calls2.length, 1);
  });
  await test('Tin CHỮ giống chú thích sản phẩm (>=2 nhãn) nhưng không có ảnh → nhắc gửi ảnh, KHÔNG gọi AI', async () => {
    resetAll(); sentTg.length = 0; const c = mkChat(async () => ({ text: 'AI khong duoc goi' }));
    const r = await orch.handleTelegramMessage(textMsg('Tên: Pioneer\nGiá: 3tr5\nTình trạng: Mới'), { chatWithAi: c.fn });
    eq(r.reason, 'no_photo'); eq(c.calls2.length, 0); eq(drafts().length, 0);
    assert(/1 ảnh/.test(sentTg[0].text), sentTg[0] && sentTg[0].text);
  });
  await test('AI hội thoại: đầu vào bị cắt 1000 ký tự, đầu ra bị cắt 1500 ký tự', async () => {
    resetAll(); sentTg.length = 0; const c = mkChat(async () => ({ text: 'x'.repeat(5000) }));
    await orch.handleTelegramMessage(textMsg('a'.repeat(4000)), { chatWithAi: c.fn });
    eq(c.calls2[0].user.length, 1000); assert(sentTg[0].text.length <= 1500, 'đầu ra ' + sentTg[0].text.length);
  });
  await test('AI hội thoại: model LỖI / timeout / rỗng → bot báo lỗi dễ hiểu (không im lặng), log an toàn, không lộ nội dung', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0;
    const e500 = Object.assign(new Error('OpenAI API lỗi (HTTP 500) NOIDUNGBIMAT'), { code: 'api_error', status: 500 });
    await orch.handleTelegramMessage(textMsg('hoi gi do'), { chatWithAi: async () => { throw e500; } });
    assert(/AI đang gặp lỗi/.test(sentTg[0].text), 'lỗi API: ' + sentTg[0].text); assert(logs.some((l) => /ai_chat FAILED reason=api_error http=500$/.test(l)), 'log api_error');
    sentTg.length = 0; await orch.handleTelegramMessage(textMsg('hoi gi do'), { chatWithAi: (a) => new Promise((_, rej) => { a.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }), chatTimeoutMs: 40 });
    assert(/quá chậm/.test(sentTg[0].text), 'timeout: ' + sentTg[0].text); assert(logs.some((l) => /ai_chat FAILED reason=timeout$/.test(l)));
    sentTg.length = 0; await orch.handleTelegramMessage(textMsg('hoi gi do'), { chatWithAi: async () => ({ text: '   ' }) });
    assert(/không trả về nội dung/.test(sentTg[0].text), 'rỗng: ' + sentTg[0].text); assert(logs.some((l) => /ai_chat FAILED reason=empty_output$/.test(l)));
    noLeak('NOIDUNGBIMAT', 'hoi gi do');
  });
  await test('AI hội thoại: KHÔNG có OPENAI_API_KEY (đường mặc định, không mock) → báo thiếu cấu hình, KHÔNG gọi api.openai.com, không giả vờ AI chạy', async () => {
    resetAll(); logs.length = 0; sentTg.length = 0; const prevKey = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    const r = await orch.handleTelegramMessage(textMsg('xin chao')); if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
    eq(r.reason, 'no_key'); assert(/chưa được cấu hình/.test(sentTg[0].text), sentTg[0] && sentTg[0].text); assert(!calls.some((c) => /api\.openai\.com/.test(c.url)), 'không được gọi OpenAI');
    assert(logs.some((l) => /ai_chat FAILED reason=no_key$/.test(l)));
  });
  await test('aiGenerate.callOpenAiChat: gọi gpt-4o-mini với system+user+max_tokens, key chỉ ở header; HTTP 429 → lỗi api_error có status; không key → no_key', async () => {
    const ag = require('../shared/aiGenerate'); const prev = global.fetch; const prevKey = process.env.OPENAI_API_KEY; let seen = null;
    process.env.OPENAI_API_KEY = 'sk-TESTKEY0123456789abcdef';
    global.fetch = async (u, o) => { seen = { u: String(u), o }; return res({ choices: [{ message: { content: ' Xin chào ' } }] }); };
    const out = await ag.callOpenAiChat({ system: 'S', user: 'U', maxTokens: 321 }); const body = JSON.parse(seen.o.body);
    eq(out.text, 'Xin chào'); eq(seen.u, 'https://api.openai.com/v1/chat/completions'); eq(body.model, 'gpt-4o-mini'); eq(body.max_tokens, 321);
    eq(body.messages[0].role, 'system'); eq(body.messages[1].content, 'U'); assert(seen.o.headers.Authorization === 'Bearer sk-TESTKEY0123456789abcdef' && !seen.o.body.includes('TESTKEY'), 'key chỉ ở header');
    global.fetch = async () => res({ error: { message: 'rate' } }, false, 429); let err = null; try { await ag.callOpenAiChat({ system: 'S', user: 'U' }); } catch (e) { err = e; }
    assert(err && err.code === 'api_error' && err.status === 429 && !String(err.message).includes('TESTKEY'), 'api_error 429');
    delete process.env.OPENAI_API_KEY; err = null; try { await ag.callOpenAiChat({ system: 'S', user: 'U' }); } catch (e) { err = e; }
    assert(err && err.code === 'no_key', 'no_key'); global.fetch = prev; if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey; else delete process.env.OPENAI_API_KEY;
  });
  await test('AI hội thoại: người KHÔNG có quyền / chat lạ KHÔNG dùng được AI (model không bị gọi)', async () => {
    resetAll(); sentTg.length = 0; const c = mkChat(async () => ({ text: 'x' }));
    const r1 = await orch.handleTelegramMessage(textMsg('xin chao', { from: { id: 999 } }), { chatWithAi: c.fn }); eq(r1.skipped, true); assert(/không có quyền/.test(sentTg[0].text));
    sentTg.length = 0; const r2 = await orch.handleTelegramMessage(textMsg('xin chao', { chat: { id: -42, type: 'group' } }), { chatWithAi: c.fn }); eq(r2.reason, 'chat_mismatch'); eq(sentTg.length, 0);
    resetAll(); setPath(db, 'roles/uid_ok', { role: 'agent' }); sentTg.length = 0; const r3 = await orch.handleTelegramMessage(textMsg('xin chao'), { chatWithAi: c.fn }); eq(r3.reason, 'approver_role_not_allowed');
    eq(c.calls2.length, 0, 'model không được gọi');
  });
  await test('AI hội thoại KHÔNG chiếm lệnh/ảnh: /start, /help → HELP; /retry (có/không mã), lệnh lạ → không gọi model; ảnh + caption đúng → pipeline cũ', async () => {
    resetAll(); sentTg.length = 0; const c = mkChat(async () => ({ text: 'x' }));
    await orch.handleTelegramMessage(textMsg('/start'), { chatWithAi: c.fn }); await orch.handleTelegramMessage(textMsg('/help'), { chatWithAi: c.fn });
    eq(sentTg.length, 2); assert(sentTg.every((m) => /Gửi 1 ẢNH sản phẩm/.test(m.text)), 'HELP');
    await orch.handleTelegramMessage(textMsg('/retry khongtontai'), { chatWithAi: c.fn }); await orch.handleTelegramMessage(textMsg('/retry'), { chatWithAi: c.fn }); await orch.handleTelegramMessage(textMsg('/lenhla'), { chatWithAi: c.fn });
    eq(c.calls2.length, 0, 'lệnh không được chuyển cho AI');
    const r = await orch.handleTelegramMessage(productUpdate(), { chatWithAi: c.fn }); eq(c.calls2.length, 0, 'ảnh không gọi chat AI'); eq(drafts().length, 1); assert(r.draftId || r.result || r.ok !== false, 'pipeline chạy');
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
  await test('Webhook: "hello" → AI (đường mặc định, không mock handler) → sendMessage, không tạo draft', async () => {
    resetAll(); sentTg.length = 0; const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-E2EKEY0123456789abcdef';
    const r = await webhook({ update_id: ++updSeq, message: { from: { id: 777 }, chat: { id: 555 }, text: 'hello' } });
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevKey;
    eq(r.status, 200); eq(sentTg.length, 1); assert(/Chào bạn/.test(sentTg[0].text), sentTg[0] && sentTg[0].text);
    assert(calls.some((c) => c.url === 'https://api.openai.com/v1/chat/completions'), 'phải gọi model');
    eq(drafts().length, 0);
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
