const { launch, newPage, login, BASE } = require('./cms'); const fs = require('fs');
const who = process.argv[2] || 'admin@test.local';
(async () => {
  const b = await launch(); const { page, log } = await newPage(b);
  await login(page, who); await page.waitForTimeout(1500);
  const out = [];
  for (const p of fs.readFileSync(process.env.E2E_PAGES || (__dirname + '/pages.txt'), 'utf8').trim().split('\n')) {
    log.errors.length = 0; log.console.length = 0; log.http.length = 0; log.blocked.clear();
    const target = BASE + '/' + p;
    try { await page.goto(target, { waitUntil: 'load', timeout: 20000 }); } catch (e) { log.errors.push('goto ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(3500);
    const final = page.url().replace(BASE, '');
    const text = (await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')).replace(/\s+/g, ' ');
    out.push({ p, final: final === '/' + p ? '' : final, len: text.length, errors: [...new Set(log.errors)], http: [...new Set(log.http)],
      blocked: [...log.blocked].filter(h => !/fonts\.|gstatic|googleapis\.com$/.test(h)), cerr: [...new Set(log.console.filter(c => !/ERR_FAILED|fonts/.test(c)))].slice(0, 3), head: text.slice(0, 90) });
  }
  fs.writeFileSync((process.env.E2E_OUT || '/tmp') + '/sweep-' + who.split('@')[0] + '.json', JSON.stringify(out, null, 1));
  for (const r of out) if (r.final || r.errors.length || r.http.length || r.cerr.length || r.len < 60) console.log(JSON.stringify(r));
  console.log('pages', out.length); await b.close();
})();
