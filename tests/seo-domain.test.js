// P1 SEO/DOMAIN — domain Production là https://pshopmusic.com.
// Kiểm tra: không còn psh.vn trong trang public/sitemap/robots; canonical +
// og:url đúng domain; sitemap.xml là XML hợp lệ (khai báo XML ở byte đầu),
// mọi <loc> trỏ tới file có thật, mọi trang product-*.html đều có trong sitemap.
// Chạy: node tests/seo-domain.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://pshopmusic.com';
const pub = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f) && !/^google/.test(f) && f !== 'admin.html');
const errs = [];
for (const f of pub.concat(['sitemap.xml', 'robots.txt'])) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/psh\.vn/.test(s)) errs.push(f + ': còn psh.vn');
  const canon = s.match(/<link rel="canonical" href="([^"]+)"/);
  if (canon && canon[1].indexOf(DOMAIN) !== 0) errs.push(f + ': canonical sai domain ' + canon[1]);
  const og = s.match(/<meta property="og:url" content="([^"]+)"/);
  if (og && og[1].indexOf(DOMAIN) !== 0) errs.push(f + ': og:url sai domain ' + og[1]);
}
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (!sm.startsWith('<?xml')) errs.push('sitemap.xml: khai báo XML không nằm ở byte đầu (XML không hợp lệ)');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (new Set(locs).size !== locs.length) errs.push('sitemap.xml: URL trùng lặp');
for (const l of locs) {
  if (l.indexOf(DOMAIN + '/') !== 0) { errs.push('sitemap loc sai domain: ' + l); continue; }
  const file = l.slice(DOMAIN.length + 1).split('?')[0] || 'index.html';
  if (!fs.existsSync(path.join(ROOT, file))) errs.push('sitemap loc trỏ file không tồn tại: ' + l);
}
for (const p of pub.filter(f => /^product-/.test(f))) {
  if (locs.indexOf(DOMAIN + '/' + p) === -1) errs.push('sitemap thiếu ' + p);
}
if (!/^Sitemap: https:\/\/pshopmusic\.com\/sitemap\.xml$/m.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'))) errs.push('robots.txt: Sitemap sai');
assert.deepStrictEqual(errs, [], errs.join('\n'));
console.log('seo-domain: OK —', pub.length, 'trang public,', locs.length, 'URL sitemap');
