const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const put = (p, v) => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', { method: 'PUT', body: JSON.stringify(v), ...H });
const prods = async () => Object.values(await db('products') || {}).filter(Boolean);
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  // 1) DOUBLE CLICK SAVE (sản phẩm mới)
  const n0 = (await prods()).length;
  await page.fill('#pName', 'DBL-2'); await page.check('#pCategoriesList input[type=checkbox] >> nth=0');
  await page.dblclick('#saveBtn'); await page.waitForTimeout(2500);
  const dbl = (await prods()).filter(p => p.name === 'DBL-2');
  console.log('DOUBLE-CLICK: records created', dbl.length, 'ids', JSON.stringify(dbl.map(p => p.id)), '| total', n0, '→', (await prods()).length);
  // 2) HAI LƯỢT TẠO ĐỒNG THỜI (2 tab) → cùng id?
  const p2 = await b.newPage(); await p2.route('**/*', r => page.context().route ? r.continue() : r.continue());
  const all0 = await prods(); const before = all0.length;
  await Promise.all([
    page.evaluate(() => DB.add({ name: 'RACE-A2', pubStatus: 'draft' })),
    page.evaluate(() => DB.add({ name: 'RACE-B2', pubStatus: 'draft' }))
  ]);
  const after = await prods(); console.log('CONCURRENT DB.add: A exists', after.some(p => p.name === 'RACE-A2'), '| B exists', after.some(p => p.name === 'RACE-B2'), '| total', before, '→', after.length);
  // 3) PERMISSION LOST → SAVE
  log.console.length = 0; log.errors.length = 0;
  await put('roles/uid_admin/role', 'agent');
  await page.fill('#pName', 'NOPERM-2'); await page.check('#pCategoriesList input[type=checkbox] >> nth=0');
  await page.click('#saveBtn'); await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const e = document.getElementById('formStatus'); return e.style.display + '|' + e.textContent; });
  console.log('SAVE khi mất quyền: DB có?', (await prods()).some(p => p.name === 'NOPERM-2'), '| UI status:', st, '| form name còn:', await page.inputValue('#pName'), '| pageerrors', JSON.stringify(log.errors).slice(0, 150), '| dialogs', JSON.stringify(log.console.filter(c => c.startsWith('[dialog'))));
  await put('roles/uid_admin/role', 'admin');
  await b.close(); })();
