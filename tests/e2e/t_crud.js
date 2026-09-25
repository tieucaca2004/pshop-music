const { launch, newPage, login, BASE } = require('./cms');
const db = (p) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
const cnt = async p => { const v = await db(p); return v ? Object.values(v).filter(Boolean).length : 0; };
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').trim().slice(0, 90);
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  await login(page, 'admin@test.local');
  const R = [];
  async function mod(name, url, fn) {
    log.errors.length = 0; log.console.length = 0;
    await page.goto(BASE + url); await page.waitForTimeout(3000);
    let res; try { res = await fn(); } catch (e) { res = 'TEST-EXC ' + e.message.split('\n')[0]; }
    R.push(name + ' | ' + res + ' | errors=' + JSON.stringify([...new Set(log.errors)]) + ' dialogs=' + JSON.stringify(log.console.filter(c => c.startsWith('[dialog'))));
  }
  await mod('BANNERS create', '/admin/banners.html', async () => {
    const before = await cnt('banners');
    await page.fill('#bTitle', 'TEST banner'); await page.fill('#bImage', 'https://example.com/b.jpg'); await page.fill('#bLink', '/category.html');
    await page.click('#bannerSaveBtn'); await page.waitForTimeout(1500);
    const after = await cnt('banners'); const rows = await page.$$eval('#bannerTableBody tr', r => r.length);
    return `db ${before}→${after}, table rows ${rows}, status "${await txt(page, '#bannerStatus')}", form cleared=${(await page.inputValue('#bTitle')) === ''}`;
  });
  await mod('BLOG create published', '/admin/blog.html', async () => {
    const before = await cnt('blogPosts');
    await page.fill('#postTitle', 'TEST bài viết'); await page.selectOption('#postStatus', 'published').catch(() => {});
    await page.fill('#postExcerpt', 'tóm tắt'); await page.click('#postContentEditor .ql-editor').catch(() => {}); await page.keyboard.type('Nội dung test');
    await page.click('#blogSaveBtn'); await page.waitForTimeout(1500);
    const posts = Object.values(await db('blogPosts') || {}); const p = posts.find(x => x.title === 'TEST bài viết');
    return `db ${before}→${await cnt('blogPosts')}, slug="${p && p.slug}", status=${p && p.status}, contentHtml has text=${!!(p && /Nội dung test/.test(p.contentHtml || ''))}, ui "${await txt(page, '#blogStatus')}"`;
  });
  await mod('VIDEOS create', '/admin/videos.html', async () => {
    const before = await cnt('videos');
    await page.fill('#vTitle', 'TEST video'); await page.fill('#vUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.click('#videoSaveBtn'); await page.waitForTimeout(1500);
    return `db ${before}→${await cnt('videos')}, ui "${await txt(page, '#videoStatus')}"`;
  });
  await mod('CATEGORIES list+save', '/admin/categories.html', async () => {
    const before = await cnt('categories'); const items = await page.$$eval('#categoryList > *', r => r.length);
    await page.click('#addCategoryBtn'); await page.waitForTimeout(800);
    return `db ${before} items, ui items ${items}, sau khi bấm Thêm: ui "${await txt(page, '#categoryStatus')}" dbNow ${await cnt('categories')}`;
  });
  await mod('SLIDERS', '/admin/sliders.html', async () => { const n = await page.$$eval('#slideList > *', r => r.length); await page.click('#saveSlidesBtn'); await page.waitForTimeout(1500); return `slides ${n}, save ui "${await txt(page, '#sliderStatus')}"`; });
  await mod('MENU', '/admin/menu.html', async () => { const n = await page.$$eval('#menuList > *', r => r.length); await page.click('#saveMenuBtn'); await page.waitForTimeout(1500); return `items ${n}, save ui "${await txt(page, '#menuStatus')}"`; });
  await mod('FOOTER', '/admin/footer.html', async () => { await page.click('#saveFooterBtn'); await page.waitForTimeout(1500); return `save ui "${await txt(page, '#footerStatus')}"`; });
  await mod('SEO', '/admin/seo.html', async () => { await page.fill('#seoDefaultTitle', 'TEST SEO title'); await page.click('#seoSaveBtn'); await page.waitForTimeout(1500); const s = await db('seoSettings'); return `ui "${await txt(page, '#seoStatus')}", db defaultTitle="${s && (s.defaultTitle || JSON.stringify(s).slice(0,60))}"`; });
  await mod('SETTINGS', '/admin/settings.html', async () => { await page.fill('#setPhone', '0900000000'); await page.click('#saveSettingsBtn'); await page.waitForTimeout(1500); const s = await db('siteContent'); return `ui "${await txt(page, '#settingsStatus')}", db phone=${JSON.stringify(s && (s.phone || (s.settings && s.settings.phone)))}`; });
  await mod('USERS list', '/admin/users.html', async () => `rows ${await page.$$eval('#userTableBody tr', r => r.length)}, total "${await txt(page, '#userTotal')}"`);
  R.forEach(r => console.log(r)); await b.close(); })();
