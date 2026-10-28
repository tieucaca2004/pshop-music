// Dựng thư mục nguồn deploy Cloud Functions từ ĐÚNG blob của một commit (không lấy từ working tree, không CRLF/đổi byte),
// rồi cài dependency theo lockfile. Dùng để deploy CÓ LIỆT KÊ HÀM từ một thư mục sạch.
//   node tools/deploy/make_functions_deploy_source.js <commit> <thư-mục-đích-chưa-tồn-tại-hoặc-rỗng> [--no-install]
// Sau đó:  cd <đích> ; firebase deploy --project pshop-music --only functions:<tên>,functions:<tên>   (KHÔNG deploy trần)
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const [commit, out, flag] = process.argv.slice(2);
if (!commit || !out) { console.error('Dùng: node make_functions_deploy_source.js <commit> <thư-mục-đích> [--no-install]'); process.exit(2); }
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error('Thư mục đích phải rỗng/chưa tồn tại: ' + out); process.exit(2); }
const git = (...a) => execFileSync('git', a, { encoding: 'buffer', maxBuffer: 1 << 28 });
const files = git('ls-tree', '-r', '--name-only', commit, 'functions').toString('utf8').split('\n').filter(Boolean);
for (const f of files) { const p = path.join(out, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, git('cat-file', 'blob', commit + ':' + f)); }
fs.writeFileSync(path.join(out, 'firebase.json'), JSON.stringify({ functions: [{ source: 'functions', codebase: 'default', ignore: ['node_modules', '.git', 'firebase-debug.log', 'firebase-debug.*.log'] }] }, null, 2) + '\n');
fs.writeFileSync(path.join(out, '.firebaserc'), JSON.stringify({ projects: { default: 'pshop-music' } }, null, 2) + '\n');
console.log('đã ghi ' + files.length + ' file từ ' + commit + ' vào ' + out);
if (flag !== '--no-install') execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(out, 'functions'), stdio: 'inherit' });
