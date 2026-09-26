// WORKFLOW-02 server — handler THẬT `aiGenerateWorker` (functions/index.js,
// nhánh `workflow:auto` + `ai-generate:*`) trên Firebase Database Emulator.
// CHỈ thay `runGeneration` (lời gọi AI trả phí, shared/aiGenerate.js) bằng
// stub điều khiển được thành công/thất bại — mọi logic orchestration, ghi
// workflowState/executionLog, đọc workflowConfigs là code thật.
// Cần Database Emulator 127.0.0.1:9000 (project pshop-music), xem tests/e2e/README.md.
// Chạy: node tests/workflow-worker.test.js
'use strict';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
process.env.GCLOUD_PROJECT = 'pshop-music';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'pshop-music', databaseURL: 'http://' + process.env.FIREBASE_DATABASE_EMULATOR_HOST + '?ns=pshop-music-default-rtdb' });
const assert = require('assert');
const path = require('path');
const F = path.join(__dirname, '..', 'functions') + '/';

const calls = [];
let plan = {};
require.cache[require.resolve(F + 'shared/aiGenerate.js')] = {
  id: F + 'shared/aiGenerate.js', filename: F + 'shared/aiGenerate.js', loaded: true,
  exports: {
    runGeneration: async (jobId, moduleId) => {
      calls.push(moduleId);
      const p = plan[moduleId] || {};
      if (p.hook) await p.hook();
      if (p.fail && (p.failTimes === undefined || p.failTimes-- > 0)) throw new Error('stub lỗi ' + moduleId);
      return { id: 'draft-' + moduleId };
    },
    generateForModule: async () => ({}), queueGeneration: async () => ({}), callOpenAiText: async () => '', callOpenAiImage: async () => ''
  }
};
const fx = require(F + 'index.js');
const admin = require(require('module').createRequire(F + 'index.js').resolve('firebase-admin'));
const db = admin.database();
const JOB = id => db.ref('apiAsyncJobs/' + id);
const STEPS = ['product-description-writer', 'blog-writer', 'facebook-post-generator', 'banner-generator'];
const wf = (extra) => Object.assign({ type: 'workflow:auto', uid: 'TEST_WF_UID', status: 'queued', payload: { async: true, productId: 'TEST_P', workflowName: 'TEST_wf_default_' + Date.now() } }, extra || {});
// onValueCreated luôn giao snapshot LÚC TẠO job — kể cả khi platform giao lại
// event (retry/restart) — không phải giá trị hiện tại trong DB. Gọi lại
// handler (resume) vì vậy dùng đúng snapshot lúc tạo.
const created = {};
async function invoke(id, job) {
  if (job) { await JOB(id).set(job); created[id] = job; }
  const snap = created[id];
  await fx.aiGenerateWorker.run({ data: { val: () => snap }, params: { jobId: id } });
  return (await JOB(id).once('value')).val();
}
const setState = (id, s) => () => JOB(id).child('workflowState').set(s);

const results = [];
const ids = [];
async function t(name, fn) {
  calls.length = 0; plan = {};
  try { await fn(); results.push('  ✔ ' + name); }
  catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; }
}

(async () => {
  await t('happy path: 4 step SUCCESS → COMPLETED', async () => {
    ids.push('TEST_WFW_ok');
    const j = await invoke('TEST_WFW_ok', wf());
    assert.deepStrictEqual(calls, STEPS); assert.strictEqual(j.workflowState, 'COMPLETED');
    assert.ok(Object.values(j.executionLog).every(e => e.status === 'SUCCESS'));
  });
  await t('step bắt buộc lỗi → FAILED, dừng; gọi lại handler → resume từ step lỗi', async () => {
    ids.push('TEST_WFW_fail');
    plan = { 'blog-writer': { fail: true } };
    let j = await invoke('TEST_WFW_fail', wf());
    assert.deepStrictEqual(calls, STEPS.slice(0, 2)); assert.strictEqual(j.workflowState, 'FAILED');
    calls.length = 0; plan = {};
    j = await invoke('TEST_WFW_fail');
    assert.deepStrictEqual(calls, STEPS.slice(1)); assert.strictEqual(j.workflowState, 'COMPLETED');
  });
  await t('retry theo step → COMPLETED (không kẹt RETRYING)', async () => {
    ids.push('TEST_WFW_retry');
    await db.ref('workflowConfigs/TEST_wf_retry').set({ id: 'TEST_wf_retry', steps: [{ type: 'generation', moduleId: 'blog-writer', config: { retryCount: 2, retryDelayMs: 5 } }] });
    plan = { 'blog-writer': { fail: true, failTimes: 1 } };
    const j = await invoke('TEST_WFW_retry', wf({ payload: { async: true, workflowName: 'TEST_wf_retry' } }));
    assert.strictEqual(calls.length, 2); assert.strictEqual(j.workflowState, 'COMPLETED'); assert.strictEqual(j.executionLog[0].retry, 1);
  });
  await t('step required:false lỗi → SKIPPED, chạy tiếp', async () => {
    ids.push('TEST_WFW_skip');
    await db.ref('workflowConfigs/TEST_wf_skip').set({ id: 'TEST_wf_skip', steps: [{ type: 'generation', moduleId: 'blog-writer', config: { required: false } }, { type: 'generation', moduleId: 'banner-generator' }] });
    plan = { 'blog-writer': { fail: true } };
    const j = await invoke('TEST_WFW_skip', wf({ payload: { async: true, workflowName: 'TEST_wf_skip' } }));
    assert.deepStrictEqual(calls, ['blog-writer', 'banner-generator']); assert.strictEqual(j.workflowState, 'COMPLETED');
    assert.strictEqual(j.executionLog[0].status, 'SKIPPED');
  });
  await t('[WF-D7] Cancel đặt trong lúc step đang chạy → dừng ở ranh giới step kế, giữ CANCELLED', async () => {
    ids.push('TEST_WFW_cancel');
    plan = { 'blog-writer': { hook: setState('TEST_WFW_cancel', 'CANCELLED') } };
    const j = await invoke('TEST_WFW_cancel', wf());
    assert.deepStrictEqual(calls, STEPS.slice(0, 2)); assert.strictEqual(j.workflowState, 'CANCELLED');
    assert.strictEqual(j.executionLog[2].status, 'SKIPPED'); assert.strictEqual(j.executionLog[2].error, 'CANCELLED');
  });
  await t('[WF-D7] Pause đặt trong lúc step đang chạy → dừng, giữ PAUSED; đặt RUNNING + gọi lại → chạy tiếp từ step kế', async () => {
    ids.push('TEST_WFW_pause');
    plan = { 'product-description-writer': { hook: setState('TEST_WFW_pause', 'PAUSED') } };
    let j = await invoke('TEST_WFW_pause', wf());
    assert.deepStrictEqual(calls, STEPS.slice(0, 1)); assert.strictEqual(j.workflowState, 'PAUSED');
    assert.strictEqual(j.executionLog[1].status, 'PENDING');
    calls.length = 0; plan = {};
    await JOB('TEST_WFW_pause').child('workflowState').set('RUNNING');
    j = await invoke('TEST_WFW_pause');
    assert.deepStrictEqual(calls, STEPS.slice(1)); assert.strictEqual(j.workflowState, 'COMPLETED');
  });
  await t('[WF-D7] Cancel đặt trong lúc step đang retry → không bị RETRYING ghi đè', async () => {
    ids.push('TEST_WFW_cancel_retry');
    await db.ref('workflowConfigs/TEST_wf_cr').set({ id: 'TEST_wf_cr', steps: [{ type: 'generation', moduleId: 'blog-writer', config: { retryCount: 1, retryDelayMs: 5 } }, { type: 'generation', moduleId: 'banner-generator' }] });
    let first = true;
    plan = { 'blog-writer': { fail: true, failTimes: 1, hook: async () => { if (first) { first = false; await setState('TEST_WFW_cancel_retry', 'CANCELLED')(); } } } };
    const j = await invoke('TEST_WFW_cancel_retry', wf({ payload: { async: true, workflowName: 'TEST_wf_cr' } }));
    assert.deepStrictEqual(calls, ['blog-writer', 'blog-writer']); assert.strictEqual(j.workflowState, 'CANCELLED');
  });
  await t('job ai-generate:* (async) vẫn chạy runGeneration đúng 1 lần; job sync bị bỏ qua', async () => {
    ids.push('TEST_WFW_gen', 'TEST_WFW_sync');
    await invoke('TEST_WFW_gen', { type: 'ai-generate:blog-writer', uid: 'u', status: 'queued', payload: { async: true, moduleId: 'blog-writer', inputParams: {} } });
    assert.deepStrictEqual(calls, ['blog-writer']);
    calls.length = 0;
    await invoke('TEST_WFW_sync', { type: 'ai-generate:blog-writer', uid: 'u', status: 'queued', payload: { async: false, moduleId: 'blog-writer', inputParams: {} } });
    assert.deepStrictEqual(calls, []);
  });

  // ── GAP 5: trường `status` (API GET /v1/jobs/:id, poller) phải theo đúng vòng đời ──
  const statusNow = id => JOB(id).child('status').once('value').then(s => s.val());
  await t('[GAP5] thành công → status completed', async () => {
    ids.push('TEST_WFS_ok');
    const j = await invoke('TEST_WFS_ok', wf());
    assert.strictEqual(j.status, 'completed'); assert.strictEqual(j.workflowState, 'COMPLETED');
  });
  await t('[GAP5] step bắt buộc lỗi → status failed kèm error', async () => {
    ids.push('TEST_WFS_fail');
    plan = { 'blog-writer': { fail: true } };
    const j = await invoke('TEST_WFS_fail', wf());
    assert.strictEqual(j.status, 'failed'); assert.match(String(j.error), /stub lỗi blog-writer/);
  });
  await t('[GAP5] huỷ → status cancelled; tạm dừng → paused; resume (giao lại event) → completed', async () => {
    ids.push('TEST_WFS_cancel', 'TEST_WFS_pause');
    plan = { 'blog-writer': { hook: setState('TEST_WFS_cancel', 'CANCELLED') } };
    let j = await invoke('TEST_WFS_cancel', wf());
    assert.strictEqual(j.status, 'cancelled'); assert.strictEqual(j.workflowState, 'CANCELLED');
    calls.length = 0; plan = { 'product-description-writer': { hook: setState('TEST_WFS_pause', 'PAUSED') } };
    j = await invoke('TEST_WFS_pause', wf());
    assert.strictEqual(j.status, 'paused'); assert.strictEqual(j.workflowState, 'PAUSED');
    calls.length = 0; plan = {};
    await JOB('TEST_WFS_pause').child('workflowState').set('RUNNING');
    j = await invoke('TEST_WFS_pause');
    assert.deepStrictEqual(calls, STEPS.slice(1)); assert.strictEqual(j.status, 'completed');
  });
  await t('[GAP5] retry: running → retrying → completed', async () => {
    ids.push('TEST_WFS_retry');
    await db.ref('workflowConfigs/TEST_wf_sr').set({ id: 'TEST_wf_sr', steps: [{ type: 'generation', moduleId: 'blog-writer', config: { retryCount: 1, retryDelayMs: 5 } }] });
    const seen = [];
    plan = { 'blog-writer': { fail: true, failTimes: 1, hook: async () => { seen.push(await statusNow('TEST_WFS_retry')); } } };
    const j = await invoke('TEST_WFS_retry', wf({ payload: { async: true, workflowName: 'TEST_wf_sr' } }));
    assert.deepStrictEqual(seen, ['running', 'retrying']); assert.strictEqual(j.status, 'completed');
  });
  await t('[GAP5] step required:false lỗi rồi skip → status completed', async () => {
    ids.push('TEST_WFS_skip');
    plan = { 'blog-writer': { fail: true } };
    const j = await invoke('TEST_WFS_skip', wf({ payload: { async: true, workflowName: 'TEST_wf_skip' } }));
    assert.strictEqual(j.status, 'completed'); assert.strictEqual(j.executionLog[0].status, 'SKIPPED');
  });
  await t('[GAP5] huỷ trong lúc retry → status cancelled (WF-D7 giữ nguyên)', async () => {
    ids.push('TEST_WFS_cr');
    let first = true;
    plan = { 'blog-writer': { fail: true, failTimes: 1, hook: async () => { if (first) { first = false; await setState('TEST_WFS_cr', 'CANCELLED')(); } } } };
    const j = await invoke('TEST_WFS_cr', wf({ payload: { async: true, workflowName: 'TEST_wf_cr' } }));
    assert.strictEqual(j.workflowState, 'CANCELLED'); assert.strictEqual(j.status, 'cancelled');
  });

  // Dọn toàn bộ dữ liệu TEST_* đã tạo
  for (const id of ids) await JOB(id).remove();
  for (const k of ['TEST_wf_retry', 'TEST_wf_skip', 'TEST_wf_cr', 'TEST_wf_sr']) await db.ref('workflowConfigs/' + k).remove();
  console.log('WORKFLOW WORKER functions/index.js aiGenerateWorker'); results.forEach(r => console.log(r));
  console.log(process.exitCode ? 'workflow-worker: FAILED' : 'workflow-worker: OK');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
