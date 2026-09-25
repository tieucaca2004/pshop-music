const { launch, newPage, login, BASE } = require('./cms');
const ADMIN_ONLY = ['/admin/menu.html','/admin/footer.html','/admin/seo.html','/admin/settings.html','/admin/users.html','/admin/facebook-settings.html','/admin/ai/providers.html','/admin/ai/plugins.html'];
const NORMAL = ['/admin/products.html','/admin/blog.html','/admin/ai/drafts.html','/psh/platform/media-center/','/admin/ai/agent.html'];
(async () => { const b = await launch();
  for (const who of [null]) {
    const { page, log } = await newPage(b); if (who) await login(page, who);
    const out = [];
    for (const u of ['/admin/settings.html'].concat(NORMAL)) { log.console.length = 0; log.errors.length = 0;
      await page.goto(BASE + u).catch(()=>{}); await page.waitForTimeout(3500);
      const f = page.url().replace(BASE, ''); const side = ((await page.textContent('#adminSidebar').catch(()=>'')) || '').replace(/\s+/g,' ').slice(0, 60);
      out.push(`${u} → ${f === u ? 'STAY' : f} ${log.console.filter(c=>c.startsWith('[dialog')).join(' ').slice(0,70)} ${log.errors.length ? 'ERR ' + log.errors[0] : ''} ${f === u ? '| ' + side : ''}`);
    }
    console.log('=== ' + (who || 'LOGGED OUT')); out.forEach(o => console.log('  ' + o));
  }
  await b.close(); })();
