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
    ['[ĐÃ BIẾT] user đăng nhập KHÔNG có role vẫn đọc được toàn bộ roles', () => assertSucceeds(get(ref(db('stranger'), 'roles')))],
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
