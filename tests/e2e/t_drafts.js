const { launch, newPage, login, BASE } = require('./cms');
const db = (p) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
(async () => { const b = await launch(); const { page, log } = await newPage(b);
  await login(page, 'admin@test.local'); await page.goto(BASE + '/admin/ai/drafts.html'); await page.waitForTimeout(5000);
  const before = await db('products/41');
  console.log('drafts rendered:', await page.$$eval('#draftsList .panel', p => p.length));
  for (const id of ['dBad', 'dPart', 'dBan']) {
    log.console.length = 0;
    await page.evaluate(i => AdminAI.publishDraft(i), id); await page.waitForTimeout(2500);
    const d = await db('aiDrafts/' + id);
    console.log(id, '→ draft status', d.status, '| dialogs', JSON.stringify(log.console.filter(c => c.startsWith('[dialog'))).slice(0, 160));
  }
  const after = await db('products/41');
  const changed = Object.keys(Object.assign({}, before, after)).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  console.log('product 41 changed fields:', JSON.stringify(changed), '| name kept', after.name === before.name, '| _productName leaked', '_productName' in after);
  const ban = Object.values(await db('banners')).find(x => x.title === 'AI banner test'); console.log('AI banner active:', ban && ban.active, 'order', ban && ban.order);
  console.log('errors', JSON.stringify(log.errors)); await b.close(); })();
