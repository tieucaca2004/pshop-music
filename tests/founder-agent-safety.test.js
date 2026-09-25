// P0 FOUNDER AGENT — Agent không tự ghi đè ảnh/bgImage sản phẩm thật, AI
// helper phải qua PermissionService, Hoàn tác sống sót sau khi tải lại trang.
// Chạy MÃ NGUỒN THẬT js/admin-agent.js trong Node vm. Chỉ chèn 1 dòng "cửa
// sổ kiểm thử" (lúc chạy test, không sửa file) để truy cập các hàm nội bộ.
// Chạy: node tests/founder-agent-safety.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/admin-agent.js'), 'utf8');
const HOOK = `
  globalThis.__agent = {
    executeStep, applySmartBackground, applyBgImage, undoLastStep, saveWorkflowSnapshot, callOpenAI,
    set(ms, u, ps) { messages = ms; user = u; products = ps; },
    stubWhiteBg(v) { detectWhiteBackground = () => Promise.resolve(v); }
  };
  return {`;
const idx = SRC.lastIndexOf('  return {');
const patched = SRC.slice(0, idx) + HOOK + SRC.slice(idx + '  return {'.length);

function boot(opts) {
  const db = { p1: { id: 'p1', name: 'Pioneer RX3', images: ['https://cdn/goc.jpg', 'https://cdn/2.jpg'], image: 'https://cdn/goc.jpg', backgroundImage: 'https://cdn/bg-cu.jpg' } };
  const writes = [];
  const store = {};
  let fetchCalls = 0;
  const ctx = {
    console, Promise, Object, Array, String, Number, Math, JSON, Date, Error, RegExp,
    DB: {
      get: id => Promise.resolve(db[id] ? JSON.parse(JSON.stringify(db[id])) : null),
      update: (id, ch) => { writes.push({ id, ch }); db[id] = Object.assign({}, db[id], ch); return Promise.resolve(); }
    },
    AdminBgRemover: { removeBackgroundUrl: opts.bgFail ? () => Promise.reject(new Error('Provider 500')) : () => Promise.resolve('https://cdn/xoa-phong.png') },
    PermissionService: { checkPluginExecution: () => Promise.resolve(opts.denied ? { granted: false, reason: 'Thiếu quyền "ai.generate.product"' } : { granted: true }) },
    fetch: () => { fetchCalls++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: '{}' }) }); },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null },
    window: { location: {} }, alert: m => { throw new Error('alert: ' + m); }, confirm: () => true
  };
  vm.createContext(ctx);
  vm.runInContext(patched, ctx);
  const A = ctx.__agent;
  const user = { uid: 'u1', email: 'f@x', getIdToken: () => Promise.resolve('tok') };
  const msg = { id: 'm1', role: 'agent', steps: [{ tool: 'smart-background', target: 'Pioneer RX3', status: 'pending', inputParams: { productId: 'p1' } }] };
  A.set([msg], user, [JSON.parse(JSON.stringify(db.p1))]);
  return { A, db, writes, msg, store, fetches: () => fetchCalls };
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✔ ' + name); } catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; }
}

(async () => {
  await t('smart-background AI thành công → KHÔNG ghi DB, chờ duyệt', async () => {
    const s = boot({}); s.A.stubWhiteBg(true);
    assert.strictEqual(await s.A.executeStep('m1', 0), 'completed');
    assert.strictEqual(s.writes.length, 0, 'Agent tự ghi DB');
    assert.strictEqual(s.msg.steps[0].smartBackground.pendingApproval, true);
    assert.strictEqual(s.db.p1.image, 'https://cdn/goc.jpg');
  });
  await t('smart-background AI lỗi → báo lỗi, KHÔNG ghi DB', async () => {
    const s = boot({ bgFail: true }); s.A.stubWhiteBg(true);
    await s.A.executeStep('m1', 0);
    assert.strictEqual(s.writes.length, 0);
    assert.match(s.msg.steps[0].smartBackground.reason, /Provider 500/);
  });
  await t('Founder DUYỆT → ảnh mới lên đầu, ảnh gốc GIỮ trong Gallery', async () => {
    const s = boot({}); s.A.stubWhiteBg(true);
    await s.A.executeStep('m1', 0); await s.A.applySmartBackground('m1', 0);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s.db.p1.images)), ['https://cdn/xoa-phong.png', 'https://cdn/goc.jpg', 'https://cdn/2.jpg']);
    assert.strictEqual(s.db.p1.image, 'https://cdn/xoa-phong.png');
  });
  await t('Tải lại trang (snapshot localStorage) → vẫn Hoàn tác được về ảnh gốc', async () => {
    const s = boot({}); s.A.stubWhiteBg(true);
    await s.A.executeStep('m1', 0); await s.A.applySmartBackground('m1', 0);
    s.A.saveWorkflowSnapshot();
    const snap = JSON.parse(s.store.pshopFounderAgentWorkflowSnapshot || 'null');
    assert.ok(snap, 'snapshot bị xoá dù còn dữ liệu Hoàn tác');
    // "Phiên mới": khôi phục message từ snapshot rồi Hoàn tác.
    const s2 = boot({}); s2.db.p1 = s.db.p1;
    s2.A.set([snap.message], { uid: 'u1' }, [JSON.parse(JSON.stringify(s.db.p1))]);
    s2.A.undoLastStep(snap.message.id);
    await new Promise(r => setTimeout(r, 10));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s2.db.p1.images)), ['https://cdn/goc.jpg', 'https://cdn/2.jpg']);
    assert.strictEqual(s2.db.p1.image, 'https://cdn/goc.jpg');
  });
  await t('Ảnh nền AI (image-generator) → chỉ ghi khi DUYỆT, Hoàn tác trả bgImage cũ', async () => {
    const s = boot({});
    s.msg.steps[0] = { tool: 'image-generator', status: 'completed', pendingBgImage: { productId: 'p1', imageUrl: 'https://cdn/bg-ai.png' } };
    assert.strictEqual(s.writes.length, 0);
    await s.A.applyBgImage('m1', 0);
    assert.strictEqual(s.db.p1.backgroundImage, 'https://cdn/bg-ai.png');
    s.A.undoLastStep('m1');
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(s.db.p1.backgroundImage, 'https://cdn/bg-cu.jpg');
  });
  await t('Permission denied → AI helper (Planner/research) KHÔNG gọi openaiProxy', async () => {
    const s = boot({ denied: true });
    await assert.rejects(s.A.callOpenAI('x'), /Không có quyền/);
    assert.strictEqual(s.fetches(), 0);
  });
  await t('Permission granted → AI helper gọi openaiProxy 1 lần', async () => {
    const s = boot({});
    await s.A.callOpenAI('x');
    assert.strictEqual(s.fetches(), 1);
  });
  console.log('FOUNDER AGENT js/admin-agent.js'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'FAILED' : 'founder-agent-safety: OK');
})();
