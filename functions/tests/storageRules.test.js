/*
 * tests/storageRules.test.js — storage.rules phải KHOÁ fbDrafts/** với client (Real Publish: ảnh bản nháp Facebook).
 *
 * Hai phần, KHÔNG nhầm lẫn bằng chứng:
 *   [1] PHÂN TÍCH TĨNH (luôn chạy): đọc storage.rules, kiểm mọi `allow` có thể khớp fbDrafts/** có loại trừ fbDrafts trong điều kiện.
 *       ĐÂY CHỈ LÀ LINT — KHÔNG phải bằng chứng hành vi của Firebase Storage Rules.
 *   [2] ENGINE RULES THẬT của Google (StorageRulesRuntime của firebase-tools + rules-runtime jar; chạy được trên JDK 17): so sánh quyết định allow/deny
 *       của storage.rules HIỆN TẠI với bản HEAD cho từng thao tác/đường dẫn/token. Là bộ đánh giá Rules thật, không phải emulator end-to-end.
 *   [3] STORAGE EMULATOR THẬT (chỉ chạy khi có FIREBASE_STORAGE_EMULATOR_HOST trên localhost): gọi REST với token người dùng (JWT không
 *       ký, định dạng của Auth emulator), token Admin "owner" (bỏ qua Rules như Admin SDK của Cloud Functions) và không token.
 *       Nếu thiếu emulator ⇒ in "BLOCKED" và thoát mã 3 (KHÔNG giả lập kết quả).
 *
 *   firebase emulators:exec --only storage --project demo-pshop "node functions/tests/storageRules.test.js"   (chạy từ thư mục gốc repo; cần JDK >= 21)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RULES = fs.readFileSync(process.env.STORAGE_RULES_FILE || path.join(__dirname, '..', '..', 'storage.rules'), 'utf8'); // STORAGE_RULES_FILE: chạy lint trên bản rules khác (vd bản HEAD để chứng minh lint bắt được lỗi cũ)

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; failures.push(name); } }
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

// ── [1] phân tích tĩnh ──
function stripComments(s) { return s.replace(/\/\/.*$/gm, ''); }
function matchBlocks(src) { // trả [{ pattern, body }] cho mọi `match <pattern> { ... }` (kể cả lồng nhau)
  const out = []; const re = /match\s+(\S+)\s*\{/g; let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
    out.push({ pattern: m[1], body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}
function clauses(body) { const out = []; const re = /allow\s+([a-z, ]+?)\s*:\s*if\s+([^;]+);/g; let m; while ((m = re.exec(body))) out.push({ ops: m[1].split(',').map((x) => x.trim()), cond: m[2].replace(/\s+/g, ' ') }); return out; }
// block có thể khớp fbDrafts/x ? (wildcard đệ quy ở gốc, hoặc /fbDrafts/...)
const canMatchFbDrafts = (pattern) => /^\/\{[A-Za-z_]+=\*\*\}$/.test(pattern) || /^\/fbDrafts(\/|$)/.test(pattern);
const WRITE_OPS = ['write', 'create', 'update', 'delete'];

console.log('\n[1] Phân tích tĩnh storage.rules (LINT — không phải bằng chứng hành vi)');
const src = stripComments(RULES);
const blocks = matchBlocks(src).filter((b) => b.pattern !== '/b/{bucket}/o');
(async () => {
  await t('Có ít nhất một block wildcard gốc và phân tích được', async () => { assert(blocks.length >= 2, 'blocks=' + blocks.length); assert(blocks.some((b) => canMatchFbDrafts(b.pattern)), 'không thấy catch-all'); });
  await t('MỌI allow ghi (write/create/update/delete) của block có thể khớp fbDrafts/** đều loại trừ fbDrafts bằng resource.name', async () => {
    let checked = 0;
    for (const b of blocks.filter((x) => canMatchFbDrafts(x.pattern))) {
      for (const c of clauses(b.body)) {
        if (!c.ops.some((o) => WRITE_OPS.includes(o))) continue;
        checked++;
        assert(/!\s*resource\.name\.matches\(\s*"\^fbDrafts\/\.\*"\s*\)/.test(c.cond), 'block ' + b.pattern + ' allow ' + c.ops.join(',') + ' thiếu loại trừ fbDrafts: ' + c.cond);
        assert(/request\.auth\s*!=\s*null/.test(c.cond), 'phải yêu cầu đăng nhập: ' + c.cond);
        assert(!/\bif\s+true\b/.test(c.cond) && c.cond.trim() !== 'true', 'không được `if true`');
      }
    }
    assert(checked >= 1, 'không có clause ghi nào được kiểm — parser hỏng?');
  });
  await t('Không có match con nào cấp thêm quyền ghi cho fbDrafts/**', async () => {
    for (const b of blocks) {
      if (!/^\/fbDrafts(\/|$)/.test(b.pattern)) continue;
      for (const c of clauses(b.body)) assert(!c.ops.some((o) => WRITE_OPS.includes(o)), 'match ' + b.pattern + ' cấp quyền ghi: ' + c.cond);
    }
  });
  await t('Nhắc: `allow write: if false` ở match con KHÔNG khoá được (OR) — repo không dựa vào cách đó', async () => {
    assert(!/match\s+\/fbDrafts[^{]*\{\s*allow\s+write\s*:\s*if\s+false/.test(src.replace(/\s+/g, ' ')), 'đừng dùng allow write: if false làm biện pháp khoá');
  });
  await t('Tenant block /businesses/** không bị thay đổi quyền và không liên quan fbDrafts', async () => {
    const biz = blocks.find((b) => /^\/businesses\//.test(b.pattern)); assert(biz, 'mất block businesses');
    assert(!/fbDrafts/.test(biz.body), 'block businesses không được nhắc fbDrafts');
    assert(clauses(biz.body).every((c) => /request\.auth\s*!=\s*null/.test(c.cond)), 'businesses vẫn yêu cầu đăng nhập');
  });

  // ── [2] ENGINE ĐÁNH GIÁ RULES THẬT của Google (rules-runtime jar, điều khiển qua StorageRulesRuntime của firebase-tools) ──
  // Khác [1]: đây là bộ đánh giá Rules thật (cùng engine Storage Emulator dùng), chạy được trên JDK 17. KHÔNG phải emulator end-to-end (không có HTTP/Auth).
  console.log('\n[2] Engine Rules thật (StorageRulesRuntime) — so sánh storage.rules HIỆN TẠI với bản HEAD');
  let runtimeMod = null;
  try { runtimeMod = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'firebase-tools/lib/emulator/storage/rules/runtime')); } catch (e) { runtimeMod = null; }
  if (!runtimeMod) {
    console.log('  SKIPPED: không tìm thấy firebase-tools toàn cục (npm i -g firebase-tools) hoặc rules-runtime jar.');
  } else {
    const rt = new runtimeMod.StorageRulesRuntime(); await rt.start(false);
    const load = async (content) => { const r = await rt.loadRuleset({ files: [{ name: 'storage.rules', content }] }); if (!r.ruleset) throw new Error('rules không nạp được: ' + JSON.stringify(r.issues)); return r.ruleset; };
    const now = await load(RULES);
    let head = null; try { head = await load(require('child_process').execSync('git show HEAD:storage.rules', { cwd: path.join(__dirname, '..', '..') }).toString()); } catch (e) { head = null; }
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const tok = (c) => b64({ alg: 'none' }) + '.' + b64(Object.assign({ aud: 'demo-pshop', user_id: 'u1', sub: 'u1', firebase: { sign_in_provider: 'password', identities: {} } }, c || {})) + '.';
    const meta = (n) => ({ name: n, bucket: 'b', size: 3, contentType: 'image/png', metadata: {} });
    const decide = async (rs, method, name, auth) => {
      const hasBefore = method === 'update' || method === 'delete' || method === 'get'; const hasAfter = method === 'create' || method === 'update';
      const r = await rs.verify({ method, path: '/b/b/o/' + name, file: { before: hasBefore ? meta(name) : undefined, after: hasAfter ? meta(name) : undefined }, projectId: 'demo-pshop', token: auth });
      return !!r.permitted;
    };
    const USER = tok(), BIZA = tok({ businessId: 'bizA' }), BIZB = tok({ businessId: 'bizB' }), SUPER = tok({ roles: { super_admin: true } });
    const FB = ['fbDrafts/d1/final.png', 'fbDrafts/d1/original.jpg', 'fbDrafts/dNEW/final.png', 'fbDrafts/x.png'];
    const WRITE = ['create', 'update', 'delete'];

    await t('fbDrafts/**: MỌI thao tác ghi (create/update/delete) bởi người KHÔNG đăng nhập → DENY', async () => {
      for (const n of FB) for (const m of WRITE) assert(!(await decide(now, m, n, undefined)), m + ' ' + n);
    });
    await t('fbDrafts/**: MỌI thao tác ghi bởi người đã đăng nhập (token thường / businessId / super_admin claim) → DENY', async () => {
      for (const a of [USER, BIZA, BIZB, SUPER]) for (const n of FB) for (const m of WRITE) assert(!(await decide(now, m, n, a)), m + ' ' + n);
    });
    await t('fbDrafts/**: ghi ĐÈ (update) và XOÁ bởi người đã đăng nhập → DENY (đúng lỗ hổng đã nêu)', async () => {
      assert(!(await decide(now, 'update', 'fbDrafts/d1/final.png', USER)), 'overwrite'); assert(!(await decide(now, 'delete', 'fbDrafts/d1/final.png', USER)), 'delete');
    });
    if (head) await t('ĐỐI CHỨNG bản HEAD: trước khi sửa, người đã đăng nhập GHI ĐÈ & XOÁ được fbDrafts (chứng minh test có năng lực phát hiện lỗi)', async () => {
      assert(await decide(head, 'update', 'fbDrafts/d1/final.png', USER), 'HEAD phải ALLOW overwrite'); assert(await decide(head, 'delete', 'fbDrafts/d1/final.png', USER), 'HEAD phải ALLOW delete');
    });
    if (head) await t('KHÔNG ẢNH HƯỞNG đường dẫn khác: với MỌI đường dẫn/thao tác/token ngoài fbDrafts, quyết định GIỐNG HỆT bản HEAD', async () => {
      const others = ['legacy/a.png', 'a-tieu/menu/menu-1.jpg', 'products/p1.jpg', 'root.png', 'businesses/bizA/x.png', 'businesses/bizB/y.png', 'fbDraftsX/a.png', 'notfbDrafts/a.png', 'x/fbDrafts/a.png'];
      let n = 0;
      for (const name of others) for (const m of ['get', 'create', 'update', 'delete', 'list']) for (const a of [undefined, USER, BIZA, BIZB, SUPER]) {
        const [x, y] = [await decide(head, m, name, a), await decide(now, m, name, a)]; n++;
        assert(x === y, 'KHÁC HEAD: ' + m + ' ' + name + ' auth=' + (a ? 'có' : 'không') + ' (HEAD=' + x + ', nay=' + y + ')');
      }
      console.log('      (đã so sánh ' + n + ' tổ hợp)');
    });
    await t('Ghi nhận hành vi hiện hữu (không do bản sửa): update/delete ngoài fbDrafts bởi người đăng nhập = ALLOW; create = DENY; get ẩn danh legacy = ALLOW', async () => {
      assert(await decide(now, 'update', 'legacy/a.png', USER), 'update legacy'); assert(await decide(now, 'delete', 'legacy/a.png', USER), 'delete legacy');
      assert(!(await decide(now, 'create', 'legacy/new.png', USER)), 'create legacy bị từ chối (resource=null làm điều kiện lỗi — có sẵn từ trước)');
      assert(await decide(now, 'get', 'legacy/a.png', undefined), 'get legacy');
    });
    await t('businesses/: đúng businessId ghi được, businessId khác bị từ chối (tenant isolation giữ nguyên)', async () => {
      assert(await decide(now, 'create', 'businesses/bizA/x.png', BIZA), 'bizA'); assert(!(await decide(now, 'create', 'businesses/bizA/x.png', BIZB)), 'bizB không được');
    });
    rt.close && rt.close();
  }

  // ── [3] Storage Emulator thật ──
  console.log('\n[3] Storage Emulator thật (REST; HTTP + Auth + Rules end-to-end)');
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    console.log('  BLOCKED: không có Storage Emulator trên localhost (firebase-tools 15 cần JDK >= 21; máy hiện chỉ có JDK 17). KHÔNG giả lập kết quả.');
    console.log('\n[1] ' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' pass, ' + fail + ' fail  |  [3] Storage Emulator end-to-end: BLOCKED');
    process.exit(fail ? 1 : 3);
  }
  const BUCKET = 'demo-pshop.appspot.com';
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (claims) => { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({ iss: 'https://securetoken.google.com/demo-pshop', aud: 'demo-pshop', auth_time: n, user_id: 'u1', sub: 'u1', iat: n, exp: n + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }, claims || {})) + '.'; };
  const ANON = null, USER = 'Firebase ' + jwt(), OTHERBIZ = 'Firebase ' + jwt({ businessId: 'bizB' }), BIZA = 'Firebase ' + jwt({ businessId: 'bizA' }), ADMIN = 'Bearer owner';
  const url = (name) => 'http://' + host + '/v0/b/' + BUCKET + '/o/' + encodeURIComponent(name);
  async function put(auth, name, body) { const h = { 'Content-Type': 'image/png' }; if (auth) h.Authorization = auth; return (await fetch('http://' + host + '/v0/b/' + BUCKET + '/o?name=' + encodeURIComponent(name), { method: 'POST', headers: h, body: Buffer.from(body || 'x') })).status; }
  async function del(auth, name) { const h = {}; if (auth) h.Authorization = auth; return (await fetch(url(name), { method: 'DELETE', headers: h })).status; }
  async function get(auth, name) { const h = {}; if (auth) h.Authorization = auth; return (await fetch(url(name) + '?alt=media', { headers: h })).status; }
  const ok = (s) => s >= 200 && s < 300; const denied = (s) => s === 401 || s === 403;

  await put(ADMIN, 'fbDrafts/d1/final.png', 'ORIGINAL'); await put(ADMIN, 'fbDrafts/d1/original.jpg', 'ORIGINAL'); await put(ADMIN, 'legacy/a.png', 'L'); await put(ADMIN, 'legacy/b.png', 'L'); await put(ADMIN, 'businesses/bizA/x.png', 'B');

  await t('fbDrafts: người KHÔNG đăng nhập tạo file mới → DENY', async () => { const s = await put(ANON, 'fbDrafts/d1/new.png'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người đã đăng nhập tạo file mới → DENY', async () => { const s = await put(USER, 'fbDrafts/d1/new2.png'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người đã đăng nhập tạo file ở draft mới (đường dẫn chưa tồn tại) → DENY', async () => { const s = await put(USER, 'fbDrafts/dX/final.png'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người KHÔNG đăng nhập ghi đè file có sẵn → DENY', async () => { const s = await put(ANON, 'fbDrafts/d1/final.png', 'EVIL'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người đã đăng nhập GHI ĐÈ file có sẵn → DENY', async () => { const s = await put(USER, 'fbDrafts/d1/final.png', 'EVIL'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người đã đăng nhập XOÁ file có sẵn → DENY', async () => { const s = await del(USER, 'fbDrafts/d1/original.jpg'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: người KHÔNG đăng nhập XOÁ → DENY', async () => { const s = await del(ANON, 'fbDrafts/d1/original.jpg'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: token có claim businessId/roles khác cũng không ghi được → DENY', async () => { const s = await put(BIZA, 'fbDrafts/d1/final.png', 'EVIL'); assert(denied(s), 'status ' + s); });
  await t('fbDrafts: nội dung gốc còn NGUYÊN sau các thử ghi/xoá', async () => { const r = await fetch(url('fbDrafts/d1/final.png') + '?alt=media', { headers: { Authorization: ADMIN } }); eq(await r.text(), 'ORIGINAL'); const r2 = await fetch(url('fbDrafts/d1/original.jpg') + '?alt=media', { headers: { Authorization: ADMIN } }); eq(await r2.text(), 'ORIGINAL'); });
  function eq(a, b) { if (a !== b) throw new Error('mong đợi ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a)); }
  await t('Admin SDK (token owner, bỏ qua Rules): tạo / ghi đè / xoá trong fbDrafts → OK (Cloud Functions không bị ảnh hưởng)', async () => {
    assert(ok(await put(ADMIN, 'fbDrafts/d2/final.png', 'A')), 'create'); assert(ok(await put(ADMIN, 'fbDrafts/d2/final.png', 'B')), 'overwrite'); assert(ok(await del(ADMIN, 'fbDrafts/d2/final.png')), 'delete');
  });
  await t('KHÔNG ẢNH HƯỞNG thư mục khác — legacy/: ghi đè & xoá bởi người đã đăng nhập vẫn theo hành vi cũ (OK); tạo mới theo hành vi cũ', async () => {
    assert(ok(await put(USER, 'legacy/a.png', 'U')), 'overwrite legacy phải OK như trước'); assert(ok(await del(USER, 'legacy/b.png')), 'delete legacy phải OK như trước');
    const created = await put(USER, 'legacy/new.png', 'U'); console.log('      (ghi nhận: create legacy/new.png bởi user đã đăng nhập → ' + created + '; PHẢI trùng hành vi của storage.rules TRƯỚC khi sửa — so sánh bằng cách chạy test này với git stash/bản cũ của rules)');
  });
  await t('KHÔNG ẢNH HƯỞNG businesses/: đúng businessId ghi được; businessId khác bị từ chối', async () => {
    assert(ok(await put(BIZA, 'businesses/bizA/y.png', 'Y')), 'bizA'); assert(denied(await put(OTHERBIZ, 'businesses/bizA/z.png', 'Z')), 'bizB không được ghi vào bizA');
  });
  await t('Đọc: không đăng nhập vẫn get được file legacy (không đổi); get businesses vẫn bị từ chối khi không đăng nhập', async () => {
    assert(ok(await get(ANON, 'legacy/a.png')), 'get legacy'); assert(denied(await get(ANON, 'businesses/bizA/x.png')), 'get businesses');
  });

  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' pass, ' + fail + ' fail');
  if (failures.length) console.log(failures.join('\n'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
