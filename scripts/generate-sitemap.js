/*
 * Regenerates sitemap.xml from live Firebase data (products, published blog
 * posts) plus the static pages. Run manually after adding/removing content:
 *   node scripts/generate-sitemap.js
 * Uses only the public read-only REST endpoint of Realtime Database (no
 * credentials needed — same data the public site already reads).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_URL = 'https://pshopmusic.com';
const configPath = path.join(__dirname, '..', 'js', 'firebase-config.js');
const configText = fs.readFileSync(configPath, 'utf8');
const dbUrlMatch = configText.match(/databaseURL:\s*"([^"]+)"/);
if (!dbUrlMatch) { console.error('Không tìm thấy databaseURL trong js/firebase-config.js'); process.exit(1); }
const DB_URL = dbUrlMatch[1].replace(/\/$/, '');

function fetchJson(nodeName) {
  return new Promise((resolve, reject) => {
    https.get(`${DB_URL}/${nodeName}.json`, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) || {}); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function urlEntry(loc, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;
}

Promise.all([fetchJson('categories'), fetchJson('blogPosts')]).then(([categories, blogPosts]) => {
  const urls = [
    urlEntry(`${SITE_URL}/index.html`, '1.0'),
    urlEntry(`${SITE_URL}/blog.html`, '0.8'),
    urlEntry(`${SITE_URL}/videos.html`, '0.6')
  ];

  Object.values(categories || {}).forEach(c => {
    if (c && c.code) urls.push(urlEntry(`${SITE_URL}/category.html?cat=${encodeURIComponent(c.code)}`, '0.8'));
  });

  Object.values(blogPosts || {}).forEach(p => {
    if (p && p.slug && p.status === 'published') {
      urls.push(urlEntry(`${SITE_URL}/blog-post.html?slug=${encodeURIComponent(p.slug)}`, '0.6'));
    }
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'), xml, 'utf8');
  console.log(`Đã tạo sitemap.xml với ${urls.length} URL.`);
}).catch(err => {
  console.error('Lỗi khi tạo sitemap:', err.message);
  process.exit(1);
});
