/*
 * tests/realPublishHardening.test.js — Real Publish (BLOCKER FIXES: reconcile, fingerprint, hash ảnh, Page/token, state recovery) (Duyệt trên Telegram → đăng Fanpage) với Graph API MOCK.
 * Chạy: node tests/realPublish.test.js (từ functions/). KHÔNG mạng thật, KHÔNG Facebook thật, KHÔNG RTDB thật.
 * Mock KHÔNG chứng minh Facebook live hoạt động — chỉ chứng minh logic điều kiện/chống trùng của mã nguồn.
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
  if (path === 'telegramConfig') { const v = val && typeof val === 'object' ? Object.assign({}, val) : val; _setEnv('TELEGRAM_BOT_TOKEN', v && v.token); if (v && typeof v === 'object') { delete v.token; if (!('dryRun' in v)) v.dryRun = false; /* Phase 8: đăng thật phải bật TƯỜNG MINH (dryRun:false); mặc định an toàn được kiểm ở telegramFbPipeline.test.js */ } return _rawSetPath(obj, path, v); }
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
const realGraph = Object.assign({}, graph);
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
  setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'mock_tok', isMock: true });
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

const CB = (d, v) => 'fb_approve:' + d.id + ':' + (v || 1);
async function setLive(extra) { const c = getPath(dbData, 'telegramConfig'); setPath(dbData, 'telegramConfig', Object.assign({}, c, { token: 'tg', dryRun: false }, extra || {})); }
let notifications = [];
const _f = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.indexOf('https://api.telegram.org/') === 0 && opts && opts.body) { try { notifications.push(JSON.parse(opts.body)); } catch (e) { /* form */ } }
  return _f(url, opts);
};
function getPathCfg() { const c = Object.assign({}, getPath(dbData, 'telegramConfig')); c.token = process.env.TELEGRAM_BOT_TOKEN || 'tg'; return c; }
const defaultPublish = async (args) => { published.push(args); return { id: 'post_' + published.length }; };


// ── Hạ tầng test bổ sung ─────────────────────────────────────────────────────
// PHÂN LOẠI: toàn bộ file này = MOCK/IN-MEMORY (RTDB in-memory đồng bộ, fetch giả cho Telegram/Graph/ảnh). Không emulator, không API thật.
const crypto = require('crypto');
const sha = (buf) => crypto.createHash('sha256').update(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).digest('hex');
let imgBytes = {};               // url -> Buffer | null (404) | 'throw' (lỗi mạng)
let graphReqs = [];              // mọi request tới graph.facebook.com {method,url}
let feedHandler = null;          // (url, page) => { ok, status, body } cho GET published_posts
const baseFetch = global.fetch;
global.fetch = async (url, o) => {
  const u = String(url);
  if (Object.prototype.hasOwnProperty.call(imgBytes, u)) {
    const v = imgBytes[u];
    if (v === 'throw') throw new Error('net down');
    if (v === null) return { ok: false, status: 404, arrayBuffer: async () => Buffer.alloc(0) };
    return { ok: true, status: 200, arrayBuffer: async () => v };
  }
  if (u.indexOf('graph.facebook.com') >= 0) {
    graphReqs.push({ method: (o && o.method) || 'GET', url: u });
    if (u.indexOf('/published_posts') >= 0 && feedHandler) {
      const pg = Number((u.match(/[?&]pg=(\d+)/) || [])[1] || 1);
      const r = feedHandler(u, pg);
      if (r === 'throw') throw new Error('net down');
      return { ok: r.ok !== false, status: r.status || 200, json: async () => { if (r.badJson) throw new Error('bad'); return r.body; } };
    }
    throw new Error('graph không mong đợi: ' + u);
  }
  return baseFetch(url, o);
};
const origReset = reset;
reset = function () { origReset(); imgBytes = {}; graphReqs = []; feedHandler = null; };

const NOW = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const tgMsg = { chat: { id: 555 } };
const orch = require('../shared/contentOrchestrator');
const pageCfg = require('../shared/fbPageConfig');
function setRealToken(extra) { setPath(dbData, 'facebookActiveToken', Object.assign({ pageId: 'page1', accessToken: 'real', isMock: false }, extra || {})); }
// Draft kẹt PUBLISHING (hoặc trạng thái khác) với mốc thời gian điều khiển được
async function stuck(caption, opts) {
  opts = opts || {};
  const d = await store.createDraft({ pageId: opts.pageId || 'page1', caption, requestedBy: 'x' });
  await store.updateStatus(d.id, 'PROCESSING');
  await store.updateStatus(d.id, 'PENDING_APPROVAL', opts.images ? { publishImages: opts.images } : {});
  const rec = dbData.fbPostDrafts[d.id];
  rec.status = opts.status || 'PUBLISHING';
  if (opts.failStage) rec.failStage = opts.failStage;
  if (opts.startedAgoMs !== null) rec.publishStartedAt = opts.startedAt !== undefined ? opts.startedAt : NOW() - (opts.startedAgoMs || 10 * 60000);
  if (opts.approvedAgoMs !== undefined) rec.approvedAt = NOW() - opts.approvedAgoMs;
  if (opts.postId) rec.facebookPostId = opts.postId;
  return d;
}
const post = (id, message, ms, photos) => ({ id, message, created_time: iso(ms), attachments: photos === undefined ? undefined : { data: photos === 0 ? [] : [{ subattachments: { data: Array.from({ length: photos }, () => ({ media_type: 'photo' })) } }] } });
const recon = (d) => orch.handleReconcile(d.id, getPathCfg(), tgMsg);
const onlyGet = () => graphReqs.every((r) => r.method === 'GET');

// route tạo draft thật (đường gateway)
async function createViaRoute(body, auth) {
  const h = helpers(auth);
  const req = { method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body, get: () => null };
  await fbPublisher.handle(req, h.res, h);
  return h.res.get();
}

(async () => {
  // ───────────────────────── ƯU TIÊN 1 — RECONCILE FAIL-CLOSED ─────────────────────────
  console.log('\n[1] Reconcile fail-closed');
  await test('R1. 0 kết quả → giữ khoá (PUBLISHING), không PUBLISHED, không POST', async () => {
    const d = await stuck('Bài R1'); setRealToken();
    feedHandler = () => ({ body: { data: [] } });
    const r = await recon(d);
    eq(r.reason, 'not_found_on_page'); eq((await store.getDraft(d.id)).status, 'PUBLISHING'); assert(onlyGet(), 'chỉ GET'); eq(published.length, 0);
  });

  await test('R2. ĐÚNG 1 kết quả (Page + caption + số ảnh + trong cửa sổ) → PUBLISHED; chỉ GET', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R2', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [post('page1_900', 'Bài R2', started + 45000, 0)] } });
    const r = await recon(d);
    eq(r.reconciled, true); const a = await store.getDraft(d.id); eq(a.status, 'PUBLISHED'); eq(a.facebookPostId, 'page1_900'); assert(onlyGet(), 'chỉ GET'); eq(published.length, 0);
    const req = graphReqs[0].url; assert(req.indexOf('since=' + Math.floor((started - 120000) / 1000)) >= 0 && req.indexOf('until=' + Math.ceil((started + 15 * 60000) / 1000)) >= 0, 'cửa sổ since/until phải có trong request: ' + req);
  });

  await test('R3. 2 bài trùng caption trong cửa sổ → multiple_matches, giữ khoá', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R3', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [post('page1_1', 'Bài R3', started + 30000, 0), post('page1_2', 'Bài R3', started + 90000, 0)] } });
    const r = await recon(d); eq(r.reason, 'multiple_matches'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
  });

  await test('R4. Bài cũ NGOÀI cửa sổ (trước/sau) cùng caption → không khớp, giữ khoá', async () => {
    const started = NOW() - 40 * 60000; const d = await stuck('Bài R4', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [post('page1_old', 'Bài R4', started - 3600000, 0), post('page1_late', 'Bài R4', started + 16 * 60000, 0), post('page1_edge', 'Bài R4', started - 3 * 60000, 0)] } });
    const r = await recon(d); eq(r.reason, 'not_found_on_page'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
  });

  await test('R5a. Phân trang: bài khớp ở trang 2 vẫn được tìm thấy (theo paging.next, đủ danh sách)', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R5', { startedAt: started }); setRealToken();
    feedHandler = (u, pg) => pg === 1
      ? { body: { data: [post('page1_a', 'khác', started + 1000, 0)], paging: { next: 'https://graph.facebook.com/v25.0/page1/published_posts?pg=2' } } }
      : { body: { data: [post('page1_b', 'Bài R5', started + 5000, 0)] } };
    const r = await recon(d); eq(r.reconciled, true); eq((await store.getDraft(d.id)).facebookPostId, 'page1_b'); eq(graphReqs.length, 2);
  });
  await test('R5b. Phân trang: 1 khớp ở trang 1 + 1 khớp ở trang 2 → multiple_matches (không dừng sớm ở trang 1)', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R5b', { startedAt: started }); setRealToken();
    feedHandler = (u, pg) => pg === 1
      ? { body: { data: [post('page1_a', 'Bài R5b', started + 1000, 0)], paging: { next: 'https://graph.facebook.com/v25.0/page1/published_posts?pg=2' } } }
      : { body: { data: [post('page1_b', 'Bài R5b', started + 5000, 0)] } };
    const r = await recon(d); eq(r.reason, 'multiple_matches');
  });
  await test('R5c. Danh sách quá dài (vượt MAX_PAGES, còn next) → listing_incomplete, giữ khoá, kể cả khi đã thấy 1 khớp', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R5c', { startedAt: started }); setRealToken();
    feedHandler = (u, pg) => ({ body: { data: [post('page1_' + pg, pg === 1 ? 'Bài R5c' : 'x', started + 1000, 0)], paging: { next: 'https://graph.facebook.com/v25.0/page1/published_posts?pg=' + (pg + 1) } } });
    const r = await recon(d); eq(r.reason, 'listing_incomplete'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
  });
  await test('R5d. paging.next trỏ host lạ → lỗi, giữ khoá (không theo URL lạ)', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R5d', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [], paging: { next: 'https://evil.example.com/steal' } } });
    const r = await recon(d); eq(r.reason, 'graph_read_failed'); eq(graphReqs.length, 1);
  });

  await test('R6. Sai Page: bài có id của Page khác (cùng caption) → không khớp', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R6', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [post('pageOther_1', 'Bài R6', started + 30000, 0)] } });
    const r = await recon(d); eq(r.reason, 'not_found_on_page');
  });

  await test('R7. Số ảnh: draft 1 ảnh mà bài 0 ảnh → không khớp; bài 1 ảnh → khớp; draft 0 ảnh mà bài 2 ảnh → không khớp', async () => {
    const started = NOW() - 10 * 60000; setRealToken();
    const d1 = await stuck('Bài R7', { startedAt: started, images: ['https://i/1.jpg'] });
    feedHandler = () => ({ body: { data: [post('page1_x', 'Bài R7', started + 30000, 0)] } });
    eq((await recon(d1)).reason, 'not_found_on_page');
    feedHandler = () => ({ body: { data: [post('page1_x', 'Bài R7', started + 30000, 1)] } });
    // 1 ảnh đơn: attachments.data[0].media_type = photo
    feedHandler = () => ({ body: { data: [{ id: 'page1_x', message: 'Bài R7', created_time: iso(started + 30000), attachments: { data: [{ media_type: 'photo' }] } }] } });
    eq((await recon(d1)).reconciled, true);
    const d2 = await stuck('Bài R7b', { startedAt: started });
    feedHandler = () => ({ body: { data: [post('page1_y', 'Bài R7b', started + 30000, 2)] } });
    eq((await recon(d2)).reason, 'not_found_on_page');
  });

  await test('R8. Thiếu / không hợp lệ publishStartedAt → từ chối, KHÔNG gọi Graph', async () => {
    setRealToken(); feedHandler = () => ({ body: { data: [] } });
    const d1 = await stuck('Bài R8', { startedAgoMs: null });          // không có mốc
    eq((await recon(d1)).reason, 'missing_publish_started_at');
    const d2 = await stuck('Bài R8b', { startedAt: 0 });
    eq((await recon(d2)).reason, 'missing_publish_started_at');
    const d3 = await stuck('Bài R8c', { startedAt: NOW() + 3600000 });  // tương lai
    eq((await recon(d3)).reason, 'missing_publish_started_at');
    const d4 = await stuck('Bài R8d', { startedAt: 'abc' });
    eq((await recon(d4)).reason, 'missing_publish_started_at');
    eq(graphReqs.length, 0, 'không được gọi Graph khi thiếu mốc'); for (const d of [d1, d2, d3, d4]) eq((await store.getDraft(d.id)).status, 'PUBLISHING');
  });

  await test('R9. GET lỗi (mạng / HTTP 500 / JSON hỏng / không phải danh sách) → giữ khoá, không PUBLISHED', async () => {
    const started = NOW() - 10 * 60000; setRealToken();
    for (const h of ['throw', { ok: false, status: 500, body: { error: { message: 'down' } } }, { badJson: true }, { body: { error: { message: 'x' } } }]) {
      const d = await stuck('Bài R9', { startedAt: started }); feedHandler = () => h;
      eq((await recon(d)).reason, 'graph_read_failed'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
    }
    assert(onlyGet(), 'chỉ GET'); eq(published.length, 0);
  });

  await test('R10. Hai lệnh /reconcile ĐỒNG THỜI → đúng 1 lần chốt PUBLISHED, không POST', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R10', { startedAt: started }); setRealToken();
    feedHandler = () => ({ body: { data: [post('page1_c', 'Bài R10', started + 30000, 0)] } });
    const rs = await Promise.all([recon(d), recon(d)]);
    eq(rs.filter((r) => r.reconciled).length, 1, 'đúng 1 lần chốt'); const a = await store.getDraft(d.id); eq(a.status, 'PUBLISHED'); eq(a.facebookPostId, 'page1_c'); assert(onlyGet(), 'chỉ GET'); eq(published.length, 0);
  });

  await test('R11. Có draft khác cùng Page+caption cũng PUBLISHING trong cùng cửa sổ → competing_drafts, giữ khoá', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R11', { startedAt: started }); await stuck('Bài R11', { startedAt: started + 60000 }); setRealToken();
    feedHandler = () => ({ body: { data: [post('page1_d', 'Bài R11', started + 30000, 0)] } });
    eq((await recon(d)).reason, 'competing_drafts'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
  });

  await test('R12. Bài tìm thấy đã là Post ID của draft khác → post_already_claimed', async () => {
    const started = NOW() - 10 * 60000; const d = await stuck('Bài R12', { startedAt: started }); setRealToken();
    const other = await stuck('Khác hẳn', { startedAt: started, status: 'PUBLISHED', postId: 'page1_e' });
    feedHandler = () => ({ body: { data: [post('page1_e', 'Bài R12', started + 30000, 0)] } });
    eq((await recon(d)).reason, 'post_already_claimed'); eq((await store.getDraft(d.id)).status, 'PUBLISHING'); void other;
  });

  await test('R13. Draft đã lưu Post ID (do chính hệ thống ghi) → chốt PUBLISHED, KHÔNG gọi Graph', async () => {
    const d = await stuck('Bài R13', { postId: 'page1_f' }); setRealToken();
    eq((await recon(d)).reconciled, true); eq(graphReqs.length, 0); eq((await store.getDraft(d.id)).status, 'PUBLISHED');
  });

  await test('R14. FAILED/publish_unknown + đúng 1 khớp → PUBLISHED; không khớp → vẫn FAILED/publish_unknown (khoá /retry)', async () => {
    const started = NOW() - 10 * 60000; setRealToken();
    const d = await stuck('Bài R14', { startedAt: started, status: 'FAILED', failStage: 'publish_unknown' });
    feedHandler = () => ({ body: { data: [] } });
    eq((await recon(d)).reason, 'not_found_on_page'); const a = await store.getDraft(d.id); eq(a.status, 'FAILED'); eq(a.failStage, 'publish_unknown');
    eq((await store.retryFailedPublish(d.id)).reason, 'publish_outcome_unknown');
    feedHandler = () => ({ body: { data: [post('page1_g', 'Bài R14', started + 30000, 0)] } });
    eq((await recon(d)).reconciled, true); eq((await store.getDraft(d.id)).status, 'PUBLISHED');
  });

  await test('R15. Không có token thật (mock / thiếu) → no_token, không gọi Graph', async () => {
    const d = await stuck('Bài R15'); // reset(): token mock
    eq((await recon(d)).reason, 'no_token'); eq(graphReqs.length, 0);
  });

  // ───────────────────────── ƯU TIÊN 2 — FINGERPRINT FAIL-CLOSED ─────────────────────────
  console.log('\n[2] Fingerprint fail-closed');
  await test('F1. Đăng thật + draft THIẾU fingerprint → từ chối, không đăng; KHÔNG tự tạo fingerprint', async () => {
    const d = await pendingDraft('F1'); await setLive(); delete dbData.fbPostDrafts[d.id].contentFingerprint;
    const r = await callback(CB(d), OK_CQ);
    eq(r.data.data.reason, 'fingerprint_missing'); eq(published.length, 0); const a = await store.getDraft(d.id); eq(a.status, 'PENDING_APPROVAL'); assert(!('contentFingerprint' in a), 'không được tự tạo fingerprint');
  });
  await test('F2. field null → fingerprint_missing; sai kiểu/sai định dạng (số, "abc", object, mảng) → content_mismatch; không đăng', async () => {
    await setLive();
    let d = await pendingDraft('F2'); dbData.fbPostDrafts[d.id].contentFingerprint = null;
    eq((await callback(CB(d), OK_CQ)).data.data.reason, 'fingerprint_missing');
    for (const bad of [12345, 'abc', {}, [], true, 'G'.repeat(64)]) {
      d = await pendingDraft('F2'); dbData.fbPostDrafts[d.id].contentFingerprint = bad;
      eq((await callback(CB(d), OK_CQ)).data.data.reason, 'content_mismatch', 'giá trị ' + JSON.stringify(bad));
    }
    eq(published.length, 0);
  });
  await test('F3. Fingerprint hợp lệ nhưng của NỘI DUNG KHÁC / nội dung bị sửa / hash ảnh bị sửa → content_mismatch', async () => {
    await setLive();
    let d = await pendingDraft('F3'); const other = await pendingDraft('Khác');
    dbData.fbPostDrafts[d.id].contentFingerprint = dbData.fbPostDrafts[other.id].contentFingerprint;
    eq((await callback(CB(d), OK_CQ)).data.data.reason, 'content_mismatch');
    d = await pendingDraft('F3b'); dbData.fbPostDrafts[d.id].aiCaption = 'bị sửa'; eq((await callback(CB(d), OK_CQ)).data.data.reason, 'content_mismatch');
    const url = 'https://img.test/f3.jpg'; imgBytes[url] = Buffer.from('A');
    d = await store.createDraft({ pageId: 'page1', caption: 'F3c', requestedBy: 'x' }); await store.updateStatus(d.id, 'PROCESSING');
    await store.updateStatus(d.id, 'PENDING_APPROVAL', { publishImages: [url], publishImageHashes: [{ url, sha256: sha('A') }] });
    dbData.fbPostDrafts[d.id].publishImageHashes[0].sha256 = sha('B');
    eq((await callback(CB(d), OK_CQ)).data.data.reason, 'content_mismatch'); eq(published.length, 0);
  });
  await test('F4. Đăng thật + có ảnh nhưng KHÔNG có publishImageHashes → image_hash_missing', async () => {
    await setLive(); const url = 'https://img.test/f4.jpg';
    const d = await store.createDraft({ pageId: 'page1', caption: 'F4', requestedBy: 'x' }); await store.updateStatus(d.id, 'PROCESSING'); await store.updateStatus(d.id, 'PENDING_APPROVAL', { publishImages: [url] });
    eq((await callback(CB(d), OK_CQ)).data.data.reason, 'image_hash_missing'); eq(published.length, 0);
  });
  await test('F5. Chỉnh sửa draft CŨ không có fingerprint không tạo fingerprint; retry cũng không tạo', async () => {
    const d = await pendingDraft('F5'); delete dbData.fbPostDrafts[d.id].contentFingerprint;
    await edit(d.id, { caption: 'F5 sửa' }); assert(!('contentFingerprint' in dbData.fbPostDrafts[d.id]), 'edit không được tạo fingerprint');
    dbData.fbPostDrafts[d.id].status = 'FAILED'; dbData.fbPostDrafts[d.id].failStage = 'publish';
    eq((await store.retryFailedPublish(d.id)).committed, true); assert(!('contentFingerprint' in dbData.fbPostDrafts[d.id]), 'retry không được tạo fingerprint');
  });
  await test('F6. Dry-run: draft thiếu fingerprint vẫn xử lý được (không POST); mismatch vẫn bị từ chối', async () => {
    const d = await pendingDraft('F6'); dbData.telegramConfig.dryRun = true; delete dbData.fbPostDrafts[d.id].contentFingerprint;
    eq((await callback(CB(d), OK_CQ)).data.data.dryRun, true);
    const e = await pendingDraft('F6b'); dbData.fbPostDrafts[e.id].caption = 'đổi'; dbData.fbPostDrafts[e.id].aiCaption = 'đổi';
    eq((await callback(CB(e), OK_CQ)).data.data.reason, 'content_mismatch'); eq(published.length, 0);
  });

  // ───────────────────────── ƯU TIÊN 3 — HASH FILE ẢNH ─────────────────────────
  console.log('\n[3] Hash byte ảnh');
  await test('I1. Lúc tạo bản xem trước: hash = SHA256 BYTE ảnh (không phải URL), lưu cùng draft, nằm trong fingerprint', async () => {
    const url = 'https://img.test/i1.jpg'; imgBytes[url] = Buffer.from('BYTES-I1');
    const r = await createViaRoute({ pageId: 'page1', caption: 'I1', imageUrls: [url] });
    const d = await store.getDraft(r.data.data.draftId);
    eq(d.publishImageHashes.length, 1); eq(d.publishImageHashes[0].url, url); eq(d.publishImageHashes[0].sha256, sha('BYTES-I1')); assert(d.publishImageHashes[0].sha256 !== sha(url), 'không phải hash URL');
    const fp1 = d.contentFingerprint; imgBytes[url] = Buffer.from('BYTES-I1-CHANGED');
    const r2 = await createViaRoute({ pageId: 'page1', caption: 'I1', imageUrls: [url] }); const d2 = await store.getDraft(r2.data.data.draftId);
    assert(d2.contentFingerprint !== fp1, 'cùng URL/caption nhưng byte khác ⇒ fingerprint khác');
  });
  await test('I2. Ảnh bị THAY byte (cùng URL) sau xem trước → trước upload phát hiện: KHÔNG upload, KHÔNG đăng, FAILED(image_integrity)', async () => {
    const url = 'https://img.test/i2.jpg'; imgBytes[url] = Buffer.from('ORIGINAL');
    const r = await createViaRoute({ pageId: 'page1', caption: 'I2', imageUrls: [url] }); const id = r.data.data.draftId;
    await setLive(); setRealToken(); notifications = [];
    let ups = 0; graph.uploadPhoto = async () => { ups++; return { id: 'p' }; }; graph.getPageInfo = async () => ({ id: 'page1', name: 'P' });
    imgBytes[url] = Buffer.from('TAMPERED');
    const res = await callback('fb_approve:' + id + ':1', OK_CQ);
    eq(res.data.data.reason, 'image_changed'); eq(ups, 0); eq(published.length, 0); const a = await store.getDraft(id); eq(a.status, 'FAILED'); eq(a.failStage, 'image_integrity');
    eq((await store.retryFailedPublish(id)).committed, false, 'image_integrity không retry được');
    assert(notifications.some((n) => /THAY ĐỔI/.test(n.text || '')), 'báo Telegram');
    graph.uploadPhoto = async () => ({ id: 'photo1' }); graph.getPageInfo = realGraph.getPageInfo;
  });
  await test('I3. Lỗi tải ảnh lúc kiểm (404 / mạng) KHÔNG làm bỏ qua kiểm tra: không đăng; FAILED(publish) cho phép /retry khi ảnh truy cập lại được', async () => {
    for (const bad of [null, 'throw']) {
      reset(); const url = 'https://img.test/i3.jpg'; imgBytes[url] = Buffer.from('OK');
      const r = await createViaRoute({ pageId: 'page1', caption: 'I3', imageUrls: [url] }); const id = r.data.data.draftId;
      await setLive(); setRealToken(); graph.getPageInfo = async () => ({ id: 'page1', name: 'P' });
      imgBytes[url] = bad;
      const res = await callback('fb_approve:' + id + ':1', OK_CQ);
      eq(res.data.data.reason, 'image_unreadable'); eq(published.length, 0); const a = await store.getDraft(id); eq(a.status, 'FAILED'); eq(a.failStage, 'publish');
      imgBytes[url] = Buffer.from('OK'); eq((await store.retryFailedPublish(id)).committed, true);
      const v2 = (await store.getDraft(id)).version; await callback('fb_approve:' + id + ':' + v2, OK_CQ);
      eq(published.length, 1, 'sau khi ảnh truy cập lại: đăng đúng 1 lần'); graph.getPageInfo = realGraph.getPageInfo;
    }
  });
  await test('I4. Lúc tạo xem trước không tải được ảnh → KHÔNG tạo bản duyệt được (draft FAILED, không có nút Duyệt)', async () => {
    const url = 'https://img.test/i4.jpg'; imgBytes[url] = null; telegramCalls = [];
    const r = await createViaRoute({ pageId: 'page1', caption: 'I4', imageUrls: [url] });
    eq(r.data.success, false); const all = Object.keys(dbData.fbPostDrafts || {}).map((k) => dbData.fbPostDrafts[k]);
    eq(all.length, 1); eq(all[0].status, 'FAILED'); eq(all[0].failStage, 'preview'); eq(telegramCalls.length, 0, 'không gửi xem trước');
  });
  await test('I5. Ảnh nguyên vẹn + Page thật → upload & đăng đúng 1 lần, ảnh đính kèm', async () => {
    const url = 'https://img.test/i5.jpg'; imgBytes[url] = Buffer.from('GOOD');
    const r = await createViaRoute({ pageId: 'page1', caption: 'I5', imageUrls: [url] }); const id = r.data.data.draftId;
    await setLive(); setRealToken(); graph.getPageInfo = async () => ({ id: 'page1', name: 'P' }); const ups = []; graph.uploadPhoto = async (a) => { ups.push(a); return { id: 'ph5' }; };
    await callback('fb_approve:' + id + ':1', OK_CQ);
    eq(ups.length, 1); eq(ups[0].imageUrl, url); eq(published.length, 1); eq((await store.getDraft(id)).status, 'PUBLISHED');
    graph.uploadPhoto = async () => ({ id: 'photo1' }); graph.getPageInfo = realGraph.getPageInfo;
  });
  await test('I6. Sửa ảnh qua route edits → hash + fingerprint tính lại; duyệt bản mới đăng được; ảnh sửa không tải được → không sửa', async () => {
    const a1 = 'https://img.test/i6a.jpg', a2 = 'https://img.test/i6b.jpg'; imgBytes[a1] = Buffer.from('A1'); imgBytes[a2] = Buffer.from('A2');
    const r = await createViaRoute({ pageId: 'page1', caption: 'I6', imageUrls: [a1] }); const id = r.data.data.draftId; const fp1 = (await store.getDraft(id)).contentFingerprint;
    imgBytes['https://img.test/i6bad.jpg'] = null;
    const bad = await edit(id, { imageUrls: ['https://img.test/i6bad.jpg'] }); eq(bad.data.success, false); eq((await store.getDraft(id)).version, 1);
    const ok = await edit(id, { imageUrls: [a2] }); eq(ok.data.success, true);
    const d = await store.getDraft(id); eq(d.version, 2); eq(d.publishImageHashes[0].sha256, sha('A2')); assert(d.contentFingerprint !== fp1, 'fingerprint phải đổi');
    await setLive(); setRealToken(); graph.getPageInfo = async () => ({ id: 'page1', name: 'P' });
    await callback('fb_approve:' + id + ':2', OK_CQ); eq(published.length, 1); graph.getPageInfo = realGraph.getPageInfo;
  });

  // ───────────────────────── ƯU TIÊN 4 — PAGE VÀ TOKEN ─────────────────────────
  console.log('\n[4] Page & token');
  await test('P1. Tạo draft qua route cho Page KHÔNG được phép → PERMISSION_DENIED, không tạo draft', async () => {
    setPath(dbData, 'facebookPageTokens/uid1/pageX', { accessToken: 'tx', isMock: true }); // có token (pending, super_admin) nhưng không phải Page đang chọn
    setPath(dbData, 'superAdmins/uid1', { role: 'super_admin' });
    const r = await createViaRoute({ pageId: 'pageX', caption: 'P1' });
    eq(r.data.error.code, 'PERMISSION_DENIED'); eq(dbData.fbPostDrafts, undefined);
    setPath(dbData, 'telegramConfig/allowedPageIds', ['pageX']);
    const ok = await createViaRoute({ pageId: 'pageX', caption: 'P1' }); eq(ok.data.success, true, 'allowedPageIds cho phép');
  });
  await test('P2. Draft KHÔNG phải source=telegram: Page đổi giữa preview và duyệt → page_not_active, không đăng', async () => {
    const r = await createViaRoute({ pageId: 'page1', caption: 'P2' }); const id = r.data.data.draftId;
    await setLive(); setPath(dbData, 'facebookActiveToken', { pageId: 'page2', accessToken: 't', isMock: true });
    const res = await callback('fb_approve:' + id + ':1', OK_CQ);
    eq(res.data.data.reason, 'page_not_active'); eq(published.length, 0); eq((await store.getDraft(id)).status, 'FAILED');
  });
  await test('P3. getPageTokenForPublish: ràng buộc uid & không lấy "token đầu tiên"', async () => {
    dbData.facebookActiveToken = undefined; delete dbData.facebookActiveToken;
    setPath(dbData, 'facebookPageTokens/uidRandom/pgA', { accessToken: 'T_random' });
    eq(await pageCfg.getPageTokenForPublish('pgA'), null, 'uid không phải super_admin ⇒ null');
    setPath(dbData, 'superAdmins/uidS1', { role: 'super_admin' }); setPath(dbData, 'superAdmins/uidS2', { role: 'super_admin' });
    setPath(dbData, 'facebookPageTokens/uidS1/pgA', { accessToken: 'T1' });
    eq((await pageCfg.getPageTokenForPublish('pgA')).accessToken, 'T1');
    setPath(dbData, 'facebookPageTokens/uidS2/pgA', { accessToken: 'T2' });
    eq(await pageCfg.getPageTokenForPublish('pgA'), null, 'hai token khác nhau ⇒ mơ hồ ⇒ null');
    setPath(dbData, 'facebookPageTokens/uidS2/pgA', { accessToken: 'T1' });
    eq((await pageCfg.getPageTokenForPublish('pgA')).accessToken, 'T1', 'cùng token ⇒ không mơ hồ');
    setPath(dbData, 'facebookActiveToken', { pageId: 'pgA', accessToken: 'T_ACTIVE', isMock: false });
    const t = await pageCfg.getPageTokenForPublish('pgA'); eq(t.accessToken, 'T_ACTIVE'); eq(t.source, 'active');
    setPath(dbData, 'facebookConnection', { status: 'not_connected' }); eq(await pageCfg.getPageTokenForPublish('pgA'), null);
    for (const bad of ['../x', 'a/b', '']) { setPath(dbData, 'facebookPageTokens/' + 'ok' + '/pgB', { accessToken: 'z' }); eq(await pageCfg.getPageTokenForPublish(bad), null); }
  });
  await test('P4. Khi đăng: token dùng là token của facebookActiveToken (không phải token cũ của uid khác)', async () => {
    const d = await pendingDraft('P4'); await setLive(); setRealToken({ accessToken: 'ACTIVE_TOK' });
    setPath(dbData, 'superAdmins/uidOld', { role: 'super_admin' }); setPath(dbData, 'facebookPageTokens/uidOld/page1', { accessToken: 'STALE_TOK' });
    graph.getPageInfo = async () => ({ id: 'page1', name: 'P' });
    await callback(CB(d), OK_CQ); eq(published.length, 1); eq(published[0].pageAccessToken, 'ACTIVE_TOK'); graph.getPageInfo = realGraph.getPageInfo;
  });

  // ───────────────────────── ƯU TIÊN 5 — STATE RECOVERY ─────────────────────────
  console.log('\n[5] State recovery');
  await test('S1. Kẹt APPROVED (quá 2 phút, chưa từng POST) → /reconcile đưa về FAILED(publish) → /retry mở lại; không POST', async () => {
    const d = await pendingDraft('S1'); const rec = dbData.fbPostDrafts[d.id]; rec.status = 'APPROVED'; rec.approvedAt = NOW() - 10 * 60000;
    const r = await recon(d); eq(r.recovered, true); const a = await store.getDraft(d.id); eq(a.status, 'FAILED'); eq(a.failStage, 'publish'); eq(published.length, 0); eq(graphReqs.length, 0);
    const rt = await store.retryFailedPublish(d.id); eq(rt.committed, true); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });
  await test('S2. APPROVED không mở khoá khi: còn mới / có publishStartedAt / có Post ID / thiếu approvedAt', async () => {
    const mk = async (patch) => { const d = await pendingDraft('S2'); Object.assign(dbData.fbPostDrafts[d.id], { status: 'APPROVED', approvedAt: NOW() - 10 * 60000 }, patch); return d; };
    eq((await recon(await mk({ approvedAt: NOW() - 30000 }))).reason, 'too_recent');
    eq((await recon(await mk({ publishStartedAt: NOW() - 600000 }))).reason, 'has_publish_traces');
    eq((await recon(await mk({ facebookPostId: 'p_1' }))).reason, 'has_publish_traces');
    eq((await recon(await mk({ publishRecordFailed: true }))).reason, 'has_publish_traces');
    eq((await recon(await mk({ approvedAt: undefined }))).reason, 'approved_time_unknown');
    eq((await recon(await mk({ approvedAt: 'x' }))).reason, 'approved_time_unknown');
  });
  await test('S3. markPublishing ⟂ recoverStuckApproved: không thể cùng thành công trên 1 draft', async () => {
    const d = await pendingDraft('S3'); const rec = dbData.fbPostDrafts[d.id]; rec.status = 'APPROVED'; rec.approvedAt = NOW() - 10 * 60000;
    const [a, b] = await Promise.all([store.markPublishing(d.id), store.recoverStuckApproved(d.id)]);
    eq([a.committed, b.committed].filter(Boolean).length, 1, 'đúng một bên thắng');
    const st = (await store.getDraft(d.id)).status; assert(st === 'PUBLISHING' || st === 'FAILED', st);
  });
  await test('S4. markPublishing không chiếm được trạng thái ⇒ route KHÔNG gọi Facebook', async () => {
    const d = await pendingDraft('S4'); await setLive(); const orig = store.markPublishing; store.markPublishing = async () => ({ committed: false, reason: 'not_approved' });
    try { await callback(CB(d), OK_CQ); } finally { store.markPublishing = orig; }
    eq(published.length, 0); eq(graphReqs.length, 0);
  });
  await test('S5. Lần ghi PUBLISHED đầu ĐÃ thành công nhưng ném lỗi → không báo sai "chưa ghi nhận"; PUBLISHED, không cờ publishRecordFailed', async () => {
    const d = await pendingDraft('S5'); await setLive(); notifications = [];
    const orig = store.updateStatus; let n = 0;
    store.updateStatus = async (id, st, ex) => { const r = await orig(id, st, ex); if (st === 'PUBLISHED' && ++n === 1) throw new Error('ack lost'); return r; };
    let res; try { res = await callback(CB(d), OK_CQ); } finally { store.updateStatus = orig; }
    const a = await store.getDraft(d.id); eq(a.status, 'PUBLISHED'); eq(a.facebookPostId, 'post_1'); assert(!a.publishRecordFailed, 'không được đặt cờ lỗi ghi');
    eq(published.length, 1); eq(res.data.data.recorded, undefined); assert(!notifications.some((x) => /không ghi nhận/.test(x.text || '')), 'không được báo sai'); eq(n, 1, 'không ghi lại lần 2');
  });
  await test('S6. Ghi PUBLISHED thật sự lỗi cả 3 lần → vẫn báo đúng + lưu Post ID; không POST lần 2 (hành vi cũ giữ nguyên)', async () => {
    const d = await pendingDraft('S6'); await setLive(); notifications = [];
    const orig = store.updateStatus; store.updateStatus = async (id, st, ex) => { if (st === 'PUBLISHED') throw new Error('down'); return orig(id, st, ex); };
    try { await callback(CB(d), OK_CQ); } finally { store.updateStatus = orig; }
    const a = await store.getDraft(d.id); eq(a.status, 'PUBLISHING'); eq(a.publishRecordFailed, true); eq(a.facebookPostId, 'post_1'); eq(published.length, 1);
    assert(notifications.some((x) => /không ghi nhận/.test(x.text || '')), 'báo đúng');
  });

  console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' pass, ' + failed + ' fail');
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
