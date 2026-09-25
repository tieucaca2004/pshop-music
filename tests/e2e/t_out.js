const { launch, newPage, BASE } = require('./cms');
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  const navs = []; page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url().replace(BASE, '')); });
  for (const u of [process.argv[2]]) {
    await page.goto(BASE + u, { timeout: 15000 }).catch(e => console.log('goto err', e.message.split('\n')[0]));
    await page.waitForTimeout(6000);
    console.log(u, 'navs:', navs.length, JSON.stringify(navs.slice(0, 8)), 'errors', JSON.stringify(log.errors.slice(0,3)));
  }
  await b.close(); })();
