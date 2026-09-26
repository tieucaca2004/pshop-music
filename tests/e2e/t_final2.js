const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const put = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PUT', body: JSON.stringify(v), ...H });
const vals = async p => Object.values(await db(p) || {}).filter(Boolean);
const pub = async (b, url) => { const { page } = await newPage(b); await page.goto(BASE + url); await page.waitForTimeout(11000); const t = await page.evaluate(() => document.body.textContent); await page.context().close(); return t; };
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const R = []; const ok = (n, c, d) => R.push((c ? 'PASS ' : 'FAIL ') + n + (d ? ' | ' + d : ''));
  await put('products/980', { id: '980', name: 'SP-XOA-TEST', pubStatus: 'published', categoryIds: ['dj'], category: 'dj', price: '1' });
  await put('blogPosts/bdel', { id: 'bdel', title: 'BLOG-XOA-TEST', slug: 'blog-xoa-test', status: 'published', contentHtml: '<p>x</p>', publishedAt: 1 });
  await put('banners/ndel', { id: 'ndel', title: 'BN-XOA', image: 'https://x/del.jpg', zone: 'home-top', order: 9, active: true });
  await put('videos/vdel', { id: 'vdel', title: 'VIDEO-XOA-TEST', url: 'https://youtu.be/dQw4w9WgXcQ', order: 9, active: true });
  ok('trước xoá: SP hiện public', (await pub(b, '/category.html?cat=dj')).includes('SP-XOA-TEST'));
  ok('trước xoá: Blog hiện public', (await pub(b, '/blog.html')).includes('BLOG-XOA-TEST'));
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(3500); await page.evaluate(() => AdminApp.deleteProduct('980')); await page.waitForTimeout(1500);
  await page.goto(BASE + '/admin/blog.html'); await page.waitForTimeout(3500); await page.evaluate(() => AdminBlog.remove('bdel')); await page.waitForTimeout(1500);
  await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3500); await page.evaluate(() => AdminBanners.remove('ndel')); await page.waitForTimeout(1500);
  await page.goto(BASE + '/admin/videos.html'); await page.waitForTimeout(3500); await page.evaluate(() => AdminVideos.remove('vdel')); await page.waitForTimeout(1500);
  ok('XOÁ SP/Blog/Banner/Video khỏi DB', !(await db('products/980')) && !(await db('blogPosts/bdel')) && !(await db('banners/ndel')) && !(await db('videos/vdel')));
  ok('XOÁ có confirm cả 4', log.console.filter(c => /dialog confirm/.test(c)).length >= 4, log.console.filter(c => /dialog confirm/.test(c)).length + ' confirm');
  ok('sau xoá: SP biến mất public', !(await pub(b, '/category.html?cat=dj')).includes('SP-XOA-TEST'));
  ok('sau xoá: Blog biến mất public', !(await pub(b, '/blog.html')).includes('BLOG-XOA-TEST'));
  ok('sau xoá: Video biến mất public', !(await pub(b, '/videos.html')).includes('VIDEO-XOA-TEST'));
  // USERS: tạo → thu hồi → tài khoản mất quyền
  await page.goto(BASE + '/admin/users.html'); await page.waitForTimeout(3500);
  await page.fill('#newUserName', 'Revoke Me'); await page.fill('#newUserEmail', 'revoke@test.local'); await page.fill('#newUserPassword', 'Revoke12345'); await page.selectOption('#newUserRole', 'editor');
  await page.click('#createUserBtn'); await page.waitForTimeout(3500);
  const rv = Object.entries(await db('roles')).find(([k, v]) => v.email === 'revoke@test.local'); ok('USERS tạo editor', !!rv);
  await page.evaluate(uid => AdminUsers.revoke(uid), rv[0]); await page.waitForTimeout(1500);
  ok('USERS thu hồi quyền → roles xoá', !(await db('roles/' + rv[0])));
  const { page: p2 } = await newPage(b); await login(p2, 'revoke@test.local', 'Revoke12345'); await p2.goto(BASE + '/admin/products.html'); await p2.waitForTimeout(4000);
  ok('USERS tài khoản bị thu hồi → không vào CMS', /chưa được cấp quyền/i.test(await p2.textContent('#adminSidebar')));
  // BANNER 10 vòng + CATEGORY 10 vòng
  const fb = [], fc = [];
  for (let r = 1; r <= 10; r++) {
    await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(2500);
    await page.fill('#bTitle', 'BN-R' + r); await page.evaluate(v => { document.getElementById('bImage').value = v; }, 'https://x/r' + r + '.jpg'); await page.fill('#bOrder', String(r)); await page.click('#bannerSaveBtn'); await page.waitForTimeout(1200);
    let x = (await vals('banners')).filter(v => v.title === 'BN-R' + r); if (x.length !== 1) { fb.push('R' + r + ' count ' + x.length); continue; }
    await page.reload(); await page.waitForTimeout(2500); await page.evaluate(id => AdminBanners.edit(id), x[0].id); await page.fill('#bLink', '/r' + r); await page.click('#bannerSaveBtn'); await page.waitForTimeout(1200);
    const y = await db('banners/' + x[0].id); if (y.link !== '/r' + r || y.image !== 'https://x/r' + r + '.jpg' || Number(y.order) !== r) fb.push('R' + r + ' ' + JSON.stringify(y));
    await page.goto(BASE + '/admin/categories.html'); await page.waitForTimeout(3000); await page.click('#addCategoryBtn'); await page.waitForTimeout(1200);
    const c = (await vals('categories')).find(v => v.label === 'Danh mục mới'); if (!c) { fc.push('R' + r + ' không tạo'); continue; }
    await page.evaluate(([id, r]) => { const row = [...document.querySelectorAll('#categoryList > *')].find(el => el.innerHTML.includes(id)) || [...document.querySelectorAll('#categoryList > *')].pop(); row.querySelector('[data-field="code"]').value = 'cat-r' + r; row.querySelector('[data-field="label"]').value = 'Cat R' + r; }, [c.id, r]);
    await page.evaluate(id => AdminCategories.save(id), c.id); await page.waitForTimeout(1200);
    await page.reload(); await page.waitForTimeout(3000); const cc = await db('categories/' + c.id);
    if (cc.code !== 'cat-r' + r || cc.label !== 'Cat R' + r) fc.push('R' + r + ' ' + JSON.stringify(cc));
    const dup = (await vals('categories')).filter(v => v.code === 'cat-r' + r).length; if (dup !== 1) fc.push('R' + r + ' dup ' + dup);
  }
  ok('BANNER 10 vòng', !fb.length, fb.join('; ')); ok('CATEGORY 10 vòng', !fc.length, fc.join('; '));
  R.forEach(r => console.log(r)); console.log('errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
