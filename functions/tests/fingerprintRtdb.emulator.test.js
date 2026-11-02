/*
 * tests/fingerprintRtdb.emulator.test.js — fingerprint / publishImageHashes trên RTDB ENGINE THẬT (Firebase Database Emulator).
 * Admin SDK THẬT (firebase-admin 14 + shim admin.database như index.js). Telegram/Graph/ảnh là stub cục bộ — KHÔNG request nào ra ngoài.
 *
 * Lý do tồn tại: RTDB KHÔNG lưu mảng rỗng (đọc lại ra undefined) — mock in-memory giữ nguyên [] nên không bắt được lỗi fingerprint
 * giữa lúc tạo và lúc đọc lại (draft chỉ-chữ bị content_mismatch).
 *
 * Chạy (cần emulator database trên localhost):
 *   firebase emulators:exec --only database --project demo-pshop "node tests/fingerprintRtdb.emulator.test.js"      (cần JDK >= 21)
 *   hoặc chạy trực tiếp jar đã có trong ~/.cache/firebase/emulators:
 *     java -jar firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9123
 *     FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9123 node tests/fingerprintRtdb.emulator.test.js
 * Từ chối chạy nếu host không phải localhost (không bao giờ chạm production).
 */
'use strict';
const hostDb = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(hostDb)) { console.error('Từ chối chạy: cần FIREBASE_DATABASE_EMULATOR_HOST trên localhost.'); process.exit(2); }
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';
process.env.TELEGRAM_BOT_TOKEN = '111111:AAAA_tokenTOKENtokenTOKENtoken11';

const path = require('path');
const rq = require('module').createRequire(path.join(__dirname, '..') + '/index.js');
const admin = rq('firebase-admin');
admin.initializeApp({ projectId: 'demo-pshop', databaseURL: 'http://' + hostDb + '?ns=demo-pshop' });
const { getDatabase, ServerValue } = rq('firebase-admin/database');
admin.database = getDatabase; admin.database.ServerValue = ServerValue; // giống shim ở index.js
const db = admin.database();
const store = rq('./shared/fbDraftStore');
const imageHash = rq('./shared/imageHash');
const fbPublisher = rq('./routes/fbPublisher');
const { markRelayTrusted } = rq('./shared/relayTrust');
const crypto = require('crypto');

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; failures.push(name); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'eq') + ': mong đợi ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a)); };
const H = (c) => c.repeat(64);
const raw = async (id) => (await db.ref('fbPostDrafts/' + id).once('value')).val();
async function mk(extra, caption) {
  const d = await store.createDraft({ pageId: 'page1', caption: caption || 'Cap ' + Math.random(), requestedBy: 'x' });
  await store.updateStatus(d.id, 'PROCESSING');
  await store.updateStatus(d.id, 'PENDING_APPROVAL', extra || {});
  return d;
}
const live = (id) => store.approveTransaction(id, { expectedVersion: 1, requireFingerprint: true });

// ── Stub fetch (Telegram, Graph, ảnh) ──
let g = { feedPosts: 0, photoPosts: 0, other: [] }; const bytes = {};
global.fetch = async (url, o) => {
  url = String(url); const method = (o && o.method) || 'GET';
  if (bytes[url]) return { ok: true, status: 200, arrayBuffer: async () => bytes[url] };
  if (url.startsWith('https://api.telegram.org/')) return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  if (url.startsWith('https://graph.facebook.com/')) {
    if (method === 'GET') return { ok: true, status: 200, json: async () => ({ id: 'page1', name: 'P' }) };
    if (url.includes('/photos')) { g.photoPosts++; return { ok: true, status: 200, json: async () => ({ id: 'ph' + g.photoPosts }) }; }
    if (url.includes('/feed')) { g.feedPosts++; return { ok: true, status: 200, json: async () => ({ id: 'page1_' + (700 + g.feedPosts) }) }; }
  }
  g.other.push(url); throw new Error('unexpected ' + url);
};
const resObj = () => { let last; return { status: () => ({ json: (d) => { last = d; } }), json: (d) => { last = d; }, get: () => last }; };
const wrap = (res) => ({ sendSuccess: (r, d) => r.json({ success: true, data: d }), sendError: (r, c, m) => r.json({ success: false, error: { code: c, message: m } }) });
async function routeCreate(body) {
  const res = resObj(); const h = wrap(res);
  await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts', body, get: () => null }, res, Object.assign({ auth: { ok: true, role: 'editor', uid: 'editor-uid', email: 'e@x' } }, h));
  return res.get();
}
async function routeEdit(id, body) {
  const res = resObj(); const h = wrap(res);
  await fbPublisher.handle({ method: 'POST', __pshPath: '/v1/facebook-publisher/drafts/' + id + '/edits', body, get: () => null }, res, Object.assign({ auth: { ok: true, role: 'editor', uid: 'editor-uid', email: 'e@x' } }, h));
  return res.get();
}
async function approveCb(id, v) {
  const res = resObj(); const h = wrap(res);
  const req = { method: 'POST', __pshPath: '/v1/facebook-publisher/callback', body: { callback_query: { id: 'q', data: 'fb_approve:' + id + ':' + v, from: { id: 777 }, message: { chat: { id: 555 } } } }, get: () => null };
  markRelayTrusted(req);
  await fbPublisher.handle(req, res, Object.assign({ auth: { ok: false } }, h));
  return res.get();
}
async function setupLive() {
  await db.ref('/').set(null); g = { feedPosts: 0, photoPosts: 0, other: [] };
  await db.ref('telegramConfig').set({ chatId: '555', approverIds: ['777'], approverMap: { '777': 'uid_tg' }, dryRun: false });
  await db.ref('roles/uid_tg').set({ role: 'admin', email: 'a@b' });
  await db.ref('facebookActiveToken').set({ pageId: 'page1', accessToken: 'REAL', isMock: false });
}

(async () => {
  await db.ref('/').set(null);
  console.log('\n[B1 — fingerprint ↔ RTDB engine thật]');

  await t('Tiền đề: RTDB loại bỏ mảng rỗng khi lưu (đọc lại ra undefined)', async () => {
    const d = await mk({ publishImageHashes: [] });
    const r = await raw(d.id); eq(r.publishImageHashes, undefined, 'publishImageHashes phải mất sau roundtrip'); eq(r.imageUrls, undefined, 'imageUrls [] cũng mất');
  });
  await t('Draft CHỈ-CHỮ (hash []): fingerprint lúc tạo == lúc đọc lại; approve ĐĂNG THẬT commit', async () => {
    const d = await mk({ publishImageHashes: [] }); const r = await live(d.id); eq(r.committed, true, 'reason=' + r.reason);
  });
  await t('Draft CHỈ-CHỮ (trường vắng hẳn): cùng fingerprint chuẩn', async () => {
    const a = await mk({ publishImageHashes: [] }, 'Same'); const b = await mk({}, 'Same');
    eq((await raw(a.id)).contentFingerprint, (await raw(b.id)).contentFingerprint);
  });
  await t('Draft 1 ẢNH: commit; sửa 1 ký tự hash → content_mismatch', async () => {
    const u = 'https://i/1.jpg'; const d = await mk({ publishImages: [u], publishImageHashes: [{ url: u, sha256: H('a') }] });
    eq((await live(d.id)).committed, true);
    const e = await mk({ publishImages: [u], publishImageHashes: [{ url: u, sha256: H('a') }] });
    await db.ref('fbPostDrafts/' + e.id + '/publishImageHashes/0/sha256').set(H('b')); const r = await live(e.id); eq(r.reason, 'content_mismatch');
  });
  await t('Draft NHIỀU ẢNH: giữ thứ tự; đảo thứ tự ảnh hoặc hash → content_mismatch', async () => {
    const us = ['https://i/1.jpg', 'https://i/2.jpg', 'https://i/3.jpg']; const hs = us.map((u, i) => ({ url: u, sha256: H('abc'[i]) }));
    const d = await mk({ publishImages: us, publishImageHashes: hs }); eq((await live(d.id)).committed, true);
    const e = await mk({ publishImages: us, publishImageHashes: hs }); await db.ref('fbPostDrafts/' + e.id + '/publishImages').set([us[1], us[0], us[2]]); eq((await live(e.id)).reason, 'content_mismatch');
    const f = await mk({ publishImages: us, publishImageHashes: hs }); await db.ref('fbPostDrafts/' + f.id + '/publishImageHashes').set([hs[1], hs[0], hs[2]]); eq((await live(f.id)).reason, 'content_mismatch');
  });
  await t('Có ảnh nhưng hash rỗng/vắng (RTDB bỏ []) → image_hash_missing (không bị coi là text-only)', async () => {
    const d = await mk({ publishImages: ['https://i/1.jpg'], publishImageHashes: [] }); eq((await live(d.id)).reason, 'image_hash_missing');
  });
  await t('Fingerprint bị sửa: hex hợp lệ khác / sai định dạng / sai kiểu → content_mismatch; null → fingerprint_missing', async () => {
    for (const bad of [H('f'), 'abc', 12345, true]) { const d = await mk({}); await db.ref('fbPostDrafts/' + d.id + '/contentFingerprint').set(bad); eq((await live(d.id)).reason, 'content_mismatch', JSON.stringify(bad)); }
    const d = await mk({}); await db.ref('fbPostDrafts/' + d.id + '/contentFingerprint').remove(); eq((await live(d.id)).reason, 'fingerprint_missing');
  });
  await t('Nội dung bị đổi SAU preview (caption / aiCaption / pageId / URL ảnh) → content_mismatch', async () => {
    const mkImg = () => mk({ publishImages: ['https://i/1.jpg'], publishImageHashes: [{ url: 'https://i/1.jpg', sha256: H('a') }] });
    for (const [field, val] of [['caption', 'sửa lén'], ['aiCaption', 'sửa lén'], ['pageId', 'pageEvil'], ['publishImages', ['https://evil/2.jpg']]]) {
      const d = await mkImg(); await db.ref('fbPostDrafts/' + d.id + '/' + field).set(val); eq((await live(d.id)).reason, 'content_mismatch', field);
    }
  });
  await t('publishImageHashes sai định dạng (chuỗi / phần tử không phải {url,sha256 hex}) → từ chối (fail-closed), không chuẩn hoá thành []', async () => {
    for (const bad of ['x', [123], [{ url: 'u' }], [{ url: 'u', sha256: 'zz' }], { a: 1 }]) {
      const d = await mk({}); await db.ref('fbPostDrafts/' + d.id + '/publishImageHashes').set(bad); eq((await live(d.id)).reason, 'content_mismatch', JSON.stringify(bad));
    }
  });
  await t('applyEditTransaction (draft chỉ-chữ): đổi nội dung → fingerprint tính lại; duyệt v2 commit, v1 bị từ chối', async () => {
    const d = await mk({ aiCaption: 'CU' }); const e = await store.applyEditTransaction(d.id, { aiCaption: 'MOI', caption: 'MOI' }); eq(e.committed, true);
    eq((await store.approveTransaction(d.id, { expectedVersion: 1, requireFingerprint: true })).reason, 'version_mismatch');
    eq((await store.approveTransaction(d.id, { expectedVersion: 2, requireFingerprint: true })).committed, true);
  });
  await t('Draft CŨ không fingerprint: đăng thật bị từ chối; edit/retry KHÔNG tự tạo fingerprint', async () => {
    const d = await mk({}); await db.ref('fbPostDrafts/' + d.id + '/contentFingerprint').remove();
    eq((await live(d.id)).reason, 'fingerprint_missing'); eq((await raw(d.id)).contentFingerprint, undefined);
    await store.applyEditTransaction(d.id, { aiCaption: 'x', caption: 'x' }); eq((await raw(d.id)).contentFingerprint, undefined, 'edit không tạo');
    await db.ref('fbPostDrafts/' + d.id).update({ status: 'FAILED', failStage: 'publish' }); await store.retryFailedPublish(d.id); eq((await raw(d.id)).contentFingerprint, undefined, 'retry không tạo');
  });

  console.log('\n[B1 — luồng route đầy đủ trên RTDB thật (Graph = stub)]');
  await t('Draft CHỈ-CHỮ tạo qua POST /drafts → bấm Duyệt (đăng thật) → đăng ĐÚNG 1 lần, PUBLISHED', async () => {
    await setupLive();
    const c = await routeCreate({ pageId: 'page1', caption: 'Chỉ chữ B1' }); eq(c.success, true, JSON.stringify(c)); const id = c.data.draftId;
    await Promise.all([approveCb(id, 1), approveCb(id, 1), approveCb(id, 1)]);
    eq(g.feedPosts, 1, 'feed POST'); eq(g.photoPosts, 0); const s = await raw(id); eq(s.status, 'PUBLISHED'); eq(s.facebookPostId, 'page1_701'); eq(g.other.length, 0);
  });
  await t('Draft 1 ảnh qua POST /drafts → Duyệt → upload 1 + feed 1; sửa chỉ-chữ rồi duyệt v2 vẫn đăng được', async () => {
    await setupLive(); const u = 'https://img.test/b1.jpg'; bytes[u] = Buffer.from('B1-BYTES');
    const c = await routeCreate({ pageId: 'page1', caption: 'Có ảnh B1', imageUrls: [u] }); eq(c.success, true, JSON.stringify(c)); const id = c.data.draftId;
    eq((await raw(id)).publishImageHashes[0].sha256, crypto.createHash('sha256').update(bytes[u]).digest('hex'));
    const ed = await routeEdit(id, { caption: 'Có ảnh B1 (sửa)' }); eq(ed.success, true, JSON.stringify(ed)); eq(ed.data.version, 2);
    await approveCb(id, 1); eq(g.feedPosts, 0, 'nút v1 vô hiệu'); await approveCb(id, 2);
    eq(g.feedPosts, 1); eq(g.photoPosts, 1); eq((await raw(id)).status, 'PUBLISHED');
  });
  await t('Draft chỉ-chữ: sửa nội dung trực tiếp trong RTDB sau preview → Duyệt bị từ chối, 0 POST', async () => {
    await setupLive(); const c = await routeCreate({ pageId: 'page1', caption: 'Gốc' }); const id = c.data.draftId;
    await db.ref('fbPostDrafts/' + id + '/caption').set('Bị sửa'); await approveCb(id, 1); eq(g.feedPosts, 0); eq((await raw(id)).status, 'PENDING_APPROVAL');
  });

  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' pass, ' + fail + ' fail');
  if (failures.length) console.log(failures.join('\n'));
  await db.ref('/').set(null);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED: lỗi không mong đợi', e); process.exit(1); });
