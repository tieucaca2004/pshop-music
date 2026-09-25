const { launch, newPage, login, BASE } = require('./cms'); const fs=require('fs');
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  // Mô phỏng rewrite Netlify mới: /workspace/* → /console/workspace.html (status 200, giữ URL)
  await page.route(/\/workspace\/[^.]*$/, r => r.fulfill({ body: fs.readFileSync('/home/user/pshop-music/console/workspace.html','utf8'), contentType: 'text/html' }));
  await login(page, 'admin@test.local');
  for (const p of ['/workspace/b1', '/workspace/b1/products', '/platform/workspace/files.html', '/platform/workspace/media-library.html']) {
    log.errors.length = 0; await page.goto(BASE + p); await page.waitForTimeout(3000);
    console.log(p, '→', page.url().replace(BASE,''), '| errors:', JSON.stringify([...new Set(log.errors)]), '|', (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,80));
  }
  await b.close(); })();
