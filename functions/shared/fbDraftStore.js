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

const DRAFTS_NODE = 'fbPostDrafts';

// Transitions hợp lệ: từ trạng thái A có thể chuyển sang trạng thái nào.
// Export để test suite kiểm tra không cần Firebase.
const VALID_TRANSITIONS = {
  RECEIVED: ['PROCESSING'],
  PROCESSING: ['PENDING_APPROVAL', 'FAILED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PUBLISHING'],
  PUBLISHING: ['PUBLISHED', 'FAILED']
};

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
    if (!current) return undefined; // node không tồn tại, abort
    const v = (typeof current.version === 'number' ? current.version : 1) + 1;
    newVersion = v;
    return Object.assign({}, current, { version: v, updatedAt: Date.now() });
  });
  if (!result.committed) throw new Error('fbDraftStore: bumpVersion failed — draft không tồn tại: ' + draftId);
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
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let currentStatus = null;
  let reason = null;
  let snapshot = null;
  const result = await ref.transaction((current) => {
    reason = null; snapshot = null;
    if (!current) { currentStatus = null; reason = 'not_found'; return undefined; } // abort
    currentStatus = current.status;
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; } // abort, không thay đổi
    if (expectedVersion !== null && typeof current.version === 'number' && current.version !== expectedVersion) {
      reason = 'version_mismatch'; return undefined;
    }
    currentStatus = 'APPROVED'; // sẽ được commit
    const now = Date.now();
    const next = Object.assign({}, current, { status: 'APPROVED', updatedAt: now }, approvedBy ? { approvedBy, approvedAt: now } : {});
    snapshot = next;
    return next;
  });
  return {
    committed: result.committed,
    currentStatus,
    reason: result.committed ? null : reason,
    draft: result.committed && snapshot ? Object.assign({ id: draftId }, snapshot) : null
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
    if (!current) { reason = 'not_found'; return undefined; }
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; }
    const safe = Object.assign({}, patches || {});
    delete safe.status; delete safe.version; delete safe.updatedAt;
    newVersion = (typeof current.version === 'number' ? current.version : 1) + 1;
    return Object.assign({}, current, safe, { version: newVersion, updatedAt: Date.now() });
  });
  return { committed: result.committed, newVersion: result.committed ? newVersion : null, reason: result.committed ? null : reason };
}

// retryFailedPublish — cho phép người duyệt hợp lệ đưa một draft FAILED về PENDING_APPROVAL để duyệt lại,
// CHỈ khi lỗi xảy ra ở giai đoạn đăng ('publish') và Facebook CHƯA ghi nhận bài (facebookPostId rỗng) —
// nếu không sẽ có nguy cơ đăng trùng. Tăng version để vô hiệu hoá nút Duyệt cũ. Atomic (transaction).
async function retryFailedPublish(draftId) {
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let newVersion = null;
  const result = await ref.transaction((current) => {
    reason = null; newVersion = null;
    if (!current) { reason = 'not_found'; return undefined; }
    if (current.status !== 'FAILED') { reason = 'not_failed'; return undefined; }
    if (current.failStage !== 'publish') { reason = 'not_publish_failure'; return undefined; }
    if (current.facebookPostId) { reason = 'already_posted'; return undefined; }
    newVersion = (typeof current.version === 'number' ? current.version : 1) + 1;
    return Object.assign({}, current, { status: 'PENDING_APPROVAL', version: newVersion, failReason: null, failStage: null, approvedBy: null, approvedAt: null, updatedAt: Date.now() });
  });
  return { committed: result.committed, reason: result.committed ? null : reason, newVersion: result.committed ? newVersion : null };
}

// cancelTransaction — HUỶ nguyên tử: chỉ PENDING_APPROVAL → CANCELLED. Cùng kiểu transaction với approveTransaction nên
// "huỷ" và "duyệt" đồng thời không thể cùng thắng; đã APPROVED/PUBLISHING thì huỷ bị từ chối.
async function cancelTransaction(draftId, opts) {
  const cancelledBy = (opts && opts.cancelledBy) || null;
  const ref = admin.database().ref(DRAFTS_NODE + '/' + draftId);
  let reason = null; let status = null;
  const result = await ref.transaction((current) => {
    reason = null; status = null;
    if (!current) { reason = 'not_found'; return undefined; }
    status = current.status;
    if (current.status !== 'PENDING_APPROVAL') { reason = 'not_pending'; return undefined; }
    return Object.assign({}, current, { status: 'CANCELLED', updatedAt: Date.now() }, cancelledBy ? { cancelledBy, cancelledAt: Date.now() } : {});
  });
  return { committed: result.committed, reason: result.committed ? null : reason, currentStatus: status };
}

module.exports = {
  cancelTransaction,
  retryFailedPublish,
  createDraft, updateStatus, findByTelegramUpdateId, getDraft, VALID_TRANSITIONS,
  bumpVersion, patchFields, approveTransaction, applyEditTransaction
};
