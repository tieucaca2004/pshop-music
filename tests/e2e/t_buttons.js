const { launch, newPage, login, BASE } = require('./cms'); const fs = require('fs');
const pages = fs.readFileSync(process.env.E2E_PAGES || (__dirname + '/pages.txt'), 'utf8').trim().split('\n').filter(p => !/platform\/workspace\/(ai|categories|cms|customers|media|orders|products|reports|settings|team)\.html/.test(p));
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  const report = [];
  for (const p of pages) {
    await page.goto(BASE + '/' + p).catch(() => {}); await page.waitForTimeout(3000);
    const n = await page.$$eval('button:visible, [role=button]:visible', els => els.length).catch(() => 0);
    const bad = []; let clicked = 0;
    for (let i = 0; i < Math.min(n, 40); i++) {
      if (!page.url().startsWith(BASE + '/' + p.replace(/index\.html$/, ''))) { await page.goto(BASE + '/' + p).catch(() => {}); await page.waitForTimeout(2000); }
      const btns = await page.$$('button:visible, [role=button]:visible'); const el = btns[i]; if (!el) break;
      const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('id')) || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      if (/đăng xuất|logout|sign out|thoát/i.test(label)) continue;
      log.errors.length = 0;
      await el.click({ timeout: 3000 }).catch(() => {}); clicked++;
      await page.waitForTimeout(700);
      if (log.errors.length) bad.push(`"${label}": ${[...new Set(log.errors)][0].slice(0, 120)}`);
    }
    report.push(`${p} | buttons ${n}, clicked ${clicked}` + (bad.length ? ' | ERR ' + bad.join(' ;; ') : ''));
  }
  report.forEach(r => console.log(r)); await b.close(); })();
