// P1 CACHE — netlify.toml đặt /css/* và /js/* "immutable" 1 năm, nên MỌI
// tham chiếu css/js cục bộ trong HTML phải có ?v=<version> và dùng CÙNG 1
// version (bump đồng loạt khi deploy), nếu không trình duyệt giữ bản cũ.
// Chạy: node tests/cache-bust.test.js
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const html = execSync('git ls-files "*.html"', { cwd: ROOT }).toString().split('\n').filter(Boolean)
  .filter(f => !/^(node_modules|atieu\.com|wordpress-theme|docs|templates|fb-comment-agent|restaurant-workflow|health-center)\//.test(f));
const missing = [];
const versions = new Set();
let refs = 0;
for (const f of html) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /(?:href|src)="(\/?(?:css|js)\/[^"]+\.(?:css|js))(\?v=([^"&]+))?"/g;
  let m;
  while ((m = re.exec(src))) {
    refs++;
    if (!m[3]) missing.push(f + ' → ' + m[1]); else versions.add(m[3]);
  }
}
assert.deepStrictEqual(missing, [], 'Thiếu ?v=:\n' + missing.join('\n'));
assert.strictEqual(versions.size, 1, 'Nhiều version cache-bust khác nhau: ' + [...versions].join(', '));
console.log('cache-bust: OK —', refs, 'tham chiếu css/js trong', html.length, 'file HTML, version', [...versions][0]);
