/*
 * tests/fbPublisherHardening.test.js — G1O: kiểm chứng vá routes/fbPublisher.js
 * (Telegram auto-publisher): race duyệt/sửa, kiểm người duyệt, so sánh secret an toàn.
 *
 * Chạy: node tests/fbPublisherHardening.test.js   (từ thư mục functions/)
 *
 * AN TOÀN: không Firebase / Telegram / Facebook thật, không mạng.
 *   - firebase-admin = store in-memory (transaction nguyên tử, snapshot chụp lúc đọc).
 *   - global.fetch = tripwire: chỉ chấp nhận các URL api.telegram.org (trả giả lập, GHI LẠI);
 *     mọi URL khác (đặc biệt graph.facebook.com) ném lỗi.
 *   - Graph API: facebook-graph-api.js được thay hàm bằng spy; kết nối dùng isMock:true.
 */
'use strict';

let dbData = {};
function parts(p) { return String(p || '').split('/').filter(Boolean); }
function getPath(obj, p) { let c = obj; for (const k of parts(p)) { if (c == null || typeof c !== 'object') return null; c = c[k]; } return c === undefined ? null : c; }
// Phase 5 — secret KHÔNG ở RTDB: bot token/secret được cấp qua Functions secret (biến môi trường). Các test cũ cấu hình chúng bằng
// setPath(...); ở đây ánh xạ sang process.env để giữ nguyên kịch bản. RTDB chỉ nhận phần cấu hình KHÔNG bí mật.
function _setEnv(k, v) { if (v === null || v === undefined || v === '') delete process.env[k]; else process.env[k] = String(v); }
function _clearSecretEnv() { for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'WEBHOOK_SIGNING_SECRET', 'COMPOSITOR_SECRET']) delete process.env[k]; }
function setPath(obj, path, val) {
  if (path === 'webhookSigningSecret') { _setEnv('WEBHOOK_SIGNING_SECRET', val); return; }
  if (path === 'telegramWebhookSecret') { _setEnv('TELEGRAM_WEBHOOK_SECRET', val); return; }
  if (path === 'telegramConfig/token') { _setEnv('TELEGRAM_BOT_TOKEN', val); return; }
  if (path === 'telegramConfig') { const v = val && typeof val === 'object' ? Object.assign({}, val) : val; _setEnv('TELEGRAM_BOT_TOKEN', v && v.token); if (v && typeof v === 'object') delete v.token; return _rawSetPath(obj, path, v); }
  return _rawSetPath(obj, path, val);
}
function _rawSetPath(obj, path, val) { return _rawSetPath2(obj, path, val); }
function _rawSetPath2(obj, p, v) {
  const ps = parts(p); let c = obj;
  for (let i = 0; i < ps.length - 1; i++) { if (c[ps[i]] == null || typeof c[ps[i]] !== 'object') c[ps[i]] = {}; c = c[ps[i]]; }
  if (v === null) delete c[ps[ps.length - 1]]; else c[ps[ps.length - 1]] = v;
}
let keyCounter = 0;
function mockRef(p) {
  return {
    once: async () => { const v = getPath(dbData, p); const copy = v === null ? null : JSON.parse(JSON.stringify(v)); return { exists: () => copy !== null, val: () => copy }; },
    set: async (v) => setPath(dbData, p, v),
    update: async (ch) => setPath(dbData, p, Object.assign({}, getPath(dbData, p) || {}, ch)),
    push: () => { const key = 'k' + (++keyCounter); return { key, set: async (v) => setPath(dbData, p + '/' + key, v) }; },
    transaction: async (fn) => {
      const cur = getPath(dbData, p);
      const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return { committed: false, snapshot: { val: () => cur } };
      setPath(dbData, p, next);
      return { committed: true, snapshot: { val: () => next } };
    }
  };
}
const mockAdmin = { database: () => ({ ref: mockRef }), apps: [{}] };
mockAdmin.database.ServerValue = { TIMESTAMP: '__ts__' };

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'firebase-admin') return mockAdmin;
  if (/aiGenerate$/.test(request)) return { generateForModule: async () => ({ content: { versions: [{ hook: 'H', caption: 'AI', cta: 'C', hashtags: [] }] } }) };
  return origLoad.apply(this, arguments);
};

let telegramCalls = [];
global.fetch = async (url) => {
  if (typeof url === 'string' && url.indexOf('https://api.telegram.org/') === 0) {
    telegramCalls.push(url);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  }
  throw new Error('NETWORK TRIPWIRE: ' + url);
};

const graph = require('../facebook-graph-api');
let published = [];
graph.uploadPhoto = async () => ({ id: 'photo1' });
graph.publishToFeed = async (args) => { published.push(args); return { id: 'post_' + published.length }; };

const store = require('../shared/fbDraftStore');
const fbPublisher = require('../routes/fbPublisher');
const { handleTelegramWebhook } = require('../shared/telegramWebhookRelay');
const { safeEqual } = require('../shared/secretCompare');
const { markRelayTrusted, isRelayTrusted } = require('../shared/relayTrust');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  reset();
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); failed++; failures.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ': mong đợi ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a)); }

const SECRET = 'whsec_test_value';
function reset() {
  _clearSecretEnv();
  dbData = {}; published = []; telegramCalls = []; keyCounter = 0;
  setPath(dbData, 'webhookSigningSecret', SECRET);       // secret gateway (WEBHOOK_SIGNING_SECRET)
  setPath(dbData, 'telegramWebhookSecret', SECRET);      // secret relay Telegram (TELEGRAM_WEBHOOK_SECRET)
  setPath(dbData, 'facebookPageTokens/uid1/page1', { accessToken: 'mock_tok', isMock: true });
  setPath(dbData, 'telegramConfig', { token: 'tg', chatId: '555', approverIds: ['1', '123', '777'], approverMap: { '1': 'uid_tg', '123': 'uid_tg', '777': 'uid_tg' } });
  setPath(dbData, 'roles/uid_tg', 'admin');
}
async function pendingDraft(caption) {
  const d = await store.createDraft({ pageId: 'page1', caption: caption || 'Original caption', requestedBy: 'editor-uid' });
  await store.updateStatus(d.id, 'PROCESSING');
  await store.updateStatus(d.id, 'PENDING_APPROVAL');
  return d;
}
function helpers(auth) {
  let last = null;
  const res = { status: (s) => ({ json: (d) => { last = { status: s, data: d }; } }), json: (d) => { last = { data: d }; }, get: () => last };
  return {
    res, auth: auth || { ok: true, role: 'editor', uid: 'editor-uid', email: 'e@x' },
    sendSuccess: (r, data, o) => r.status((o && o.status) || 200).json({ success: true, data }),
    sendError: (r, code, msg) => r.status(code === 'UNAUTHENTICATED' ? 401 : 400).json({ success: false, error: { code, message: msg } })
  };
}
// Mặc định mô phỏng ĐƯỜNG PRODUCTION: request nội bộ do relay tạo (đã gắn dấu tin cậy).
// { direct: true } = gọi thẳng /v1/facebook-publisher/callback qua gateway chỉ bằng X-PSH-Webhook-Secret.
async function callback(data, cq, secret, opts) {
  const h = helpers();
  const req = { method: 'POST', __pshPath: '/v1/facebook-publisher/callback', body: { callback_query: Object.assign({ id: 'q1', data }, cq || {}) }, get: (n) => n === 'X-PSH-Webhook-Secret' ? (secret === undefined ? SECRET : secret) : null };
  if (!(opts && opts.direct)) markRelayTrusted(req);
  await fbPublisher.handle(req, h.res, h);
  return h.res.get();
}
async function edit(draftId, body, auth) {
  const h = helpers(auth);
  const req = { method: 'POST', __pshPath: '/v1/facebook-publisher/drafts/' + draftId + '/edits', body, get: () => null };
  await fbPublisher.handle(req, h.res, h);
  return h.res.get();
}
const OK_CQ = { from: { id: 777, username: 'founder' }, message: { chat: { id: 555 } } };

(async () => {
  console.log('\n[1] safeEqual / xác thực callback');
  await test('safeEqual: đúng/sai/độ dài khác/rỗng/không phải chuỗi', async () => {
    assert(safeEqual('abc', 'abc')); assert(!safeEqual('abc', 'abd')); assert(!safeEqual('abc', 'abcd'));
    assert(!safeEqual('', '')); assert(!safeEqual(undefined, 'x')); assert(!safeEqual('x', null)); assert(!safeEqual(1, 1));
  });
  await test('callback (gọi thẳng gateway): sai secret → 401, KHÔNG đăng', async () => {
    const d = await pendingDraft();
    const r = await callback('fb_approve:' + d.id + ':1', OK_CQ, 'wrong', { direct: true });
    eq(r.status, 401); eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('callback (gọi thẳng gateway): thiếu secret → 401', async () => {
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ, '', { direct: true }); eq(r.status, 401); eq(published.length, 0);
  });
  await test('callback (gọi thẳng gateway): chưa cấu hình webhookSigningSecret → 401 (không có "secret rỗng khớp rỗng")', async () => {
    setPath(dbData, 'webhookSigningSecret', null);
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ, '', { direct: true }); eq(r.status, 401); eq(published.length, 0);
  });
  await test('relay: sai X-Telegram-Bot-Api-Secret-Token → 200 auth fail, KHÔNG đăng', async () => {
    const d = await pendingDraft();
    let out = null;
    const res = { status() { return this; }, json(b) { out = b; } };
    await handleTelegramWebhook({ method: 'POST', get: () => 'wrong', body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(out.reason, 'auth'); eq(published.length, 0);
  });
  await test('relay: đúng token + đúng chat → đăng được', async () => {
    const d = await pendingDraft();
    let out = null;
    const res = { status() { return this; }, json(b) { out = b; } };
    await handleTelegramWebhook({ method: 'POST', get: () => SECRET, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(published.length, 1); eq((await store.getDraft(d.id)).status, 'PUBLISHED');
  });

  console.log('\n[2] Ai được duyệt (chat + approverIds)');
  await test('chatId cấu hình dạng số: callback từ chat KHÁC bị bỏ qua, draft vẫn PENDING', async () => {
    const d = await pendingDraft();
    const r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: 999 } } });
    eq(r.data.data.reason, 'chat_mismatch'); eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('chatId dạng số: callback KHÔNG có message.chat bị bỏ qua', async () => {
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 } });
    eq(r.data.data.reason, 'chat_mismatch'); eq(published.length, 0);
  });
  await test('đúng chat: duyệt được, lưu approvedBy', async () => {
    const d = await pendingDraft(); await callback('fb_approve:' + d.id + ':1', OK_CQ);
    const after = await store.getDraft(d.id);
    eq(after.status, 'PUBLISHED'); eq(after.approvedBy.id, '777'); eq(after.approvedBy.username, 'founder'); eq(published.length, 1);
  });
  await test('approverIds cấu hình: người KHÔNG trong danh sách bị bỏ qua', async () => {
    setPath(dbData, 'telegramConfig/approverIds', [111]);
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ);
    eq(r.data.data.reason, 'approver_not_allowed'); eq(published.length, 0);
  });
  await test('approverIds cấu hình: người trong danh sách duyệt được (so sánh số/chuỗi)', async () => {
    setPath(dbData, 'telegramConfig/approverIds', ['777']);
    const d = await pendingDraft(); await callback('fb_approve:' + d.id + ':1', OK_CQ); eq(published.length, 1);
  });
  await test('huỷ (fb_cancel) từ chat khác bị bỏ qua', async () => {
    const d = await pendingDraft(); await callback('fb_cancel:' + d.id, { from: { id: 1 }, message: { chat: { id: 999 } } });
    eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('huỷ đúng chat → CANCELLED', async () => {
    const d = await pendingDraft(); await callback('fb_cancel:' + d.id, OK_CQ); eq((await store.getDraft(d.id)).status, 'CANCELLED');
  });
  await test('FAIL-CLOSED: telegramConfig.chatId THIẾU → từ chối, KHÔNG đăng', async () => {
    setPath(dbData, 'telegramConfig', { token: 'tg' });
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ);
    eq(r.data.data.reason, 'chat_not_configured'); eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('FAIL-CLOSED: không có node telegramConfig → từ chối', async () => {
    setPath(dbData, 'telegramConfig', null);
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ);
    eq(r.data.data.reason, 'chat_not_configured'); eq(published.length, 0);
  });
  await test('FAIL-CLOSED: chatId sai định dạng ("tg_chat") → từ chối', async () => {
    setPath(dbData, 'telegramConfig/chatId', 'tg_chat');
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ);
    eq(r.data.data.reason, 'chat_config_invalid'); eq(published.length, 0);
  });
  await test('FAIL-CLOSED: chatId = "@kenh" nhưng chat.username khác → từ chối; đúng username → duyệt được (không phân biệt hoa thường)', async () => {
    setPath(dbData, 'telegramConfig/chatId', '@KenhPshop');
    const d = await pendingDraft();
    let r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: -100, username: 'kenhkhac' } } });
    eq(r.data.data.reason, 'chat_mismatch'); eq(published.length, 0);
    r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: -100, username: 'kenhpshop' } } });
    eq(published.length, 1);
  });
  await test('FAIL-CLOSED: chatId "@kenh" nhưng callback không có chat.username → từ chối', async () => {
    setPath(dbData, 'telegramConfig/chatId', '@KenhPshop');
    const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: -100 } } });
    eq(r.data.data.reason, 'chat_mismatch'); eq(published.length, 0);
  });
  await test('chatId nhóm âm (-1001234) so khớp đúng', async () => {
    setPath(dbData, 'telegramConfig/chatId', '-1001234');
    const d = await pendingDraft(); await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: -1001234 } } });
    eq(published.length, 1);
  });

  console.log('\n[2b] Gọi thẳng gateway vs relay (G1Q)');
  await test('GỌI THẲNG gateway với secret ĐÚNG và from/chat GIẢ MẠO đúng cấu hình → vẫn bị từ chối mặc định, KHÔNG đăng', async () => {
    const d = await pendingDraft();
    const r = await callback('fb_approve:' + d.id + ':1', OK_CQ, SECRET, { direct: true });
    eq(r.data.data.reason, 'gateway_callback_disabled'); eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('GỌI THẲNG gateway: huỷ (fb_cancel) cũng bị từ chối mặc định', async () => {
    const d = await pendingDraft(); const r = await callback('fb_cancel:' + d.id, OK_CQ, SECRET, { direct: true });
    eq(r.data.data.reason, 'gateway_callback_disabled'); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('allowGatewayCallback=true (chủ dự án chủ động bật): đường gọi thẳng hoạt động và VẪN áp dụng kiểm chat/approverIds', async () => {
    setPath(dbData, 'telegramConfig/allowGatewayCallback', true);
    const d = await pendingDraft();
    let r = await callback('fb_approve:' + d.id + ':1', { from: { id: 1 }, message: { chat: { id: 999 } } }, SECRET, { direct: true });
    eq(r.data.data.reason, 'chat_mismatch'); eq(published.length, 0);
    await callback('fb_approve:' + d.id + ':1', OK_CQ, SECRET, { direct: true });
    eq(published.length, 1);
  });
  await test('allowGatewayCallback chỉ nhận đúng boolean true (chuỗi "true"/1 không đủ)', async () => {
    for (const v of ['true', 1, 'yes']) {
      setPath(dbData, 'telegramConfig/allowGatewayCallback', v);
      const d = await pendingDraft(); const r = await callback('fb_approve:' + d.id + ':1', OK_CQ, SECRET, { direct: true });
      eq(r.data.data.reason, 'gateway_callback_disabled', 'giá trị ' + JSON.stringify(v));
    }
    eq(published.length, 0);
  });
  await test('Dấu tin cậy relay KHÔNG giả được qua HTTP: header/body/thuộc tính đoán mò đều không được coi là đã qua relay', async () => {
    assert(!isRelayTrusted({ __pshRelayTrust: 'guess' }));
    assert(!isRelayTrusted({ body: { __pshRelayTrust: 'x' }, headers: { '__pshRelayTrust': 'x' } }));
    assert(!isRelayTrusted(null)); assert(!isRelayTrusted({}));
    const d = await pendingDraft();
    const h = helpers();
    const req = { method: 'POST', __pshPath: '/v1/facebook-publisher/callback', body: { __pshRelayTrust: 'x', callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) }, __pshRelayTrust: 'x', get: (n) => n === 'X-PSH-Webhook-Secret' ? SECRET : (n === '__pshRelayTrust' ? 'x' : null) };
    await fbPublisher.handle(req, h.res, h);
    eq(h.res.get().data.data.reason, 'gateway_callback_disabled'); eq(published.length, 0);
  });
  await test('Đường relay đầy đủ (X-Telegram-Bot-Api-Secret-Token) + đúng chat → duyệt được ngay cả khi allowGatewayCallback không bật', async () => {
    const d = await pendingDraft(); let out = null;
    const res = { status() { return this; }, json(b) { out = b; } };
    await handleTelegramWebhook({ method: 'POST', get: (n) => n === 'X-Telegram-Bot-Api-Secret-Token' ? SECRET : null, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(published.length, 1); eq((await store.getDraft(d.id)).status, 'PUBLISHED');
  });
  await test('Relay: tin nhắn giả mạo from/chat sai (đúng secret Telegram) vẫn bị kiểm chat/approverIds chặn', async () => {
    setPath(dbData, 'telegramConfig/approverIds', ['1']);
    const d = await pendingDraft(); const res = { status() { return this; }, json() {} };
    await handleTelegramWebhook({ method: 'POST', get: () => SECRET, body: { callback_query: { id: 'q', data: 'fb_approve:' + d.id + ':1', from: { id: 2 }, message: { chat: { id: 555 } } } } }, res);
    eq(published.length, 0);
  });

  await test('draftId trong callback_data chứa "/" hoặc ký tự lạ → INVALID_REQUEST, không chạm RTDB', async () => {
    const d = await pendingDraft();
    for (const bad of ['abc/status', 'a.b', 'a$b', 'x'.repeat(100)]) {
      const r = await callback('fb_approve:' + bad + ':1', OK_CQ);
      eq(r.status, 400, JSON.stringify(bad)); eq(published.length, 0);
    }
    eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });

  console.log('\n[2c] Secret của relay (G1Q)');
  await test('telegramWebhookSecret riêng được ưu tiên: secret cũ (webhookSigningSecret) KHÔNG còn qua được relay', async () => {
    setPath(dbData, 'telegramWebhookSecret', 'tg_only_secret');
    const d = await pendingDraft(); let out = null; const res = { status() { return this; }, json(b) { out = b; } };
    await handleTelegramWebhook({ method: 'POST', get: () => SECRET, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(out.reason, 'auth'); eq(published.length, 0);
    await handleTelegramWebhook({ method: 'POST', get: () => 'tg_only_secret', body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(published.length, 1);
  });
  await test('Có telegramWebhookSecret riêng: secret gateway (X-PSH-Webhook-Secret) KHÔNG đủ để giả Telegram ở relay', async () => {
    setPath(dbData, 'telegramWebhookSecret', 'tg_only_secret');
    const d = await pendingDraft(); let out = null; const res = { status() { return this; }, json(b) { out = b; } };
    await handleTelegramWebhook({ method: 'POST', get: (n) => n === 'X-PSH-Webhook-Secret' ? SECRET : null, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    eq(out.reason, 'auth'); eq(published.length, 0);
  });
  await test('KHÔNG còn fallback: chưa có TELEGRAM_WEBHOOK_SECRET → relay từ chối kể cả khi gửi secret gateway; ghi lỗi cấu hình (không lộ secret)', async () => {
    setPath(dbData, 'telegramWebhookSecret', null); // WEBHOOK_SIGNING_SECRET (gateway) vẫn có = SECRET
    const errs = []; const origErr = console.error; console.error = (...a) => errs.push(a.join(' '));
    let out = null;
    try {
      const d = await pendingDraft(); const res = { status() { return this; }, json(b) { out = b; } };
      await handleTelegramWebhook({ method: 'POST', get: () => SECRET, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    } finally { console.error = origErr; }
    eq(out.reason, 'auth'); eq(published.length, 0, 'secret gateway không được dùng thay secret Telegram');
    assert(errs.length === 1 && /TELEGRAM_WEBHOOK_SECRET/.test(errs[0]) && errs[0].indexOf(SECRET) < 0, 'phải có đúng 1 lỗi cấu hình, không chứa giá trị secret');
  });
  await test('Có TELEGRAM_WEBHOOK_SECRET riêng: request sai secret bị từ chối, KHÔNG ghi log (không để kẻ lạ làm ngập log)', async () => {
    setPath(dbData, 'telegramWebhookSecret', 'tg_only_secret');
    const errs = []; const warns = []; const oe = console.error, ow = console.warn; console.error = (...a) => errs.push(a.join(' ')); console.warn = (...a) => warns.push(a.join(' '));
    let out = null;
    try {
      const d = await pendingDraft(); const res = { status() { return this; }, json(b) { out = b; } };
      await handleTelegramWebhook({ method: 'POST', get: () => 'doan-mo', body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    } finally { console.error = oe; console.warn = ow; }
    eq(out.reason, 'auth'); eq(errs.length + warns.length, 0); eq(published.length, 0);
  });
  await test('Có TELEGRAM_WEBHOOK_SECRET riêng + đúng secret → duyệt được, không ghi cảnh báo/lỗi', async () => {
    setPath(dbData, 'telegramWebhookSecret', 'tg_only_secret');
    const errs = []; const warns = []; const oe = console.error, ow = console.warn; console.error = (...a) => errs.push(a.join(' ')); console.warn = (...a) => warns.push(a.join(' '));
    try {
      const d = await pendingDraft(); const res = { status() { return this; }, json() {} };
      await handleTelegramWebhook({ method: 'POST', get: () => 'tg_only_secret', body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
    } finally { console.error = oe; console.warn = ow; }
    eq(errs.length + warns.length, 0); eq(published.length, 1);
  });
  await test('Không cấu hình secret nào (cả hai rỗng) → relay từ chối mọi request (fail-closed), kể cả header rỗng', async () => {
    setPath(dbData, 'telegramWebhookSecret', null); setPath(dbData, 'webhookSigningSecret', null);
    for (const hdr of ['', 'x', undefined]) {
      let out = null; const res = { status() { return this; }, json(b) { out = b; } };
      const d = await pendingDraft();
      await handleTelegramWebhook({ method: 'POST', get: () => hdr, body: { callback_query: Object.assign({ id: 'q', data: 'fb_approve:' + d.id + ':1' }, OK_CQ) } }, res);
      eq(out.reason, 'auth', 'header ' + JSON.stringify(hdr));
    }
    eq(published.length, 0);
  });

  console.log('\n[3] Race duyệt/sửa');
  await test('applyEditTransaction: đổi nội dung + tăng version CÙNG LÚC; từ chối khi không còn PENDING', async () => {
    const d = await pendingDraft('v1 text');
    const e1 = await store.applyEditTransaction(d.id, { aiCaption: 'v2 text', caption: 'v2 text' });
    assert(e1.committed); eq(e1.newVersion, 2);
    const mid = await store.getDraft(d.id); eq(mid.aiCaption, 'v2 text'); eq(mid.version, 2);
    await store.updateStatus(d.id, 'APPROVED');
    const e2 = await store.applyEditTransaction(d.id, { aiCaption: 'late' });
    eq(e2.committed, false); eq(e2.reason, 'not_pending'); eq((await store.getDraft(d.id)).aiCaption, 'v2 text');
  });
  await test('applyEditTransaction không cho ghi đè status/version qua patches', async () => {
    const d = await pendingDraft();
    await store.applyEditTransaction(d.id, { status: 'PUBLISHED', version: 99, aiCaption: 'x' });
    const a = await store.getDraft(d.id); eq(a.status, 'PENDING_APPROVAL'); eq(a.version, 2);
  });
  await test('approveTransaction: version cũ bị từ chối NGAY TRONG transaction', async () => {
    const d = await pendingDraft(); await store.applyEditTransaction(d.id, { aiCaption: 'new' });
    const r = await store.approveTransaction(d.id, { expectedVersion: 1 });
    eq(r.committed, false); eq(r.reason, 'version_mismatch'); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('RACE: người sửa chen vào GIỮA lúc handler đọc version và lúc duyệt → KHÔNG đăng nội dung chưa được xem', async () => {
    const d = await pendingDraft('Caption v1 da duoc xem');
    const origGet = store.getDraft; let injected = false;
    store.getDraft = async function (id) {
      const v = await origGet(id);
      if (!injected && id === d.id) { injected = true; await store.applyEditTransaction(d.id, { aiCaption: 'NOI DUNG DOC HAI', caption: 'NOI DUNG DOC HAI' }); }
      return v; // handler nhận bản v1 (lỗi thời)
    };
    try {
      const r = await callback('fb_approve:' + d.id + ':1', OK_CQ);
      eq(r.data.data.skipped, true); eq(r.data.data.reason, 'version_mismatch');
    } finally { store.getDraft = origGet; }
    eq(published.length, 0, 'không được đăng');
    const after = await store.getDraft(d.id); eq(after.status, 'PENDING_APPROVAL'); eq(after.version, 2);
  });
  await test('RACE: sửa NGAY SAU khi duyệt commit (trước khi handler đọc nội dung để đăng) → nội dung đăng = snapshot lúc duyệt', async () => {
    const d = await pendingDraft('Caption da duyet');
    const origGet = store.getDraft; let injected = false;
    store.getDraft = async function (id) {
      const cur = await origGet(id);
      // lần đọc đầu tiên SAU khi draft đã APPROVED: có người sửa chen vào trước khi trả kết quả
      if (!injected && id === d.id && cur && cur.status === 'APPROVED') {
        injected = true;
        await store.patchFields(id, { aiCaption: 'SUA SAU KHI DUYET', caption: 'SUA SAU KHI DUYET' });
        return origGet(id);
      }
      return cur;
    };
    // updateStatus dùng getDraft nội bộ (không qua store.getDraft) nên hook thêm ở đây: đảm bảo sửa-sau-duyệt
    // luôn xảy ra dù handler có đọc lại draft hay không.
    const origUpdate = store.updateStatus;
    store.updateStatus = async function (id, status) {
      if (status === 'PUBLISHING' && !injected) {
        injected = true;
        await store.patchFields(id, { aiCaption: 'SUA SAU KHI DUYET', caption: 'SUA SAU KHI DUYET' });
      }
      return origUpdate.apply(this, arguments);
    };
    try { await callback('fb_approve:' + d.id + ':1', OK_CQ); } finally { store.getDraft = origGet; store.updateStatus = origUpdate; }
    eq(injected, true, 'hook phải được kích hoạt');
    eq(published.length, 1); eq(published[0].message, 'Caption da duyet', 'phải đăng đúng nội dung đã duyệt');
  });
  await test('route edits: sửa draft đã APPROVED/PUBLISHED bị từ chối, nội dung không đổi', async () => {
    const d = await pendingDraft('abc'); await callback('fb_approve:' + d.id + ':1', OK_CQ);
    const r = await edit(d.id, { caption: 'doi sau khi dang' });
    assert(r.data.success === false, 'phải bị từ chối'); eq((await store.getDraft(d.id)).caption, 'abc');
  });
  await test('route edits: nút Duyệt cũ (v1) vô hiệu sau khi sửa; nút mới (v2) duyệt được và đăng nội dung mới', async () => {
    const d = await pendingDraft('v1');
    const r = await edit(d.id, { caption: 'v2 caption' }); eq(r.data.data.version, 2);
    await callback('fb_approve:' + d.id + ':1', OK_CQ); eq(published.length, 0, 'nút v1 phải vô hiệu');
    await callback('fb_approve:' + d.id + ':2', OK_CQ); eq(published.length, 1); eq(published[0].message, 'v2 caption');
  });
  await test('double-approve song song: chỉ 1 lần đăng', async () => {
    const d = await pendingDraft();
    await Promise.all([callback('fb_approve:' + d.id + ':1', OK_CQ), callback('fb_approve:' + d.id + ':1', OK_CQ)]);
    eq(published.length, 1);
  });

  console.log('\n[4] Tạo/sửa draft: quyền');
  await test('tạo draft: không đăng nhập → bị từ chối; role "viewer" → bị từ chối', async () => {
    for (const auth of [{ ok: false }, { ok: true, role: 'viewer', uid: 'u' }]) {
      const h = helpers(auth);
      await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body: { pageId: 'page1', caption: 'x' }, get: () => null }, h.res, h);
      assert(h.res.get().data.success === false);
    }
    eq(published.length, 0);
  });
  await test('tạo draft: editor tạo được nhưng draft ở PENDING_APPROVAL, KHÔNG tự đăng', async () => {
    const h = helpers();
    await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body: { pageId: 'page1', caption: 'x' }, get: () => null }, h.res, h);
    const r = h.res.get(); eq(r.status, 201); eq(r.data.data.status, 'PENDING_APPROVAL'); eq(published.length, 0);
  });
  await test('GHI NHẬN: requestedBy do client tự khai (có thể giả) — không dùng để phân quyền', async () => {
    const h = helpers();
    await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body: { pageId: 'page1', caption: 'x', requestedBy: 'founder-uid' }, get: () => null }, h.res, h);
    const created = await store.getDraft(h.res.get().data.data.draftId);
    eq(created.requestedBy, 'founder-uid');
  });

  console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' pass, ' + failed + ' fail');
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
