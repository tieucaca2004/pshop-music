/*
 * scripts/aiaiai-copy-variants.js — 3 real content-engine variants for AIAIAI TMA-2 DJ.
 * One OpenAI text call; no Vision, no research, no Telegram/Facebook.
 */
'use strict';
const Core = require('../functions/shared/aiModulesCore');

const product = {
  name: 'Tai nghe AIAIAI TMA-2 DJ',
  brand: 'AIAIAI',
  model: 'TMA-2 DJ',
  productType: 'Tai nghe chụp tai DJ',
  category: 'tai nghe DJ',
  condition: 'Hàng mới',
  warrantyText: '1 năm',
  price: 5000000,
  specs: 'Driver diameter: 40mm · Max SPL: 120dB @ 1kHz',
  description: 'Tai nghe DJ modular chuyên nghiệp, cách âm tốt, thiết kế bền cho set diễn dài.',
  features: ['Thiết kế modular', 'Cách âm tốt', 'Headband gia cố'],
  applications: ['DJ']
};
const facts = 'Giá: 5.000.000đ\nTình trạng: Hàng mới\nBảo hành: 1 năm';
const specLine = 'Thông số: Driver 40mm · Max SPL 120dB @ 1kHz';

(async () => {
  const input = {};
  const ctx = { product, categories: [] };
  const prompt = Core.MODULES['facebook-post-generator'].buildPrompt(input, ctx);
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) { console.error('NO_OPENAI_KEY'); process.exit(2); }
  const started = Date.now();
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 900 })
  });
  const data = await r.json();
  if (!r.ok) { console.error('CONTENT_HTTP_' + r.status); process.exit(3); }
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const mapped = Core.MODULES['facebook-post-generator'].mapToDraftContent({ text: raw }, input, ctx);
  const versions = (mapped.versions || []).map((v, i) => {
    let body = [v.hook, v.caption].filter(Boolean).join('\n\n');
    if (v.cta) body = Core.stripCtaSentences(body);
    body = Core.ensureProductName(body, product.name);
    body = Core.polishFacebookText(body);
    if (!/40\s*mm|120\s*dB/i.test(body)) body += '\n\n' + specLine;
    const tags = Array.isArray(v.hashtags) ? v.hashtags.join(' ') : '';
    return { index: i + 1, hook: v.hook, cta: v.cta, hashtags: v.hashtags, copy: [body, v.cta, facts, tags].filter(Boolean).join('\n\n') };
  });
  const valid = versions.every(v => /5\.000\.000đ/.test(v.copy) && /Bảo hành: 1 năm/.test(v.copy) && /40\s*mm|120\s*dB/i.test(v.copy) && v.cta);
  console.log(JSON.stringify({ contentMs: Date.now() - started, count: versions.length, valid, versions }, null, 2));
  process.exit(valid && versions.length >= 3 ? 0 : 4);
})().catch(e => { console.error(String(e && e.message || e).slice(0, 300)); process.exit(1); });
