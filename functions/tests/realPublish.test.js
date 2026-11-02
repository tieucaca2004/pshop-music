/*
 * tests/realPublish.test.js — Real Publish (Duyệt trên Telegram → đăng Fanpage) với Graph API MOCK.
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

(async () => {
  console.log('\n[Real Publish]');
  await test('A. Duyệt hợp lệ ở chế độ đăng thật → Graph publishToFeed gọi ĐÚNG 1 lần, PUBLISHED, có Post ID', async () => {
    const d = await pendingDraft('Bài A');
    await setLive();
    const r = await callback(CB(d), OK_CQ);
    eq(published.length, 1, 'số lần publish'); eq(published[0].message, 'Bài A'); eq(published[0].pageId, 'page1');
    const after = await store.getDraft(d.id); eq(after.status, 'PUBLISHED'); eq(after.facebookPostId, 'post_1'); assert(after.publishedAt > 0, 'publishedAt');
    eq(r.data.data.facebookPostId, 'post_1');
  });

  await test('A2. Ảnh được upload lên đúng Fanpage rồi đính vào bài (publishImages)', async () => {
    const d = await store.createDraft({ pageId: 'page1', caption: 'Có ảnh', requestedBy: 'x' });
    await store.updateStatus(d.id, 'PROCESSING'); await store.updateStatus(d.id, 'PENDING_APPROVAL', { publishImages: ['https://img/x.jpg'], publishImageHashes: [{ url: 'https://img/x.jpg', sha256: 'a'.repeat(64) }] }); // page mock: kiem hash anh bo qua (khong co anh that len Facebook); hash bat buoc o che do dang that
    await setLive();
    const ups = []; graph.uploadPhoto = async (a) => { ups.push(a); return { id: 'ph9' }; };
    await callback(CB(d), OK_CQ);
    eq(ups.length, 1); eq(ups[0].pageId, 'page1'); eq(ups[0].imageUrl, 'https://img/x.jpg');
    eq(JSON.stringify(published[0].attachedMedia), JSON.stringify([{ media_fbid: 'ph9' }]));
    graph.uploadPhoto = async () => ({ id: 'photo1' });
  });

  for (const bad of [true, undefined, null, 'false', 0, 1, 'true']) {
    await test('B. dryRun=' + JSON.stringify(bad) + ' → KHÔNG Graph POST, KHÔNG upload; draft dryRun', async () => {
      const d = await pendingDraft('Bài B');
      const n = Object.assign({}, getPath(dbData, 'telegramConfig')); if (bad === undefined) delete n.dryRun; else n.dryRun = bad;
      dbData.telegramConfig = n;
      let uploads = 0; graph.uploadPhoto = async () => { uploads++; return { id: 'p' }; };
      const r = await callback(CB(d), OK_CQ);
      eq(published.length, 0, 'Graph publish'); eq(uploads, 0, 'upload');
      const after = await store.getDraft(d.id); eq(after.dryRun, true); eq(after.facebookPostId, null);
      eq(r.data.data.dryRun, true);
      graph.uploadPhoto = async () => ({ id: 'photo1' });
    });
  }

  await test('B2. dryRun=true + fetch thật: không có request nào tới graph.facebook.com (tripwire)', async () => {
    const d = await pendingDraft('B2'); dbData.telegramConfig.dryRun = true;
    graph.publishToFeed = realGraph.publishToFeed; graph.uploadPhoto = realGraph.uploadPhoto; graph.getPageInfo = realGraph.getPageInfo;
    setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'real', isMock: false });
    const prev = global.fetch; let graphHits = 0;
    global.fetch = async (u, o) => { if (String(u).indexOf('graph.facebook.com') >= 0) { graphHits++; throw new Error('graph hit'); } return prev(u, o); };
    await callback(CB(d), OK_CQ);
    global.fetch = prev; eq(graphHits, 0, 'graph hits');
    graph.publishToFeed = defaultPublish; graph.uploadPhoto = async () => ({ id: 'photo1' });
  });

  await test('C. Approver không hợp lệ → từ chối, không đăng', async () => {
    const d = await pendingDraft(); await setLive();
    await callback(CB(d), { from: { id: 999 }, message: { chat: { id: 555 } } });
    eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });

  await test('C2. Approver nằm trong approverIds nhưng không có ánh xạ uid PSH → từ chối', async () => {
    const d = await pendingDraft(); await setLive({ approverIds: ['777', '888'] });
    await callback(CB(d), { from: { id: 888 }, message: { chat: { id: 555 } } });
    eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });

  await test('D. Sai chat ID → từ chối', async () => {
    const d = await pendingDraft(); await setLive();
    await callback(CB(d), { from: { id: 777 }, message: { chat: { id: 4242 } } });
    eq(published.length, 0); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });

  await test('E. Draft không tồn tại → từ chối', async () => {
    await setLive();
    const r = await callback('fb_approve:khongco:1', OK_CQ);
    eq(published.length, 0); eq(r.data.success, false);
  });

  await test('F. Draft đã xử lý (PUBLISHED / CANCELLED / FAILED) → từ chối, không đăng lại', async () => {
    await setLive();
    const d1 = await pendingDraft('F1'); await callback(CB(d1), OK_CQ); eq(published.length, 1);
    await callback(CB(d1), OK_CQ); eq(published.length, 1, 'PUBLISHED không đăng lại');
    const d2 = await pendingDraft('F2'); await callback('fb_cancel:' + d2.id, OK_CQ);
    await callback(CB(d2), OK_CQ); eq(published.length, 1, 'CANCELLED không đăng');
    const d3 = await pendingDraft('F3'); dbData.fbPostDrafts[d3.id].status = 'FAILED';
    await callback(CB(d3), OK_CQ); eq(published.length, 1, 'FAILED không đăng');
  });

  await test('G. Version lệch → từ chối, không đăng', async () => {
    const d = await pendingDraft('G'); await setLive();
    await edit(d.id, { caption: 'Sửa' });
    await callback(CB(d, 1), OK_CQ); eq(published.length, 0);
    await callback(CB(d, 2), OK_CQ); eq(published.length, 1); eq(published[0].message, 'Sửa');
  });

  await test('H. Page ID thay đổi giữa preview và duyệt → từ chối (draft Telegram), không đăng', async () => {
    const d = await store.createDraft({ pageId: 'page1', caption: 'H', requestedBy: 'x', extra: { source: 'telegram' } });
    await store.updateStatus(d.id, 'PROCESSING'); await store.updateStatus(d.id, 'PENDING_APPROVAL');
    await setLive(); setPath(dbData, 'facebookActiveToken', { pageId: 'page2', accessToken: 't' });
    const r = await callback(CB(d), OK_CQ);
    eq(published.length, 0); eq(r.data.data.reason, 'page_not_active'); eq((await store.getDraft(d.id)).status, 'FAILED');
  });

  await test('H2. Page ID trong draft bị đổi sau preview (fingerprint) → từ chối, không đăng', async () => {
    const d = await pendingDraft('H2'); await setLive();
    dbData.fbPostDrafts[d.id].pageId = 'pageEvil'; setPath(dbData, 'facebookPageTokens/uid1/pageEvil', { accessToken: 'x', isMock: true });
    const r = await callback(CB(d), OK_CQ);
    eq(published.length, 0); eq(r.data.data.reason, 'content_mismatch'); eq((await store.getDraft(d.id)).status, 'PENDING_APPROVAL');
  });

  await test('H3. Caption / ảnh bị đổi trực tiếp sau preview (không qua version) → từ chối', async () => {
    const d = await pendingDraft('Gốc'); await setLive();
    dbData.fbPostDrafts[d.id].caption = 'Bị sửa lén';
    let r = await callback(CB(d), OK_CQ); eq(r.data.data.reason, 'content_mismatch'); eq(published.length, 0);
    const d2 = await store.createDraft({ pageId: 'page1', caption: 'c', requestedBy: 'x' });
    await store.updateStatus(d2.id, 'PROCESSING'); await store.updateStatus(d2.id, 'PENDING_APPROVAL', { publishImages: ['https://a/1.jpg'] });
    dbData.fbPostDrafts[d2.id].publishImages = ['https://evil/2.jpg'];
    r = await callback(CB(d2), OK_CQ); eq(r.data.data.reason, 'content_mismatch'); eq(published.length, 0);
  });

  await test('H4. (đổi hành vi) Draft cũ KHÔNG có fingerprint: chế độ đăng thật TỪ CHỐI (fail-closed); chi tiết ở realPublishHardening.test.js', async () => {
    const d = await pendingDraft('Cũ'); await setLive(); delete dbData.fbPostDrafts[d.id].contentFingerprint;
    const r = await callback(CB(d), OK_CQ); eq(published.length, 0); eq(r.data.data.reason, 'fingerprint_missing');
  });

  await test('H5. Page token hết hạn (live, không mock) → dừng TRƯỚC khi gọi Facebook', async () => {
    const d = await pendingDraft('Hết hạn'); await setLive();
    setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'real', isMock: false, expiresAt: Date.now() - 1000 });
    const r = await callback(CB(d), OK_CQ);
    eq(published.length, 0); eq(r.data.data.reason, 'token_expired'); eq((await store.getDraft(d.id)).failStage, 'publish');
  });

  await test('I. Ba callback Duyệt đồng thời → chỉ 1 lần publish', async () => {
    const d = await pendingDraft('I'); await setLive();
    await Promise.all([callback(CB(d), OK_CQ), callback(CB(d), OK_CQ), callback(CB(d), OK_CQ)]);
    eq(published.length, 1); eq((await store.getDraft(d.id)).status, 'PUBLISHED');
  });

  await test('J. Graph trả lỗi rõ ràng → KHÔNG PUBLISHED; FAILED(publish); báo nguyên nhân; không tự đăng lại', async () => {
    const d = await pendingDraft('J'); await setLive(); notifications = [];
    let calls = 0; graph.publishToFeed = async () => { calls++; throw new Error('(#200) Permissions error'); };
    await callback(CB(d), OK_CQ);
    const a = await store.getDraft(d.id); eq(a.status, 'FAILED'); eq(a.failStage, 'publish'); eq(a.facebookPostId, null); assert(/Permissions error/.test(a.failReason), 'failReason');
    eq(calls, 1, 'không tự retry'); assert(notifications.some(n => /Permissions error/.test(n.text || '')), 'Telegram báo nguyên nhân');
    graph.publishToFeed = defaultPublish;
  });

  await test('K. Graph TIMEOUT (publishToFeed thật, guard) → ambiguous, đúng 1 POST, khoá retry, không đăng lại', async () => {
    const d = await pendingDraft('K'); await setLive(); notifications = [];
    setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'real', isMock: false });
    graph.publishToFeed = realGraph.publishToFeed; graph.getPageInfo = async () => ({ id: 'page1', name: 'P' });
    let posts = 0; const prevFetch = global.fetch;
    global.fetch = async (url, o) => { if (String(url).indexOf('graph.facebook.com') >= 0) { if (o && o.method === 'POST') posts++; const e = new Error('aborted'); e.name = 'AbortError'; throw e; } return prevFetch(url, o); };
    await callback(CB(d), OK_CQ);
    eq(posts, 1, 'POST feed đúng 1 lần'); const a = await store.getDraft(d.id);
    eq(a.status, 'FAILED'); eq(a.failStage, 'publish_unknown');
    assert(notifications.some(n => /KHÔNG RÕ/.test(n.text || '')), 'báo không rõ kết quả');
    await callback(CB(d), OK_CQ); eq(posts, 1, 'duyệt lại không POST');
    const rt = await store.retryFailedPublish(d.id); eq(rt.committed, false); eq(rt.reason, 'publish_outcome_unknown');
    global.fetch = prevFetch; graph.publishToFeed = defaultPublish; graph.getPageInfo = realGraph.getPageInfo;
  });

  await test('K2. HTTP 5xx / Graph code 1,2 / 2xx không có id → ambiguous; 4xx rõ ràng → KHÔNG ambiguous', async () => {
    const prevFetch = global.fetch;
    for (const resp of [{ status: 500, ok: false, body: { error: { code: 2, message: 'x' } } }, { status: 400, ok: false, body: { error: { code: 1, message: 'u' } } }, { status: 200, ok: true, body: {} }]) {
      global.fetch = async () => ({ ok: resp.ok, status: resp.status, json: async () => resp.body });
      let err = null; try { await realGraph.publishToFeed({ guard: true, pageId: 'p', message: 'm', pageAccessToken: 't' }); } catch (e) { err = e; }
      assert(err && err.ambiguous === true, 'ambiguous cho ' + resp.status);
    }
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 200, message: 'perm' } }) });
    let e2 = null; try { await realGraph.publishToFeed({ guard: true, pageId: 'p', message: 'm', pageAccessToken: 't' }); } catch (e) { e2 = e; }
    assert(e2 && !e2.ambiguous, '4xx rõ ràng KHÔNG ambiguous');
    global.fetch = prevFetch;
  });

  await test('L. Graph thành công nhưng ghi PUBLISHED lỗi → giữ PUBLISHING, lưu Post ID riêng, không đăng trùng; /reconcile chốt PUBLISHED', async () => {
    const d = await pendingDraft('L'); await setLive(); notifications = [];
    const origUpdate = store.updateStatus; store.updateStatus = async (id, st, ex) => { if (st === 'PUBLISHED') throw new Error('RTDB down'); return origUpdate(id, st, ex); };
    await callback(CB(d), OK_CQ);
    store.updateStatus = origUpdate;
    eq(published.length, 1); const a = await store.getDraft(d.id);
    eq(a.status, 'PUBLISHING'); eq(a.facebookPostId, 'post_1'); eq(a.publishRecordFailed, true);
    assert(notifications.some(n => /post_1/.test(n.text || '') && /KHÔNG đăng lại/.test(n.text || '')), 'báo Post ID, không đăng lại');
    await callback(CB(d), OK_CQ); eq(published.length, 1, 'bấm lại không đăng trùng');
    const orch = require('../shared/contentOrchestrator');
    const r = await orch.handleReconcile(d.id, getPathCfg(), { chat: { id: 555 } });
    eq(r.reconciled, true); const b = await store.getDraft(d.id); eq(b.status, 'PUBLISHED'); eq(b.facebookPostId, 'post_1'); eq(published.length, 1);
  });

  await test('L2. Không có Post ID đã lưu: /reconcile đọc Fanpage (GET) → thấy thì PUBLISHED, không thấy thì giữ khoá; không POST', async () => {
    const orch = require('../shared/contentOrchestrator');
    const d = await pendingDraft('Bài L2'); await setLive();
    dbData.fbPostDrafts[d.id].status = 'PUBLISHING'; dbData.fbPostDrafts[d.id].publishStartedAt = Date.now() - 10 * 60000;
    setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'real', isMock: false });
    const prevFetch = global.fetch; const methods = []; let feed = { data: [] };
    global.fetch = async (url, o) => { if (String(url).indexOf('graph.facebook.com') >= 0) { methods.push((o && o.method) || 'GET'); return { ok: true, status: 200, json: async () => feed }; } return prevFetch(url, o); };
    let r = await orch.handleReconcile(d.id, getPathCfg(), { chat: { id: 555 } });
    eq(r.reason, 'not_found_on_page'); eq((await store.getDraft(d.id)).status, 'PUBLISHING');
    feed = { data: [{ id: 'page1_777', message: 'Bài L2', created_time: new Date().toISOString() }] };
    r = await orch.handleReconcile(d.id, getPathCfg(), { chat: { id: 555 } });
    eq(r.reconciled, true); eq((await store.getDraft(d.id)).facebookPostId, 'page1_777');
    assert(methods.length === 2 && methods.every(m => m === 'GET'), 'chỉ GET: ' + methods.join(',')); eq(published.length, 0);
    global.fetch = prevFetch;
  });

  await test('L3. /reconcile từ chối: PUBLISHING còn mới (<2 phút) và draft không kẹt', async () => {
    const orch = require('../shared/contentOrchestrator');
    const d = await pendingDraft('L3'); dbData.fbPostDrafts[d.id].status = 'PUBLISHING'; dbData.fbPostDrafts[d.id].publishStartedAt = Date.now();
    let r = await orch.handleReconcile(d.id, getPathCfg(), { chat: { id: 555 } }); eq(r.reason, 'too_recent');
    const d2 = await pendingDraft('L3b'); r = await orch.handleReconcile(d2.id, getPathCfg(), { chat: { id: 555 } }); eq(r.reason, 'not_reconcilable');
  });

  await test('M. Telegram báo thành công chứa đúng Post ID và URL (Page thật, không mock)', async () => {
    const d = await pendingDraft('M'); await setLive(); notifications = [];
    setPath(dbData, 'facebookActiveToken', { pageId: 'page1', accessToken: 'real', isMock: false });
    graph.getPageInfo = async () => ({ id: 'page1', name: 'P' }); graph.publishToFeed = async (a) => { published.push(a); return { id: 'page1_998877' }; };
    await callback(CB(d), OK_CQ);
    const a = await store.getDraft(d.id); eq(a.facebookPostId, 'page1_998877');
    const texts = notifications.map(n => n.text || '');
    assert(texts.some(t => t.indexOf('https://www.facebook.com/page1_998877') >= 0), 'URL chính xác trong tin Telegram: ' + JSON.stringify(texts));
    graph.getPageInfo = realGraph.getPageInfo; graph.publishToFeed = defaultPublish;
  });

  await test('N. telegramConfig hỏng → fail-closed, không đăng', async () => {
    const d = await pendingDraft('N'); dbData.telegramConfig = 'rubbish';
    await callback(CB(d), OK_CQ); eq(published.length, 0);
  });

  console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' pass, ' + failed + ' fail');
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
})().catch(e => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
