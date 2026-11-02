/*
 * scripts/research-real-smoke.js — controlled REAL Tavily keyless integration test.
 * Run once: node scripts/research-real-smoke.js
 * No API key, no account, no production config, no Facebook post.
 * This is NOT part of the mock unit suite; it makes a real HTTPS request.
 */
'use strict';
const research = require('../functions/shared/productResearch');

(async () => {
  const query = { sku: 'KRK-R8-G4', name: 'KRK ROKIT 8 G4', category: 'loa' };
  const out = await research.researchProduct(query, {
    config: { provider: 'tavily', configured: true, officialDomains: ['krkmusic.com'], timeoutMs: 20000 },
    cache: { get: async () => null, set: async () => {} }
  });
  const safe = {
    status: out.status,
    matchedSku: out.matchedSku,
    product: out.product,
    specs: out.specs,
    warnings: out.warnings,
    sources: (out.sources || []).map(s => ({ title: s.title, url: s.url, type: s.type, claimCount: (s.claims || []).length }))
  };
  console.log(JSON.stringify(safe, null, 2));
  if (out.status !== 'verified') process.exit(2);
  if (!out.sources.some(s => s.type === 'official' && /krkmusic\.com$/.test(new URL(s.url).hostname))) process.exit(3);
  if (!Object.keys(out.specs || {}).some(k => /power|watt|công suất/i.test(k))) process.exit(4);
  if (!Object.entries(out.specs || {}).some(([k, v]) => /power|watt|công suất/i.test(k) && /203/.test(String(v)))) process.exit(5);
  if (out.product && Object.prototype.hasOwnProperty.call(out.product, 'price')) process.exit(6);
  console.log('\nREAL_RESEARCH_VERIFIED');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
