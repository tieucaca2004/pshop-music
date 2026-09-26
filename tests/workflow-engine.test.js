// WORKFLOW AUTOMATION — js/ai/workflow-engine.js. Chạy MÃ NGUỒN THẬT của
// engine trong Node (file có sẵn module.exports). Chỉ giả lập các phụ thuộc
// bên ngoài engine (PermissionService/PluginManager/AIJobQueue/JobDB) bằng
// biến global, hoặc truyền `overrideExecute` (hook engine có sẵn cho test).
// Mọi chờ đợi đều có giới hạn thời gian — không polling, không treo.
// Chạy: node tests/workflow-engine.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const ENGINE = path.join(__dirname, '..', 'js/ai/workflow-engine.js');

function load() {
  delete require.cache[require.resolve(ENGINE)];
  return require(ENGINE).WorkflowEngine;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Promise còn treo sau `ms` → 'PENDING' (không chờ vô hạn).
const settleWithin = (p, ms) => Promise.race([
  p.then(v => ({ settled: 'resolved', v }), e => ({ settled: 'rejected', e })),
  sleep(ms).then(() => ({ settled: 'PENDING' }))
]);
const ok = (s, extra) => Promise.resolve(Object.assign({ status: s || 'completed' }, extra || {}));

// Phụ thuộc giả của đường Plugin (Sprint 7): ghi lại thứ tự gọi để kiểm
// đúng luồng PermissionService → PluginManager → AIJobQueue → JobDB.
function governed(opts) {
  opts = opts || {};
  const calls = [];
  global.PermissionService = {
    checkPluginExecution: (uid, email, id) => { calls.push('perm:' + id); return opts.permReject ? Promise.reject(new Error('mạng lỗi')) : Promise.resolve(opts.denied ? { granted: false, permission: 'ai.generate.x' } : { granted: true }); }
  };
  global.PluginManager = {
    loadPlugin: id => { calls.push('load:' + id); return Promise.resolve(opts.notFound ? null : {
      execute: (items, uid, email) => { calls.push('exec:' + JSON.stringify(items)); return opts.execReject ? Promise.reject(new Error('Plugin "X" đang tắt trong Plugin Manager.')) : Promise.resolve({ id: 'job-' + id }); }
    }); }
  };
  global.AIJobQueue = { resume: (uid, email) => { calls.push('resume:' + uid); return Promise.resolve(); } };
  global.JobDB = { get: id => { calls.push('get:' + id); return Promise.resolve(opts.jobFailed
    ? { id, status: 'failed', items: [{ status: 'failed', error: 'Provider chưa sẵn sàng.' }] }
    : { id, status: 'completed', items: [{ status: 'completed', resultDraftId: 'd1' }] }); } };
  return calls;
}
function ungoverned() {
  delete global.PermissionService; delete global.PluginManager; delete global.AIJobQueue; delete global.JobDB;
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✔ ' + name); }
  catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; }
  finally { ungoverned(); }
}

(async () => {
  const W = load();

  // ── A. Engine lifecycle / run() cơ bản ────────────────────────────────
  await t('run: step lỗi dừng chuỗi, không chạy step sau', async () => {
    let n = 0;
    const r = await W.run([{ type: 'generation' }, { type: 'generation' }], 'u', 'e', { overrideExecute: () => { n++; return ok('failed'); } });
    assert.strictEqual(n, 1); assert.strictEqual(r.stoppedEarly, true); assert.strictEqual(r.reason, 'failed');
  });
  await t('run: step type lạ → failed + dừng', async () => {
    const r = await W.run([{ type: 'xyz' }], 'u', 'e', {});
    assert.strictEqual(r.stoppedEarly, true); assert.match(r.results[0].error, /Unknown step type/);
  });
  await t('run: approval dừng ở awaiting_approval; delay chờ rồi hoàn tất', async () => {
    let r = await W.run([{ type: 'approval' }, { type: 'delay' }], 'u', 'e', {});
    assert.strictEqual(r.reason, 'awaiting_approval'); assert.strictEqual(r.results.length, 1);
    r = await W.run([{ type: 'delay', config: { delayMs: 5 } }], 'u', 'e', {});
    assert.strictEqual(r.results[0].status, 'completed');
  });
  await t('run: retry tới khi thành công', async () => {
    let n = 0;
    const r = await W.run([{ type: 'generation', config: { retryCount: 3, retryDelayMs: 1 } }], 'u', 'e', { overrideExecute: () => { n++; return ok(n < 3 ? 'failed' : 'completed'); } });
    assert.strictEqual(n, 3); assert.strictEqual(r.stoppedEarly, false);
  });
  await t('runBatch: tổng hợp thành công/thất bại', async () => {
    const r = await W.runBatch([{ moduleId: 'a' }, { moduleId: 'b', fail: true }], 'u', 'e', { overrideExecute: s => ok(s.inputParams.fail ? 'failed' : 'completed') });
    assert.strictEqual(r.totalSuccess, 1); assert.strictEqual(r.totalFailed, 1);
  });

  // ── B/C. Decision Context, IF/ELSE, SWITCH ───────────────────────────
  await t('Decision Context: biến/shared/default, không alias input, finish', async () => {
    const src = { a: 1 };
    const c = W.createDecisionContext({ workflowId: 'wf', variables: src });
    W.setDecisionVariable(c, 'a', 2); W.setDecisionShared(c, 's', 'v');
    assert.strictEqual(src.a, 1); assert.strictEqual(W.getDecisionVariable(c, 'a'), 2);
    assert.strictEqual(W.getDecisionShared(c, 's'), 'v'); assert.strictEqual(W.getDecisionVariable(c, 'x', 'D'), 'D');
    assert.match(c.executionId, /^exec-/); W.finishDecisionContext(c); assert.ok(c.duration >= 0);
  });
  await t('IF/ELSE: 13 toán tử + biến thiếu + điều kiện hàm', async () => {
    const c = W.createDecisionContext({ variables: { x: 5, s: '' } });
    const cases = [['eq', 5, true], ['ne', 5, false], ['gt', 4, true], ['gte', 5, true], ['lt', 6, true], ['lte', 4, false],
      ['in', [1, 5], true], ['notin', [5], false], ['truthy', null, true], ['falsy', null, false], ['exists', null, true]];
    cases.forEach(([op, v, exp]) => assert.strictEqual(W.evaluateCondition({ key: 'x', op, value: v }, c), exp, op));
    assert.strictEqual(W.evaluateCondition({ key: 's', op: 'empty' }, c), true);
    assert.strictEqual(W.evaluateCondition({ key: 'missing', op: 'eq', value: 1 }, c), false);
    assert.strictEqual(W.evaluateCondition(ctx => ctx.variables.x === 5, c), true);
  });
  await t('IF/ELSE trong run(): điều kiện sai → skipped, step sau vẫn chạy', async () => {
    const c = W.createDecisionContext({ variables: { x: 1 } });
    const r = await W.run([{ type: 'generation', condition: { key: 'x', op: 'eq', value: 2 } }, { type: 'generation' }], 'u', 'e', { overrideExecute: () => ok(), decisionContext: c });
    assert.deepStrictEqual(r.results.map(x => x.status), ['skipped', 'completed']);
  });
  await t('SWITCH: value / when() / default / không khớp', async () => {
    const c = W.createDecisionContext({ variables: { k: 'vi' } });
    const cfg = { key: 'k', cases: [{ value: 'en', steps: ['EN'] }, { when: v => v === 'vi', steps: ['VI'] }], default: { steps: ['D'] } };
    assert.deepStrictEqual(W.runSwitch(cfg, c).steps, ['VI']);
    W.setDecisionVariable(c, 'k', 'fr'); assert.strictEqual(W.runSwitch(cfg, c).case, 'default');
    assert.strictEqual(W.runSwitch({ key: 'k', cases: [{ value: 'en' }] }, c).matched, false);
  });

  // ── F. PARALLEL ──────────────────────────────────────────────────────
  const pExec = s => sleep(s.ms || 5).then(() => s.throw ? Promise.reject(new Error('x')) : { status: s.fail ? 'failed' : 'completed', id: s.id });
  await t('PARALLEL: tất cả thành công, giữ thứ tự kết quả', async () => {
    const r = await W.runParallel([{ id: 1, ms: 15 }, { id: 2 }, { id: 3 }], 'u', 'e', { overrideExecute: pExec });
    assert.deepStrictEqual(r.results.map(x => x.id), [1, 2, 3]); assert.strictEqual(r.fulfilled, 3);
  });
  await t('PARALLEL: lỗi một phần (failFast=false) → tổng hợp đủ', async () => {
    const r = await W.runParallel([{ id: 1 }, { id: 2, fail: true }, { id: 3, throw: true }], 'u', 'e', { overrideExecute: pExec });
    assert.strictEqual(r.fulfilled, 1); assert.strictEqual(r.rejected, 2);
  });
  await t('PARALLEL: concurrencyLimit=2 → tối đa 2 task cùng lúc', async () => {
    let active = 0, peak = 0;
    await W.runParallel([{}, {}, {}, {}, {}], 'u', 'e', { concurrencyLimit: 2, overrideExecute: () => { active++; peak = Math.max(peak, active); return sleep(10).then(() => { active--; return { status: 'completed' }; }); } });
    assert.strictEqual(peak, 2);
  });
  await t('PARALLEL: failFast=true reject sớm', async () => {
    const t0 = Date.now();
    const s = await settleWithin(W.runParallel([{ id: 1, ms: 200 }, { id: 2, fail: true }], 'u', 'e', { overrideExecute: pExec, failFast: true }), 1000);
    assert.strictEqual(s.settled, 'rejected'); assert.ok(Date.now() - t0 < 150);
  });
  await t('PARALLEL: timeout từng task + danh sách rỗng', async () => {
    const r = await W.runParallel([{ id: 1, ms: 200 }, { id: 2 }], 'u', 'e', { overrideExecute: pExec, timeout: 30 });
    assert.strictEqual(r.results[0].status, 'failed'); assert.match(r.results[0].error, /Timeout/); assert.strictEqual(r.results[1].status, 'completed');
    const e = await W.runParallel([], 'u', 'e', {}); assert.strictEqual(e.results.length, 0);
  });

  // ── G. WAIT EVENT (đường chính) ──────────────────────────────────────
  await t('WAIT: pause → sai event không resume → đúng event resume → step kế → COMPLETE; event trùng = no-op', async () => {
    const p = W.run([{ type: 'generation' }, { type: 'wait_event', eventId: 'T-evt-1' }, { type: 'generation' }], 'u', 'e', { overrideExecute: () => ok() });
    assert.strictEqual((await settleWithin(p, 20)).settled, 'PENDING');
    assert.strictEqual(W.resumeExecution('T-evt-other', {}).emitted, false);
    assert.strictEqual((await settleWithin(p, 10)).settled, 'PENDING');
    assert.strictEqual(W.resumeExecution('T-evt-1', { ok: 1 }).emitted, true);
    const s = await settleWithin(p, 200);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.stoppedEarly, false);
    assert.strictEqual(s.v.results.length, 3); assert.strictEqual(s.v.results[1].eventPayload.ok, 1);
    assert.strictEqual(W.resumeExecution('T-evt-1', {}).emitted, false);
  });
  await t('WAIT: timeout → run dừng reason event_timeout', async () => {
    const s = await settleWithin(W.run([{ type: 'wait_event', eventId: 'T-evt-t', config: { timeout: 20 } }], 'u', 'e', {}), 500);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.reason, 'event_timeout');
  });

  // ── H. POLICY ────────────────────────────────────────────────────────
  await t('POLICY: deny chặn trước execute; requireApproval; providerPolicy', async () => {
    let n = 0; const exec = s => { n++; return ok('completed', { cfg: s.config }); };
    let r = await W.run([{ type: 'generation', policy: { deny: true } }], 'u', 'e', { overrideExecute: exec });
    assert.strictEqual(r.reason, 'policy_denied'); assert.strictEqual(n, 0);
    r = await W.run([{ type: 'generation', policy: { requireApproval: true } }], 'u', 'e', { overrideExecute: exec });
    assert.strictEqual(r.reason, 'awaiting_approval'); assert.strictEqual(n, 0);
    r = await W.run([{ type: 'generation', policy: { providerPolicy: 'deepseek' } }], 'u', 'e', { overrideExecute: exec });
    assert.strictEqual(r.results[0].cfg.providerId, 'deepseek');
  });

  // ── K/M. Trigger thủ công từ admin/ai/workflow.html — hợp đồng Sprint 7 (WF-D1) ──
  await t('[WF-D1] step {pluginId, inputParams} đi đúng PermissionService → PluginManager → AIJobQueue → JobDB', async () => {
    const calls = governed();
    const r = await W.run([{ pluginId: 'faq-generator', inputParams: { topic: 'T' } }], 'uid1', 'a@x');
    assert.deepStrictEqual(calls, ['perm:faq-generator', 'load:faq-generator', 'exec:[{"topic":"T"}]', 'resume:uid1', 'get:job-faq-generator']);
    assert.strictEqual(r.stoppedEarly, false);
    assert.strictEqual(r.results[0].status, 'completed'); assert.strictEqual(r.results[0].jobId, 'job-faq-generator');
    assert.strictEqual(r.results[0].stepIndex, 0);
  });
  await t('[WF-D1] thiếu quyền → permission_denied, KHÔNG tải Plugin/không vào Queue, dừng chuỗi', async () => {
    const calls = governed({ denied: true });
    const r = await W.run([{ pluginId: 'blog-writer', inputParams: {} }, { pluginId: 'faq-generator', inputParams: {} }], 'u', 'e');
    assert.deepStrictEqual(calls, ['perm:blog-writer']);
    assert.strictEqual(r.results[0].status, 'permission_denied'); assert.strictEqual(r.stoppedEarly, true); assert.strictEqual(r.results.length, 1);
  });
  await t('[WF-D1] không tìm thấy Plugin → plugin_not_found', async () => {
    governed({ notFound: true });
    const r = await W.run([{ pluginId: 'x', inputParams: {} }], 'u', 'e');
    assert.strictEqual(r.results[0].status, 'plugin_not_found');
  });
  await t('[WF-D1] Plugin tắt/thiếu field (execute reject) → failed kèm lỗi, không reject run()', async () => {
    governed({ execReject: true });
    const r = await W.run([{ pluginId: 'x', inputParams: {} }], 'u', 'e');
    assert.strictEqual(r.results[0].status, 'failed'); assert.match(r.results[0].error, /đang tắt/);
  });
  await t('[WF-D1] Job lỗi → failed kèm lỗi item, dừng chuỗi', async () => {
    governed({ jobFailed: true });
    const r = await W.run([{ pluginId: 'x', inputParams: {} }, { pluginId: 'y', inputParams: {} }], 'u', 'e');
    assert.strictEqual(r.results[0].status, 'failed'); assert.match(r.results[0].error, /Provider chưa sẵn sàng/);
    assert.strictEqual(r.results.length, 1); assert.strictEqual(r.stoppedEarly, true);
  });
  await t('[WF-D1] thiếu PermissionService/PluginManager/Queue trên trang → failed rõ ràng, không crash', async () => {
    ungoverned();
    const r = await W.run([{ pluginId: 'x', inputParams: {} }], 'u', 'e');
    assert.strictEqual(r.results[0].status, 'failed'); assert.doesNotMatch(r.results[0].error, /Unknown step type/);
  });
  await t('[WF-D1] tham số thứ 4 là hàm → onStepDone gọi đúng 1 lần/step với kết quả cuối', async () => {
    governed();
    const seen = [];
    const r = await W.run([{ pluginId: 'a', inputParams: {} }, { pluginId: 'b', inputParams: {} }], 'u', 'e', entry => seen.push(entry.stepIndex + ':' + entry.status));
    assert.deepStrictEqual(seen, ['0:completed', '1:completed']); assert.strictEqual(r.results.length, 2);
  });
  await t('[WF-D1] onStepDone ném lỗi không làm hỏng workflow', async () => {
    governed();
    const r = await W.run([{ pluginId: 'a', inputParams: {} }, { pluginId: 'b', inputParams: {} }], 'u', 'e', () => { throw new Error('UI lỗi'); });
    assert.strictEqual(r.stoppedEarly, false); assert.strictEqual(r.results.length, 2);
  });
  await t('[WF-D1] step có `type` giữ nguyên hành vi Phase 2.7 (generation vẫn qua GenerationService)', async () => {
    governed();
    const r = await W.run([{ type: 'generation', moduleId: 'faq-generator', pluginId: 'faq-generator', inputParams: {} }], 'u', 'e', {});
    assert.match(r.results[0].error, /GenerationService not available/);
  });

  // ── H. ERROR — run() không bao giờ reject thô (WF-D2) ─────────────────
  await t('[WF-D2] executor reject → run() resolve, step failed kèm lỗi, dừng chuỗi', async () => {
    const s = await settleWithin(W.run([{ type: 'generation' }, { type: 'generation' }], 'u', 'e', { overrideExecute: () => Promise.reject(new Error('network down')) }), 500);
    assert.strictEqual(s.settled, 'resolved');
    assert.strictEqual(s.v.results[0].status, 'failed'); assert.strictEqual(s.v.results[0].error, 'network down');
    assert.strictEqual(s.v.stoppedEarly, true); assert.strictEqual(s.v.results.length, 1);
  });
  await t('[WF-D2] executor throw đồng bộ / trả rỗng → failed, không reject', async () => {
    let s = await settleWithin(W.run([{ type: 'generation' }], 'u', 'e', { overrideExecute: () => { throw new Error('sync boom'); } }), 500);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.results[0].error, 'sync boom');
    s = await settleWithin(W.run([{ type: 'generation' }], 'u', 'e', { overrideExecute: () => Promise.resolve(undefined) }), 500);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.results[0].status, 'failed');
  });
  await t('[WF-D2] executor reject vẫn được retry', async () => {
    let n = 0;
    const r = await W.run([{ type: 'generation', config: { retryCount: 1, retryDelayMs: 1 } }], 'u', 'e', { overrideExecute: () => { n++; return n === 1 ? Promise.reject(new Error('tạm lỗi')) : ok(); } });
    assert.strictEqual(n, 2); assert.strictEqual(r.stoppedEarly, false);
  });
  await t('[WF-D2] fallback reject → failed reason fallback_failed, không reject', async () => {
    const s = await settleWithin(W.run([{ type: 'generation', config: { fallbackProvider: 'p2' } }], 'u', 'e', {
      overrideExecute: st => st.inputParams && st.inputParams._fallbackProvider ? Promise.reject(new Error('p2 lỗi')) : ok('failed')
    }), 500);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.reason, 'fallback_failed'); assert.strictEqual(s.v.results[0].error, 'p2 lỗi');
  });
  await t('[WF-D2] trang Workflow: kiểm quyền lỗi mạng → step failed + onStepDone, nút không kẹt', async () => {
    governed({ permReject: true });
    const seen = [];
    const s = await settleWithin(W.run([{ pluginId: 'a', inputParams: {} }], 'u', 'e', entry => seen.push(entry.status)), 500);
    assert.strictEqual(s.settled, 'resolved'); assert.strictEqual(s.v.results[0].status, 'failed'); assert.deepStrictEqual(seen, ['failed']);
  });

  // ── G. WAIT EVENT — cancel/timeout dọn dẹp (WF-D3) ───────────────────
  await t('[WF-D3] cancelWaitEvent → run() đang chờ kết thúc với reason event_cancelled (không treo)', async () => {
    let n = 0;
    const p = W.run([{ type: 'wait_event', eventId: 'T-evt-c' }, { type: 'generation' }], 'u', 'e', { overrideExecute: () => { n++; return ok(); } });
    await sleep(10);
    assert.strictEqual(W.cancelWaitEvent('T-evt-c'), true);
    const s = await settleWithin(p, 300);
    assert.strictEqual(s.settled, 'resolved', 'run() vẫn treo sau cancel');
    assert.strictEqual(s.v.reason, 'event_cancelled'); assert.strictEqual(s.v.results[0].status, 'cancelled'); assert.strictEqual(n, 0);
    assert.strictEqual(W.resumeExecution('T-evt-c', {}).emitted, false);
  });
  await t('[WF-D3] waitForEvent bị cancel → reject code WAIT_CANCELLED; cancel event không tồn tại → false', async () => {
    const s = settleWithin(W.waitForEvent('T-evt-c2', { timeout: 5000 }), 300);
    W.cancelWaitEvent('T-evt-c2');
    const r = await s;
    assert.strictEqual(r.settled, 'rejected'); assert.strictEqual(r.e.code, 'WAIT_CANCELLED');
    assert.strictEqual(W.cancelWaitEvent('T-evt-khong-co'), false);
  });
  await t('[WF-D3] hết timeout → registry được dọn (resume báo không có listener)', async () => {
    const s = await settleWithin(W.waitForEvent('T-evt-to', { timeout: 10 }), 300);
    assert.strictEqual(s.settled, 'rejected'); assert.strictEqual(s.e.code, 'WAIT_TIMEOUT');
    assert.deepStrictEqual(W.resumeExecution('T-evt-to', {}), { emitted: false, listeners: 0 });
  });
  await t('[WF-D3] 2 waiter cùng event: 1 timeout, waiter còn lại vẫn resume được', async () => {
    const a = settleWithin(W.waitForEvent('T-evt-2w', { timeout: 10 }), 300);
    const b = settleWithin(W.waitForEvent('T-evt-2w', {}), 300);
    assert.strictEqual((await a).settled, 'rejected');
    assert.deepStrictEqual(W.resumeExecution('T-evt-2w', { v: 1 }), { emitted: true, listeners: 1 });
    const rb = await b; assert.strictEqual(rb.settled, 'resolved'); assert.strictEqual(rb.v.eventPayload.v, 1);
  });

  // ── J. RETRY/FALLBACK — không ghi đè định nghĩa step (WF-D4) ─────────
  const fbExec = calls => st => { const p = st.inputParams && st.inputParams._fallbackProvider; calls.push(p || 'primary'); return ok(p ? 'completed' : 'failed'); };
  await t('[WF-D4] cùng định nghĩa chạy 2 lần → lần nào cũng thử fallback; step gốc không bị ghi đè', async () => {
    const def = [{ type: 'generation', config: { fallbackProvider: 'p2' } }];
    const c1 = [], c2 = [];
    const r1 = await W.run(def, 'u', 'e', { overrideExecute: fbExec(c1) });
    const r2 = await W.run(def, 'u', 'e', { overrideExecute: fbExec(c2) });
    assert.deepStrictEqual(c1, ['primary', 'p2']); assert.deepStrictEqual(c2, ['primary', 'p2']);
    assert.strictEqual(r1.stoppedEarly, false); assert.strictEqual(r2.stoppedEarly, false);
    assert.strictEqual('_fallbackAttempted' in def[0], false);
  });
  await t('[WF-D4] runLoop dùng lại step: mọi vòng đều thử fallback', async () => {
    const calls = [];
    await W.runLoop({ steps: [{ type: 'generation', config: { fallbackProvider: 'p2' } }], maxIterations: 2 }, 'u', 'e', { overrideExecute: fbExec(calls) });
    assert.deepStrictEqual(calls, ['primary', 'p2', 'primary', 'p2']);
  });

  // ── D/E. LOOP / FOREACH ──────────────────────────────────────────────
  await t('LOOP: chạy đủ maxIterations khi mọi vòng thành công', async () => {
    let n = 0;
    const r = await W.runLoop({ steps: [{ type: 'generation' }], maxIterations: 3 }, 'u', 'e', { overrideExecute: () => { n++; return ok(); } });
    assert.strictEqual(n, 3); assert.strictEqual(r.iterations, 3);
  });
  await t('LOOP: breakOn dừng khi điều kiện đúng', async () => {
    const c = W.createDecisionContext({ variables: { n: 0 } }); let n = 0;
    await W.runLoop({ steps: [{ type: 'generation' }], maxIterations: 10, breakOn: { key: 'n', op: 'gte', value: 2 } }, 'u', 'e',
      { decisionContext: c, overrideExecute: () => { n++; c.variables.n++; return ok(); } });
    assert.strictEqual(n, 2);
  });
  await t('FOREACH: bỏ qua item (skip) rồi chạy item sau; danh sách rỗng', async () => {
    let n = 0;
    const r = await W.runForEach([1, 2, 3], { steps: [{ type: 'generation' }] }, 'u', 'e', { overrideExecute: () => { n++; return ok(); },
      buildIterationContext: item => item === 2 ? { skip: true } : W.createDecisionContext({ variables: { item } }) });
    assert.strictEqual(n, 2); assert.strictEqual(r.itemsProcessed, 2); assert.strictEqual(r.results[1].skipped, true);
    assert.strictEqual((await W.runForEach([], { steps: [] }, 'u', 'e', {})).itemsProcessed, 0);
  });
  await t('[WF-D5] LOOP: 1 vòng lỗi → dừng, không chạy các vòng sau (không gọi AI lỗi N lần)', async () => {
    let n = 0;
    const r = await W.runLoop({ steps: [{ type: 'generation' }], maxIterations: 5 }, 'u', 'e', { overrideExecute: () => { n++; return ok('failed'); } });
    assert.strictEqual(n, 1); assert.strictEqual(r.iterations, 1); assert.strictEqual(r.stoppedEarly, true);
  });
  await t('[WF-D5] FOREACH: item lỗi → dừng toàn chuỗi (đúng comment "break toàn chuỗi")', async () => {
    let n = 0;
    const r = await W.runForEach([1, 2, 3], { steps: [{ type: 'generation' }] }, 'u', 'e', { overrideExecute: () => { n++; return ok(n === 1 ? 'failed' : 'completed'); },
      buildIterationContext: item => W.createDecisionContext({ variables: { item } }) });
    assert.strictEqual(n, 1); assert.strictEqual(r.results.length, 1); assert.strictEqual(r.stoppedEarly, true);
  });
  await t('[WF-D5] FOREACH: chờ duyệt (awaiting_approval) cũng dừng chuỗi; chạy trọn → stoppedEarly=false', async () => {
    let n = 0;
    const build = item => W.createDecisionContext({ variables: { item } });
    let r = await W.runForEach([1, 2], { steps: [{ type: 'generation', policy: { requireApproval: true } }] }, 'u', 'e', { overrideExecute: () => { n++; return ok(); }, buildIterationContext: build });
    assert.strictEqual(r.results.length, 1); assert.strictEqual(r.stoppedEarly, true); assert.strictEqual(n, 0);
    r = await W.runForEach([1, 2], { steps: [{ type: 'generation' }] }, 'u', 'e', { overrideExecute: () => ok(), buildIterationContext: build });
    assert.strictEqual(r.itemsProcessed, 2); assert.strictEqual(r.stoppedEarly, false);
  });

  // ── B. DECISION — cấu hình điều kiện sai phải fail-closed (WF-D6) ─────
  await t('[WF-D6] toán tử không hỗ trợ → false (không chạy step do gõ sai toán tử)', async () => {
    const c = W.createDecisionContext({ variables: { x: 5 } });
    assert.strictEqual(W.evaluateCondition({ key: 'x', op: 'bogus', value: 999 }, c), false);
    let n = 0;
    const r = await W.run([{ type: 'generation', condition: { key: 'x', op: 'gtt', value: 1 } }], 'u', 'e', { decisionContext: c, overrideExecute: () => { n++; return ok(); } });
    assert.strictEqual(r.results[0].status, 'skipped'); assert.strictEqual(n, 0);
  });
  await t('[WF-D6] op không phải chuỗi không ném lỗi; op viết hoa và thiếu op vẫn đúng', async () => {
    const c = W.createDecisionContext({ variables: { x: 5 } });
    assert.strictEqual(W.evaluateCondition({ key: 'x', op: 5, value: 5 }, c), false);
    assert.doesNotThrow(() => W.decideBranch([{ condition: { key: 'x', op: 7 } }], c));
    assert.strictEqual(W.evaluateCondition({ key: 'x', op: 'GT', value: 1 }, c), true);
    assert.strictEqual(W.evaluateCondition({ key: 'x', value: 5 }, c), true);
  });
  await t('[WF-D6] resolveBranch: không nhánh nào khớp, không default → không chọn nhánh nào', async () => {
    const c = W.createDecisionContext({ variables: { x: 3 } });
    const r = W.resolveBranch([{ name: 'a', condition: { key: 'x', op: 'eq', value: 1 } }, { name: 'b', condition: { key: 'x', op: 'eq', value: 2 } }], c);
    assert.strictEqual(r.selected, null); assert.deepStrictEqual(r.steps, []);
  });
  await t('resolveBranch: nhánh khớp theo priority; nhánh không điều kiện = else; default (object)', async () => {
    const c = W.createDecisionContext({ variables: { x: 3 } });
    assert.strictEqual(W.resolveBranch([{ name: 'else' }, { name: 'hit', condition: { key: 'x', op: 'eq', value: 3 } }], c).selected, 'hit');
    assert.strictEqual(W.resolveBranch([{ name: 'a', condition: { key: 'x', op: 'eq', value: 9 } }, { name: 'else', steps: ['E'] }], c).selected, 'else');
    assert.strictEqual(W.resolveBranch({ lo: { priority: 1, condition: { key: 'x', op: 'gt', value: 0 } }, hi: { priority: 5, condition: { key: 'x', op: 'eq', value: 3 } } }, c).selected, 'hi');
    assert.strictEqual(W.resolveBranch({ a: { condition: { key: 'x', op: 'eq', value: 9 } }, default: { steps: ['D'] } }, c).selected, 'default');
  });

  console.log('WORKFLOW ENGINE js/ai/workflow-engine.js'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'workflow-engine: FAILED' : 'workflow-engine: OK');
  process.exit(process.exitCode || 0);
})();
