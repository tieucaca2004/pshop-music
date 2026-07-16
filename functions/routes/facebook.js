/*
 * routes/facebook.js — Sprint 14 Phase 3 (FINAL mục 17.21). `connection`/
 * `health`/`oauth/start` đọc/ghi trực tiếp RTDB (đúng node đã xác nhận:
 * `facebookConnection`, `facebookAppConfig/appId`, `facebookOAuthState`).
 * `pages/select`/`publish`/`token/refresh` là PROXY sang ĐÚNG 3 Cloud
 * Function đã có (`facebookSelectPage`/`facebookPublish`/`facebookRefreshToken`
 * trong functions/index.js) — CỐ TÌNH không viết lại logic Facebook Graph
 * API ở đây (đã kiểm chứng, đang chạy thật) — chỉ forward Authorization
 * header + body, bọc lại response theo Standard Response/Error (mục 10-11).
 * `oauth/callback` KHÔNG có route ở đây — tài liệu FINAL yêu cầu GIỮ NGUYÊN
 * dạng redirect target thật của Cloud Function `facebookOAuthCallback`
 * (Facebook gọi trực tiếp, không qua apiGateway).
 *
 * 3 hằng số OAuth (dialog URL/callback URL/scopes) trùng với
 * `js/admin-facebook-connect.js:31-35` và `functions/index.js:44-45` — CỐ
 * TÌNH lặp lại ở đây (không import chéo giữa index.js và routes/) thay vì
 * refactor file cũ đang chạy thật, cùng nguyên tắc "song song, không thay
 * thế" đã áp dụng cho shared/auth.js ở Phase 1.
 */
const admin = require('firebase-admin');

const FACEBOOK_OAUTH_DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const FACEBOOK_OAUTH_CALLBACK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback';
const FACEBOOK_SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';
const FUNCTIONS_BASE = 'https://us-central1-pshop-music.cloudfunctions.net';

async function getFacebookAppId() {
  const snap = await admin.database().ref('facebookAppConfig/appId').once('value');
  return snap.val() || '';
}

async function proxyToFunction(req, res, helpers, functionName) {
  const { sendSuccess, sendError } = helpers;
  const authHeader = req.get('Authorization') || '';
  let upstream;
  try {
    upstream = await fetch(FUNCTIONS_BASE + '/' + functionName, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(req.body || {})
    });
  } catch (err) {
    return sendError(res, 'UPSTREAM_ERROR', 'Không gọi được ' + functionName + ': ' + err.message);
  }
  let data;
  try { data = await upstream.json(); } catch (e) { data = {}; }
  if (upstream.ok) return sendSuccess(res, data);
  const code = upstream.status === 401 ? 'UNAUTHENTICATED' : upstream.status === 403 ? 'PERMISSION_DENIED' : upstream.status === 400 ? 'INVALID_REQUEST' : 'UPSTREAM_ERROR';
  return sendError(res, code, data.error || ('Lỗi từ ' + functionName + ' (HTTP ' + upstream.status + ').'));
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (path.indexOf('/v1/facebook/') !== 0) return null;

  const isAdmin = auth.ok && auth.role === 'admin';
  const canPublish = auth.ok && (auth.role === 'admin' || auth.role === 'editor');

  if (path === '/v1/facebook/connection' && req.method === 'GET') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem trạng thái kết nối Facebook.');
    const snap = await admin.database().ref('facebookConnection').once('value');
    return sendSuccess(res, snap.val() || { status: 'disconnected' });
  }

  if (path === '/v1/facebook/health' && req.method === 'GET') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem Facebook Health.');
    const [appId, connSnap] = await Promise.all([
      getFacebookAppId(),
      admin.database().ref('facebookConnection').once('value')
    ]);
    const connection = connSnap.val() || null;
    const mockMode = !appId || !!(connection && connection.isMock);
    return sendSuccess(res, { mockMode, appIdConfigured: !!appId, connectionStatus: (connection && connection.status) || 'disconnected' });
  }

  if (path === '/v1/facebook/oauth/start' && req.method === 'POST') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được khởi động kết nối Facebook.');
    const state = require('crypto').randomUUID();
    await admin.database().ref('facebookOAuthState/' + state).set({ uid: auth.uid, createdAt: admin.database.ServerValue.TIMESTAMP });
    const appId = await getFacebookAppId();
    if (!appId) {
      return sendSuccess(res, { state, oauthUrl: FACEBOOK_OAUTH_CALLBACK_URL + '?code=mock-code&state=' + encodeURIComponent(state), mockMode: true });
    }
    const oauthUrl = FACEBOOK_OAUTH_DIALOG_URL + '?client_id=' + encodeURIComponent(appId) +
      '&redirect_uri=' + encodeURIComponent(FACEBOOK_OAUTH_CALLBACK_URL) +
      '&scope=' + encodeURIComponent(FACEBOOK_SCOPES) + '&response_type=code&state=' + encodeURIComponent(state);
    return sendSuccess(res, { state, oauthUrl, mockMode: false });
  }

  if (path === '/v1/facebook/pages/select' && req.method === 'POST') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được chọn Trang Facebook.');
    return proxyToFunction(req, res, helpers, 'facebookSelectPage');
  }

  if (path === '/v1/facebook/publish' && req.method === 'POST') {
    if (!canPublish) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được đăng lên Facebook.');
    return proxyToFunction(req, res, helpers, 'facebookPublish');
  }

  if (path === '/v1/facebook/token/refresh' && req.method === 'POST') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được làm mới Token Facebook.');
    return proxyToFunction(req, res, helpers, 'facebookRefreshToken');
  }

  return sendError(res, 'NOT_FOUND', 'Không tìm thấy route Facebook.');
}

module.exports = { handle };
