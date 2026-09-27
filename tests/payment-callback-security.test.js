// API-01 (PAY-1) — payment callback FAIL-CLOSED, kiểm qua exports.apiGateway
// THẬT (index.js → router payments → shared/response.js), HTTP thật trên
// Firebase Emulator auth(9099)+database(9000), project pshop-music.
// Seed dữ liệu TEST_PAY_A / TEST_PAY_B riêng, dọn sạch khi kết thúc.
// Chạy: node tests/payment-callback-security.test.js  (hữu hạn, timeout 20s/request)
'use strict';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'pshop-music';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'pshop-music', databaseURL: 'http://127.0.0.1:9000?ns=pshop-music-default-rtdb', storageBucket: 'pshop-music.appspot.com' });
const F = require('path').join(__dirname, '..', 'functions') + '/';
const rq = require('module').createRequire(F + 'index.js');
const log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[TRACE]')) return; log(...a); };
const fx = require(F + 'index.js');
const admin = rq('firebase-admin'); const express = rq('express'); const db = admin.database();
const PW = 'Test12345!'; const A = 'TEST_PAY_A', B = 'TEST_PAY_B';
const USERS = {
  L_ADMIN: { roles: 'admin' }, L_EDITOR: { roles: 'editor' }, L_AGENT: { roles: 'agent' },
  A_ADMIN: { biz: A, role: 'business_admin' }, A_EDITOR: { biz: A, role: 'business_editor' }, A_VIEWER: { biz: A, role: 'business_viewer' },
  B_VIEWER: { biz: B, role: 'business_viewer' }, SUPER: { superAdmin: true }
};
const uidOf = k => 'PAYSEC_' + k; const emailOf = k => 'paysec.' + k.toLowerCase().replace(/_/g, '.') + '@test.local';
const T = {};
async function token(k) {
  if (T[k]) return T[k];
  const j = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailOf(k), password: PW, returnSecureToken: true }) }).then(r => r.json());
  return (T[k] = j.idToken);
}
function bizData(b) {
  const users = {}; for (const [k, u] of Object.entries(USERS)) if (u.biz === b) users[uidOf(k)] = { role: u.role };
  return { info: { businessId: b, displayName: b, ownerUid: uidOf(b === A ? 'A_ADMIN' : 'B_VIEWER'), status: 'active', plan: 'starter' }, users,
    orders: { ord1: { total: 100, paymentStatus: 'pending' } },
    payments: { pay1: { orderId: 'ord1', provider: 'vnpay', amount: 100, status: 'pending', transactionId: 'TX_' + b, businessId: b } } };
}
async function seed() {
  for (const [k, u] of Object.entries(USERS)) {
    try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {}
    await admin.auth().createUser({ uid: uidOf(k), email: emailOf(k), password: PW, emailVerified: true });
    if (u.biz) await admin.auth().setCustomUserClaims(uidOf(k), { businessId: u.biz, roles: { [u.role]: true } });
    await db.ref('roles/' + uidOf(k)).set(u.roles ? { role: u.roles, email: emailOf(k) } : null);
    await db.ref('superAdmins/' + uidOf(k)).set(u.superAdmin ? { role: 'super_admin', email: emailOf(k) } : null);
  }
  await db.ref('businesses/' + A).set(bizData(A)); await db.ref('businesses/' + B).set(bizData(B));
}
async function cleanup() {
  for (const k of Object.keys(USERS)) { try { await admin.auth().deleteUser(uidOf(k)); } catch (e) {} await db.ref('roles/' + uidOf(k)).remove(); await db.ref('superAdmins/' + uidOf(k)).remove(); }
  await db.ref('businesses/' + A).remove(); await db.ref('businesses/' + B).remove(); await db.ref('rateLimits').remove();
}
let base, server;
async function call(who, method, path, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
  if (who) h.Authorization = 'Bearer ' + await token(who);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), signal: ctl.signal });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch (e) { j = txt; }
    return { status: r.status, code: j && j.error && j.error.code };
  } catch (e) { return { status: 'ERR', code: e.name }; } finally { clearTimeout(t); }
}
const snapState = async () => JSON.stringify([await db.ref('businesses/' + A + '/payments').once('value').then(s => s.val()), await db.ref('businesses/' + A + '/orders').once('value').then(s => s.val()),
  await db.ref('businesses/' + B + '/payments').once('value').then(s => s.val()), await db.ref('businesses/' + B + '/orders').once('value').then(s => s.val())]);
(async () => {
  const out = []; const R = (n, pass, info) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (info ? ' | ' + info : ''));
  await seed();
  server = await new Promise(r => { const app = express(); app.use(express.json()); app.all('*', (q, s) => fx.apiGateway(q, s)); const x = app.listen(0, '127.0.0.1', () => r(x)); });
  base = 'http://127.0.0.1:' + server.address().port;
  const before = await snapState();
  const cbA = p => '/v1/businesses/' + A + '/payments/callback/' + p;
  const forged = { transactionId: 'TX_' + A, vnp_TxnRef: 'TX_' + A, orderId: 'TX_' + A, id: 'TX_' + A, event: 'payment.completed', status: 'paid' };
  // Bị từ chối = 4xx (không bao giờ 2xx/5xx). Thành viên hợp lệ của A đi tới
  // nhánh fail-closed của payments.js → đúng 403 FORBIDDEN; caller không phải
  // thành viên bị router tenant đứng trước chặn (401/403) — cũng không tới DB.
  const rej = r => typeof r.status === 'number' && r.status >= 400 && r.status < 500 && r.status !== 429;
  const failClosed = r => r.status === 403 && r.code === 'FORBIDDEN';
  const clearRL = () => db.ref('rateLimits').remove();
  // 1-6 + legacy/super: mọi caller → bị từ chối
  for (const who of [null, 'A_VIEWER', 'A_EDITOR', 'A_ADMIN', 'L_AGENT', 'L_EDITOR', 'L_ADMIN', 'SUPER', 'B_VIEWER']) {
    await clearRL();
    const member = ['A_VIEWER', 'A_EDITOR', 'A_ADMIN'].includes(who);
    for (const p of ['mock', 'vnpay', 'momo', 'cash']) { const r = await call(who, 'POST', cbA(p), forged); R('callback/' + p + ' ' + (who || 'ANON') + ' bị từ chối' + (member ? ' bởi fail-closed' : ''), member ? failClosed(r) : rej(r), r.status + ':' + r.code); }
  }
  await clearRL();
  // unknown provider / ký tự lạ / không provider
  for (const p of ['abc', 'unknown_provider', 'MOCK', 'x/y', '']) { const r = await call('A_ADMIN', 'POST', cbA(p), forged); R('provider "' + p + '" bị từ chối', p === 'x/y' || p === '' ? rej(r) : failClosed(r), r.status + ':' + r.code); }
  // malformed payload / chữ ký giả / businessId B trong body
  let r = await call('A_ADMIN', 'POST', cbA('vnpay'), '{not json', {}); R('payload malformed bị từ chối (không 2xx)', r.status >= 400 && r.status < 500, r.status + ':' + r.code);
  r = await call(null, 'POST', cbA('vnpay'), Object.assign({ vnp_SecureHash: 'deadbeef' }, forged), { 'X-Signature': 'forged' }); R('chữ ký giả bị từ chối', rej(r), r.status + ':' + r.code);
  r = await call(null, 'POST', cbA('vnpay'), {}); R('thiếu chữ ký + body rỗng bị từ chối', rej(r), r.status + ':' + r.code);
  r = await call('A_ADMIN', 'POST', cbA('vnpay'), Object.assign({ businessId: B, transactionId: 'TX_' + B }, {})); R('A gửi businessId/transactionId của B bị từ chối', failClosed(r), r.status + ':' + r.code);
  r = await call('A_ADMIN', 'POST', '/v1/businesses/' + B + '/payments/callback/vnpay', { transactionId: 'TX_' + B }); R('A gọi URL callback của B bị từ chối', rej(r), r.status + ':' + r.code);
  r = await call('A_ADMIN', 'POST', cbA('vnpay'), forged, { 'X-Business-Id': B }); R('header X-Business-Id=B bị từ chối', rej(r), r.status + ':' + r.code);
  for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) { r = await call('A_ADMIN', m, cbA('vnpay'), m === 'GET' ? undefined : forged); R(m + ' callback bị từ chối', failClosed(r), r.status + ':' + r.code); }
  // H: concurrency — 25 callback đồng thời
  await clearRL();
  const par = await Promise.all(Array.from({ length: 25 }, (_, i) => call(i % 2 ? 'A_ADMIN' : null, 'POST', cbA(i % 3 ? 'vnpay' : 'mock'), forged)));
  R('25 callback đồng thời đều bị từ chối', par.every(rej), par.map(x => x.status).join(','));
  // 8-10: không có state transition
  const after = await snapState();
  R('payment A/B vẫn pending, order A/B không đổi (DB giống hệt trước)', before === after);
  await clearRL();
  const pa = await db.ref('businesses/' + A + '/payments/pay1/status').once('value').then(s => s.val());
  const oa = await db.ref('businesses/' + A + '/orders/ord1/paymentStatus').once('value').then(s => s.val());
  R('payment A KHÔNG thành paid', pa === 'pending', pa); R('order A KHÔNG thành paid', oa === 'pending', oa);
  // E: manual admin flow giữ nguyên (không đổi PATCH)
  r = await call('A_VIEWER', 'PATCH', '/v1/businesses/' + A + '/payments/pay1', { status: 'paid' }); R('PATCH thủ công: viewer → 403', r.status === 403, r.status + ':' + r.code);
  r = await call('A_EDITOR', 'PATCH', '/v1/businesses/' + A + '/payments/pay1', { status: 'paid' }); R('PATCH thủ công: editor → 403', r.status === 403, r.status + ':' + r.code);
  r = await call('A_ADMIN', 'PATCH', '/v1/businesses/' + A + '/payments/pay1', { note: 'manual-check' }); R('PATCH thủ công: business_admin → 200 (giữ nguyên)', r.status === 200, r.status + ':' + r.code);
  r = await call('A_VIEWER', 'GET', '/v1/businesses/' + A + '/payments'); R('GET payments viewer vẫn 200', r.status === 200, r.status + ':' + r.code);
  r = await call('A_VIEWER', 'GET', '/v1/businesses/' + A + '/payments/pay1'); R('GET payment item viewer vẫn 200', r.status === 200, r.status + ':' + r.code);
  const pb = await db.ref('businesses/' + B + '/payments/pay1').once('value').then(s => s.val());
  R('payment B không bị đụng', pb.status === 'pending' && !pb.note);
  server.close(); await cleanup();
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('FAIL')).length;
  console.log(f ? f + ' FAILED' : 'payment-callback-security: ' + out.length + '/' + out.length + ' PASS');
  process.exit(f ? 1 : 0);
})().catch(async e => { console.log('FAILED harness: ' + e.message); try { await cleanup(); } catch (x) {} process.exit(1); });
