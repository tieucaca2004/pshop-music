// G1M — kiểm tra TĨNH (không emulator, không mạng, không Firebase) cho phần Facebook
// của database.rules.json và việc client không còn ghi trực tiếp các node đã đóng.
// Chạy: node tests/facebook-rules-static.test.js
//
// LƯU Ý QUAN TRỌNG: test này KHÔNG chứng minh hành vi runtime của Rules. Nó chỉ khoá
// cấu hình. Hành vi thật cần Realtime Database Emulator (tests/database-rules.test.js).
// Đặc biệt: `.write`/`.read` ở GỐC cấp quyền cho superAdmins cho TOÀN cây, rule con
// (kể cả `false`) KHÔNG chặn được super_admin — test cuối ghi nhận giới hạn này.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;

// 1. Browser KHÔNG được ghi trực tiếp facebookAppConfig / facebookConnection.
assert.strictEqual(rules.facebookAppConfig['.write'], false, 'facebookAppConfig .write phải là false');
assert.strictEqual(rules.facebookConnection['.write'], false, 'facebookConnection .write phải là false');

// 2. Đọc vẫn giữ nguyên cho người có node roles (client hiển thị trạng thái).
assert.ok(/roles/.test(rules.facebookAppConfig['.read']), 'facebookAppConfig .read đổi ngoài phạm vi');
assert.ok(/roles/.test(rules.facebookConnection['.read']), 'facebookConnection .read đổi ngoài phạm vi');

// 3. Token nodes vẫn đóng cho client.
for (const n of ['facebookPageTokens', 'facebookActiveToken', 'facebookUserToken']) {
  assert.strictEqual(rules[n]['.read'], false, n + ' .read');
  assert.strictEqual(rules[n]['.write'], false, n + ' .write');
}

// 4. State OAuth: CHỈ server ghi (browser đóng); createdAt phải là số (callback kiểm TTL).
const st = rules.facebookOAuthState.$state;
assert.strictEqual(st['.write'], false, 'facebookOAuthState .write phải là false (state do server cấp)');
assert.ok(/isNumber\(\)/.test(st['.validate']) && /createdAt/.test(st['.validate']), 'state .validate phải ép createdAt là số');
assert.strictEqual(st['.read'], false);

// 5. Quyền CMS không liên quan KHÔNG bị đổi: so với bản gốc ở HEAD của nhánh xuất phát.
let baseRules = null;
try {
  const { execSync } = require('child_process');
  baseRules = JSON.parse(execSync('git show fd10b33:database.rules.json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).rules;
} catch (e) { /* không có git/commit gốc: bỏ qua so sánh */ }
if (baseRules) {
  const changed = Object.keys(Object.assign({}, rules, baseRules)).filter(k => JSON.stringify(rules[k]) !== JSON.stringify(baseRules[k]));
  assert.deepStrictEqual(changed.sort(), ['facebookAppConfig', 'facebookConnection', 'facebookOAuthState'], 'chỉ 3 node Facebook được phép đổi, thực tế đổi: ' + changed.join(', '));
}

// 6. Client JS không còn ghi trực tiếp 2 node đã đóng.
const jsDir = path.join(ROOT, 'js');
const offenders = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      const re = /ref\(\s*['"`]facebook(AppConfig|Connection)(?:\/[^'"`]*)?['"`]\s*\)\s*\.\s*(set|update|remove|push|transaction)\b/g;
      if (re.test(src)) offenders.push(path.relative(ROOT, p));
      // ref() helper cục bộ trong admin-facebook-connect.js: cấm .set/.update trên chính nó
    }
  }
})(jsDir);
assert.deepStrictEqual(offenders, [], 'client còn ghi trực tiếp: ' + offenders.join(', '));
const connectSrc = fs.readFileSync(path.join(jsDir, 'admin-facebook-connect.js'), 'utf8');
assert.ok(!/\bref\(\)\s*\.\s*(set|update|remove)\b/.test(connectSrc), 'admin-facebook-connect.js còn ghi qua ref() helper');
assert.ok(!/ref\('facebookAppConfig'\)\.update/.test(connectSrc), 'admin-facebook-connect.js còn update facebookAppConfig');
assert.ok(/\/v1\/facebook\/app-config/.test(connectSrc) && /\/v1\/facebook\/disconnect/.test(connectSrc), 'client phải gọi route server');
assert.ok(!/Math\.random/.test(connectSrc), 'client không được tự sinh nonce state bằng Math.random');
assert.ok(!/facebookOAuthState/.test(connectSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'client không được ghi/đọc facebookOAuthState (state do server cấp)');
assert.ok(/\/v1\/facebook\/oauth\/start/.test(connectSrc), 'client phải lấy state từ route oauth/start');

// 7. admin-ai.js không còn gọi trực tiếp Cloud Function facebookPublish (chỉ super_admin).
const aiSrc = fs.readFileSync(path.join(jsDir, 'admin-ai.js'), 'utf8');
assert.ok(!/cloudfunctions\.net\/facebookPublish/.test(aiSrc), 'admin-ai.js còn gọi thẳng facebookPublish');
assert.ok(/apiGateway\/v1\/facebook\/publish/.test(aiSrc), 'admin-ai.js phải đăng qua gateway');

// 7b. G1O — UI chỉ hiện nút thay đổi cho super_admin (khớp backend: superAdmins/{uid}.role === 'super_admin').
assert.ok(connectSrc.includes('let canManage = false') && connectSrc.includes("v.role === 'super_admin'"), 'UI phải kiểm role super_admin chặt');
assert.ok(connectSrc.split('requireManage()').length - 1 >= 6, 'mọi handler thay đổi phải có requireManage()');

// 7e. validate đường dẫn + phạm vi disconnect (giữ từ 7d, thuộc release)
const conn2 = fs.readFileSync(path.join(ROOT, 'functions', 'shared', 'fbConnectionPatch.js'), 'utf8');
assert.ok(conn2.includes('STATE_PATTERN.test(state)') && conn2.includes('PAGE_ID_PATTERN.test(pageId)'), 'phải validate state/pageId trước khi ghép vào đường dẫn RTDB');
assert.ok(!conn2.includes('facebookPageTokens: null') && !conn2.includes('facebookPendingPages: null'), 'disconnect không được xoá dữ liệu chờ chọn của mọi uid');

// 8. Ghi nhận giới hạn kế thừa: root cấp quyền toàn cây cho superAdmins.
assert.ok(/superAdmins/.test(rules['.write']) && /superAdmins/.test(rules['.read']),
  'GIỚI HẠN ĐÃ BIẾT: root .read/.write cấp toàn cây cho superAdmins nên rule con không chặn được super_admin. ' +
  'Nếu root bị đổi, hãy cập nhật báo cáo rủi ro và test này.');

console.log('facebook-rules-static: OK — 3 node Facebook đóng ghi từ browser, token nodes đóng, client không ghi trực tiếp, chỉ 3 node đổi so với commit phục hồi fd10b33');
