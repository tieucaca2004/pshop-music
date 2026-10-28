// Phơi bày cấu hình nhạy cảm của luồng Telegram→Facebook qua Realtime Database RULES (database.rules.json HIỆN HÀNH, KHÔNG đổi).
// Chạy trên Realtime Database Emulator (demo-pshop, không chạm production):
//   NODE_PATH=<dir có @firebase/rules-unit-testing + firebase> firebase emulators:exec --only database --project demo-pshop \
//     "node tests/telegram-config-rules-exposure.test.js"
// Mục đích: ghi nhận CHÍNH XÁC ai đọc/ghi được telegramConfig (chứa bot token), telegramWebhookSecret, imageRouterConfig (chứa secret
// compositor), fbPostDrafts, telegramUpdates. Các case "[RỦI RO ĐÃ BIẾT]" khẳng định điều xấu vẫn tồn tại để không ai hiểu nhầm là đã an toàn.
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update } = require('firebase/database');

(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  if (!/^(127\.0\.0\.1|localhost)$/.test(host)) { console.error('Từ chối chạy: host emulator phải là localhost'); process.exit(2); }
  const env = await initializeTestEnvironment({ projectId: 'demo-pshop', database: { host, port: Number(port), rules: fs.readFileSync(process.env.PSH_RULES_FILE || path.join(__dirname, '..', 'database.rules.json'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (c) => {
    await set(ref(c.database(), '/'), {
      roles: { adm: 'admin', edi: 'editor', agt: 'agent' },
      superAdmins: { sup: { role: 'super_admin', email: 's@x' } },
      telegramConfig: { token: 'TG-SECRET', chatId: '1', approverMap: { 1: 'adm' } },
      telegramWebhookSecret: 'WH-SECRET',
      imageRouterConfig: { providers: { compositor: { secret: 'CMP-SECRET' } } },
      fbPostDrafts: { d1: { status: 'PENDING_APPROVAL', aiCaption: 'x' } },
      telegramUpdates: { 1: { state: 'done' } }
    });
  });
  const db = (uid) => (uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database());
  const NODES = ['telegramConfig', 'telegramWebhookSecret', 'imageRouterConfig', 'fbPostDrafts', 'telegramUpdates'];
  const cases = [];
  for (const n of NODES) {
    cases.push([`[${n}] chưa đăng nhập ĐỌC bị chặn`, () => assertFails(get(ref(db(null), n)))]);
    cases.push([`[${n}] admin thường ĐỌC bị chặn`, () => assertFails(get(ref(db('adm'), n)))]);
    cases.push([`[${n}] editor ĐỌC bị chặn`, () => assertFails(get(ref(db('edi'), n)))]);
    cases.push([`[${n}] agent ĐỌC bị chặn`, () => assertFails(get(ref(db('agt'), n)))]);
    cases.push([`[${n}] admin thường GHI bị chặn`, () => assertFails(set(ref(db('adm'), n + '/x'), 'y'))]);
    cases.push([`[${n}] editor GHI bị chặn`, () => assertFails(set(ref(db('edi'), n + '/x'), 'y'))]);
  }
  cases.push(['[telegramConfig] admin KHÔNG tự thêm ánh xạ approverMap để cấp quyền cho mình', () => assertFails(update(ref(db('adm'), 'telegramConfig'), { approverIds: ['999'], approverMap: { 999: 'adm' } }))]);
  // Rủi ro đã biết: quyền gốc superAdmins cho đọc/ghi toàn cây
  cases.push(['[RỦI RO ĐÃ BIẾT] super_admin ĐỌC được telegramConfig (có bot token) từ trình duyệt', () => assertSucceeds(get(ref(db('sup'), 'telegramConfig')))]);
  cases.push(['[RỦI RO ĐÃ BIẾT] super_admin ĐỌC được telegramWebhookSecret', () => assertSucceeds(get(ref(db('sup'), 'telegramWebhookSecret')))]);
  cases.push(['[RỦI RO ĐÃ BIẾT] super_admin ĐỌC được imageRouterConfig (có secret compositor)', () => assertSucceeds(get(ref(db('sup'), 'imageRouterConfig')))]);
  cases.push(['[RỦI RO ĐÃ BIẾT] super_admin GHI được telegramConfig/approverMap (tự cấp quyền duyệt — đúng ý đồ: chỉ Founder)', () => assertSucceeds(set(ref(db('sup'), 'telegramConfig/approverMap/2'), 'sup'))]);

  let ok = 0; const bad = [];
  for (const [name, fn] of cases) { try { await fn(); ok++; } catch (e) { bad.push(name + ' → ' + String(e.message).slice(0, 100)); } }
  await env.cleanup();
  if (bad.length) { console.error('telegram-config-rules-exposure: FAIL ' + bad.length + '/' + cases.length + '\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('telegram-config-rules-exposure: OK (' + ok + ' case, Emulator, rules HIỆN HÀNH; 4 case ghi nhận RỦI RO super_admin)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
