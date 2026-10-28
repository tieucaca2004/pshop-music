// G1N — Realtime Database RULES cho phần Facebook, chạy database.rules.json THẬT trên
// Realtime Database Emulator (project demo-pshop, KHÔNG kết nối production). Chạy:
//   NODE_PATH=<dir có @firebase/rules-unit-testing + firebase> npx firebase \
//     emulators:exec --only database --project demo-pshop "node tests/facebook-database-rules.test.js"
// (cùng cách chạy với tests/database-rules.test.js — xem đầu file đó.)
//
// Ghi nhận cả HÀNH VI ĐÃ BIẾT: .read/.write ở GỐC cấp toàn cây cho superAdmins/{uid}, nên
// rule con (kể cả false) KHÔNG chặn được super admin — các case "[GIỚI HẠN ĐÃ BIẾT]" khẳng
// định đúng điều đó để không ai hiểu nhầm rằng rule con bảo vệ token khỏi super admin.
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove } = require('firebase/database');

(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  if (!/^(127\.0\.0\.1|localhost)$/.test(host)) { console.error('Từ chối chạy: host emulator phải là localhost, nhận ' + host); process.exit(2); }
  const env = await initializeTestEnvironment({
    projectId: 'demo-pshop',
    database: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), '/'), {
      roles: { adm: { role: 'admin', email: 'a@x' }, edi: { role: 'editor', email: 'e@x' }, agt: { role: 'agent', email: 'g@x' } },
      superAdmins: { sup: { role: 'super_admin', email: 's@x' }, supTrue: true },
      products: { p1: { name: 'DDJ', price: 1 } },
      facebookConnection: { status: 'connected', pageId: 'p1' },
      facebookAppConfig: { appId: '123456' },
      facebookPageTokens: { adm: { p1: { accessToken: 'SECRET-PAGE' } } },
      facebookActiveToken: { pageId: 'p1', accessToken: 'SECRET-ACTIVE' },
      facebookUserToken: { accessToken: 'SECRET-USER' },
      facebookPendingPages: { adm: { pages: [{ id: 'p1', name: 'P' }] } },
      facebookOAuthState: { st1: { uid: 'adm', createdAt: 1 } }
    });
  });
  const db = (uid) => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
  const state = { uid: 'adm', createdAt: Date.now() };

  const cases = [
    // ── facebookAppConfig: browser không ghi được ─────────────────────────────
    ['[appConfig] admin ghi set() BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookAppConfig'), { appId: '999999' }))],
    ['[appConfig] admin update(appId) BỊ CHẶN (đường lưu App ID cũ)', () => assertFails(update(ref(db('adm'), 'facebookAppConfig'), { appId: '999999' }))],
    ['[appConfig] admin ghi con appId BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookAppConfig/appId'), '999999'))],
    ['[appConfig] editor ghi BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'facebookAppConfig/appId'), '999999'))],
    ['[appConfig] agent ghi BỊ CHẶN', () => assertFails(set(ref(db('agt'), 'facebookAppConfig/appId'), '999999'))],
    ['[appConfig] chưa đăng nhập ghi BỊ CHẶN', () => assertFails(set(ref(db(null), 'facebookAppConfig/appId'), '999999'))],
    ['[appConfig] admin xoá BỊ CHẶN', () => assertFails(remove(ref(db('adm'), 'facebookAppConfig')))],
    ['[appConfig] người có node roles vẫn ĐỌC được (client hiển thị App ID)', () => assertSucceeds(get(ref(db('edi'), 'facebookAppConfig/appId')))],
    ['[appConfig] chưa đăng nhập ĐỌC BỊ CHẶN', () => assertFails(get(ref(db(null), 'facebookAppConfig/appId')))],
    ['[appConfig][GIỚI HẠN ĐÃ BIẾT] super_admin vẫn ghi được qua quyền gốc (backend là nơi chặn thật)', () => assertSucceeds(set(ref(db('sup'), 'facebookAppConfig/appId'), '555555'))],

    // ── facebookConnection ────────────────────────────────────────────────────
    ['[connection] admin set() BỊ CHẶN (đường "Ngắt kết nối" cũ)', () => assertFails(set(ref(db('adm'), 'facebookConnection'), { status: 'not_connected' }))],
    ['[connection] admin giả mạo status=connected BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookConnection'), { status: 'connected', pageId: 'evil' }))],
    ['[connection] admin update tokenExpiresAt BỊ CHẶN', () => assertFails(update(ref(db('adm'), 'facebookConnection'), { tokenExpiresAt: 9e15 }))],
    ['[connection] editor ghi BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'facebookConnection/status'), 'connected'))],
    ['[connection] chưa đăng nhập ghi BỊ CHẶN', () => assertFails(set(ref(db(null), 'facebookConnection'), { status: 'x' }))],
    ['[connection] người có node roles ĐỌC được (card trạng thái, admin-ai.js)', () => assertSucceeds(get(ref(db('edi'), 'facebookConnection')))],
    ['[connection] chưa đăng nhập ĐỌC BỊ CHẶN', () => assertFails(get(ref(db(null), 'facebookConnection')))],
    ['[connection][GIỚI HẠN ĐÃ BIẾT] super_admin vẫn ghi được qua quyền gốc', () => assertSucceeds(set(ref(db('sup'), 'facebookConnection/status'), 'not_connected'))],

    // ── facebookOAuthState: chỉ server (Admin SDK bỏ qua rules) ───────────────
    ['[state] admin ghi state hợp lệ của chính mình BỊ CHẶN (state do server cấp)', () => assertFails(set(ref(db('adm'), 'facebookOAuthState/new1'), state))],
    ['[state] admin ghi state mang UID người khác BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookOAuthState/new2'), { uid: 'sup', createdAt: Date.now() }))],
    ['[state] editor ghi BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'facebookOAuthState/new3'), { uid: 'edi', createdAt: Date.now() }))],
    ['[state] admin ĐỌC state BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookOAuthState/st1')))],
    ['[state] admin liệt kê toàn bộ state BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookOAuthState')))],
    ['[state] admin xoá state BỊ CHẶN', () => assertFails(remove(ref(db('adm'), 'facebookOAuthState/st1')))],
    ['[state][GIỚI HẠN ĐÃ BIẾT] super_admin vẫn ghi được qua quyền gốc', () => assertSucceeds(set(ref(db('sup'), 'facebookOAuthState/new4'), state))],
    ['[state] .validate vẫn áp dụng cho CẢ super_admin (validate không bị quyền gốc bỏ qua): createdAt không phải số BỊ CHẶN', () => assertFails(set(ref(db('sup'), 'facebookOAuthState/new5'), { uid: 'sup', createdAt: 'x' }))],
    ['[state] .validate: thiếu uid BỊ CHẶN ngay cả với super_admin', () => assertFails(set(ref(db('sup'), 'facebookOAuthState/new6'), { createdAt: Date.now() }))],

    // ── Token nodes: client thường không đọc/ghi được ─────────────────────────
    ['[token] admin ĐỌC facebookActiveToken BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookActiveToken')))],
    ['[token] admin ĐỌC facebookUserToken BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookUserToken')))],
    ['[token] admin ĐỌC facebookPageTokens BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookPageTokens')))],
    ['[token] admin đọc token Page của CHÍNH MÌNH BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'facebookPageTokens/adm')))],
    ['[token] editor ĐỌC facebookActiveToken BỊ CHẶN', () => assertFails(get(ref(db('edi'), 'facebookActiveToken')))],
    ['[token] chưa đăng nhập ĐỌC facebookActiveToken BỊ CHẶN', () => assertFails(get(ref(db(null), 'facebookActiveToken')))],
    ['[token] admin GHI facebookActiveToken BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookActiveToken'), { pageId: 'evil', accessToken: 'x' }))],
    ['[token] admin GHI facebookUserToken BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookUserToken'), { accessToken: 'x' }))],
    ['[token] admin GHI facebookPageTokens BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookPageTokens/adm/p9'), { accessToken: 'x' }))],
    ['[token] editor GHI facebookActiveToken BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'facebookActiveToken/accessToken'), 'x'))],
    ['[token][GIỚI HẠN ĐÃ BIẾT] super_admin ĐỌC được facebookActiveToken qua quyền gốc (rule con false không chặn)', () => assertSucceeds(get(ref(db('sup'), 'facebookActiveToken')))],
    ['[token][GIỚI HẠN ĐÃ BIẾT] super_admin ĐỌC được facebookUserToken qua quyền gốc', () => assertSucceeds(get(ref(db('sup'), 'facebookUserToken')))],
    ['[token][GIỚI HẠN ĐÃ BIẾT] superAdmins/{uid}=true (không có role) cũng được quyền gốc ở tầng Rules', () => assertSucceeds(get(ref(db('supTrue'), 'facebookActiveToken')))],

    // ── facebookPendingPages ──────────────────────────────────────────────────
    ['[pending] chủ sở hữu ĐỌC danh sách Page của mình', () => assertSucceeds(get(ref(db('adm'), 'facebookPendingPages/adm')))],
    ['[pending] người khác ĐỌC BỊ CHẶN', () => assertFails(get(ref(db('edi'), 'facebookPendingPages/adm')))],
    ['[pending] chủ sở hữu GHI BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'facebookPendingPages/adm'), { pages: [] }))],

    // ── superAdmins ───────────────────────────────────────────────────────────
    ['[superAdmins] admin tự thêm mình vào superAdmins BỊ CHẶN', () => assertFails(set(ref(db('adm'), 'superAdmins/adm'), { role: 'super_admin' }))],
    ['[superAdmins] editor thêm người khác BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'superAdmins/edi'), { role: 'super_admin' }))],
    ['[superAdmins] chủ sở hữu đọc node của mình', () => assertSucceeds(get(ref(db('sup'), 'superAdmins/sup')))],
    ['[superAdmins] admin đọc node của người khác BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'superAdmins/sup')))],

    // ── Hồi quy: quyền CMS không liên quan KHÔNG đổi ──────────────────────────
    ['[hồi quy] editor ghi products', () => assertSucceeds(update(ref(db('edi'), 'products/p1'), { price: 2 }))],
    ['[hồi quy] agent KHÔNG ghi products', () => assertFails(update(ref(db('agt'), 'products/p1'), { price: 3 }))],
    ['[hồi quy] chưa đăng nhập KHÔNG ghi products', () => assertFails(update(ref(db(null), 'products/p1'), { price: 4 }))],
    ['[hồi quy] admin ghi roles/{uid}', () => assertSucceeds(set(ref(db('adm'), 'roles/newuser'), { role: 'editor' }))],
    ['[hồi quy] editor KHÔNG ghi roles', () => assertFails(set(ref(db('edi'), 'roles/newuser2'), { role: 'admin' }))]
  ];
  let fail = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log('  ✔ ' + name); } catch (e) { fail++; console.log('  ✘ ' + name + ' — ' + (e.code || e.message)); }
  }
  await env.cleanup();
  console.log(fail ? `facebook-database-rules: FAILED (${fail}/${cases.length})` : `facebook-database-rules: OK (${cases.length} case, Emulator)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
