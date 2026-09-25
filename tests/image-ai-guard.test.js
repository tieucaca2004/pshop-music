// P1 IMAGE AI — js/admin-image-ai.js: chống tạo ảnh trùng (mỗi lượt tốn phí
// OpenAI) và lỗi pipeline phải hiện ra cho Founder (không kẹt "Đang gửi...").
// vm, mã nguồn thật. Chạy: node tests/image-ai-guard.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/admin-image-ai.js'), 'utf8');

function boot(pipelineImpl) {
  const els = {};
  const el = id => els[id] || (els[id] = { id, value: '', disabled: false, style: {}, innerHTML: '', textContent: '', options: [], addEventListener: (e, f) => { els[id].onclick = f; } });
  let calls = 0;
  const ctx = {
    console, Promise, Object, Array, String, Number, Math, JSON, Date, setTimeout, clearInterval, setInterval,
    document: { getElementById: el },
    AdminAuth: { init: () => Promise.resolve(), getUser: () => ({ uid: 'u', email: 'e' }) },
    PermissionService: { checkPluginExecution: () => Promise.resolve({ granted: true }) },
    PipelineAdapter: { generateThroughPipeline: () => { calls++; return pipelineImpl(); } },
    DraftDB: { getAll: () => Promise.resolve([]) }, DB: { getAll: () => Promise.resolve([]) }, BlogDB: { getAll: () => Promise.resolve([]) }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n;this.AdminImageAI = AdminImageAI;', ctx);
  ctx.AdminImageAI.init();
  return { els, calls: () => calls, click: () => els.imgGenerateBtn.onclick() };
}
const results = [];
async function t(n, fn) { try { await fn(); results.push('  ✔ ' + n); } catch (e) { results.push('  ✘ ' + n + ' — ' + e.message); process.exitCode = 1; } }
const tick = () => new Promise(r => setTimeout(r, 20));
(async () => {
  await t('Bấm Generate 3 lần liền → CHỈ 1 request tạo ảnh', async () => {
    let resolve; const s = boot(() => new Promise(r => { resolve = r; }));
    s.click(); await tick(); s.click(); s.click(); await tick();
    assert.strictEqual(s.calls(), 1);
    assert.strictEqual(s.els.imgGenerateBtn.disabled, true);
    resolve({ draftId: 'd1', job: { id: 'j' } }); await tick();
    assert.strictEqual(s.els.imgGenerateBtn.disabled, false, 'nút không mở lại sau khi xong');
    s.click(); await tick();
    assert.strictEqual(s.calls(), 2, 'không cho tạo lượt mới sau khi xong');
  });
  await t('Pipeline reject → hiện lỗi, mở lại nút (không kẹt)', async () => {
    const s = boot(() => Promise.reject(new Error('OpenAI 500')));
    s.click(); await tick();
    assert.match(s.els.imgAiMessage ? s.els.imgAiMessage.innerHTML : JSON.stringify(Object.values(s.els).map(e => e.innerHTML)), /OpenAI 500/);
    assert.strictEqual(s.els.imgGenerateBtn.disabled, false);
  });
  console.log('IMAGE AI js/admin-image-ai.js'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'FAILED' : 'image-ai-guard: OK');
})();
