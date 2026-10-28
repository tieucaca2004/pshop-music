/*
 * tests/graphApiCompat.test.js — Backward compatibility của functions/facebook-graph-api.js với bản G1 (commit e31beac).
 *
 * Vi phân: nạp bản G1 từ git và bản hiện tại, chạy cùng kịch bản với fetch giả; khi KHÔNG truyền guard, kết quả/lỗi phải GIỐNG HỆT
 * (đường G1: gateway /v1/facebook/publish, facebookPublish, OAuth, refresh). Chỉ khi guard:true (Telegram Publisher) mới có timeout
 * và cờ ambiguous. Không gọi mạng thật.
 *   node tests/graphApiCompat.test.js   (từ functions/)
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const REPO = path.resolve(__dirname, '..', '..');
const tmp = path.join(os.tmpdir(), 'psh_graph_g1_' + process.pid + '.js');
fs.writeFileSync(tmp, execFileSync('git', ['-C', REPO, 'show', 'e31beac:functions/facebook-graph-api.js']));
const g1 = require(tmp); const cur = require('../facebook-graph-api');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

const realFetch = global.fetch; let seen = [];
const mk = (mode) => async (url, opts) => {
  seen.push({ url: String(url), signal: opts && opts.signal });
  if (mode === 'net') throw new TypeError('fetch failed');
  if (mode === 'badjson') return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  if (mode === 'apierr') return { ok: false, status: 403, json: async () => ({ error: { message: '(#200) Permissions error' } }) };
  if (mode === 'noid') return { ok: true, status: 200, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ id: 'ID_1' }) };
};
async function run(fn, mode) { global.fetch = mk(mode); seen = []; try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, message: e.message, name: e.constructor.name, ambiguous: !!e.ambiguous }; } finally { global.fetch = realFetch; } }

(async () => {
  console.log('\n=== Tương thích ngược facebook-graph-api.js với G1 (e31beac) ===');
  await test('Mọi export của G1 vẫn còn, cùng số tham số; export mới chỉ cộng thêm (getPageInfo)', async () => {
    for (const k of Object.keys(g1)) { assert(typeof cur[k] === 'function', 'thiếu export ' + k); eq(cur[k].length, g1[k].length, 'số tham số ' + k); }
    eq(Object.keys(cur).filter((k) => !(k in g1)).sort(), ['getPageInfo']);
  });
  const args = { mockMode: false, pageId: 'p1', imageUrl: 'https://x/y.png', message: 'm', attachedMedia: [{ media_fbid: '1' }], pageAccessToken: 'tok' };
  for (const mode of ['ok', 'apierr', 'net', 'badjson', 'noid']) {
    await test('uploadPhoto (mặc định, không guard) — kịch bản "' + mode + '": kết quả/lỗi GIỐNG HỆT G1', async () => {
      const a = await run(() => g1.uploadPhoto(args), mode), b = await run(() => cur.uploadPhoto(args), mode); eq(b, a);
    });
    await test('publishToFeed (mặc định, không guard) — kịch bản "' + mode + '": kết quả/lỗi GIỐNG HỆT G1, không cờ ambiguous', async () => {
      const a = await run(() => g1.publishToFeed(args), mode), b = await run(() => cur.publishToFeed(args), mode); eq(b, a); assert(!b.ambiguous, 'đường G1 không được đặt cờ ambiguous');
    });
  }
  await test('Đường mặc định không dùng AbortController/timeout (fetch không nhận signal) — như G1', async () => {
    await run(() => cur.publishToFeed(args), 'ok'); await run(() => cur.uploadPhoto(args), 'ok'); assert(seen.length === 1 && seen[0].signal === undefined, 'không được có signal');
    const r = await run(() => cur.publishToFeed(args), 'ok'); assert(r.ok);
  });
  await test('Mock Mode: output giống hệt G1 (cùng shape)', async () => {
    const m = Object.assign({}, args, { mockMode: true }); const a = await g1.publishToFeed(m), b = await cur.publishToFeed(m); eq(Object.keys(b), Object.keys(a)); assert(/^p1_mockpost_/.test(b.id));
    const pa = await g1.uploadPhoto(m), pb = await cur.uploadPhoto(m); eq(Object.keys(pb), Object.keys(pa));
    eq((await cur.getManagedPages({ mockMode: true })).data.length, (await g1.getManagedPages({ mockMode: true })).data.length);
  });
  await test('Hàm OAuth/làm mới (exchange*, getManagedPages) giống hệt G1 (mã không đổi)', async () => {
    const strip = (f) => f.toString().split(String.fromCharCode(13)).join(""); // bỏ khác biệt CRLF/LF for (const k of ['exchangeCodeForToken', 'exchangeForLongLivedToken', 'getManagedPages']) eq(strip(cur[k]), strip(g1[k]), k);
  });
  await test('Chỉ với guard:true (Telegram Publisher): mất kết nối/phản hồi hỏng khi ĐĂNG feed ⇒ ambiguous=true; ảnh lỗi ⇒ không ambiguous; có signal timeout', async () => {
    let r = await run(() => cur.publishToFeed(Object.assign({ guard: true }, args)), 'net'); assert(!r.ok && r.ambiguous === true && /CHƯA biết/.test(r.message), JSON.stringify(r));
    r = await run(() => cur.publishToFeed(Object.assign({ guard: true }, args)), 'badjson'); assert(!r.ok && r.ambiguous === true);
    r = await run(() => cur.publishToFeed(Object.assign({ guard: true }, args)), 'apierr'); assert(!r.ok && !r.ambiguous && /Permissions error/.test(r.message), 'lỗi API rõ ràng KHÔNG ambiguous');
    r = await run(() => cur.uploadPhoto(Object.assign({ guard: true }, args)), 'net'); assert(!r.ok && !r.ambiguous);
    await run(() => cur.publishToFeed(Object.assign({ guard: true }, args)), 'ok'); assert(seen[0].signal && typeof seen[0].signal.aborted === 'boolean', 'guard ⇒ có AbortSignal');
  });
  await test('Mã G1 trong functions/ không gọi publishToFeed/uploadPhoto với guard (giữ đường G1)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'fbConnectionPatch.js'), 'utf8'); assert(!/guard\s*:/.test(src), 'fbConnectionPatch không được dùng guard');
  });

  try { fs.unlinkSync(tmp); } catch (e) { /* noop */ }
  console.log('\n─────────────────────────────────────────────');
  console.log('PASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
  console.log('RESULT: PASS');
})();
