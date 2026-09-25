const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const vals = async p => Object.values(await db(p) || {}).filter(Boolean);
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const R = [];
  // BANNER create → edit
  await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3500);
  await page.fill('#bTitle', 'BN-E1'); await page.evaluate(() => { document.getElementById('bImage').value = 'https://x/1.jpg'; }); await page.click('#bannerSaveBtn'); await page.waitForTimeout(1500);
  let bn = (await vals('banners')).find(x => x.title === 'BN-E1');
  await page.reload(); await page.waitForTimeout(3000);
  await page.evaluate(id => { const e = [...document.querySelectorAll('#bannerTableBody [onclick]')].find(x => x.getAttribute('onclick').includes(id) && !/remove|Xóa/i.test(x.getAttribute('onclick') + x.innerText)); e && e.click(); }, bn.id); await page.waitForTimeout(500);
  await page.fill('#bTitle', 'BN-E1 sửa'); await page.fill('#bLink', '/blog.html'); await page.click('#bannerSaveBtn'); await page.waitForTimeout(1500);
  bn = await db('banners/' + bn.id); R.push('BANNER edit: ' + (bn.title === 'BN-E1 sửa' && bn.link === '/blog.html' && bn.image === 'https://x/1.jpg' ? 'OK' : 'FAIL ' + JSON.stringify(bn)) + ' | total records ' + (await vals('banners')).filter(x => /BN-E1/.test(x.title)).length);
  // VIDEO create → edit
  await page.goto(BASE + '/admin/videos.html'); await page.waitForTimeout(3500);
  await page.fill('#vTitle', 'VD-E1'); await page.fill('#vUrl', 'https://youtu.be/dQw4w9WgXcQ'); await page.click('#videoSaveBtn'); await page.waitForTimeout(1500);
  let vd = (await vals('videos')).find(x => x.title === 'VD-E1'); await page.reload(); await page.waitForTimeout(3000);
  await page.evaluate(id => { const e = [...document.querySelectorAll('#videoTableBody [onclick]')].find(x => x.getAttribute('onclick').includes(id) && !/remove|Xóa/i.test(x.getAttribute('onclick') + x.innerText)); e && e.click(); }, vd.id); await page.waitForTimeout(500);
  await page.fill('#vTitle', 'VD-E1 sửa'); await page.click('#videoSaveBtn'); await page.waitForTimeout(1500);
  vd = await db('videos/' + vd.id); R.push('VIDEO edit: ' + (vd.title === 'VD-E1 sửa' && /dQw4/.test(vd.url) ? 'OK' : 'FAIL ' + JSON.stringify(vd)));
  // SLIDER edit field → save → reload
  await page.goto(BASE + '/admin/sliders.html'); await page.waitForTimeout(3500);
  const before = await db('siteContent/heroSlides'); const ok0 = Array.isArray(before) && before.length;
  await page.evaluate(() => { const i = document.querySelector('#slideList input[type=text]'); i.value = 'SLIDE-TIEU-DE-SUA'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#saveSlidesBtn'); await page.waitForTimeout(1500);
  const after = JSON.stringify(await db('siteContent/heroSlides')); R.push('SLIDER edit persisted: ' + (after.includes('SLIDE-TIEU-DE-SUA') ? 'OK' : 'FAIL') + ' (slides ' + (ok0 || 0) + ')');
  // MENU edit label
  await page.goto(BASE + '/admin/menu.html'); await page.waitForSelector('#menuList input'); await page.fill('#menuList input >> nth=0', 'MENU-EDIT-OK'); await page.click('#saveMenuBtn'); await page.waitForTimeout(1500);
  R.push('MENU edit persisted: ' + (JSON.stringify(await db('siteContent/menu')).includes('MENU-EDIT-OK') ? 'OK' : 'FAIL'));
  // FOOTER copy text
  await page.goto(BASE + '/admin/footer.html'); await page.waitForTimeout(3500); await page.fill('#footerCopyText', '© TEST FOOTER'); await page.click('#saveFooterBtn'); await page.waitForTimeout(1500);
  R.push('FOOTER edit persisted: ' + ((await db('siteContent/footer/copyText')) === '© TEST FOOTER' ? 'OK' : 'FAIL'));
  R.push('menu vẫn còn sau khi lưu footer: ' + (JSON.stringify(await db('siteContent/menu')).includes('MENU-EDIT-OK') ? 'OK' : 'FAIL'));
  R.forEach(r => console.log(r)); console.log('errors', JSON.stringify([...new Set(log.errors)]), 'dialogs', JSON.stringify(log.console.filter(c => c.startsWith('[dialog'))));
  await b.close(); })();
