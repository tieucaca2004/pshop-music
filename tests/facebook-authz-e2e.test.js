// E2E phân quyền Facebook qua HTTP THẬT: exports.apiGateway + 4 Cloud Function Facebook (index.js thật, firebase-admin thật)
// trên Firebase Emulator auth + database, project demo-pshop. Facebook chạy ở MOCK MODE (facebookAppConfig/appId rỗng) nên
// KHÔNG có request nào tới Facebook/Production; mọi fetch ra ngoài localhost bị chặn và đếm.
//
//   firebase emulators:exec --only auth,database --project demo-pshop "node tests/facebook-authz-e2e.test.js"
'use strict';
const hostDb = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
const hostAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(hostDb) || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostAuth)) {
  console.error('Từ chối chạy: cần emulator auth + database trên localhost (chạy qua firebase emulators:exec).'); process.exit(2);
}
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';
process.env.FACEBOOK_APP_SECRET = 'dummy'; // placeholder, không phải secret thật
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-pshop', databaseURL: 'http://' + hostDb + '?ns=demo-pshop', storageBucket: 'demo-pshop.appspot.com' });

const realFetch = global.fetch; const blocked = [];
global.fetch = async (url, opts) => {
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(url))) return realFetch(url, opts);
  blocked.push(String(url)); throw new Error('Test chặn request ra ngoài: ' + url);
};
const path = require('path');
const F = path.join(__dirname, '..', 'functions') + '/';
const rq = require('module').createRequire(F + 'index.js');
const log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[TRACE]')) return; log(...a); };
const fx = require(F + 'index.js');
const admin = rq('firebase-admin'); const express = rq('express'); const db = admin.database();

const PW = 'Test12345!';
const U = { SUPER: 'super', SUPER2: 'super', ADMIN2: 'admin', EDITOR: 'editor', AGENT: 'agent' };
const uidOf = k => 'TEST_FB_' + k; const emailOf = k => 'test.fb.' + k.toLowerCase() + '@test.local';
const T = {}; let base, server;
async function seedUsers() {
  for (const [k, kind] of Object.entries(U)) {
    try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {}
    await admin.auth().createUser({ uid: uidOf(k), email: emailOf(k), password: PW, emailVerified: true });
    await db.ref('roles/' + uidOf(k)).set({ role: kind === 'agent' ? 'agent' : kind === 'editor' ? 'editor' : 'admin', email: emailOf(k) });
    if (kind === 'super') await db.ref('superAdmins/' + uidOf(k)).set({ role: 'super_admin', email: emailOf(k) });
  }
}
const FB_NODES = ['facebookAppConfig', 'facebookConnection', 'facebookActiveToken', 'facebookUserToken', 'facebookPageTokens', 'facebookPendingPages', 'facebookOAuthState'];
async function resetFb() { for (const n of FB_NODES) await db.ref(n).remove(); await db.ref('rateLimits').remove(); }
async function cleanup() {
  for (const k of Object.keys(U)) { try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {} await db.ref('roles/' + uidOf(k)).remove(); await db.ref('superAdmins/' + uidOf(k)).remove(); }
  await resetFb();
}
async function token(k) {
  if (T[k]) return T[k];
  const r = await realFetch('http://' + hostAuth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailOf(k), password: PW, returnSecureToken: true }) });
  return (T[k] = (await r.json()).idToken);
}
async function http(who, method, p, body, extra) {
  const h = { 'Content-Type': 'application/json' }; if (who) h.Authorization = 'Bearer ' + await token(who);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await realFetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: ctl.signal });
    const j = await r.json().catch(() => null);
    return { status: r.status, location: r.headers.get('location') || '', code: j && j.error && (j.error.code || j.error), msg: j && j.error && (j.error.message || j.error), data: j && (j.data !== undefined ? j.data : j), raw: j };
  } catch (e) { return { status: 'ERR', code: e.name }; } finally { clearTimeout(t); }
}
const val = async p => (await db.ref(p).once('value')).val();
const gw = (who, m, p, b) => http(who, m, '/gw' + p, b);
const fn = (who, name, b) => http(who, 'POST', '/fn/' + name, b || {});

(async () => {
  const out = []; const R = (n, pass, info) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? ' | ' + info : ''));
  await seedUsers(); await resetFb();
  server = await new Promise(r => {
    const app = express(); app.set('trust proxy', true); app.use(express.json());
    app.all('/gw/*', (q, s) => { q.url = q.url.slice(3); fx.apiGateway(q, s); });
    app.get('/fn/facebookOAuthCallback', (q, s) => fx.facebookOAuthCallback(q, s));
    for (const n of ['facebookPublish', 'facebookSelectPage', 'facebookRefreshToken']) app.all('/fn/' + n, (q, s) => fx[n](q, s));
    const x = app.listen(0, '127.0.0.1', () => r(x));
  });
  base = 'http://127.0.0.1:' + server.address().port;

  // ── A. Cloud Function trực tiếp: chỉ super_admin ───────────────────────
  for (const name of ['facebookPublish', 'facebookSelectPage', 'facebookRefreshToken']) {
    const body = name === 'facebookPublish' ? { message: 'hi' } : { pageId: 'mock_page_1' };
    const res = {};
    for (const who of [null, 'ADMIN2', 'EDITOR', 'AGENT']) res[who || 'ANON'] = (await fn(who, name, body)).status;
    R(name + ': không đăng nhập → 401; admin/editor/agent → 403', res.ANON === 401 && res.ADMIN2 === 403 && res.EDITOR === 403 && res.AGENT === 403, JSON.stringify(res));
  }
  await resetFb();
  const sp = await fn('SUPER', 'facebookPublish', { message: 'hi' });
  R('facebookPublish: super_admin qua cổng quyền (400 vì chưa kết nối, không phải 401/403)', sp.status === 400, sp.status);

  // ── B. Route gateway thay đổi kết nối: chỉ super_admin ─────────────────
  const MUT = [['POST', '/v1/facebook/oauth/start', {}], ['POST', '/v1/facebook/pages/select', { pageId: 'mock_page_1' }], ['POST', '/v1/facebook/token/refresh', {}], ['POST', '/v1/facebook/repair', {}], ['POST', '/v1/facebook/app-config', { appId: '123456789012345' }], ['POST', '/v1/facebook/disconnect', {}]];
  await db.ref('facebookActiveToken').set({ pageId: 'p1', accessToken: 'T', isMock: true, expiresAt: Date.now() + 1e7 });
  await db.ref('facebookConnection').set({ status: 'connected', pageId: 'p1' });
  const snapBefore = JSON.stringify([await val('facebookAppConfig'), await val('facebookConnection'), await val('facebookActiveToken'), await val('facebookOAuthState')]);
  for (const [m, p, b] of MUT) {
    await db.ref('rateLimits').remove();
    const rs = {}; for (const who of ['ADMIN2', 'EDITOR', 'AGENT', null]) rs[who || 'ANON'] = (await gw(who, m, p, b)).status;
    R(p + ': admin/editor/agent → 403, ẩn danh → 401/403', rs.ADMIN2 === 403 && rs.EDITOR === 403 && rs.AGENT === 403 && (rs.ANON === 401 || rs.ANON === 403), JSON.stringify(rs));
  }
  R('...và các lần bị từ chối KHÔNG đổi dữ liệu Facebook nào', JSON.stringify([await val('facebookAppConfig'), await val('facebookConnection'), await val('facebookActiveToken'), await val('facebookOAuthState')]) === snapBefore);
  await resetFb();

  // ── C. App ID qua server (super_admin) ─────────────────────────────────
  let r = await gw('SUPER', 'POST', '/v1/facebook/app-config', { appId: 'abc' });
  R('app-config: appId sai định dạng → 400, không ghi', r.status === 400 && (await val('facebookAppConfig')) === null, r.status);
  r = await gw('SUPER', 'POST', '/v1/facebook/app-config', { appId: '123456789012345' });
  R('app-config: super_admin lưu App ID hợp lệ → 200', r.status === 200 && (await val('facebookAppConfig/appId')) === '123456789012345' && (await val('facebookAppConfig/updatedBy')) === uidOf('SUPER'), r.status);
  r = await gw('SUPER', 'POST', '/v1/facebook/app-config', { appId: '' });
  R('app-config: xoá App ID → quay lại Mock Mode', r.status === 200 && r.data && r.data.mockMode === true, r.status);

  // ── D. OAuth end-to-end (Mock Mode) ────────────────────────────────────
  const start = await gw('SUPER', 'POST', '/v1/facebook/oauth/start', {});
  const state = start.data && start.data.state;
  const st = state ? await val('facebookOAuthState/' + state) : null;
  R('oauth/start (super_admin): server cấp state {uid, createdAt:số}, mockMode', start.status === 200 && !!state && st && st.uid === uidOf('SUPER') && typeof st.createdAt === 'number' && start.data.mockMode === true, start.status);
  const cb = (s, code) => http(null, 'GET', '/fn/facebookOAuthCallback?code=' + (code || 'mock-code') + '&state=' + encodeURIComponent(s));
  const c1 = await cb(state);
  R('callback hợp lệ → 302 oauth=success', c1.status === 302 && /oauth=success/.test(c1.location), c1.status + ' ' + c1.location.slice(-30));
  R('...state bị tiêu thụ; token ghi đúng uid khởi tạo', (await val('facebookOAuthState/' + state)) === null && (await val('facebookUserToken/obtainedBy')) === uidOf('SUPER') && !!(await val('facebookPageTokens/' + uidOf('SUPER') + '/mock_page_1')));
  const c2 = await cb(state);
  R('replay cùng state → 302 oauth=error', c2.status === 302 && /oauth=error/.test(c2.location), c2.location.slice(-40));

  await resetFb();
  const s2 = (await gw('SUPER', 'POST', '/v1/facebook/oauth/start', {})).data.state;
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => cb(s2)));
  R('5 callback SONG SONG cùng state → đúng 1 thành công', par.filter(x => /oauth=success/.test(x.location)).length === 1, par.map(x => /success/.test(x.location) ? 'ok' : 'err').join(','));

  await resetFb(); await db.ref('facebookUserToken').set({ accessToken: 'SENTINEL', obtainedBy: 'prior', expiresAt: Date.now() + 1e9 });
  await db.ref('facebookOAuthState/TEST_FB_old').set({ uid: uidOf('SUPER'), createdAt: Date.now() - 6 * 60 * 1000 });
  const old = await cb('TEST_FB_old');
  R('state hết hạn (>5 phút) → oauth=error, token cũ KHÔNG bị ghi đè', /oauth=error/.test(old.location) && (await val('facebookUserToken/accessToken')) === 'SENTINEL', old.location.slice(-40));
  await db.ref('facebookOAuthState/TEST_FB_notsuper').set({ uid: uidOf('ADMIN2'), createdAt: Date.now() });
  const ns = await cb('TEST_FB_notsuper');
  R('state của người KHÔNG phải super_admin → oauth=error, không ghi token', /oauth=error/.test(ns.location) && (await val('facebookUserToken/accessToken')) === 'SENTINEL' && (await val('facebookPageTokens')) === null);
  await db.ref('facebookOAuthState/TEST_FB_keep').set({ uid: uidOf('SUPER'), createdAt: Date.now() });
  const inj = await cb('TEST_FB_keep/uid');
  R('state chứa "/" → oauth=error và KHÔNG xoá con của state khác', /oauth=error/.test(inj.location) && (await val('facebookOAuthState/TEST_FB_keep/uid')) === uidOf('SUPER'), inj.location.slice(-40));
  const none = await http(null, 'GET', '/fn/facebookOAuthCallback?code=x');
  R('thiếu state → oauth=error', none.status === 302 && /oauth=error/.test(none.location));

  // ── E. Chọn Page, đăng bài (Mock Mode) ─────────────────────────────────
  await resetFb();
  const s3 = (await gw('SUPER', 'POST', '/v1/facebook/oauth/start', {})).data.state; await cb(s3);
  r = await fn('SUPER', 'facebookSelectPage', { pageId: 'mock_page_1' });
  R('facebookSelectPage (super_admin) → 200, kết nối connected + token Page active', r.status === 200 && (await val('facebookConnection/status')) === 'connected' && (await val('facebookActiveToken/pageId')) === 'mock_page_1', r.status);
  r = await fn('SUPER', 'facebookSelectPage', { pageId: 'mock_page_1/accessToken' });
  R('facebookSelectPage: pageId chứa "/" → 400', r.status === 400, r.status);
  await db.ref('rateLimits').remove();
  const pe = await gw('EDITOR', 'POST', '/v1/facebook/publish', { message: 'bài thử' });
  R('đăng qua gateway: EDITOR → 200 (Mock Mode)', pe.status === 200 && pe.data && pe.data.success === true && pe.data.mockMode === true, pe.status);
  const pa = await gw('ADMIN2', 'POST', '/v1/facebook/publish', { message: 'bài thử' });
  R('đăng qua gateway: ADMIN → 200', pa.status === 200, pa.status);
  const pg = await gw('AGENT', 'POST', '/v1/facebook/publish', { message: 'bài thử' });
  R('đăng qua gateway: AGENT → 403', pg.status === 403, pg.status);
  const pf = await fn('EDITOR', 'facebookPublish', { message: 'bài thử' });
  R('đăng TRỰC TIẾP Cloud Function: EDITOR → 403 (không có đường vòng)', pf.status === 403, pf.status);
  const ps = await fn('SUPER', 'facebookPublish', { message: 'bài thử' });
  R('đăng TRỰC TIẾP Cloud Function: super_admin → 200 (Mock Mode)', ps.status === 200 && ps.raw && ps.raw.success === true, ps.status);

  // ── F. Ngắt kết nối: chỉ dữ liệu của người gọi ─────────────────────────
  await db.ref('facebookPageTokens/' + uidOf('SUPER2') + '/p9').set({ accessToken: 'OTHER', isMock: true });
  await db.ref('facebookPendingPages/' + uidOf('SUPER2')).set({ pages: [{ id: 'p9', name: 'P9' }] });
  await db.ref('facebookPageTokens/' + uidOf('SUPER') + '/p1').set({ accessToken: 'MINE', isMock: true });
  await db.ref('facebookPendingPages/' + uidOf('SUPER')).set({ pages: [{ id: 'p1', name: 'P1' }] });
  await db.ref('facebookAppConfig/appId').set('123456789012345');
  r = await gw('SUPER', 'POST', '/v1/facebook/disconnect', {});
  R('disconnect (super_admin) → 200, connection=not_connected, token toàn cục bị xoá', r.status === 200 && (await val('facebookConnection/status')) === 'not_connected' && (await val('facebookActiveToken')) === null && (await val('facebookUserToken')) === null, r.status);
  R('...dữ liệu chờ chọn của NGƯỜI GỌI bị xoá, của super_admin KHÁC được giữ nguyên', (await val('facebookPageTokens/' + uidOf('SUPER'))) === null && (await val('facebookPendingPages/' + uidOf('SUPER'))) === null && !!(await val('facebookPageTokens/' + uidOf('SUPER2') + '/p9')) && !!(await val('facebookPendingPages/' + uidOf('SUPER2'))));
  R('...App ID không bị xoá', (await val('facebookAppConfig/appId')) === '123456789012345');
  r = await gw('EDITOR', 'POST', '/v1/facebook/publish', { message: 'sau khi ngắt' });
  R('sau disconnect: đăng bài → 400 (chưa kết nối)', r.status === 400, r.status);

  // ── G. Route chỉ-đọc giữ nguyên quyền admin ────────────────────────────
  await db.ref('rateLimits').remove();
  const g1 = await gw('ADMIN2', 'GET', '/v1/facebook/connection'); const g2 = await gw('EDITOR', 'GET', '/v1/facebook/connection');
  R('GET /v1/facebook/connection: admin → 200, editor → 403 (không đổi so với trước)', g1.status === 200 && g2.status === 403, g1.status + '/' + g2.status);

  R('không có request nào ra ngoài emulator', blocked.length === 0, blocked.length);
  server.close(); await cleanup();
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('FAIL')).length;
  console.log(f ? f + ' FAILED' : 'facebook-authz-e2e: ' + out.length + '/' + out.length + ' PASS');
  process.exit(f ? 1 : 0);
})().catch(async e => { console.log('FAILED harness: ' + (e && e.stack)); try { await cleanup(); } catch (x) {} process.exit(1); });
