/*
 * tests/productResearch.test.js — provider-neutral web research unit tests.
 * No real Internet call: provider/cache are injected. Real web research remains
 * unverified until PSH_RESEARCH_URL + PSH_RESEARCH_API_KEY are configured.
 */
'use strict';
const assert = require('assert');
const research = require('../shared/productResearch');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}

const payload = {
  matchedSku: 'KRK-R8-G4',
  product: { name: 'KRK ROKIT 8 G4', brand: 'KRK', model: 'KRK ROKIT 8 G4', category: 'loa', description: 'Loa kiểm âm nearfield.', warranty: null, origin: null, price: 999 },
  sources: [
    { title: 'KRK official ROKIT G4', url: 'https://www.krkmusic.com/rokit-g4', type: 'official', claims: ['203W Class D', '8 inch Kevlar'], specs: { 'Công suất': '203W', 'Tần số': '36Hz-40kHz' }, features: ['DSP'] },
    { title: 'Authorized distributor', url: 'https://distributor.example/rokit-g4', type: 'distributor', claims: ['ROKIT G4'], specs: { 'Công suất': '203W' }, features: [] }
  ]
};
const q = { sku: 'KRK-R8-G4', name: 'KRK ROKIT 8 G4', category: 'loa' };
const cfg = { configured: true, url: 'https://research.example', key: 'test-key', timeoutMs: 1000 };

(async () => {
  await test('official domain: exact/subdomain only; spoof/path/userinfo/http rejected', async () => {
    const d = ['krkmusic.com'];
    assert.strictEqual(research.isOfficialUrl('https://www.krkmusic.com/rokit', d), true);
    assert.strictEqual(research.isOfficialUrl('https://KRKMUSIC.COM./rokit', d), true);
    assert.strictEqual(research.isOfficialUrl('https://krkmusic.com.example.org/rokit', d), false);
    assert.strictEqual(research.isOfficialUrl('https://evil.example/krkmusic.com', d), false);
    assert.strictEqual(research.isOfficialUrl('https://krkmusic.com@evil.example/rokit', d), false);
    assert.strictEqual(research.isOfficialUrl('http://krkmusic.com/rokit', d), false);
    assert.strictEqual(research.isOfficialUrl('not a url', d), false);
  });
  await test('configFromEnv reads provider/domains/timeout and normalizes host', async () => {
    const old = { p: process.env.PSH_RESEARCH_PROVIDER, d: process.env.PSH_RESEARCH_OFFICIAL_DOMAINS, t: process.env.PSH_RESEARCH_TIMEOUT_MS };
    try {
      process.env.PSH_RESEARCH_PROVIDER = 'tavily';
      process.env.PSH_RESEARCH_OFFICIAL_DOMAINS = ' www.KRKMUSIC.com. , krkmusic.com ';
      process.env.PSH_RESEARCH_TIMEOUT_MS = '12345';
      const cfg = research.configFromEnv();
      assert.strictEqual(cfg.provider, 'tavily');
      assert.strictEqual(cfg.configured, true);
      assert.deepStrictEqual(cfg.officialDomains, ['www.krkmusic.com', 'krkmusic.com']);
      assert.strictEqual(cfg.timeoutMs, 12345);
    } finally {
      for (const [k, v] of [['PSH_RESEARCH_PROVIDER', old.p], ['PSH_RESEARCH_OFFICIAL_DOMAINS', old.d], ['PSH_RESEARCH_TIMEOUT_MS', old.t]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
  await test('exact SKU + official source + URL preserved', async () => {
    const reordered = JSON.parse(JSON.stringify(payload));
    reordered.sources.reverse(); // distributor first in provider payload; PSH must rank official first
    const out = await research.researchProduct(q, { provider: async () => reordered, config: cfg, cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.matchedSku, 'KRK-R8-G4');
    assert.strictEqual(out.sources[0].type, 'official');
    assert.strictEqual(out.sources[0].url, 'https://www.krkmusic.com/rokit-g4');
    assert.strictEqual(out.specs['Công suất'], '203W');
    assert.strictEqual(out.specs['Tần số'], '36Hz-40kHz');
  });
  await test('wrong generation is rejected', async () => {
    const bad = JSON.parse(JSON.stringify(payload)); bad.matchedSku = 'KRK-R8-G3'; bad.product.model = 'KRK ROKIT 8 G3'; bad.product.name = 'KRK ROKIT 8 G3';
    const out = await research.researchProduct(q, { provider: async () => bad, config: cfg, cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'wrong_generation');
    assert.strictEqual(out.sources.length, 0);
  });
  await test('model mismatch is rejected', async () => {
    const bad = JSON.parse(JSON.stringify(payload)); bad.matchedSku = 'OTHER-8-G4'; bad.product.model = 'OTHER 8 G4';
    const out = await research.researchProduct(q, { provider: async () => bad, config: cfg, cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'model_mismatch');
  });
  await test('conflicting specs are omitted with warning', async () => {
    const p = JSON.parse(JSON.stringify(payload)); p.sources[1].type = 'official'; p.sources[1].specs['Công suất'] = '200W';
    const out = await research.researchProduct(q, { provider: async () => p, config: cfg, cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.specs['Công suất'], undefined);
    assert(out.warnings.some(w => /mâu thuẫn/.test(w)));
  });
  await test('source without HTTPS URL is rejected, not treated as evidence', async () => {
    const p = JSON.parse(JSON.stringify(payload));
    p.sources = [{ title: 'copy without URL', type: 'official', claims: ['203W'], specs: { 'Công suất': '203W' } }];
    const out = await research.researchProduct(q, { provider: async () => p, config: cfg, cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'no_sources');
  });
  await test('malformed/null provider payload is rejected without crash', async () => {
    const out = await research.researchProduct(q, { provider: async () => null, config: cfg, cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'model_mismatch');
    const bad = await research.researchProduct(q, { provider: async () => ({ matchedSku: 'KRK-R8-G4', product: {}, sources: [null, { title: 'x', url: 'http://insecure' }] }), config: cfg, cache: null });
    assert.strictEqual(bad.status, 'rejected');
    assert.strictEqual(bad.reason, 'no_sources');
  });
  await test('same product name but wrong model is rejected', async () => {
    const p = JSON.parse(JSON.stringify(payload));
    p.product.name = 'KRK ROKIT 8 G4'; p.product.model = 'KRK ROKIT 8 G3'; p.matchedSku = 'KRK-R8-G3';
    p.sources = p.sources.map(s => Object.assign({}, s, { title: s.title.replace('G4', 'G3'), claims: ['ROKIT G3'] }));
    const out = await research.researchProduct(q, { provider: async () => p, config: cfg, cache: null });
    assert.strictEqual(out.status, 'rejected');
  });
  await test('cache for a different model is ignored, provider is called', async () => {
    let called = false;
    const cache = {
      get: async () => ({ at: Date.now(), data: { status: 'verified', matchedSku: 'OTHER-G3', product: { model: 'OTHER G3' }, sources: [], warnings: [], specs: {} } }),
      set: async () => {}
    };
    const out = await research.researchProduct(q, { config: cfg, cache, provider: async () => { called = true; return payload; } });
    assert.strictEqual(called, true);
    assert.strictEqual(out.status, 'verified');
    assert.notStrictEqual(out.cache, 'hit');
  });
  await test('stale cache is ignored and provider is called', async () => {
    let called = false;
    const cache = {
      get: async () => ({ at: Date.now() - 8 * 24 * 60 * 60 * 1000, data: { status: 'verified', matchedSku: 'KRK-R8-G4', sources: [], warnings: [] } }),
      set: async () => {}
    };
    const out = await research.researchProduct(q, { config: cfg, cache, provider: async () => { called = true; return payload; } });
    assert.strictEqual(called, true);
    assert.strictEqual(out.status, 'verified');
    assert.notStrictEqual(out.cache, 'hit');
  });
  await test('missing search configuration is explicit, no provider call', async () => {
    let called = false;
    const out = await research.researchProduct(q, { config: { configured: false }, provider: async () => { called = true; }, cache: null });
    assert.strictEqual(out.status, 'unconfigured');
    assert.strictEqual(called, false);
    assert(out.warnings.some(w => /PSH_RESEARCH_URL/.test(w)));
  });
  await test('Tavily adapter maps official result + specs; empty/HTTP error/timeout are safe', async () => {
    const tcfg = { provider: 'tavily', configured: true, officialDomains: ['krkmusic.com'], timeoutMs: 1000 };
    const tavilyPayload = { results: [{ title: 'ROKIT 8 Generation 4 Powered Studio Monitor', url: 'https://www.krkmusic.com/products/rokit-8-g4', content: 'Power Output: 203 Watts\nFrequency Response: 36Hz - 40KHz\nROKIT 8 Generation 4' }] };
    const okFetch = async () => ({ ok: true, status: 200, json: async () => tavilyPayload });
    const out = await research.researchProduct(q, { config: tcfg, provider: (qq) => research.tavilyProvider(qq, tcfg, okFetch), cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.specs['Power Output'], '203 Watts');
    assert.strictEqual(out.sources[0].type, 'official');

    const emptyFetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
    const empty = await research.researchProduct(q, { config: tcfg, provider: (qq) => research.tavilyProvider(qq, tcfg, emptyFetch), cache: null });
    assert.strictEqual(empty.status, 'rejected');

    const errFetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: 'unavailable' }) });
    const err = await research.researchProduct(q, { config: tcfg, provider: (qq) => research.tavilyProvider(qq, tcfg, errFetch), cache: null });
    assert.strictEqual(err.status, 'error');

    const abortFetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const to = await research.researchProduct(q, { config: tcfg, provider: (qq) => research.tavilyProvider(qq, tcfg, abortFetch), cache: null });
    assert.strictEqual(to.status, 'timeout');
  });
  await test('TMA-2 DJ research does not mix DJ Wireless/DJ XE/Studio variants', async () => {
    const q2 = { sku: 'TMA-2 DJ', name: 'AIAIAI TMA-2 DJ', category: 'tai nghe' };
    const tcfg = { provider: 'tavily', configured: true, officialDomains: ['aiaiai.audio'], timeoutMs: 1000 };
    const body = { results: [
      { title: 'TMA-2 DJ Headphones | AIAIAI', url: 'https://aiaiai.audio/headphones/tma-2-dj', content: 'TMA-2 DJ Driver diameter: 40mm\nTMA-2 DJ Max SPL: 120dB' },
      { title: 'TMA-2 DJ Wireless | AIAIAI', url: 'https://aiaiai.audio/headphones/tma-2-dj-wireless', content: 'TMA-2 DJ Wireless Driver diameter: 40mm' },
      { title: 'TMA-2 DJ XE Headphones | AIAIAI', url: 'https://aiaiai.audio/headphones/tma-2-dj-xe', content: 'TMA-2 DJ XE Driver diameter: 40mm' },
      { title: 'TMA-2 Studio Headphones | AIAIAI', url: 'https://aiaiai.audio/headphones/tma-2-studio', content: 'TMA-2 Studio Driver diameter: 40mm' }
    ] };
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => body });
    const out = await research.researchProduct(q2, { config: tcfg, provider: (qq) => research.tavilyProvider(qq, tcfg, fakeFetch), cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.sources.length, 1, JSON.stringify(out.sources));
    assert.strictEqual(out.sources[0].url, 'https://aiaiai.audio/headphones/tma-2-dj');
  });
  await test('timeout and provider errors do not fabricate success', async () => {
    const t = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const out = await research.researchProduct(q, { provider: async () => { throw t; }, config: cfg, cache: null });
    assert.strictEqual(out.status, 'timeout');
    const e = await research.researchProduct(q, { provider: async () => { throw new Error('HTTP 500'); }, config: cfg, cache: null });
    assert.strictEqual(e.status, 'error');
  });
  await test('cache hit avoids provider call', async () => {
    let called = false;
    const cache = { get: async () => ({ at: Date.now(), data: { status: 'verified', matchedSku: 'KRK-R8-G4', sources: [], warnings: [], specs: { 'Công suất': '203W' } } }), set: async () => {} };
    const out = await research.researchProduct(q, { config: cfg, cache, provider: async () => { called = true; return payload; } });
    assert.strictEqual(out.cache, 'hit');
    assert.strictEqual(called, false);
  });
  await test('research never returns or uses a web price', async () => {
    const out = await research.researchProduct(q, { provider: async () => payload, config: cfg, cache: null });
    assert.strictEqual(out.product.price, undefined);
    assert.strictEqual(out.price, undefined);
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
