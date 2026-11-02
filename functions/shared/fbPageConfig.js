/*
 * shared/fbPageConfig.js — Resolve Facebook Page Token cho multi-fanpage.
 *
 * Đọc từ RTDB node `facebookPageTokens/{uid}/{pageId}` — cùng node mà
 * `facebookSelectPage` (functions/index.js) đã ghi khi user chọn page qua
 * OAuth. KHÔNG tạo node mới, KHÔNG sửa OAuth flow — chỉ đọc dữ liệu đã có.
 *
 * Pattern multi-fanpage: PSH hỗ trợ tối đa 5 fanpages, mỗi fanpage gắn với
 * 1 uid đã hoàn tất OAuth. `getPageToken(pageId)` scan qua tất cả UIDs trong
 * `facebookPageTokens` — số lượng UID thường 1–3, volume nhỏ, OK để scan.
 *
 * Fallback facebookActiveToken (B1 fix — Sprint 15 Phase FB):
 * `facebookSelectPage` xoá `facebookPageTokens/{uid}` sau khi hoàn tất OAuth
 * (functions/index.js line 576), đồng thời chép token sang `facebookActiveToken`.
 * Nếu scan `facebookPageTokens` không tìm được, thử đọc `facebookActiveToken` —
 * chỉ trả về khi `active.pageId === pageId` (khớp chính xác, không nhầm fanpage).
 *
 * Sprint 15 Phase FB — PSH Facebook Auto-Publisher.
 */
const admin = require('firebase-admin');

// getPageToken — trả về {accessToken, expiresAt, isMock, uid} hoặc null nếu không tìm thấy.
async function getPageToken(pageId) {
  if (!pageId) return null;

  // G1Q — "Ngắt kết nối" (facebookConnection.status === 'not_connected') phải dừng cả luồng này, kể cả
  // khi còn token chờ chọn của uid khác trong facebookPageTokens. Node không tồn tại = hành vi cũ.
  const connSnap = await admin.database().ref('facebookConnection/status').once('value');
  if (connSnap.exists() && connSnap.val() === 'not_connected') return null;

  // Ưu tiên 1: đọc từ facebookPageTokens (multi-fanpage, có uid)
  const snap = await admin.database().ref('facebookPageTokens').once('value');
  if (snap.exists()) {
    const allUids = snap.val() || {};
    for (const uid of Object.keys(allUids)) {
      const pageData = allUids[uid][pageId];
      if (pageData && pageData.accessToken) {
        return {
          accessToken: pageData.accessToken,
          expiresAt: pageData.expiresAt || null,
          isMock: !!pageData.isMock,
          uid
        };
      }
    }
  }

  // Fallback: facebookSelectPage xoá facebookPageTokens sau OAuth và chép token
  // sang facebookActiveToken. Chỉ trả về khi pageId khớp chính xác — không bao
  // giờ trả token của fanpage khác dù facebookPageTokens rỗng.
  const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
  const active = activeSnap.val();
  if (active && active.accessToken && active.pageId === pageId) {
    return {
      accessToken: active.accessToken,
      expiresAt: active.expiresAt || null,
      isMock: !!active.isMock,
      uid: null  // facebookActiveToken không lưu uid
    };
  }

  return null;
}

// listConnectedPages — liệt kê tất cả pages đã kết nối (tất cả UIDs).
// Trả về [{pageId, uid, isMock, expiresAt}].
async function listConnectedPages() {
  const snap = await admin.database().ref('facebookPageTokens').once('value');
  if (!snap.exists()) return [];
  const allUids = snap.val() || {};
  const pages = [];
  for (const uid of Object.keys(allUids)) {
    const pagesForUid = allUids[uid] || {};
    for (const pageId of Object.keys(pagesForUid)) {
      const d = pagesForUid[pageId];
      pages.push({
        pageId,
        uid,
        isMock: !!d.isMock,
        expiresAt: d.expiresAt || null
      });
    }
  }
  return pages;
}

// isPageAllowedForTelegram — luồng Telegram chỉ được đăng lên Page ĐANG ĐƯỢC CHỌN (facebookActiveToken.pageId, do Super Admin chọn ở
// G1) hoặc Page được Founder liệt kê tường minh trong telegramConfig.allowedPageIds. Token "chờ chọn" (facebookPageTokens) của Page khác
// KHÔNG đủ: đó là token OAuth tạm thời chưa được Super Admin chọn.
async function isPageAllowedForTelegram(pageId, tgConfig) {
  if (!pageId) return false;
  const act = await admin.database().ref('facebookActiveToken/pageId').once('value');
  if (act.exists() && String(act.val()) === String(pageId)) return true;
  const list = tgConfig && Array.isArray(tgConfig.allowedPageIds) ? tgConfig.allowedPageIds.map(String) : [];
  return list.indexOf(String(pageId)) >= 0;
}

// getPageTokenForPublish — token DÙNG ĐỂ ĐĂNG (luồng Telegram + đối soát). Khác getPageToken (giữ nguyên cho nơi khác):
//   1) facebookActiveToken khớp pageId — Page do Super Admin CHỌN ở trang quản trị (server-only);
//   2) token "chờ chọn" trong facebookPageTokens/{uid}/{pageId} CHỈ nhận khi uid đó hiện là super_admin (người kết nối OAuth);
//      nếu có NHIỀU token khác nhau cho cùng Page ⇒ mơ hồ ⇒ null (không lấy "token đầu tiên tìm thấy").
// Trả { accessToken, expiresAt, isMock, uid, source } hoặc null (fail-closed).
async function isConnectorAuthorized(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return false;
  const sa = await admin.database().ref('superAdmins/' + uid).once('value');
  return !!(sa.exists() && sa.val() && sa.val().role === 'super_admin');
}
async function getPageTokenForPublish(pageId) {
  if (!pageId) return null;
  const connSnap = await admin.database().ref('facebookConnection/status').once('value');
  if (connSnap.exists() && connSnap.val() === 'not_connected') return null;

  const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
  const active = activeSnap.val();
  if (active && active.accessToken && String(active.pageId) === String(pageId)) {
    return { accessToken: active.accessToken, expiresAt: active.expiresAt || null, isMock: !!active.isMock, uid: null, source: 'active' };
  }

  const snap = await admin.database().ref('facebookPageTokens').once('value');
  if (!snap.exists()) return null;
  const all = snap.val() || {};
  const candidates = [];
  for (const uid of Object.keys(all)) {
    const d = all[uid] && all[uid][pageId];
    if (d && d.accessToken && await isConnectorAuthorized(uid)) candidates.push({ accessToken: d.accessToken, expiresAt: d.expiresAt || null, isMock: !!d.isMock, uid, source: 'pending' });
  }
  if (candidates.length === 0) return null;
  const distinct = new Set(candidates.map((c) => c.accessToken));
  if (distinct.size > 1) return null;
  return candidates[0];
}

module.exports = { getPageToken, getPageTokenForPublish, listConnectedPages, isPageAllowedForTelegram };
