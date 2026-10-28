// G1O — Bằng chứng THỰC trên Realtime Database Emulator: claim OAuth state nguyên tử + ghi token
// một lệnh + ngắt kết nối. Dùng Admin SDK THẬT (firebase-admin) và hàm THẬT
// functions/shared/fbConnectionPatch.js; chỉ Auth (getUser) và Graph API bị thay bằng stub.
//
// Chạy (KHÔNG kết nối production; project demo-pshop; host phải là localhost):
//   NODE_PATH=<dir có firebase-admin> npx firebase emulators:exec --only database \
//     --project demo-pshop "node tests/facebook-oauth-state-emulator.test.js"
'use strict';
const assert = require('assert');
const Module = require('module');

const hostEnv = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(hostEnv)) {
  console.error('Từ chối chạy: cần FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:<port> (nhận "' + hostEnv + '"). Chạy qua firebase emulators:exec.');
  process.exit(2);
}
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const realAdmin = require('firebase-admin');
realAdmin.initializeApp({ projectId: 'demo-pshop', databaseURL: 'http://' + hostEnv + '?ns=demo-pshop' });
// API modular (firebase-admin >= 10): chạy được cả v13 lẫn v14 (v14 đã bỏ admin.database()).
const { getDatabase } = require('firebase-admin/database');
const rdb = getDatabase();

const authStub = {
  getUser: async (uid) => ({ uid, email: uid + '@test', disabled: uid === 'u-disabled' }),
  verifyIdToken: async () => { throw new Error('không dùng trong test này'); }
};
const proxyAdmin = { database: () => rdb, auth: () => authStub, apps: realAdmin.apps };
const origLoad = Module._load;
Module._load = function (request) { return request === 'firebase-admin' ? proxyAdmin : origLoad.apply(this, arguments); };
const fbConn = require('../functions/shared/fbConnectionPatch');

function graphStub(delayMs) {
  const calls = [];
  const sleep = () => new Promise(r => setTimeout(r, delayMs || 0));
  return {
    calls,
    exchangeCodeForToken: async () => { calls.push('code'); await sleep(); return { access_token: 's' }; },
    exchangeForLongLivedToken: async () => { calls.push('long'); return { access_token: 'LONG', expires_in: 3600 }; },
    getManagedPages: async () => { calls.push('pages'); return { data: [{ id: 'p1', name: 'P1', access_token: 'PT1' }] }; }
  };
}
const val = async (p) => (await rdb.ref(p).once('value')).val();
const cb = (state, api) => fbConn.processOAuthCallback({ code: 'c', state, appSecret: 's', graphApi: api, redirectUri: 'r' });

(async () => {
  let ok = 0, bad = 0;
  async function t(name, fn) { try { await rdb.ref().set(null); await fn(); console.log('  ✔ ' + name); ok++; } catch (e) { console.log('  ✘ ' + name + ' — ' + e.message); bad++; } }

  await t('1 state, 8 callback SONG SONG (Admin SDK + emulator thật): đúng 1 thắng, 7 bị từ chối, state bị xoá', async () => {
    await rdb.ref('superAdmins/u1').set({ role: 'super_admin' });
    await rdb.ref('facebookOAuthState/S1').set({ uid: 'u1', createdAt: Date.now() });
    const apis = Array.from({ length: 8 }, () => graphStub(5));
    const res = await Promise.allSettled(apis.map(a => cb('S1', a)));
    const won = res.filter(r => r.status === 'fulfilled').length;
    assert.strictEqual(won, 1, 'số callback thành công = ' + won);
    assert.strictEqual(apis.filter(a => a.calls.length > 0).length, 1, 'chỉ 1 callback được phép chạm tới Graph API');
    assert.strictEqual(await val('facebookOAuthState/S1'), null);
    assert.strictEqual((await val('facebookUserToken')).obtainedBy, 'u1');
  });

  await t('lặp 15 lần với state mới mỗi lần: luôn đúng 1 người thắng (không flaky)', async () => {
    await rdb.ref('superAdmins/u1').set({ role: 'super_admin' });
    for (let i = 0; i < 15; i++) {
      await rdb.ref('facebookUserToken').set(null);
      await rdb.ref('facebookOAuthState/R' + i).set({ uid: 'u1', createdAt: Date.now() });
      const res = await Promise.allSettled([cb('R' + i, graphStub(2)), cb('R' + i, graphStub(2)), cb('R' + i, graphStub(2))]);
      assert.strictEqual(res.filter(r => r.status === 'fulfilled').length, 1, 'vòng ' + i);
    }
  });

  await t('state hết hạn: bị từ chối, bị đốt, KHÔNG có token nào được ghi', async () => {
    await rdb.ref('superAdmins/u1').set({ role: 'super_admin' });
    await rdb.ref('facebookOAuthState/E1').set({ uid: 'u1', createdAt: Date.now() - 6 * 60 * 1000 });
    const api = graphStub();
    await assert.rejects(() => cb('E1', api), /hết hạn/);
    assert.strictEqual(api.calls.length, 0);
    assert.strictEqual(await val('facebookOAuthState/E1'), null);
    assert.strictEqual(await val('facebookUserToken'), null);
    assert.strictEqual(await val('facebookPageTokens'), null);
  });

  await t('người khởi tạo không còn là super_admin: từ chối, KHÔNG ghi token', async () => {
    await rdb.ref('superAdmins/u2').set(true); // schema lỏng: Rules coi là super, backend thì không
    await rdb.ref('facebookOAuthState/N1').set({ uid: 'u2', createdAt: Date.now() });
    const api = graphStub();
    await assert.rejects(() => cb('N1', api), /Super Admin/);
    assert.strictEqual(api.calls.length, 0);
    assert.strictEqual(await val('facebookUserToken'), null);
  });

  await t('tài khoản bị khoá: từ chối', async () => {
    await rdb.ref('superAdmins/u-disabled').set({ role: 'super_admin' });
    await rdb.ref('facebookOAuthState/D1').set({ uid: 'u-disabled', createdAt: Date.now() });
    await assert.rejects(() => cb('D1', graphStub()), /khoá/);
    assert.strictEqual(await val('facebookUserToken'), null);
  });

  await t('luồng hợp lệ: 3 node token xuất hiện cùng lúc (1 lệnh update đa-đường-dẫn)', async () => {
    await rdb.ref('superAdmins/u1').set({ role: 'super_admin' });
    await rdb.ref('facebookOAuthState/OK1').set({ uid: 'u1', createdAt: Date.now() });
    await cb('OK1', graphStub());
    assert.ok(await val('facebookPendingPages/u1'));
    assert.strictEqual((await val('facebookPageTokens/u1/p1')).accessToken, 'PT1');
    assert.strictEqual((await val('facebookUserToken')).accessToken, 'LONG');
  });

  await t('disconnect (Admin SDK thật): xoá token toàn cục + dữ liệu chờ chọn của NGƯỜI GỌI; giữ của uid khác', async () => {
    await rdb.ref('facebookActiveToken').set({ pageId: 'p1', accessToken: 'A' });
    await rdb.ref('facebookUserToken').set({ accessToken: 'U' });
    await rdb.ref('facebookPageTokens/uA/p1').set({ accessToken: 'X' });
    await rdb.ref('facebookPageTokens/uB/p2').set({ accessToken: 'Y' });
    await rdb.ref('facebookPendingPages/uA').set({ pages: [{ id: 'p1', name: 'P1' }] });
    await rdb.ref('facebookPendingPages/uB').set({ pages: [{ id: 'p2', name: 'P2' }] });
    await rdb.ref('facebookConnection').set({ status: 'connected', pageId: 'p1' });
    await rdb.ref('facebookAppConfig/appId').set('123456');
    await fbConn.disconnectFacebook('uA');
    assert.strictEqual(await val('facebookActiveToken'), null);
    assert.strictEqual(await val('facebookUserToken'), null);
    assert.strictEqual(await val('facebookPageTokens/uA'), null);
    assert.strictEqual(await val('facebookPendingPages/uA'), null);
    assert.ok(await val('facebookPageTokens/uB/p2'), 'KHÔNG được xoá token chờ chọn của uid khác');
    assert.ok(await val('facebookPendingPages/uB'), 'KHÔNG được xoá danh sách chờ chọn của uid khác');
    assert.deepStrictEqual(await val('facebookConnection'), { status: 'not_connected' });
    assert.strictEqual(await val('facebookAppConfig/appId'), '123456', 'App ID không được bị xoá');
  });

  console.log(bad ? `facebook-oauth-state-emulator: FAILED (${bad}/${ok + bad})` : `facebook-oauth-state-emulator: OK (${ok} case, Emulator + Admin SDK thật)`);
  await realAdmin.deleteApp(realAdmin.getApp());
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
