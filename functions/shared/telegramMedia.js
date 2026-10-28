/*
 * shared/telegramMedia.js — tải ảnh người dùng gửi qua Telegram và lưu LÂU DÀI vào Firebase Storage của PSH.
 *
 * Vì sao: URL file của Telegram (api.telegram.org/file/bot<TOKEN>/...) chứa bot token và chỉ tạm thời —
 * không bao giờ được lưu vào bản nháp hay gửi cho Facebook. Ở đây: getFile → tải bytes → kiểm tra (kích thước,
 * magic bytes) → ghi vào Storage (đường dẫn cố định theo draft) → trả URL tải xuống có token của Firebase.
 *
 * Không ghi token/URL Telegram vào log hay thông báo lỗi (mọi lỗi đều được che token).
 * Ảnh KHÔNG đi tới provider nào khác ở module này.
 */
'use strict';
const crypto = require('crypto');
const admin = require('firebase-admin');

const MAX_BYTES = 10 * 1024 * 1024;           // 10 MB — thấp hơn giới hạn 20 MB của Telegram Bot API
const FETCH_TIMEOUT_MS = 20000;

// Chọn ảnh lớn nhất trong mảng photo[] của Telegram (nhiều kích thước), có kiểm tra cấu trúc.
function pickLargestPhoto(photoArray) {
  if (!Array.isArray(photoArray) || photoArray.length === 0) return null;
  let best = null;
  for (const p of photoArray) {
    if (!p || typeof p.file_id !== 'string' || !p.file_id || p.file_id.length > 256) continue;
    const area = (Number(p.width) || 0) * (Number(p.height) || 0);
    const size = Number(p.file_size) || 0;
    if (!best || area > best.area || (area === best.area && size > best.size)) best = { file_id: p.file_id, area, size, width: p.width, height: p.height };
  }
  return best;
}

// Nhận diện định dạng bằng magic bytes (không tin phần mở rộng/Content-Type của nguồn).
function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function redact(msg, token) {
  let m = String(msg == null ? '' : msg);
  if (token) m = m.split(token).join('***');
  return m.replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, 'bot***');
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

// downloadTelegramFile — trả { buffer, mime, ext }. Ném Error (đã che token) nếu thất bại.
async function downloadTelegramFile(token, fileId) {
  if (!token) throw new Error('Thiếu bot token trong telegramConfig.');
  let info;
  try {
    const r = await fetchWithTimeout('https://api.telegram.org/bot' + token + '/getFile?file_id=' + encodeURIComponent(fileId));
    info = await r.json();
  } catch (e) { throw new Error('Không gọi được Telegram getFile: ' + redact(e && e.message, token)); }
  if (!info || !info.ok || !info.result || !info.result.file_path) throw new Error('Telegram không trả đường dẫn file (getFile).');
  if (info.result.file_size && Number(info.result.file_size) > MAX_BYTES) throw new Error('Ảnh quá lớn (> 10 MB).');
  const filePath = String(info.result.file_path);
  if (!/^[A-Za-z0-9_\-./]+$/.test(filePath) || filePath.indexOf('..') >= 0) throw new Error('file_path từ Telegram không hợp lệ.');

  let buf;
  try {
    const r = await fetchWithTimeout('https://api.telegram.org/file/bot' + token + '/' + filePath);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ab = await r.arrayBuffer();
    buf = Buffer.from(ab);
  } catch (e) { throw new Error('Không tải được ảnh từ Telegram: ' + redact(e && e.message, token)); }
  if (buf.length === 0) throw new Error('Ảnh rỗng.');
  if (buf.length > MAX_BYTES) throw new Error('Ảnh quá lớn (> 10 MB).');
  const kind = sniffImage(buf);
  if (!kind) throw new Error('File không phải ảnh JPEG/PNG/WEBP hợp lệ.');
  return { buffer: buf, mime: kind.mime, ext: kind.ext };
}

function getBucket() { return admin.storage().bucket(); }

// saveToStorage — ghi buffer vào Storage tại path (vd "fbDrafts/<draftId>/original.jpg") và trả URL có token.
async function saveToStorage(path, buffer, mime) {
  if (!/^fbDrafts\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_.-]{1,64}$/.test(path)) throw new Error('Đường dẫn Storage không hợp lệ.');
  const bucket = getBucket();
  const token = crypto.randomUUID();
  await bucket.file(path).save(buffer, {
    metadata: { contentType: mime, metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false
  });
  return {
    path,
    url: 'https://firebasestorage.googleapis.com/v0/b/' + bucket.name + '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token
  };
}

async function readFromStorage(path) {
  if (!/^fbDrafts\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_.-]{1,64}$/.test(path)) throw new Error('Đường dẫn Storage không hợp lệ.');
  const [buf] = await getBucket().file(path).download();
  return buf;
}

module.exports = { pickLargestPhoto, sniffImage, downloadTelegramFile, saveToStorage, readFromStorage, redact, MAX_BYTES };
