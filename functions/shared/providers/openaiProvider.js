/*
 * shared/providers/openaiProvider.js — OpenAI provider (PHASE D AI Router).
 *
 * Provider Abstraction Layer: mỗi provider 1 file riêng, implement interface
 * chung { text(), image() }. OpenAI là DEFAULT provider — giữ nguyên hành vi
 * gốc (gpt-4o-mini text, dall-e-3 image) + retry/timeout từ Retry Engine.
 *
 * Backward-compat: aiGenerate.js gọi ProviderRouter.route(); khi không có
 * providerId → router trả openaiProvider (hành vi KHÔNG đổi so với trước).
 */
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { withRetry } = require('../retry');

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const IMAGE_SIZE_MAP = { '1:1': '1024x1024', '4:5': '1024x1792', '16:9': '1792x1024' };

const openaiProvider = {
  id: 'openai',
  label: 'OpenAI',
  // text — gpt-4o-mini, retry 3, timeout 60s, log retry
  text: function (prompt, opts) {
    return withRetry(async function () {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY.value() },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI API lỗi.');
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return { text: (text || '').trim(), raw: data };
    }, { attempts: 3, timeoutMs: 60000, backoffMs: function (i) { return 500 * Math.pow(2, i); }, onAttemptFail: function (err, i) { console.warn('[openai] gpt-4o-mini attempt ' + (i + 1) + ' failed:', (err && err.message) ? err.message : err); } });
  },
  // image — dall-e-3, tải b64 về lưu Storage, retry 3, timeout 90s, log retry
  image: function (prompt, size) {
    const openAiSize = IMAGE_SIZE_MAP[size] || '1024x1024';
    return withRetry(async function () {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY.value() },
        body: JSON.stringify({ model: 'dall-e-3', prompt, size: openAiSize, n: 1, response_format: 'b64_json' })
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI Images API lỗi.');
      const item = data.data && data.data[0];
      if (!item || !item.b64_json) throw new Error('OpenAI không trả về ảnh.');
      const buffer = Buffer.from(item.b64_json, 'base64');
      const path = 'ai-generated/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png';
      const bucket = admin.storage().bucket();
      const token = require('crypto').randomUUID();
      await bucket.file(path).save(buffer, { metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } } });
      return { imageUrl: 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token };
    }, { attempts: 3, timeoutMs: 90000, backoffMs: function (i) { return 500 * Math.pow(2, i); }, onAttemptFail: function (err, i) { console.warn('[openai] dall-e-3 attempt ' + (i + 1) + ' failed:', (err && err.message) ? err.message : err); } });
  }
};

module.exports = openaiProvider;
