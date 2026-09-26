const { launch, newPage, BASE } = require('./cms');
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  for (const u of ['/product-lexar-p30-128gb.html', '/blog-post.html?slug=bai-seo']) {
    await page.goto(BASE + u); await page.waitForTimeout(10000);
    console.log(u, JSON.stringify(await page.evaluate(() => ({ title: document.title, desc: (document.querySelector('meta[name=description]') || {}).content, og: (document.querySelector('meta[property="og:title"]') || {}).content, canon: (document.querySelector('link[rel=canonical]') || {}).href }))), JSON.stringify(log.errors));
  } await b.close(); })();
