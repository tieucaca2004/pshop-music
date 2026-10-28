/*
 * tests/telegramSecrets.test.js — Phase 5: bảo vệ secret Telegram bằng Functions secrets.
 *
 * Chạy: node tests/telegramSecrets.test.js   (từ thư mục functions/). Không gọi mạng; không có secret thật (chỉ giá trị giả).
 * Kiểm: (1) mỗi hàm chỉ bind đúng secret nó cần, nạp index.js KHÔNG cần giá trị secret (an toàn cho bước phát hiện lúc deploy);
 *       (2) hai hàm mục tiêu độc lập về secret; (3) các hàm G1 không đổi binding; (4) không mã nguồn nào đọc secret từ RTDB.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let passed = 0, failed = 0; const failures = [];
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

const FN = path.join(__dirname, '..');
const probe = `
process.env.GCLOUD_PROJECT='demo-pshop'; process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-pshop',databaseURL:'http://127.0.0.1:9?ns=demo-pshop',storageBucket:'demo-pshop.appspot.com'});
const log=console.log; console.log=()=>{};
const fx=require(process.argv[1]+'/index.js'); const r={};
for (const k of Object.keys(fx)) { const e=fx[k]&&fx[k].__endpoint; if(!e) continue; r[k]=(e.secretEnvironmentVariables||[]).map(s=>s.key).sort(); }
log(JSON.stringify(r));`;
// Nạp index.js trong tiến trình sạch, KHÔNG có biến môi trường secret nào ⇒ chứng minh phát hiện lúc deploy không cần giá trị secret.
const env = Object.assign({}, process.env); for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'COMPOSITOR_SECRET', 'WEBHOOK_SIGNING_SECRET', 'OPENAI_API_KEY', 'FACEBOOK_APP_SECRET', 'DEEPSEEK_API_KEY']) delete env[k];
const p = spawnSync(process.execPath, ['-e', probe, FN], { encoding: 'utf8', cwd: FN, env });
let bound = null; try { bound = JSON.parse(p.stdout.trim().split('\n').pop()); } catch (e) { bound = null; }

console.log('\n=== Phase 5 — secret binding / Functions secrets ===');
test('index.js nạp được KHÔNG cần giá trị secret nào (phát hiện hàm lúc deploy an toàn)', () => { assert(bound, 'không nạp được index.js: ' + String(p.stderr).slice(0, 200)); });
test('telegramWebhook chỉ bind đúng 4 secret cần: OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, COMPOSITOR_SECRET', () => { eq(bound.telegramWebhook, ['COMPOSITOR_SECRET', 'OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']); });
test('apiGateway bind thêm CHỈ TELEGRAM_BOT_TOKEN (route /v1/facebook-publisher gửi bản xem trước); giữ OPENAI_API_KEY + WEBHOOK_SIGNING_SECRET như bản đang chạy', () => { eq(bound.apiGateway, ['OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'WEBHOOK_SIGNING_SECRET']); });
test('Secret Telegram/compositor KHÔNG bind cho hàm nào khác; TELEGRAM_WEBHOOK_SECRET và COMPOSITOR_SECRET chỉ ở telegramWebhook', () => {
  for (const [name, list] of Object.entries(bound)) {
    if (name !== 'telegramWebhook' && name !== 'apiGateway') assert(!list.some((s) => /^(TELEGRAM_|COMPOSITOR_)/.test(s)), name + ' bind secret Telegram/compositor');
    if (name !== 'telegramWebhook') assert(!list.includes('TELEGRAM_WEBHOOK_SECRET') && !list.includes('COMPOSITOR_SECRET'), name + ' bind secret chỉ dành cho telegramWebhook');
  }
});
test('Hàm G1 giữ nguyên binding (4 hàm Facebook, openaiProxy)', () => {
  eq(bound.facebookOAuthCallback, ['FACEBOOK_APP_SECRET']); eq(bound.facebookRefreshToken, ['FACEBOOK_APP_SECRET']); eq(bound.facebookSelectPage, []); eq(bound.facebookPublish, []); eq(bound.openaiProxy, ['OPENAI_API_KEY']);
});
test('Hai hàm mục tiêu độc lập: secret MỚI cần có trước khi deploy mỗi hàm không phụ thuộc hàm kia; WEBHOOK_SIGNING_SECRET đã tồn tại từ trước', () => {
  const existing = new Set(['OPENAI_API_KEY', 'WEBHOOK_SIGNING_SECRET', 'FACEBOOK_APP_SECRET', 'DEEPSEEK_API_KEY']);
  const newForWebhook = bound.telegramWebhook.filter((s) => !existing.has(s)).sort(); const newForGateway = bound.apiGateway.filter((s) => !existing.has(s)).sort();
  eq(newForWebhook, ['COMPOSITOR_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']); eq(newForGateway, ['TELEGRAM_BOT_TOKEN']);
});
test('Không mã nguồn nào đọc secret từ RTDB hay gán tgConfig.token; mọi truy cập secret Telegram đi qua shared/telegramSecrets.js', () => {
  const offenders = [];
  for (const dir of ['shared', 'routes']) for (const fn of fs.readdirSync(path.join(FN, dir))) {
    if (!fn.endsWith('.js') || fn === 'telegramSecrets.js') continue; const src = fs.readFileSync(path.join(FN, dir, fn), 'utf8');
    if (/ref\(\s*['"](webhookSigningSecret|telegramWebhookSecret)['"]/.test(src) || /tgConfig\.token\s*=/.test(src)) offenders.push(dir + '/' + fn);
    if (/process\.env\.(TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|COMPOSITOR_SECRET)/.test(src)) offenders.push(dir + '/' + fn + ' (đọc env trực tiếp)');
  }
  eq(offenders, []);
});
test('telegramSecrets: không có hàm nào trả secret ra ngoài ngoài các getter; loadTelegramConfig loại mọi trường bí mật cũ', () => {
  const src = fs.readFileSync(path.join(FN, 'shared', 'telegramSecrets.js'), 'utf8');
  assert(/LEGACY_SECRET_KEYS = \[[^\]]*'token'[^\]]*'botToken'/.test(src), 'danh sách trường bí mật cũ');
  assert(!/console\.(log|warn|error)\([^)]*(getBotToken|process\.env)/.test(src), 'không log giá trị secret');
});

console.log('\n─────────────────────────────────────────────');
console.log('PASSED: ' + passed + '  FAILED: ' + failed);
if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
console.log('RESULT: PASS');
