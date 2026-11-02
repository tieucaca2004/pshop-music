/*
 * shared/fbDraftStore.js — State machine cho Facebook Post Drafts.
 *
 * Lưu trữ trên Firebase Realtime Database (RTDB), node `fbPostDrafts/{draftId}`.
 * KHÔNG dùng Firestore — toàn bộ PSH Platform dùng admin.database().
 *
 * Lifecycle bài đăng:
 *   RECEIVED → PROCESSING → PENDING_APPROVAL → APPROVED → PUBLISHING → PUBLISHED
 *                        ↘ FAILED               ↘ CANCELLED             ↘ FAILED
 *
 * Schema một bản ghi fbPostDrafts/{draftId}:
 *   id: string (RTDB push key)
 *   telegramUpdateId: number | null    — dùng cho idempotency check
 *   pageId: string                     — Facebook Page ID đích
 *   caption: string                    — caption gốc từ user
 *   imageUrls: string[]                — URLs ảnh gốc do user cung cấp
 *   generatedImageUrl: string | null   — URL ảnh do AI sinh ra (image-generator)
 *   requestedBy: string                — uid hoặc 'openclaw' / 'telegram'
 *   status: string                     — trạng thái hiện tại (xem VALID_TRANSITIONS)
 *   version: number                    — bộ đếm phiên bản, tăng mỗi khi draft được chỉnh sửa
 *                                        — dùng để vô hiệu hoá approve button cũ
 *   aiCaption: string | null           — caption do AI sinh ra (sau PROCESSING)
 *   telegramMessageId: number | null   — message_id Telegram preview đã gửi
 *   telegramChatId: string | null      — chat_id đã gửi preview
 *   createdAt: number                  — timestamp ms
 *   updatedAt: number                  — timestamp ms (ServerValue.TIMESTAMP)
 *   publishedAt: number | null         — timestamp ms khi PUBLISHED
 *   facebookPostId: string | null      — post id trả về từ Graph API
 *   failReason: string | null          — lý do FAILED
 *
 * Sprint 15 Phase FB — PSH Facebook Auto-Publisher.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

const DRAFTS_NODE = 'fbPostDrafts';
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000; // bản xem trước chỉ duyệt được trong 24 giờ kể từ lúc tạo draft

// Transitions hợp lệ: từ trạng thái A có thể chuyển sang trạng thái nào.
// Export để test suite kiểm tra không cần Firebase.
const VALID_TRANSITIONS = {
  RECEIVED: ['PROCESSING'],
  PROCESSING: ['PENDING_APPROVAL', 'FAILED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PUBLISHING'],
  PUBLISHING: ['PUBLISHED', 'FAILED']
};

// publishImageList — DANH SÁCH ẢNH SẼ ĐĂNG (đã khử trùng, giữ thứ tự). Dùng chung cho fingerprint, hash ảnh, đối soát và route đăng.
// Có publishImages (pipeline Telegram chốt) ⇒ chỉ dùng nó; bản nháp cũ: ảnh AI trước rồi ảnh gốc.
function publishImageList(d) {
  const out = [];
  const add = (u) => { if (typeof u === 'string' && u && out.indexOf(u) < 0) out.push(u); };
  if (Array.isArray(d.publishImages) && d.publishImages.length > 0) d.publishImages.forEach(add);
  else { add(d.generatedImageUrl); (Array.isArray(d.imageUrls) ? d.imageUrls : []).forEach(add); }
  return out;
}

// contentFingerprint — dấu vân tay của ĐÚNG những gì người duyệt thấy: Page đích + nội dung đăng + danh sách ảnh đăng
// + SHA256 byte ảnh (publishImageHashes, nếu có). Chốt khi draft vào PENDING_APPROVAL (và mỗi lần sửa); approveTransaction so lại →
// nội dung/ảnh/Page bị đổi ngoài đường sửa chính thức (version) sẽ KHÔNG được đăng.
// canonicalImageHashes — dạng CHUẨN của publishImageHashes cho fingerprint. RTDB KHÔNG lưu mảng rỗng (đọc lại ra undefined) nên
// "không có ảnh" PHẢI có đúng 1 dạng chuẩn dù trường là [] hay vắng mặt: luôn []. Có ảnh: giữ NGUYÊN thứ tự & giá trị [url, sha256].
// Dữ liệu sai định dạng (không phải mảng / phần tử không phải object) KHÔNG được chuẩn hoá thành [] — trả sentinel khác để fingerprint
// không khớp và approve bị từ chối (fail-closed).
function canonicalImageHashes(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return ['__invalid_hashes__'];
  return v.map((h) => (h && typeof h === 'object' && !Array.isArray(h) ? [h.url, h.sha256] : '__invalid_hash__'));
}
// hashesShapeValid — publishImageHashes (nếu có) phải là mảng {url:string, sha256:64 hex}. Sai định dạng ⇒ approveTransaction từ chối.
function hashesShapeValid(v) {
  if (v === undefined || v === null) return true;
  return Array.isArray(v) && v.every((h) => h && typeof h === 'object' && typeof h.url === 'string' && h.url && /^[0-9a-f]{64}$/.test(String(h.sha256)));
}
function contentFingerprint(d) {
  const hashes = canonicalImageHashes(d.publishImageHashes);
  const canon = JSON.stringify([String(d.pageId || ''), String(d.aiCaption || d.caption || ''), publishImageList(d), hashes]);
  return crypto.createHash('sha256').update(canon).digest('hex');
}
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

// getDraft — đọc 1 draft theo id. Trả về object có id, hoặc null nếu không tồn tại.
async function getDraft(draftId) {
  if (!draftId) return null;
  const snap = await admin.database().ref(DRAFTS_NODE + '/' + draftId).once('value');
  if (!snap.exists()) return null;
  return Object.assign({ id: draftId }, snap.val());
}

// createDraft — tạo draft mới ở trạng thái RECEIVED.
// Trả về bản ghi đã tạo (có id).
async function createDraft({ telegramUpdateId, pageId, caption, imageUrls, requestedBy, extra }) {
  const ref = admin.database().ref(DRAFTS_NODE).push();
  const draftId = ref.key;
  const now = Date.now();
  const record = {
    telegramUpdateId: telegramUpdateId || null,
    pageId: pageId || '',
    caption: caption || '',
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    generatedImageUrl: null,
    requestedBy: requestedBy || '',
    status: 'RECEIVED',
    version: 1,
    aiCaption: null,
    telegramMessageId: null,
    telegramChatId: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    facebookPostId: null,
    failReason: null
  };
  // extra: trường mở rộng của pipeline Telegram (source, product, telegramUserId, steps...). Không cho ghi đè
  // các trường cốt lõi của state machine.
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) { if (!(k in record)) record[k] = extra[k]; }
  }
  await ref.set(record);
  return Object.assign({ id: draftId }, record);
}

// updateStatus — cập nhật trạng thái + fields bổ sung (tuỳ chọn).
// Throw nếu transition không hợp lệ (tránh bug im lặng).
async function updateStatus(draftId, newStatus, extraFields) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error('fbDraftStore: Draft không tồn tại: ' + draftId);
  const allowed = VALID_TRANSITIONS[draft.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      'fbDraftStore: Transition không hợp lệ: ' + draft.status + ' → ' + newStatus +
      '. Được phép: ' + (allowed.join(', ') || 'không có')
    );
  }
  const changes = Object.assign({}, extraFields || {}, {
    status: newStatus,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });
  if (newStatus === 'PENDING_APPROVAL') changes.contentFingerprint = contentFingerprint(Object.assign({}, draft, extraFields || {}));
  await admin.database().ref(DRAFTS_NODE + '/' + draftId).update(changes);
  return getDraft(draftId);
}

// findByTelegramUpdateId — tìm draft theo telegramUpdateId (cho idempotency).
// Scan toàn bộ fbPostDrafts (volume nhỏ, < 100 bản). Trả về bản ghi đầu tiên khớp hoặc null.
async function findByTelegramUpdateId(telegramUpdateId) {
  if (telegramUpdateId === null || telegramUpdateId === undefined) return null;
  const snap = await admin.database().ref(DRAFTS_NODE).once('value');
  if (!snap.exists()) return null;
  const all = snap.val() || {};
  for (const id of Object.keys(all)) {
    if (all[id].telegramUpdateId === telegramUpdateId) {
      return Object.assign({ id }, all[id]);
    }
  }
  return null;
}

// bumpVersion — tăng version counter atomically bằng RTDB transaction.
// Trả về version mới (số nguyên). Dùng khi chỉnh sửa draft để vô hiệu hoá
// approve button cũ (callback_data chứa version tại thời điểm gửi).
async function bumpVersion(draftId) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let newVersion = null;
  const result = await ref.transaction((current) => {
    newVersion = null;
    if (current === null || current === undefined) return null; // lần đầu có thể là cache rỗng — KHÔNG abort (xem ghi chú đầu transaction)
    const v = (typeof current.version === 'number' ? current.version : 1) + 1;
    newVersion = v;
    return Object.assign({}, current, { version: v, updatedAt: Date.now() });
  });
  if (!result.committed || newVersion === null) throw new Error('fbDraftStore: bumpVersion failed — draft không tồn tại: ' + draftId);
  return newVersion;
}

// patchFields — cập nhật các field không phải status trực tiếp (không qua state machine).
// Dùng để lưu generatedImageUrl, aiCaption, imageUrls sau khi chỉnh sửa draft.
async function patchFields(draftId, fields) {
  if (!draftId || !fields || typeof fields !== 'object') return;
  const safeFields = Object.assign({}, fields, { updatedAt: admin.database.ServerValue.TIMESTAMP });
  // Không cho phép patch 'status' qua hàm này — dùng updateStatus().
  delete safeFields.status;
  await admin.database().ref(DRAFTS_NODE + '/' + draftId).update(safeFields);
}

// approveTransaction — atomic check-and-set PENDING_APPROVAL → APPROVED.
// Trả về { committed, currentStatus, reason, draft }.
//   - opts.expectedVersion (G1O): version người duyệt ĐÃ THẤY (trong nút Telegram). Được kiểm
//     TRONG transaction, nên chỉnh sửa xen giữa lúc đọc và lúc duyệt không thể lọt qua.
//   - opts.approvedBy: danh tính người bấm duyệt, lưu vào draft để truy vết.
//   - `draft` = bản ghi ĐÚNG tại thời điểm commit. Nội dung đăng PHẢI lấy từ đây, không đọc lại
//     (đọc lại có thể thấy nội dung vừa bị sửa sau khi duyệt).
// Dùng thay cho getDraft() + updateStatus() trong fb_approve handler để ngăn double-approve.
async function approveTransaction(draftId, opts) {
  const expectedVersion = opts && typeof opts.expectedVersion === 'number' && !isNaN(opts.expectedVersion) ? opts.expectedVersion : null;
  const approvedBy = (opts && opts.approvedBy) || null;
  // requireFingerprint (chế độ ĐĂNG THẬT): draft PHẢI có fingerprint hợp lệ (và hash ảnh nếu có ảnh) — thiếu/null/sai kiểu ⇒ từ chối.
  // KHÔNG bao giờ tự tạo fingerprint cho draft cũ ở đây.
  const requireFingerprint = !!(opts && opts.requireFingerprint === true);
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let currentStatus = null;
  let reason = null;
  let snapshot = null;
  const result = await ref.transaction((current) => {
    reason = null; snapshot = null;
    // RTDB thật: lần gọi đầu có thể nhận null (cache cục bộ rỗng). Trả null (KHÔNG undefined) để SDK gọi lại với giá trị server.
    if (current === null || current === undefined) { currentStatus = null; reason = 'not_found'; return null; }
    currentStatus = current.status;
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; } // abort, không thay đổi
    if (expectedVersion !== null && typeof current.version === 'number' && current.version !== expectedVersion) {
      reason = 'version_mismatch'; return undefined;
    }
    // Nội dung/ảnh/Page phải VẪN là bản đã chốt lúc xem trước.
    if (!hashesShapeValid(current.publishImageHashes)) { reason = 'content_mismatch'; return undefined; }
    const fp = current.contentFingerprint;
    const fpAbsent = fp === undefined || fp === null;
    if (!fpAbsent && !(typeof fp === 'string' && FINGERPRINT_RE.test(fp) && fp === contentFingerprint(current))) {
      reason = 'content_mismatch'; return undefined; // có giá trị nhưng sai kiểu/định dạng/không khớp nội dung hiện tại
    }
    if (requireFingerprint) {
      if (fpAbsent) { reason = 'fingerprint_missing'; return undefined; }
      if (publishImageList(current).length > 0 && !(Array.isArray(current.publishImageHashes) && current.publishImageHashes.length > 0)) { reason = 'image_hash_missing'; return undefined; }
    }
    // Hết hạn duyệt: bản xem trước quá cũ không được đăng (nội dung/ảnh/giá có thể đã lỗi thời). Chỉ áp dụng khi draft CÓ createdAt
    // hợp lệ — draft cũ không có field này vẫn hoạt động như trước (điều kiện loại trừ, không bắt buộc field mới).
    const now = Date.now();
    if (typeof current.createdAt === 'number' && isFinite(current.createdAt) && now - current.createdAt > APPROVAL_TTL_MS) {
      reason = 'expired'; return undefined;
    }
    currentStatus = 'APPROVED'; // sẽ được commit
    const next = Object.assign({}, current, { status: 'APPROVED', updatedAt: now }, approvedBy ? { approvedBy, approvedAt: now } : {});
    snapshot = next;
    return next;
  });
  const committed = !!(result.committed && snapshot);
  return {
    committed,
    currentStatus,
    reason: committed ? null : (reason || 'not_found'),
    draft: committed ? Object.assign({ id: draftId }, snapshot) : null
  };
}

// applyEditTransaction (G1O) — ghi các thay đổi nội dung VÀ tăng version trong MỘT transaction,
// chỉ khi draft còn PENDING_APPROVAL. Trước đây patchFields() rồi bumpVersion() là 2 lệnh ghi
// riêng: nội dung đổi trước khi version đổi, người duyệt bấm nút cũ (version cũ) trong khoảng đó
// sẽ đăng nội dung họ chưa thấy.
async function applyEditTransaction(draftId, patches) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let newVersion = null;
  let reason = null;
  const result = await ref.transaction((current) => {
    newVersion = null; reason = null;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; }
    const safe = Object.assign({}, patches || {});
    delete safe.status; delete safe.version; delete safe.updatedAt;
    newVersion = (typeof current.version === 'number' ? current.version : 1) + 1;
    const merged = Object.assign({}, current, safe, { version: newVersion, updatedAt: Date.now() });
    if (typeof current.contentFingerprint === 'string' && FINGERPRINT_RE.test(current.contentFingerprint)) merged.contentFingerprint = contentFingerprint(merged);
    return merged;
  });
  const ok = !!(result.committed && newVersion !== null);
  return { committed: ok, newVersion: ok ? newVersion : null, reason: ok ? null : (reason || 'not_found') };
}

// retryFailedPublish — cho phép người duyệt hợp lệ đưa một draft FAILED về PENDING_APPROVAL để duyệt lại,
// CHỈ khi lỗi xảy ra ở giai đoạn đăng ('publish') và Facebook CHƯA ghi nhận bài (facebookPostId rỗng) —
// nếu không sẽ có nguy cơ đăng trùng. Tăng version để vô hiệu hoá nút Duyệt cũ. Atomic (transaction).
async function retryFailedPublish(draftId) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let newVersion = null;
  const result = await ref.transaction((current) => {
    reason = null; newVersion = null;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (current.status !== 'FAILED') { reason = 'not_failed'; return undefined; }
    if (current.failStage === 'publish_unknown') { reason = 'publish_outcome_unknown'; return undefined; } // kết quả đăng KHÔNG RÕ: không bao giờ cho retry
    if (current.failStage !== 'publish') { reason = 'not_publish_failure'; return undefined; }
    if (current.facebookPostId) { reason = 'already_posted'; return undefined; }
    newVersion = (typeof current.version === 'number' ? current.version : 1) + 1;
    return Object.assign({}, current, { status: 'PENDING_APPROVAL', version: newVersion, failReason: null, failStage: null, approvedBy: null, approvedAt: null, updatedAt: Date.now() });
  });
  const ok = !!(result.committed && newVersion !== null);
  return { committed: ok, reason: ok ? null : (reason || 'not_found'), newVersion: ok ? newVersion : null };
}
// markPublishing — APPROVED → PUBLISHING NGUYÊN TỬ, ghi publishStartedAt. Route CHỈ được gọi Facebook khi committed === true.
// Loại trừ lẫn nhau với recoverStuckApproved (cùng transaction trên 1 node): không thể vừa "đang đăng" vừa "được mở khoá".
async function markPublishing(draftId) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let done = false;
  const result = await ref.transaction((current) => {
    reason = null; done = false;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (current.status !== 'APPROVED') { reason = 'not_approved'; return undefined; }
    done = true;
    return Object.assign({}, current, { status: 'PUBLISHING', publishStartedAt: Date.now(), updatedAt: Date.now() });
  });
  const ok = !!(result.committed && done);
  return { committed: ok, reason: ok ? null : (reason || 'not_found') };
}

// recoverStuckApproved — draft kẹt APPROVED (function chết giữa lúc duyệt và lúc đánh dấu PUBLISHING). Vì mọi lệnh gọi Facebook
// nằm SAU markPublishing, APPROVED mà chưa có publishStartedAt/facebookPostId nghĩa là CHƯA từng gọi Facebook ⇒ đưa về FAILED(publish)
// để người duyệt dùng /retry. Chỉ khi đã quá minAgeMs (tránh đè handler còn đang chạy). Mọi dấu hiệu khác ⇒ KHÔNG mở khoá.
async function recoverStuckApproved(draftId, opts) {
  const minAgeMs = (opts && opts.minAgeMs) || 2 * 60 * 1000;
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let done = false;
  const result = await ref.transaction((current) => {
    reason = null; done = false;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (current.status !== 'APPROVED') { reason = 'not_approved'; return undefined; }
    if (current.publishStartedAt || current.facebookPostId || current.publishRecordFailed) { reason = 'has_publish_traces'; return undefined; }
    const at = current.approvedAt;
    if (typeof at !== 'number' || !isFinite(at) || at <= 0) { reason = 'approved_time_unknown'; return undefined; }
    if (Date.now() - at < minAgeMs) { reason = 'too_recent'; return undefined; }
    done = true;
    return Object.assign({}, current, { status: 'FAILED', failStage: 'publish', failReason: 'Kẹt ở APPROVED, chưa từng gọi Facebook (đã kiểm: không có publishStartedAt/Post ID).', recoveredAt: Date.now(), updatedAt: Date.now() });
  });
  const ok = !!(result.committed && done);
  return { committed: ok, reason: ok ? null : (reason || 'not_found') };
}

// listAll — toàn bộ draft (volume nhỏ) để đối soát kiểm tra trùng/đối thủ cạnh tranh.
async function listAll() {
  const snap = await admin.database().ref(DRAFTS_NODE).once('value');
  if (!snap.exists()) return [];
  const all = snap.val() || {};
  return Object.keys(all).map((id) => Object.assign({ id }, all[id]));
}

// reconcilePublished — ĐỐI SOÁT: draft kẹt PUBLISHING (hoặc FAILED/publish_unknown) nhưng đã biết chắc Facebook có bài
// (postId lấy từ draft.facebookPostId hoặc do đối soát với Fanpage) → chốt PUBLISHED, KHÔNG đăng lại. Atomic.
async function reconcilePublished(draftId, postId) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let done = null;
  const result = await ref.transaction((current) => {
    reason = null; done = null;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    const pid = postId || current.facebookPostId;
    if (!pid) { reason = 'no_post_id'; return undefined; }
    const ok = current.status === 'PUBLISHING' || (current.status === 'FAILED' && current.failStage === 'publish_unknown');
    if (!ok) { reason = 'not_reconcilable'; return undefined; }
    done = Object.assign({}, current, { status: 'PUBLISHED', facebookPostId: String(pid), publishedAt: current.publishedAt || Date.now(), reconciledAt: Date.now(), failReason: null, failStage: null, updatedAt: Date.now() });
    return done;
  });
  const ok = !!(result.committed && done);
  return { committed: ok, reason: ok ? null : (reason || 'not_found'), draft: ok ? Object.assign({ id: draftId }, done) : null };
}

// ── FOUNDER RECOVERY (draft kẹt PUBLISHING / FAILED(publish_unknown)) ───────────────────────────────────────────
// Chỉ 2 đường thoát, đều là transaction trên đúng node draft (loại trừ lẫn nhau và với markPublishing/reconcile):
//   • confirmPostedTransaction    — chốt PUBLISHED với Post ID ĐÃ được caller xác minh với Facebook (store tự kiểm Page qua tiền tố id).
//   • confirmNotPostedTransaction — đưa về FAILED(publish) (mở /retry) CHỈ khi caller đã có bằng chứng; store ép thêm: không có Post ID,
//                                   publishStartedAt hợp lệ và đã đủ lâu (instance chắc chắn đã chết, không còn POST nào đang bay).
// Mỗi lần đổi trạng thái ghi kèm bản ghi kiểm toán TRONG CÙNG transaction (recoveryAudit/{key}) — không thể đổi mà thiếu dấu vết.
const RECOVERABLE_MIN_NOT_POSTED_MS = 45 * 60 * 1000;
function recoveryKey() { return String(Date.now()) + '_' + crypto.randomBytes(3).toString('hex'); }
function isRecoverable(d) { return d.status === 'PUBLISHING' || (d.status === 'FAILED' && d.failStage === 'publish_unknown'); }
async function confirmPostedTransaction(draftId, opts) {
  const postId = String(opts && opts.postId || '');
  const actor = (opts && opts.actor) || {};
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  const key = recoveryKey(); let reason = null; let done = null;
  const result = await ref.transaction((current) => {
    reason = null; done = null;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (!/^[A-Za-z0-9]{1,40}_\d{1,25}$/.test(postId) || postId.split('_')[0] !== String(current.pageId)) { reason = 'page_mismatch'; return undefined; }
    if (!isRecoverable(current)) { reason = 'not_recoverable'; return undefined; }
    if (current.facebookPostId && String(current.facebookPostId) !== postId) { reason = 'post_id_conflict'; return undefined; }
    const now = Date.now();
    const entry = { at: now, action: 'confirm_posted', result: 'confirmed', byUid: actor.uid || null, byTelegramId: actor.telegramId || null, pageId: String(current.pageId), postId, from: current.status + (current.failStage ? '/' + current.failStage : ''), evidence: (opts && opts.evidence) || null };
    done = Object.assign({}, current, { status: 'PUBLISHED', facebookPostId: postId, publishedAt: current.publishedAt || now, reconciledAt: now, failReason: null, failStage: null, updatedAt: now,
      manualRecovery: { action: 'confirm_posted', at: now, byUid: entry.byUid, byTelegramId: entry.byTelegramId, postId } });
    done.recoveryAudit = Object.assign({}, current.recoveryAudit || {}, { [key]: entry });
    return done;
  });
  const ok = !!(result.committed && done);
  return { committed: ok, reason: ok ? null : (reason || 'not_found'), draft: ok ? Object.assign({ id: draftId }, done) : null };
}
async function confirmNotPostedTransaction(draftId, opts) {
  const actor = (opts && opts.actor) || {};
  const minAge = Math.max(RECOVERABLE_MIN_NOT_POSTED_MS, Number(opts && opts.minAgeMs) || 0);
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  const key = recoveryKey(); let reason = null; let done = null;
  const result = await ref.transaction((current) => {
    reason = null; done = null;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    if (!isRecoverable(current)) { reason = 'not_recoverable'; return undefined; }
    if (current.facebookPostId) { reason = 'has_post_id'; return undefined; }
    const started = current.publishStartedAt; const now = Date.now();
    if (typeof started !== 'number' || !isFinite(started) || started <= 0 || started > now) { reason = 'missing_publish_started_at'; return undefined; }
    if (now - started < minAge) { reason = 'too_recent'; return undefined; }
    const entry = { at: now, action: 'confirm_not_posted', result: 'unlocked_for_retry', byUid: actor.uid || null, byTelegramId: actor.telegramId || null, pageId: String(current.pageId), from: current.status + (current.failStage ? '/' + current.failStage : ''), evidence: (opts && opts.evidence) || null };
    done = Object.assign({}, current, { status: 'FAILED', failStage: 'publish', failReason: 'Founder xác nhận CHƯA đăng (đã đối chiếu Fanpage: cửa sổ rỗng) — có thể /retry', updatedAt: now,
      manualRecovery: { action: 'confirm_not_posted', at: now, byUid: entry.byUid, byTelegramId: entry.byTelegramId } });
    done.recoveryAudit = Object.assign({}, current.recoveryAudit || {}, { [key]: entry });
    return done;
  });
  const ok = !!(result.committed && done);
  return { committed: ok, reason: ok ? null : (reason || 'not_found'), draft: ok ? Object.assign({ id: draftId }, done) : null };
}
// ── CLAIM POST ID NGUYÊN TỬ (fbPostIdClaims/{postId}) ─────────────────────────────────────────────────────────
// RTDB không có transaction đa-node ⇒ KHÔNG thể vừa "ghi claim" vừa "đổi draft" trong một bước. Thay vào đó (hai pha, có phục hồi):
//   1) claim: transaction trên fbPostIdClaims/{postId} — chỉ MỘT draft giữ được; draft khác bị từ chối (không ghi đè);
//   2) legacy check: không draft nào khác (kể cả draft cũ chưa có claim) đang giữ facebookPostId này;
//   3) chạy transaction đổi draft → PUBLISHED;
//   4) thất bại/ném lỗi ⇒ giải phóng claim (chỉ phần do CHÍNH lần gọi này tạo ra). Sập giữa 1 và 3 ⇒ claim "kẹt":
//      • chính draft đó chạy lại ⇒ nhận lại claim (idempotent);
//      • draft KHÁC chỉ được tiếp quản khi claim cũ hơn CLAIM_STALE_MS (> 2× timeout Function ⇒ lần chốt dở không thể còn chạy)
//        VÀ draft chủ claim không giữ Post ID này. Draft chủ đã PUBLISHED với Post ID này ⇒ không bao giờ bị tiếp quản.
const CLAIMS_NODE = 'fbPostIdClaims';
const CLAIM_STALE_MS = 5 * 60 * 1000;
const CLAIM_POST_ID_RE = /^[A-Za-z0-9_-]{1,100}$/; // khoá RTDB an toàn; định dạng Post ID chặt hơn do caller kiểm
async function claimPostId(postId, draftId, actor) {
  if (!CLAIM_POST_ID_RE.test(String(postId))) return { ok: false, reason: 'bad_post_id' };
  const ref = admin.database().ref(CLAIMS_NODE + '/' + postId);
  const mine = { draftId, at: Date.now(), byUid: (actor && actor.uid) || null };
  let seen = null; let outcome = null;
  const r1 = await ref.transaction((cur) => {
    outcome = null; seen = null;
    if (cur === null || cur === undefined) { outcome = 'fresh'; return mine; }
    if (cur && cur.draftId === draftId) { outcome = 'owned'; return undefined; }
    seen = cur; outcome = 'other'; return undefined;
  });
  if (outcome === 'fresh' && r1.committed) return { ok: true, fresh: true };
  if (outcome === 'owned') return { ok: true, fresh: false };
  if (outcome !== 'other') return { ok: false, reason: 'claim_lost' };
  if (!seen || typeof seen !== 'object' || typeof seen.draftId !== 'string' || !seen.draftId) return { ok: false, reason: 'claim_corrupt' }; // claim hỏng => fail-closed, không tiếp quản
  // Claim thuộc draft khác: chỉ tiếp quản khi chắc chắn là claim kẹt.
  const owner = await getDraft(seen.draftId);
  if (owner && owner.status === 'PUBLISHED' && String(owner.facebookPostId) === String(postId)) return { ok: false, reason: 'post_already_claimed' };
  if (!(typeof seen.at === 'number') || Date.now() - seen.at < CLAIM_STALE_MS) return { ok: false, reason: 'claim_in_progress' };
  let took = false;
  const r2 = await ref.transaction((cur) => {
    took = false;
    // RTDB chạy hàm này lần đầu với giá trị cache cục bộ (có thể null) — KHÔNG được abort ở lần đó, trả giá trị dự đoán để server đối chiếu rồi chạy lại với giá trị thật.
    if (cur === null || cur === undefined || (cur.draftId === seen.draftId && cur.at === seen.at)) { took = true; return Object.assign({}, mine, { tookOverFrom: seen.draftId }); }
    took = false; return undefined;
  });
  return r2.committed && took ? { ok: true, fresh: true, tookOver: true } : { ok: false, reason: 'claim_lost' };
}
async function releasePostIdClaim(postId, draftId) {
  const ref = admin.database().ref(CLAIMS_NODE + '/' + postId);
  try { await ref.transaction((cur) => (cur === null || cur === undefined || cur.draftId === draftId ? null : undefined)); } catch (e) { console.error('[fbDraftStore] không giải phóng được claim (sẽ được phục hồi bằng idempotent/stale takeover)'); }
}
// withPostIdClaim — chạy fn() (transaction đổi draft) khi và chỉ khi giữ được claim; fn trả { committed, reason }.
async function withPostIdClaim(draftId, postId, actor, fn) {
  const c = await claimPostId(postId, draftId, actor);
  if (!c.ok) return { committed: false, reason: c.reason, draft: null };
  let result;
  try {
    const all = await listAll();
    if (all.some((d) => d.id !== draftId && d.facebookPostId && String(d.facebookPostId) === String(postId))) {
      if (c.fresh) await releasePostIdClaim(postId, draftId);
      return { committed: false, reason: 'post_already_claimed', draft: null };
    }
    result = await fn();
  } catch (e) {
    if (c.fresh) await releasePostIdClaim(postId, draftId);
    throw e;
  }
  if (!result || !result.committed) {
    // Chỉ giải phóng khi draft thật sự KHÔNG giữ Post ID này (tránh xoá claim của lần chốt khác đã thành công).
    if (c.fresh) { const cur = await getDraft(draftId); if (!(cur && String(cur.facebookPostId) === String(postId))) await releasePostIdClaim(postId, draftId); }
  }
  return result;
}
function confirmPostedWithClaim(draftId, opts) {
  return withPostIdClaim(draftId, String(opts && opts.postId || ''), opts && opts.actor, () => confirmPostedTransaction(draftId, opts));
}

// appendRecoveryAudit — dấu vết cho lần thử BỊ TỪ CHỐI (không đổi trạng thái). Chỉ ghi khi draft tồn tại (không tạo node rác).
async function appendRecoveryAudit(draftId, entry) {
  try {
    const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
    const snap = await ref.once('value');
    if (!snap.exists()) return false;
    await admin.database().ref(DRAFTS_NODE + '/' + draftId + '/recoveryAudit/' + recoveryKey()).set(Object.assign({ at: Date.now() }, entry));
    return true;
  } catch (e) { console.error('[fbDraftStore] không ghi được recoveryAudit'); return false; }
}

// cancelTransaction — HUỶ nguyên tử: chỉ PENDING_APPROVAL → CANCELLED. Cùng kiểu transaction với approveTransaction nên
// "huỷ" và "duyệt" đồng thời không thể cùng thắng; đã APPROVED/PUBLISHING thì huỷ bị từ chối.
async function cancelTransaction(draftId, opts) {
  const cancelledBy = (opts && opts.cancelledBy) || null;
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let status = null; let cancelledNow = false;
  const result = await ref.transaction((current) => {
    reason = null; status = null; cancelledNow = false;
    if (current === null || current === undefined) { reason = 'not_found'; return null; }
    status = current.status;
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; }
    cancelledNow = true;
    return Object.assign({}, current, { status: 'CANCELLED', updatedAt: Date.now() }, cancelledBy ? { cancelledBy, cancelledAt: Date.now() } : {});
  });
  const ok = !!(result.committed && cancelledNow);
  return { committed: ok, reason: ok ? null : (reason || 'not_found'), currentStatus: status };
}

module.exports = {
  confirmPostedTransaction, confirmNotPostedTransaction, appendRecoveryAudit, RECOVERABLE_MIN_NOT_POSTED_MS,
  claimPostId, releasePostIdClaim, withPostIdClaim, confirmPostedWithClaim, CLAIM_STALE_MS,
  canonicalImageHashes,
  APPROVAL_TTL_MS,
  cancelTransaction,
  retryFailedPublish,
  createDraft, updateStatus, findByTelegramUpdateId, getDraft, VALID_TRANSITIONS,
  bumpVersion, patchFields, approveTransaction, applyEditTransaction, reconcilePublished, contentFingerprint, publishImageList, markPublishing, recoverStuckApproved, listAll, FINGERPRINT_RE
};
