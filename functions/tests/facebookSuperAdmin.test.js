'use strict';

/*
 * Unit test cho functions/shared/facebookSuperAdmin.js
 *
 * Chạy: node tests/facebookSuperAdmin.test.js
 *
 * KHÔNG dùng mạng, KHÔNG đụng production. Mock `firebase-admin` trước khi
 * require module cần test.
 */

const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

// ── Mock firebase-admin ────────────────────────────────────────────────────
// facebookSuperAdmin.js gọi `admin.database().ref('superAdmins/'+uid).once()`.
// Ta thay toàn bộ module bằng một stub điều khiển được.

let mockNextValue = null;   // giá trị trả về cho lần .once() kế tiếp
let mockShouldThrow = null; // nếu set, .once() sẽ throw
let mockReads = 0;          // đếm số lần đọc DB

const stubAdmin = {
  database() {
    return {
      ref(p) {
        return {
          async once() {
            mockReads++;
            if (mockShouldThrow) throw new Error(mockShouldThrow);
            return { val: () => mockNextValue, exists: () => mockNextValue !== null };
          }
        };
      }
    };
  }
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'firebase-admin') return 'firebase-admin';
  return origResolve.call(this, request, ...args);
};
require.cache['firebase-admin'] = {
  id: 'firebase-admin',
  filename: 'firebase-admin',
  loaded: true,
  exports: stubAdmin
};

const {
  isFacebookSuperAdmin,
  requireFacebookSuperAdmin,
  clearSuperAdminCache
} = require(path.join(__dirname, '..', 'shared', 'facebookSuperAdmin.js'));

// ── Test harness tối giản ─────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  clearSuperAdminCache();
  mockNextValue = null;
  mockShouldThrow = null;
  mockReads = 0;
  try {
    await fn();
    pass++;
    console.log('PASS  ' + name);
  } catch (e) {
    fail++;
    failures.push({ name, message: e.message });
    console.log('FAIL  ' + name + '  -> ' + e.message);
  }
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; }
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────

(async () => {
  // T1: Founder có super_admin → true
  await test('T1 uid là super_admin → true', async () => {
    mockNextValue = { email: 'x@y.z', role: 'super_admin', grantedAt: 1 };
    const r = await isFacebookSuperAdmin('uid-founder');
    assert.strictEqual(r, true);
  });

  // T2: record tồn tại nhưng role khác → false
  await test('T2 uid có record nhưng role=admin → false', async () => {
    mockNextValue = { email: 'x@y.z', role: 'admin' };
    const r = await isFacebookSuperAdmin('uid-admin-test');
    assert.strictEqual(r, false);
  });

  // T3: không có record → false
  await test('T3 uid không có record → false', async () => {
    mockNextValue = null;
    const r = await isFacebookSuperAdmin('uid-nobody');
    assert.strictEqual(r, false);
  });

  // T4: uid rỗng/null/không phải string → false, không đọc DB
  await test('T4 uid rỗng/null/không phải string → false, không đọc DB', async () => {
    mockNextValue = { role: 'super_admin' };
    assert.strictEqual(await isFacebookSuperAdmin(''), false);
    assert.strictEqual(await isFacebookSuperAdmin(null), false);
    assert.strictEqual(await isFacebookSuperAdmin(undefined), false);
    assert.strictEqual(await isFacebookSuperAdmin(123), false);
    assert.strictEqual(mockReads, 0, 'không được đọc DB khi uid không hợp lệ');
  });

  // T5: lỗi DB → fail-closed false
  await test('T5 lỗi đọc DB → fail-closed false', async () => {
    mockShouldThrow = 'network down';
    const r = await isFacebookSuperAdmin('uid-founder');
    assert.strictEqual(r, false);
  });

  // T6: cache — 2 lần gọi liên tiếp chỉ đọc DB 1 lần
  await test('T6 cache 30s: gọi 2 lần chỉ đọc DB 1 lần', async () => {
    mockNextValue = { role: 'super_admin' };
    assert.strictEqual(await isFacebookSuperAdmin('uid-cache'), true);
    assert.strictEqual(await isFacebookSuperAdmin('uid-cache'), true);
    assert.strictEqual(mockReads, 1, 'lần 2 phải dùng cache');
  });

  // T7: clearSuperAdminCache xoá cache
  await test('T7 clearSuperAdminCache → đọc lại DB', async () => {
    mockNextValue = { role: 'super_admin' };
    await isFacebookSuperAdmin('uid-clear');
    clearSuperAdminCache();
    await isFacebookSuperAdmin('uid-clear');
    assert.strictEqual(mockReads, 2, 'sau clear phải đọc lại');
  });

  // T8: requireFacebookSuperAdmin — super_admin → true, không set status
  await test('T8 requireFacebookSuperAdmin super_admin → true, không ghi 403', async () => {
    mockNextValue = { role: 'super_admin' };
    const res = makeRes();
    const ok = await requireFacebookSuperAdmin({ uid: 'uid-founder' }, res);
    assert.strictEqual(ok, true);
    assert.strictEqual(res.statusCode, null);
  });

  // T9: requireFacebookSuperAdmin — không phải super_admin → false + 403
  await test('T9 requireFacebookSuperAdmin admin test → false + 403', async () => {
    mockNextValue = { role: 'admin' };
    const res = makeRes();
    const ok = await requireFacebookSuperAdmin({ uid: 'uid-admin-test' }, res);
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.body && typeof res.body.error === 'string');
  });

  // T10: requireFacebookSuperAdmin — check null/undefined → false + 403
  await test('T10 requireFacebookSuperAdmin check null → false + 403', async () => {
    const res = makeRes();
    const ok = await requireFacebookSuperAdmin(null, res);
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
  });

  // T11: requireFacebookSuperAdmin — lỗi DB → fail-closed 403
  await test('T11 requireFacebookSuperAdmin lỗi DB → fail-closed 403', async () => {
    mockShouldThrow = 'db error';
    const res = makeRes();
    const ok = await requireFacebookSuperAdmin({ uid: 'uid-founder' }, res);
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
  });

  // ── Tổng kết ────────────────────────────────────────────────────────────
  console.log('');
  console.log('=== SUMMARY ===');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (fail > 0) {
    console.log('Failures:');
    failures.forEach(f => console.log('  - ' + f.name + ': ' + f.message));
    process.exit(1);
  }
  process.exit(0);
})();
