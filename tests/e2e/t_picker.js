const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  for (const [f, t] of [['ảnh loa đỏ.png', 'Banner tên TV'], ['big.png', 'Banner ảnh lớn']]) {
    await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3500);
    await page.click('#bImagePreview button.link-btn >> nth=0'); await page.waitForSelector('#medialibGrid', { timeout: 8000 });
    await page.setInputFiles('#medialibUploadInput', { name: f, mimeType: 'image/png', buffer: require('fs').readFileSync((process.env.E2E_FILES || __dirname) + '/' + f) }); await page.waitForTimeout(5000);
    const url = await page.inputValue('#bImage');
    await page.fill('#bTitle', t); await page.click('#bannerSaveBtn'); await page.waitForTimeout(2000);
    const bn = Object.values(await db('banners') || {}).find(x => x.title === t);
    const st = await page.request.get(url).then(r => r.status()).catch(e => 'ERR');
    await page.reload(); await page.waitForTimeout(3500);
    const inTable = await page.$$eval('#bannerTableBody img', (i, u) => i.some(x => x.src === u), url).catch(() => 'n/a');
    console.log(f, '| form URL', url ? 'OK' : 'EMPTY', '| DB==form', !!bn && bn.image === url, '| GET', st, '| sau reload hiện trong bảng', inTable);
  }
  // Chọn ảnh CÓ SẴN trong thư viện (không upload)
  await page.goto(BASE + '/admin/banners.html'); await page.waitForTimeout(3500);
  await page.click('#bImagePreview button.link-btn >> nth=0'); await page.waitForTimeout(3000);
  await page.click('#medialibGrid .medialib-grid-thumb >> nth=0'); await page.waitForTimeout(800);
  console.log('Chọn ảnh có sẵn → bImage', (await page.inputValue('#bImage')) ? 'OK' : 'EMPTY', '| errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
