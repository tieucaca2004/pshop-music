/*
 * tests/founderRecovery.emulator.test.js — Founder Recovery trên RTDB ENGINE THẬT (Firebase Database Emulator): tranh chấp transaction thật.
 * Phạm vi: tầng fbDraftStore (confirmPostedTransaction / confirmNotPostedTransaction / markPublishing / reconcilePublished / retryFailedPublish).
 * Facebook/Telegram không được gọi (không cần). Logic xác minh Graph được kiểm ở tests/founderRecovery.test.js (MOCK).
 *
 * Chạy (cần emulator database trên localhost), cùng cách với fingerprintRtdb.emulator.test.js:
 *   java -jar ~/.cache/firebase/emulators/firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9123
 *   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9123 node tests/founderRecovery.emulator.test.js
 * Từ chối chạy nếu host không phải localhost (không bao giờ chạm production).
 */
'use strict';
const hostDb = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(hostDb)) { console.error('Từ chối chạy: cần FIREBASE_DATABASE_EMULATOR_HOST trên localhost.'); process.exit(2); }
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GCLOUD_PROJECT = 'demo-pshop';

const path = require('path');
const rq = require('module').createRequire(path.join(__dirname, '..') + '/index.js');
const admin = rq('firebase-admin');
admin.initializeApp({ projectId: 'demo-pshop', databaseURL: 'http://' + hostDb + '?ns=demo-pshop' });
const { getDatabase, ServerValue } = rq('firebase-admin/database');
admin.database = getDatabase; admin.database.ServerValue = ServerValue; // giống shim ở index.js
const db = admin.database();
const store = rq('./shared/fbDraftStore');

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'eq') + ': mong đợi ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a)); };
const raw = async (id) => (await db.ref('fbPostDrafts/' + id).once('value')).val();
const MIN = 60000;
async function stuckDraft(opts) {
  opts = opts || {};
  const d = await store.createDraft({ pageId: '123456', caption: 'Cap ' + Math.random(), requestedBy: 'x' });
  await store.updateStatus(d.id, 'PROCESSING');
  await store.updateStatus(d.id, 'PENDING_APPROVAL');
  const a = await store.approveTransaction(d.id, { expectedVersion: 1 });
  if (!a.committed) throw new Error('approve: ' + a.reason);
  const m = await store.markPublishing(d.id);
  if (!m.committed) throw new Error('markPublishing: ' + m.reason);
  await db.ref('fbPostDrafts/' + d.id + '/publishStartedAt').set(Date.now() - (opts.ageMin || 60) * MIN);
  if (opts.unknown) { await db.ref('fbPostDrafts/' + d.id).update({ status: 'FAILED', failStage: 'publish_unknown' }); }
  return d;
}
const actor = { uid: 'uid_super', telegramId: '888' };
const auditOf = (r) => Object.values(r.recoveryAudit || {});

(async () => {
  console.log('\n[RTDB ENGINE THẬT — tranh chấp Founder Recovery, không gọi Facebook]');
  await t('E1. 8 confirmPosted đồng thời (cùng draft, cùng Post ID) → đúng 1 commit, PUBLISHED, 1 audit', async () => {
    const d = await stuckDraft();
    const rs = await Promise.all(Array.from({ length: 8 }, () => store.confirmPostedTransaction(d.id, { postId: '123456_777', actor })));
    eq(rs.filter((r) => r.committed).length, 1); const r = await raw(d.id);
    eq(r.status, 'PUBLISHED'); eq(r.facebookPostId, '123456_777'); eq(auditOf(r).length, 1); eq(auditOf(r)[0].byUid, 'uid_super'); eq(auditOf(r)[0].pageId, '123456');
  });
  await t('E2. 8 confirmNotPosted đồng thời → đúng 1 commit, FAILED(publish), 1 audit', async () => {
    const d = await stuckDraft();
    const rs = await Promise.all(Array.from({ length: 8 }, () => store.confirmNotPostedTransaction(d.id, { actor })));
    eq(rs.filter((r) => r.committed).length, 1); const r = await raw(d.id);
    eq(r.status, 'FAILED'); eq(r.failStage, 'publish'); eq(auditOf(r).length, 1);
  });
  await t('E3. confirmPosted ⟂ confirmNotPosted đồng thời (×6 mỗi loại) → đúng MỘT đường thắng, trạng thái nhất quán', async () => {
    for (let i = 0; i < 5; i++) {
      const d = await stuckDraft();
      const jobs = [];
      for (let k = 0; k < 6; k++) { jobs.push(store.confirmPostedTransaction(d.id, { postId: '123456_900', actor })); jobs.push(store.confirmNotPostedTransaction(d.id, { actor })); }
      const rs = await Promise.all(jobs); eq(rs.filter((r) => r.committed).length, 1, 'vòng ' + i); const r = await raw(d.id);
      const okA = r.status === 'PUBLISHED' && r.facebookPostId === '123456_900'; const okB = r.status === 'FAILED' && r.failStage === 'publish' && !r.facebookPostId;
      if (!(okA || okB)) throw new Error('trạng thái không nhất quán: ' + r.status + '/' + r.failStage + '/' + r.facebookPostId); eq(auditOf(r).length, 1);
    }
  });
  await t('E4. confirmPosted ⟂ reconcilePublished đồng thời → đúng 1 thắng; Post ID không bị ghi đè', async () => {
    const d = await stuckDraft(); const jobs = [];
    for (let k = 0; k < 4; k++) { jobs.push(store.confirmPostedTransaction(d.id, { postId: '123456_11', actor })); jobs.push(store.reconcilePublished(d.id, '123456_22')); }
    const rs = await Promise.all(jobs); eq(rs.filter((r) => r.committed).length, 1); const r = await raw(d.id); eq(r.status, 'PUBLISHED');
    assert2(r.facebookPostId === '123456_11' || r.facebookPostId === '123456_22', 'Post ID là của đúng một đường');
  });
  await t('E5. confirmNotPosted ⟂ markPublishing: draft APPROVED không thể bị mở khoá (không recoverable), PUBLISHING không bị ép lại', async () => {
    const d = await store.createDraft({ pageId: '123456', caption: 'E5', requestedBy: 'x' });
    await store.updateStatus(d.id, 'PROCESSING'); await store.updateStatus(d.id, 'PENDING_APPROVAL'); await store.approveTransaction(d.id, { expectedVersion: 1 });
    eq((await store.confirmNotPostedTransaction(d.id, { actor })).reason, 'not_recoverable'); eq((await raw(d.id)).status, 'APPROVED');
    eq((await store.confirmPostedTransaction(d.id, { postId: '123456_5', actor })).reason, 'not_recoverable');
  });
  await t('E6. Sau mở khoá: retry chỉ mở được MỘT lần; vẫn phải approve lại (version tăng); recoveryAudit được giữ nguyên qua retry', async () => {
    const d = await stuckDraft(); eq((await store.confirmNotPostedTransaction(d.id, { actor })).committed, true);
    const rs = await Promise.all(Array.from({ length: 4 }, () => store.retryFailedPublish(d.id))); eq(rs.filter((r) => r.committed).length, 1);
    const r = await raw(d.id); eq(r.status, 'PENDING_APPROVAL'); eq(r.version, 2); eq(auditOf(r).length, 1);
    eq((await store.approveTransaction(d.id, { expectedVersion: 1 })).committed, false, 'version cũ không duyệt được');
  });
  await t('E7. appendRecoveryAudit: ghi cho draft có thật; draft không tồn tại ⇒ KHÔNG tạo node rác', async () => {
    const d = await stuckDraft(); eq(await store.appendRecoveryAudit(d.id, { action: 'x', result: 'denied:test' }), true); eq(auditOf(await raw(d.id)).length, 1);
    eq(await store.appendRecoveryAudit('no_such_draft_zz', { action: 'x' }), false); eq(await raw('no_such_draft_zz'), null);
  });
  await t('E8. Tuổi tối thiểu được ép ở tầng store trên RTDB thật (10 phút → too_recent)', async () => {
    const d = await stuckDraft({ ageMin: 10 }); eq((await store.confirmNotPostedTransaction(d.id, { minAgeMs: 0, actor })).reason, 'too_recent'); eq((await raw(d.id)).status, 'PUBLISHING');
  });

  // ── Claim Post ID nguyên tử (fbPostIdClaims) — tranh chấp transaction THẬT ──
  const claim = async (id) => (await db.ref('fbPostIdClaims/' + id).once('value')).val();
  const cwc = (id, postId) => store.confirmPostedWithClaim(id, { postId, actor });
  await t('E9. 10 draft KHÁC NHAU cùng xác nhận 1 Post ID đồng thời → đúng 1 draft PUBLISHED, 9 draft còn khoá, đúng 1 draft giữ Post ID', async () => {
    const ds = []; for (let i = 0; i < 10; i++) ds.push(await stuckDraft());
    const rs = await Promise.all(ds.map((d) => cwc(d.id, '123456_4242')));
    eq(rs.filter((r) => r.committed).length, 1, 'đúng 1 thắng');
    const rows = await Promise.all(ds.map((d) => raw(d.id)));
    eq(rows.filter((r) => r.facebookPostId === '123456_4242').length, 1, 'đúng 1 draft giữ Post ID');
    eq(rows.filter((r) => r.status === 'PUBLISHED').length, 1); eq(rows.filter((r) => r.status === 'PUBLISHING').length, 9);
    const w = ds[rows.findIndex((r) => r.status === 'PUBLISHED')]; eq((await claim('123456_4242')).draftId, w.id);
  });
  await t('E10. Lặp 15 vòng: 2 draft × (confirmPosted ⟂ reconcilePublished-qua-claim) cùng Post ID → luôn đúng 1 chủ', async () => {
    for (let i = 0; i < 15; i++) {
      const a = await stuckDraft(); const b = await stuckDraft(); const pid = '123456_' + (5000 + i);
      const rs = await Promise.all([cwc(a.id, pid), store.withPostIdClaim(b.id, pid, actor, () => store.reconcilePublished(b.id, pid)), cwc(b.id, pid), store.withPostIdClaim(a.id, pid, actor, () => store.reconcilePublished(a.id, pid))]);
      const holders = [(await raw(a.id)), (await raw(b.id))].filter((r) => r.facebookPostId === pid);
      eq(holders.length, 1, 'vòng ' + i + ': số draft giữ Post ID'); eq((await claim(pid)).draftId, (await raw(a.id)).facebookPostId === pid ? a.id : b.id);
      assert2(rs.filter((r) => r.committed).length >= 1, 'có người thắng');
    }
  });
  await t('E11. Hai Post ID khác nhau cho hai draft (đồng thời) → cả hai thành công', async () => {
    const a = await stuckDraft(); const b = await stuckDraft();
    const [ra, rb] = await Promise.all([cwc(a.id, '123456_61'), cwc(b.id, '123456_62')]);
    eq(ra.committed && rb.committed, true); eq((await claim('123456_61')).draftId, a.id); eq((await claim('123456_62')).draftId, b.id);
  });
  await t('E12. Claim kẹt (chủ chưa hoàn tất): chủ chạy lại hoàn tất; draft khác bị chặn < 5 phút, tiếp quản > 5 phút; không ghi đè claim đã PUBLISHED', async () => {
    const owner = await stuckDraft(); const other = await stuckDraft();
    await db.ref('fbPostIdClaims/123456_71').set({ draftId: owner.id, at: Date.now() - MIN, byUid: 'x' });
    eq((await cwc(other.id, '123456_71')).reason, 'claim_in_progress'); eq((await claim('123456_71')).draftId, owner.id);
    eq((await cwc(owner.id, '123456_71')).committed, true);
    const o2 = await stuckDraft(); const t2 = await stuckDraft();
    await db.ref('fbPostIdClaims/123456_72').set({ draftId: o2.id, at: Date.now() - 10 * MIN, byUid: 'x' });
    const rs = await Promise.all([cwc(t2.id, '123456_72'), cwc(other.id, '123456_72')]);
    eq(rs.filter((r) => r.committed).length, 1, 'tiếp quản đồng thời: đúng 1 thắng'); eq((await claim('123456_72')).tookOverFrom, o2.id);
    const late = await stuckDraft(); await db.ref('fbPostIdClaims/123456_71/at').set(Date.now() - 60 * MIN);
    eq((await cwc(late.id, '123456_71')).reason, 'post_already_claimed'); eq((await claim('123456_71')).draftId, owner.id);
  });
  await t('E13. Chốt draft thất bại → claim được giải phóng; draft cũ có sẵn facebookPostId (không claim) → từ chối và không để lại claim', async () => {
    const d = await store.createDraft({ pageId: '123456', caption: 'E13', requestedBy: 'x' });
    eq((await cwc(d.id, '123456_81')).committed, false); eq(await claim('123456_81'), null, 'không còn claim');
    const legacy = await stuckDraft(); await db.ref('fbPostDrafts/' + legacy.id).update({ status: 'PUBLISHED', facebookPostId: '123456_82' });
    const x = await stuckDraft(); eq((await cwc(x.id, '123456_82')).reason, 'post_already_claimed'); eq(await claim('123456_82'), null);
  });

  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' pass, ' + fail + ' fail');
  await db.ref('/').set(null); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('lỗi', e); process.exit(2); });
function assert2(c, m) { if (!c) throw new Error(m); }
