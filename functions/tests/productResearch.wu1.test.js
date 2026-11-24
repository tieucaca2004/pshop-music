/*
 * WU1 — Research retrieval and product matching.
 * Offline tests only; fetch is injected. No Tavily/Google/network call is made.
 */
'use strict';
const assert = require('assert');
const research = require('../shared/productResearch');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}

const CFG = { provider: 'tavily', configured: true, officialDomains: ['krkmusic.com', 'pioneerdj.com'], timeoutMs: 1000 };
function mkFetch(results) {
  return async () => ({ ok: true, status: 200, json: async () => ({ results }) });
}
function run(q, results, cfg = CFG, fetchImpl) {
  const f = fetchImpl || mkFetch(results);
  return research.researchProduct(q, {
    config: cfg, cache: null,
    provider: (x) => research.tavilyProvider(x, cfg, f)
  });
}
const G2 = { sku: 'RP5G2', name: 'KRK Rokit 5 G2', brand: 'KRK', category: 'studio monitor' };
function page(extra) {
  return [
    'KRK RP5G2 Powered Studio Monitor',
    'Frequency Response: 45Hz - 20kHz',
    'Power: 50 W',
    extra || ''
  ].join('\n');
}

(async () => {
  await test('KRK RP5G2: generic title/URL but exact model in page content is accepted', async () => {
    const out = await run(G2, [{
      title: 'Studio Monitor Support', url: 'https://www.krkmusic.com/support/manuals',
      content: 'KRK RP5G2 Studio Monitor', raw_content: page()
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchLevel, 'exact_model');
    assert.strictEqual(out.matchedSku, 'RP5G2');
    assert.strictEqual(out.product.name, 'KRK Rokit 5 G2');
    assert.strictEqual(out.sources[0].type, 'official');
    assert.strictEqual(out.sources[0].matchLevel, 'exact_model');
    assert.strictEqual(out.specs['Frequency Response'], '45Hz - 20kHz');
    assert.strictEqual(out.verification.evidence[0].where, 'content');
  });

  await test('KRK RP6G2 and RP8G2 are independently identified from content', async () => {
    for (const code of ['RP6G2', 'RP8G2']) {
      const q = { sku: code, name: 'KRK Rokit ' + code[2] + ' G2', brand: 'KRK' };
      const out = await run(q, [{
        title: 'KRK Studio Monitor Documentation', url: 'https://www.krkmusic.com/support/' + code.toLowerCase(),
        content: 'KRK ' + code + ' studio monitor', raw_content: 'Power: 100 W\nFrequency Response: 38Hz - 20kHz'
      }]);
      assert.strictEqual(out.status, 'verified', code);
      assert.strictEqual(out.matchedSku, code);
    }
  });

  await test('KRK G2 query rejects a G4 page and never uses G4 specs', async () => {
    const out = await run(G2, [{
      title: 'KRK ROKIT 8 Generation 4 Powered Studio Monitor', url: 'https://www.krkmusic.com/rokit-8-g4',
      content: 'KRK RP8G4', raw_content: 'Power: 203 W\nFrequency Response: 36Hz - 40kHz'
    }]);
    assert.strictEqual(out.status, 'rejected');
    assert(!JSON.stringify(out).includes('203 W'), 'G4 specs leaked into G2 result');
    assert.strictEqual(out.sources.length, 0);
  });

  await test('KRK G4 exact model is a control case', async () => {
    const q = { sku: 'RP8G4', name: 'KRK Rokit 8 G4', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT 8 Generation 4', url: 'https://www.krkmusic.com/rokit-8-g4',
      content: 'KRK RP8G4', raw_content: 'Power: 203 W\nFrequency Response: 36Hz - 40kHz'
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'RP8G4');
    assert.strictEqual(out.specs['Power'], '203 W');
  });

  await test('Pioneer DDJ-FLX4 exact model and generic-title content match', async () => {
    const q = { sku: 'DDJ-FLX4', name: 'Pioneer DDJ-FLX4', brand: 'Pioneer' };
    const out = await run(q, [{
      title: 'Support | Pioneer DJ', url: 'https://www.pioneerdj.com/support/ddj-flx4',
      content: 'Pioneer DDJ-FLX4 DJ controller', raw_content: 'Weight: 2.1 kg'
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'DDJ FLX4');
    assert.strictEqual(out.product.name, 'Pioneer DDJ-FLX4');
    assert.strictEqual(out.specs.Weight, '2.1 kg');
  });

  await test('alternative identifier (alias RP5G2) expands queries and matches content', async () => {
    const q = { sku: null, name: 'KRK Rokit 5 G2', brand: 'KRK', aliases: ['RP5G2'] };
    const queries = research.buildQueries(q);
    assert(queries.some(x => /RP5G2/.test(x)), JSON.stringify(queries));
    const out = await run(q, [{
      title: 'KRK Support Library', url: 'https://www.krkmusic.com/support',
      content: 'KRK RP5G2 monitor', raw_content: 'Power: 50 W'
    }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'RP5G2');
  });

  await test('family-level page is partial and does not fill RP5G2 specs', async () => {
    const q = { sku: null, name: 'KRK Rokit Gen 2', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT G2 Studio Monitors', url: 'https://www.krkmusic.com/rokit-g2',
      content: 'ROKIT G2 series', raw_content: 'Power: 100 W'
    }]);
    assert.strictEqual(out.status, 'partial');
    assert.strictEqual(out.matchLevel, 'product_family');
    assert.strictEqual(out.product.model, null);
    assert.deepStrictEqual(out.specs, {});
    assert.strictEqual(out.sources[0].matchLevel, 'product_family');
    assert(/chưa xác minh được model chính xác/.test(out.warnings.join(' ')));
  });

  await test('explicit SKU never accepts a family-only match as the exact product', async () => {
    const q = { sku: 'RP5G2', name: 'KRK Rokit 5 G2', brand: 'KRK' };
    const out = await run(q, [{
      title: 'KRK ROKIT G2 Studio Monitors', url: 'https://www.krkmusic.com/rokit-g2',
      content: 'ROKIT G2 series', raw_content: 'Power: 100 W'
    }]);
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'product_family_exact_unresolved');
    assert.strictEqual(out.matchLevel, 'product_family');
    assert.deepStrictEqual(out.specs, {});
  });

  await test('multiple sized variants for an unsized query are ambiguous, not guessed', async () => {
    const q = { sku: null, name: 'KRK Rokit Gen 2', brand: 'KRK' };
    const out = await run(q, [
      { title: 'ROKIT 5 G2 Powered Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-5-g2', content: 'Power: 50 W' },
      { title: 'ROKIT 8 G2 Powered Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-8-g2', content: 'Power: 100 W' }
    ]);
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'identity_uncertain');
    assert.strictEqual(out.sources.length, 0);
    assert(!JSON.stringify(out).includes('50 W') && !JSON.stringify(out).includes('100 W'));
  });

  await test('conflicting exact-source specs are preserved as conflicts, not chosen', async () => {
    const out = await run(G2, [
      { title: 'KRK official RP5G2', url: 'https://www.krkmusic.com/rokit-5-g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' },
      { title: 'KRK official RP5G2 alt', url: 'https://www.krkmusic.com/rokit-5-g2-alt', content: 'KRK RP5G2', raw_content: 'Power: 55 W' }
    ]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.specs.Power, undefined);
    assert(out.conflicts.some(c => c.key === 'Power' && c.values.indexOf('50 W') >= 0 && c.values.indexOf('55 W') >= 0), JSON.stringify(out.conflicts));
    assert(out.warnings.some(w => /mâu thuẫn/.test(w)));
  });

  await test('official, distributor, dealer and reference sources are distinguished', async () => {
    const out = await run(G2, [
      { title: 'KRK official RP5G2', url: 'https://www.krkmusic.com/rokit-5-g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' },
      { title: 'Distributor RP5G2', url: 'https://distributor.example/rp5g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' },
      { title: 'Dealer RP5G2', url: 'https://dealer.example/rp5g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' },
      { title: 'RP5G2 manual', url: 'https://docs.example/manual/rp5g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' }
    ]);
    assert.strictEqual(out.status, 'verified');
    assert.deepStrictEqual(new Set(out.sources.map(s => s.type)), new Set(['official', 'distributor', 'dealer', 'reference']));
    assert.strictEqual(out.sourceTypes.official, 1);
  });

  await test('query fallback runs another query when the first has no results', async () => {
    const seen = [];
    const f = async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body.query);
      const results = body.query.includes('manual')
        ? [{ title: 'KRK Support Manual', url: 'https://www.krkmusic.com/manual/rp5g2', content: 'KRK RP5G2', raw_content: 'Power: 50 W' }]
        : [];
      return { ok: true, status: 200, json: async () => ({ results }) };
    };
    const out = await run(G2, null, CFG, f);
    assert(seen.length >= 2, JSON.stringify(seen));
    assert.strictEqual(out.status, 'verified');
    assert(out.searchQueries.length >= 2);
  });

  await test('no search results, HTTP failure, timeout and empty PDF are distinct and safe', async () => {
    const empty = await run(G2, []);
    assert.strictEqual(empty.status, 'rejected');
    assert.strictEqual(empty.reason, 'no_search_results');
    assert.strictEqual(empty.failureStage, 'search');

    const err = await run(G2, null, CFG, async () => ({ ok: false, status: 503, json: async () => ({ detail: 'down' }) }));
    assert.strictEqual(err.status, 'error');
    assert.strictEqual(err.failureStage, 'retrieval');

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const to = await run(G2, null, CFG, async () => { throw abort; });
    assert.strictEqual(to.status, 'timeout');
    assert.strictEqual(to.failureStage, 'retrieval');

    const pdf = await run(G2, [{
      title: 'KRK RP5G2 Manual', url: 'https://www.krkmusic.com/manual/rp5g2.pdf', content: '', raw_content: ''
    }]);
    assert.strictEqual(pdf.status, 'verified');
    assert.strictEqual(pdf.contentStatus, 'insufficient');
    assert.deepStrictEqual(pdf.specs, {});
  });

  await test('content mention on a different model page is not accepted as exact evidence', async () => {
    const q = { sku: 'DDJ-400', name: 'Pioneer DDJ-400', brand: 'Pioneer' };
    const out = await run(q, [{
      title: 'DDJ-FLX4 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-flx4', content: 'DDJ-400 comparison', raw_content: 'DDJ-400'
    }]);
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.sources.length, 0);
  });

  await test('source classification helper never upgrades an unknown host', async () => {
    assert.strictEqual(research.sourceTypeFor('https://www.krkmusic.com/x', true), 'official');
    assert.strictEqual(research.sourceTypeFor('https://distributor.example/x', false), 'distributor');
    assert.strictEqual(research.sourceTypeFor('https://dealer.example/x', false), 'dealer');
    assert.strictEqual(research.sourceTypeFor('https://unknown.example/x', false), 'other');
  });

  console.log('\n────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
