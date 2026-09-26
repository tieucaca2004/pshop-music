const { launch, newPage, BASE } = require('./cms');
(async () => { const b = await launch();
  for (const u of ['/blog.html', '/videos.html', '/blog-post.html?slug=x', '/', '/category.html']) {
    const { page, log } = await newPage(b); await page.goto(BASE + u); await page.waitForTimeout(10000);
    const t = await page.evaluate(() => document.body.innerText);
    console.log(u.padEnd(24), 'footer CMS:', t.includes('FOOTER-TEST-2026'), '| errors', JSON.stringify(log.errors));
    await page.context().close();
  } await b.close(); })();
