// SECURITY — POST /v1/users/custom-claims: chỉ super_admin được gán super_admin.
// Chạy functions/routes/users.js + functions/shared/auth.js authenticate() THẬT,
// firebase-admin trỏ Auth + Database Emulator (không mock handler/auth).
// Cần emulator auth(9099)+database(9000), project pshop-music, user
// admin@test.local có roles/uid_admin.role=admin (xem tests/e2e/README.md).
// Chạy: node tests/custom-claims-security.test.js
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.GCLOUD_PROJECT = 'pshop-music';
const F = require('path').join(__dirname, '..', 'functions') + '/';
const rq = require('module').createRequire(F + 'index.js');
const admin = rq('firebase-admin');
admin.initializeApp({ projectId: 'pshop-music', databaseURL: 'http://127.0.0.1:9000?ns=pshop-music-default-rtdb' });
const { getDatabase, ServerValue } = rq('firebase-admin/database');
admin.database = getDatabase; admin.database.ServerValue = ServerValue; admin.auth = rq('firebase-admin/auth').getAuth;
const { handle } = require(F + 'routes/users.js');
const { authenticate } = require(F + 'shared/auth.js');
const mw = require(F + 'shared/middleware.js');
const PW = 'Test12345!';

async function call(body, token) {
  const req = { __pshPath: '/v1/users/custom-claims', method: 'POST', body, get: k => (k.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : '') };
  const auth = await authenticate(req);
  return new Promise(resolve => {
    const res = { status(c) { this.c = c; return this; }, json(j) { resolve({ status: this.c, body: j }); return this; } };
    Promise.resolve(handle(req, res, { sendSuccess: mw.sendSuccess, sendError: mw.sendError, auth })).catch(e => resolve({ status: 'THREW', body: e.message }));
  });
}
async function ensureUser(uid, email) {
  try { await admin.auth().getUser(uid); } catch (e) { await admin.auth().createUser({ uid, email, password: PW, emailVerified: true }); }
  await admin.auth().setCustomUserClaims(uid, null);
}
async function token(email) {
  const j = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) }).then(r => r.json());
  return j.idToken;
}
const claimsOf = async uid => JSON.stringify((await admin.auth().getUser(uid)).customClaims || {});

(async () => {
  const db = admin.database(); const out = [];
  const R = (n, ok, info) => out.push((ok ? 'PASS ' : 'FAIL ') + n + (info ? ' | ' + info : ''));
  // Người gọi: TEST_CC_ADMIN (admin thường), TEST_CC_SUPER (admin + superAdmins). Đích: TEST_CC_TARGET.
  await ensureUser('TEST_CC_ADMIN', 'test_cc_admin@test.local');
  await ensureUser('TEST_CC_SUPER', 'test_cc_super@test.local');
  await ensureUser('TEST_CC_TARGET', 'test_cc_target@test.local');
  await db.ref('roles/TEST_CC_ADMIN').set({ role: 'admin', email: 'test_cc_admin@test.local' });
  await db.ref('roles/TEST_CC_SUPER').set({ role: 'admin', email: 'test_cc_super@test.local' });
  await db.ref('superAdmins/TEST_CC_SUPER').set({ role: 'super_admin', email: 'test_cc_super@test.local' });
  const tA = await token('test_cc_admin@test.local'); const tS = await token('test_cc_super@test.local');

  let before = await claimsOf('TEST_CC_TARGET');
  let r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin' }, tA);
  R('1/8 admin → super_admin cho uid khác = 403, claims KHÔNG đổi', r.status === 403 && (await claimsOf('TEST_CC_TARGET')) === before, r.status + ' ' + (await claimsOf('TEST_CC_TARGET')));
  before = await claimsOf('TEST_CC_ADMIN');
  r = await call({ uid: 'TEST_CC_ADMIN', role: 'super_admin' }, tA);
  R('1b admin → tự gán super_admin cho chính mình = 403, claims KHÔNG đổi', r.status === 403 && (await claimsOf('TEST_CC_ADMIN')) === before, r.status);
  for (const role of ['business_admin', 'business_editor', 'business_viewer']) {
    r = await call({ uid: 'TEST_CC_TARGET', role, businessId: 'TEST_BIZ_CC' }, tA);
    const c = JSON.parse(await claimsOf('TEST_CC_TARGET'));
    R('2-4 admin → ' + role + ' = 200 (giữ hành vi cũ)', r.status === 200 && c.businessId === 'TEST_BIZ_CC' && c.roles && c.roles[role] === true, r.status + ' ' + JSON.stringify(c));
  }
  r = await call({ uid: 'TEST_CC_TARGET', role: 'business_admin' }, tA);
  R('admin → business_admin thiếu businessId = 400 (giữ hành vi cũ)', r.status === 400, r.status);
  r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin' }, tS);
  let c = JSON.parse(await claimsOf('TEST_CC_TARGET'));
  R('5/9 super_admin → super_admin cho uid khác = 200', r.status === 200 && c.roles && c.roles.super_admin === true, r.status + ' ' + JSON.stringify(c));
  // super_admin xác định qua claim roles.super_admin (không có node superAdmins)
  await admin.auth().setCustomUserClaims('TEST_CC_ADMIN', { roles: { super_admin: true } });
  const tAc = await token('test_cc_admin@test.local');
  await admin.auth().setCustomUserClaims('TEST_CC_TARGET', null);
  r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin' }, tAc);
  R('5b super_admin (qua claim) → super_admin = 200', r.status === 200 && JSON.parse(await claimsOf('TEST_CC_TARGET')).roles.super_admin === true, r.status);
  await admin.auth().setCustomUserClaims('TEST_CC_ADMIN', null);
  await admin.auth().setCustomUserClaims('TEST_CC_TARGET', null);
  r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin' });
  R('6 không token = 401', r.status === 401 && (await claimsOf('TEST_CC_TARGET')) === '{}', r.status);
  r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin' }, 'fake.token.value');
  R('7 token giả = 401', r.status === 401 && (await claimsOf('TEST_CC_TARGET')) === '{}', r.status);
  r = await call({ uid: 'TEST_CC_TARGET', role: 'super_admin', isSuperAdmin: true, callerRole: 'super_admin' }, tA);
  R('admin gửi kèm isSuperAdmin/callerRole trong body vẫn = 403', r.status === 403 && (await claimsOf('TEST_CC_TARGET')) === '{}', r.status);

  // Dọn dữ liệu TEST_*
  await db.ref('roles/TEST_CC_ADMIN').remove(); await db.ref('roles/TEST_CC_SUPER').remove(); await db.ref('superAdmins/TEST_CC_SUPER').remove();
  for (const u of ['TEST_CC_ADMIN', 'TEST_CC_SUPER', 'TEST_CC_TARGET']) await admin.auth().deleteUser(u).catch(() => {});
  out.forEach(x => console.log(x));
  const f = out.filter(x => x.startsWith('FAIL')).length;
  console.log(f ? 'custom-claims-security: FAILED (' + f + ')' : 'custom-claims-security: OK');
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
