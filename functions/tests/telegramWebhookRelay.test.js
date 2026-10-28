/*
 * tests/telegramWebhookRelay.test.js — Test suite cho Telegram Webhook Relay.
 *
 * Chạy: node tests/telegramWebhookRelay.test.js (từ thư mục functions/)
 * Kiểm tra handleTelegramWebhook() trong shared/telegramWebhookRelay.js:
 *   TW1: Method không phải POST → 405
 *   TW2: Header X-Telegram-Bot-Api-Secret-Token sai → 200 {ok:false, reason:'auth'}
 *   TW3: Header đúng nhưng không có callback_query → 200 {handled:false}
 *   TW4: callback_query.data không bắt đầu bằng fb_ → 200 {handled:false}
 *   TW5: fb_approve hợp lệ → forward đến fbPublisher → PUBLISHED
 *   TW6: fb_cancel hợp lệ → forward đến fbPublisher → CANCELLED
 *   TW7: webhookSigningSecret chưa set (rỗng) → 200 {ok:false, reason:'auth'}
 *
 * Sprint 15 Phase FB — Telegram Bridge Fix.
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
  setPath(obj, path, Object.assign({}, cur, changes));
}

// Phase 5 — secret KHÔNG ở RTDB: bot token/secret được cấp qua Functions secret (biến môi trường). Các test cũ cấu hình chúng bằng
// setPath(...); ở đây ánh xạ sang process.env để giữ nguyên kịch bản. RTDB chỉ nhận phần cấu hình KHÔNG bí mật.
function _setEnv(k, v) { if (v === null || v === undefined || v === '') delete process.env[k]; else process.env[k] = String(v); }
function _clearSecretEnv() { for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'WEBHOOK_SIGNING_SECRET', 'COMPOSITOR_SECRET']) delete process.env[k]; }
function setPath(obj, path, val) {
  if (path === 'webhookSigningSecret') { _setEnv('TELEGRAM_WEBHOOK_SECRET', val); return; }
  if (path === 'telegramWebhookSecret') { _setEnv('TELEGRAM_WEBHOOK_SECRET', val); return; }
  if (path === 'telegramConfig/token') { _setEnv('TELEGRAM_BOT_TOKEN', val); return; }
  if (path === 'telegramConfig') { const v = val && typeof val === 'object' ? Object.assign({}, val) : val; _setEnv('TELEGRAM_BOT_TOKEN', v && v.token); if (v && typeof v === 'object') { delete v.token; if (!('dryRun' in v)) v.dryRun = false; /* Phase 8: đăng thật phải bật TƯỜNG MINH (dryRun:false); mặc định an toàn được kiểm ở telegramFbPipeline.test.js */ } return _rawSetPath(obj, path, v); }
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
      const key = 'twkey_' + (++_keyCounter) + '_' + Math.random().toString(36).slice(2, 7);
      return { key, set: async (val) => setPath(dbData, path + '/' + key, val) };
    },
    transaction: async (updateFn) => {
      const current = getPath(dbData, path);
      const newVal = updateFn(current === null ? null : current);
      if (newVal === undefined) {
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

// ── Mock aiGenerate ───────────────────────────────────────────────────────────

const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-admin') return mockAdmin;
  if (request === '../shared/aiGenerate' ||
      (parent && parent.filename && parent.filename.includes('fbPublisher') && request.endsWith('aiGenerate'))) {
    return {
      generateForModule: async (moduleId) => {
        if (moduleId === 'image-generator') {
          return { content: { imageUrl: 'https://mock.test/img.png' } };
        }
        return { content: { versions: [{ hook: 'H', caption: 'C', cta: 'CTA', hashtags: ['#t'] }] } };
      }
    };
  }
  return originalLoad.apply(this, arguments);
};

// ── Mock fetch ────────────────────────────────────────────────────────────────

global.fetch = async (url) => {
  if (url && (url.includes('/sendMessage') || url.includes('/sendPhoto') || url.includes('/answerCallbackQuery'))) {
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  }
  if (url && url.includes('graph.facebook.com')) {
    return { ok: true, json: async () => ({ id: 'mock_fb_' + Date.now() }) };
  }
  return { ok: false, json: async () => ({ error: 'Unexpected fetch: ' + url }) };
};

// ── Require modules ───────────────────────────────────────────────────────────

const { handleTelegramWebhook } = require('../shared/telegramWebhookRelay');
const { createDraft, updateStatus } = require('../shared/fbDraftStore');

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

function resetDb() {
  _clearSecretEnv();
  dbData = {};
  _keyCounter = 0;
}

const WEBHOOK_SECRET = 'test_webhook_secret_tw';

// Tạo mock req/res để gọi handleTelegramWebhook
function makeReq(overrides) {
  const defaults = {
    method: 'POST',
    body: {},
    get: (h) => undefined
  };
  return Object.assign({}, defaults, overrides);
}

function makeRes() {
  let capturedCode = null;
  let capturedBody = null;
  return {
    status: function(code) { capturedCode = code; return this; },
    json: function(data) { capturedBody = data; },
    _code: () => capturedCode,
    _body: () => capturedBody
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n=== TelegramWebhookRelay Tests ===\n');

  // TW1: Method không phải POST → 405
  await test('TW1: GET request → 405 Method Not Allowed', async () => {
    resetDb();
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handleTelegramWebhook(req, res);
    assert(res._code() === 405, 'phai 405, co: ' + res._code());
    assert(res._body() && res._body().ok === false, 'phai ok:false');
  });

  // TW2: Header sai → 200 {ok:false, reason:'auth'}
  await test('TW2: Sai X-Telegram-Bot-Api-Secret-Token → 200 auth fail', async () => {
    resetDb();
    setPath(dbData, 'webhookSigningSecret', WEBHOOK_SECRET);
    const req = makeReq({
      body: {},
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? 'wrong_secret' : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);
    assert(res._code() === 200, 'phai 200 (khong retry), co: ' + res._code());
    assert(res._body() && res._body().ok === false, 'phai ok:false');
    assert(res._body().reason === 'auth', 'phai reason:auth');
  });

  // TW7: webhookSigningSecret chưa set → 200 {ok:false, reason:'auth'}
  await test('TW7: webhookSigningSecret chua set → 200 auth fail', async () => {
    resetDb();
    // KHÔNG set webhookSigningSecret
    const req = makeReq({
      body: {},
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? WEBHOOK_SECRET : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);
    assert(res._code() === 200, 'phai 200');
    assert(res._body() && res._body().ok === false, 'phai ok:false');
    assert(res._body().reason === 'auth', 'phai reason:auth');
  });

  // TW3: Header đúng, không có callback_query → 200 {handled:false}
  await test('TW3: Tin nhan thuong (khong co callback_query) → handled:false', async () => {
    resetDb();
    setPath(dbData, 'webhookSigningSecret', WEBHOOK_SECRET);
    const req = makeReq({
      body: { message: { text: 'Hello bot', from: { id: 123 } } },
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? WEBHOOK_SECRET : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);
    assert(res._code() === 200, 'phai 200');
    assert(res._body() && res._body().ok === true, 'phai ok:true');
    assert(res._body().handled === false, 'phai handled:false');
  });

  // TW4: callback_query không phải fb_ → 200 {handled:false}
  await test('TW4: callback_query.data khong phai fb_ → handled:false', async () => {
    resetDb();
    setPath(dbData, 'webhookSigningSecret', WEBHOOK_SECRET);
    const req = makeReq({
      body: {
        callback_query: {
          id: 'cq_other',
          data: 'menu_open:main',
          from: { id: 123 },
          message: { chat: { id: 555 } }
        }
      },
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? WEBHOOK_SECRET : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);
    assert(res._code() === 200, 'phai 200');
    assert(res._body() && res._body().ok === true, 'phai ok:true');
    assert(res._body().handled === false, 'phai handled:false');
  });

  // TW5: fb_approve hợp lệ → PUBLISHED
  await test('TW5: fb_approve hop le → draft PUBLISHED', async () => {
    resetDb();
    setPath(dbData, 'webhookSigningSecret', WEBHOOK_SECRET);
    setPath(dbData, 'telegramConfig', { token: 'test_token', chatId: '555', approverIds: ['1', '123', '777'], approverMap: { '1': 'uid_tg', '123': 'uid_tg', '777': 'uid_tg' } });
    setPath(dbData, 'roles/uid_tg', 'admin');
    // Tạo page token mock
    setPath(dbData, 'facebookActiveToken', {
      pageId: 'page_tw5',
      accessToken: 'token_tw5',
      isMock: true
    });
    // Tạo draft ở PENDING_APPROVAL (RECEIVED → PROCESSING → PENDING_APPROVAL)
    const draft = await createDraft({
      pageId: 'page_tw5',
      caption: 'Test caption TW5',
      imageUrls: [],
      requestedBy: 'uid_tw5'
    });
    await updateStatus(draft.id, 'PROCESSING');
    await updateStatus(draft.id, 'PENDING_APPROVAL');

    const cqData = 'fb_approve:' + draft.id + ':1';
    // Đặt version = 1 trong draft để khớp callback
    setPath(dbData, 'fbPostDrafts/' + draft.id + '/version', 1);

    const req = makeReq({
      body: {
        callback_query: {
          id: 'cq_tw5',
          data: cqData,
          from: { id: 123 },
          message: { chat: { id: 555 } }
        }
      },
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? WEBHOOK_SECRET : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);

    const updatedDraft = getPath(dbData, 'fbPostDrafts/' + draft.id);
    assert(res._body() && res._body().success === true, 'phai success, co: ' + JSON.stringify(res._body()));
    assert(updatedDraft && updatedDraft.status === 'PUBLISHED', 'phai PUBLISHED, co: ' + (updatedDraft && updatedDraft.status));
    assert(updatedDraft.facebookPostId, 'phai co facebookPostId');
  });

  // TW6: fb_cancel → CANCELLED
  await test('TW6: fb_cancel hop le → draft CANCELLED', async () => {
    resetDb();
    setPath(dbData, 'webhookSigningSecret', WEBHOOK_SECRET);
    setPath(dbData, 'telegramConfig', { token: 'test_token', chatId: '555', approverIds: ['1', '123', '777'], approverMap: { '1': 'uid_tg', '123': 'uid_tg', '777': 'uid_tg' } });
    setPath(dbData, 'roles/uid_tg', 'admin');
    // Tạo draft ở PENDING_APPROVAL (RECEIVED → PROCESSING → PENDING_APPROVAL)
    const draft = await createDraft({
      pageId: 'page_tw6',
      caption: 'Test caption TW6',
      imageUrls: [],
      requestedBy: 'uid_tw6'
    });
    await updateStatus(draft.id, 'PROCESSING');
    await updateStatus(draft.id, 'PENDING_APPROVAL');

    const req = makeReq({
      body: {
        callback_query: {
          id: 'cq_tw6',
          data: 'fb_cancel:' + draft.id,
          from: { id: 123 },
          message: { chat: { id: 555 } }
        }
      },
      get: (h) => h === 'X-Telegram-Bot-Api-Secret-Token' ? WEBHOOK_SECRET : undefined
    });
    const res = makeRes();
    await handleTelegramWebhook(req, res);

    const updatedDraft = getPath(dbData, 'fbPostDrafts/' + draft.id);
    assert(res._body() && res._body().success === true, 'phai success, co: ' + JSON.stringify(res._body()));
    assert(updatedDraft && updatedDraft.status === 'CANCELLED', 'phai CANCELLED, co: ' + (updatedDraft && updatedDraft.status));
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n-------------------------------------------------------------');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed + '  TOTAL: ' + (passed + failed));
  if (failures.length > 0) {
    console.log('\nCHI TIET LOI:');
    failures.forEach(f => console.log('  x ' + f.name + '\n    ' + f.error));
  }
  if (failed > 0) {
    console.log('\nRESULT: FAIL');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASS -- tat ca ' + passed + ' test telegramWebhookRelay deu qua');
  }
})();
