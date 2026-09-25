const { launch, newPage, login, BASE } = require('./cms');
const H = { headers: { Authorization: 'Bearer owner' } };
const db = p => fetch('http://127.0.0.1:9000/' + p + '.json?ns=pshop-music-default-rtdb', H).then(r => r.json());
const list = async p => Object.values(await db(p) || {}).filter(Boolean);
const LONG = 'Mô tả dài ' + 'Đàn ông nói “xin chào” & <b>tag</b> 😀 '.repeat(200);
(async () => { const b = await launch(); const { page, log } = await newPage(b); await login(page, 'admin@test.local');
  const fails = [];
  for (let r = 11; r <= 30; r++) {
    // ---------- PRODUCT ----------
    await page.goto(BASE + '/admin/products.html'); await page.waitForTimeout(3500);
    const name = `SP vòng ${r} — Âm thanh "Đỉnh" #${r}`;
    await page.fill('#pName', name); await page.check('#pCategoriesList input[type=checkbox] >> nth=0');
    await page.fill('#pPrice', String(1000000 + r)); await page.fill('#pSeoTitle', 'SEO ' + r); await page.fill('#pSlug', 'sp-vong-' + r);
    await page.evaluate(v => { document.getElementById('pImages').value = v; }, `https://cdn.test/anh ${r}.jpg`); await page.fill('#pSpecifications', LONG.slice(0, 3000));
    await page.click('#pDescriptionEditor .ql-editor'); await page.keyboard.type('Mô tả vòng ' + r);
    await page.click('#saveBtn'); await page.waitForTimeout(1800);
    let P = (await list('products')).find(p => p.name === name);
    if (!P) { fails.push(`R${r} PRODUCT create: không có trong DB | dialogs ${JSON.stringify(log.console.filter(c=>c.startsWith('[dialog')).slice(-1))}`); continue; }
    await page.reload(); await page.waitForTimeout(3500);
    await page.evaluate(id => AdminApp.editProduct(id), P.id);
    const f1 = await page.evaluate(() => ['pName','pPrice','pSeoTitle','pSlug','pImages'].map(i => document.getElementById(i).value));
    const exp1 = [name, String(1000000 + r), 'SEO ' + r, 'sp-vong-' + r, `https://cdn.test/anh ${r}.jpg`];
    if (JSON.stringify(f1) !== JSON.stringify(exp1)) fails.push(`R${r} PRODUCT reload form ≠ saved: ${JSON.stringify(f1)}`);
    if ((P.specifications || '').length !== 3000 && (P.specifications || '').trim() !== LONG.slice(0,3000).trim()) fails.push(`R${r} PRODUCT specs length ${P.specifications && P.specifications.length}`);
    await page.fill('#pPrice', String(2000000 + r)); await page.fill('#pSeoTitle', 'SEO sửa ' + r);
    await page.click('#saveBtn'); await page.waitForTimeout(1800);
    P = await db('products/' + P.id);
    if (P.price !== String(2000000 + r) || P.seoTitle !== 'SEO sửa ' + r || P.name !== name || P.slug !== 'sp-vong-' + r || !/Mô tả vòng/.test(P.description || '')) fails.push(`R${r} PRODUCT edit persist: ${JSON.stringify({ price: P.price, seo: P.seoTitle, slug: P.slug, desc: (P.description||'').slice(0,30) })}`);
    // ---------- BLOG ----------
    await page.goto(BASE + '/admin/blog.html'); await page.waitForTimeout(3500);
    const title = `Bài vòng ${r}: Hướng dẫn “chọn loa” & mixer`;
    await page.fill('#postTitle', title); await page.fill('#postExcerpt', 'Tóm tắt ' + r); await page.fill('#postSeoTitle', 'Blog SEO ' + r);
    await page.selectOption('#postStatus', r % 2 ? 'draft' : 'published').catch(() => {});
    await page.click('#postContentEditor .ql-editor'); await page.keyboard.type('Nội dung vòng ' + r + ' — tiếng Việt có dấu.');
    await page.click('#blogSaveBtn'); await page.waitForTimeout(1800);
    let B = (await list('blogPosts')).find(x => x.title === title);
    if (!B) { fails.push(`R${r} BLOG create: không có trong DB`); continue; }
    const dup = (await list('blogPosts')).filter(x => x.title === title).length; if (dup !== 1) fails.push(`R${r} BLOG duplicate ${dup}`);
    await page.reload(); await page.waitForTimeout(3500);
    await page.evaluate(id => { const btn = [...document.querySelectorAll('#blogTableBody button, #blogTableBody a')].find(e => (e.getAttribute('onclick') || '').includes(id) && /edit|Sửa/i.test((e.getAttribute('onclick') || '') + e.innerText)); if (btn) btn.click(); }, B.id);
    await page.waitForTimeout(600);
    const bf = await page.evaluate(() => [document.getElementById('postTitle').value, document.getElementById('postSlug').value, document.querySelector('#postContentEditor .ql-editor').innerText.trim()]);
    if (bf[0] !== title || bf[1] !== B.slug || !/Nội dung vòng/.test(bf[2])) fails.push(`R${r} BLOG reload form: ${JSON.stringify(bf)} db slug ${B.slug}`);
    await page.fill('#postTitle', title + ' (sửa)'); await page.click('#postContentEditor .ql-editor'); await page.keyboard.press('End'); await page.keyboard.type(' Thêm câu.');
    await page.click('#blogSaveBtn'); await page.waitForTimeout(1800);
    B = await db('blogPosts/' + B.id);
    if (B.title !== title + ' (sửa)' || !/Thêm câu/.test(B.contentHtml || '') || !/Nội dung vòng/.test(B.contentHtml || '')) fails.push(`R${r} BLOG edit persist: ${JSON.stringify({ t: B.title, c: (B.contentHtml||'').slice(0,60), slug: B.slug })}`);
  }
  console.log('20 vòng (11-30) xong. Lỗi:', fails.length); fails.forEach(f => console.log('  ✘ ' + f));
  console.log('pageerrors', JSON.stringify([...new Set(log.errors)]));
  await b.close(); })();
