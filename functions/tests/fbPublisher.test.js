/*
 * tests/fbPublisher.test.js — Test suite cho PSH Facebook Auto-Publisher.
 *
 * Chạy: node tests/fbPublisher.test.js (từ thư mục functions/)
 * Không cần Firebase thật — mock admin.database() bằng in-memory store.
 * Không cần Telegram thật — mock global fetch.
 * Không cần Facebook thật — publishToFeed trong mock mode không gọi API thật.
 *
 * Sprint 15 Phase FB — PSH Facebook Auto-Publisher.
 */

'use strict';

// ── Mock firebase-admin (in-memory store) ─────────────────────────────────────

let dbData = {};

function getPath(obj, path) {
  const parts = path.split('/').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

function _rawSetPath(obj, path, val) {
  const parts = path.split('/').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

function updatePath(obj, path, changes) {
  const cur = getPath(obj, path) || {};
  const merged = Object.assign({}, cur, changes);
  setPath(obj, path, merged);
}

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

let _keyCounter = 0;
function mockRef(path) {
  return {
    once: async () => ({
      exists: () => getPath(dbData, path) !== null,
      val: () => getPath(dbData, path)
    }),
    set: async (val) => setPath(dbData, path, val),
    update: async (changes) => updatePath(dbData, path, changes),
    push: () => {
      const key = 'testkey_' + (++_keyCounter) + '_' + Math.random().toString(36).slice(2, 7);
      return {
        key,
        set: async (val) => setPath(dbData, path + '/' + key, val)
      };
    },
    // Mock RTDB transaction — single-threaded: đọc current, gọi updateFn, nếu trả undefined thì abort
    transaction: async (updateFn) => {
      const current = getPath(dbData, path);
      const newVal = updateFn(current === null ? null : current);
      if (newVal === undefined) {
        // Abort — không thay đổi, committed = false
        return { committed: false, snapshot: { val: () => current, exists: () => current !== null } };
      }
      setPath(dbData, path, newVal);
      return { committed: true, snapshot: { val: () => newVal, exists: () => true } };
    }
  };
}

const mockAdmin = {
  database: () => ({ ref: mockRef }),
  apps: [{}]
};
mockAdmin.database.ServerValue = { TIMESTAMP: '__server_ts__' };

// Inject mock truoc khi require modules
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-admin') return mockAdmin;
  if (request === '../shared/aiGenerate' || (parent && parent.filename && parent.filename.includes('fbPublisher') && request.endsWith('aiGenerate'))) {
    return {
      generateForModule: async (moduleId, inputParams) => {
        if (moduleId === 'image-generator') {
          // Mock: trả về aiDraft với content.imageUrl
          return { content: { imageUrl: 'https://oaidalleapiprodscus.blob.core.windows.net/mock/test-image.png' } };
        }
        // facebook-post-generator và các module khác
        return { content: { versions: [{ hook: 'AI Hook', caption: 'AI Caption', cta: 'Mua ngay!', hashtags: ['#test', '#pshop'] }] } };
      }
    };
  }
  return originalLoad.apply(this, arguments);
};

// ── Mock fetch cho Telegram & Facebook API ────────────────────────────────────

global.fetch = async (url) => {
  if (url && (url.includes('/sendMessage') || url.includes('/sendPhoto') || url.includes('/answerCallbackQuery'))) {
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 12345 } }) };
  }
  if (url && url.includes('graph.facebook.com')) {
    return { ok: true, json: async () => ({ id: 'mock_fb_post_' + Date.now() }) };
  }
  return { ok: false, json: async () => ({ error: 'Unexpected fetch: ' + url }) };
};

// ── Require modules sau khi mock da cai ──────────────────────────────────────

const { VALID_TRANSITIONS, createDraft, updateStatus, findByTelegramUpdateId, getDraft, bumpVersion, patchFields, approveTransaction } = require('../shared/fbDraftStore');
const { getPageToken, listConnectedPages } = require('../shared/fbPageConfig');
const telegram = require('../shared/telegram');
const fbPublisher = require('../routes/fbPublisher');

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.error('  ✗ ' + name);
    console.error('    -> ' + e.message);
    failures.push({ name, error: e.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// G1Q — callback duyệt/huỷ giờ fail-closed: cần telegramConfig.chatId hợp lệ và payload có message.chat
// (Telegram thật luôn gửi). Các test dưới đây gọi handler TRỰC TIẾP (đường gateway), nên bật
// allowGatewayCallback (opt-in) để vẫn kiểm chứng logic duyệt; đường mặc định-từ-chối và đường relay được
// kiểm ở functions/tests/fbPublisherHardening.test.js và telegramWebhookRelay.test.js.
const TEST_TG_CONFIG = { chatId: '555', allowGatewayCallback: true, approverIds: ['1', '123', '777'], approverMap: { '1': 'uid_tg', '123': 'uid_tg', '777': 'uid_tg' } };
function resetDb() {
  _clearSecretEnv();
  dbData = {};
  _keyCounter = 0;
  setPath(dbData, 'telegramConfig', Object.assign({}, TEST_TG_CONFIG));
  setPath(dbData, 'roles/uid_tg', 'admin');
}

function makeMockHelpers(authOverride) {
  const auth = authOverride !== undefined ? authOverride
    : { ok: true, role: 'admin', uid: 'uid_test', email: 'test@psh.vn' };
  let lastSent = null;
  const res = {
    status: (s) => ({ json: (d) => { lastSent = { status: s, data: d }; return lastSent; } }),
    json: (d) => { lastSent = { data: d }; return lastSent; },
    _get: () => lastSent
  };
  function sendSuccess(r, data, opts) {
    const s = (opts && opts.status) || 200;
    return r.status(s).json({ success: true, data });
  }
  function sendError(r, code, msg) {
    return r.status(400).json({ success: false, error: { code, message: msg } });
  }
  return { auth, res, sendSuccess, sendError };
}

function makeReq(method, path, body, headers) {
  const h = headers || {};
  let b = body || {};
  if (path === '/v1/facebook-publisher/callback' && b.callback_query) {
    // Payload Telegram thật luôn có from + message.chat.
    b = Object.assign({}, b, { callback_query: Object.assign({ from: { id: 777 }, message: { chat: { id: 555 } } }, b.callback_query) });
  }
  return {
    method,
    __pshPath: path,
    body: b,
    get: (name) => h[name] || null
  };
}

// =============================================================================
// CHAY TAT CA TESTS
// =============================================================================

(async () => {

// =============================================================================
// NHOM 1: fbDraftStore -- State Machine Transitions
// =============================================================================

console.log('\n=== [1] fbDraftStore -- State Machine ===');
resetDb();

await test('T1: VALID_TRANSITIONS xuat du 5 trang thai goc', async () => {
  assert(Array.isArray(VALID_TRANSITIONS.RECEIVED));
  assert(Array.isArray(VALID_TRANSITIONS.PROCESSING));
  assert(Array.isArray(VALID_TRANSITIONS.PENDING_APPROVAL));
  assert(Array.isArray(VALID_TRANSITIONS.APPROVED));
  assert(Array.isArray(VALID_TRANSITIONS.PUBLISHING));
});

await test('T2: RECEIVED -> PROCESSING hop le', async () => {
  assert(VALID_TRANSITIONS.RECEIVED.includes('PROCESSING'));
});

await test('T3: RECEIVED -> APPROVED KHONG hop le (phai qua PROCESSING)', async () => {
  assert(!VALID_TRANSITIONS.RECEIVED.includes('APPROVED'));
});

await test('T4: PROCESSING -> PENDING_APPROVAL va FAILED hop le', async () => {
  assert(VALID_TRANSITIONS.PROCESSING.includes('PENDING_APPROVAL'));
  assert(VALID_TRANSITIONS.PROCESSING.includes('FAILED'));
});

await test('T5: PENDING_APPROVAL -> APPROVED va CANCELLED hop le', async () => {
  assert(VALID_TRANSITIONS.PENDING_APPROVAL.includes('APPROVED'));
  assert(VALID_TRANSITIONS.PENDING_APPROVAL.includes('CANCELLED'));
});

await test('T6: PENDING_APPROVAL -> PUBLISHED KHONG hop le (skip step)', async () => {
  assert(!VALID_TRANSITIONS.PENDING_APPROVAL.includes('PUBLISHED'));
});

await test('T7: PUBLISHING -> PUBLISHED va FAILED hop le', async () => {
  assert(VALID_TRANSITIONS.PUBLISHING.includes('PUBLISHED'));
  assert(VALID_TRANSITIONS.PUBLISHING.includes('FAILED'));
});

await test('T8: createDraft tra ve object co id + status RECEIVED', async () => {
  resetDb();
  const d = await createDraft({
    telegramUpdateId: 999, pageId: 'page1',
    caption: 'Test caption', imageUrls: ['https://img.test/1.jpg'], requestedBy: 'tester'
  });
  assert(d.id, 'phai co id');
  assert(d.status === 'RECEIVED', 'status phai la RECEIVED, co: ' + d.status);
  assert(d.telegramUpdateId === 999, 'telegramUpdateId phai khop');
  assert(d.pageId === 'page1', 'pageId phai khop');
});

await test('T9: updateStatus RECEIVED -> PROCESSING OK', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  const updated = await updateStatus(d.id, 'PROCESSING');
  assert(updated.status === 'PROCESSING', 'phai PROCESSING, co: ' + updated.status);
});

await test('T10: updateStatus RECEIVED -> APPROVED throw (invalid transition)', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  let threw = false;
  try { await updateStatus(d.id, 'APPROVED'); } catch (e) { threw = true; }
  assert(threw, 'phai throw khi transition khong hop le');
});

await test('T11: updateStatus PROCESSING -> PENDING_APPROVAL + extraFields OK', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  await updateStatus(d.id, 'PROCESSING');
  const updated = await updateStatus(d.id, 'PENDING_APPROVAL', { aiCaption: 'AI caption' });
  assert(updated.status === 'PENDING_APPROVAL', 'phai PENDING_APPROVAL');
  assert(updated.aiCaption === 'AI caption', 'phai co aiCaption');
});

await test('T12: chain day du RECEIVED->PROCESSING->PENDING_APPROVAL->APPROVED->PUBLISHING->PUBLISHED', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  await updateStatus(d.id, 'PROCESSING');
  await updateStatus(d.id, 'PENDING_APPROVAL');
  await updateStatus(d.id, 'APPROVED');
  await updateStatus(d.id, 'PUBLISHING');
  const updated = await updateStatus(d.id, 'PUBLISHED', { publishedAt: Date.now(), facebookPostId: 'fb_123' });
  assert(updated.status === 'PUBLISHED', 'phai PUBLISHED');
  assert(updated.facebookPostId === 'fb_123', 'phai co facebookPostId');
});

await test('T13: findByTelegramUpdateId tim dung ban ghi', async () => {
  resetDb();
  const d = await createDraft({ telegramUpdateId: 77777, pageId: 'p1', caption: 'Hi' });
  const found = await findByTelegramUpdateId(77777);
  assert(found !== null, 'phai tim thay');
  assert(found.id === d.id, 'phai tra dung id');
});

await test('T14: findByTelegramUpdateId tra null neu khong tim thay', async () => {
  resetDb();
  const found = await findByTelegramUpdateId(99999);
  assert(found === null, 'phai tra null');
});

await test('T15: getDraft tra null neu id khong ton tai', async () => {
  resetDb();
  const found = await getDraft('nonexistent_id_xyz');
  assert(found === null, 'phai tra null');
});

// =============================================================================
// NHOM 2: fbPageConfig -- Multi-Fanpage Token Routing
// =============================================================================

console.log('\n=== [2] fbPageConfig -- Multi-Fanpage Token Routing ===');

await test('T16: getPageToken(null) tra null', async () => {
  resetDb();
  const result = await getPageToken(null);
  assert(result === null, 'phai null');
});

await test('T17: getPageToken tra null khi RTDB rong', async () => {
  resetDb();
  const result = await getPageToken('page_abc');
  assert(result === null, 'phai null khi DB trong');
});

await test('T18: getPageToken tim dung page trong facebookPageTokens', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_abc', {
    accessToken: 'token_abc_123',
    expiresAt: Date.now() + 86400000,
    isMock: false
  });
  const result = await getPageToken('page_abc');
  assert(result !== null, 'phai tim thay');
  assert(result.accessToken === 'token_abc_123', 'accessToken phai khop');
  assert(result.uid === 'uid1', 'uid phai khop');
  assert(result.isMock === false, 'isMock phai false');
});

await test('T19: getPageToken tim qua nhieu UIDs -- tra dung uid', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_other', { accessToken: 'tok_other' });
  setPath(dbData, 'facebookPageTokens/uid2/page_target', { accessToken: 'tok_target', isMock: true });
  const result = await getPageToken('page_target');
  assert(result !== null, 'phai tim thay');
  assert(result.uid === 'uid2', 'uid phai la uid2');
  assert(result.isMock === true, 'isMock phai true');
});

await test('T20: listConnectedPages tra dung so pages', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_a', { accessToken: 'tok1' });
  setPath(dbData, 'facebookPageTokens/uid1/page_b', { accessToken: 'tok2' });
  setPath(dbData, 'facebookPageTokens/uid2/page_c', { accessToken: 'tok3', isMock: true });
  const pages = await listConnectedPages();
  assert(pages.length === 3, 'phai co 3 pages, co: ' + pages.length);
});

await test('T21: listConnectedPages tra [] khi DB rong', async () => {
  resetDb();
  const pages = await listConnectedPages();
  assert(Array.isArray(pages) && pages.length === 0, 'phai tra mang rong');
});

// =============================================================================
// NHOM 3: telegram.js -- Extensions
// =============================================================================

console.log('\n=== [3] telegram.js -- sendPhoto + answerCallbackQuery + replyMarkup ===');

await test('T22: sendPhoto missing params -> {ok:false}', async () => {
  const r = await telegram.sendPhoto({ token: '', chatId: '', photo: '' });
  assert(r.ok === false, 'phai false khi thieu params');
});

await test('T23: answerCallbackQuery missing callbackQueryId -> {ok:false}', async () => {
  const r = await telegram.answerCallbackQuery({ token: 'x', callbackQueryId: '' });
  assert(r.ok === false, 'phai false khi thieu callbackQueryId');
});

await test('T24: sendMessage voi replyMarkup -> body chua reply_markup', async () => {
  const replyMarkup = { inline_keyboard: [[{ text: 'Yes', callback_data: 'yes' }]] };
  let capturedBody = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url.includes('/sendMessage')) capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  await telegram.sendMessage({ token: 'tok', chatId: 'chat1', text: 'Hello', replyMarkup });
  global.fetch = origFetch;
  assert(capturedBody !== null, 'fetch phai duoc goi');
  assert(capturedBody.reply_markup !== undefined, 'body phai co reply_markup');
  assert(capturedBody.reply_markup.inline_keyboard[0][0].text === 'Yes', 'text button phai la Yes');
});

await test('T25: sendMessage khong co replyMarkup -> khong co reply_markup trong body', async () => {
  let capturedBody = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url.includes('/sendMessage')) capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
  };
  await telegram.sendMessage({ token: 'tok', chatId: 'chat1', text: 'Hello' });
  global.fetch = origFetch;
  assert(capturedBody !== null, 'fetch phai duoc goi');
  assert(capturedBody.reply_markup === undefined, 'khong co replyMarkup -> khong co reply_markup trong body');
});

// =============================================================================
// NHOM 4: routes/fbPublisher -- Integration Tests
// =============================================================================

console.log('\n=== [4] routes/fbPublisher -- Route Handler Integration ===');

await test('T26: POST /v1/facebook-publisher/drafts khong auth -> UNAUTHENTICATED', async () => {
  resetDb();
  const { auth, res, sendSuccess, sendError } = makeMockHelpers({ ok: false, error: 'Chua dang nhap' });
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', { pageId: 'p1', caption: 'Hi' });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r && r.data && r.data.error, 'phai tra error');
  assert(r.data.error.code === 'UNAUTHENTICATED', 'code phai UNAUTHENTICATED, co: ' + (r.data.error && r.data.error.code));
});

await test('T27: POST /v1/facebook-publisher/drafts thieu pageId -> INVALID_REQUEST', async () => {
  resetDb();
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', { caption: 'Hi' });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'INVALID_REQUEST', 'code phai INVALID_REQUEST, co: ' + r.data.error.code);
});

await test('T28: POST drafts thieu caption va khong generateAi -> INVALID_REQUEST', async () => {
  resetDb();
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', { pageId: 'p1' });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'INVALID_REQUEST', 'code phai INVALID_REQUEST');
});

await test('T29: POST drafts pageId khong co token -> NOT_FOUND', async () => {
  resetDb();
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', { pageId: 'unknown_page_xyz', caption: 'Hi' });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'NOT_FOUND', 'code phai NOT_FOUND, co: ' + r.data.error.code);
});

await test('T30: POST drafts hop le -> 201 + draftId + PENDING_APPROVAL', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_demo', { accessToken: 'mock_tok', isMock: true });
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', {
    pageId: 'page_demo',
    caption: 'San pham moi',
    imageUrls: ['https://example.com/img.jpg'],
    telegramUpdateId: 54321
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r && r.data && r.data.data, 'phai tra success data');
  const data = r.data.data;
  assert(data.draftId, 'phai co draftId');
  assert(data.status === 'PENDING_APPROVAL', 'status phai PENDING_APPROVAL, co: ' + data.status);
});

await test('T31: Idempotency -- POST lan 2 cung telegramUpdateId -> idempotent:true + cung draftId', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_demo', { accessToken: 'mock_tok', isMock: true });

  const req = makeReq('POST', '/v1/facebook-publisher/drafts', {
    pageId: 'page_demo', caption: 'Test idempotency', telegramUpdateId: 11111
  });

  // Lan 1
  const h1 = makeMockHelpers();
  await fbPublisher.handle(req, h1.res, { sendSuccess: h1.sendSuccess, sendError: h1.sendError, auth: h1.auth });
  const r1 = h1.res._get();
  const draftId1 = r1.data.data.draftId;
  assert(draftId1, 'lan 1 phai co draftId');

  // Lan 2 -- cung telegramUpdateId
  const h2 = makeMockHelpers();
  await fbPublisher.handle(req, h2.res, { sendSuccess: h2.sendSuccess, sendError: h2.sendError, auth: h2.auth });
  const r2 = h2.res._get();
  assert(r2.data.data.idempotent === true, 'lan 2 phai idempotent:true');
  assert(r2.data.data.draftId === draftId1, 'phai tra cung draftId: ' + draftId1);
});

await test('T32: POST /v1/facebook-publisher/callback khong co secret -> UNAUTHENTICATED', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'test_secret_xyz');
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq1', data: 'fb_approve:someDraftId' }
  }, {}); // Khong co X-PSH-Webhook-Secret header
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'UNAUTHENTICATED', 'phai UNAUTHENTICATED, co: ' + r.data.error.code);
});

await test('T33: POST callback fb_approve mock page -> status PUBLISHED + facebookPostId', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_abc');
  setPath(dbData, 'facebookPageTokens/uid1/page_demo', { accessToken: 'mock_tok', isMock: true });

  // Tao draft o PENDING_APPROVAL
  const draft = await createDraft({ pageId: 'page_demo', caption: 'Bai dang test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_approve', data: 'fb_approve:' + draft.id }
  }, { 'X-PSH-Webhook-Secret': 'secret_abc' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success');
  assert(r.data.data.handled === true, 'phai handled:true');
  assert(r.data.data.action === 'fb_approve', 'action phai fb_approve');

  // Xac minh RTDB state
  const updatedDraft = await getDraft(draft.id);
  assert(updatedDraft.status === 'PUBLISHED', 'status phai PUBLISHED, co: ' + updatedDraft.status);
  assert(updatedDraft.facebookPostId != null, 'phai co facebookPostId (mock)');
});

await test('T34: POST callback fb_cancel PENDING_APPROVAL -> status CANCELLED', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_abc');
  setPath(dbData, 'facebookPageTokens/uid1/page_demo', { accessToken: 'mock_tok', isMock: true });

  const draft = await createDraft({ pageId: 'page_demo', caption: 'Cancel test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_cancel', data: 'fb_cancel:' + draft.id }
  }, { 'X-PSH-Webhook-Secret': 'secret_abc' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.data.action === 'fb_cancel', 'action phai fb_cancel');

  const updatedDraft = await getDraft(draft.id);
  assert(updatedDraft.status === 'CANCELLED', 'status phai CANCELLED, co: ' + updatedDraft.status);
});

await test('T35: callback khong phai fb_ -> {handled:false}', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_abc');
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_other', data: 'other_action:xyz' }
  }, { 'X-PSH-Webhook-Secret': 'secret_abc' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.data.handled === false, 'phai handled:false');
});

await test('T36: route khong khop -> tra null (khong xu ly)', async () => {
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('GET', '/v1/products', {});
  const result = await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  assert(result === null, 'phai tra null cho route khong phai /v1/facebook-publisher/...');
});

// =============================================================================
// NHOM 5: fbDraftStore moi — version, bumpVersion, patchFields, approveTransaction
// =============================================================================

console.log('\n=== [5] fbDraftStore -- version + bumpVersion + patchFields + approveTransaction ===');

await test('T37: createDraft -- version field mac dinh la 1', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Test' });
  assert(d.version === 1, 'version phai la 1, co: ' + d.version);
});

await test('T38: bumpVersion -- tang version len 2 sau 1 lan goi', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Test' });
  assert(d.version === 1, 'version ban dau phai la 1');
  const newV = await bumpVersion(d.id);
  assert(newV === 2, 'bumpVersion phai tra ve 2, co: ' + newV);
  const updated = await getDraft(d.id);
  assert(updated.version === 2, 'draft.version phai la 2');
});

await test('T39: bumpVersion -- tang version lan 3 (1->2->3)', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Test' });
  await bumpVersion(d.id);
  const v3 = await bumpVersion(d.id);
  assert(v3 === 3, 'sau 2 lan bump phai la 3, co: ' + v3);
});

await test('T40: patchFields -- cap nhat aiCaption khong qua state machine', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Original' });
  await patchFields(d.id, { aiCaption: 'Patched AI Caption', generatedImageUrl: 'https://img.test/gen.jpg' });
  const updated = await getDraft(d.id);
  assert(updated.aiCaption === 'Patched AI Caption', 'aiCaption phai duoc cap nhat');
  assert(updated.generatedImageUrl === 'https://img.test/gen.jpg', 'generatedImageUrl phai duoc cap nhat');
  assert(updated.status === 'RECEIVED', 'status KHONG duoc thay doi boi patchFields');
});

await test('T41: approveTransaction -- commit khi PENDING_APPROVAL', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  await updateStatus(d.id, 'PROCESSING');
  await updateStatus(d.id, 'PENDING_APPROVAL');
  const { committed, currentStatus } = await approveTransaction(d.id);
  assert(committed === true, 'phai committed:true');
  assert(currentStatus === 'APPROVED', 'currentStatus phai APPROVED, co: ' + currentStatus);
  const updated = await getDraft(d.id);
  assert(updated.status === 'APPROVED', 'RTDB phai la APPROVED');
});

await test('T42: approveTransaction -- abort khi NOT PENDING_APPROVAL (double-approve prevention)', async () => {
  resetDb();
  const d = await createDraft({ pageId: 'p1', caption: 'Hi' });
  await updateStatus(d.id, 'PROCESSING');
  await updateStatus(d.id, 'PENDING_APPROVAL');
  // Approve lan 1 thanh cong
  const r1 = await approveTransaction(d.id);
  assert(r1.committed === true, 'lan 1 phai committed');
  // Approve lan 2 -- draft da o APPROVED, khong con PENDING_APPROVAL -> abort
  const r2 = await approveTransaction(d.id);
  assert(r2.committed === false, 'lan 2 phai abort (committed:false)');
});

// =============================================================================
// NHOM 6: Sprint Founder -- 14 Scenarios moi
// =============================================================================

console.log('\n=== [6] Founder 14 Scenarios ===');

// S1: generateAi:true → lưu aiCaption từ AI + generatedImageUrl từ image-generator
await test('S1: generateAi:true -> luu aiCaption + generatedImageUrl trong RTDB', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_ai', { accessToken: 'tok', isMock: true });
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', {
    pageId: 'page_ai', generateAi: true, caption: 'goc', telegramUpdateId: 99001
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success');
  const { draftId } = r.data.data;
  const draft = await getDraft(draftId);
  assert(draft.aiCaption && draft.aiCaption.length > 0, 'phai co aiCaption tu AI');
  assert(draft.generatedImageUrl && draft.generatedImageUrl.includes('http'), 'phai co generatedImageUrl tu image-generator');
  assert(draft.status === 'PENDING_APPROVAL', 'status phai PENDING_APPROVAL');
});

// S2: generateAi:true khi da co imageUrls goc → van generate ảnh trừ khi có generateAiImage:false
await test('S2: generateAi:true voi imageUrls goc → khong generate them AI image (dung anh goc)', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_ai', { accessToken: 'tok', isMock: true });
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', {
    pageId: 'page_ai', generateAi: true, caption: 'goc',
    imageUrls: ['https://original.com/photo.jpg'], // co anh goc
    generateAiImage: false // explicit: khong generate AI image
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success');
  const draft = await getDraft(r.data.data.draftId);
  assert(draft.generatedImageUrl === null, 'generatedImageUrl phai null vi generateAiImage:false');
  assert(draft.imageUrls[0] === 'https://original.com/photo.jpg', 'imageUrls goc phai giu nguyen');
});

// S3: Multi-round edit — POST /edits cap nhat caption, bump version
await test('S3: POST /edits cap nhat caption → version tang + aiCaption moi', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_e', { accessToken: 'tok', isMock: true });
  // Tao draft PENDING_APPROVAL
  const draft = await createDraft({ pageId: 'page_e', caption: 'Ban dau' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts/' + draft.id + '/edits', {
    caption: 'Caption moi sau edit'
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success, loi: ' + JSON.stringify(r.data));
  assert(r.data.data.version === 2, 'version phai la 2 sau edit, co: ' + r.data.data.version);
  assert(r.data.data.aiCaption === 'Caption moi sau edit', 'aiCaption phai duoc cap nhat');
  const updated = await getDraft(draft.id);
  assert(updated.version === 2, 'RTDB version phai la 2');
});

// S4: Multi-round edit — draft khong ton tai → NOT_FOUND
await test('S4: POST /edits draft khong ton tai → NOT_FOUND', async () => {
  resetDb();
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts/nonexistent_xyz/edits', {
    caption: 'New caption'
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'NOT_FOUND', 'code phai NOT_FOUND, co: ' + r.data.error.code);
});

// S5: Multi-round edit — draft khong o PENDING_APPROVAL → INVALID_STATE
await test('S5: POST /edits draft da PUBLISHED → INVALID_STATE', async () => {
  resetDb();
  const draft = await createDraft({ pageId: 'p5', caption: 'Done' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');
  await updateStatus(draft.id, 'APPROVED');
  await updateStatus(draft.id, 'PUBLISHING');
  await updateStatus(draft.id, 'PUBLISHED', { publishedAt: Date.now(), facebookPostId: 'fb_xyz' });

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/drafts/' + draft.id + '/edits', {
    caption: 'Too late'
  });
  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.error.code === 'INVALID_STATE', 'code phai INVALID_STATE, co: ' + r.data.error.code);
});

// S6: Version mismatch trong approve callback → skipped, version_mismatch
await test('S6: fb_approve voi version cu (sau edit) → skipped version_mismatch', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_v');
  setPath(dbData, 'facebookPageTokens/uid1/page_v', { accessToken: 'tok', isMock: true });

  // Tao draft v1
  const draft = await createDraft({ pageId: 'page_v', caption: 'V1' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');
  // Edit → version 2
  await bumpVersion(draft.id);

  // Gui approve voi version 1 (cu) — phai bi reject
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_v', data: 'fb_approve:' + draft.id + ':1' } // version 1 cu
  }, { 'X-PSH-Webhook-Secret': 'secret_v' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai tra 200, co: ' + JSON.stringify(r.data));
  assert(r.data.data.skipped === true, 'phai skipped:true');
  assert(r.data.data.reason === 'version_mismatch', 'reason phai version_mismatch');
  const updatedDraft = await getDraft(draft.id);
  assert(updatedDraft.status === 'PENDING_APPROVAL', 'draft KHONG duoc approve, phai van PENDING_APPROVAL');
});

// S7: Version khớp trong approve callback → approve thành công
await test('S7: fb_approve voi version dung (v2) → approve thanh cong', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_v2');
  setPath(dbData, 'facebookPageTokens/uid1/page_v2', { accessToken: 'tok', isMock: true });

  const draft = await createDraft({ pageId: 'page_v2', caption: 'V2 test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');
  await bumpVersion(draft.id); // version = 2

  // Approve voi version 2 dung
  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_v2', data: 'fb_approve:' + draft.id + ':2' }
  }, { 'X-PSH-Webhook-Secret': 'secret_v2' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success');
  const updatedDraft = await getDraft(draft.id);
  assert(updatedDraft.status === 'PUBLISHED', 'phai PUBLISHED sau approve dung version');
});

// S8: Double-approve prevention — hai approve dong thoi, chi 1 cai publish
await test('S8: double-approve -- hai approve lien tiep, chi 1 cai commit', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_da');
  setPath(dbData, 'facebookPageTokens/uid1/page_da', { accessToken: 'tok', isMock: true });

  const draft = await createDraft({ pageId: 'page_da', caption: 'Double approve test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const makeApproveReq = () => makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_da_' + Math.random(), data: 'fb_approve:' + draft.id + ':1' }
  }, { 'X-PSH-Webhook-Secret': 'secret_da' });

  // Simulate hai request song song (theo thu tu vi single-threaded test)
  const h1 = makeMockHelpers();
  const h2 = makeMockHelpers();
  await fbPublisher.handle(makeApproveReq(), h1.res, { sendSuccess: h1.sendSuccess, sendError: h1.sendError, auth: h1.auth });
  await fbPublisher.handle(makeApproveReq(), h2.res, { sendSuccess: h2.sendSuccess, sendError: h2.sendError, auth: h2.auth });

  const r1 = h1.res._get();
  const r2 = h2.res._get();

  // Mot cai phai thanh cong, mot cai phai skipped
  const results = [r1, r2];
  const published = results.filter(r => r.data.success && r.data.data && r.data.data.facebookPostId);
  const skipped = results.filter(r => r.data.success && r.data.data && r.data.data.skipped);
  assert(published.length === 1, 'chi 1 request duoc publish, co: ' + published.length);
  assert(skipped.length === 1, 'chi 1 request bi skip, co: ' + skipped.length);

  const finalDraft = await getDraft(draft.id);
  assert(finalDraft.status === 'PUBLISHED', 'draft cuoi cung phai PUBLISHED');
});

// S9: Graph API lỗi (publishToFeed throw) → FAILED, không báo success
await test('S9: Graph API throw loi → draft FAILED + bao loi (khong bao success)', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_gx');
  setPath(dbData, 'facebookPageTokens/uid1/page_gx', { accessToken: 'tok', isMock: false }); // non-mock

  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (url && url.includes('graph.facebook.com')) {
      // Simulate Graph API error
      return { ok: false, json: async () => ({ error: { message: 'Invalid OAuth access token', code: 190 } }) };
    }
    if (url && (url.includes('/sendMessage') || url.includes('/answerCallbackQuery') || url.includes('/sendPhoto'))) {
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) };
  };

  const draft = await createDraft({ pageId: 'page_gx', caption: 'Graph API fail test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_gx', data: 'fb_approve:' + draft.id + ':1' }
  }, { 'X-PSH-Webhook-Secret': 'secret_gx' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  global.fetch = origFetch;

  const r = res._get();
  // Phai bao loi, khong phai success
  assert(r.data.success === false || (r.data.data && r.data.data.skipped), 'phai bao loi hoac skip khi Graph API loi');
  const finalDraft = await getDraft(draft.id);
  assert(finalDraft.status === 'FAILED', 'draft phai FAILED khi Graph API loi, co: ' + finalDraft.status);
});

// S10: Token routing — 5 fanpages, mỗi page có token riêng, getPageToken trả đúng
await test('S10: Token routing 5 fanpages -- getPageToken tra dung token cho tung page', async () => {
  resetDb();
  const pages = ['page_001', 'page_002', 'page_003', 'page_004', 'page_005'];
  pages.forEach((pid, i) => {
    setPath(dbData, 'facebookPageTokens/uid1/' + pid, { accessToken: 'tok_' + pid, isMock: true });
  });
  for (const pid of pages) {
    const token = await getPageToken(pid);
    assert(token !== null, pid + ' phai co token');
    assert(token.accessToken === 'tok_' + pid, pid + ' accessToken sai: ' + token.accessToken);
  }
});

// S11: Token routing — không có cross-contamination giữa các page
await test('S11: Token routing khong co cross-contamination giua cac page', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/pageA', { accessToken: 'tok_A', isMock: false });
  setPath(dbData, 'facebookPageTokens/uid2/pageB', { accessToken: 'tok_B', isMock: true });
  const tokenA = await getPageToken('pageA');
  const tokenB = await getPageToken('pageB');
  assert(tokenA.accessToken === 'tok_A', 'pageA phai co tok_A');
  assert(tokenB.accessToken === 'tok_B', 'pageB phai co tok_B');
  assert(tokenA.accessToken !== tokenB.accessToken, 'token khong duoc lan nhau');
  assert(tokenA.isMock === false, 'pageA isMock phai false');
  assert(tokenB.isMock === true, 'pageB isMock phai true');
});

// S12: fb_cancel khi PUBLISHED (không phải PENDING_APPROVAL) → skipped
await test('S12: fb_cancel khi draft da PUBLISHED → skipped (khong the huy)', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_c12');
  const draft = await createDraft({ pageId: 'p12', caption: 'Test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');
  await updateStatus(draft.id, 'APPROVED');
  await updateStatus(draft.id, 'PUBLISHING');
  await updateStatus(draft.id, 'PUBLISHED', { publishedAt: Date.now(), facebookPostId: 'fb_done' });

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_c12', data: 'fb_cancel:' + draft.id }
  }, { 'X-PSH-Webhook-Secret': 'secret_c12' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai tra 200');
  assert(r.data.data.skipped === true, 'phai skipped:true');
  const finalDraft = await getDraft(draft.id);
  assert(finalDraft.status === 'PUBLISHED', 'draft phai van PUBLISHED sau cancel that bai');
});

// S13: Idempotency tiep tuc hoat dong sau cac thay doi moi
await test('S13: Idempotency van hoat dong voi code moi (telegramUpdateId dedup)', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_idem', { accessToken: 'tok', isMock: true });
  const req = makeReq('POST', '/v1/facebook-publisher/drafts', {
    pageId: 'page_idem', caption: 'Idempotency test v2', telegramUpdateId: 22222
  });
  // Lan 1
  const h1 = makeMockHelpers();
  await fbPublisher.handle(req, h1.res, { sendSuccess: h1.sendSuccess, sendError: h1.sendError, auth: h1.auth });
  const draftId1 = h1.res._get().data.data.draftId;
  // Lan 2 cung telegramUpdateId
  const h2 = makeMockHelpers();
  await fbPublisher.handle(req, h2.res, { sendSuccess: h2.sendSuccess, sendError: h2.sendError, auth: h2.auth });
  const r2 = h2.res._get().data;
  assert(r2.data.idempotent === true, 'lan 2 phai idempotent:true');
  assert(r2.data.draftId === draftId1, 'phai tra cung draftId');
});

// =============================================================================
// NHOM 7: fbPageConfig -- Fallback facebookActiveToken (B1 fix)
// =============================================================================

console.log('\n=== [7] fbPageConfig -- Fallback facebookActiveToken (B1 fix) ===');

// FA1: facebookPageTokens rỗng + facebookActiveToken có đúng pageId → trả token
await test('FA1: facebookPageTokens rong + activeToken co pageId khop → tra token', async () => {
  resetDb();
  // KHÔNG set facebookPageTokens (mô phỏng sau OAuth — đã bị facebookSelectPage xoá)
  setPath(dbData, 'facebookActiveToken', {
    pageId: '232999590676675',
    accessToken: 'EAAactive_real_token',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    isMock: false
  });
  const result = await getPageToken('232999590676675');
  assert(result !== null, 'phai tim thay token tu facebookActiveToken');
  assert(result.accessToken === 'EAAactive_real_token', 'accessToken phai khop');
  assert(result.isMock === false, 'isMock phai false');
  assert(result.uid === null, 'uid phai null (khong co trong facebookActiveToken)');
});

// FA2: facebookPageTokens rỗng + facebookActiveToken có pageId KHÁC → trả null
await test('FA2: activeToken co pageId KHAC → tra null (khong lay sai token)', async () => {
  resetDb();
  setPath(dbData, 'facebookActiveToken', {
    pageId: 'page_A_khac',
    accessToken: 'EAAtoken_page_A',
    expiresAt: Date.now() + 86400000,
    isMock: false
  });
  // Yêu cầu token cho page_B — KHÔNG được lấy token của page_A
  const result = await getPageToken('page_B_dang_yeu_cau');
  assert(result === null, 'phai null khi pageId khong khop — tranh lay nham token fanpage khac');
});

// FA3: facebookPageTokens rỗng + facebookActiveToken không có accessToken → trả null
await test('FA3: activeToken thieu accessToken → tra null', async () => {
  resetDb();
  setPath(dbData, 'facebookActiveToken', {
    pageId: '232999590676675',
    // accessToken bị thiếu
    expiresAt: Date.now() + 86400000,
    isMock: false
  });
  const result = await getPageToken('232999590676675');
  assert(result === null, 'phai null khi facebookActiveToken thieu accessToken');
});

// FA4: facebookPageTokens có token (chưa bị xoá) → ưu tiên facebookPageTokens
await test('FA4: facebookPageTokens co token → uu tien facebookPageTokens khong doc activeToken', async () => {
  resetDb();
  setPath(dbData, 'facebookPageTokens/uid1/page_real', {
    accessToken: 'tok_from_pageTokens',
    isMock: false,
    expiresAt: Date.now() + 86400000
  });
  setPath(dbData, 'facebookActiveToken', {
    pageId: 'page_real',
    accessToken: 'tok_from_activeToken',
    isMock: false
  });
  const result = await getPageToken('page_real');
  assert(result !== null, 'phai tim thay token');
  assert(result.accessToken === 'tok_from_pageTokens', 'phai uu tien facebookPageTokens, co: ' + result.accessToken);
  assert(result.uid === 'uid1', 'uid phai co khi lay tu facebookPageTokens');
});

// FA5: Toàn bộ approve/publish flow chạy khi token CHỈ nằm ở facebookActiveToken
await test('FA5: Publish flow thanh cong khi token chi co trong facebookActiveToken', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_fa5');
  // facebookPageTokens RỖNG (mô phỏng sau OAuth)
  setPath(dbData, 'facebookActiveToken', {
    pageId: 'page_active_only',
    accessToken: 'EAAonly_in_active',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    isMock: true  // isMock:true → không gọi Graph API thật
  });

  const draft = await createDraft({ pageId: 'page_active_only', caption: 'Test fallback publish' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL');

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_fa5', data: 'fb_approve:' + draft.id + ':1' }
  }, { 'X-PSH-Webhook-Secret': 'secret_fa5' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  const r = res._get();
  assert(r.data.success === true, 'phai success, loi: ' + JSON.stringify(r.data));
  const finalDraft = await getDraft(draft.id);
  assert(finalDraft.status === 'PUBLISHED', 'draft phai PUBLISHED khi token lay tu facebookActiveToken, co: ' + finalDraft.status);
  assert(finalDraft.facebookPostId != null, 'phai co facebookPostId (mock)');
});

// FA6: facebookActiveToken rỗng và facebookPageTokens rỗng → vẫn trả null
await test('FA6: ca hai node deu rong → tra null (khong crash)', async () => {
  resetDb();
  const result = await getPageToken('any_page_id');
  assert(result === null, 'phai null khi ca hai node rong');
});

// S14: generatedImageUrl trong RTDB được dùng khi publish (không chỉ imageUrls gốc)
await test('S14: Draft co generatedImageUrl → duoc su dung khi publish len Facebook', async () => {
  resetDb();
  setPath(dbData, 'webhookSigningSecret', 'secret_s14');
  setPath(dbData, 'facebookPageTokens/uid1/page_s14', { accessToken: 'tok', isMock: false });
  setPath(dbData, 'telegramConfig', { token: 'tg_tok', chatId: '555', allowGatewayCallback: true, approverIds: ['1', '123', '777'], approverMap: { '1': 'uid_tg', '123': 'uid_tg', '777': 'uid_tg' } });
  setPath(dbData, 'roles/uid_tg', 'admin');

  let uploadedUrl = null;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url && url.includes('graph.facebook.com') && url.includes('fields=id,name')) {
      // getPageInfo (xác minh token đúng Page trước khi đăng)
      return { ok: true, json: async () => ({ id: 'page_s14', name: 'Page S14' }) };
    }
    if (url && url.includes('graph.facebook.com') && url.includes('/photos')) {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      uploadedUrl = body.url || null;
      return { ok: true, json: async () => ({ id: 'photo_mock_123' }) };
    }
    if (url && url.includes('graph.facebook.com')) {
      return { ok: true, json: async () => ({ id: 'post_mock_456' }) };
    }
    if (url && (url.includes('/sendMessage') || url.includes('/answerCallbackQuery') || url.includes('/sendPhoto'))) {
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    }
    return { ok: false, json: async () => ({ error: 'unexpected: ' + url }) };
  };

  // Tao draft PENDING_APPROVAL voi generatedImageUrl
  const draft = await createDraft({ pageId: 'page_s14', caption: 'AI image test' });
  await updateStatus(draft.id, 'PROCESSING');
  await updateStatus(draft.id, 'PENDING_APPROVAL', {
    aiCaption: 'AI caption s14',
    generatedImageUrl: 'https://ai-gen.test/s14.png'
  });

  const { auth, res, sendSuccess, sendError } = makeMockHelpers();
  const req = makeReq('POST', '/v1/facebook-publisher/callback', {
    callback_query: { id: 'cq_s14', data: 'fb_approve:' + draft.id + ':1' }
  }, { 'X-PSH-Webhook-Secret': 'secret_s14' });

  await fbPublisher.handle(req, res, { sendSuccess, sendError, auth });
  global.fetch = origFetch;

  const r = res._get();
  assert(r.data.success === true, 'phai success');
  const finalDraft = await getDraft(draft.id);
  assert(finalDraft.status === 'PUBLISHED', 'phai PUBLISHED');
  // generatedImageUrl phai duoc upload len Facebook (uploadedUrl phai la ai-gen.test URL)
  assert(uploadedUrl === 'https://ai-gen.test/s14.png', 'phai upload generatedImageUrl, co: ' + uploadedUrl);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n-------------------------------------------------------------');
console.log('PASSED: ' + passed + '  FAILED: ' + failed + '  TOTAL: ' + (passed + failed));
if (failures.length > 0) {
  console.log('\nCHI TIET LOI:');
  failures.forEach(function(f) { console.log('  x ' + f.name + '\n    ' + f.error); });
}
if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS -- tat ca ' + passed + ' test fbPublisher deu qua');
}

})();
