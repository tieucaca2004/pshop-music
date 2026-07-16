/*
 * shared/auth.js — Authentication (Sprint 14 Phase 1, FINAL mục 5). Tách ra
 * từ hàm validateRequest() gốc trong index.js (openaiProxy) — GIỮ NGUYÊN
 * index.js/openaiProxy không đổi (0 regression), chỉ cho phép route MỚI
 * (apiGateway) dùng lại đúng cùng cơ chế xác thực đã kiểm chứng: Bearer
 * Firebase ID Token → verifyIdToken() → xác nhận có entry ở roles/{uid}.
 */
const admin = require('firebase-admin');

// PUBLIC_PATHS — duy nhất GET /v1/health không cần token (FINAL mục 5,
// "Ngoại lệ duy nhất — Health API công khai") để uptime monitor/load
// balancer bên ngoài gọi được.
const PUBLIC_PATHS = new Set(['/v1/health']);

async function authenticate(req) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Thiếu Authorization Bearer token.' };
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', error: 'Token không hợp lệ hoặc đã hết hạn.' };
  }
  const roleSnap = await admin.database().ref('roles/' + decoded.uid).once('value');
  if (!roleSnap.exists()) {
    return { ok: false, status: 403, code: 'PERMISSION_DENIED', error: 'Tài khoản chưa được cấp quyền CMS.' };
  }
  const roleData = roleSnap.val();
  const role = (roleData && roleData.role) || roleData; // roles/{uid} có thể lưu string thẳng hoặc {role:"..."}
  return { ok: true, uid: decoded.uid, email: decoded.email || '', role };
}

function isPublicPath(path) {
  return PUBLIC_PATHS.has(path);
}

module.exports = { authenticate, isPublicPath, PUBLIC_PATHS };
