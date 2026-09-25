const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const patch = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PATCH', body: JSON.stringify(v), ...H });
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  await patch('products/41', { seoTitle: 'SEO CU', metaDescription: 'META CU', slug: 'slug-cu' });
  await patch('aiDrafts/dSEO2', { id: 'dSEO2', moduleId: 'product-description-writer', targetCollection: 'products', targetId: '41', status: 'draft', createdAt: 10, inputParams: { productId: '41' }, content: { description: '<p>AI moi</p>', seoTitle: 'SEO AI MOI2', metaDescription: 'META AI MOI2', slug: 'slug-ai-moi2' } });
  await page.route(/admin-products-ai-assist\.js/, async r => { const res = await r.fetch(); const body = (await res.text()).replace('return { init, copyText };', 'window.__sync = syncProductForm; return { init, copyText };'); r.fulfill({ body, contentType: 'application/javascript' }); });
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  await page.evaluate(() => AdminApp.editProduct('41'));
  // Mô phỏng đúng applyDraft() của AI Assist: publishDraftById() rồi đồng bộ form
  await page.evaluate(async () => { const d = await DraftDB.get('dSEO2'); await AdminAI.publishDraftById('dSEO2'); if (window.__sync) window.__sync(d.content); });
  console.log('DB sau AI publish:', JSON.stringify((({ seoTitle, metaDescription, slug }) => ({ seoTitle, metaDescription, slug }))(await db('products/41'))));
  console.log('Form sau AI:', JSON.stringify(await page.evaluate(() => ['pSeoTitle','pSeoDescription','pSlug'].map(i => document.getElementById(i).value))));
  await page.click('#saveBtn'); await page.waitForTimeout(2500);
  console.log('DB sau khi Founder bấm LƯU:', JSON.stringify((({ seoTitle, metaDescription, slug }) => ({ seoTitle, metaDescription, slug }))(await db('products/41'))), JSON.stringify(log.errors));
  await b.close(); })();
