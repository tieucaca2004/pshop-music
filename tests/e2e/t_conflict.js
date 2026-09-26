const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const put = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PUT', body: JSON.stringify(v), ...H });
const patch = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PATCH', body: JSON.stringify(v), ...H });
const dlg = page => page.$('[role=dialog]').then(Boolean);
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const R = [];
  await put('products/950', { id: '950', name: 'TITLE-A', price: '100', categoryIds: ['dj'], category: 'dj', description: '<p>cũ</p>' });
  await put('blogPosts/bc1', { id: 'bc1', title: 'Blog C', slug: 'blog-c', contentHtml: '<p>c</p>', status: 'draft', excerpt: 'e' });
  await put('banners/nc1', { id: 'nc1', title: 'BN C', image: 'https://x/c.jpg', link: '/c', zone: 'home-top', order: 3, active: false });
  await put('videos/vc1', { id: 'vc1', title: 'VD C', url: 'https://youtu.be/dQw4w9WgXcQ', description: 'd', order: 1, active: true });
  // ---- PRODUCT: mở form (price 100) → tab B đổi price 200 → tab A sửa mô tả → Lưu
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(3500);
  await page.evaluate(() => AdminApp.editProduct('950'));
  await patch('products/950', { price: '200' });
  await page.click('#pDescriptionEditor .ql-editor'); await page.keyboard.type(' mô tả mới');
  await page.click('#saveBtn'); await page.waitForTimeout(1500);
  const shown = await dlg(page); let p = await db('products/950');
  R.push('PRODUCT: hộp xung đột hiện ' + shown + ' | DB price ' + p.price + ' (phải 200) | form giữ mô tả: ' + /mô tả mới/.test(await page.textContent('#pDescriptionEditor')));
  await page.click('[data-a="keep"]'); await page.waitForTimeout(500);
  p = await db('products/950'); R.push('  chọn GIỮ FORM → DB price ' + p.price + ', desc ' + p.description + ' | form vẫn còn mô tả: ' + /mô tả mới/.test(await page.textContent('#pDescriptionEditor')));
  await page.click('#saveBtn'); await page.waitForTimeout(1200); await page.click('[data-a="reload"]'); await page.waitForTimeout(1200);
  R.push('  chọn TẢI LẠI → form price ' + await page.inputValue('#pPrice') + ' (phải 200)');
  await page.fill('#pName', 'TITLE-A2'); await page.click('#saveBtn'); await page.waitForTimeout(1500);
  p = await db('products/950'); R.push('  sau tải lại, Lưu bình thường (không hỏi): hộp ' + await dlg(page) + ' | DB name ' + p.name + ' price ' + p.price);
  await page.evaluate(() => AdminApp.editProduct('950')); await patch('products/950', { price: '300' }); await page.fill('#pName', 'TITLE-OVR');
  await page.click('#saveBtn'); await page.waitForTimeout(1200); await page.click('[data-a="overwrite"]'); await page.waitForTimeout(1500);
  p = await db('products/950'); R.push('  chọn GHI ĐÈ (chủ động) → DB name ' + p.name + ' price ' + p.price + ' (form cũ 200 → ghi đè có chủ ý)');
  // ---- BLOG / BANNER / VIDEO
  for (const [url, id, node, ed, field, btn, other] of [
    ['/admin/blog.html', 'bc1', 'blogPosts', 'AdminBlog.edit', '#postTitle', '#blogSaveBtn', { excerpt: 'SUA-TU-TAB-B' }],
    ['/admin/banners.html', 'nc1', 'banners', 'AdminBanners.edit', '#bTitle', '#bannerSaveBtn', { link: '/SUA-TU-TAB-B' }],
    ['/admin/videos.html', 'vc1', 'videos', 'AdminVideos.edit', '#vTitle', '#videoSaveBtn', { description: 'SUA-TU-TAB-B' }]]) {
    await page.goto(BASE + url); await page.waitForTimeout(3500);
    await page.evaluate(([f, id]) => eval(f)(id), [ed, id]); await page.waitForTimeout(500);
    await patch(node + '/' + id, other); await page.fill(field, 'TAB-A-SUA');
    await page.click(btn); await page.waitForTimeout(1500);
    const s = await dlg(page); const rec = await db(node + '/' + id); const k = Object.keys(other)[0];
    R.push(node.toUpperCase() + ': hộp xung đột ' + s + ' | DB ' + k + '=' + rec[k] + ' (giữ thay đổi tab B) | title DB ' + rec.title + ' (chưa ghi)');
    if (s) await page.click('[data-a="keep"]');
  }
  R.forEach(r => console.log(r)); console.log('errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
