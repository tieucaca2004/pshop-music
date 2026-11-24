/*
 * WU1-R1 — regressions for acceptance defects D1–D5 and D6 conflict boundary.
 * Offline only; fetch/provider/cache are injected.
 */
'use strict';
const assert = require('assert');
const research = require('../shared/productResearch');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
const CFG = { provider: 'tavily', configured: true, officialDomains: ['krkmusic.com'], timeoutMs: 1000 };
function mkFetch(results) {
  return async () => ({ ok: true, status: 200, json: async () => ({ results }) });
}
function run(q, results, fetchImpl, cfg = CFG) {
  const f = fetchImpl || mkFetch(results);
  return research.researchProduct(q, { config: cfg, cache: null, provider: x => research.tavilyProvider(x, cfg, f) });
}
const G2 = { sku: 'RP5G2', name: 'KRK Rokit 5 G2', brand: 'KRK' };

(async () => {
  await test('D1: G4 page with incidental RP5G2 mention is not exact G2 evidence', async () => {
    const out = await run(G2, [{
      title: 'KRK ROKIT G4 Support', url: 'https://www.krkmusic.com/support/g4',
      content: 'KRK RP5G2 compatible', raw_content: 'Power: 203 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.strictEqual(out.status, 'rejected');
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('203 W'));
  });

  await test('D2: KRK Rokit 5 (no generation) is not exact G4', async () => {
    const q = { sku: null, name: 'KRK Rokit 5', brand: 'KRK' };
    const out = await run(q, [{
      title: 'ROKIT 5 G4 Powered Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-5-g4',
      content: 'KRK RP5G4', raw_content: 'Power: 203 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('203 W'));
  });

  await test('F1: G2 query with G2 title but G4 URL is rejected (no cross-generation specs)', async () => {
    const out = await run(G2, [{
      title: 'KRK ROKIT 5 G2 Studio Monitor', url: 'https://www.krkmusic.com/rokit-5-g4',
      content: 'KRK RP5G2', raw_content: 'Power: 203 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('203 W'));
  });

  await test('F1: G2 query with G2 title but G4 body is rejected (no cross-generation specs)', async () => {
    const out = await run(G2, [{
      title: 'KRK ROKIT 5 G2 Studio Monitor', url: 'https://www.krkmusic.com/products/rokit-5',
      content: 'KRK RP5G2', raw_content: 'ROKIT G4 Power: 203 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('203 W'));
  });

  await test('F1 control: valid RP5G2 evidence without conflicting generation remains exact', async () => {
    const out = await run(G2, [{
      title: 'KRK Studio Monitor Support', url: 'https://www.krkmusic.com/support/manuals',
      content: 'KRK RP5G2', raw_content: 'Power: 50 W'
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'RP5G2');
    assert.strictEqual(out.specs.Power, '50 W');
  });

  await test('F2: KRK Rokit 10 (size-only) is not exact against a G4 page', async () => {
    const q = { sku: null, name: 'KRK Rokit 10', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT 10 G4 Studio Monitor', url: 'https://www.krkmusic.com/rokit-10-g4',
      content: 'KRK RP10G4', raw_content: 'Power: 250 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('250 W'));
  });

  await test('F2: KRK Rokit 12 (size-only) is not exact against a G4 page', async () => {
    const q = { sku: null, name: 'KRK Rokit 12', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT 12 G4 Studio Monitor', url: 'https://www.krkmusic.com/rokit-12-g4',
      content: 'KRK RP12G4', raw_content: 'Power: 300 W'
    }]);
    assert.strictEqual(out.matchLevel === 'exact_model', false);
    assert.deepStrictEqual(out.specs || {}, {});
    assert(!JSON.stringify(out).includes('300 W'));
  });

  await test('F2 control: KRK Rokit 10 G2 (explicit generation) remains exact', async () => {
    const q = { sku: 'RP10G2', name: 'KRK Rokit 10 G2', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT 10 G2 Studio Monitor', url: 'https://www.krkmusic.com/rokit-10-g2',
      content: 'KRK RP10G2', raw_content: 'Power: 120 W'
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'RP10G2');
    assert.strictEqual(out.specs.Power, '120 W');
  });

  await test('D3: exact but empty result does not stop the manual query', async () => {
    const seen = [];
    const f = async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body.query);
      if (body.query.includes('manual') || body.query.includes('PDF')) {
        return { ok: true, status: 200, json: async () => ({ results: [{
          title: 'KRK RP5G2 Manual', url: 'https://www.krkmusic.com/manual/rp5g2',
          content: 'KRK RP5G2', raw_content: 'Power: 50 W'
        }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ results: [{
        title: 'KRK RP5G2', url: 'https://www.krkmusic.com/rp5g2',
        content: '', raw_content: ''
      }] }) };
    };
    const out = await run(G2, null, f);
    assert(seen.length >= 2, JSON.stringify(seen));
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.specs.Power, '50 W');
    assert(out.contentStatus === 'sufficient');
  });

  await test('D4: total-budget abort maps to deterministic timeout', async () => {
    const cfg = Object.assign({}, CFG, { timeoutMs: 10 });
    const f = async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    });
    const out = await run(G2, null, f, cfg);
    assert.strictEqual(out.status, 'timeout');
    assert.strictEqual(out.failureStage, 'retrieval');
    assert.deepStrictEqual(out.sources, []);
  });

  await test('D4: global budget spans query expansion', async () => {
    const cfg = Object.assign({}, CFG, { timeoutMs: 30 });
    const f = async (url, init) => new Promise((resolve, reject) => {
      const body = JSON.parse(init.body);
      const delay = body.query.includes('manual') ? 200 : 20;
      const timer = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ results: [] }) }), delay);
      init.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    });
    const out = await run(G2, null, f, cfg);
    assert.strictEqual(out.status, 'timeout');
    assert.strictEqual(out.failureStage, 'retrieval');
  });

  await test('D5: bad cached G4 result is rejected for a G2 query', async () => {
    const hit = { at: Date.now(), data: {
      schema: research.RESEARCH_SCHEMA, status: 'verified', matchLevel: 'exact_model',
      matchedSku: 'ROKIT 5 G4', product: { model: 'ROKIT 5 G4', name: 'KRK ROKIT 5 G4' },
      verification: { verified: true }, sources: [{ url: 'https://www.krkmusic.com/rokit-5-g4' }],
      specs: { Power: '203 W' }, warnings: [], conflicts: []
    } };
    let providerCalled = false;
    const out = await research.researchProduct(G2, {
      config: CFG,
      cache: { get: async () => hit, set: async () => {} },
      provider: async () => {
        providerCalled = true;
        return { matchedSku: 'RP5G2', matchLevel: 'exact_model', verification: { verified: true },
          product: { name: 'KRK Rokit 5 G2', model: 'RP5G2', brand: 'KRK' },
          sources: [{ title: 'KRK RP5G2', url: 'https://www.krkmusic.com/rp5g2', type: 'official', matchLevel: 'exact_model', specs: { Power: '50 W' }, claims: [] }] };
      }
    });
    assert.strictEqual(providerCalled, true);
    assert.notStrictEqual(out.cache, 'hit');
    assert.strictEqual(out.matchedSku, 'RP5G2');
  });

  await test('D5: variant suffix cache entry is rejected for the base model', async () => {
    const q = { sku: 'DDJ-400', name: 'Pioneer DDJ-400', brand: 'Pioneer' };
    const hit = { at: Date.now(), data: {
      schema: research.RESEARCH_SCHEMA, status: 'verified', matchLevel: 'exact_model',
      matchedSku: 'DDJ-400-N', product: { model: 'DDJ-400-N', name: 'DDJ-400-N' },
      verification: { verified: true }, sources: [{ url: 'https://www.pioneerdj.com/ddj-400-n' }],
      specs: { Weight: '9 kg' }, warnings: [], conflicts: []
    } };
    let providerCalled = false;
    const out = await research.researchProduct(q, {
      config: CFG,
      cache: { get: async () => hit, set: async () => {} },
      provider: async () => {
        providerCalled = true;
        return { matchedSku: 'DDJ 400', matchLevel: 'exact_model', verification: { verified: true },
          product: { name: 'Pioneer DDJ-400', model: 'DDJ 400', brand: 'Pioneer' },
          sources: [{ title: 'DDJ-400', url: 'https://www.pioneerdj.com/ddj-400', type: 'official', matchLevel: 'exact_model', specs: { Weight: '2 kg' }, claims: [] }] };
      }
    });
    assert.strictEqual(providerCalled, true);
    assert.notStrictEqual(out.cache, 'hit');
    assert.strictEqual(out.matchedSku, 'DDJ 400');
  });

  await test('D5: incomplete-generation cache entry is rejected', async () => {
    const q = { sku: null, name: 'KRK Rokit 5', brand: 'KRK' };
    const hit = { at: Date.now(), data: {
      schema: research.RESEARCH_SCHEMA, status: 'verified', matchLevel: 'exact_model',
      matchedSku: 'ROKIT 5 G4', product: { model: 'ROKIT 5 G4', name: 'ROKIT 5 G4' },
      verification: { verified: true }, sources: [{ url: 'https://www.krkmusic.com/rokit-5-g4' }],
      specs: { Power: '203 W' }, warnings: [], conflicts: []
    } };
    let providerCalled = false;
    const out = await research.researchProduct(q, {
      config: CFG,
      cache: { get: async () => hit, set: async () => {} },
      provider: async () => {
        providerCalled = true;
        return { matchedSku: '', matchLevel: 'product_family', sources: [], warnings: ['family'] };
      }
    });
    assert.strictEqual(providerCalled, true);
    assert.notStrictEqual(out.cache, 'hit');
    assert.strictEqual(out.matchLevel, 'product_family');
  });

  await test('D6: conflicting claims are stripped from source claims while provenance remains', async () => {
    const out = await run(G2, [
      { title: 'KRK official A', url: 'https://www.krkmusic.com/a', content: 'KRK RP5G2', raw_content: 'Power: 50 W continuous output for studio monitoring' },
      { title: 'KRK official B', url: 'https://www.krkmusic.com/b', content: 'KRK RP5G2', raw_content: 'Power: 55 W continuous output for studio monitoring' }
    ]);
    assert.strictEqual(out.specs.Power, undefined);
    assert(out.conflicts.some(c => c.key === 'Power'));
    assert(out.conflicts.every(c => Array.isArray(c.sources) && c.sources.length >= 1));
    assert(!JSON.stringify(out.sources).includes('50 W'));
    assert(!JSON.stringify(out.sources).includes('55 W'));
  });

  console.log('\n────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
