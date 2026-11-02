/*
 * tests/telegramConfigAdmin.test.js — CMS quản lý cấu hình Telegram Publisher (telegramPublisherConfig).
 *
 * Chạy: node tests/telegramConfigAdmin.test.js   (từ thư mục functions/). Không gọi mạng, không chạm Firebase thật:
 * RTDB + Auth được thay bằng bản giả trong bộ nhớ; mã THẬT được chạy: shared/telegramConfigAdmin.js, guardSuperAdmin
 * (shared/fbConnectionPatch.js) và nạp index.js thật để kiểm export + binding secret.
 * Kiểm: (1) phân quyền server (không token / token sai / admin / editor / super_admin); (2) validation; (3) không lộ/không ghi secret;
 *       (4) dryRun luôn true; (5) giữ nguyên khoá khác; (6) không đổi quyền; (7) Rules không đổi; (8) UI không có ô secret/dryRun.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const admin = require('firebase-admin');

let passed = 0, failed = 0; const failures = [];
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

// ── RTDB giả (đủ cho ref().once/update/push/set) ──────────────────────────────
let store = {};
const writes = [];
const getAt = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null || typeof o !== 'object' ? undefined : o[k]), store);
function fakeDb() {
  return {
    ref(p) {
      return {
        once: async () => { const v = getAt(p); return { val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined && v !== null }; },
        update: async (obj) => { writes.push({ op: 'update', p, keys: Object.keys(obj) }); const parts = p.split('/').filter(Boolean); let o = store; for (const k of parts) { o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; o = o[k]; } for (const k of Object.keys(obj)) o[k] = JSON.parse(JSON.stringify(obj[k])); },
        transaction: async (fn) => { const cur = getAt(p); const nxt = fn(cur === undefined ? null : JSON.parse(JSON.stringify(cur))); if (nxt === undefined) return { committed: false }; writes.push({ op: 'transaction', p, keys: Object.keys(nxt) }); const parts = p.split('/').filter(Boolean); let o = store; for (const k of parts.slice(0, -1)) { o = o[k]; } o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(nxt)); return { committed: true }; },
        set: async () => { writes.push({ op: 'set', p }); }, push: () => ({ key: 'k', set: async () => { writes.push({ op: 'push', p }); } })
      };
    }
  };
}
const UIDS = { sup: 'super_admin', adm: 'admin', edi: 'editor' };
admin.database = fakeDb;
admin.auth = () => ({ verifyIdToken: async (t) => { if (UIDS[t] === undefined && t !== 'plain') throw new Error('bad token'); return { uid: t, email: t + '@x' }; } });

function seed() {
  store = {
    superAdmins: { sup: { role: 'super_admin' } },
    roles: { adm: 'admin', edi: 'editor', plain: 'agent' },
    facebookConnection: { status: 'connected', pageId: '1122', pageName: 'Pshop Music', isMock: false, connectedBy: 'x@x' },
    facebookActiveToken: { pageId: '1122', accessToken: 'PAGE-ACCESS-TOKEN-SECRET' },
    telegramConfig: { chatId: '555', approverIds: ['777'], approverMap: { 777: 'adm' }, dryRun: true, publishRoles: ['admin'], allowedPageIds: ['9'], allowGatewayCallback: false,
      token: 'BOT-TOKEN-SECRET', botToken: 'BOT-TOKEN-SECRET2', secret: 'WH-SECRET' }
  };
  writes.length = 0;
}

const GOOD = { chatId: '-1001234567890', approverIds: ['777', '888'], approverMap: { 777: 'adm', 888: 'edi' }, dryRun: true };
const { handle, validateConfigInput } = require('../shared/telegramConfigAdmin');
const fbConn = require('../shared/fbConnectionPatch');
async function call(method, token, body) {
  const req = { method, body, get: (h) => (/^authorization$/i.test(h) && token ? 'Bearer ' + token : '') };
  let code = 200, json = null;
  const res = { status(c) { code = c; return this; }, json(j) { json = j; return this; } };
  await handle(req, res, { guardSuperAdmin: fbConn.guardSuperAdmin, audit: async () => {} });
  return { code, json };
}
const SECRETS = ['BOT-TOKEN-SECRET', 'BOT-TOKEN-SECRET2', 'WH-SECRET', 'PAGE-ACCESS-TOKEN-SECRET'];
const noSecret = (x) => { const s = JSON.stringify(x); for (const k of SECRETS) assert(s.indexOf(k) < 0, 'lộ secret: ' + k); };

// ── Phân quyền ────────────────────────────────────────────────────────────────
for (const m of ['GET', 'POST']) {
  test(m + ' không có Authorization ⇒ 401, không đọc/ghi', async () => { seed(); const r = await call(m, null, GOOD); eq(r.code, 401); eq(writes.length, 0); });
  test(m + ' token sai ⇒ 401', async () => { seed(); eq((await call(m, 'forged', GOOD)).code, 401); eq(writes.length, 0); });
  test(m + ' admin ⇒ 403, không ghi', async () => { seed(); const r = await call(m, 'adm', GOOD); eq(r.code, 403); eq(writes.length, 0); noSecret(r.json); });
  test(m + ' editor ⇒ 403, không ghi', async () => { seed(); eq((await call(m, 'edi', GOOD)).code, 403); eq(writes.length, 0); });
  test(m + ' người dùng có token hợp lệ nhưng không có superAdmins ⇒ 403', async () => { seed(); eq((await call(m, 'plain', GOOD)).code, 403); eq(writes.length, 0); });
  test(m + ' superAdmins/{uid} tồn tại nhưng role ≠ super_admin ⇒ 403 (so sánh chặt)', async () => { seed(); store.superAdmins.adm = { role: 'admin' }; eq((await call(m, 'adm', GOOD)).code, 403); eq(writes.length, 0); });
}
test('PUT/DELETE ⇒ 405', async () => { seed(); eq((await call('PUT', 'sup', GOOD)).code, 405); eq((await call('DELETE', 'sup')).code, 405); });

// ── Đọc (GET) ─────────────────────────────────────────────────────────────────
test('super_admin GET ⇒ 200, đủ trường cần hiển thị', async () => {
  seed(); const r = await call('GET', 'sup'); eq(r.code, 200);
  const c = r.json.config;
  eq(c.chatId, '555'); eq(c.approverIds, ['777']); eq(c.approverMap, { 777: 'adm' }); eq(c.dryRun, true); eq(c.effectiveMode, 'dry-run');
  eq(c.activePage, { connected: true, pageId: '1122', pageName: 'Pshop Music', isMock: false, status: 'connected' });
  eq(c.allowedPageIds, ['9']);
  eq(c.mappingStatus, { 777: 'role:admin' });
});
test('GET KHÔNG lộ token/secret dù RTDB còn trường bí mật cũ và facebookActiveToken có token', async () => {
  seed(); const r = await call('GET', 'sup'); noSecret(r.json);
  for (const k of ['token', 'botToken', 'secret', 'accessToken']) assert(JSON.stringify(r.json).indexOf('"' + k + '"') < 0, 'có khoá ' + k);
});
test('GET chỉ đọc: không ghi gì vào RTDB', async () => { seed(); await call('GET', 'sup'); eq(writes.length, 0); });
test('GET: RTDB đang dryRun:false ⇒ hiển thị effectiveMode=live (cảnh báo), dryRun hiển thị true', async () => {
  seed(); store.telegramConfig.dryRun = false; const c = (await call('GET', 'sup')).json.config; eq(c.effectiveMode, 'live'); eq(c.dryRun, false);
});
test('GET: thiếu telegramConfig ⇒ mặc định rỗng + dry-run', async () => {
  seed(); delete store.telegramConfig; const c = (await call('GET', 'sup')).json.config; eq(c.chatId, ''); eq(c.approverIds, []); eq(c.effectiveMode, 'dry-run');
});
test('GET: Fanpage ngắt kết nối ⇒ connected:false (không lộ pageId cũ)', async () => {
  seed(); store.facebookConnection = { status: 'not_connected' }; eq((await call('GET', 'sup')).json.config.activePage, { connected: false });
});

// ── Ghi (POST) ────────────────────────────────────────────────────────────────
test('super_admin POST hợp lệ ⇒ 200, ghi đúng 4 khoá, dryRun=true', async () => {
  seed(); const r = await call('POST', 'sup', GOOD); eq(r.code, 200);
  eq(store.telegramConfig.chatId, '-1001234567890'); eq(store.telegramConfig.approverIds, ['777', '888']); eq(store.telegramConfig.approverMap, { 777: 'adm', 888: 'edi' });
  assert(store.telegramConfig.dryRun === true, 'dryRun phải là boolean true');
  eq(writes.length, 1); eq(writes[0].p, 'telegramConfig'); eq(writes[0].op, 'transaction');
});
test('POST không gửi dryRun ⇒ vẫn ghi dryRun:true', async () => { seed(); const b = Object.assign({}, GOOD); delete b.dryRun; eq((await call('POST', 'sup', b)).code, 200); assert(store.telegramConfig.dryRun === true); });
test('POST khi RTDB đang dryRun:false ⇒ 409, KHÔNG ghi, KHÔNG đổi dryRun, và vẫn báo effectiveMode=live', async () => {
  seed(); store.telegramConfig.dryRun = false; const before = JSON.stringify(store); const r = await call('POST', 'sup', GOOD);
  eq(r.code, 409); eq(writes.length, 0); eq(JSON.stringify(store), before); eq(r.json.config.effectiveMode, 'live'); assert(/dryRun = false/.test(r.json.errors[0])); noSecret(r.json);
});
for (const odd of [undefined, null, 'false', 0, 1, 'true']) {
  test('POST khi RTDB dryRun=' + JSON.stringify(odd) + ' (thiếu/sai kiểu) ⇒ 200, đặt true boolean và báo dryRunWasNotTrue', async () => {
    seed(); if (odd === undefined) delete store.telegramConfig.dryRun; else store.telegramConfig.dryRun = odd;
    const r = await call('POST', 'sup', GOOD); eq(r.code, 200); assert(store.telegramConfig.dryRun === true); eq(r.json.dryRunWasNotTrue, true);
  });
}
test('POST khi RTDB dryRun:true ⇒ dryRunWasNotTrue=false', async () => { seed(); eq((await call('POST', 'sup', GOOD)).json.dryRunWasNotTrue, false); });
test('POST lần đầu (chưa có telegramConfig) ⇒ tạo node với dryRun:true', async () => { seed(); delete store.telegramConfig; eq((await call('POST', 'sup', GOOD)).code, 200); assert(store.telegramConfig.dryRun === true); });
test('Race: dryRun đổi thành false NGAY SAU lần đọc GET ⇒ POST vẫn bị chặn (kiểm trong transaction, không phải đọc-rồi-ghi)', async () => {
  seed(); await call('GET', 'sup'); store.telegramConfig.dryRun = false; eq((await call('POST', 'sup', GOOD)).code, 409);
});
test('GET khi RTDB dryRun:false ⇒ dryRun hiển thị false (không che giấu)', async () => { seed(); store.telegramConfig.dryRun = false; eq((await call('GET', 'sup')).json.config.dryRun, false); });
test('mappingStatus phản ánh đúng runtime approverPolicy: roles/{uid} dạng object {role:..} (dạng CMS Users thật tạo) ⇒ được nhận như chuỗi', async () => {
  seed(); store.roles.adm = { email: 'a@x', role: 'admin' }; eq((await call('GET', 'sup')).json.config.mappingStatus, { 777: 'role:admin' });
});
test('mappingStatus khớp runtime: publishRoles chứa "super_admin" + roles/{uid}="super_admin" (chuỗi hoặc object) ⇒ runtime TỪ CHỐI nên CMS cũng phải báo no_publish_permission', async () => {
  const { resolvePshActor } = require('../shared/approverPolicy');
  for (const v of ['super_admin', { role: 'super_admin' }]) {
    seed(); store.telegramConfig.publishRoles = ['admin', 'super_admin']; store.roles.adm = v;
    eq((await resolvePshActor('777', store.telegramConfig)).ok, false);
    eq((await call('GET', 'sup')).json.config.mappingStatus, { 777: 'no_publish_permission' });
  }
});
test('mappingStatus: object role "agent"/thiếu role/role không phải chuỗi ⇒ không có quyền', async () => {
  for (const v of [{ role: 'agent' }, { email: 'a@x' }, { role: { x: 1 } }, { role: 'super_admin' }]) { seed(); store.roles.adm = v; eq((await call('GET', 'sup')).json.config.mappingStatus, { 777: 'no_publish_permission' }); }
});
for (const bad of [false, 'false', 0, null, 'true', 1, {}, []]) {
  test('POST dryRun=' + JSON.stringify(bad) + ' ⇒ 400, KHÔNG ghi', async () => {
    seed(); const before = JSON.stringify(store); const r = await call('POST', 'sup', Object.assign({}, GOOD, { dryRun: bad })); eq(r.code, 400); eq(writes.length, 0); eq(JSON.stringify(store), before);
  });
}
test('POST giữ nguyên publishRoles/allowedPageIds/allowGatewayCallback; không đụng trường khác', async () => {
  seed(); await call('POST', 'sup', GOOD);
  eq(store.telegramConfig.publishRoles, ['admin']); eq(store.telegramConfig.allowedPageIds, ['9']); assert(store.telegramConfig.allowGatewayCallback === false);
});
test('POST không đụng roles/superAdmins/facebook*', async () => {
  seed(); const snap = JSON.stringify([store.roles, store.superAdmins, store.facebookConnection, store.facebookActiveToken]); await call('POST', 'sup', GOOD);
  eq(JSON.stringify([store.roles, store.superAdmins, store.facebookConnection, store.facebookActiveToken]), snap);
  assert(writes.every(w => w.p === 'telegramConfig' || w.p === 'apiAuditLog'), 'ghi ngoài telegramConfig');
});
test('POST thay approverMap nguyên khối (xoá người duyệt cũ không để lại ánh xạ mồ côi)', async () => {
  seed(); await call('POST', 'sup', { chatId: '555', approverIds: ['888'], approverMap: { 888: 'edi' } }); eq(store.telegramConfig.approverMap, { 888: 'edi' });
});
test('Response POST không lộ secret dù RTDB còn trường cũ', async () => { seed(); noSecret((await call('POST', 'sup', GOOD)).json); });

// ── Validation ───────────────────────────────────────────────────────────────
const V = (o) => validateConfigInput(Object.assign({}, GOOD, o));
const bads = {
  'chatId rỗng': { chatId: '' }, 'chatId chữ': { chatId: 'abc' }, 'chatId @ ngắn': { chatId: '@ab' }, 'chatId thiếu': { chatId: undefined },
  'approverIds rỗng': { approverIds: [], approverMap: {} }, 'approverIds không phải mảng': { approverIds: '777' }, 'approverIds có chữ': { approverIds: ['7a7'], approverMap: { '7a7': 'adm' } },
  'approverIds trùng': { approverIds: ['777', '777'], approverMap: { 777: 'adm' } }, 'approverIds quá 20': { approverIds: Array.from({ length: 21 }, (_, i) => String(1000 + i)), approverMap: {} },
  'thiếu ánh xạ': { approverIds: ['777', '888'], approverMap: { 777: 'adm' } }, 'ánh xạ mồ côi': { approverIds: ['777'], approverMap: { 777: 'adm', 999: 'edi' } },
  'uid có ký tự lạ': { approverMap: { 777: 'a/b', 888: 'edi' } }, 'uid rỗng': { approverMap: { 777: '', 888: 'edi' } }, 'uid không phải chuỗi': { approverMap: { 777: 5, 888: 'edi' } },
  'Telegram ID bắt đầu bằng 0': { approverIds: ['0777'], approverMap: { '0777': 'adm' } }, 'chatId bằng 0': { chatId: '0' },
  'uid quá dài': { approverMap: { 777: 'a'.repeat(129), 888: 'edi' } }, 'approverMap là mảng': { approverMap: ['adm'] }, 'approverMap thiếu': { approverMap: undefined }
};
for (const k of Object.keys(bads)) test('validation từ chối: ' + k, async () => { const v = V(bads[k]); assert(!v.ok, 'phải bị từ chối'); assert(v.errors.length > 0 && v.errors.every(e => typeof e === 'string' && e.length > 5)); });
test('validation chấp nhận chatId số âm, số dương, @kênh', async () => { for (const c of ['-1001234567890', '123456', '@pshop_music']) assert(V({ chatId: c }).ok, c); });
test('chatId dạng số JS (number) được chuẩn hoá thành chuỗi', async () => { const v = V({ chatId: -1001234567890 }); assert(v.ok); eq(v.value.chatId, '-1001234567890'); });
for (const key of ['token', 'botToken', 'telegramToken', 'secret', 'webhookSecret', 'accessToken', 'pageAccessToken', 'publishRoles', 'allowedPageIds', 'allowGatewayCallback', 'role', 'roles', 'superAdmin', 'uid']) {
  test('validation từ chối trường ngoài allowlist: ' + key, async () => {
    seed(); const r = await call('POST', 'sup', Object.assign({}, GOOD, { [key]: 'SENTINEL-VALUE-123' }));
    eq(r.code, 400); eq(writes.length, 0); assert(JSON.stringify(r.json).indexOf('SENTINEL-VALUE-123') < 0, 'lỗi không được lặp lại giá trị client gửi');
  });
}
test('POST body không phải object ⇒ 400', async () => { seed(); eq((await call('POST', 'sup', null)).code, 400); eq((await call('POST', 'sup', [GOOD])).code, 400); eq((await call('POST', 'sup', 'x')).code, 400); eq(writes.length, 0); });
test('POST lỗi validation KHÔNG ghi gì và trả mọi lỗi cùng lúc', async () => { seed(); const r = await call('POST', 'sup', { chatId: 'x', approverIds: [], approverMap: {} }); eq(r.code, 400); assert(r.json.errors.length >= 2); eq(writes.length, 0); });
test('POST cấp quyền: chỉ ánh xạ, không tạo/sửa roles hay superAdmins, uid chưa có quyền chỉ bị CẢNH BÁO', async () => {
  seed(); const r = await call('POST', 'sup', { chatId: '555', approverIds: ['5'], approverMap: { 5: 'nobody' } }); eq(r.code, 200); eq(r.json.config.mappingStatus, { 5: 'no_publish_permission' });
  assert(!store.roles.nobody && !store.superAdmins.nobody);
});

// ── Cấu hình hệ thống thật ───────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..', '..');
test('database.rules.json KHÔNG bị thay đổi (không mở rộng quyền đọc RTDB)', async () => {
  const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'database.rules.json', 'storage.rules'], { cwd: ROOT }); eq(r.status, 0, 'rules đã bị sửa');
});
test('telegramPublisherConfig export từ index.js thật, KHÔNG bind secret nào, CORS giới hạn', async () => {
  const env = Object.assign({}, process.env); for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'COMPOSITOR_SECRET', 'WEBHOOK_SIGNING_SECRET', 'OPENAI_API_KEY', 'FACEBOOK_APP_SECRET', 'DEEPSEEK_API_KEY']) delete env[k];
  const probe = `process.env.GCLOUD_PROJECT='demo-pshop';process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-pshop',databaseURL:'http://127.0.0.1:9?ns=demo-pshop',storageBucket:'demo-pshop.appspot.com'});const l=console.log;console.log=()=>{};const fx=require(process.argv[1]+'/index.js');const e=fx.telegramPublisherConfig&&fx.telegramPublisherConfig.__endpoint;const w=fx.telegramWebhook.__endpoint;const g=fx.apiGateway.__endpoint;l(JSON.stringify({has:!!e,sec:e&&(e.secretEnvironmentVariables||[]).map(s=>s.key),cors:e&&e.cors,wh:(w.secretEnvironmentVariables||[]).map(s=>s.key).sort(),gw:(g.secretEnvironmentVariables||[]).map(s=>s.key).sort()}));`;
  const p = spawnSync(process.execPath, ['-e', probe, path.join(__dirname, '..')], { encoding: 'utf8', cwd: path.join(__dirname, '..'), env });
  const r = JSON.parse(p.stdout.trim().split('\n').pop());
  assert(r.has, 'thiếu export telegramPublisherConfig'); eq(r.sec, []); eq(r.wh, ['COMPOSITOR_SECRET', 'OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'], 'telegramWebhook đổi binding'); eq(r.gw, ['OPENAI_API_KEY', 'WEBHOOK_SIGNING_SECRET'], 'apiGateway đổi binding');
});
test('Mã nguồn module/UI không có đường ghi/đọc secret, setWebhook/deleteWebhook/getUpdates, Graph/Telegram API', async () => {
  for (const f of ['functions/shared/telegramConfigAdmin.js', 'js/admin-telegram-publisher.js', 'admin/telegram-publisher.html']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(!/setWebhook|deleteWebhook|getUpdates|graph\.facebook|api\.telegram|facebookActiveToken|facebookPageTokens|getBotToken|process\.env/.test(src), f + ' chạm tới thứ không được phép');
  }
});
test('UI: không có ô nhập token/secret và không có công tắc dryRun (chỉ hiển thị)', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin/telegram-publisher.html'), 'utf8');
  assert(!/type="password"/i.test(html) && !/id="[^"]*(token|secret)[^"]*"/i.test(html), 'có ô token/secret');
  assert(!/type="checkbox"/i.test(html) && !/id="tgDryRun/i.test(html), 'có công tắc dryRun');
  const js = fs.readFileSync(path.join(ROOT, 'js/admin-telegram-publisher.js'), 'utf8');
  assert(/dryRun: true/.test(js) && !/dryRun: false/.test(js) && !/localStorage|sessionStorage/.test(js));
});
test('Sidebar: mục Telegram Publisher chỉ role super_admin; mục role admin vẫn hiện cho admin', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/admin-auth.js'), 'utf8');
  assert((src.match(/key: 'telegram-publisher'[^\n]*role: 'super_admin'/g) || []).length === 2);
  const filter = new Function('navSource', 'currentRole', 'return navSource.filter(i => !i.role || currentRole === \'super_admin\' || (i.role === \'admin\' && currentRole === \'admin\'));');
  const nav = [{ key: 'a' }, { key: 'b', role: 'admin' }, { key: 'c', role: 'super_admin' }];
  eq(filter(nav, 'super_admin').map(i => i.key), ['a', 'b', 'c']); eq(filter(nav, 'admin').map(i => i.key), ['a', 'b']); eq(filter(nav, 'editor').map(i => i.key), ['a']);
});

(async () => {
  console.log('\n=== telegramPublisherConfig — CMS quản lý cấu hình Telegram Publisher ===');
  for (const [name, fn] of queue) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; } }
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); if (failed) { console.log(failures.join('\n')); process.exit(1); }
})();
