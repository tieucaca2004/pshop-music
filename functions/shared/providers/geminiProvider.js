/*
 * shared/providers/geminiProvider.js — Google Gemini provider (backend)
 * REUSE shape. Model động qua modelRegistry.
 */
const { withRetry } = require('../retry');
const { defineSecret } = require('firebase-functions/params');
const GEMINI = (typeof defineSecret === 'function') ? defineSecret('GEMINI_API_KEY') : { value: () => (process.env.GEMINI_API_KEY || '') };

const geminiProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  text: function (prompt, opts) {
    const model = (opts && opts.model) || 'gemini-pro';
    // Gemini: pass-through bearer key, endpoint model:generateContent
    return withRetry(async function () {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI.value();
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: (opts && opts.temperature) || 0.7 } })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || 'Gemini API lỗi.');
      const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
      return { text: (text || '').trim(), raw: data };
    }, { attempts: 3, timeoutMs: 90000, backoffMs: function (i) { return 500 * Math.pow(2, i); } });
  },
  image: function () { return Promise.reject(new Error('Gemini image qua adapter này chưa hỗ trợ.')); }
};
module.exports = geminiProvider;
