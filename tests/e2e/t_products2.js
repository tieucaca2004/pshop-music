const { launch, newPage, login, BASE } = require('./cms');
const db = (p) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
const all = async () => Object.values(await db('products')).filter(Boolean);
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  await login(page, 'admin@test.local'); await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(3500);
  let A = (await all()).find(p => p.name === 'TEST-A2 Controller'); const B = (await all()).find(p => p.name === 'TEST-B2 Loa');
  await page.evaluate(id => AdminApp.editProduct(id), A.id); await page.waitForTimeout(300);
  console.log('EDIT load: name/slug/price', JSON.stringify(await page.evaluate(() => ['pName','pSlug','pPrice'].map(i => document.getElementById(i).value))));
  await page.fill('#pPrice', '2500000'); await page.click('#saveBtn'); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForTimeout(3000);
  A = (await all()).find(p => p.id === A.id); console.log('UPDATE persisted price:', A.price, 'slug kept:', A.slug, 'seoTitle kept:', A.seoTitle);
  // Public: sản phẩm Nháp không hiện
  const p2 = await page.context().newPage(); await p2.goto(BASE + '/category.html'); await p2.waitForTimeout(4000);
  const txt = await p2.evaluate(() => document.body.innerText); console.log('PUBLIC category shows draft A2?', txt.includes('TEST-A2'), '| shows seed product count>0?', /DDJ|Pioneer|AlphaTheta/.test(txt));
  // DELETE handler trên bản ghi TEST (emulator)
  await page.evaluate(id => AdminApp.deleteProduct(id), B.id); await page.waitForTimeout(1500);
  console.log('DELETE test record B2 removed:', !(await all()).some(p => p.id === B.id), '| confirm dialog:', log.console.some(c => /dialog confirm.*Xóa sản phẩm/.test(c)));
  console.log('errors:', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
