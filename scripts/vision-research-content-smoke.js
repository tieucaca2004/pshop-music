/*
 * scripts/vision-research-content-smoke.js — local integration check.
 * - Uses the ALREADY OBTAINED Vision result; does NOT call Vision.
 * - Calls Tavily keyless for TMA-2 DJ research.
 * - Uses the existing facebook-post-generator prompt + mapToDraftContent (Claim Guard).
 * - Makes one OpenAI text call using OPENAI_API_KEY from the environment.
 * - Prints a simulated Telegram preview; sends nothing and publishes nothing.
 */
'use strict';
const research = require('../functions/shared/productResearch');
const Core = require('../functions/shared/aiModulesCore');
const orch = require('../functions/shared/contentOrchestrator');

const vision = {
  status: 'ok', productType: 'headphones', brand: 'AIAIAI', brandConfidence: 90,
  model: 'TMA-2 DJ', modelConfidence: 85, color: 'black',
  features: ['over-ear design', 'detachable cable', 'adjustable headband'], warnings: []
};
const seller = { name: 'Tai nghe AIAIAI TMA-2 DJ', price: 5000000, condition: 'Hàng mới', warrantyText: '1 năm' };

function specText(specs) {
  return Object.keys(specs || {}).map(k => k + ': ' + specs[k]).join(' · ');
}

(async () => {
  const cfg = { provider: 'tavily', configured: true, officialDomains: ['aiaiai.audio'], timeoutMs: 20000 };
  const out = await research.researchProduct(
    { sku: 'TMA-2 DJ', name: 'AIAIAI TMA-2 DJ', category: 'tai nghe' },
    { config: cfg, cache: { get: async () => null, set: async () => {} } }
  );
  const specs = specText(out.specs);
  const product = {
    name: seller.name,
    brand: vision.brand || 'AIAIAI',
    model: vision.model,
    productType: 'Tai nghe chụp tai DJ',
    condition: seller.condition,
    warrantyText: seller.warrantyText,
    price: seller.price,
    specs: specs || null,
    // Verified from the official TMA-2 DJ page used by research.
    description: 'Tai nghe DJ modular chuyên nghiệp, cách âm tốt, thiết kế bền cho set diễn dài.',
    features: ['Thiết kế modular', 'Cách âm tốt', 'Headband gia cố'],
    applications: ['DJ']
  };
  const input = { productBrief: { name: product.name }, singleVersion: true, productId: null };
  const ctx = { product, categories: [] };
  const prompt = Core.MODULES['facebook-post-generator'].buildPrompt(input, ctx);

  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) { console.error('NO_OPENAI_KEY'); process.exit(2); }
  const started = Date.now();
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 700 })
  });
  const data = await r.json();
  if (!r.ok) { console.error('CONTENT_HTTP_' + r.status); process.exit(3); }
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const parsed = Core.parseJsonResponse(raw);
  if (!parsed) { console.error('CONTENT_INVALID_JSON'); process.exit(4); }

  // Use the real contentOrchestrator content step: facts/CTA/Claim Guard are its job.
  const cap = await orch.generateCaption({ product }, {
    generateForModule: async () => ({ content: parsed }),
    aiTimeoutMs: 30000,
    uid: null, email: null
  });
  const draft = { product, pageName: 'Local preview', pageId: 'local', version: 1, aiCaption: cap.caption, research: out, notices: [], imageMode: 'original' };
  const preview = orch.buildPreviewText(draft, null);
  const caption = cap.caption;
  const safe = {
    researchStatus: out.status,
    matchedSku: out.matchedSku,
    specs: out.specs,
    sources: out.sources ? out.sources.map(s => ({ title: s.title, url: s.url, type: s.type })) : [],
    warnings: out.warnings || [],
    contentMs: Date.now() - started,
    contentVersionCount: 1,
    copy: caption,
    preview
  };
  console.log(JSON.stringify(safe, null, 2));
})().catch(e => { console.error(String(e && e.message || e).slice(0, 300)); process.exit(1); });
