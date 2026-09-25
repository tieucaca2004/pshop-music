const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local'); const fails = [];
  for (let r = 1; r <= 10; r++) {
    await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3000);
    await page.click('#bImagePreview button.link-btn >> nth=0'); await page.waitForTimeout(1200);
    await page.setInputFiles('#medialibUploadInput', { name: `ảnh vòng ${r}.png`, mimeType: 'image/png', buffer: require('fs').readFileSync((process.env.E2E_FILES || __dirname) + '/big.png') });
    await page.waitForFunction(() => document.getElementById('bImage').value, null, { timeout: 15000 }).catch(() => {});
    const url = await page.inputValue('#bImage'); if (!url) { fails.push(`R${r} upload không trả URL về form`); continue; }
    await page.fill('#bTitle', 'MEDIA-R' + r); await page.click('#bannerSaveBtn'); await page.waitForTimeout(1500);
    const bn = Object.values(await db('banners') || {}).find(x => x.title === 'MEDIA-R' + r);
    if (!bn || bn.image !== url) { fails.push(`R${r} DB image ≠ form`); continue; }
    const st = await page.request.get(url).then(x => x.status()); if (st !== 200) fails.push(`R${r} GET ${st}`);
    await page.reload(); await page.waitForTimeout(3000);
    await page.evaluate(id => AdminBanners.edit(id), bn.id); await page.waitForTimeout(600);
    if ((await page.inputValue('#bImage')) !== url) fails.push(`R${r} reload→Sửa: form image khác DB`);
  }
  console.log('Media 10 vòng — lỗi:', fails.length); fails.forEach(f => console.log('  ✘', f)); console.log('errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
