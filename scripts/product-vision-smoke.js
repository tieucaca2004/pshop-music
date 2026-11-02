/*
 * scripts/product-vision-smoke.js — controlled REAL Vision smoke.
 * Usage:
 *   node scripts/product-vision-smoke.js --image "D:\path\to\product.jpg"
 *
 * Requires a configured OPENAI_API_KEY (firebase-functions params) and a real
 * product image. It makes one gpt-4o-mini vision request; check quota/cost
 * before running. It never prints the key and never writes to Firebase.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vision = require('../functions/shared/productVision');

(async () => {
  const idx = process.argv.indexOf('--image');
  const file = idx >= 0 ? process.argv[idx + 1] : '';
  if (!file || !fs.existsSync(file)) {
    console.error('Thiếu ảnh thật. Dùng: node scripts/product-vision-smoke.js --image "<đường dẫn ảnh>"');
    process.exit(2);
  }
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = fs.readFileSync(file);
  const started = Date.now();
  // Standalone Node cannot resolve firebase-functions defineSecret unless bound;
  // allow the existing key from the environment without printing it.
  const envKey = String(process.env.OPENAI_API_KEY || '').trim();
  const out = await vision.analyzeProductImage({ buffer, mime }, envKey ? { apiKey: envKey } : {});
  const productType = out.productType || null;
  const brand = out.brand || null;
  const model = out.model || null;
  const recognized = !!(productType || brand || model);
  const recognitionLevel = model ? 'model' : (brand ? 'brand' : (productType ? 'type' : 'none'));
  const safe = {
    image: path.basename(file),
    bytes: buffer.length,
    mime,
    durationMs: Date.now() - started,
    apiStatus: out.status,
    httpStatus: out.httpStatus || null,
    imageValid: out.status !== 'invalid_image',
    productType,
    brand,
    brandConfidence: out.brandConfidence || 0,
    model,
    modelConfidence: out.modelConfidence || 0,
    modelDetermined: !!model,
    color: out.color || null,
    features: out.features || [],
    uncertain: out.uncertain || [],
    warnings: out.warnings || [],
    recognized,
    recognitionLevel,
    success: out.status === 'ok' && recognized
  };
  console.log(JSON.stringify(safe, null, 2));
  // Model null is NOT a failure: type or brand recognition is enough.
  process.exit(safe.success ? 0 : (out.status === 'ok' ? 3 : 1));
})().catch(e => { console.error('Vision smoke failed: ' + String(e && e.message || e).slice(0, 200)); process.exit(1); });
