// P3 MULTI-TENANT / DB RULES — chạy database.rules.json THẬT trên Realtime
// Database Emulator. Ghi nhận hành vi thật (cả lỗ hổng đã biết) để có bằng
// chứa thay vì đoán. Chạy:
//   NODE_PATH=<dir có @firebase/rules-unit-testing + firebase> npx firebase \
//     emulators:exec --only database --project demo-pshop "node tests/database-rules.test.js"
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update } = require('firebase/database');

(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-pshop',
    database: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8') }
  });
  const seed = async () => env.withSecurityRulesDisabled(async c => {
    await set(ref(c.database(), '/'), {
      roles: { adm: { role: 'admin', email: 'a@x' }, edi: { role: 'editor', email: 'e@x' }, agt: { role: 'agent', email: 'g@x' } },
      products: { p1: { name: 'DDJ', price: 1 } },
      businesses: {
        b1: { users: { t1: { role: 'business_admin' }, v1: { role: 'business_viewer' } }, orders: { o1: { total: 1 } }, products: { x: { name: 'A' } } },
        b2: { users: { t2: { role: 'business_admin' } }, orders: { o2: { total: 2 } } }
      },
      siteContent: { settings: { phone: '1' }, menu: [{ label: 'Trang chủ' }] },
      'a-tieu': { menu: { m1: { name: 'Hủ tiếu', price: 35000 } } }
    });
  });
  await seed();
  const db = (uid) => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();

  const cases = [
    ['[legacy] products: public đọc được', () => assertSucceeds(get(ref(db(null), 'products/p1')))],
    ['[legacy] products: editor ghi được', () => assertSucceeds(update(ref(db('edi'), 'products/p1'), { price: 2 }))],
    ['[legacy] products: role agent KHÔNG ghi được', () => assertFails(update(ref(db('agt'), 'products/p1'), { price: 3 }))],
    ['[legacy] products: chưa đăng nhập KHÔNG ghi được', () => assertFails(update(ref(db(null), 'products/p1'), { price: 4 }))],
    ['[tenant] t1 đọc orders b1', () => assertSucceeds(get(ref(db('t1'), 'businesses/b1/orders')))],
    ['[tenant] t2 đọc orders b1 BỊ CHẶN (cross-tenant)', () => assertFails(get(ref(db('t2'), 'businesses/b1/orders')))],
    ['[tenant] t2 ghi products b1 BỊ CHẶN (cross-tenant)', () => assertFails(set(ref(db('t2'), 'businesses/b1/products/y'), { name: 'Z' }))],
    ['[tenant] viewer b1 KHÔNG ghi products b1', () => assertFails(set(ref(db('v1'), 'businesses/b1/products/y'), { name: 'Z' }))],
    ['[tenant] admin b1 ghi products b1', () => assertSucceeds(set(ref(db('t1'), 'businesses/b1/products/y'), { name: 'Z' }))],
    ['[tenant] legacy admin (không là member) đọc orders b1 BỊ CHẶN', () => assertFails(get(ref(db('adm'), 'businesses/b1/orders')))],
    // ── Hành vi đã biết cần Founder quyết định (test GHI NHẬN, không phải mục tiêu) ──
    // S-04: roles chỉ admin đọc toàn bộ; mỗi user chỉ đọc role của chính mình.
    ['[S-04] user KHÔNG role đọc toàn bộ roles BỊ CHẶN', () => assertFails(get(ref(db('stranger'), 'roles')))],
    ['[S-04] editor đọc toàn bộ roles BỊ CHẶN', () => assertFails(get(ref(db('edi'), 'roles')))],
    ['[S-04] editor đọc role người khác BỊ CHẶN', () => assertFails(get(ref(db('edi'), 'roles/adm')))],
    ['[S-04] editor đọc role của chính mình', () => assertSucceeds(get(ref(db('edi'), 'roles/edi')))],
    ['[S-04] admin đọc toàn bộ roles (trang Users)', () => assertSucceeds(get(ref(db('adm'), 'roles')))],
    // S-06: editor không ghi menu/footer/settings (trang chỉ admin); vẫn ghi được phần editor dùng.
    ['[S-06] editor ghi siteContent/menu BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'siteContent/menu'), [{ label: 'x' }]))],
    ['[S-06] editor ghi đè toàn bộ siteContent BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'siteContent'), { x: 1 }))],
    ['[S-06] editor ghi siteContent/heroSlides', () => assertSucceeds(set(ref(db('edi'), 'siteContent/heroSlides'), []))],
    ['[S-06] editor ghi siteContent/mediaAssets', () => assertSucceeds(set(ref(db('edi'), 'siteContent/mediaAssets/m1'), { url: 'x' }))],
    ['[S-06] editor update() nhiều key cho phép (heroSlides+categoryTiles)', () => assertSucceeds(update(ref(db('edi'), 'siteContent'), { heroSlides: [], categoryTiles: [] }))],
    ['[S-06] editor update() có lẫn key admin (menu) BỊ CHẶN', () => assertFails(update(ref(db('edi'), 'siteContent'), { heroSlides: [], menu: [{ label: 'x' }] }))],
    ['[S-06] admin ghi siteContent/menu', () => assertSucceeds(set(ref(db('adm'), 'siteContent/menu'), []))],
    ['[S-06] editor ghi đè key đã có (siteContent/settings) BỊ CHẶN', () => assertFails(set(ref(db('edi'), 'siteContent/settings'), { phone: 'x' }))],
    ['[S-06] editor backfill key seed CÒN THIẾU (ensureSeeded) được phép', () => assertSucceeds(update(ref(db('edi'), 'siteContent'), { infoBoxRows: [{ a: 1 }] }))],
    ['[S-06] chưa đăng nhập ghi siteContent BỊ CHẶN', () => assertFails(set(ref(db(null), 'siteContent/heroSlides'), []))],
    ['[BLOCKER deploy] a-tieu/menu: public KHÔNG đọc được (rules không có node a-tieu → $other deny)', () => assertFails(get(ref(db(null), 'a-tieu/menu')))],
    ['[BLOCKER deploy] a-tieu/menu: admin KHÔNG ghi được', () => assertFails(set(ref(db('adm'), 'a-tieu/menu/m2'), { name: 'x' }))]
  ];
  let fail = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log('  ✔ ' + name); } catch (e) { fail++; console.log('  ✘ ' + name + ' — ' + (e.code || e.message)); }
  }
  // Bootstrap: khi roles RỖNG, user đăng nhập đầu tiên tự gán admin.
  await env.withSecurityRulesDisabled(c => set(ref(c.database(), 'roles'), null));
  try { await assertSucceeds(set(ref(db('first'), 'roles/first'), { role: 'admin' })); console.log('  ✔ [ĐÃ BIẾT] roles rỗng → user bất kỳ tự gán admin (bootstrap)'); }
  catch (e) { fail++; console.log('  ✘ bootstrap — ' + e.message); }
  await env.cleanup();
  console.log(fail ? `database-rules: FAILED (${fail})` : 'database-rules: OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
