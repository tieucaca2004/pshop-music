const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const vals = async p => Object.values(await db(p) || {}).filter(Boolean);
const pubText = async (b, url, wait) => { const { page } = await newPage(b); await page.goto(BASE + url); await page.waitForTimeout(wait || 9000); const t = await page.evaluate(() => document.body.innerText); await page.context().close(); return t; };
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const R = []; const ok = (n, c, d) => R.push((c ? 'PASS ' : 'FAIL ') + n + (d ? ' | ' + d : ''));
  // seed qua UI (products + categories + siteContent)
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  // ===== CATEGORY: add → sửa code/label → Lưu → public → tắt → public → xoá
  await page.goto(BASE + '/admin/categories.html'); await page.waitForTimeout(4500);
  await page.click('#addCategoryBtn'); await page.waitForTimeout(1500);
  let c = (await vals('categories')).find(x => x.label === 'Danh mục mới');
  await page.evaluate(id => { const row = document.querySelector(`[data-id="${id}"]`) || [...document.querySelectorAll('#categoryList > *')].pop(); row.querySelector('[data-field="code"]').value = 'mixer-test'; row.querySelector('[data-field="label"]').value = 'Mixer Test'; }, c.id);
  await page.evaluate(id => AdminCategories.save(id), c.id); await page.waitForTimeout(1500);
  c = await db('categories/' + c.id); ok('CATEGORY sửa+Lưu', c.code === 'mixer-test' && c.label === 'Mixer Test', JSON.stringify({ code: c.code, label: c.label }));
  let t = await pubText(b, '/category.html'); ok('CATEGORY hiện trên public', t.includes('Mixer Test'));
  await page.reload(); await page.waitForTimeout(4000);
  await page.evaluate(id => { const row = document.querySelector(`[data-id="${id}"]`) || [...document.querySelectorAll('#categoryList > *')].find(r => r.querySelector('[data-field="code"]') && r.querySelector('[data-field="code"]').value === 'mixer-test'); row.querySelector('[data-field="active"]').checked = false; }, c.id);
  await page.evaluate(id => AdminCategories.save(id), c.id); await page.waitForTimeout(1500);
  ok('CATEGORY tắt → DB active=false', (await db('categories/' + c.id)).active === false);
  t = await pubText(b, '/category.html'); ok('CATEGORY tắt → public ẩn', !t.includes('Mixer Test'));
  await page.evaluate(id => AdminCategories.remove(id), c.id); await page.waitForTimeout(1500);
  ok('CATEGORY xoá (bản ghi TEST, có confirm)', !(await db('categories/' + c.id)) && log.console.some(x => /confirm.*Xóa danh mục/.test(x)));
  // ===== SLIDER: thêm → đổi thứ tự → xoá → reload → public
  await page.goto(BASE + '/admin/sliders.html'); await page.waitForTimeout(4000);
  const n0 = (await db('siteContent/heroSlides') || []).length;
  await page.click('#addSlideBtn'); await page.waitForTimeout(500);
  await page.evaluate(() => { const n = document.querySelectorAll('#slideList > *').length; AdminSliders.setField(n - 1, 'title', 'SLIDE-MOI-TEST'); AdminSliders.setField(n - 1, 'image', 'https://x/slide.jpg'); });
  await page.click('#saveSlidesBtn'); await page.waitForTimeout(1500);
  let s = await db('siteContent/heroSlides'); ok('SLIDER thêm+Lưu', s.length === n0 + 1 && s[s.length - 1].title === 'SLIDE-MOI-TEST', 'slides ' + n0 + '→' + s.length);
  await page.evaluate(() => { const n = document.querySelectorAll('#slideList > *').length; AdminSliders.move(n - 1, -1); }); await page.click('#saveSlidesBtn'); await page.waitForTimeout(1500);
  s = await db('siteContent/heroSlides'); ok('SLIDER đổi thứ tự', s[s.length - 2].title === 'SLIDE-MOI-TEST');
  await page.reload(); await page.waitForTimeout(4000);
  ok('SLIDER reload giữ', (await page.evaluate(() => document.querySelector('#slideList').innerText)).includes('SLIDE-MOI-TEST') || JSON.stringify(await page.$$eval('#slideList input', i => i.map(x => x.value))).includes('SLIDE-MOI-TEST'));
  // ===== MENU: thêm → sửa → đổi thứ tự → xoá → public nav
  await page.goto(BASE + '/admin/menu.html'); await page.waitForSelector('#menuList input');
  await page.click('#addMenuItemBtn'); await page.waitForTimeout(300);
  await page.evaluate(() => { const n = document.querySelectorAll('#menuList > *').length; AdminMenu.setField(n - 1, 'label', 'MENU-TEST'); AdminMenu.setField(n - 1, 'link', 'blog.html'); });
  await page.click('#saveMenuBtn'); await page.waitForTimeout(1500);
  ok('MENU thêm+Lưu', JSON.stringify(await db('siteContent/menu')).includes('MENU-TEST'));
  t = await pubText(b, '/blog.html'); ok('MENU hiện trên public nav', t.includes('MENU-TEST'));
  await page.reload(); await page.waitForSelector('#menuList input');
  await page.evaluate(() => { const i = [...document.querySelectorAll('#menuList > *')].findIndex(r => [...r.querySelectorAll('input')].some(x => x.value === 'MENU-TEST')); AdminMenu.remove(i); });
  await page.click('#saveMenuBtn'); await page.waitForTimeout(1500);
  ok('MENU xoá+Lưu', !JSON.stringify(await db('siteContent/menu')).includes('MENU-TEST'));
  // ===== FOOTER → public
  await page.goto(BASE + '/admin/footer.html'); await page.waitForTimeout(4000); await page.fill('#footerCopyText', '© FOOTER-TEST-2026'); await page.click('#saveFooterBtn'); await page.waitForTimeout(1500);
  t = await pubText(b, '/blog.html'); ok('FOOTER → public', t.includes('FOOTER-TEST-2026'));
  // ===== SETTINGS phone → public
  await page.goto(BASE + '/admin/settings.html'); await page.waitForTimeout(4000); await page.fill('#setPhone', '0987654321'); await page.click('#saveSettingsBtn'); await page.waitForTimeout(1500);
  t = await pubText(b, '/'); ok('SETTINGS phone → public trang chủ', t.includes('0987654321') || t.includes('0987 654 321') || t.includes('098.765.4321'), 'DB ' + JSON.stringify((await db('siteContent/settings') || {}).phone));
  R.forEach(r => console.log(r)); console.log('errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
