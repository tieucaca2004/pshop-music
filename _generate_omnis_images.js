const fs = require('fs');
const path = require('path');

const APIKEY = process.env.OPENAI_API_KEY;
if (!APIKEY) { console.error('Missing OPENAI_API_KEY env var'); process.exit(1); }

const jsonPath = 'data/landing-pages/omnis-duo.json';
const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const outDir = 'images/products';

function sizeFor(im) {
  if (im.placement === 'feature_header') return '1024x1024';
  return '1792x1024';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function genOne(im) {
  const prompt = im.prompt + (im.negativePrompt ? `. Avoid: ${im.negativePrompt}.` : '');
  const size = sizeFor(im);
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + APIKEY },
    body: JSON.stringify({ model: 'dall-e-3', prompt, size, n: 1, quality: 'standard', response_format: 'b64_json' })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + resp.status));
  const b64 = data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('No image data returned');
  return Buffer.from(b64, 'base64');
}

async function main() {
  const results = [];
  for (const im of j.images) {
    const filename = im.suggestedFilename.replace(/\.jpg$/i, '.png');
    const outPath = path.join(outDir, filename);
    process.stdout.write(`[${im.imageId}] generating -> ${filename} ... `);
    let ok = false, lastErr = null;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        const buf = await genOne(im);
        fs.writeFileSync(outPath, buf);
        ok = true;
        console.log('OK (' + buf.length + ' bytes)');
      } catch (e) {
        lastErr = e.message;
        console.log(`attempt ${attempt} failed: ${lastErr}`);
        if (attempt < 2) await sleep(5000);
      }
    }
    results.push({ imageId: im.imageId, filename, ok, error: ok ? null : lastErr });
    await sleep(13000); // stay under DALL-E 3 rate limit
  }
  fs.writeFileSync('_omnis_image_gen_results.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Success:', results.filter(r => r.ok).length, '/', results.length);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
