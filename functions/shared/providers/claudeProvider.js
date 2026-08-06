/*
 * shared/providers/claudeProvider.js — Anthropic/Claude provider (backend)
 * REUSE shape: { id, label, text(prompt, opts), image(...) }. Model động qua modelRegistry.
 */
const { withRetry } = require('../retry');
const { defineSecret } = require('firebase-functions/params');
const ANTHROPIC = (typeof defineSecret === 'function') ? defineSecret('ANTHROPIC_API_KEY') : { value: () => (process.env.ANTHROPIC_API_KEY || '') };

const claudeProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  text: function (prompt, opts) {
    const model = (opts && opts.model) || 'claude-sonnet-5';
    return withRetry(async function () {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model, max_tokens: (opts && opts.maxTokens) || 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && (data.error.message || JSON.stringify(data.error))) || 'Anthropic API lỗi.');
      const text = data.content && data.content[0] && data.content[0].text;
      return { text: (text || '').trim(), raw: data };
    }, { attempts: 3, timeoutMs: 90000, backoffMs: function (i) { return 500 * Math.pow(2, i); } });
  },
  image: function () { return Promise.reject(new Error('Anthropic text-only qua adapter này.')); }
};
module.exports = claudeProvider;
