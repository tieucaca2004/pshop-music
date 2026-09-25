// P0 AUTH — AuthContext.guard()/retry() (js/auth-context.js) và nextUrl của
// js/admin-login.js. Chạy mã nguồn thật trong Node vm với Firebase giả lập.
// Kiểm chứng: lỗi tạm thời KHÔNG đá về login, KHÔNG signIn/signOut thêm lần
// nào (nguồn gốc auth/too-many-requests), retry THẬT đọc lại role.
// Chạy: node tests/auth-guard.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const AC_SRC = fs.readFileSync(path.join(ROOT, 'js/auth-context.js'), 'utf8');

// scenario: { user: bool, tokenFails: n lần đầu getIdTokenResult lỗi, role }
function boot(scenario) {
  let tokenCalls = 0;
  const counters = { signIn: 0, signOut: 0, listeners: 0 };
  const loc = { pathname: '/psh/platform/media-center/', search: '', href: '(unchanged)' };
  const user = scenario.user ? {
    uid: 'u1',
    getIdTokenResult: () => {
      tokenCalls++;
      return tokenCalls <= (scenario.tokenFails || 0)
        ? Promise.reject(Object.assign(new Error('rate'), { code: 'auth/too-many-requests' }))
        : Promise.resolve({ claims: {} });
    }
  } : null;
  const firebase = {
    auth: () => ({
      onAuthStateChanged: cb => { counters.listeners++; setTimeout(() => cb(user), 0); return () => { counters.listeners--; }; },
      signInWithEmailAndPassword: () => { counters.signIn++; },
      signOut: () => { counters.signOut++; return Promise.resolve(); }
    }),
    database: () => ({
      ref: p => ({
        once: () => Promise.resolve({
          exists: () => p.indexOf('roles/') === 0 && !!scenario.role,
          val: () => ({ role: scenario.role })
        })
      })
    })
  };
  const ctx = { firebase, location: loc, setTimeout, Promise, console };
  vm.createContext(ctx);
  vm.runInContext(AC_SRC + '\n;this.AuthContext = AuthContext;', ctx);
  return { AC: ctx.AuthContext, loc, counters, tokenCalls: () => tokenCalls };
}

const ROLES = ['admin', 'editor', 'super_admin'];
const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✔ ' + name); } catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; }
}

(async () => {
  await t('Đăng nhập + role admin → ok, không redirect', async () => {
    const s = boot({ user: true, role: 'admin' });
    const r = await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1 });
    assert.strictEqual(r.access, 'ok'); assert.strictEqual(s.loc.href, '(unchanged)');
  });
  await t('Lỗi tạm thời (too-many-requests) 2 lần rồi hết → retry THẬT, ok, không redirect/signIn/signOut', async () => {
    const s = boot({ user: true, role: 'admin', tokenFails: 2 });
    const notices = [];
    const r = await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1, onTransient: (a, f) => notices.push([a, f]) });
    assert.strictEqual(r.access, 'ok');
    assert.strictEqual(s.tokenCalls(), 3);
    assert.strictEqual(s.loc.href, '(unchanged)');
    assert.deepStrictEqual([s.counters.signIn, s.counters.signOut], [0, 0]);
    assert.strictEqual(s.counters.listeners, 1, 'listener onAuthStateChanged bị nhân bản');
    assert.strictEqual(notices.length, 2);
  });
  await t('Lỗi tạm thời kéo dài → dừng sau 3 lần thử, GIỮ trang (không redirect)', async () => {
    const s = boot({ user: true, role: 'admin', tokenFails: 99 });
    let finalSeen = false;
    const r = await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1, onTransient: (a, f) => { if (f) finalSeen = true; } });
    assert.strictEqual(r.access, 'transient'); assert.ok(finalSeen);
    assert.strictEqual(s.tokenCalls(), 4);
    assert.strictEqual(s.loc.href, '(unchanged)');
    assert.deepStrictEqual([s.counters.signIn, s.counters.signOut], [0, 0]);
  });
  await t('Chưa đăng nhập → về login kèm next (quay lại đúng trang)', async () => {
    const s = boot({ user: false });
    const r = await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1 });
    assert.strictEqual(r.access, 'unauthenticated');
    assert.strictEqual(s.loc.href, '/admin/login.html?next=%2Fpsh%2Fplatform%2Fmedia-center%2F');
  });
  await t('Đăng nhập nhưng không có role → denied (không phải transient)', async () => {
    const s = boot({ user: true, role: null });
    const r = await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1 });
    assert.strictEqual(r.access, 'unauthorized'); assert.match(s.loc.href, /denied=1/);
  });
  await t('Role agent (không thuộc danh sách) → denied', async () => {
    const s = boot({ user: true, role: 'agent' });
    assert.strictEqual((await s.AC.guard({ allowedRoles: ROLES, baseDelayMs: 1 })).access, 'unauthorized');
  });

  // admin-login.js nextUrl — chống open redirect.
  await t('Login next: chỉ nhận đường dẫn nội bộ', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/admin-login.js'), 'utf8');
    const check = next => {
      let handler; const el = () => ({ style: {}, addEventListener: () => {}, dataset: {} });
      const loc = { search: '?next=' + encodeURIComponent(next), href: '' };
      const signIn = () => ({ then: f => { f(); return { catch: () => {} }; } });
      const ctx = { location: loc, URLSearchParams,
        document: { addEventListener: (e, f) => { handler = f; }, getElementById: id => id === 'loginEmail' || id === 'loginPassword' ? { value: 'x', addEventListener: () => {} } : Object.assign(el(), { id }) },
        firebase: { auth: () => ({ signInWithEmailAndPassword: signIn }), database: () => ({ ref: () => ({ once: () => new Promise(() => {}) }) }) } };
      const btns = {};
      ctx.document.getElementById = id => {
        if (id === 'loginEmail' || id === 'loginPassword') return { value: 'x', addEventListener: () => {} };
        if (!btns[id]) btns[id] = { id, style: {}, dataset: {}, disabled: false, textContent: '', addEventListener: (e, f) => { btns[id].click = f; } };
        return btns[id];
      };
      vm.createContext(ctx); vm.runInContext(src, ctx); handler();
      btns.loginBtn.click();
      return loc.href;
    };
    assert.strictEqual(check('/psh/platform/media-center/'), '/psh/platform/media-center/');
    assert.strictEqual(check('//evil.com/x'), 'index.html');
    assert.strictEqual(check('https://evil.com'), 'index.html');
    assert.strictEqual(check('/admin/login.html?next=/x'), 'index.html');
    assert.strictEqual(check(''), 'index.html');
  });

  console.log('AUTH js/auth-context.js + js/admin-login.js'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'FAILED' : 'auth-guard: OK');
})();
