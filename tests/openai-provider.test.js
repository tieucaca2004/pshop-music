// P2 — js/ai/providers/openai.js xử lý lỗi rõ ràng (vm, mã nguồn thật).
// Chạy: node tests/openai-provider.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/ai/providers/openai.js'), 'utf8');

function load(user, fetchImpl) {
  let provider;
  const ctx = {
    Promise, JSON, Error,
    AIProviderRegistry: { register: p => { provider = p; } },
    createProviderNotConfiguredError: n => new Error(n + ' chưa cấu hình'),
    firebase: { auth: () => ({ currentUser: user }) },
    fetch: fetchImpl || (() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ text: 'Xin chào' }) }))
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return provider;
}
const cfg = { enabled: true };
const okUser = { getIdToken: () => Promise.resolve('t') };
const results = [];
async function t(name, fn) { try { await fn(); results.push('  ✔ ' + name); } catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; } }
(async () => {
  await t('authenticated → trả text', async () => {
    const r = await load(okUser).generate({ moduleId: 'blog-writer', prompt: 'x', config: cfg });
    assert.strictEqual(r.text, 'Xin chào');
  });
  await t('unauthenticated → lỗi rõ ràng, KHÔNG TypeError, không gọi fetch', async () => {
    let called = 0;
    const p = load(null, () => { called++; });
    await assert.rejects(p.generate({ moduleId: 'blog-writer', prompt: 'x', config: cfg }), e => /Chưa đăng nhập CMS/.test(e.message) && !(e instanceof TypeError));
    assert.strictEqual(called, 0);
  });
  await t('session hết hạn (getIdToken reject) → báo phiên hết hạn', async () => {
    const p = load({ getIdToken: () => Promise.reject(Object.assign(new Error('x'), { code: 'auth/user-token-expired' })) });
    await assert.rejects(p.generate({ moduleId: 'blog-writer', prompt: 'x', config: cfg }), /hết hạn.*auth\/user-token-expired/);
  });
  await t('API lỗi trả JSON {error} → giữ nguyên thông điệp server', async () => {
    const p = load(okUser, () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'OpenAI quota exceeded' }) }));
    await assert.rejects(p.generate({ moduleId: 'blog-writer', prompt: 'x', config: cfg }), /quota exceeded/);
  });
  await t('API lỗi trả HTML (502) → "HTTP 502", không phải SyntaxError', async () => {
    const p = load(okUser, () => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }));
    await assert.rejects(p.generate({ moduleId: 'blog-writer', prompt: 'x', config: cfg }), /HTTP 502/);
  });
  await t('health() khi chưa đăng nhập → healthy:false, không throw', async () => {
    const h = await load(null).health();
    assert.strictEqual(h.healthy, false);
  });
  console.log('OPENAI PROVIDER js/ai/providers/openai.js'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'FAILED' : 'openai-provider: OK');
})();
