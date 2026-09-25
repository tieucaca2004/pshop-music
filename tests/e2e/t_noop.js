const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
function diff(a, b) { const out = {}; new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(k => { if (['updatedAt', 'createdAt'].includes(k)) return; if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = [a[k], b[k]]; }); return out; }
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(4000);
  const all = Object.values(await db('products')).filter(Boolean); const stats = {}; let changedProducts = 0;
  for (const p of all) {
    const before = await db('products/' + p.id);
    await page.evaluate(id => AdminApp.editProduct(id), p.id);
    const hasCat = await page.$$eval('#pCategoriesList input:checked', x => x.length); if (!hasCat) { stats['(không lưu được: SP không có danh mục)'] = (stats['(không lưu được: SP không có danh mục)'] || 0) + 1; await page.evaluate(() => AdminApp.resetForm()); continue; }
    await page.click('#saveBtn'); await page.waitForTimeout(900);
    const d = diff(before, await db('products/' + p.id));
    if (Object.keys(d).length) changedProducts++;
    Object.entries(d).forEach(([k, v]) => { const key = k + ': ' + String(JSON.stringify(v[0])).slice(0, 40) + ' → ' + String(JSON.stringify(v[1])).slice(0, 40); const sig = k + ' ' + typeof v[0] + '→' + typeof v[1]; stats[sig] = stats[sig] || { n: 0, ex: key }; stats[sig].n++; });
  }
  console.log('Sản phẩm:', all.length, '| bị đổi dữ liệu khi Lưu không sửa gì:', changedProducts);
  Object.entries(stats).sort((a, b) => (b[1].n || b[1]) - (a[1].n || a[1])).forEach(([k, v]) => console.log('  ', k, '×', v.n || v, '| ví dụ', v.ex || ''));
  console.log('errors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
