// P1 STORAGE RULES — chạy storage.rules THẬT trên Firebase Storage Emulator
// (trình biên dịch Rules thật, không mô phỏng).
// Cần: firebase-tools + @firebase/rules-unit-testing + firebase (không nằm
// trong package.json của site). Chạy:
//   NODE_PATH=<dir có node_modules đó> npx firebase emulators:exec --only storage \
//     --project demo-pshop "node tests/storage-rules.test.js"
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, uploadString, getBytes, listAll, deleteObject } = require('firebase/storage');

(async () => {
  const [host, port] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-pshop',
    storage: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async c => {
    const s = c.storage();
    await uploadString(ref(s, 'products/cu.jpg'), 'x');
    await uploadString(ref(s, 'businesses/b1/media/a.jpg'), 'x');
  });

  const admin = env.authenticatedContext('admin1', {}).storage();
  const tenantB1 = env.authenticatedContext('t1', { businessId: 'b1' }).storage();
  const tenantB2 = env.authenticatedContext('t2', { businessId: 'b2' }).storage();
  const superA = env.authenticatedContext('sa', { roles: { super_admin: true } }).storage();
  const anon = env.unauthenticatedContext().storage();

  const cases = [
    ['authorized upload legacy (media/new.jpg, file MỚI)', () => assertSucceeds(uploadString(ref(admin, 'media/new.jpg'), 'x'))],
    ['authorized upload legacy lồng nhau (products/a/b.jpg)', () => assertSucceeds(uploadString(ref(admin, 'products/a/b.jpg'), 'x'))],
    ['authorized overwrite file cũ (products/cu.jpg)', () => assertSucceeds(uploadString(ref(admin, 'products/cu.jpg'), 'y'))],
    ['authorized delete legacy', () => assertSucceeds(deleteObject(ref(admin, 'products/a/b.jpg')))],
    ['unauthorized upload (chưa đăng nhập) BỊ CHẶN', () => assertFails(uploadString(ref(anon, 'media/x.jpg'), 'x'))],
    ['read legacy công khai (ảnh site)', () => assertSucceeds(getBytes(ref(anon, 'products/cu.jpg')))],
    ['list legacy khi đăng nhập', () => assertSucceeds(listAll(ref(admin, 'products')))],
    ['list root khi đăng nhập', () => assertSucceeds(listAll(ref(admin, '')))],
    ['list khi chưa đăng nhập BỊ CHẶN', () => assertFails(listAll(ref(anon, 'products')))],
    ['legacy-user ghi vào businesses/ BỊ CHẶN', () => assertFails(uploadString(ref(admin, 'businesses/b1/media/z.jpg'), 'x'))],
    ['legacy-user đọc businesses/ BỊ CHẶN', () => assertFails(getBytes(ref(anon, 'businesses/b1/media/a.jpg')))],
    ['legacy-user list businesses/ BỊ CHẶN', () => assertFails(listAll(ref(admin, 'businesses/b1')))],
    ['tenant b1 ghi/đọc trong b1', async () => { await assertSucceeds(uploadString(ref(tenantB1, 'businesses/b1/media/n.jpg'), 'x')); await assertSucceeds(getBytes(ref(tenantB1, 'businesses/b1/media/a.jpg'))); }],
    ['tenant b2 đọc/ghi b1 BỊ CHẶN (cross-tenant)', async () => { await assertFails(getBytes(ref(tenantB2, 'businesses/b1/media/a.jpg'))); await assertFails(uploadString(ref(tenantB2, 'businesses/b1/media/q.jpg'), 'x')); }],
    ['list thư mục con legacy (products/sub)', () => assertSucceeds(listAll(ref(admin, 'products/a')))],
    ['tenant b1 list trong b1', () => assertSucceeds(listAll(ref(tenantB1, 'businesses/b1/media')))],
    ['tenant b2 list b1 BỊ CHẶN', () => assertFails(listAll(ref(tenantB2, 'businesses/b1/media')))],
    ['super_admin ghi businesses/b1', () => assertSucceeds(uploadString(ref(superA, 'businesses/b1/media/s.jpg'), 'x'))]
  ];
  let fail = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log('  ✔ ' + name); } catch (e) { fail++; console.log('  ✘ ' + name + ' — ' + (e.code || e.message)); }
  }
  await env.cleanup();
  console.log(fail ? `storage-rules: FAILED (${fail})` : 'storage-rules: OK');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
