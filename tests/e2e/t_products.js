const { launch, newPage, login, BASE } = require('./cms');
const db = (p) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  await login(page, 'admin@test.local');
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  const rows = await page.$$eval('#productTableBody tr', t => t.length); console.log('READ list rows:', rows);
  // CREATE sản phẩm A (Nháp) với SEO
  await page.fill('#pName', 'TEST-A2 Controller'); await page.check('#pCategoriesList input[type=checkbox] >> nth=0');
  await page.fill('#pPrice', '1000000'); await page.fill('#pSeoTitle', 'SEO A'); await page.fill('#pSlug', 'test-a'); await page.fill('#pCanonical', 'https://pshopmusic.com/test-a');
  await page.click('#saveBtn'); await page.waitForTimeout(2000);
  let all = Object.values(await db('products')).filter(Boolean); const A = all.find(p => p.name === 'TEST-A2 Controller');
  console.log('CREATE A:', !!A, 'pubStatus', A && A.pubStatus, 'slug', A && A.slug);
  console.log('Form sau khi lưu A — pSeoTitle/pSlug/pCanonical:', JSON.stringify(await page.evaluate(() => ['pSeoTitle','pSlug','pCanonical','pSeoKeywords','pOgImage','pSeoDescription'].map(i => document.getElementById(i).value))));
  // CREATE sản phẩm B ngay sau đó (không nhập SEO)
  await page.fill('#pName', 'TEST-B2 Loa'); await page.check('#pCategoriesList input[type=checkbox] >> nth=0');
  await page.click('#saveBtn'); await page.waitForTimeout(2000);
  all = Object.values(await db('products')).filter(Boolean); const B = all.find(p => p.name === 'TEST-B2 Loa');
  console.log('CREATE B: slug=', JSON.stringify(B && B.slug), 'canonical=', JSON.stringify(B && B.canonical), 'seoTitle=', JSON.stringify(B && B.seoTitle));
  // VALIDATION: không tên / không danh mục
  await page.fill('#pName', ''); await page.click('#saveBtn'); await page.waitForTimeout(500);
  console.log('dialogs:', JSON.stringify(log.console.filter(c => c.startsWith('[dialog'))));
  // UPDATE A: sửa giá, reload, kiểm tra lưu
  await page.evaluate(id => AdminApp.editProduct(id), A.id).catch(e => console.log('editProduct not exposed', e.message));
  console.log('errors:', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
