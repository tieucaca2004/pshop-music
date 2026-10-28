/*
 * tests/facebookAuthz.test.js — G1M: kiểm chứng vá phân quyền Facebook Integration.
 *
 * Chạy: node tests/facebookAuthz.test.js   (từ thư mục functions/)
 *
 * AN TOÀN: không Firebase thật, không Facebook thật, không mạng.
 *   - firebase-admin được thay bằng store in-memory (Module._load).
 *   - global.fetch được thay bằng "tripwire": mọi lệnh gọi ngoài URL Cloud Function
 *     nội bộ đều ném lỗi; lệnh gọi hợp lệ chỉ được GHI LẠI và trả về giả lập.
 *   - Graph API được truyền stub qua tham số, hoặc dùng nhánh mockMode (isMock:true)
 *     của facebook-graph-api.js vốn không gọi mạng.
 */
'use strict';

// ── In-memory RTDB + Auth mock ────────────────────────────────────────────────
let dbData = {};
let writes = [];            // mọi lần ghi: { op, path }
let authState = null;       // { tokens, revoked, users, verifyCalls }
let hooks = {};             // hook thử nghiệm (vd: thu hồi quyền giữa chừng)

function parts(path) { return String(path || '').split('/').filter(Boolean); }
function getPath(obj, path) {
  let cur = obj;
  for (const p of parts(path)) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}
function setPath(obj, path, val) {
  const ps = parts(path);
  if (!ps.length) { dbData = val || {}; return; }
  let cur = obj;
  for (let i = 0; i < ps.length - 1; i++) {
    if (cur[ps[i]] == null || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {};
    cur = cur[ps[i]];
  }
  if (val === null) delete cur[ps[ps.length - 1]]; else cur[ps[ps.length - 1]] = val;
}
function mockRef(path) {
  const p = path || '';
  return {
    // Snapshot chụp NGAY lúc đọc (như RTDB thật) — không đọc lười, để test bắt được lỗi đọc-rồi-ghi không nguyên tử.
    once: async () => {
      const v = getPath(dbData, p);
      const copy = v === null ? null : JSON.parse(JSON.stringify(v));
      return { exists: () => copy !== null, val: () => copy };
    },
    set: async (val) => { writes.push({ op: 'set', path: p }); setPath(dbData, p, val); },
    remove: async () => { writes.push({ op: 'remove', path: p }); setPath(dbData, p, null); },
    // transaction đồng bộ trong 1 tick → nguyên tử như RTDB (không xen kẽ giữa đọc và ghi)
    transaction: async (fn) => {
      const cur = getPath(dbData, p);
      const next = fn(cur);
      if (next === undefined) return { committed: false };
      writes.push({ op: 'transaction', path: p });
      setPath(dbData, p, next);
      return { committed: true };
    },
    update: async (changes) => {
      if (!p) {
        // multi-path update tại root: đúng semantics RTDB (mỗi key là 1 đường dẫn)
        for (const k of Object.keys(changes)) { writes.push({ op: 'update', path: k }); setPath(dbData, k, changes[k]); }
        return;
      }
      writes.push({ op: 'update', path: p });
      setPath(dbData, p, Object.assign({}, getPath(dbData, p) || {}, changes));
    }
  };
}
const mockAdmin = {
  database: () => ({ ref: mockRef }),
  auth: () => ({
    verifyIdToken: async (token, checkRevoked) => {
      authState.verifyCalls.push({ token, checkRevoked });
      const u = authState.tokens[token];
      if (!u) throw new Error('invalid token');
      if (checkRevoked && authState.revoked.has(token)) throw new Error('token revoked');
      return { uid: u.uid, email: u.email };
    },
    getUser: async (uid) => {
      const u = authState.users[uid];
      if (!u) throw new Error('no such user');
      return u;
    }
  }),
  apps: [{}]
};
mockAdmin.database.ServerValue = { TIMESTAMP: '__server_ts__' };

// ── Mạng: tripwire ────────────────────────────────────────────────────────────
const FUNCTIONS_BASE = 'https://us-central1-pshop-music.cloudfunctions.net/';
let fetchCalls = [];
global.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.indexOf(FUNCTIONS_BASE) === 0) {
    fetchCalls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ success: true, tokenExpiresAt: 123 }) };
  }
  throw new Error('NETWORK TRIPWIRE: fetch bị chặn trong test: ' + url);
};

// ── Cài mock trước khi require ───────────────────────────────────────────────
const Module = require('module');
const originalLoad = Module._load;
// Stub cố định (socialMediaCenter bắt module lúc require); test gán impl sau.
const listResourceStub = {
  impl: null,
  getAll: (...a) => listResourceStub.impl.getAll(...a),
  getOne: (...a) => listResourceStub.impl.getOne(...a),
  update: (...a) => listResourceStub.impl.update(...a)
};
Module._load = function (request, parent) {
  if (request === 'firebase-admin') return mockAdmin;
  if (request === '../shared/listResource' && parent && /socialMediaCenter/.test(parent.filename)) return listResourceStub;
  return originalLoad.apply(this, arguments);
};

const fs = require('fs');
const path = require('path');
const fbConn = require('../shared/fbConnectionPatch');
const facebookRoutes = require('../routes/facebook');
const socialRoutes = require('../routes/socialMediaCenter');

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  reset();
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message)); failed++; failures.push(name); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'eq') + ': mong đợi ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a)); }
async function rejects(fn, re, msg) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  if (!err) throw new Error((msg || 'rejects') + ': không ném lỗi');
  if (re && !re.test(err.message)) throw new Error((msg || 'rejects') + ': sai thông điệp: ' + err.message);
}

const TOKEN_WRITE = /^(facebookPendingPages|facebookPageTokens|facebookUserToken|facebookActiveToken|facebookConnection|facebookAppConfig)/;
function tokenWrites() { return writes.filter(w => TOKEN_WRITE.test(w.path)); }

function reset() {
  dbData = {};
  writes = [];
  fetchCalls = [];
  hooks = {};
  authState = {
    tokens: {
      'tok-super': { uid: 'u-super', email: 'super@x' },
      'tok-superlegacy': { uid: 'u-superlegacy', email: 'sl@x' },
      'tok-admin': { uid: 'u-admin', email: 'admin@x' },
      'tok-editor': { uid: 'u-editor', email: 'editor@x' },
      'tok-agent': { uid: 'u-agent', email: 'agent@x' },
      'tok-nobody': { uid: 'u-nobody', email: 'nobody@x' }
    },
    revoked: new Set(),
    users: {
      'u-super': { uid: 'u-super', email: 'super@x', disabled: false },
      'u-admin': { uid: 'u-admin', email: 'admin@x', disabled: false },
      'u-disabled': { uid: 'u-disabled', email: 'dis@x', disabled: true }
    },
    verifyCalls: []
  };
  dbData = {
    superAdmins: {
      'u-super': { role: 'super_admin', email: 'super@x' },
      'u-disabled': { role: 'super_admin', email: 'dis@x' },
      'u-superlegacy': true,                          // schema không chuẩn → phải bị từ chối
      'u-wrongrole': { role: 'admin' }
    },
    roles: {
      'u-super': { role: 'admin' },
      'u-admin': { role: 'admin' },
      'u-editor': { role: 'editor' },
      'u-agent': { role: 'agent' }
    }
  };
  writes = [];
}
function req(token, body, method, p) {
  return {
    method: method || 'POST',
    __pshPath: p,
    body: body || {},
    get: (h) => (h.toLowerCase() === 'authorization' && token) ? 'Bearer ' + token : ''
  };
}
function fakeRes() {
  return {
    statusCode: 200, body: null, redirectUrl: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    redirect(c, u) { this.statusCode = c; this.redirectUrl = u; return this; }
  };
}
const middleware = require('../shared/middleware');
function helpersFor(role) {
  return { sendSuccess: middleware.sendSuccess, sendError: middleware.sendError, auth: role ? { ok: true, uid: 'x', email: role + '@x', role } : { ok: false } };
}
async function callFb(p, method, token, body, role) {
  const res = fakeRes();
  await facebookRoutes.handle(req(token, body, method, p), res, helpersFor(role));
  return res;
}

// Graph stub (không mạng)
function graphStub(overrides) {
  const calls = [];
  const api = {
    calls,
    exchangeCodeForToken: async () => { calls.push('code'); return { access_token: 'short' }; },
    exchangeForLongLivedToken: async () => { calls.push('long'); return { access_token: 'LONG-TOKEN', expires_in: 3600 }; },
    getManagedPages: async () => { calls.push('pages'); return { data: [{ id: 'p1', name: 'Page 1', access_token: 'PAGE-TOKEN-1', picture: { data: { url: 'u' } } }] }; },
    uploadPhoto: async () => { calls.push('photo'); return { id: 'ph1' }; },
    publishToFeed: async () => { calls.push('feed'); return { id: 'post1' }; }
  };
  return Object.assign(api, overrides || {});
}
const NOW = 1000000000000;
function seedState(state, data) { dbData.facebookOAuthState = Object.assign(dbData.facebookOAuthState || {}, { [state]: data }); }

(async () => {
  // ═══ 1. isSuperAdminUid / verifySuperAdmin ═════════════════════════════════
  console.log('\n[1] Kiểm tra super_admin (superAdmins/{uid} tồn tại + role === "super_admin")');
  await test('super_admin hợp lệ → true', async () => { assert(await fbConn.isSuperAdminUid('u-super')); });
  await test('superAdmins/{uid} = true (không có role) → false (fail-closed)', async () => { assert(!(await fbConn.isSuperAdminUid('u-superlegacy'))); });
  await test('superAdmins/{uid}.role = "admin" → false', async () => { assert(!(await fbConn.isSuperAdminUid('u-wrongrole'))); });
  await test('uid không có trong superAdmins → false', async () => { assert(!(await fbConn.isSuperAdminUid('u-editor'))); });
  await test('uid rỗng/không phải chuỗi → false', async () => { assert(!(await fbConn.isSuperAdminUid('')) && !(await fbConn.isSuperAdminUid(null)) && !(await fbConn.isSuperAdminUid({}))); });

  await test('verifySuperAdmin: thiếu Authorization → 401', async () => {
    const r = await fbConn.verifySuperAdmin(req(null)); eq(r.ok, false); eq(r.status, 401);
  });
  await test('verifySuperAdmin: token sai → 401', async () => {
    const r = await fbConn.verifySuperAdmin(req('tok-xxx')); eq(r.status, 401);
  });
  await test('verifySuperAdmin: token bị thu hồi → 401 và gọi verifyIdToken(checkRevoked=true)', async () => {
    authState.revoked.add('tok-super');
    const r = await fbConn.verifySuperAdmin(req('tok-super'));
    eq(r.status, 401);
    assert(authState.verifyCalls.every(c => c.checkRevoked === true), 'phải truyền checkRevoked=true');
  });
  await test('verifySuperAdmin: admin thường (roles=admin, không có superAdmins) → 403', async () => {
    const r = await fbConn.verifySuperAdmin(req('tok-admin')); eq(r.status, 403); eq(r.code, 'PERMISSION_DENIED');
  });
  await test('verifySuperAdmin: editor → 403', async () => { eq((await fbConn.verifySuperAdmin(req('tok-editor'))).status, 403); });
  await test('verifySuperAdmin: agent → 403', async () => { eq((await fbConn.verifySuperAdmin(req('tok-agent'))).status, 403); });
  await test('verifySuperAdmin: superAdmins dạng `true` → 403', async () => { eq((await fbConn.verifySuperAdmin(req('tok-superlegacy'))).status, 403); });
  await test('verifySuperAdmin: super_admin → ok + uid', async () => {
    const r = await fbConn.verifySuperAdmin(req('tok-super')); eq(r.ok, true); eq(r.uid, 'u-super');
  });
  await test('guardSuperAdmin: từ chối → đã gửi response và trả null, KHÔNG ghi RTDB', async () => {
    const res = fakeRes();
    const g = await fbConn.guardSuperAdmin(req('tok-editor'), res);
    eq(g, null); eq(res.statusCode, 403); eq(writes.length, 0);
  });

  // ═══ 2. Cloud Function trực tiếp: tĩnh (index.js) ══════════════════════════
  console.log('\n[2] Cloud Function trực tiếp trong index.js (kiểm tra mã nguồn)');
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  function exportBlock(name) {
    const start = indexSrc.indexOf('exports.' + name + ' =');
    assert(start >= 0, 'không thấy exports.' + name);
    const next = indexSrc.indexOf('\nexports.', start + 10);
    return indexSrc.slice(start, next < 0 ? undefined : next);
  }
  for (const fn of ['facebookSelectPage', 'facebookPublish', 'facebookRefreshToken']) {
    await test(fn + ': gọi guardSuperAdmin TRƯỚC mọi thao tác dữ liệu, không còn validateRequest', async () => {
      const b = exportBlock(fn);
      assert(/guardSuperAdmin\(req, res\)/.test(b), 'thiếu guardSuperAdmin');
      assert(!/validateRequest/.test(b), 'vẫn dùng validateRequest');
      assert(b.indexOf('guardSuperAdmin') < b.indexOf('fbConn.' + (fn === 'facebookSelectPage' ? 'selectPage' : fn === 'facebookPublish' ? 'publishToActivePage' : 'refreshActiveToken')), 'guard phải đứng trước logic');
      assert(!/admin\.database\(\)/.test(b), 'handler không được tự đọc/ghi RTDB');
    });
  }
  await test('facebookOAuthCallback: chỉ gọi processOAuthCallback, không tự ghi token', async () => {
    const b = exportBlock('facebookOAuthCallback');
    assert(/fbConn\.processOAuthCallback/.test(b), 'phải dùng processOAuthCallback');
    assert(!/admin\.database\(\)/.test(b), 'handler không được tự ghi RTDB');
  });
  await test('index.js không còn tham chiếu facebookGraphApi / getFacebookAppId cục bộ', async () => {
    assert(!/facebookGraphApi/.test(indexSrc) && !/function getFacebookAppId/.test(indexSrc));
  });

  // ═══ 3. OAuth callback ═════════════════════════════════════════════════════
  console.log('\n[3] OAuth callback — xác minh state/TTL/quyền TRƯỚC khi ghi token');
  async function runCb(state, api, extra) {
    return fbConn.processOAuthCallback(Object.assign({ code: 'c', state, appSecret: 's', graphApi: api, redirectUri: 'r', now: NOW }, extra || {}));
  }
  await test('luồng hợp lệ: ghi 3 node token bằng 1 lệnh, state bị tiêu thụ', async () => {
    dbData.facebookAppConfig = { appId: '12345' };
    seedState('S1', { uid: 'u-super', createdAt: NOW - 1000 });
    const api = graphStub();
    const out = await runCb('S1', api);
    eq(out.uid, 'u-super');
    assert(getPath(dbData, 'facebookOAuthState/S1') === null, 'state phải bị xoá');
    assert(getPath(dbData, 'facebookUserToken/accessToken') === 'LONG-TOKEN');
    assert(getPath(dbData, 'facebookPageTokens/u-super/p1/accessToken') === 'PAGE-TOKEN-1');
    eq(getPath(dbData, 'facebookUserToken/obtainedBy'), 'u-super');
    const tw = tokenWrites();
    eq(tw.length, 3, 'đúng 3 đường dẫn token được ghi');
    // 3 lần ghi token phải liên tiếp và nằm CUỐI (sau mọi lệnh gọi Graph API)
    const idx = writes.findIndex(w => TOKEN_WRITE.test(w.path));
    assert(writes.slice(idx).every(w => TOKEN_WRITE.test(w.path)), 'ghi token phải ở cuối');
  });
  await test('không có state trong RTDB → từ chối, không gọi Graph API, không ghi token', async () => {
    const api = graphStub();
    await rejects(() => runCb('NOPE', api), /không hợp lệ|hết hạn/);
    eq(api.calls.length, 0); eq(tokenWrites().length, 0);
  });
  await test('state hết hạn (>5 phút) → từ chối, state bị đốt, không ghi token', async () => {
    seedState('S2', { uid: 'u-super', createdAt: NOW - 6 * 60 * 1000 });
    const api = graphStub();
    await rejects(() => runCb('S2', api), /hết hạn/);
    eq(api.calls.length, 0); eq(tokenWrites().length, 0);
    assert(getPath(dbData, 'facebookOAuthState/S2') === null, 'state hết hạn vẫn phải bị xoá');
  });
  await test('state ở tương lai (lệch >30 giây) → từ chối', async () => {
    seedState('S3', { uid: 'u-super', createdAt: NOW + 60 * 1000 });
    const api = graphStub();
    await rejects(() => runCb('S3', api), /hết hạn/);
    eq(tokenWrites().length, 0);
  });
  await test('state có createdAt không phải số → từ chối', async () => {
    seedState('S4', { uid: 'u-super', createdAt: '2026-01-01' });
    await rejects(() => runCb('S4', graphStub()), /không hợp lệ/);
    eq(tokenWrites().length, 0);
  });
  await test('state thiếu uid → từ chối', async () => {
    seedState('S5', { createdAt: NOW });
    await rejects(() => runCb('S5', graphStub()), /không hợp lệ/);
    eq(tokenWrites().length, 0);
  });
  await test('người khởi tạo MẤT quyền super_admin (chỉ còn roles=admin) → từ chối, không gọi Graph, không ghi token', async () => {
    seedState('S6', { uid: 'u-admin', createdAt: NOW });
    const api = graphStub();
    await rejects(() => runCb('S6', api), /Super Admin/);
    eq(api.calls.length, 0); eq(tokenWrites().length, 0);
  });
  await test('editor tự tạo state → từ chối', async () => {
    seedState('S7', { uid: 'u-editor', createdAt: NOW });
    await rejects(() => runCb('S7', graphStub()), /Super Admin/);
    eq(tokenWrites().length, 0);
  });
  await test('tài khoản super_admin bị khoá (disabled) → từ chối', async () => {
    seedState('S8', { uid: 'u-disabled', createdAt: NOW });
    const api = graphStub();
    await rejects(() => runCb('S8', api), /khoá/);
    eq(api.calls.length, 0); eq(tokenWrites().length, 0);
  });
  await test('replay: dùng lại cùng state lần 2 → từ chối', async () => {
    seedState('S9', { uid: 'u-super', createdAt: NOW });
    await runCb('S9', graphStub());
    writes = [];
    await rejects(() => runCb('S9', graphStub()), /không hợp lệ|hết hạn/);
    eq(tokenWrites().length, 0);
  });
  await test('replay SONG SONG cùng state: đúng 1 callback thắng, bên còn lại bị từ chối, token chỉ ghi 1 lần', async () => {
    seedState('SP', { uid: 'u-super', createdAt: NOW });
    const results = await Promise.allSettled([runCb('SP', graphStub()), runCb('SP', graphStub())]);
    eq(results.filter(r => r.status === 'fulfilled').length, 1, 'số callback thành công');
    eq(results.filter(r => r.status === 'rejected').length, 1, 'số callback bị từ chối');
    eq(tokenWrites().length, 3, 'chỉ 1 lần ghi token (3 đường dẫn)');
  });
  await test('token gắn với uid trong state, không gắn với uid khác', async () => {
    seedState('SU', { uid: 'u-super', createdAt: NOW });
    await runCb('SU', graphStub());
    assert(getPath(dbData, 'facebookPageTokens/u-super') !== null && getPath(dbData, 'facebookPageTokens/u-admin') === null);
    eq(getPath(dbData, 'facebookUserToken/obtainedBy'), 'u-super');
  });
  await test('quyền bị thu hồi GIỮA lúc gọi Graph API → từ chối, không ghi token nào', async () => {
    seedState('S10', { uid: 'u-super', createdAt: NOW });
    const api = graphStub({ getManagedPages: async () => { delete dbData.superAdmins['u-super']; return { data: [{ id: 'p1', name: 'P', access_token: 'T' }] }; } });
    await rejects(() => runCb('S10', api), /Super Admin/);
    eq(tokenWrites().length, 0);
  });
  await test('Graph API lỗi → không ghi token', async () => {
    seedState('S11', { uid: 'u-super', createdAt: NOW });
    const api = graphStub({ exchangeCodeForToken: async () => { throw new Error('Facebook từ chối'); } });
    await rejects(() => runCb('S11', api), /Facebook từ chối/);
    eq(tokenWrites().length, 0);
  });
  await test('tài khoản Facebook không quản lý Page nào → không ghi token', async () => {
    seedState('S12', { uid: 'u-super', createdAt: NOW });
    await rejects(() => runCb('S12', graphStub({ getManagedPages: async () => ({ data: [] }) })), /chưa quản lý/);
    eq(tokenWrites().length, 0);
  });
  await test('Mock Mode (chưa có App ID) vẫn chạy được với super_admin hợp lệ và đánh dấu isMock', async () => {
    seedState('S13', { uid: 'u-super', createdAt: NOW });
    const out = await runCb('S13', graphStub());
    eq(out.mockMode, true); eq(getPath(dbData, 'facebookUserToken/isMock'), true);
  });
  await test('state chứa "/" hoặc ký tự lạ → từ chối TRƯỚC khi chạm RTDB (không xoá con của state khác)', async () => {
    seedState('S1', { uid: 'u-super', createdAt: NOW });
    const before = JSON.stringify(dbData.facebookOAuthState);
    for (const bad of ['S1/uid', 'S1/createdAt', '../facebookUserToken', 'a.b', 'a$b', 'a#b', '', ' ', 'x'.repeat(200), null, undefined, 123, {}]) {
      const api = graphStub();
      await rejects(() => runCb(bad, api), /không hợp lệ/, 'state ' + JSON.stringify(bad));
      eq(api.calls.length, 0);
    }
    eq(JSON.stringify(dbData.facebookOAuthState), before, 'state hợp lệ khác không được bị đụng tới');
    eq(writes.length, 0, 'không có lệnh ghi nào');
  });
  await test('state đúng dạng UUID do server cấp (randomUUID) được chấp nhận', async () => {
    const st = require('crypto').randomUUID();
    seedState(st, { uid: 'u-super', createdAt: NOW });
    await runCb(st, graphStub());
  });
  await test('checkStateShape: ranh giới TTL', async () => {
    eq(fbConn.checkStateShape({ uid: 'u', createdAt: NOW - fbConn.OAUTH_STATE_TTL_MS }, NOW), null);
    assert(fbConn.checkStateShape({ uid: 'u', createdAt: NOW - fbConn.OAUTH_STATE_TTL_MS - 1 }, NOW) !== null);
  });

  // ═══ 4. publish / select / refresh (logic dùng chung) ══════════════════════
  console.log('\n[4] publish / selectPage / refreshActiveToken');
  await test('publishToActivePage: không có token → 400, không gọi Graph', async () => {
    const api = graphStub(); const r = await fbConn.publishToActivePage({ message: 'hi', graphApi: api });
    eq(r.status, 400); eq(api.calls.length, 0);
  });
  await test('publishToActivePage: token hết hạn → 400', async () => {
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T', expiresAt: Date.now() - 1000, isMock: true };
    eq((await fbConn.publishToActivePage({ message: 'hi', graphApi: graphStub() })).status, 400);
  });
  await test('publishToActivePage: thiếu message → 400', async () => {
    eq((await fbConn.publishToActivePage({ message: '', graphApi: graphStub() })).status, 400);
  });
  await test('publishToActivePage: thành công, tải ảnh rồi đăng, mockMode lấy từ kết nối đã lưu', async () => {
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T', expiresAt: Date.now() + 100000, isMock: true };
    const api = graphStub();
    const r = await fbConn.publishToActivePage({ message: 'hi', imageUrls: ['a', '', 'b'], graphApi: api });
    eq(r.status, 200); eq(r.body.facebookPostId, 'post1'); eq(r.body.mockMode, true);
    eq(api.calls.join(','), 'photo,photo,feed');
  });
  await test('selectPage: copy token đúng Page sang facebookActiveToken, dọn node tạm', async () => {
    dbData.facebookPageTokens = { 'u-super': { p1: { accessToken: 'PT', name: 'P1', obtainedAt: 1, expiresAt: Date.now() + 1e6, isMock: true } } };
    dbData.facebookPendingPages = { 'u-super': { pages: [{ id: 'p1', name: 'P1', picture: '' }] } };
    const r = await fbConn.selectPage({ uid: 'u-super', pageId: 'p1' });
    eq(r.status, 200);
    eq(getPath(dbData, 'facebookActiveToken/accessToken'), 'PT');
    eq(getPath(dbData, 'facebookConnection/status'), 'connected');
    assert(getPath(dbData, 'facebookPageTokens/u-super') === null && getPath(dbData, 'facebookPendingPages/u-super') === null);
  });
  await test('selectPage: pageId chứa "/" hoặc ký tự lạ → 400, không đọc đường dẫn con, không ghi', async () => {
    dbData.facebookPageTokens = { 'u-super': { p1: { accessToken: 'PT', expiresAt: Date.now() + 1e6 } } };
    for (const bad of ['p1/accessToken', '../x', 'a.b', 'p1 ', 'x'.repeat(100)]) {
      eq((await fbConn.selectPage({ uid: 'u-super', pageId: bad })).status, 400, JSON.stringify(bad));
    }
    eq(tokenWrites().length, 0);
  });
  await test('selectPage: pageId lạ → 404, không ghi', async () => {
    eq((await fbConn.selectPage({ uid: 'u-super', pageId: 'zzz' })).status, 404); eq(tokenWrites().length, 0);
  });
  await test('refreshActiveToken: chưa từng kết nối → 400, không ghi', async () => {
    eq((await fbConn.refreshActiveToken({ uid: 'u-super', appSecret: 's', graphApi: graphStub() })).status, 400); eq(tokenWrites().length, 0);
  });
  await test('refreshActiveToken: thành công cập nhật 3 node', async () => {
    dbData.facebookUserToken = { accessToken: 'U', expiresAt: Date.now() + 1e6, isMock: true };
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'old' };
    dbData.facebookConnection = { status: 'connected' };
    const r = await fbConn.refreshActiveToken({ uid: 'u-super', appSecret: 's', graphApi: graphStub() });
    eq(r.status, 200);
    eq(getPath(dbData, 'facebookActiveToken/accessToken'), 'PAGE-TOKEN-1');
    eq(getPath(dbData, 'facebookUserToken/obtainedBy'), 'u-super');
  });

  // ═══ 5. App ID / disconnect ════════════════════════════════════════════════
  console.log('\n[5] setAppId / disconnect (thay cho ghi trực tiếp từ browser)');
  await test('setAppId: giá trị không phải số → từ chối, không ghi', async () => {
    const r = await fbConn.setAppId({ appId: '12ab', uid: 'u-super' }); eq(r.ok, false); eq(writes.length, 0);
  });
  await test('setAppId: chuỗi chèn ký tự đặc biệt → từ chối', async () => {
    eq((await fbConn.setAppId({ appId: '123456/../x', uid: 'u-super' })).ok, false);
  });
  await test('setAppId: số hợp lệ → ghi appId + updatedBy', async () => {
    const r = await fbConn.setAppId({ appId: '1234567890', uid: 'u-super' });
    eq(r.ok, true); eq(getPath(dbData, 'facebookAppConfig/appId'), '1234567890'); eq(getPath(dbData, 'facebookAppConfig/updatedBy'), 'u-super');
  });
  await test('setAppId: rỗng → quay lại Mock Mode', async () => { eq((await fbConn.setAppId({ appId: '', uid: 'u-super' })).ok, true); });
  await test('disconnectFacebook: đặt not_connected, xoá token toàn cục (active/user) + dữ liệu chờ chọn của NGƯỜI GỌI; KHÔNG xoá của uid khác', async () => {
    dbData.facebookConnection = { status: 'connected', pageId: 'p1' };
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T' };
    dbData.facebookUserToken = { accessToken: 'U' };
    dbData.facebookPendingPages = { 'u-super': { pages: [] }, 'u-other': { pages: [] } };
    dbData.facebookPageTokens = { 'u-super': { p1: {} }, 'u-other': { p9: {} } };
    await fbConn.disconnectFacebook('u-super');
    eq(getPath(dbData, 'facebookConnection/status'), 'not_connected');
    assert(getPath(dbData, 'facebookActiveToken') === null, 'activeToken phải bị xoá');
    assert(getPath(dbData, 'facebookUserToken') === null, 'userToken phải bị xoá');
    assert(getPath(dbData, 'facebookPendingPages/u-super') === null && getPath(dbData, 'facebookPageTokens/u-super') === null);
    assert(getPath(dbData, 'facebookPageTokens/u-other/p9') !== null && getPath(dbData, 'facebookPendingPages/u-other') !== null, 'KHÔNG được xoá dữ liệu chờ chọn của uid khác');
  });
  await test('sau disconnect: publishToActivePage báo chưa kết nối, không gọi Graph', async () => {
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T', expiresAt: Date.now() + 1e6, isMock: true };
    await fbConn.disconnectFacebook('u-super');
    const api = graphStub();
    eq((await fbConn.publishToActivePage({ message: 'hi', graphApi: api })).status, 400); eq(api.calls.length, 0);
  });

  // ═══ 6. Route gateway /v1/facebook/* ═══════════════════════════════════════
  console.log('\n[6] Route gateway routes/facebook.js');
  const MUTATING = [
    ['/v1/facebook/oauth/start', 'oauth/start'],
    ['/v1/facebook/pages/select', 'pages/select'],
    ['/v1/facebook/token/refresh', 'token/refresh'],
    ['/v1/facebook/repair', 'repair'],
    ['/v1/facebook/app-config', 'app-config'],
    ['/v1/facebook/disconnect', 'disconnect']
  ];
  for (const [p, label] of MUTATING) {
    await test(label + ': admin (roles=admin, không phải super) → 403, không ghi RTDB, không gọi function', async () => {
      const res = await callFb(p, 'POST', 'tok-admin', { appId: '123456', pageId: 'p1' }, 'admin');
      eq(res.statusCode, 403); eq(writes.length, 0); eq(fetchCalls.length, 0);
    });
    await test(label + ': editor/agent/không đăng nhập → bị từ chối, không ghi RTDB', async () => {
      for (const [tok, role] of [['tok-editor', 'editor'], ['tok-agent', 'agent'], [null, null]]) {
        const res = await callFb(p, 'POST', tok, { appId: '123456', pageId: 'p1' }, role);
        assert(res.statusCode === 401 || res.statusCode === 403, 'status ' + res.statusCode);
      }
      eq(writes.length, 0); eq(fetchCalls.length, 0);
    });
    await test(label + ': token của admin nhưng superAdmins dạng `true` → 403', async () => {
      const res = await callFb(p, 'POST', 'tok-superlegacy', { appId: '123456', pageId: 'p1' }, null);
      eq(res.statusCode, 403); eq(writes.length, 0);
    });
  }
  await test('oauth/start: super_admin → ghi state {uid, createdAt:number}', async () => {
    const res = await callFb('/v1/facebook/oauth/start', 'POST', 'tok-super', {}, null);
    eq(res.statusCode, 200);
    const st = getPath(dbData, 'facebookOAuthState/' + res.body.data.state);
    eq(st.uid, 'u-super'); eq(typeof st.createdAt, 'number');
  });
  await test('app-config: super_admin + appId hợp lệ → ghi qua server', async () => {
    const res = await callFb('/v1/facebook/app-config', 'POST', 'tok-super', { appId: '9988776655' }, null);
    eq(res.statusCode, 200); eq(getPath(dbData, 'facebookAppConfig/appId'), '9988776655');
  });
  await test('app-config: appId không hợp lệ → 400, không ghi', async () => {
    const res = await callFb('/v1/facebook/app-config', 'POST', 'tok-super', { appId: 'abc' }, null);
    eq(res.statusCode, 400); eq(writes.length, 0);
  });
  await test('app-config: thiếu appId → 400', async () => {
    eq((await callFb('/v1/facebook/app-config', 'POST', 'tok-super', {}, null)).statusCode, 400);
  });
  await test('disconnect: super_admin → ghi not_connected', async () => {
    dbData.facebookConnection = { status: 'connected' };
    dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T' };
    const res = await callFb('/v1/facebook/disconnect', 'POST', 'tok-super', {}, null);
    eq(res.statusCode, 200); eq(getPath(dbData, 'facebookConnection/status'), 'not_connected');
    assert(getPath(dbData, 'facebookActiveToken') === null, 'route disconnect phải xoá token');
  });
  await test('pages/select + token/refresh: super_admin → forward tới Cloud Function (đã có kiểm tra super_admin riêng)', async () => {
    await callFb('/v1/facebook/pages/select', 'POST', 'tok-super', { pageId: 'p1' }, null);
    await callFb('/v1/facebook/token/refresh', 'POST', 'tok-super', {}, null);
    eq(fetchCalls.length, 2);
    assert(fetchCalls[0].url.endsWith('/facebookSelectPage') && fetchCalls[1].url.endsWith('/facebookRefreshToken'));
  });
  await test('repair: super_admin + token sắp hết hạn → gọi facebookRefreshToken', async () => {
    dbData.facebookConnection = { status: 'connected', tokenExpiresAt: Date.now() + 1000 };
    const res = await callFb('/v1/facebook/repair', 'POST', 'tok-super', {}, null);
    eq(res.statusCode, 200); eq(fetchCalls.length, 1); assert(fetchCalls[0].url.endsWith('/facebookRefreshToken'));
  });
  await test('route chỉ-đọc connection/health/status giữ nguyên quyền Admin; editor bị chặn', async () => {
    eq((await callFb('/v1/facebook/connection', 'GET', 'tok-admin', null, 'admin')).statusCode, 200);
    eq((await callFb('/v1/facebook/status', 'GET', 'tok-admin', null, 'admin')).statusCode, 200);
    eq((await callFb('/v1/facebook/connection', 'GET', 'tok-editor', null, 'editor')).statusCode, 403);
  });

  // publish qua gateway
  function seedActive() { dbData.facebookActiveToken = { pageId: 'p1', accessToken: 'T', expiresAt: Date.now() + 1e6, isMock: true }; }
  await test('publish: editor qua gateway → thành công, KHÔNG đi qua Cloud Function trực tiếp', async () => {
    seedActive();
    const res = await callFb('/v1/facebook/publish', 'POST', 'tok-editor', { message: 'hello' }, 'editor');
    eq(res.statusCode, 200); eq(res.body.data.success, true); eq(fetchCalls.length, 0);
  });
  await test('publish: admin qua gateway → thành công', async () => {
    seedActive();
    eq((await callFb('/v1/facebook/publish', 'POST', 'tok-admin', { message: 'hello' }, 'admin')).statusCode, 200);
  });
  await test('publish: super_admin (không có node roles) qua gateway → thành công', async () => {
    seedActive(); delete dbData.roles['u-super'];
    eq((await callFb('/v1/facebook/publish', 'POST', 'tok-super', { message: 'hello' }, null)).statusCode, 200);
  });
  await test('publish: agent → 403, không đăng', async () => {
    seedActive();
    const res = await callFb('/v1/facebook/publish', 'POST', 'tok-agent', { message: 'hello' }, 'agent');
    eq(res.statusCode, 403); eq(fetchCalls.length, 0);
  });
  await test('publish: không đăng nhập → 403/401', async () => {
    seedActive();
    const res = await callFb('/v1/facebook/publish', 'POST', null, { message: 'hello' }, null);
    assert(res.statusCode === 403 || res.statusCode === 401);
  });
  await test('publish: chưa kết nối → lỗi 400 chuẩn', async () => {
    eq((await callFb('/v1/facebook/publish', 'POST', 'tok-editor', { message: 'hello' }, 'editor')).statusCode, 400);
  });

  // ═══ 7. socialMediaCenter publish ══════════════════════════════════════════
  console.log('\n[7] Route socialMediaCenter publish');
  function seedSocial() {
    seedActive();
    dbData.facebookConnection = { status: 'connected', pageName: 'Page 1' };
    const store = { d1: { id: 'd1', moduleId: 'facebook-post-generator', content: { versions: [{ label: 'A', caption: 'hi', hook: 'h' }] } } };
    const updates = [];
    listResourceStub.impl = {
      getAll: async () => Object.values(store),
      getOne: async (n, id) => store[id] || null,
      update: async (n, id, patch) => { updates.push(patch); store[id] = Object.assign({}, store[id], patch); return store[id]; }
    };
    return { store, updates };
  }
  async function callSocial(token, role) {
    const res = fakeRes();
    await socialRoutes.handle(req(token, { versionLabel: 'A' }, 'POST', '/v1/social-media-center/drafts/d1/publish'), res, helpersFor(role));
    return res;
  }
  await test('social publish: editor → published, không gọi Cloud Function trực tiếp', async () => {
    const s = seedSocial();
    const res = await callSocial('tok-editor', 'editor');
    eq(res.statusCode, 200); eq(fetchCalls.length, 0);
    eq(s.store.d1.content.versions[0].publishStatus, 'published');
  });
  await test('social publish: super_admin không có node roles → được phép, publishedBy lấy từ danh tính đã xác thực', async () => {
    const s = seedSocial(); delete dbData.roles['u-super'];
    eq((await callSocial('tok-super', null)).statusCode, 200);
    eq(s.store.d1.content.versions[0].publishedBy, 'super@x');
  });
  await test('social publish: agent → 403, draft không bị đổi trạng thái', async () => {
    const s = seedSocial();
    const res = await callSocial('tok-agent', 'agent');
    eq(res.statusCode, 403); eq(s.updates.length, 0); eq(writes.filter(w => /^facebook/.test(w.path)).length, 0);
  });
  await test('social publish: Facebook báo lỗi → draft ghi "failed"', async () => {
    const s = seedSocial(); delete dbData.facebookActiveToken;
    const res = await callSocial('tok-editor', 'editor');
    eq(res.statusCode, 400); eq(s.store.d1.content.versions[0].publishStatus, 'failed');
  });

  // ═══ 8. Không còn đường vòng qua Cloud Function cho publish ════════════════
  console.log('\n[8] Kiểm tra mã nguồn: không còn proxy facebookPublish');
  await test('routes/facebook.js & socialMediaCenter.js không gọi URL /facebookPublish', async () => {
    const a = fs.readFileSync(path.join(__dirname, '..', 'routes', 'facebook.js'), 'utf8');
    const b = fs.readFileSync(path.join(__dirname, '..', 'routes', 'socialMediaCenter.js'), 'utf8');
    assert(!/proxyToFunction\([^)]*'facebookPublish'/.test(a), 'facebook.js còn proxy facebookPublish');
    assert(!/\/facebookPublish/.test(b), 'socialMediaCenter.js còn gọi /facebookPublish');
  });

  console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' pass, ' + failed + ' fail');
  if (failed) { console.log('Thất bại:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
