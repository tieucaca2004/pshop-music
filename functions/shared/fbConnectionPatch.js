/*
 * shared/fbConnectionPatch.js — G1M, vá phân quyền Facebook Integration.
 *
 * Gom MỌI logic Facebook có tác dụng phụ (ghi token / ghi cấu hình / đăng bài)
 * vào 1 chỗ để (a) Cloud Function trực tiếp trong index.js (facebookOAuthCallback,
 * facebookSelectPage, facebookRefreshToken, facebookPublish) và (b) route gateway
 * (routes/facebook.js, routes/socialMediaCenter.js) dùng CHUNG, và để unit test
 * được bằng stub mà không cần Firebase/Facebook thật.
 *
 * Quy tắc phân quyền (backend là nơi duy nhất quyết định, không tin client):
 *   - Mọi Cloud Function trực tiếp (kể cả facebookPublish) → CHỈ super_admin:
 *     ID token hợp lệ (checkRevoked) + superAdmins/{uid} tồn tại + role === 'super_admin'.
 *   - Route gateway /v1/facebook/publish và /v1/social-media-center/.../publish giữ
 *     quyền admin/editor (xác thực bởi gateway) và gọi publishToActivePage() trong
 *     tiến trình — KHÔNG đi vòng qua Cloud Function trực tiếp.
 *   - Route gateway thay đổi kết nối (oauth/start, pages/select, token/refresh,
 *     repair, app-config, disconnect) → CHỈ super_admin.
 *
 * Giới hạn đã biết (xem báo cáo G1M): schema production của superAdmins/{uid} chưa
 * được xác minh. Node phải có dạng { role: 'super_admin', ... }; dạng `true` hoặc
 * thiếu `role` sẽ bị TỪ CHỐI (fail-closed) dù code cũ (tenant.js) mặc định coi là
 * super_admin.
 */
const admin = require('firebase-admin');

// State OAuth hết hạn sau 5 phút. State CHỈ do server ghi (route /v1/facebook/oauth/start,
// database.rules.json đóng .write của facebookOAuthState) nên createdAt theo đồng hồ server;
// chỉ cho lệch nhẹ 30 giây giữa các instance.
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const OAUTH_STATE_FUTURE_SKEW_MS = 30 * 1000;

const APP_ID_PATTERN = /^\d{5,20}$/;
// Các giá trị này được ghép thẳng vào đường dẫn RTDB (facebookOAuthState/{state}, facebookPageTokens/{uid}/{pageId}).
// Dấu "/" sẽ biến thành đường dẫn con (vd "S1/uid" xoá con của một state khác), nên chỉ nhận ký tự an toàn.
const STATE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function db() {
  return admin.database();
}

// ─── Phân quyền ───────────────────────────────────────────────────────────

/**
 * Đúng khi superAdmins/{uid} tồn tại VÀ role === 'super_admin' (so sánh chặt).
 */
async function isSuperAdminUid(uid) {
  if (!uid || typeof uid !== 'string') return false;
  const snap = await db().ref('superAdmins/' + uid).once('value');
  if (!snap.exists()) return false;
  const val = snap.val();
  return !!val && typeof val === 'object' && val.role === 'super_admin';
}

/**
 * Xác thực Bearer ID token (có kiểm tra thu hồi) rồi kiểm tra super_admin.
 * Trả { ok:true, uid, email } hoặc { ok:false, status, code, error }.
 */
async function verifySuperAdmin(req) {
  const authHeader = (req && typeof req.get === 'function' && req.get('Authorization')) || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Thiếu Authorization Bearer token.' };
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1], true);
  } catch (err) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Token không hợp lệ hoặc đã hết hạn.' };
  }
  if (!(await isSuperAdminUid(decoded.uid))) {
    return { ok: false, status: 403, code: 'PERMISSION_DENIED', error: 'Chỉ Super Admin được thực hiện thao tác Facebook này.' };
  }
  return { ok: true, uid: decoded.uid, email: decoded.email || '' };
}

/**
 * Dùng trong Cloud Function onRequest: trả về uid nếu là super_admin; nếu không
 * thì ĐÃ gửi response lỗi và trả null (caller chỉ cần `if (!uid) return;`).
 */
async function guardSuperAdmin(req, res) {
  const check = await verifySuperAdmin(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return null;
  }
  return check;
}

// ─── Cấu hình / kết nối (ghi phía server) ─────────────────────────────────

async function getFacebookAppId() {
  const snap = await db().ref('facebookAppConfig/appId').once('value');
  return snap.val() || '';
}

function validateAppId(appId) {
  if (typeof appId !== 'string') return 'appId phải là chuỗi.';
  if (appId !== '' && !APP_ID_PATTERN.test(appId)) return 'appId phải là chuỗi 5-20 chữ số (hoặc rỗng để quay lại Mock Mode).';
  return null;
}

async function setAppId({ appId, uid }) {
  const err = validateAppId(appId);
  if (err) return { ok: false, status: 400, error: err };
  await db().ref('facebookAppConfig').update({ appId, updatedBy: uid, updatedAt: Date.now() });
  return { ok: true, appId };
}

/**
 * "Ngắt kết nối". Kết nối Facebook là TOÀN CỤC (1 kết nối cho cả platform) nên các node dưới đây là của
 * cả platform và bị xoá; dữ liệu chờ chọn của RIÊNG từng uid khác thì KHÔNG đụng tới:
 *   - facebookConnection   → { status: 'not_connected' }
 *   - facebookActiveToken  → token Page đang dùng (Function đăng bài + gateway)
 *   - facebookUserToken    → User Token dài hạn (dùng để làm mới)
 *   - facebookPageTokens/{uid}, facebookPendingPages/{uid} → CHỈ của người gọi (uid)
 * Token chờ chọn của uid khác được giữ nguyên. Bản phát hành này KHÔNG có Auto-Publisher/Telegram; nếu sau này có
 * thêm luồng đọc facebookPageTokens thì nó PHẢI coi facebookConnection.status === 'not_connected' là đã ngắt.
 * Ghi bằng MỘT lệnh update đa-đường-dẫn. Kết nối lại bằng OAuth như bình thường.
 */
async function disconnectFacebook(uid) {
  const updates = {
    facebookConnection: { status: 'not_connected' },
    facebookActiveToken: null,
    facebookUserToken: null
  };
  if (uid && typeof uid === 'string') {
    updates['facebookPageTokens/' + uid] = null;
    updates['facebookPendingPages/' + uid] = null;
  }
  await db().ref().update(updates);
  return { ok: true };
}

// ─── OAuth callback ───────────────────────────────────────────────────────

/**
 * Kiểm tra cấu trúc + TTL của state. Thuần hàm, không I/O.
 */
function checkStateShape(stateData, now) {
  if (!stateData || typeof stateData !== 'object') return 'Phiên kết nối không hợp lệ hoặc đã hết hạn — vui lòng thử Kết nối lại.';
  if (typeof stateData.uid !== 'string' || !stateData.uid) return 'Phiên kết nối không hợp lệ hoặc đã hết hạn — vui lòng thử Kết nối lại.';
  if (typeof stateData.createdAt !== 'number' || !isFinite(stateData.createdAt)) return 'Phiên kết nối không hợp lệ hoặc đã hết hạn — vui lòng thử Kết nối lại.';
  const age = now - stateData.createdAt;
  if (age > OAUTH_STATE_TTL_MS || age < -OAUTH_STATE_FUTURE_SKEW_MS) return 'Phiên kết nối đã hết hạn — vui lòng thử Kết nối lại.';
  return null;
}

/**
 * Xử lý toàn bộ OAuth callback. THỨ TỰ BẮT BUỘC:
 *   1. CLAIM state bằng transaction nguyên tử (đọc + xoá trong 1 bước) → đúng 1 callback
 *      thắng khi có replay song song; state bị đốt dù hợp lệ hay không
 *   2. kiểm tra hình dạng + TTL
 *   3. kiểm tra người khởi tạo còn là super_admin và tài khoản Auth không bị khoá
 *   4. gọi Graph API (KHÔNG ghi RTDB)
 *   5. kiểm tra lại super_admin NGAY trước khi ghi (các bước 4 có độ trễ mạng)
 *   6. ghi 3 node token bằng MỘT lệnh update đa-đường-dẫn (hoặc không ghi gì)
 * Ném Error (message dùng để redirect) khi thất bại; chưa có token nào được ghi
 * trước bước 6.
 */
async function processOAuthCallback({ code, state, appSecret, graphApi, redirectUri, now }) {
  const api = graphApi || require('../facebook-graph-api');
  const nowMs = typeof now === 'number' ? now : Date.now();

  // Claim nguyên tử: transaction luôn trả null (xoá) và ghi lại giá trị hiện hành ở lần chạy
  // CUỐI (lần được commit). Hai callback song song cùng state: chỉ một bên thấy dữ liệu.
  // `state` đến từ query string CÔNG KHAI của callback → kiểm hình dạng TRƯỚC khi chạm RTDB.
  if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
    throw new Error('Phiên kết nối không hợp lệ hoặc đã hết hạn — vui lòng thử Kết nối lại.');
  }
  const stateRef = db().ref('facebookOAuthState/' + state);
  let stateData = null;
  await stateRef.transaction(function (current) {
    stateData = current === undefined ? null : current;
    return null;
  });

  const shapeError = checkStateShape(stateData, nowMs);
  if (shapeError) throw new Error(shapeError);
  const uid = stateData.uid;

  if (!(await isSuperAdminUid(uid))) {
    throw new Error('Tài khoản khởi tạo kết nối không còn quyền Super Admin.');
  }
  let userRecord;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch (e) {
    throw new Error('Tài khoản khởi tạo kết nối không tồn tại.');
  }
  if (userRecord && userRecord.disabled) {
    throw new Error('Tài khoản khởi tạo kết nối đã bị khoá.');
  }

  const appId = await getFacebookAppId();
  const mockMode = !appId;

  const tokenData = await api.exchangeCodeForToken({ mockMode, code, appId, appSecret, redirectUri });
  const longLivedData = await api.exchangeForLongLivedToken({
    mockMode, shortLivedToken: tokenData.access_token, appId, appSecret
  });
  const userToken = longLivedData.access_token;
  // Facebook không phải lúc nào cũng trả "expires_in" — mặc định ước tính 60 ngày.
  const expiresInSec = longLivedData.expires_in || 60 * 24 * 3600;
  const obtainedAt = Date.now();
  const expiresAt = obtainedAt + expiresInSec * 1000;

  const accountsData = await api.getManagedPages({ mockMode, userToken });
  const pages = accountsData.data || [];
  if (!pages.length) {
    throw new Error('Tài khoản Facebook này chưa quản lý Fanpage nào.');
  }

  const pendingPages = pages.map(p => ({
    id: p.id,
    name: p.name,
    picture: (p.picture && p.picture.data && p.picture.data.url) || ''
  }));
  const tokenUpdates = {};
  pages.forEach(p => {
    tokenUpdates[p.id] = { accessToken: p.access_token, name: p.name, obtainedAt, expiresAt, isMock: mockMode };
  });

  // Kiểm tra lại quyền ngay trước khi ghi.
  if (!(await isSuperAdminUid(uid))) {
    throw new Error('Tài khoản khởi tạo kết nối không còn quyền Super Admin.');
  }

  const updates = {};
  updates['facebookPendingPages/' + uid] = { pages: pendingPages, fetchedAt: obtainedAt, isMock: mockMode };
  updates['facebookPageTokens/' + uid] = tokenUpdates;
  // facebookUserToken — node TOÀN CỤC (1 kết nối Facebook cho cả platform), giữ lại để
  // facebookRefreshToken làm mới Page Token sau này.
  updates['facebookUserToken'] = { accessToken: userToken, obtainedAt, expiresAt, isMock: mockMode, obtainedBy: uid };
  await db().ref().update(updates);

  return { uid, mockMode };
}

// ─── Chọn Fanpage / làm mới token / đăng bài (logic dùng chung) ───────────

async function selectPage({ uid, pageId }) {
  if (!pageId || typeof pageId !== 'string') return { status: 400, body: { error: 'Thiếu "pageId".' } };
  if (!PAGE_ID_PATTERN.test(pageId)) return { status: 400, body: { error: '"pageId" không hợp lệ.' } };

  const tokenSnap = await db().ref('facebookPageTokens/' + uid + '/' + pageId).once('value');
  const tokenData = tokenSnap.val();
  if (!tokenData) {
    return { status: 404, body: { error: 'Không tìm thấy Fanpage đã chọn — vui lòng bấm Kết nối lại.' } };
  }
  const pendingSnap = await db().ref('facebookPendingPages/' + uid + '/pages').once('value');
  const pendingPages = pendingSnap.val() || [];
  const pageMeta = pendingPages.find(p => p.id === pageId) || {};
  const userRecord = await admin.auth().getUser(uid);

  await db().ref('facebookActiveToken').set({
    pageId,
    accessToken: tokenData.accessToken,
    obtainedAt: tokenData.obtainedAt,
    expiresAt: tokenData.expiresAt,
    isMock: !!tokenData.isMock
  });
  await db().ref('facebookConnection').set({
    status: 'connected',
    pageId,
    pageName: pageMeta.name || tokenData.name || '',
    pageProfileImage: pageMeta.picture || '',
    connectedAt: Date.now(),
    tokenExpiresAt: tokenData.expiresAt,
    connectedBy: userRecord.email || uid,
    isMock: !!tokenData.isMock
  });
  // Dọn state tạm — token của các Page KHÔNG được chọn không cần giữ lại.
  await db().ref('facebookPendingPages/' + uid).remove();
  await db().ref('facebookPageTokens/' + uid).remove();
  return { status: 200, body: { success: true } };
}

async function refreshActiveToken({ uid, appSecret, graphApi }) {
  const api = graphApi || require('../facebook-graph-api');
  const userTokenSnap = await db().ref('facebookUserToken').once('value');
  const userTokenRecord = userTokenSnap.val();
  if (!userTokenRecord || !userTokenRecord.accessToken) {
    return { status: 400, body: { success: false, error: 'Chưa từng kết nối Facebook — vào Cài đặt > Facebook Configuration để kết nối trước.' } };
  }
  if (userTokenRecord.expiresAt && Date.now() > userTokenRecord.expiresAt) {
    return { status: 400, body: { success: false, error: 'Token đã hết hạn hoàn toàn — không thể tự làm mới, vui lòng bấm "Kết nối lại" để đăng nhập Facebook từ đầu.' } };
  }
  const activeSnap = await db().ref('facebookActiveToken').once('value');
  const active = activeSnap.val();
  if (!active || !active.pageId) {
    return { status: 400, body: { success: false, error: 'Chưa chọn Fanpage nào — vào Cài đặt > Facebook Configuration để kết nối trước.' } };
  }

  // Giữ NGUYÊN mockMode của kết nối gốc (không tính lại theo App ID hiện tại).
  const mockMode = !!userTokenRecord.isMock;
  const appId = await getFacebookAppId();

  const refreshed = await api.exchangeForLongLivedToken({
    mockMode, shortLivedToken: userTokenRecord.accessToken, appId, appSecret
  });
  const freshUserToken = refreshed.access_token;
  const expiresInSec = refreshed.expires_in || 60 * 24 * 3600;
  const expiresAt = Date.now() + expiresInSec * 1000;

  const accountsData = await api.getManagedPages({ mockMode, userToken: freshUserToken });
  const pages = accountsData.data || [];
  const matchingPage = pages.find(p => p.id === active.pageId);
  if (!matchingPage) {
    throw new Error('Không còn thấy Fanpage đã kết nối trong danh sách quản lý — vui lòng "Kết nối lại".');
  }

  await db().ref('facebookUserToken').set({
    accessToken: freshUserToken, obtainedAt: Date.now(), expiresAt, isMock: mockMode, obtainedBy: uid
  });
  await db().ref('facebookActiveToken').update({
    accessToken: matchingPage.access_token, obtainedAt: Date.now(), expiresAt
  });
  await db().ref('facebookConnection').update({ tokenExpiresAt: expiresAt });
  return { status: 200, body: { success: true, tokenExpiresAt: expiresAt } };
}

/**
 * Đăng bài lên Fanpage đang kết nối. KHÔNG tự kiểm tra quyền — caller PHẢI đã xác
 * thực (super_admin cho Cloud Function trực tiếp; admin/editor cho route gateway).
 * Token chỉ đọc từ facebookActiveToken (server-only), không bao giờ nhận từ client.
 */
async function publishToActivePage({ message, imageUrls, graphApi }) {
  const api = graphApi || require('../facebook-graph-api');
  if (!message || typeof message !== 'string') {
    return { status: 400, body: { error: 'Thiếu nội dung bài đăng ("message").' } };
  }
  const activeSnap = await db().ref('facebookActiveToken').once('value');
  const active = activeSnap.val();
  if (!active || !active.accessToken) {
    return { status: 400, body: { success: false, error: 'Chưa kết nối Facebook — vào Cài đặt > Facebook Configuration để kết nối trước.' } };
  }
  if (active.expiresAt && Date.now() > active.expiresAt) {
    return { status: 400, body: { success: false, error: 'Token Facebook đã hết hạn — vào Cài đặt > Facebook Configuration để kết nối lại.' } };
  }

  const pageId = active.pageId;
  const accessToken = active.accessToken;
  // mockMode lấy từ chính kết nối đã lưu, KHÔNG tính lại từ App ID hiện tại.
  const mockMode = !!active.isMock;
  const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

  const attachedMedia = [];
  for (const url of images) {
    const photoData = await api.uploadPhoto({ mockMode, pageId, imageUrl: url, pageAccessToken: accessToken });
    attachedMedia.push({ media_fbid: photoData.id });
  }
  const feedData = await api.publishToFeed({ mockMode, pageId, message, attachedMedia, pageAccessToken: accessToken });
  return { status: 200, body: { success: true, facebookPostId: feedData.id, mockMode } };
}

module.exports = {
  OAUTH_STATE_TTL_MS,
  isSuperAdminUid,
  verifySuperAdmin,
  guardSuperAdmin,
  getFacebookAppId,
  validateAppId,
  setAppId,
  disconnectFacebook,
  checkStateShape,
  processOAuthCallback,
  selectPage,
  refreshActiveToken,
  publishToActivePage
};
