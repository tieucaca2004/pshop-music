// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

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
 * G1M — vá phân quyền: các route THAY ĐỔI kết nối (oauth/start, pages/select,
 * token/refresh, repair, app-config, disconnect) CHỈ super_admin (xác thực lại ở
 * backend bằng fbConnectionPatch.verifySuperAdmin, không dựa auth.role của gateway
 * vì super_admin có thể không có node roles/{uid}). `publish` giữ admin/editor và gọi
 * publishToActivePage() trong tiến trình (KHÔNG proxy sang Cloud Function
 * facebookPublish, vốn chỉ cho super_admin). Các route chỉ-đọc giữ Admin.
 *
 * 3 hằng số OAuth (dialog URL/callback URL/scopes) trùng với
 * `js/admin-facebook-connect.js:31-35` và `functions/index.js:44-45` — CỐ
 * TÌNH lặp lại ở đây (không import chéo giữa index.js và routes/) thay vì
 * refactor file cũ đang chạy thật, cùng nguyên tắc "song song, không thay
 * thế" đã áp dụng cho shared/auth.js ở Phase 1.
 */
const admin = require('firebase-admin');
const fbConn = require('../shared/fbConnectionPatch');

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
  const canPublishRole = auth.ok && (auth.role === 'admin' || auth.role === 'editor');

  // Route thay đổi kết nối → bắt buộc super_admin (kiểm tra thật ở backend).
  async function requireSuper(deniedMessage) {
    const sa = await fbConn.verifySuperAdmin(req);
    if (!sa.ok) {
      sendError(res, sa.code, deniedMessage || sa.error);
      return null;
    }
    return sa;
  }

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
    const sa = await requireSuper('Chỉ Super Admin được khởi động kết nối Facebook.');
    if (!sa) return;
    const state = require('crypto').randomUUID();
    // createdAt là số (ms) để callback kiểm TTL.
    await admin.database().ref('facebookOAuthState/' + state).set({ uid: sa.uid, createdAt: Date.now() });
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
    const sa = await requireSuper('Chỉ Super Admin được chọn Trang Facebook.');
    if (!sa) return;
    return proxyToFunction(req, res, helpers, 'facebookSelectPage');
  }

  if (path === '/v1/facebook/publish' && req.method === 'POST') {
    // Admin/Editor (do gateway xác thực) HOẶC super_admin. Gọi logic dùng chung trong tiến
    // trình — không đi vòng qua Cloud Function facebookPublish (chỉ cho super_admin).
    let allowed = canPublishRole;
    if (!allowed) allowed = (await fbConn.verifySuperAdmin(req)).ok;
    if (!allowed) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor/Super Admin được đăng lên Facebook.');
    const body = req.body || {};
    let result;
    try {
      result = await fbConn.publishToActivePage({ message: body.message, imageUrls: body.imageUrls });
    } catch (err) {
      return sendError(res, 'UPSTREAM_ERROR', err.message);
    }
    if (result.status === 200) return sendSuccess(res, result.body);
    return sendError(res, 'INVALID_REQUEST', result.body.error || 'Không đăng được bài.');
  }

  if (path === '/v1/facebook/token/refresh' && req.method === 'POST') {
    const sa = await requireSuper('Chỉ Super Admin được làm mới Token Facebook.');
    if (!sa) return;
    return proxyToFunction(req, res, helpers, 'facebookRefreshToken');
  }

  // G1M — thay thế việc browser ghi thẳng RTDB (facebookAppConfig / facebookConnection
  // đã bị đóng ở database.rules.json). Chỉ super_admin.
  if (path === '/v1/facebook/app-config' && req.method === 'POST') {
    const sa = await requireSuper('Chỉ Super Admin được đổi Facebook App ID.');
    if (!sa) return;
    const appId = req.body && typeof req.body.appId === 'string' ? req.body.appId.trim() : null;
    if (appId === null) return sendError(res, 'INVALID_REQUEST', 'Thiếu "appId" (chuỗi).');
    const saved = await fbConn.setAppId({ appId, uid: sa.uid });
    if (!saved.ok) return sendError(res, 'INVALID_REQUEST', saved.error);
    return sendSuccess(res, { appId: saved.appId, mockMode: !saved.appId });
  }

  if (path === '/v1/facebook/disconnect' && req.method === 'POST') {
    const sa = await requireSuper('Chỉ Super Admin được ngắt kết nối Facebook.');
    if (!sa) return;
    await fbConn.disconnectFacebook(sa.uid);
    return sendSuccess(res, { status: 'not_connected' });
  }

  // ── Self-Healing (Phase 6, FINAL mục 13) — status/validate/repair cho
  // module Facebook Integration, đúng Ma trận trạng thái theo module ──────
  if (path === '/v1/facebook/status' && req.method === 'GET') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem Status Facebook.');
    const connSnap = await admin.database().ref('facebookConnection').once('value');
    const conn = connSnap.val() || { status: 'disconnected' };
    return sendSuccess(res, { status: conn.status === 'connected' ? 'ok' : (conn.status === 'token_expiring' ? 'degraded' : 'down'), details: conn });
  }

  if (path === '/v1/facebook/validate' && req.method === 'POST') {
    if (!isAdmin) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được Validate Facebook.');
    const connSnap = await admin.database().ref('facebookConnection').once('value');
    const conn = connSnap.val() || {};
    const issues = [];
    if (conn.status !== 'connected' && conn.status !== 'token_expiring') {
      issues.push({ issue: 'Chưa kết nối Facebook (status: ' + (conn.status || 'disconnected') + ').', safe: false });
    } else if (conn.tokenExpiresAt && conn.tokenExpiresAt < Date.now()) {
      issues.push({ issue: 'Token đã hết hạn.', safe: true });
    } else if (conn.tokenExpiresAt && conn.tokenExpiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
      issues.push({ issue: 'Token sắp hết hạn trong vòng 3 ngày.', safe: true });
    }
    return sendSuccess(res, { valid: issues.length === 0, issues });
  }

  // repair — CHỈ hành động an toàn: refresh token qua ĐÚNG API đã có
  // (`facebookRefreshToken`, mục 17.21) khi token sắp/đã hết hạn. Chưa kết
  // nối lần nào (status !== connected/token_expiring) là quyết định nghiệp
  // vụ (cần Founder tự OAuth) — KHÔNG tự thực thi.
  if (path === '/v1/facebook/repair' && req.method === 'POST') {
    const sa = await requireSuper('Chỉ Super Admin được Repair Facebook.');
    if (!sa) return;
    const connSnap = await admin.database().ref('facebookConnection').once('value');
    const conn = connSnap.val() || {};
    if (conn.status !== 'connected' && conn.status !== 'token_expiring') {
      return sendSuccess(res, { repaired: false, requiresApproval: true, proposedActions: [{ proposedAction: 'Chưa kết nối Facebook — Founder tự thực hiện OAuth qua "Cài đặt" → "Facebook Configuration".' }] });
    }
    const tokenNeedsRefresh = conn.tokenExpiresAt && conn.tokenExpiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000;
    if (!tokenNeedsRefresh) return sendSuccess(res, { repaired: false, actions: [] });
    let refreshData;
    try {
      const upstream = await fetch(FUNCTIONS_BASE + '/facebookRefreshToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: req.get('Authorization') || '' },
        body: JSON.stringify({})
      });
      refreshData = await upstream.json();
      if (!upstream.ok) return sendError(res, 'UPSTREAM_ERROR', refreshData.error || 'Làm mới Token thất bại.');
    } catch (err) {
      return sendError(res, 'UPSTREAM_ERROR', 'Không gọi được facebookRefreshToken: ' + err.message);
    }
    return sendSuccess(res, { repaired: true, actions: [{ action: 'Làm mới Token Facebook thành công.', tokenExpiresAt: refreshData.tokenExpiresAt }] });
  }

  return sendError(res, 'NOT_FOUND', 'Không tìm thấy route Facebook.');
}

module.exports = { handle };
