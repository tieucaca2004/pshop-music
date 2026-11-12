/*
 * tests/googleResearchProvider.test.js — Google provider ("Grounding with
 * Google Search", Gemini Developer API) for shared/productResearch.js.
 *
 * No real Internet / Google credentials used here: fetch is fully mocked.
 * These tests prove the WIRING (request shape, response parsing, error
 * handling, reuse of the shared extraction/caching/claim-grounding pipeline)
 * is correct. They do NOT prove the real Google API returns this exact
 * response shape — that can only be confirmed once PSH_RESEARCH_API_KEY is a
 * real Gemini API key and PSH_RESEARCH_PROVIDER=google is exercised against
 * the live endpoint (see docs/PRODUCT_WEB_RESEARCH.md).
 */
'use strict';
const assert = require('assert');
const research = require('../shared/productResearch');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}

const q = { sku: 'KRK-R8-G4', name: 'KRK ROKIT 8 G4', category: 'loa' };
const gcfg = { provider: 'google', configured: true, key: 'test-gemini-key', officialDomains: ['krkmusic.com'], timeoutMs: 1000, googleModel: 'gemini-2.0-flash' };

const GEMINI_URL_PREFIX = 'https://generativelanguage.googleapis.com/v1beta/models/';

function geminiOk(groundingChunks) {
  return {
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'summary (not used as fact source)' }] }, groundingMetadata: { groundingChunks } }] })
  };
}
// fetchImpl thực tế được gọi 2 kiểu: (1) POST tới Gemini generateContent, (2) GET trực tiếp từng url
// được tìm thấy để tải trang. Mock phân biệt theo URL giống cách fetch thật hoạt động.
function mkGoogleFetch({ gemini, pages }) {
  return async (url, opts) => {
    if (String(url).indexOf(GEMINI_URL_PREFIX) === 0) return gemini;
    const body = (pages && pages[url]) || '';
    if (body === null) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}

(async () => {
  // 1. Successful search
  await test('1) successful search: official page fetched, specs extracted, source URL preserved', async () => {
    const pageHtml = '<html><body><h1>ROKIT 8 Generation 4</h1><p>Power Output: 203 Watts</p><p>Frequency Response: 36Hz - 40KHz</p></body></html>';
    const f = mkGoogleFetch({
      gemini: geminiOk([{ web: { uri: 'https://www.krkmusic.com/products/rokit-8-g4', title: 'ROKIT 8 Generation 4 | KRK' } }]),
      pages: { 'https://www.krkmusic.com/products/rokit-8-g4': pageHtml }
    });
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.sources[0].type, 'official');
    assert.strictEqual(out.sources[0].url, 'https://www.krkmusic.com/products/rokit-8-g4');
    assert.strictEqual(out.specs['Power Output'], '203 Watts');
  });

  // 2. Empty search results
  await test('2) empty search results: no grounding chunks -> rejected, no_matching_source', async () => {
    const f = mkGoogleFetch({ gemini: geminiOk([]), pages: {} });
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'no_matching_source');
    assert.strictEqual(out.sources.length, 0);
  });

  // 3. HTTP errors
  await test('3) HTTP error from Gemini endpoint -> status error, surfaced message', async () => {
    const f = async (url) => {
      if (String(url).indexOf(GEMINI_URL_PREFIX) === 0) return { ok: false, status: 503, json: async () => ({ error: { message: 'backend unavailable' } }) };
      return { ok: true, status: 200, text: async () => '' };
    };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'error');
    assert(out.warnings.some(w => /backend unavailable|lỗi/.test(w)), JSON.stringify(out.warnings));
  });

  // 4. Invalid API responses
  await test('4a) invalid JSON body from Gemini -> status error (not a crash)', async () => {
    const f = async (url) => {
      if (String(url).indexOf(GEMINI_URL_PREFIX) === 0) return { ok: true, status: 200, json: async () => { throw new Error('bad json'); } };
      return { ok: true, status: 200, text: async () => '' };
    };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'error');
  });
  await test('4b) well-formed JSON but no candidates array -> rejected, no_matching_source (not a crash)', async () => {
    const f = async (url) => {
      if (String(url).indexOf(GEMINI_URL_PREFIX) === 0) return { ok: true, status: 200, json: async () => ({ somethingElse: true }) };
      return { ok: true, status: 200, text: async () => '' };
    };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'no_matching_source');
  });

  // 5. Missing credentials
  await test('5) missing PSH_RESEARCH_API_KEY -> unconfigured, provider never called', async () => {
    let called = false;
    const noKeyCfg = { provider: 'google', configured: false };
    const out = await research.researchProduct(q, { config: noKeyCfg, provider: async () => { called = true; }, cache: null });
    assert.strictEqual(out.status, 'unconfigured');
    assert.strictEqual(called, false);
  });
  await test('5b) configFromEnv: provider=google without key is NOT configured; with key it is', async () => {
    const old = { p: process.env.PSH_RESEARCH_PROVIDER, k: process.env.PSH_RESEARCH_API_KEY };
    try {
      process.env.PSH_RESEARCH_PROVIDER = 'google';
      delete process.env.PSH_RESEARCH_API_KEY;
      assert.strictEqual(research.configFromEnv().configured, false);
      process.env.PSH_RESEARCH_API_KEY = 'real-looking-key';
      assert.strictEqual(research.configFromEnv().configured, true);
      assert.strictEqual(research.configFromEnv().googleModel, 'gemini-2.0-flash');
    } finally {
      for (const [k, v] of [['PSH_RESEARCH_PROVIDER', old.p], ['PSH_RESEARCH_API_KEY', old.k]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  // 6. Timeout and network failure
  await test('6a) Gemini call aborts (timeout) -> status timeout', async () => {
    const f = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'timeout');
  });
  await test('6b) network failure (generic throw, not AbortError) -> status error, no crash', async () => {
    const f = async () => { throw new TypeError('fetch failed'); };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'error');
  });
  await test('6c) one page fetch fails (network error), others still processed', async () => {
    const pageHtml = '<html><body><h1>ROKIT 8 Generation 4</h1><p>Power Output: 203 Watts</p><p>Frequency Response: 36Hz - 40KHz</p></body></html>';
    const f = async (url) => {
      if (String(url).indexOf(GEMINI_URL_PREFIX) === 0) {
        return geminiOk([
          { web: { uri: 'https://broken.example/rokit-8-g4', title: 'ROKIT 8 Generation 4 (mirror)' } },
          { web: { uri: 'https://www.krkmusic.com/products/rokit-8-g4', title: 'ROKIT 8 Generation 4 | KRK' } }
        ]);
      }
      if (url === 'https://broken.example/rokit-8-g4') throw new TypeError('network error');
      return { ok: true, status: 200, text: async () => pageHtml };
    };
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.sources[0].url, 'https://www.krkmusic.com/products/rokit-8-g4');
  });

  // 7. Source URL preservation
  await test('7) source URL and evidence URL exactly match the grounded URL, including distributor fallback', async () => {
    const pageHtml = '<html><body><h1>KRK ROKIT 8 G4</h1><p>Power Output: 203 Watts</p></body></html>';
    const f = mkGoogleFetch({
      gemini: geminiOk([{ web: { uri: 'https://distributor.example/krk-rokit-8-g4', title: 'KRK ROKIT 8 G4 | Authorized Dealer' } }]),
      pages: { 'https://distributor.example/krk-rokit-8-g4': pageHtml }
    });
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.status, 'partial'); // no official domain match -> partial, not verified
    assert.strictEqual(out.sources[0].url, 'https://distributor.example/krk-rokit-8-g4');
    assert.strictEqual(out.sources[0].type, 'other');
    assert.strictEqual(out.verification.evidence[0].url, 'https://distributor.example/krk-rokit-8-g4');
  });

  // 8. Research result normalization
  await test('8) normalized output has the same shape as the Tavily path (status/schema/product/specs)', async () => {
    const pageHtml = '<html><body><h1>ROKIT 8 Generation 4</h1><p>Power Output: 203 Watts</p></body></html>';
    const f = mkGoogleFetch({
      gemini: geminiOk([{ web: { uri: 'https://www.krkmusic.com/products/rokit-8-g4', title: 'ROKIT 8 Generation 4 | KRK' } }]),
      pages: { 'https://www.krkmusic.com/products/rokit-8-g4': pageHtml }
    });
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.schema, research.RESEARCH_SCHEMA);
    assert.strictEqual(typeof out.product, 'object');
    assert.strictEqual(out.product.model, 'ROKIT 8 G4'); // matchEvidence keeps the shortest distinctive match, brand stripped — same as the Tavily path
    assert(out.matchedSku);
    assert(Array.isArray(out.sources));
    assert(Array.isArray(out.warnings));
    assert.strictEqual(typeof out.fetchedAt, 'number');
  });

  // 9. Claim-grounding compatibility
  await test('9) UI/noise lines from a raw-fetched page are stripped before reaching claims/specs (same filters as Tavily path)', async () => {
    const pageHtml = '<html><body>' +
      '<h1>ROKIT 8 Generation 4</h1>' +
      '<p>Power Output: 203 Watts</p>' +
      '<p>Add to cart - $349.99</p>' +
      '<p>Sign in to see your wishlist</p>' +
      '<p>© 2026 KRK Systems. All rights reserved.</p>' +
      '</body></html>';
    const f = mkGoogleFetch({
      gemini: geminiOk([{ web: { uri: 'https://www.krkmusic.com/products/rokit-8-g4', title: 'ROKIT 8 Generation 4 | KRK' } }]),
      pages: { 'https://www.krkmusic.com/products/rokit-8-g4': pageHtml }
    });
    const out = await research.researchProduct(q, { config: gcfg, provider: (qq) => research.googleProvider(qq, gcfg, f), cache: null });
    assert.strictEqual(out.specs['Power Output'], '203 Watts');
    const allClaims = out.sources.flatMap(s => s.claims || []);
    assert(!allClaims.some(c => /add to cart|wishlist|©/i.test(c)), JSON.stringify(allClaims));
  });

  // Unit tests for the grounding-metadata parser itself (both documented response shapes)
  await test('extractGroundedUrls: groundingChunks shape (generateContent) is parsed and deduplicated', async () => {
    const data = { candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: 'https://a.example/x', title: 'A' } },
      { web: { uri: 'https://a.example/x', title: 'A dup' } },
      { web: { uri: 'https://b.example/y', title: 'B' } }
    ] } }] };
    const out = research.extractGroundedUrls(data);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].url, 'https://a.example/x');
  });
  await test('extractGroundedUrls: url_citation annotations shape (Interactions API) is parsed', async () => {
    const data = { candidates: [{ content: { parts: [{ annotations: [{ url_citation: { url: 'https://c.example/z', title: 'C' } }] }] } }] };
    const out = research.extractGroundedUrls(data);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].url, 'https://c.example/z');
  });
  await test('extractGroundedUrls: non-https or malformed URIs are dropped, no throw', async () => {
    const data = { candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: 'http://insecure.example/x' } },
      { web: { uri: 'not a url' } },
      { web: {} },
      {}
    ] } }] };
    const out = research.extractGroundedUrls(data);
    assert.strictEqual(out.length, 0);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) { console.log('Failures: ' + failures.join(', ')); process.exitCode = 1; }
})();
