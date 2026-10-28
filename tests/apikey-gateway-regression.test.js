// REGRESSION — machine API key + Product CMS của `apiGateway` (mã đã triển khai ở Production, được bảo toàn bởi
// commit "chore(recovery): preserve deployed apiGateway source").
//
// Chạy exports.apiGateway THẬT qua HTTP, trên Firebase Emulator auth(9099) + database(9000), project demo-pshop.
// KHÔNG gọi Production: mọi fetch tới cloudfunctions.net / graph.facebook.com / openai bị chặn. Dữ liệu seed có
// tiền tố TEST_AK_ và được dọn khi kết thúc.
//
// Test này đặc trưng hoá hành vi HIỆN CÓ (không thêm tính năng): phải PASS nguyên vẹn trên cả commit phục hồi lẫn
// nhánh release có bản vá Facebook — chứng minh bản vá không làm mất API key / IP allowlist / Product CMS.
//
//   firebase emulators:exec --only auth,database --project demo-pshop "node tests/apikey-gateway-regression.test.js"
//   (cần NODE_PATH trỏ tới thư mục có firebase-admin, firebase-functions, express)
'use strict';
const hostDb = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
const hostAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(hostDb) || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostAuth)) {
  console.error('Từ chối chạy: cần FIREBASE_DATABASE_EMULATOR_HOST và FIREBASE_AUTH_EMULATOR_HOST trỏ localhost (chạy qua firebase emulators:exec).');
  process.exit(2);
}
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-pshop', databaseURL: 'http://' + hostDb + '?ns=demo-pshop', storageBucket: 'demo-pshop.appspot.com' });

const realFetch = global.fetch;
const blocked = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(url, opts);
  blocked.push(u);
  throw new Error('Test chặn request ra ngoài: ' + u);
};

const path = require('path');
const F = path.join(__dirname, '..', 'functions') + '/';
const rq = require('module').createRequire(F + 'index.js');
const log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[TRACE]')) return; log(...a); };
const fx = require(F + 'index.js');
const admin = rq('firebase-admin');
const express = rq('express');
const { hashApiKey } = require(F + 'shared/apiKeyAuth.js');
const db = admin.database();

const BIZ = 'pshop-music';
const IP_OK = '198.51.100.7', IP_BAD = '198.51.100.8';
const RAW = { WRITE: 'psh_TESTAK_write_0123456789abcdef', READ: 'psh_TESTAK_read__0123456789abcdef', NOPERM: 'psh_TESTAK_noper_0123456789abcdef', OFF: 'psh_TESTAK_off___0123456789abcdef', OLD: 'psh_TESTAK_old___0123456789abcdef', UNKNOWN: 'psh_TESTAK_nokey_0123456789abcdef' };
const KEYS = {
  TEST_AK_write: { name: 'TEST_AK write', hashedKey: hashApiKey(RAW.WRITE), status: 'active', permissions: ['products.write'], allowedIPs: [IP_OK] },
  TEST_AK_read: { name: 'TEST_AK read', hashedKey: hashApiKey(RAW.READ), status: 'active', permissions: ['products.read'] },
  TEST_AK_noperm: { name: 'TEST_AK noperm', hashedKey: hashApiKey(RAW.NOPERM), status: 'active', permissions: [] },
  TEST_AK_off: { name: 'TEST_AK off', hashedKey: hashApiKey(RAW.OFF), status: 'disabled', permissions: ['products.write'] },
  TEST_AK_old: { name: 'TEST_AK old', hashedKey: hashApiKey(RAW.OLD), status: 'active', permissions: ['products.write'], expiresAt: Date.now() - 60000 }
};
const PW = 'Test12345!';
const USERS = { ADMIN: { role: 'admin' }, EDITOR: { role: 'editor' } };
const uidOf = k => 'TEST_AK_' + k; const emailOf = k => 'test.ak.' + k.toLowerCase() + '@test.local';
const createdProducts = new Set();
let base, server;

async function seed() {
  for (const [k, u] of Object.entries(USERS)) {
    try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {}
    await admin.auth().createUser({ uid: uidOf(k), email: emailOf(k), password: PW, emailVerified: true });
    await db.ref('roles/' + uidOf(k)).set({ role: u.role, email: emailOf(k) });
  }
  for (const [id, k] of Object.entries(KEYS)) await db.ref('businesses/' + BIZ + '/apiKeys/' + id).set(k);
  await db.ref('products/TEST_AK_pub').set({ id: 'TEST_AK_pub', name: 'TEST_AK published', pubStatus: 'published', status: 'active' });
  await db.ref('products/TEST_AK_draft').set({ id: 'TEST_AK_draft', name: 'TEST_AK draft', pubStatus: 'draft', status: 'active' });
}
async function cleanup() {
  for (const k of Object.keys(USERS)) { try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {} await db.ref('roles/' + uidOf(k)).remove(); }
  for (const id of Object.keys(KEYS)) await db.ref('businesses/' + BIZ + '/apiKeys/' + id).remove();
  const prods = (await db.ref('products').once('value')).val() || {};
  for (const [id, p] of Object.entries(prods)) if (createdProducts.has(id) || id.startsWith('TEST_AK_') || String(p && p.name || '').startsWith('TEST_AK')) await db.ref('products/' + id).remove();
  await db.ref('rateLimits').remove();
}
const T = {};
async function token(k) {
  if (T[k]) return T[k];
  const r = await realFetch('http://' + hostAuth + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailOf(k), password: PW, returnSecureToken: true }) });
  return (T[k] = (await r.json()).idToken);
}
async function call(opts, method, p, body) {
  const h = { 'Content-Type': 'application/json' };
  if (opts.key) h.Authorization = 'Bearer ' + opts.key;
  if (opts.user) h.Authorization = 'Bearer ' + await token(opts.user);
  if (opts.biz !== undefined) h['X-PSH-Business-ID'] = opts.biz;
  if (opts.ip) h['X-Forwarded-For'] = opts.ip;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await realFetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => null);
    return { status: r.status, code: j && j.error && j.error.code, msg: j && j.error && j.error.message, data: j && j.data };
  } catch (e) { return { status: 'ERR', code: e.name }; } finally { clearTimeout(t); }
}
const prodCount = async () => Object.keys((await db.ref('products').once('value')).val() || {}).length;
const names = (d) => (Array.isArray(d) ? d : Object.values(d || {})).map(x => x && x.name);

(async () => {
  const out = []; const R = (n, pass, info) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? ' | ' + info : ''));
  await seed();
  server = await new Promise(r => { const app = express(); app.set('trust proxy', true); app.use(express.json()); app.all('*', (q, s) => fx.apiGateway(q, s)); const x = app.listen(0, '127.0.0.1', () => r(x)); });
  base = 'http://127.0.0.1:' + server.address().port;
  const OK = { key: RAW.WRITE, biz: BIZ, ip: IP_OK };
  const clr = () => db.ref('rateLimits').remove();

  // ── Tạo mới qua API key ghi: bị ép draft ────────────────────────────────
  await clr(); let n0 = await prodCount();
  let r = await call(OK, 'POST', '/v1/products', { name: 'TEST_AK created by key', pubStatus: 'published', price: '1' });
  if (r.data && r.data.id) createdProducts.add(r.data.id);
  let rec = r.data && r.data.id ? (await db.ref('products/' + r.data.id).once('value')).val() : null;
  R('API key products.write + IP hợp lệ → POST /v1/products 201', r.status === 201, r.status + ' ' + (r.code || ''));
  R('...bản ghi tạo qua API key bị ÉP pubStatus="draft" dù body gửi "published"', !!rec && rec.pubStatus === 'draft', rec && rec.pubStatus);
  R('...đã tạo đúng 1 bản ghi', (await prodCount()) === n0 + 1);

  // ── Cập nhật qua API key ghi: bị ép draft ──────────────────────────────
  await clr();
  r = await call(OK, 'PATCH', '/v1/products/TEST_AK_pub', { name: 'TEST_AK published edited', pubStatus: 'published' });
  rec = (await db.ref('products/TEST_AK_pub').once('value')).val();
  R('API key products.write → PATCH sản phẩm 200 và ÉP pubStatus="draft"', r.status === 200 && rec.pubStatus === 'draft' && rec.name === 'TEST_AK published edited', r.status + ' ' + (rec && rec.pubStatus));
  await db.ref('products/TEST_AK_pub').set({ id: 'TEST_AK_pub', name: 'TEST_AK published', pubStatus: 'published', status: 'active' });

  // ── IP allowlist ───────────────────────────────────────────────────────
  // Hành vi thực tế của gateway: key bị từ chối (sai IP/không tồn tại/vô hiệu/hết hạn) KHÔNG làm request thất bại ngay
  // mà bị coi như CHƯA XÁC THỰC → các route ghi trả 403 PERMISSION_DENIED và route đọc chỉ trả phần công khai.
  await clr(); n0 = await prodCount();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_BAD }, 'POST', '/v1/products', { name: 'TEST_AK from bad ip' });
  R('IP KHÔNG nằm trong allowedIPs → 403 PERMISSION_DENIED, không tạo gì', r.status === 403 && r.code === 'PERMISSION_DENIED' && (await prodCount()) === n0, r.status + ' ' + r.code);
  await clr();
  const badIpRead = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_BAD }, 'GET', '/v1/products');
  R('IP sai: GET chỉ thấy phần công khai (không thấy draft)', badIpRead.status === 200 && !names(badIpRead.data).includes('TEST_AK draft'), badIpRead.status);
  await clr();
  const okIpRead = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'GET', '/v1/products');
  R('IP đúng (cùng key): GET thấy cả draft', okIpRead.status === 200 && names(okIpRead.data).includes('TEST_AK draft'), okIpRead.status);
  await clr();
  r = await call({ key: RAW.READ, biz: BIZ, ip: IP_BAD }, 'GET', '/v1/products');
  R('Key không có allowedIPs → mọi IP đều qua (GET thấy draft)', r.status === 200 && names(r.data).includes('TEST_AK draft'), r.status);

  // ── Business bắt buộc là pshop-music ───────────────────────────────────
  await clr(); n0 = await prodCount();
  for (const biz of [undefined, '', 'other-biz']) {
    r = await call({ key: RAW.WRITE, biz, ip: IP_OK }, 'POST', '/v1/products', { name: 'TEST_AK wrong biz' });
    R('X-PSH-Business-ID ' + JSON.stringify(biz) + ' → 403 PERMISSION_DENIED, không tạo gì', r.status === 403 && r.code === 'PERMISSION_DENIED' && (await prodCount()) === n0, r.status + ' ' + r.code);
  }

  // ── Quyền đọc/ghi theo permission ──────────────────────────────────────
  await clr();
  const anon = await call({}, 'GET', '/v1/products');
  const rd = await call({ key: RAW.READ, biz: BIZ }, 'GET', '/v1/products');
  R('Công chúng (không đăng nhập) thấy sản phẩm đã đăng, KHÔNG thấy draft', anon.status === 200 && names(anon.data).includes('TEST_AK published') && !names(anon.data).includes('TEST_AK draft'), anon.status);
  R('API key products.read thấy cả draft', rd.status === 200 && names(rd.data).includes('TEST_AK draft') && names(rd.data).includes('TEST_AK published'), rd.status);
  await clr(); n0 = await prodCount();
  r = await call({ key: RAW.READ, biz: BIZ }, 'POST', '/v1/products', { name: 'TEST_AK read-only create' });
  R('API key chỉ products.read → POST 403 PERMISSION_DENIED', r.status === 403 && r.code === 'PERMISSION_DENIED' && (await prodCount()) === n0, r.status + ' ' + r.code);
  r = await call({ key: RAW.READ, biz: BIZ }, 'PATCH', '/v1/products/TEST_AK_pub', { name: 'TEST_AK hacked' });
  R('API key chỉ products.read → PATCH 403, dữ liệu không đổi', r.status === 403 && (await db.ref('products/TEST_AK_pub/name').once('value')).val() === 'TEST_AK published', r.status);
  await clr();
  r = await call({ key: RAW.NOPERM, biz: BIZ }, 'POST', '/v1/products', { name: 'TEST_AK no perm' });
  const np = await call({ key: RAW.NOPERM, biz: BIZ }, 'GET', '/v1/products');
  R('API key không có permission nào → POST 403, GET chỉ thấy phần công khai', r.status === 403 && np.status === 200 && !names(np.data).includes('TEST_AK draft'), r.status + '/' + np.status);
  await clr();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'DELETE', '/v1/products/TEST_AK_pub');
  R('API key KHÔNG xoá được sản phẩm (chỉ Admin)', r.status === 403 && (await db.ref('products/TEST_AK_pub').once('value')).exists(), r.status);

  // ── Trạng thái key: không hợp lệ ⇒ coi như chưa xác thực ──────────────────
  await clr(); n0 = await prodCount();
  for (const [label, raw] of [['không tồn tại', RAW.UNKNOWN], ['bị vô hiệu', RAW.OFF], ['hết hạn', RAW.OLD]]) {
    r = await call({ key: raw, biz: BIZ }, 'POST', '/v1/products', { name: 'TEST_AK ' + label });
    R('API key ' + label + ' → 403 PERMISSION_DENIED, không tạo gì', r.status === 403 && r.code === 'PERMISSION_DENIED' && (await prodCount()) === n0, r.status + ' ' + r.code);
  }
  const lu = (await db.ref('businesses/' + BIZ + '/apiKeys/TEST_AK_off/lastUsedAt').once('value')).val();
  R('Key bị vô hiệu không được ghi lastUsedAt', lu === null, String(lu));

  // ── API key KHÔNG nâng quyền ngoài Product CMS ───────────────────────────
  await clr();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'POST', '/v1/categories', { name: 'TEST_AK cat', code: 'test-ak-cat', label: 'TEST_AK cat' });
  R('API key products.write KHÔNG tạo được danh mục (/v1/categories POST bị từ chối)', r.status >= 401 && r.status <= 403, r.status + ' ' + r.code);
  await clr();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'GET', '/v1/users');
  R('API key KHÔNG đọc được /v1/users (403)', r.status === 403 || r.status === 401, r.status + ' ' + r.code);
  await clr();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'GET', '/v1/orders');
  R('API key KHÔNG đọc được /v1/orders (không trả dữ liệu 200)', r.status !== 200, r.status + ' ' + r.code);
  await clr();
  r = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'GET', '/v1/categories');
  const anonCat = await call({}, 'GET', '/v1/categories');
  R('/v1/categories với API key chỉ nhận đúng phần công khai như người chưa đăng nhập', r.status === anonCat.status && JSON.stringify(r.data) === JSON.stringify(anonCat.data), r.status + '/' + anonCat.status);

  // ── OpenClaw capabilities ─────────────────────────────────────────────
  // Gateway chỉ xác thực psh_ key trên /v1/products*, nên với route này key bị từ chối 401 (nhánh api_key trong
  // routes/openclaw.js hiện không với tới được qua gateway). Test khoá đúng hành vi đã triển khai.
  await clr();
  const capW = await call({ key: RAW.WRITE, biz: BIZ, ip: IP_OK }, 'GET', '/v1/openclaw/capabilities');
  R('OpenClaw capabilities với psh_ key → 401 (key chỉ có hiệu lực trên /v1/products*)', capW.status === 401, capW.status + ' ' + capW.code);
  await clr();
  const capAdmin = await call({ user: 'ADMIN' }, 'GET', '/v1/openclaw/capabilities');
  R('OpenClaw capabilities với Admin (Firebase ID token) → 200, có danh sách nhóm', capAdmin.status === 200 && Array.isArray(capAdmin.data && capAdmin.data.capabilities), capAdmin.status);

  // ── Đường Firebase-auth hiện hữu không đổi ────────────────────────────
  await clr(); n0 = await prodCount();
  r = await call({ user: 'ADMIN' }, 'POST', '/v1/products', { name: 'TEST_AK by admin', pubStatus: 'published' });
  if (r.data && r.data.id) createdProducts.add(r.data.id);
  rec = r.data && r.data.id ? (await db.ref('products/' + r.data.id).once('value')).val() : null;
  R('Admin (Firebase ID token) POST /v1/products 201 và KHÔNG bị ép draft', r.status === 201 && rec && rec.pubStatus === 'published', r.status + ' ' + (rec && rec.pubStatus));
  await clr();
  r = await call({ user: 'EDITOR' }, 'PATCH', '/v1/products/TEST_AK_draft', { pubStatus: 'published' });
  R('Editor (Firebase ID token) PATCH giữ nguyên pubStatus do người dùng gửi', r.status === 200 && (await db.ref('products/TEST_AK_draft/pubStatus').once('value')).val() === 'published', r.status);
  await clr(); n0 = await prodCount();
  r = await call({}, 'POST', '/v1/products', { name: 'TEST_AK anonymous' });
  R('Không đăng nhập POST /v1/products → bị từ chối, không tạo gì', r.status >= 401 && r.status <= 403 && (await prodCount()) === n0, r.status + ' ' + r.code);
  r = await call({ key: 'Bearer-not-psh-token' }, 'POST', '/v1/products', { name: 'TEST_AK bad token' });
  R('Bearer không phải ID token hợp lệ và không phải psh_ → bị từ chối', r.status >= 401 && r.status <= 403 && (await prodCount()) === n0, r.status + ' ' + r.code);

  // ── Không rò ra ngoài ─────────────────────────────────────────────────
  R('Không có request nào ra ngoài emulator', blocked.length === 0, blocked.length);

  server.close(); await cleanup();
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('FAIL')).length;
  console.log(f ? f + ' FAILED' : 'apikey-gateway-regression: ' + out.length + '/' + out.length + ' PASS');
  process.exit(f ? 1 : 0);
})().catch(async e => { console.log('FAILED harness: ' + (e && e.stack)); try { await cleanup(); } catch (x) {} process.exit(1); });
