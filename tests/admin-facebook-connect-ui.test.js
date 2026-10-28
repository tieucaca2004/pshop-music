// G1O — Giao diện Facebook Configuration: người không đủ quyền KHÔNG thấy nút thay đổi.
// Chạy: node tests/admin-facebook-connect-ui.test.js
//
// Chạy js/admin-facebook-connect.js trong sandbox (vm) với DOM/Firebase giả: không trình duyệt,
// không mạng, không Firebase thật. Giao diện chỉ phản ánh quyền; backend vẫn là ranh giới bảo mật
// (xem functions/tests/facebookAuthz.test.js).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-facebook-connect.js'), 'utf8');
const MANAGE_BTNS = ['fbConnectBtn', 'fbChangePageBtn', 'fbDisconnectBtn', 'fbReconnectBtn', 'fbRefreshTokenBtn'];

function makeEnv({ superNode, connection, readFails }) {
  const els = {};
  ['fbConnectStatus', 'fbMockModeBadge', 'fbAppIdInput', 'fbAppIdSaveBtn', 'fbPageSelectBox', 'fbConsentModal', 'fbConsentCancel', 'fbConsentCancelX', 'fbConsentProceed'].concat(MANAGE_BTNS).forEach(id => {
    els[id] = { id, style: { display: '' }, innerHTML: '', value: '', disabled: false, classList: { add() {}, remove() {} }, addEventListener() {}, parentNode: null };
  });
  els.fbConnectStatus.parentNode = { insertBefore(n) { els[n.id] = n; } };
  const alerts = []; const fetchCalls = [];
  const db = {
    'superAdmins/uid1': superNode,
    'facebookConnection': connection,
    'facebookAppConfig/appId': '123456'
  };
  const sandbox = {
    console, URLSearchParams,
    alert: (m) => alerts.push(m), confirm: () => true,
    document: {
      getElementById: (id) => els[id] || null,
      createElement: () => ({ id: '', className: '', style: {}, textContent: '', parentNode: null }),
      querySelector: () => null
    },
    location: { search: '', pathname: '/admin/facebook-settings.html', href: '' },
    history: { replaceState() {} },
    window: { location: { href: '' }, crypto: { getRandomValues: (a) => a } },
    AdminAuth: { getUser: () => ({ uid: 'uid1', email: 'u@x' }) },
    firebase: {
      database: () => ({ ref: (p) => ({
        once: async () => {
          if (readFails && p.indexOf('superAdmins/') === 0) throw new Error('permission_denied');
          const v = db[p] === undefined ? null : db[p];
          return { exists: () => v !== null, val: () => v };
        }
      }) }),
      auth: () => ({ currentUser: { getIdToken: async () => 'tok' } })
    },
    fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true, json: async () => ({ success: true }) }; }
  };
  sandbox.window.firebase = sandbox.firebase;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;this.__mod = AdminFacebookConnect;', sandbox);
  return { sandbox, els, alerts, fetchCalls };
}
const tick = () => new Promise(r => setImmediate(r));
async function boot(opts) {
  const env = makeEnv(opts);
  env.sandbox.__mod.init();
  for (let i = 0; i < 10; i++) await tick();
  return env;
}
const hidden = (e, id) => e.els[id].style.display === 'none';

(async () => {
  const connected = { status: 'connected', pageName: 'Page X', tokenExpiresAt: Date.now() + 40 * 864e5 };
  const expired = { status: 'connected', pageName: 'Page X', tokenExpiresAt: Date.now() - 1000 };
  const results = [];
  async function t(name, fn) { try { await fn(); console.log('  ✔ ' + name); results.push(true); } catch (e) { console.log('  ✘ ' + name + ' — ' + e.message); results.push(false); } }

  await t('admin thường (không có node superAdmins), đã kết nối: KHÔNG thấy nút Đổi Fanpage / Làm mới / Ngắt kết nối / Kết nối', async () => {
    const e = await boot({ superNode: null, connection: connected });
    MANAGE_BTNS.forEach(id => assert.ok(hidden(e, id), id + ' phải bị ẩn'));
    assert.ok(/Chỉ Super Admin/.test(e.els.fbPermissionNotice.textContent), 'phải có thông báo chỉ-xem');
    assert.strictEqual(e.els.fbAppIdInput.disabled, true, 'ô App ID phải bị khoá');
    assert.strictEqual(e.els.fbAppIdSaveBtn.style.display, 'none', 'nút lưu App ID phải ẩn');
  });
  await t('admin thường, CHƯA kết nối: KHÔNG thấy nút Connect Facebook', async () => {
    const e = await boot({ superNode: null, connection: null });
    assert.ok(hidden(e, 'fbConnectBtn'));
  });
  await t('admin thường, token hết hạn: KHÔNG thấy Kết nối lại / Làm mới', async () => {
    const e = await boot({ superNode: null, connection: expired });
    MANAGE_BTNS.forEach(id => assert.ok(hidden(e, id), id + ' phải bị ẩn'));
  });
  await t('superAdmins/{uid} = true (thiếu role) → coi là KHÔNG đủ quyền (khớp backend), nút bị ẩn', async () => {
    const e = await boot({ superNode: true, connection: connected });
    MANAGE_BTNS.forEach(id => assert.ok(hidden(e, id), id + ' phải bị ẩn'));
  });
  await t('superAdmins/{uid}.role = "admin" → KHÔNG đủ quyền', async () => {
    const e = await boot({ superNode: { role: 'admin' }, connection: connected });
    assert.ok(hidden(e, 'fbDisconnectBtn'));
  });
  await t('không đọc được superAdmins (lỗi) → fail-closed: ẩn nút', async () => {
    const e = await boot({ superNode: { role: 'super_admin' }, connection: connected, readFails: true });
    MANAGE_BTNS.forEach(id => assert.ok(hidden(e, id), id + ' phải bị ẩn'));
  });
  await t('super_admin, đã kết nối: thấy Đổi Fanpage / Làm mới / Ngắt kết nối; ẩn Connect', async () => {
    const e = await boot({ superNode: { role: 'super_admin' }, connection: connected });
    assert.ok(!hidden(e, 'fbChangePageBtn') && !hidden(e, 'fbRefreshTokenBtn') && !hidden(e, 'fbDisconnectBtn'));
    assert.ok(hidden(e, 'fbConnectBtn'));
    assert.strictEqual(e.els.fbAppIdInput.disabled, false);
  });
  await t('super_admin, chưa kết nối: thấy Connect Facebook', async () => {
    const e = await boot({ superNode: { role: 'super_admin' }, connection: null });
    assert.ok(!hidden(e, 'fbConnectBtn'));
    assert.ok(!e.els.fbPermissionNotice || e.els.fbPermissionNotice.style.display === 'none');
  });
  await t('module chỉ phơi ra init/getStatus/refresh — handler thay đổi không gọi được từ bên ngoài, và không có lệnh mạng nào khi khởi tạo', async () => {
    const e = await boot({ superNode: null, connection: connected });
    // mô phỏng ai đó kích hoạt handler qua DevTools: không có đường công khai nào ngoài init/getStatus/refresh
    assert.deepStrictEqual(Object.keys(e.sandbox.__mod).sort(), ['getStatus', 'init', 'refresh']);
    assert.strictEqual(e.fetchCalls.length, 0);
  });
  await t('Hồi quy: không có quyền → UI không gọi gateway/Function nào khi khởi tạo', async () => {
    const e = await boot({ superNode: null, connection: connected });
    assert.strictEqual(e.fetchCalls.length, 0);
  });

  const failed = results.filter(r => !r).length;
  console.log(failed ? `admin-facebook-connect-ui: FAILED (${failed}/${results.length})` : `admin-facebook-connect-ui: OK (${results.length} case)`);
  process.exit(failed ? 1 : 0);
})();
