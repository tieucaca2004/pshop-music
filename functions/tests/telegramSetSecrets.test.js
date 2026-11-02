/*
 * tests/telegramSetSecrets.test.js — scripts/telegram-set-secrets.ps1 với firebase-tools GIẢ + server Telegram GIẢ (127.0.0.1).
 * Không gọi Firebase/Telegram thật. Chạy: node tests/telegramSetSecrets.test.js (từ functions/, Windows PowerShell).
 * Kiểm: giá trị tới firebase qua STDIN đúng từng byte (không xuống dòng), đúng tên secret, token sai bot/sai định dạng => KHÔNG lưu, không lộ token.
 */
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'telegram-set-secrets.ps1');
const PSH = '9281952823:AAFAKEpshTOKENfakeFAKEtokenFAKE0001';
const OTHER = '8814262543:AAFAKEotherTOKENfakeFAKEtoken0002';
let pass = 0, fail = 0;
async function t(n, f) { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };

function startTelegramMock() {
  const srv = http.createServer((req, res) => {
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
    const send = (o, c) => { res.writeHead(c || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (!m) return send({ ok: false }, 404);
    const bots = {}; bots[PSH] = { id: 9281952823, username: 'PSH_Flatform_Bot' }; bots[OTHER] = { id: 8814262543, username: 'OtherBot' };
    const bot = bots[m[1]]; if (!bot) return send({ ok: false }, 401);
    if (m[2] === 'getMe') return send({ ok: true, result: bot });
    if (m[2] === 'getWebhookInfo') return send({ ok: true, result: { url: '', pending_update_count: 0 } });
    send({ ok: false }, 404);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}

// firebase GIẢ: ghi stdin (nguyên byte) + argv ra thư mục tạm, in dòng "Created a new secret version …/versions/N"
function makeFakeFirebase(dir, opts) {
  opts = opts || {};
  const js = path.join(dir, 'fake-firebase.js');
  fs.writeFileSync(js, [
    "const fs=require('fs'),path=require('path');",
    "const key=process.argv[3];",
    "const chunks=[];process.stdin.on('data',d=>chunks.push(d)).on('end',()=>{",
    "  const buf=Buffer.concat(chunks);",
    "  fs.writeFileSync(path.join(__dirname,'stdin-'+key+'.bin'),buf);",
    "  fs.writeFileSync(path.join(__dirname,'argv-'+key+'.json'),JSON.stringify(process.argv.slice(2)));",
    opts.fail ? "  console.error('Error: HTTP Error: 400, Secret Payload cannot be empty. '+buf.toString());process.exit(1);"
              : "  console.log('✔ Created a new secret version projects/241363789627/secrets/'+key+'/versions/'+(key==='TELEGRAM_BOT_TOKEN'?4:2));",
    "});"
  ].join('\n'));
  return js;
}

function runScript(env, fakeJs) {
  // spawn BẤT ĐỒNG BỘ — server Telegram giả chạy trong chính tiến trình này, spawnSync sẽ chặn event loop và gây treo.
  const e = Object.assign({}, process.env, env);
  const cmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; . '" + SCRIPT + "' -FromEnv -FirebaseJs '" + fakeJs + "'; 'ENV_TOKEN_LEN=' + ($env:TELEGRAM_BOT_TOKEN + '').Length; 'ENV_SECRET_LEN=' + ($env:TELEGRAM_WEBHOOK_SECRET + '').Length";
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { env: e });
    let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    const to = setTimeout(() => { try { p.kill(); } catch (x) { /* đã thoát */ } }, 120000);
    p.on('close', () => { clearTimeout(to); resolve({ stdout: out, stderr: err }); });
  });
}

(async () => {
  console.log('\n=== telegram-set-secrets.ps1 (firebase giả + Telegram giả) ===');
  const mock = await startTelegramMock();
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psh-setsec-'));

  await t('Token đúng bot → lưu 2 secret ĐÚNG TÊN qua STDIN, byte-chính-xác, không xuống dòng, không lộ ra output', async () => {
    const d = mk(); const js = makeFakeFirebase(d);
    const r = await runScript({ TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_API_BASE: mock.base }, js);
    const out = r.stdout + r.stderr;
    ok(/TELEGRAM_BOT_TOKEN -> version 4/.test(out) && /TELEGRAM_WEBHOOK_SECRET -> version 2/.test(out), out);
    ok(fs.readFileSync(path.join(d, 'stdin-TELEGRAM_BOT_TOKEN.bin'), 'utf8') === PSH, 'stdin token không đúng từng byte');
    const sec = fs.readFileSync(path.join(d, 'stdin-TELEGRAM_WEBHOOK_SECRET.bin'), 'utf8');
    ok(/^[A-Za-z0-9_-]{43}$/.test(sec), 'webhook secret sai dạng: len ' + sec.length);
    const argv = JSON.parse(fs.readFileSync(path.join(d, 'argv-TELEGRAM_BOT_TOKEN.json'), 'utf8')).join(' ');
    ok(argv === 'functions:secrets:set TELEGRAM_BOT_TOKEN --data-file - --project pshop-music', 'argv: ' + argv);
    ok(out.indexOf('AAFAKE') < 0 && out.indexOf(sec) < 0, 'LỘ giá trị');
    ok(out.indexOf('ENV_TOKEN_LEN=' + PSH.length) >= 0 && /ENV_SECRET_LEN=43/.test(out), 'biến môi trường phiên không được giữ: ' + out);
  });
  await t('Token của bot KHÁC → DỪNG, firebase KHÔNG được gọi, không lộ token', async () => {
    const d = mk(); const js = makeFakeFirebase(d);
    const r = await runScript({ TELEGRAM_BOT_TOKEN: OTHER, TELEGRAM_API_BASE: mock.base }, js); const out = r.stdout + r.stderr;
    ok(/DỪNG/.test(out) && !fs.existsSync(path.join(d, 'stdin-TELEGRAM_BOT_TOKEN.bin')), out); ok(out.indexOf('AAFAKE') < 0);
    ok(/ENV_TOKEN_LEN=0/.test(out), 'biến token phải được xoá khi dừng: ' + out);
  });
  await t('Giá trị sai định dạng token (vd dán nhầm) → DỪNG, không gọi firebase', async () => {
    const d = mk(); const js = makeFakeFirebase(d);
    const r = await runScript({ TELEGRAM_BOT_TOKEN: 'khong-phai-token', TELEGRAM_API_BASE: mock.base }, js); const out = r.stdout + r.stderr;
    ok(/định dạng token/.test(out) && !fs.existsSync(path.join(d, 'stdin-TELEGRAM_BOT_TOKEN.bin')), out);
  });
  await t('Lưu secret thất bại (payload rỗng/lỗi) → báo lỗi đã che token, không giữ biến token, không báo thành công', async () => {
    const d = mk(); const js = makeFakeFirebase(d, { fail: true });
    const r = await runScript({ TELEGRAM_BOT_TOKEN: PSH, TELEGRAM_API_BASE: mock.base }, js); const out = r.stdout + r.stderr;
    ok(/KHÔNG thành công/.test(out) && !/XONG/.test(out) && out.indexOf('AAFAKE') < 0, out);
  });
  mock.srv.close();
  console.log('\nPASSED: ' + pass + '  FAILED: ' + fail);
  process.exit(fail ? 1 : 0);
})();
