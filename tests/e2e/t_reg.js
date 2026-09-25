process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.GCLOUD_PROJECT = 'pshop-music';
const admin = require(require.resolve('firebase-admin',{paths:['/home/user/pshop-music/functions']}));
const {getDatabase,ServerValue}=require(require.resolve('firebase-admin/database',{paths:['/home/user/pshop-music/functions']}));const {getAuth}=require(require.resolve('firebase-admin/auth',{paths:['/home/user/pshop-music/functions']}));admin.database=getDatabase;admin.database.ServerValue=ServerValue;admin.auth=getAuth;
admin.initializeApp({ projectId: 'pshop-music', databaseURL: 'http://127.0.0.1:9000?ns=pshop-music-default-rtdb' });
const reg = require('/home/user/pshop-music/functions/routes/registration.js');
const mw = require('/home/user/pshop-music/functions/shared/middleware');
function call(path, body) {
  return new Promise(resolve => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() { return this; }, setHeader() {}, json(d) { resolve({ code: this.statusCode, d }); }, send(d) { resolve({ code: this.statusCode, d }); } };
    const req = { __pshPath: path, method: 'POST', body, headers: {}, get: () => undefined };
    Promise.resolve((reg.handle || reg)(req, res, { sendSuccess: mw.sendSuccess, sendError: mw.sendError })).catch(e => resolve({ err: e.message }));
  });
}
(async () => {
  const r = await call('/v1/register', { email: 'attacker@evil.test', password: 'Passw0rd!', displayName: 'Evil Shop' });
  console.log('POST /v1/register KHÔNG token →', r.code, r.d && (r.d.success !== undefined ? 'success=' + r.d.success : ''), r.err || '');
  const u = await admin.auth().getUserByEmail('attacker@evil.test');
  const role = (await admin.database().ref('roles/' + u.uid).once('value')).val();
  console.log('roles/<uid> sau khi đăng ký công khai:', JSON.stringify(role && { role: role.role }));
  const v = await call('/v1/register/verify-email', { uid: 'uid_norole' });
  console.log('POST /v1/register/verify-email KHÔNG token →', v.code, '| emailVerified(uid_norole) =', (await admin.auth().getUser('uid_norole')).emailVerified);
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
