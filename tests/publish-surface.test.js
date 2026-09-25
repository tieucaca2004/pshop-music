// Kiểm tra publish surface của netlify.toml (publish = ".").
// Mô phỏng thứ tự khớp redirect của Netlify (rule đầu tiên khớp thắng) cho
// TỪNG file đang được git track:
//   - File nội bộ/nhạy cảm → phải khớp 1 rule force 404.
//   - Asset site thật (HTML public, css/, js/, admin/, psh/, platform/...) →
//     KHÔNG được bị chặn.
// Chạy: node tests/publish-surface.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

// Parser tối giản chỉ cho các khối [[redirects]].
const rules = toml.split('[[redirects]]').slice(1).map(block => {
  const get = k => { const m = block.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+)$', 'm')); return m ? m[1].trim().replace(/^"|"$/g, '') : undefined; };
  return { from: get('from'), status: Number(get('status')), force: get('force') === 'true' };
});

function firstMatch(urlPath) {
  return rules.find(r => {
    if (r.from.endsWith('/*')) return urlPath.startsWith(r.from.slice(0, -1));
    return urlPath === r.from;
  });
}
function isBlocked(urlPath) {
  const r = firstMatch(urlPath);
  return !!(r && r.force && r.status === 404);
}

const files = execSync('git ls-files -z', { cwd: ROOT }).toString().split('\0').filter(Boolean);

const PUBLIC_DIRS = ['css/', 'js/', 'admin/', 'psh/', 'platform/', 'console/', 'data/'];
const PUBLIC_ROOT = f => !f.includes('/') && /\.(html|xml|txt)$/.test(f);
const SENSITIVE = [
  /^n8n-data\//, /^backups\//, /^functions\//, /^scripts\//, /^atieu\.com\//,
  /^memory\//, /^node_modules\//, /^docs\//, /^health-center\//, /^templates\//,
  /^\.netlify\//, /^\.claude\//, /^[^/]+\.md$/, /^[^/]+\.pdf$/, /^[^/]+\.json$/,
  /^[^/]+\.ya?ml$/, /^[^/]+\.rules$/, /^\.firebaserc$/, /^netlify\.toml$/,
  /^[^/]+\.js$/
];

let checked = 0;
const failures = [];
for (const f of files) {
  const url = '/' + f;
  if (PUBLIC_ROOT(f) || PUBLIC_DIRS.some(d => f.startsWith(d))) {
    if (isBlocked(url)) failures.push('Asset public bị chặn nhầm: ' + url);
    checked++;
  } else if (SENSITIVE.some(re => re.test(f))) {
    if (!isBlocked(url)) failures.push('File nội bộ KHÔNG bị chặn: ' + url);
    checked++;
  }
}
// Đường dẫn nhạy cảm cụ thể trong báo cáo audit (kể cả khi file đã bị gỡ khỏi git
// nhưng còn trên máy deploy của Founder).
['/n8n-data/config', '/n8n-data/database.sqlite', '/hợp đồng thuê xe.pdf',
 '/backups/products-20260720-162739.json', '/CLAUDE.md', '/functions/index.js',
 '/atieu.com/index.html', '/netlify.toml', '/firebase.json', '/storage.rules']
  .forEach(u => { if (!isBlocked(u)) failures.push('Path audit KHÔNG bị chặn: ' + u); });
['/', '/index.html', '/category.html', '/css/style.css', '/js/app.js', '/admin/login.html',
 '/psh/platform/index.html', '/robots.txt', '/sitemap.xml']
  .forEach(u => { if (isBlocked(u)) failures.push('Path public bị chặn nhầm: ' + u); });

assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log('publish-surface: OK —', checked, 'file tracked đã kiểm tra,', rules.length, 'rules');
