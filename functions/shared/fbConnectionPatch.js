/*
 * shared/fbConnectionPatch.js — hàm THUẦN tính patch đồng bộ trạng thái
 * Facebook Connection (SYNC-FIX A).
 *
 * Không phụ thuộc firebase-admin / firebase-functions → test được bằng Node
 * thuần (node --test), không cần emulator hay credential.
 *
 * Bối cảnh lỗi: `facebookRefreshToken` trước đây chỉ update
 * `facebookActiveToken.accessToken/obtainedAt/expiresAt` và
 * `facebookConnection.tokenExpiresAt`. Hệ quả:
 *   - `facebookActiveToken` có thể thiếu pageId/isMock → facebookPublish đọc
 *     ra undefined → báo "Chưa kết nối"
 *   - `facebookConnection.status` không đổi → Admin vẫn hiện "Đã kết nối"
 * → Admin và Publisher nói hai chuyện khác nhau.
 */

/**
 * buildActiveTokenPatch — patch cho node `facebookActiveToken`.
 *
 * @param {object} p
 * @param {object} p.active      facebookActiveToken hiện tại (đã có pageId)
 * @param {object} p.matchingPage Page vừa lấy từ Graph API (có access_token)
 * @param {number} p.expiresAt   thời điểm hết hạn mới (ms)
 * @param {boolean} p.mockMode   isMock của kết nối gốc — KHÔNG tự đổi thành false
 * @returns {{ok:boolean, code?:string, patch?:object}}
 */
function buildActiveTokenPatch({ active, matchingPage, expiresAt, mockMode }) {
  if (!active || typeof active !== 'object' || !active.pageId) {
    return { ok: false, code: 'ACTIVE_PAGE_ID_MISSING' };
  }
  if (!matchingPage || typeof matchingPage !== 'object' || !matchingPage.access_token) {
    return { ok: false, code: 'PAGE_ACCESS_TOKEN_MISSING' };
  }
  // Token cũ không được ghi nhầm sang Fanpage khác: pageId đích phải khớp
  // pageId của chính page vừa lấy token.
  if (matchingPage.id && matchingPage.id !== active.pageId) {
    return { ok: false, code: 'PAGE_ID_MISMATCH' };
  }
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, code: 'EXPIRES_AT_INVALID' };
  }

  return {
    ok: true,
    patch: {
      pageId: active.pageId,
      accessToken: matchingPage.access_token,
      obtainedAt: Number.isFinite(expiresAt) ? expiresAt - (60 * 24 * 3600 * 1000) : null,
      expiresAt,
      // giữ NGUYÊN mockMode, không bao giờ tự chuyển mock -> thật
      isMock: !!mockMode
    }
  };
}

/**
 * buildConnectionPatch — patch cho node `facebookConnection`.
 *
 * Chỉ báo 'connected' khi dữ liệu bắt buộc đầy đủ. Nếu thiếu → trả
 * `{ok:false, code:'CANNOT_MARK_CONNECTED'}` để caller throw, KHÔNG ghi
 * trạng thái connected giả.
 *
 * @param {object} p
 * @param {object} p.activeAfter facebookActiveToken SAU khi ghi (để verify thật)
 * @param {number} p.expiresAt
 * @param {boolean} p.mockMode
 * @returns {{ok:boolean, code?:string, patch?:object}}
 */
function buildConnectionPatch({ activeAfter, expiresAt, mockMode }) {
  if (!activeAfter || typeof activeAfter !== 'object') {
    return { ok: false, code: 'CANNOT_MARK_CONNECTED' };
  }
  if (!activeAfter.accessToken || !activeAfter.pageId) {
    return { ok: false, code: 'CANNOT_MARK_CONNECTED' };
  }
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, code: 'EXPIRES_AT_INVALID' };
  }
  return {
    ok: true,
    patch: {
      status: 'connected',
      pageId: activeAfter.pageId,
      tokenExpiresAt: expiresAt,
      isMock: !!mockMode
    }
  };
}

module.exports = { buildActiveTokenPatch, buildConnectionPatch };
