const { launch, newPage, BASE } = require('./cms');
(async () => { const b = await launch(); const { page } = await newPage(b);
  await page.goto(BASE + '/'); await page.waitForTimeout(10000);
  console.log('HOME tel links:', JSON.stringify(await page.$$eval('a[href^="tel:"]', a => a.map(x => x.getAttribute('href') + ' / ' + x.textContent.trim()))));
  await page.goto(BASE + '/category.html'); await page.waitForTimeout(10000);
  console.log('CATEGORY filter buttons:', JSON.stringify(await page.$$eval('.filter-btn', a => a.map(x => x.textContent.trim() + (x.offsetParent ? '' : '(ẩn)')))));
  await b.close(); })();
