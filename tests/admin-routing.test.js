// P2 ROUTING — inventory + kiểm tra route admin (tĩnh, mã nguồn thật).
//  1. Mọi href trong sidebar (js/admin-auth.js: Advanced + Smart Mode) và
//     Quick Actions (js/admin-home.js) trỏ tới file HTML có thật.
//  2. Trong cùng 1 danh sách, 2 NHÃN KHÁC NHAU không trỏ cùng 1 trang
//     (CLAUDE.md: "2 nhãn gần giống nhau trỏ 2 trang khác nhau là lỗi nghiêm
//     trọng" — chiều ngược lại cũng gây nhầm lẫn).
//  3. Mọi trang admin/**/*.html (trừ login) phải nạp cơ chế auth
//     (admin-auth.js hoặc auth-context.js hoặc onAuthStateChanged).
// In ra bảng inventory (auth / requiredRole) để đưa vào báo cáo.
// Chạy: node tests/admin-routing.test.js [--inventory]
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const errs = [];

function lists(src, re) {
  const out = []; let m;
  while ((m = re.exec(src))) out.push({ label: m[1], href: m[2] });
  return out;
}
const authSrc = fs.readFileSync(path.join(ROOT, 'js/admin-auth.js'), 'utf8');
const blocks = authSrc.split(/\n(?:const|let|var) [A-Z_]+ = \[/).slice(1).map(b => b.split('\n];')[0]);
blocks.forEach((b, i) => {
  const items = lists(b, /label: '([^']+)', href: '([^']+)'/g);
  check('admin-auth.js nav #' + (i + 1), items, '');
});
const homeSrc = fs.readFileSync(path.join(ROOT, 'js/admin-home.js'), 'utf8');
check('admin-home.js quickActions', lists(homeSrc, /quickAction\('([^']+)', '([^']+)'\)/g), 'admin/');

function check(name, items, base) {
  const seen = {};
  items.forEach(({ label, href }) => {
    const file = path.join(ROOT, href.startsWith('/') ? href.slice(1) : base + href).split('?')[0];
    if (!fs.existsSync(file)) errs.push(`${name}: "${label}" → ${href} KHÔNG tồn tại`);
    if (seen[href] && seen[href] !== label) errs.push(`${name}: "${seen[href]}" và "${label}" cùng trỏ ${href}`);
    seen[href] = label;
  });
}

const pages = execSync('git ls-files "admin/*.html" "admin/**/*.html" "psh/*.html" "psh/**/*.html" "platform/**/*.html" "console/*.html"', { cwd: ROOT })
  .toString().split('\n').filter(Boolean);
const inv = [];
// Ngoại lệ ĐÃ BIẾT (Master Recovery 2026-09-25) — ghi rõ lý do; trang MỚI
// không có auth sẽ làm test fail.
const KNOWN_NO_AUTH = {
  'admin/reset-password.html': 'public — gửi email đặt lại mật khẩu',
  'admin/ai/mobile-preview.html': 'xem trước tĩnh từ sessionStorage, không đọc/ghi Firebase',
  'admin/ai/_test-load-omnis.html': 'trang test nạp dữ liệu mẫu cho mobile-preview (dọn dẹp sau)',
  'platform/workspace/index.html': 'chỉ redirect sang dashboard.html',
  'admin/a-tieu/index.html': 'CHƯA có auth — chỉ đọc Firebase DB (quyền do database.rules.json quyết định)',
  'admin/atieu-menu.html': 'CHƯA có auth guard — ghi DB phụ thuộc database.rules.json',
  'admin/a-tieu/seed.html': 'script seed ghi đè a-tieu/menu khi mở trang — đã chặn 404 qua netlify.toml'
};
// 10 trang Workspace 0 byte (route trắng) — NOT IMPLEMENTED, không được thêm mới.
const KNOWN_EMPTY = ['ai', 'categories', 'cms', 'customers', 'media', 'orders', 'products', 'reports', 'settings', 'team']
  .map(n => 'platform/workspace/' + n + '.html');
for (const p of pages) {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const isLogin = /login/.test(p);
  const auth = /admin-auth\.js/.test(s) ? 'AdminAuth' : /auth-context\.js/.test(s) ? 'AuthContext'
    : /workspace-auth\.js/.test(s) ? 'WorkspaceAuth' : /onAuthStateChanged/.test(s) ? 'inline' : 'NONE';
  // requiredRole có thể nằm trong HTML hoặc trong file js/admin-*.js trang nạp.
  const jsFiles = [...s.matchAll(/src="\/?(?:\.\.\/)*(js\/[^"?]+\.js)/g)].map(m => m[1])
    .filter(j => fs.existsSync(path.join(ROOT, j)));
  const reqSrc = [s].concat(jsFiles.filter(j => /admin-(?!auth|ai\.js)/.test(j)).map(j => fs.readFileSync(path.join(ROOT, j), 'utf8'))).join('\n');
  const req = (reqSrc.match(/requiredRole:\s*'([^']+)'/) || [])[1] || '';
  inv.push({ page: p, auth, requiredRole: req });
  const empty = s.trim() === '';
  if (empty) { inv[inv.length - 1].auth = 'EMPTY (0 byte)'; if (!KNOWN_EMPTY.includes(p)) errs.push('Trang RỖNG mới: ' + p); continue; }
  if (!isLogin && auth === 'NONE' && !KNOWN_NO_AUTH[p]) errs.push('Trang không có auth: ' + p);
}
// Mục sidebar đánh dấu role:'admin' → trang đích PHẢI tự chặn bằng requiredRole
// (ẩn menu không phải là phân quyền — Editor gõ thẳng URL vẫn vào được).
[...authSrc.matchAll(/href: '([^']+)'[^}]*role: 'admin'/g)].forEach(m => {
  const r = inv.find(x => '/' + x.page === m[1]);
  if (!r || r.requiredRole !== 'admin') errs.push('Mục admin-only nhưng trang không có requiredRole admin: ' + m[1]);
});
if (process.argv.includes('--inventory')) {
  console.log('| Trang | Auth | requiredRole |\n|---|---|---|');
  inv.forEach(r => console.log(`| ${r.page} | ${r.auth} | ${r.requiredRole || '—'} |`));
}
assert.deepStrictEqual(errs, [], errs.join('\n'));
console.log('admin-routing: OK —', pages.length, 'trang,', inv.filter(r => r.requiredRole).length, 'trang có requiredRole');
