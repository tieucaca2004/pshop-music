/*
 * tests/founderRecovery.test.js — FOUNDER RECOVERY: /confirm_posted & /confirm_not_posted (draft kẹt PUBLISHING / FAILED(publish_unknown)) với Graph API MOCK.
 * Chạy: node tests/founderRecovery.test.js (từ functions/). KHÔNG mạng thật, KHÔNG Facebook thật, KHÔNG RTDB thật.
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

// ── Hạ tầng riêng của founderRecovery ────────────────────────────────────────
// GET /v25.0/<postId>?fields=id,message,created_time,from{id} (lệnh /confirm_posted) — nguồn: postById. Mọi POST tới Graph đều bị tripwire.
let postById = {};
const prevFetchRec = global.fetch;
global.fetch = async (url, o) => {
  const u = String(url);
  const m = u.match(/graph\.facebook\.com\/v25\.0\/([^/?]+)\?fields=id%2Cmessage%2Ccreated_time/);
  if (m) {
    graphReqs.push({ method: (o && o.method) || 'GET', url: u });
    const r = postById[decodeURIComponent(m[1])];
    if (r === 'throw') throw new Error('net down');
    if (!r) return { ok: false, status: 400, json: async () => ({ error: { message: 'Unsupported get request' } }) };
    return { ok: true, status: 200, json: async () => r };
  }
  return prevFetchRec(url, o);
};
const resetRec = reset;
reset = function () { resetRec(); postById = {}; notifications = []; };

const SUPER = { ok: true, uid: 'uid_super', role: 'super_admin' };
const ADMIN = { ok: true, uid: 'uid_tg', role: 'admin' };
const recMsg = { chat: { id: 555 }, from: { id: 888 } };
const MIN = 60000;
const cpost = (d, postId, actor) => orch.handleConfirmPosted(d.id, postId, getPathCfg(), recMsg, actor === undefined ? SUPER : actor);
const cnot = (d, actor) => orch.handleConfirmNotPosted(d.id, getPathCfg(), recMsg, actor === undefined ? SUPER : actor, { getPageInfo: async () => ({ id: 'page1', name: 'P' }) });
const raw = (d) => dbData.fbPostDrafts[d.id];
const audits = (d) => Object.values(raw(d).recoveryAudit || {});
const okPost = (d, id, extra) => Object.assign({ id, message: raw(d).caption, created_time: iso(raw(d).publishStartedAt + 30000), from: { id: 'page1' } }, extra || {});
// Fanpage mock cho /confirm_not_posted: probe (limit=1, không since) trả 1 bài bất kỳ; cửa sổ (có since) trả windowPosts
function fanpage(windowPosts, opts) {
  opts = opts || {};
  feedHandler = (u, pg) => {
    if (opts.throwAll) return 'throw';
    if (u.indexOf('since=') < 0) return { body: { data: opts.probeEmpty ? [] : [{ id: 'page1_old' }] } };
    if (opts.endless) return { body: { data: [], paging: { next: 'https://graph.facebook.com/v25.0/page1/published_posts?pg=' + (pg + 1) + '&since=1' } } };
    return { body: { data: windowPosts || [] } };
  };
}
const noGraph = () => eq(graphReqs.length, 0, 'KHÔNG được gọi Graph');
const noPost = () => { eq(published.length, 0, 'không publishToFeed'); assert(graphReqs.every((r) => r.method === 'GET'), 'chỉ GET'); };
const lastTg = () => notifications.map((n) => n.text || '').join('\n');

(async () => {
  console.log('\n[A] /confirm_posted — Founder xác nhận bài ĐÃ đăng (Post ID phải được Facebook xác minh)');
  await test('A1. PUBLISHING + Post ID hợp lệ → Facebook xác minh → PUBLISHED, có URL, audit đủ trường, chỉ GET', async () => {
    setRealToken(); const d = await stuck('Bài A1'); const id = 'page1_111'; postById[id] = okPost(d, id);
    const r = await cpost(d, id); eq(r.recovered, true);
    const a = raw(d); eq(a.status, 'PUBLISHED'); eq(a.facebookPostId, id); eq(a.failStage, null); eq(a.manualRecovery.action, 'confirm_posted');
    const au = audits(d); eq(au.length, 1); eq(au[0].action, 'confirm_posted'); eq(au[0].result, 'confirmed'); eq(au[0].byUid, 'uid_super'); eq(au[0].byTelegramId, '888');
    eq(au[0].pageId, 'page1'); eq(au[0].postId, id); eq(au[0].from, 'PUBLISHING'); assert(typeof au[0].at === 'number', 'thời điểm'); eq(au[0].evidence.graphVerified, true);
    assert(/facebook\.com\/page1_111/.test(lastTg()), 'báo URL'); noPost();
    eq((await store.retryFailedPublish(d.id)).committed, false, 'sau PUBLISHED không retry được');
  });
  await test('A2. FAILED(publish_unknown) + Post ID hợp lệ → PUBLISHED', async () => {
    setRealToken(); const d = await stuck('Bài A2', { status: 'FAILED', failStage: 'publish_unknown' }); const id = 'page1_222'; postById[id] = okPost(d, id);
    eq((await cpost(d, id)).recovered, true); eq(raw(d).status, 'PUBLISHED'); eq(audits(d)[0].from, 'FAILED/publish_unknown');
  });
  await test('A3. admin thường (không phải super_admin) → TỪ CHỐI, không gọi Graph, trạng thái nguyên, có audit denied', async () => {
    setRealToken(); const d = await stuck('Bài A3'); const id = 'page1_333'; postById[id] = okPost(d, id);
    const r = await cpost(d, id, ADMIN); eq(r.reason, 'not_super_admin'); eq(raw(d).status, 'PUBLISHING'); assert(!raw(d).facebookPostId, 'chưa có Post ID'); noGraph();
    eq(audits(d).length, 1); eq(audits(d)[0].result, 'denied:not_super_admin'); eq(audits(d)[0].byUid, 'uid_tg');
  });
  await test('A4. actor rỗng / role editor / role gần giống "super_admin " → từ chối', async () => {
    setRealToken(); const d = await stuck('Bài A4'); const id = 'page1_444'; postById[id] = okPost(d, id);
    for (const a of [null, {}, { ok: true, uid: 'u', role: 'editor' }, { ok: true, uid: 'u', role: 'super_admin ' }, { ok: true, uid: 'u', role: 'SUPER_ADMIN' }]) {
      eq((await cpost(d, id, a)).reason, 'not_super_admin');
    }
    eq(raw(d).status, 'PUBLISHING'); noGraph();
  });
  await test('A5. Post ID thuộc Page khác (tiền tố) → page_mismatch, KHÔNG gọi Graph', async () => {
    setRealToken(); const d = await stuck('Bài A5'); postById['page2_555'] = okPost(d, 'page2_555');
    eq((await cpost(d, 'page2_555')).reason, 'page_mismatch'); eq(raw(d).status, 'PUBLISHING'); noGraph();
  });
  await test('A6. Post ID giả (Facebook không có bài) → graph_read_failed, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài A6');
    eq((await cpost(d, 'page1_999999')).reason, 'graph_read_failed'); eq(raw(d).status, 'PUBLISHING'); assert(!raw(d).facebookPostId, 'chưa có Post ID');
  });
  await test('A7. Lỗi mạng khi xác minh → graph_read_failed, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài A7'); postById['page1_777'] = 'throw';
    eq((await cpost(d, 'page1_777')).reason, 'graph_read_failed'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A8. Facebook trả id KHÁC id đã nhập → post_id_mismatch', async () => {
    setRealToken(); const d = await stuck('Bài A8'); postById['page1_888'] = okPost(d, 'page1_889');
    eq((await cpost(d, 'page1_888')).reason, 'post_id_mismatch'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A9. from.id là Page khác (tiền tố khớp nhưng tác giả khác) → page_mismatch', async () => {
    setRealToken(); const d = await stuck('Bài A9'); postById['page1_901'] = okPost(d, 'page1_901', { from: { id: 'page2' } });
    eq((await cpost(d, 'page1_901')).reason, 'page_mismatch'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A10. Bài CŨ của cùng Page (tạo trước/sau cửa sổ) → outside_window, không chốt', async () => {
    setRealToken(); const d = await stuck('Bài A10'); const s = raw(d).publishStartedAt;
    postById['page1_1001'] = okPost(d, 'page1_1001', { created_time: iso(s - 60 * MIN) });
    postById['page1_1002'] = okPost(d, 'page1_1002', { created_time: iso(s + 16 * MIN) });
    postById['page1_1003'] = okPost(d, 'page1_1003', { created_time: 'không-phải-ngày' });
    for (const id of ['page1_1001', 'page1_1002', 'page1_1003']) eq((await cpost(d, id)).reason, 'outside_window', id);
    eq(raw(d).status, 'PUBLISHING');
  });
  await test('A11. Nội dung bài khác bản nháp → content_mismatch', async () => {
    setRealToken(); const d = await stuck('Bài A11'); postById['page1_1101'] = okPost(d, 'page1_1101', { message: 'Một bài hoàn toàn khác' });
    eq((await cpost(d, 'page1_1101')).reason, 'content_mismatch'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A12. Post ID đã thuộc bản nháp KHÁC → post_already_claimed (trước khi gọi Graph)', async () => {
    setRealToken(); const o = await stuck('Bài A12 khác', { status: 'PUBLISHED' }); raw(o).facebookPostId = 'page1_1201';
    const d = await stuck('Bài A12'); postById['page1_1201'] = okPost(d, 'page1_1201');
    eq((await cpost(d, 'page1_1201')).reason, 'post_already_claimed'); eq(raw(d).status, 'PUBLISHING'); noGraph();
  });
  await test('A13. Draft KHÔNG ở diện kẹt (PENDING/APPROVED/PUBLISHED/FAILED(publish)/CANCELLED) → not_recoverable, không gọi Graph', async () => {
    setRealToken();
    for (const [st, fs] of [['PENDING_APPROVAL'], ['APPROVED'], ['PUBLISHED'], ['FAILED', 'publish'], ['FAILED', 'image_integrity'], ['CANCELLED']]) {
      const d = await stuck('Bài A13 ' + st + (fs || ''), { status: st, failStage: fs }); postById['page1_1301'] = okPost(d, 'page1_1301');
      eq((await cpost(d, 'page1_1301')).reason, 'not_recoverable', st + '/' + fs); eq(raw(d).status, st);
    }
    noGraph();
  });
  await test('A14. Có bản nháp khác cùng Page+caption đang kẹt trong cùng cửa sổ → competing_drafts', async () => {
    setRealToken(); const d = await stuck('Bài A14 giống'); await stuck('Bài A14 giống'); postById['page1_1401'] = okPost(d, 'page1_1401');
    eq((await cpost(d, 'page1_1401')).reason, 'competing_drafts'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A15. Draft đã lưu Post ID khác → post_id_conflict', async () => {
    setRealToken(); const d = await stuck('Bài A15', { postId: 'page1_1500' }); postById['page1_1501'] = okPost(d, 'page1_1501');
    eq((await cpost(d, 'page1_1501')).reason, 'post_id_conflict'); eq(raw(d).facebookPostId, 'page1_1500');
  });
  await test('A16. Không có token thật (mock) → no_token, không gọi Graph', async () => {
    const d = await stuck('Bài A16'); postById['page1_1601'] = okPost(d, 'page1_1601');
    eq((await cpost(d, 'page1_1601')).reason, 'no_token'); noGraph();
    setPath(dbData, 'facebookActiveToken', null); eq((await cpost(d, 'page1_1601')).reason, 'no_token');
  });
  await test('A17. Post ID sai định dạng (rỗng số, nhiều "_", ký tự lạ, đường dẫn) → bad_post_id, không gọi Graph', async () => {
    setRealToken(); const d = await stuck('Bài A17');
    for (const id of ['abc', 'page1_', '_1', 'page1_1_2', '../me', 'page1_1?fields=x', '1_a', 'page1_ 1']) eq((await cpost(d, id)).reason, 'bad_post_id', id);
    noGraph(); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A18. Thiếu publishStartedAt → missing_publish_started_at (không đủ cơ sở), không gọi Graph', async () => {
    setRealToken(); const d = await stuck('Bài A18'); postById['page1_1801'] = okPost(d, 'page1_1801'); delete raw(d).publishStartedAt;
    eq((await cpost(d, 'page1_1801')).reason, 'missing_publish_started_at'); noGraph(); eq(raw(d).status, 'PUBLISHING');
  });
  await test('A19. 6 lệnh /confirm_posted ĐỒNG THỜI (mock) → đúng 1 thắng, 1 audit confirmed, Post ID không đổi', async () => {
    setRealToken(); const d = await stuck('Bài A19'); postById['page1_1901'] = okPost(d, 'page1_1901');
    const rs = await Promise.all(Array.from({ length: 6 }, () => cpost(d, 'page1_1901')));
    eq(rs.filter((r) => r.recovered).length, 1, 'đúng 1 thắng'); eq(raw(d).status, 'PUBLISHED'); eq(raw(d).facebookPostId, 'page1_1901');
    eq(audits(d).filter((x) => x.result === 'confirmed').length, 1, 'đúng 1 audit confirmed'); noPost();
  });
  await test('A20. Lặp lại sau khi đã PUBLISHED (callback/lệnh gửi lại) → not_recoverable, không đổi gì', async () => {
    setRealToken(); const d = await stuck('Bài A20'); postById['page1_2001'] = okPost(d, 'page1_2001');
    eq((await cpost(d, 'page1_2001')).recovered, true); const before = JSON.stringify(Object.assign({}, raw(d), { recoveryAudit: null }));
    eq((await cpost(d, 'page1_2001')).reason, 'not_recoverable'); eq(JSON.stringify(Object.assign({}, raw(d), { recoveryAudit: null })), before);
  });
  await test('A21. Store độc lập: confirmPostedTransaction từ chối Post ID Page khác / sai định dạng dù caller bỏ qua kiểm tra', async () => {
    const d = await stuck('Bài A21');
    eq((await store.confirmPostedTransaction(d.id, { postId: 'page2_5', actor: {} })).reason, 'page_mismatch');
    eq((await store.confirmPostedTransaction(d.id, { postId: 'page1_x', actor: {} })).reason, 'page_mismatch');
    eq(raw(d).status, 'PUBLISHING');
  });

  console.log('\n[B] /confirm_not_posted — chỉ mở retry khi CHỨNG MINH được chưa đăng');
  await test('B1. ≥ 45 phút, token đọc được Page, cửa sổ rỗng → FAILED(publish); /retry → PENDING_APPROVAL v2; KHÔNG tự đăng; audit đủ', async () => {
    setRealToken(); const d = await stuck('Bài B1', { startedAgoMs: 60 * MIN }); fanpage([]);
    const r = await cnot(d); eq(r.unlocked, true);
    const a = raw(d); eq(a.status, 'FAILED'); eq(a.failStage, 'publish'); eq(a.manualRecovery.action, 'confirm_not_posted'); assert(!a.facebookPostId, 'chưa có Post ID');
    const au = audits(d); eq(au.length, 1); eq(au[0].result, 'unlocked_for_retry'); eq(au[0].byUid, 'uid_super'); eq(au[0].byTelegramId, '888'); eq(au[0].pageId, 'page1');
    eq(au[0].evidence.windowEmpty, true); eq(au[0].evidence.readProven, true); noPost();
    const rt = await store.retryFailedPublish(d.id); eq(rt.committed, true); eq(raw(d).status, 'PENDING_APPROVAL'); eq(raw(d).version, 2); noPost();
  });
  await test('B2. FAILED(publish_unknown) cũng được xử lý như PUBLISHING', async () => {
    setRealToken(); const d = await stuck('Bài B2', { status: 'FAILED', failStage: 'publish_unknown', startedAgoMs: 90 * MIN }); fanpage([]);
    eq((await cnot(d)).unlocked, true); eq(raw(d).failStage, 'publish');
  });
  await test('B3. admin thường → từ chối, không gọi Graph, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài B3', { startedAgoMs: 60 * MIN }); fanpage([]);
    eq((await cnot(d, ADMIN)).reason, 'not_super_admin'); noGraph(); eq(raw(d).status, 'PUBLISHING'); eq(audits(d)[0].result, 'denied:not_super_admin');
  });
  await test('B4. Chưa đủ 45 phút (20 phút / 44 phút) → too_recent, không gọi Graph, vẫn khoá', async () => {
    setRealToken(); fanpage([]);
    for (const m of [2, 20, 44]) { const d = await stuck('Bài B4 ' + m, { startedAgoMs: m * MIN }); eq((await cnot(d)).reason, 'too_recent', m + ' phút'); eq(raw(d).status, 'PUBLISHING'); }
    noGraph();
  });
  await test('B5. Có bài trong cửa sổ (kể cả khác caption) → posts_in_window, vẫn khoá, hướng dẫn /confirm_posted', async () => {
    setRealToken(); const d = await stuck('Bài B5', { startedAgoMs: 60 * MIN }); const s = raw(d).publishStartedAt; fanpage([post('page1_77', 'Bài khác', s + MIN, 0)]);
    eq((await cnot(d)).reason, 'posts_in_window'); eq(raw(d).status, 'PUBLISHING'); assert(/confirm_posted/.test(lastTg()), 'hướng dẫn'); noPost();
  });
  await test('B6. Page không trả bài nào khi thăm dò (không chứng minh token đọc được) → read_not_proven, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài B6', { startedAgoMs: 60 * MIN }); fanpage([], { probeEmpty: true });
    eq((await cnot(d)).reason, 'read_not_proven'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('B7. Graph lỗi / phản hồi hỏng → graph_read_failed, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài B7', { startedAgoMs: 60 * MIN }); fanpage([], { throwAll: true });
    eq((await cnot(d)).reason, 'graph_read_failed'); eq(raw(d).status, 'PUBLISHING');
    feedHandler = () => ({ ok: false, status: 500, body: { error: { message: 'x' } } }); eq((await cnot(d)).reason, 'graph_read_failed');
  });
  await test('B8. Danh sách không quét hết (quá MAX_PAGES) → listing_incomplete, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài B8', { startedAgoMs: 60 * MIN }); fanpage([], { endless: true });
    eq((await cnot(d)).reason, 'listing_incomplete'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('B9. getPageInfo lỗi (token thuộc Page khác / hết hạn) → graph_read_failed, vẫn khoá', async () => {
    setRealToken(); const d = await stuck('Bài B9', { startedAgoMs: 60 * MIN }); fanpage([]);
    const r = await orch.handleConfirmNotPosted(d.id, getPathCfg(), recMsg, SUPER, { getPageInfo: async () => { throw new Error('Token thuộc Page khác (page2).'); } });
    eq(r.reason, 'graph_read_failed'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('B10. Đã có Post ID → has_post_id (phải dùng /confirm_posted), không mở retry', async () => {
    setRealToken(); const d = await stuck('Bài B10', { startedAgoMs: 60 * MIN, postId: 'page1_5' }); fanpage([]);
    eq((await cnot(d)).reason, 'has_post_id'); eq(raw(d).status, 'PUBLISHING'); noGraph();
  });
  await test('B11. Thiếu publishStartedAt / mốc ở tương lai → missing_publish_started_at', async () => {
    setRealToken(); fanpage([]);
    const d = await stuck('Bài B11', { startedAgoMs: 60 * MIN }); delete raw(d).publishStartedAt; eq((await cnot(d)).reason, 'missing_publish_started_at');
    const e = await stuck('Bài B11b', { startedAt: NOW() + 10 * MIN }); eq((await cnot(e)).reason, 'missing_publish_started_at'); noGraph();
  });
  await test('B12. Token mock / thiếu → no_token', async () => {
    const d = await stuck('Bài B12', { startedAgoMs: 60 * MIN }); fanpage([]); eq((await cnot(d)).reason, 'no_token'); noGraph();
  });
  await test('B13. Draft ở trạng thái khác (PENDING/APPROVED/PUBLISHED/FAILED(publish)) → not_recoverable', async () => {
    setRealToken(); fanpage([]);
    for (const [st, fs] of [['PENDING_APPROVAL'], ['APPROVED'], ['PUBLISHED'], ['FAILED', 'publish']]) { const d = await stuck('Bài B13 ' + st + (fs || ''), { status: st, failStage: fs, startedAgoMs: 60 * MIN }); eq((await cnot(d)).reason, 'not_recoverable', st); eq(raw(d).status, st); }
    noGraph();
  });
  await test('B14. Store độc lập: ép tuổi tối thiểu 45 phút dù caller truyền minAgeMs=0; ép no Post ID', async () => {
    const d = await stuck('Bài B14', { startedAgoMs: 10 * MIN }); eq((await store.confirmNotPostedTransaction(d.id, { minAgeMs: 0, actor: {} })).reason, 'too_recent');
    const e = await stuck('Bài B14b', { startedAgoMs: 90 * MIN, postId: 'page1_9' }); eq((await store.confirmNotPostedTransaction(e.id, { actor: {} })).reason, 'has_post_id');
    eq(raw(d).status, 'PUBLISHING'); eq(raw(e).status, 'PUBLISHING');
  });
  await test('B15. Sau khi mở khoá: Duyệt (callback) trên FAILED(publish) KHÔNG đăng; chỉ /retry → Duyệt lại mới đăng (Approval Gate nguyên vẹn)', async () => {
    setRealToken(); await setLive(); const d = await stuck('Bài B15', { startedAgoMs: 60 * MIN }); fanpage([]);
    eq((await cnot(d)).unlocked, true);
    await callback(CB(d, 1), OK_CQ); eq(published.length, 0, 'callback Duyệt không đăng khi chưa /retry'); eq(raw(d).status, 'FAILED');
    eq((await store.retryFailedPublish(d.id)).committed, true); eq(raw(d).status, 'PENDING_APPROVAL'); eq(published.length, 0, '/retry không tự đăng');
  });
  await test('B16. 5 lệnh /confirm_not_posted ĐỒNG THỜI → đúng 1 mở khoá, đúng 1 audit unlocked_for_retry', async () => {
    setRealToken(); const d = await stuck('Bài B16', { startedAgoMs: 60 * MIN }); fanpage([]);
    const rs = await Promise.all(Array.from({ length: 5 }, () => cnot(d)));
    eq(rs.filter((r) => r.unlocked).length, 1); eq(audits(d).filter((x) => x.result === 'unlocked_for_retry').length, 1); eq(raw(d).status, 'FAILED'); eq(raw(d).failStage, 'publish');
  });
  await test('B17. /confirm_posted và /confirm_not_posted ĐỒNG THỜI trên cùng draft → đúng một kết quả nhất quán', async () => {
    setRealToken(); const d = await stuck('Bài B17', { startedAgoMs: 60 * MIN }); fanpage([]); postById['page1_1700'] = okPost(d, 'page1_1700');
    await Promise.all([cpost(d, 'page1_1700'), cnot(d)]);
    const a = raw(d); assert((a.status === 'PUBLISHED' && a.facebookPostId === 'page1_1700') || (a.status === 'FAILED' && a.failStage === 'publish' && !a.facebookPostId), 'trạng thái nhất quán: ' + a.status);
    eq(audits(d).filter((x) => x.result === 'confirmed' || x.result === 'unlocked_for_retry').length, 1, 'đúng 1 đường thắng');
  });

  console.log('\n[C] Đường Telegram thật (handleTelegramMessage): phân quyền + cú pháp');
  const upd = (text, fromId, n) => ({ update_id: n || 1, message: { message_id: n || 1, date: Math.floor(Date.now() / 1000), from: { id: fromId }, chat: { id: 555 }, text } });
  function seedTg() {
    setPath(dbData, 'telegramConfig', { token: 'tg', chatId: '555', approverIds: ['777', '888'], approverMap: { '777': 'uid_tg', '888': 'uid_super' }, dryRun: true });
    setPath(dbData, 'superAdmins/uid_super', { role: 'super_admin' }); setPath(dbData, 'roles/uid_tg', 'admin');
  }
  await test('C1. Qua Telegram: admin thường (777) bị từ chối; super_admin (888) thành công', async () => {
    seedTg(); setRealToken(); const d = await stuck('Bài C1'); postById['page1_3001'] = okPost(d, 'page1_3001');
    const r1 = await orch.handleTelegramMessage(upd('/confirm_posted ' + d.id + ' page1_3001', 777, 1), { tgConfig: getPathCfg() });
    eq(r1.reason, 'not_super_admin'); eq(raw(d).status, 'PUBLISHING');
    const r2 = await orch.handleTelegramMessage(upd('/confirm_posted ' + d.id + ' page1_3001', 888, 2), { tgConfig: getPathCfg() });
    eq(r2.recovered, true); eq(raw(d).status, 'PUBLISHED'); eq(audits(d).find((x) => x.result === 'confirmed').byUid, 'uid_super');
  });
  await test('C2. Qua Telegram: người ngoài approverIds / chat lạ không dùng được', async () => {
    seedTg(); setRealToken(); const d = await stuck('Bài C2'); postById['page1_3002'] = okPost(d, 'page1_3002');
    const r1 = await orch.handleTelegramMessage(upd('/confirm_posted ' + d.id + ' page1_3002', 999, 1), { tgConfig: getPathCfg() });
    assert(r1.skipped, 'bị bỏ qua'); eq(raw(d).status, 'PUBLISHING'); noGraph();
    const u = upd('/confirm_posted ' + d.id + ' page1_3002', 888, 2); u.message.chat.id = 1;
    const r2 = await orch.handleTelegramMessage(u, { tgConfig: getPathCfg() }); assert(r2.skipped, 'chat lạ'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('C3. Thiếu tham số → hướng dẫn cú pháp, không đổi gì; /confirm_not_posted qua Telegram hoạt động', async () => {
    seedTg(); setRealToken(); const r = await orch.handleTelegramMessage(upd('/confirm_posted', 888, 1), { tgConfig: getPathCfg() }); eq(r.reason, 'recovery_usage');
    const d = await stuck('Bài C3', { startedAgoMs: 60 * MIN }); fanpage([]);
    const r2 = await orch.handleTelegramMessage(upd('/confirm_not_posted ' + d.id, 888, 2), { tgConfig: getPathCfg() }, { getPageInfo: async () => ({ id: 'page1' }) });
    // getPageInfo thật bị tripwire (graph GET không mong đợi) ⇒ phải bị từ chối an toàn, KHÔNG mở khoá
    eq(r2.reason, 'graph_read_failed'); eq(raw(d).status, 'PUBLISHING');
  });
  await test('C4. Không có dấu vết bí mật: audit & tin nhắn không chứa token', async () => {
    setRealToken({ accessToken: 'SECRET_PAGE_TOKEN_XYZ' }); const d = await stuck('Bài C4'); postById['page1_4001'] = okPost(d, 'page1_4001');
    await cpost(d, 'page1_4001'); await cpost(d, 'page1_4001', ADMIN);
    assert(JSON.stringify(raw(d)).indexOf('SECRET_PAGE_TOKEN_XYZ') < 0, 'draft'); assert(lastTg().indexOf('SECRET_PAGE_TOKEN_XYZ') < 0, 'telegram');
  });

  console.log('\n[D] Claim Post ID nguyên tử (fbPostIdClaims) — MOCK in-memory; tranh chấp transaction thật ở founderRecovery.emulator.test.js');
  const claimOf = (id) => (dbData.fbPostIdClaims || {})[id] || null;
  const A_ = { uid: 'uid_super', telegramId: '888' };
  const cwc = (d, postId) => store.confirmPostedWithClaim(d.id, { postId, actor: A_ });
  await test('D1. Hai draft KHÁC NHAU cùng xác nhận 1 Post ID đồng thời → đúng 1 draft PUBLISHED; draft kia vẫn khoá; claim thuộc người thắng', async () => {
    const x = await stuck('Bài D1a'); const y = await stuck('Bài D1b');
    const [rx, ry] = await Promise.all([cwc(x, 'page1_5001'), cwc(y, 'page1_5001')]);
    eq([rx, ry].filter((r) => r.committed).length, 1, 'đúng 1 thắng');
    const w = rx.committed ? x : y; const l = rx.committed ? y : x;
    eq(raw(w).status, 'PUBLISHED'); eq(raw(w).facebookPostId, 'page1_5001'); eq(raw(l).status, 'PUBLISHING'); assert(!raw(l).facebookPostId, 'người thua không có Post ID');
    eq(claimOf('page1_5001').draftId, w.id); eq(Object.values(dbData.fbPostDrafts).filter((d) => d.facebookPostId === 'page1_5001').length, 1);
    const again = await cwc(l, 'page1_5001'); eq(again.committed, false); eq(claimOf('page1_5001').draftId, w.id, 'không ghi đè claim của draft khác');
    assert(['post_already_claimed', 'claim_in_progress'].includes(again.reason), again.reason);
  });
  await test('D2. Hai Post ID KHÁC NHAU cho hai draft khác nhau (đồng thời) → cả hai thành công, mỗi claim thuộc đúng draft', async () => {
    const x = await stuck('Bài D2a'); const y = await stuck('Bài D2b');
    const [rx, ry] = await Promise.all([cwc(x, 'page1_6001'), cwc(y, 'page1_6002')]);
    eq(rx.committed && ry.committed, true); eq(claimOf('page1_6001').draftId, x.id); eq(claimOf('page1_6002').draftId, y.id);
  });
  await test('D3. Chốt draft thất bại ⇒ claim được GIẢI PHÓNG (không kẹt); ném lỗi ⇒ giải phóng và ném lại; sau đó chốt lại được', async () => {
    const d = await stuck('Bài D3', { status: 'PENDING_APPROVAL' });
    const r = await cwc(d, 'page1_7001'); eq(r.committed, false); eq(r.reason, 'not_recoverable'); eq(claimOf('page1_7001'), null, 'không để lại claim');
    let thrown = null; try { await store.withPostIdClaim(d.id, 'page1_7002', A_, async () => { throw new Error('boom'); }); } catch (e) { thrown = e; }
    assert(thrown && thrown.message === 'boom', 'ném lại lỗi'); eq(claimOf('page1_7002'), null, 'giải phóng khi ném lỗi');
    raw(d).status = 'PUBLISHING'; eq((await cwc(d, 'page1_7001')).committed, true); eq(claimOf('page1_7001').draftId, d.id);
  });
  await test('D4. Draft ĐÃ PUBLISHED: xác nhận lại → not_recoverable, claim của chính nó được giữ nguyên; draft khác bị từ chối', async () => {
    const d = await stuck('Bài D4'); eq((await cwc(d, 'page1_8001')).committed, true); const c0 = JSON.stringify(claimOf('page1_8001'));
    eq((await cwc(d, 'page1_8001')).reason, 'not_recoverable'); eq(JSON.stringify(claimOf('page1_8001')), c0, 'claim không đổi');
    const o = await stuck('Bài D4 khác'); eq((await cwc(o, 'page1_8001')).reason, 'post_already_claimed'); eq(raw(o).status, 'PUBLISHING'); eq(claimOf('page1_8001').draftId, d.id);
  });
  await test('D5. Claim tồn tại nhưng draft CHƯA hoàn tất: chủ chạy lại → hoàn tất; draft khác trong 5 phút bị chặn; sau 5 phút (claim kẹt) được tiếp quản', async () => {
    const owner = await stuck('Bài D5a'); const other = await stuck('Bài D5b');
    setPath(dbData, 'fbPostIdClaims/page1_9001', { draftId: owner.id, at: NOW() - MIN, byUid: 'uid_super' }); // sập giữa claim và chốt draft
    const blocked = await cwc(other, 'page1_9001'); eq(blocked.reason, 'claim_in_progress'); eq(claimOf('page1_9001').draftId, owner.id); eq(raw(other).status, 'PUBLISHING');
    eq((await cwc(owner, 'page1_9001')).committed, true, 'chủ nhận lại claim (idempotent) và hoàn tất'); eq(raw(owner).status, 'PUBLISHED');
    const o2 = await stuck('Bài D5c'); const t2 = await stuck('Bài D5d');
    setPath(dbData, 'fbPostIdClaims/page1_9002', { draftId: o2.id, at: NOW() - 10 * MIN, byUid: 'uid_super' });
    const tk = await cwc(t2, 'page1_9002'); eq(tk.committed, true); eq(claimOf('page1_9002').draftId, t2.id); eq(claimOf('page1_9002').tookOverFrom, o2.id); eq(raw(o2).status, 'PUBLISHING');
    const o3 = await stuck('Bài D5e'); const t3 = await stuck('Bài D5f'); eq((await cwc(o3, 'page1_9003')).committed, true);
    dbData.fbPostIdClaims.page1_9003.at = NOW() - 60 * MIN; eq((await cwc(t3, 'page1_9003')).reason, 'post_already_claimed'); eq(claimOf('page1_9003').draftId, o3.id);
  });
  await test('D6. Draft cũ (đã có facebookPostId, KHÔNG có claim) → draft khác bị từ chối và KHÔNG để lại claim; claim hỏng → fail-closed', async () => {
    const legacy = await stuck('Bài D6 cũ', { status: 'PUBLISHED', postId: 'page1_9101' }); const d = await stuck('Bài D6');
    eq((await cwc(d, 'page1_9101')).reason, 'post_already_claimed'); eq(claimOf('page1_9101'), null); assert(legacy, 'legacy');
    for (const bad of [true, 'x', { at: 1 }, { draftId: 5 }]) {
      setPath(dbData, 'fbPostIdClaims/page1_9102', bad); eq((await cwc(d, 'page1_9102')).reason, 'claim_corrupt', JSON.stringify(bad)); eq(raw(d).status, 'PUBLISHING');
    }
  });
  await test('D7. /reconcile cũng đi qua claim: chốt thành công tạo claim; claim của draft khác chặn chốt', async () => {
    setRealToken(); const d = await stuck('Bài D7'); const s = raw(d).publishStartedAt;
    feedHandler = () => ({ body: { data: [post('page1_a71', 'Bài D7', s + 1000, 0)] } });
    const r = await recon(d); eq(r.reconciled, true); eq(raw(d).status, 'PUBLISHED'); eq(claimOf('page1_a71').draftId, d.id);
    const e = await stuck('Bài D7b'); const s2 = raw(e).publishStartedAt; setPath(dbData, 'fbPostIdClaims/page1_a72', { draftId: d.id, at: NOW(), byUid: 'x' });
    feedHandler = () => ({ body: { data: [post('page1_a72', 'Bài D7b', s2 + 1000, 0)] } });
    const r2 = await recon(e); assert(!r2.reconciled, 'bị chặn'); eq(raw(e).status, 'PUBLISHING'); eq(claimOf('page1_a72').draftId, d.id);
  });
  await test('D8. Qua lệnh Telegram /confirm_posted: claim được tạo và gắn đúng draft; lệnh lặp không đổi claim', async () => {
    setRealToken(); const d = await stuck('Bài D8'); postById['page1_9201'] = okPost(d, 'page1_9201');
    eq((await cpost(d, 'page1_9201')).recovered, true); const c0 = JSON.stringify(claimOf('page1_9201')); eq(claimOf('page1_9201').draftId, d.id);
    eq((await cpost(d, 'page1_9201')).reason, 'not_recoverable'); eq(JSON.stringify(claimOf('page1_9201')), c0);
  });

  console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' pass, ' + failed + ' fail');
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
