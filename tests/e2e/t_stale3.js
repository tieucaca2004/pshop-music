const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const patch = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PATCH', body: JSON.stringify(v), ...H });
const click = (page, body, id) => page.evaluate(([body, id]) => { const e = [...document.querySelectorAll(body + ' [onclick]')].find(x => x.getAttribute('onclick').includes(id) && /\.edit/.test(x.getAttribute('onclick'))); return e && e.click(); }, [body, id]);
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const R = [];
  await patch('blogPosts/bx1', { id: 'bx1', title: 'Bài X', slug: 'bai-x', excerpt: 'cũ', contentHtml: '<p>a</p>', status: 'draft' });
  await patch('banners/nx1', { id: 'nx1', title: 'BN X', image: 'https://x/1.jpg', link: '/a', zone: 'home-top', order: 5, active: false });
  await patch('videos/vx1', { id: 'vx1', title: 'VD X', url: 'https://youtu.be/dQw4w9WgXcQ', description: 'cũ', order: 1, active: true });
  // PRODUCT
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  await patch('products/42', { price: '8888888', seoTitle: 'SEO-MOI-TAB-KHAC' });
  await page.evaluate(() => AdminApp.editProduct('42'));
  await page.fill('#pName', 'Tên sửa'); await page.click('#saveBtn'); await page.waitForTimeout(2000);
  let p = await db('products/42'); R.push('PRODUCT sau Lưu: price ' + p.price + ' seo ' + p.seoTitle + ' name ' + p.name + ' → ' + (p.price === '8888888' && p.seoTitle === 'SEO-MOI-TAB-KHAC' && p.name === 'Tên sửa' ? 'OK' : 'FAIL'));
  // BLOG
  await page.goto(BASE + '/admin/blog.html'); await page.waitForTimeout(3500);
  await patch('blogPosts/bx1', { excerpt: 'MOI-TAB-KHAC' }); await click(page, '#blogTableBody', 'bx1'); await page.waitForTimeout(700);
  await page.fill('#postTitle', 'Bài X sửa'); await page.click('#blogSaveBtn'); await page.waitForTimeout(2000);
  let bp = await db('blogPosts/bx1'); R.push('BLOG sau Lưu: excerpt ' + bp.excerpt + ' title ' + bp.title + ' → ' + (bp.excerpt === 'MOI-TAB-KHAC' && bp.title === 'Bài X sửa' ? 'OK' : 'FAIL'));
  // BANNER
  await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3500);
  await patch('banners/nx1', { link: '/moi-tab-khac' }); await click(page, '#bannerTableBody', 'nx1'); await page.waitForTimeout(700);
  await page.fill('#bTitle', 'BN X sửa'); await page.click('#bannerSaveBtn'); await page.waitForTimeout(2000);
  let bn = await db('banners/nx1'); R.push('BANNER sau Lưu: link ' + bn.link + ' title ' + bn.title + ' active ' + bn.active + ' → ' + (bn.link === '/moi-tab-khac' && bn.title === 'BN X sửa' && bn.active === false ? 'OK' : 'FAIL'));
  // VIDEO
  await page.goto(BASE + '/admin/videos.html'); await page.waitForTimeout(3500);
  await patch('videos/vx1', { description: 'MOI-TAB-KHAC' }); await click(page, '#videoTableBody', 'vx1'); await page.waitForTimeout(700);
  await page.fill('#vTitle', 'VD X sửa'); await page.click('#videoSaveBtn'); await page.waitForTimeout(2000);
  let vd = await db('videos/vx1'); R.push('VIDEO sau Lưu: desc ' + vd.description + ' → ' + (vd.description === 'MOI-TAB-KHAC' && vd.title === 'VD X sửa' ? 'OK' : 'FAIL'));
  // AGENT deep link
  await page.goto(BASE + '/admin/products.html?edit=42&field=price&value=1234567'); await page.waitForTimeout(5000);
  R.push('AGENT deep link: form price ' + await page.inputValue('#pPrice') + ' name ' + await page.inputValue('#pName') + ' → ' + ((await page.inputValue('#pPrice')) === '1234567' && (await page.inputValue('#pName')) === 'Tên sửa' ? 'OK' : 'FAIL') + ' | DB price vẫn ' + (await db('products/42')).price + ' (chưa Lưu)');
  R.forEach(r => console.log(r)); console.log('errors', JSON.stringify(log.errors)); await b.close(); })();
