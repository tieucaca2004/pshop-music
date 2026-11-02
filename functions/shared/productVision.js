/*
 * shared/productVision.js — optional visual aid for Telegram product intake.
 *
 * Uses the existing OPENAI_API_KEY / gpt-4o-mini vision capability. It never
 * claims verified specifications; output is only type/brand/color/visual cues.
 * Model suggestions are kept as suggestions and must not become verified model.
 */
'use strict';
const { defineSecret } = require('firebase-functions/params');
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const VISION_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function keyValue() { try { return String(OPENAI_API_KEY.value() || '').trim(); } catch (e) { return ''; } }
function parseJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function analyzeProductImage({ buffer, mime } = {}, deps) {
  const d = deps || {};
  if (d.analyzeProductImage) return d.analyzeProductImage({ buffer, mime });
  const key = d.apiKey !== undefined ? String(d.apiKey || '').trim() : keyValue();
  const doFetch = d.fetch || fetch;
  const model = d.model || 'gpt-4o-mini';
  if (!key) return { status: 'unconfigured', warnings: ['Vision chưa cấu hình OPENAI_API_KEY; không phân tích ảnh.'] };
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { status: 'invalid_image', warnings: ['Ảnh rỗng, không thể phân tích.'] };
  if (buffer.length > MAX_IMAGE_BYTES) return { status: 'invalid_image', warnings: ['Ảnh quá lớn để phân tích.'] };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(d.timeoutMs) > 0 ? Number(d.timeoutMs) : VISION_TIMEOUT_MS);
  try {
    const prompt = 'Bạn là bộ phân tích ảnh sản phẩm cho cửa hàng DJ/âm thanh. CHỈ mô tả điều nhìn thấy trong ảnh. '
      + 'KHÔNG suy đoán công suất, kích thước driver, trở kháng, tần số, bảo hành, xuất xứ, giá hoặc thông số kỹ thuật. '
      + 'Nếu không chắc model, để model rỗng. Trả DUY NHẤT JSON: '
      + '{"productType":"...","brand":"...","brandConfidence":0-100,"model":"...","modelConfidence":0-100,'
      + '"color":"...","features":["..."],"uncertain":["..."]}';
    const r = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model, temperature: 0.1, max_tokens: 400,
        messages: [{
          role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: 'data:' + (mime || 'image/jpeg') + ';base64,' + buffer.toString('base64') } }
          ]
        }]
      }),
      signal: ctrl.signal
    });
    let data = null; try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) return { status: 'error', httpStatus: r.status, warnings: ['Vision lỗi HTTP ' + r.status + '.'] };
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = parseJson(text);
    if (!parsed || typeof parsed !== 'object') return { status: 'error', httpStatus: r.status, warnings: ['Vision trả dữ liệu không hợp lệ.'] };
    const num = (v) => isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : 0;
    return {
      status: 'ok',
      httpStatus: r.status,
      productType: parsed.productType ? String(parsed.productType).trim().slice(0, 80) : null,
      brand: parsed.brand ? String(parsed.brand).trim().slice(0, 80) : null,
      brandConfidence: num(parsed.brandConfidence),
      model: parsed.model ? String(parsed.model).trim().slice(0, 100) : null,
      modelConfidence: num(parsed.modelConfidence),
      color: parsed.color ? String(parsed.color).trim().slice(0, 60) : null,
      features: Array.isArray(parsed.features) ? parsed.features.map(x => String(x || '').trim()).filter(Boolean).slice(0, 12) : [],
      uncertain: Array.isArray(parsed.uncertain) ? parsed.uncertain.map(x => String(x || '').trim()).filter(Boolean).slice(0, 12) : [],
      warnings: []
    };
  } catch (e) {
    const timeout = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return { status: timeout ? 'timeout' : 'error', warnings: [timeout ? 'Vision quá thời gian chờ.' : 'Vision lỗi: ' + String(e && e.message || e).slice(0, 120)] };
  } finally { clearTimeout(timer); }
}

module.exports = { analyzeProductImage };
