/*
 * routes/media.js — Sprint 14 Phase 2 (FINAL mục 17.13). Wrap Firebase
 * Storage qua Admin SDK — song song với `MediaLibrary`/`StorageUpload`
 * phía client (js/media-library.js, js/storage-upload.js), KHÔNG đổi cấu
 * trúc thư mục Storage hiện có (`media/`, `products/`, `banners/`...).
 *
 * Khác biệt kỹ thuật so với client: client upload thẳng file nhị phân qua
 * Firebase Storage SDK trong trình duyệt (multipart, không đi qua Cloud
 * Function nào). Cloud Function HTTP không có multipart parser sẵn — endpoint
 * `/v1/media/upload` ở đây nhận `{ dataUrl hoặc base64, contentType, folder,
 * filename }` dạng JSON (đúng khuôn mẫu Buffer.from(base64) đã dùng ở
 * `editImageWithOpenAI()` trong index.js), KHÔNG phải multipart form-data —
 * client GỌI API mới cần tự encode base64 trước khi gửi.
 */
const admin = require('firebase-admin');

function extractBase64(body) {
  if (body.dataUrl && typeof body.dataUrl === 'string') {
    const m = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { contentType: m[1], base64: m[2] };
  }
  if (body.base64 && typeof body.base64 === 'string') {
    return { contentType: body.contentType || 'application/octet-stream', base64: body.base64 };
  }
  return null;
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  const staff = auth.ok && (auth.role === 'admin' || auth.role === 'editor');

  if (path === '/v1/media/upload' && req.method === 'POST') {
    if (!staff) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được upload.');
    const decoded = extractBase64(req.body || {});
    if (!decoded) return sendError(res, 'INVALID_REQUEST', 'Thiếu dataUrl hoặc base64 hợp lệ.');
    const folder = (req.body && req.body.folder) || 'media';
    const rawName = (req.body && req.body.filename) || 'upload.png';
    const safeName = String(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = folder + '/' + Date.now() + '-' + safeName;
    const buffer = Buffer.from(decoded.base64, 'base64');
    const bucket = admin.storage().bucket();
    const token = require('crypto').randomUUID();
    await bucket.file(filePath).save(buffer, {
      metadata: { contentType: decoded.contentType, metadata: { firebaseStorageDownloadTokens: token } }
    });
    const url = 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/' + encodeURIComponent(filePath) + '?alt=media&token=' + token;
    return sendSuccess(res, { path: filePath, url }, { status: 201 });
  }

  if (path === '/v1/media' && req.method === 'GET') {
    if (!auth.ok) return sendError(res, 'UNAUTHENTICATED', 'Cần đăng nhập để xem Media Library.');
    const bucket = admin.storage().bucket();
    const prefix = req.query && req.query.folder ? String(req.query.folder) : undefined;
    const [files] = await bucket.getFiles(prefix ? { prefix } : {});
    const items = files.map(f => ({
      path: f.name,
      size: Number(f.metadata.size) || 0,
      contentType: f.metadata.contentType || null,
      updated: f.metadata.updated || null
    }));
    return sendSuccess(res, items);
  }

  if (path.indexOf('/v1/media/') === 0 && req.method === 'DELETE') {
    if (!auth.ok || auth.role !== 'admin') return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xoá Media.');
    const filePath = decodeURIComponent(path.slice('/v1/media/'.length));
    if (!filePath) return sendError(res, 'INVALID_REQUEST', 'Thiếu đường dẫn file.');
    const bucket = admin.storage().bucket();
    try {
      await bucket.file(filePath).delete();
    } catch (err) {
      if (err.code === 404) return sendError(res, 'NOT_FOUND', 'File không tồn tại.');
      throw err;
    }
    return sendSuccess(res, { deleted: true, path: filePath });
  }

  return null; // not handled by this router
}

module.exports = { handle };
