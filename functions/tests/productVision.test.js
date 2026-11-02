/*
 * tests/productVision.test.js — Vision request/response unit tests.
 * These are MOCKED API tests, not a real OpenAI Vision call.
 */
'use strict';
const assert = require('assert');
const vision = require('../shared/productVision');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
const img = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const cfg = { apiKey: 'test-key', timeoutMs: 500, model: 'gpt-4o-mini' };
const okBody = { choices: [{ message: { content: JSON.stringify({ productType: 'Tai nghe chụp tai DJ', brand: 'AIAIAI', brandConfidence: 88, model: '', modelConfidence: 0, color: 'Đen', features: ['tai nghe chụp tai'], uncertain: ['model'] }) } }] };

(async () => {
  await test('no key → unconfigured, no fetch call', async () => {
    let called = false;
    const out = await vision.analyzeProductImage({ buffer: img, mime: 'image/jpeg' }, { apiKey: '', fetch: async () => { called = true; } });
    assert.strictEqual(out.status, 'unconfigured');
    assert.strictEqual(called, false);
  });
  await test('success request uses image data URL + gpt-4o-mini; model is not auto-confirmed', async () => {
    let body = null;
    const fakeFetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => okBody }; };
    const out = await vision.analyzeProductImage({ buffer: img, mime: 'image/jpeg' }, Object.assign({ fetch: fakeFetch }, cfg));
    assert.strictEqual(out.status, 'ok');
    assert.strictEqual(out.httpStatus, 200);
    assert.strictEqual(body.model, 'gpt-4o-mini');
    assert(body.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
    assert.strictEqual(out.productType, 'Tai nghe chụp tai DJ');
    assert.strictEqual(out.brand, 'AIAIAI');
    assert.strictEqual(out.model, null);
    assert.strictEqual(out.color, 'Đen');
  });
  await test('HTTP error → status error', async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'x' } }) });
    const out = await vision.analyzeProductImage({ buffer: img }, Object.assign({ fetch: fakeFetch }, cfg));
    assert.strictEqual(out.status, 'error');
  });
  await test('malformed JSON → status error, no hallucinated fields', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) });
    const out = await vision.analyzeProductImage({ buffer: img }, Object.assign({ fetch: fakeFetch }, cfg));
    assert.strictEqual(out.status, 'error');
    assert.strictEqual(out.model, undefined);
  });
  await test('timeout → status timeout', async () => {
    const fakeFetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const out = await vision.analyzeProductImage({ buffer: img }, Object.assign({ fetch: fakeFetch }, cfg));
    assert.strictEqual(out.status, 'timeout');
  });
  await test('empty/invalid image is rejected before API', async () => {
    const out = await vision.analyzeProductImage({ buffer: Buffer.alloc(0) }, cfg);
    assert.strictEqual(out.status, 'invalid_image');
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
