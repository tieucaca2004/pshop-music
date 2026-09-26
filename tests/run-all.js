// Chạy toàn bộ test Node (không cần emulator). Test Rules (storage/database)
// cần Firebase Emulator — chạy riêng, xem đầu file tests/storage-rules.test.js.
// Chạy: npm test   (hoặc node tests/run-all.js)
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const EMULATOR_ONLY = ['storage-rules.test.js', 'database-rules.test.js', 'registration-security.test.js', 'custom-claims-security.test.js'];
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && !EMULATOR_ONLY.includes(f)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  const ok = r.status === 0 && !/FAILED/.test(r.stdout);
  if (!ok) failed++;
  console.log((ok ? '✔ ' : '✘ ') + f + ' — ' + (ok ? last : (r.stderr || r.stdout).trim().split('\n').slice(0, 5).join(' | ')));
}
// Syntax: node --check mọi file JS site + Cloud Functions (trừ node_modules).
const { execSync } = require('child_process');
const js = execSync('git ls-files "js/*.js" "js/**/*.js" "functions/*.js" "functions/**/*.js"', { cwd: path.join(__dirname, '..') })
  .toString().split('\n').filter(f => f && !f.includes('node_modules'));
const bad = js.filter(f => spawnSync(process.execPath, ['--check', f], { cwd: path.join(__dirname, '..') }).status !== 0);
console.log((bad.length ? '✘ ' : '✔ ') + 'node --check — ' + js.length + ' file JS' + (bad.length ? ', LỖI: ' + bad.join(', ') : ', 0 lỗi cú pháp'));
if (bad.length) failed++;
console.log(failed ? `\n${failed} nhóm FAIL` : '\nTẤT CẢ PASS (' + (files.length + 1) + ' nhóm)');
process.exit(failed ? 1 : 0);
