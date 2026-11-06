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
    const cache = { get: async () => ({ at: Date.now(), data: { schema: research.RESEARCH_SCHEMA, status: 'verified', matchedSku: 'KRK-R8-G4', sources: [], warnings: [], specs: { 'Công suất': '203W' } } }), set: async () => {} };
    const out = await research.researchProduct(q, { config: cfg, cache, provider: async () => { called = true; return payload; } });
    assert.strictEqual(out.cache, 'hit');
    assert.strictEqual(called, false);
  });
  await test('research never returns or uses a web price', async () => {
    const out = await research.researchProduct(q, { provider: async () => payload, config: cfg, cache: null });
    assert.strictEqual(out.product.price, undefined);
    assert.strictEqual(out.price, undefined);
  });

  // ── Product Research → Writer: xác minh bằng bằng chứng trong nguồn, lấy nội dung trang, cache an toàn ──
  // Không gọi Internet thật: fetch giả lập đúng hình dạng phản hồi Tavily (results[].title/url/content/raw_content).
  const tcfg2 = { provider: 'tavily', configured: true, officialDomains: ['pioneerdj.com'], timeoutMs: 1000 };
  const PAGE = [
    '# DDJ-400 2-channel DJ controller for rekordbox dj',
    'The DDJ-400 is a compact controller designed for beginner DJs who want to learn the fundamentals of mixing with rekordbox dj.',
    '- Performance pads for hot cues, beat loops and samples',
    '- Built-in USB audio interface with a headphone output',
    '| Dimensions | 482 x 272 x 56 mm |',
    '| Weight | 2.0 kg |',
    'Add to cart $249 free shipping',
    'You may also like',
    'DDJ-FLX4: Power: 999 W'
  ].join('\n');
  const mkFetch = (results, onBody) => async (url, init) => { if (onBody) onBody(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ results }) }; };
  const runT = (qq, results, cacheObj, onBody) => research.researchProduct(qq, { config: tcfg2, cache: cacheObj === undefined ? null : cacheObj,
    provider: (x) => research.tavilyProvider(x, tcfg2, mkFetch(results, onBody)) });

  await test('SKU/model: nguồn đúng model → verified, matchedSku lấy từ NGUỒN (không phải query), có brand/mô tả/tính năng/công dụng/thông số', async () => {
    let body = null;
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400', brand: 'Pioneer' },
      [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/en/product/controller/ddj-400/black/overview/', content: 'DDJ-400 controller', raw_content: PAGE }], null, (b) => { body = b; });
    assert.strictEqual(body.include_raw_content, true, 'phải xin nội dung trang đầy đủ');
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.verification.verified, true);
    assert.strictEqual(out.matchedSku, 'DDJ 400');
    assert.strictEqual(out.product.brand, 'Pioneer');
    assert(/designed for beginner DJs/.test(out.product.description), out.product.description);
    assert(out.features.some(f => /Performance pads/.test(f)) && out.features.some(f => /USB audio interface/.test(f)), JSON.stringify(out.features));
    assert(out.applications.some(a => /designed for beginner DJs/.test(a)), JSON.stringify(out.applications));
    assert.strictEqual(out.specs.Weight, '2.0 kg');
    assert.strictEqual(out.contentLevel, 'page');
    assert(!JSON.stringify(out).includes('999 W'), 'nội dung sau "You may also like" (model khác) phải bị cắt');
    assert(!JSON.stringify(out.sources).includes('$249'), 'giá web không được vào dữ kiện');
  });
  await test('chỉ có TÊN (không sku): vẫn research theo tên và verified bằng bằng chứng nguồn', async () => {
    let body = null;
    const out = await runT({ sku: null, name: 'Pioneer DDJ-400', brand: 'Pioneer' },
      [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/en/product/ddj-400/', content: '', raw_content: PAGE }], null, (b) => { body = b; });
    assert(/Pioneer DDJ-400/.test(body.query), body.query);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.sources[0].type, 'official');
  });
  await test('nhiều model gần giống: DDJ-1000 / DDJ-FLX4 / DDJ-4000 / bài so sánh bị loại; chỉ giữ DDJ-400', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, [
      { title: 'DDJ-1000 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-1000/', content: 'DDJ-1000 Power: 100 W' },
      { title: 'DDJ-FLX4 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-flx4/', content: 'DDJ-FLX4 compatible with DDJ-400 workflow' },
      { title: 'DDJ-4000 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-4000/', content: 'DDJ-4000' },
      { title: 'DDJ-400 vs DDJ-FLX4: which to buy', url: 'https://blog.example.com/ddj-400-vs-flx4', content: 'DDJ-400 DDJ-FLX4' },
      { title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: 'DDJ-400 Weight: 2.0 kg' }
    ]);
    assert.strictEqual(out.status, 'verified');
    assert.deepStrictEqual(out.sources.map(s => s.url), ['https://www.pioneerdj.com/ddj-400/']);
  });
  await test('(từ lần chạy Internet thật) thương hiệu 2 từ "Pioneer DJ": trang hãng "DDJ-400 - 2-channel…" được nhận; DDJ-400-N (biến thể) bị loại; model = "DDJ 400"', async () => {
    const PROSE = ['[Where to buy](https://x.example/store)', 'DDJ-400', '## DDJ-400', 'The layout of the DDJ-400 inherits the essence of a professional setup. As a result, it feels natural to use when you are ready to progress.',
      '## Club-style layout', "The DDJ-400's buttons and knobs are arranged in the same way as those on our professional NXS2 set-up. Extra words follow here.",
      '## Key Features', 'Generic heading must not become a feature even with a long paragraph following it here.'].join('\n\n');
    const noDom = { provider: 'tavily', configured: true, officialDomains: [], timeoutMs: 1000 }; // domain hãng CHƯA được Founder xác nhận
    const runNoDom = (qq, results) => research.researchProduct(qq, { config: noDom, cache: null, provider: (x) => research.tavilyProvider(x, noDom, mkFetch(results)) });
    const out = await runNoDom({ sku: null, name: 'Pioneer DJ DDJ-400' }, [
      { title: 'DDJ-400-N - 2-channel DJ controller for rekordbox (gold)', url: 'https://www.pioneerdj.com/en/product/dj-controllers/ddj-400-n', content: '', raw_content: 'DDJ-400-N gold colour: Weight: 9 kg' },
      { title: 'DDJ-400 - 2-channel DJ controller for rekordbox (black)', url: 'https://www.pioneerdj.com/en/product/dj-controllers/ddj-400', content: '', raw_content: PROSE }]);
    assert.strictEqual(out.status, 'partial'); // pioneerdj.com chưa được cấu hình là domain hãng
    assert.deepStrictEqual(out.sources.map(s => s.url), ['https://www.pioneerdj.com/en/product/dj-controllers/ddj-400']);
    assert.strictEqual(out.sources[0].type, 'other');
    assert.strictEqual(out.matchedSku, 'DDJ 400');
    assert.strictEqual(out.product.model, 'DDJ 400');
    assert(out.features.some(f => /^Club-style layout: The DDJ-400's buttons and knobs/.test(f)), JSON.stringify(out.features));
    assert(!out.features.some(f => /^Key Features/.test(f)), 'tiêu đề chung không thành tính năng');
    // Đoạn giới thiệu dưới tiêu đề trùng tên sản phẩm là giới thiệu chung, không phải "tính năng".
    assert(!out.features.some(f => /^DDJ-400:/.test(f) || /inherits the essence/.test(f)), 'tiêu đề = tên sản phẩm không được thành tính năng: ' + JSON.stringify(out.features));
    assert(/inherits the essence/.test(out.product.description), 'đoạn giới thiệu vẫn có thể là mô tả');
    assert(!JSON.stringify(out).includes('9 kg'));
  });
  await test('mô tả bị cắt dở giữa câu không được dùng làm description', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, [
      { title: 'DDJ-400 review', url: 'https://reviews.example/ddj-400', content: '', raw_content: 'There are two decks on the DDJ-400, with each deck having a 5 inch jogwheel, eight small performance pads with pad mode buttons: hot cue, beat loop,' }]);
    assert.strictEqual(out.status, 'partial');
    assert(!out.product.description, 'description phải là câu hoàn chỉnh: ' + out.product.description);
  });
  await test('màu sắc Founder mô tả ("màu xanh") không thuộc model: không cản khớp nguồn, không khẳng định phiên bản màu; model khác size bị loại', async () => {
    const noDom = { provider: 'tavily', configured: true, officialDomains: [], timeoutMs: 1000 };
    const run = (qq, results) => research.researchProduct(qq, { config: noDom, cache: null, provider: (x) => research.tavilyProvider(x, noDom, mkFetch(results)) });
    const q2 = { sku: 'Rokit Gen 2 màu xanh', name: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh', brand: 'KRK' };
    const sets = research.candidateSets(q2).map((c) => c.join(' '));
    assert(sets.length && sets.every((x) => !/xanh|mau/.test(x)), 'token màu phải bị bỏ khỏi định danh: ' + JSON.stringify(sets));
    // Size cụ thể (Rokit 5/8) KHÔNG khớp "Rokit Gen 2" mơ hồ → loại, không đoán size.
    const amb = await run(q2, [{ title: 'ROKIT 5 G2 Powered Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-5-g2', content: 'Power 50 W', raw_content: 'Power: 50 W' },
      { title: 'ROKIT 8 G2 Powered Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-8-g2', content: 'Power 100 W', raw_content: 'Power: 100 W' }]);
    assert.strictEqual(amb.status, 'rejected');
    assert(!JSON.stringify(amb).includes('50 W') && !JSON.stringify(amb).includes('100 W'), 'không được lấy thông số của size đoán');
    // Trang đúng dòng "Rokit G2" (không size) được nhận; dữ kiện lấy từ nguồn, KHÔNG ghi nhận "màu xanh".
    const ok = await run(q2, [{ title: 'KRK Rokit G2 Studio Monitors', url: 'https://www.krkmusic.com/rokit-g2', content: '', raw_content: 'Power: 100 W\nFrequency Response: 40Hz - 20kHz' }]);
    assert.strictEqual(ok.status, 'partial');
    assert(!/xanh/i.test(JSON.stringify({ product: ok.product, specs: ok.specs, features: ok.features, applications: ok.applications, sources: ok.sources, matchedSku: ok.matchedSku })), 'nguồn không nói gì về màu xanh: không được đưa vào dữ kiện');
  });
  await test('(từ trang KRK thật) rác giao diện/tài liệu và dòng thông số KHÔNG thành "tính năng"; kết nối & tính năng thật được giữ', async () => {
    const RAW = ['## Specifications', '+ + Frequency Response: 36Hz - 40KHz', '+ Height: 15.75" / 400 mm', '- ROKIT Generation 4 Brochure', '- ROKIT Generation 4 Manual',
      '- Choosing a selection results in a full page refresh.', '- Opens in a new window.', '- Balanced TRS/XLR Combo Jacks',
      '- KRK App: Real-time helpful spectral analysis to tune the monitors.', '- Supports balanced and unbalanced signals for flexible studio connections.'].join('\n');
    const out = await runT({ sku: 'ROKIT 8 G4', name: 'KRK ROKIT 8 G4', brand: 'KRK' },
      [{ title: 'ROKIT 8 Generation 4 Powered Studio Monitor | KRK', url: 'https://www.pioneerdj.com/rokit-8-g4', content: '', raw_content: RAW }]);
    assert.strictEqual(out.status, 'verified'); // tcfg2 coi pioneerdj.com là official chỉ trong test này
    const f = out.features.join(' | ');
    assert(!/Brochure|Manual|full page refresh|new window|Frequency Response|Height/.test(f), 'rác lọt vào tính năng: ' + f);
    assert(/Balanced TRS\/XLR Combo Jacks/.test(f) && /KRK App: Real-time/.test(f) && /Supports balanced and unbalanced/.test(f), 'tính năng thật bị mất: ' + f);
    assert.strictEqual(out.specs['Frequency Response'], '36Hz - 40KHz');
  });
  await test('trang phụ kiện/tương thích ("Case for DDJ-400") không được coi là trang của model', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, [
      { title: 'Protective Case for DDJ-400 | Reloop', url: 'https://www.reloop.example/case', content: 'Case fits DDJ-400', raw_content: 'Dimensions: 500 x 300 mm' }]);
    assert.strictEqual(out.status, 'rejected');
  });
  await test('chỉ có kết quả sai model → rejected, ghi rõ chưa xác minh, không có dữ kiện cho writer', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, [
      { title: 'DDJ-FLX4 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-flx4/', content: 'DDJ-400' },
      { title: 'DDJ-1000 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-1000/', content: 'Power: 100 W' }]);
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'no_matching_source');
    assert.strictEqual(out.sources.length, 0);
    assert(!out.specs && !out.features, 'không được trả dữ kiện khi chưa xác minh');
    assert(/khớp đúng model/.test(out.warnings.join(' ')), out.warnings.join(' '));
  });
  await test('khác thế hệ (G3 vs G4) bị loại dù cùng tên dòng', async () => {
    const out = await runT({ sku: null, name: 'KRK ROKIT 8 G4', brand: 'KRK' }, [
      { title: 'ROKIT 8 G3 Studio Monitor | KRK', url: 'https://www.krkmusic.com/rokit-8-g3', content: 'Power: 203 W' }]);
    assert.strictEqual(out.status, 'rejected');
  });
  await test('tên quá chung (không model/số, <2 từ nhận diện) → unverifiable_query, KHÔNG gọi Internet', async () => {
    let called = 0;
    const out = await research.researchProduct({ sku: null, name: 'Giá đỡ micro', brand: null }, { config: tcfg2, cache: null,
      provider: (x) => research.tavilyProvider(x, tcfg2, async () => { called++; return { ok: true, status: 200, json: async () => ({ results: [] }) }; }) });
    assert.strictEqual(out.status, 'rejected');
    assert.strictEqual(out.reason, 'unverifiable_query');
    assert.strictEqual(called, 0);
  });
  await test('brand không xuất hiện trong nguồn → nguồn bị loại (không tự gán thương hiệu)', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'DDJ-400', brand: 'Roland' },
      [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: 'DDJ-400', raw_content: PAGE }]);
    assert.strictEqual(out.status, 'rejected');
  });
  await test('nguồn chỉ có snippet (không raw_content): vẫn verified nhưng contentLevel=snippet, KHÔNG bịa tính năng/công dụng/mô tả', async () => {
    const out = await runT({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' },
      [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: 'DDJ-400\nWeight: 2.0 kg' }]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.contentLevel, 'snippet');
    assert.deepStrictEqual(out.features, []);
    assert.deepStrictEqual(out.applications, []);
    assert(!out.product.description, 'không có mô tả trong nguồn thì không có mô tả');
    assert.strictEqual(out.specs.Weight, '2.0 kg');
  });
  await test('keyless từ chối include_raw_content (HTTP 400) → thử lại không raw, vẫn dùng snippet', async () => {
    let calls = [];
    const f = async (u, init) => { const b = JSON.parse(init.body); calls.push(b.include_raw_content);
      return b.include_raw_content ? { ok: false, status: 400, json: async () => ({ detail: 'raw not allowed' }) }
        : { ok: true, status: 200, json: async () => ({ results: [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: 'DDJ-400\nWeight: 2.0 kg' }] }) }; };
    const out = await research.researchProduct({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, { config: tcfg2, cache: null, provider: (x) => research.tavilyProvider(x, tcfg2, f) });
    assert.deepStrictEqual(calls, [true, false]);
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(out.contentLevel, 'snippet');
  });
  await test('không provider / provider lỗi: unconfigured / error, không dữ kiện', async () => {
    const un = await research.researchProduct({ sku: null, name: 'Pioneer DDJ-400' }, { config: { configured: false }, cache: null });
    assert.strictEqual(un.status, 'unconfigured');
    const er = await research.researchProduct({ sku: null, name: 'Pioneer DDJ-400' }, { config: tcfg2, cache: null,
      provider: (x) => research.tavilyProvider(x, tcfg2, async () => ({ ok: false, status: 503, json: async () => ({ detail: 'down' }) })) });
    assert.strictEqual(er.status, 'error');
    assert.strictEqual((er.sources || []).length, 0);
  });
  await test('cache: bản cũ (không schema) bị bỏ qua; kết quả mới có schema và được dùng lại (xác minh theo bằng chứng)', async () => {
    const store = {};
    const cache = { get: async (k) => store[k] || null, set: async (k, v) => { store[k] = v; } };
    const key = 'ddj400';
    store[key] = { at: Date.now(), data: { status: 'verified', matchedSku: 'DDJ-400', sources: [{ url: 'https://x.example' }], specs: { Weight: '1 kg' } } };
    let calls = 0;
    const results = [{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: '', raw_content: PAGE }];
    const prov = (x) => { calls++; return research.tavilyProvider(x, tcfg2, mkFetch(results)); };
    const first = await research.researchProduct({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, { config: tcfg2, cache, provider: prov });
    assert.strictEqual(calls, 1, 'cache cũ không schema phải bị bỏ qua');
    assert.strictEqual(first.schema, research.RESEARCH_SCHEMA);
    assert.strictEqual(store[key].data.schema, research.RESEARCH_SCHEMA);
    const second = await research.researchProduct({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, { config: tcfg2, cache, provider: prov });
    assert.strictEqual(calls, 1, 'cache mới phải được dùng lại');
    assert.strictEqual(second.cache, 'hit');
  });
  await test('cache: kết quả xác minh nhưng RỖNG dữ kiện không được cache', async () => {
    const store = {};
    const cache = { get: async () => null, set: async (k, v) => { store[k] = v; } };
    const out = await research.researchProduct({ sku: 'DDJ-400', name: 'Pioneer DDJ-400' }, { config: tcfg2, cache,
      provider: (x) => research.tavilyProvider(x, tcfg2, mkFetch([{ title: 'DDJ-400 | Pioneer DJ', url: 'https://www.pioneerdj.com/ddj-400/', content: 'DDJ-400' }])) });
    assert.strictEqual(out.status, 'verified');
    assert.strictEqual(Object.keys(store).length, 0, 'không cache kết quả rỗng');
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
