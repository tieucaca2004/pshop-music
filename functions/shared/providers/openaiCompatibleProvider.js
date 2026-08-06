/*
 * shared/providers/openaiCompatibleProvider.js — OpenAI Compatible Adapter (backend)
 * MISSION — MODEL REGISTRY REVISION (REUSE FIRST).
 *
 * Một adapter duy nhất cho MỌI provider cùng API style OpenAI-completions:
 *   OpenAI, DeepSeek, Kimi (Moonshot), OpenRouter.
 * Địa chỉ endpoint + API key lấy từ Model Registry (qua opts.providerApi/baseUrl/apiKey),
 * KHÔNG if/else theo tên provider, KHÔNG hard-code model.
 */
const { withRetry } = require('../retry');

const openaiCompatibleProvider = {
  id: 'openai-compatible',
  label: 'OpenAI Compatible',
  text: function (prompt, opts) {
    const model = (opts && opts.model) || 'chat';
    // endpoint + key từ registry qua opts (providerRouter.route truyền vào)
    const baseUrl = (opts && (opts.baseUrl || opts.providerBaseUrl)) || 'https://api.openai.com/v1';
    const apiKey = (opts && opts.apiKey) || (opts && opts.providerKey) || '';
    const temperature = (opts && opts.temperature) || 0.7;
    return withRetry(async function () {
      const r = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], temperature: temperature })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || ('OpenAI-Compatible API lỗi (' + baseUrl + ')'));
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return { text: (text || '').trim(), raw: data };
    }, { attempts: 3, timeoutMs: 60000, backoffMs: function (i) { return 500 * Math.pow(2, i); } });
  },
  image: function (prompt, size) {
    // OpenAI-compatible image (dall-e style) — dùng chung
    const baseUrl = 'https://api.openai.com/v1';
    const apiKey = '';
    return withRetry(async function () {
      const r = await fetch(baseUrl + '/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'dall-e-3', prompt: prompt, size: size || '1024x1024', n: 1 })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || 'Image API lỗi.');
      const item = data.data && data.data[0];
      return { imageUrl: (item && (item.url || item.b64_json)) || null, raw: data };
    }, { attempts: 3, timeoutMs: 90000, backoffMs: function (i) { return 500 * Math.pow(2, i); } });
  }
};
module.exports = openaiCompatibleProvider;
