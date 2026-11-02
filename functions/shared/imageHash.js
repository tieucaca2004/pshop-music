/*
 * shared/imageHash.js — SHA256 trên BYTE THỰC TẾ của ảnh (không chỉ URL).
 *
 * Dùng 2 lần cho cùng 1 draft: (1) lúc tạo bản xem trước → lưu publishImageHashes; (2) ngay trước khi upload lên Facebook →
 * tải lại đúng URL đó, tính lại và so sánh. Mọi lỗi (mạng, HTTP, rỗng, quá lớn, timeout) ⇒ ném lỗi — KHÔNG BAO GIỜ trả
 * "coi như khớp". Người gọi phải coi lỗi là "không đăng".
 */
'use strict';
const crypto = require('crypto');

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 20000;

async function hashUrl(url, opts) {
  const f = (opts && opts.fetchImpl) || global.fetch;
  const maxBytes = (opts && opts.maxBytes) || MAX_IMAGE_BYTES;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new Error('URL ảnh không hợp lệ (cần https).');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts && opts.timeoutMs) || TIMEOUT_MS);
  let r;
  try { r = await f(url, { method: 'GET', signal: ctrl.signal }); }
  catch (e) { throw new Error('Không tải được ảnh để kiểm tra (mạng/timeout).'); }
  finally { clearTimeout(t); }
  if (!r || !r.ok) throw new Error('Không tải được ảnh để kiểm tra (HTTP ' + (r && r.status) + ').');
  let buf;
  try { buf = Buffer.from(await r.arrayBuffer()); } catch (e) { throw new Error('Không đọc được nội dung ảnh để kiểm tra.'); }
  if (!buf.length) throw new Error('Ảnh rỗng.');
  if (buf.length > maxBytes) throw new Error('Ảnh quá lớn để kiểm tra.');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// hashList — [{ url, sha256 }] theo ĐÚNG thứ tự urls. Một ảnh lỗi ⇒ ném lỗi (cả danh sách thất bại).
async function hashList(urls, opts) {
  const out = [];
  for (const url of urls) out.push({ url, sha256: await hashUrl(url, opts) });
  return out;
}

// verifyAgainst — so từng ảnh với hash đã lưu. Trả { ok:true } hoặc { ok:false, reason, url }.
// reason: 'hash_missing' | 'hash_list_mismatch' | 'image_changed' | 'image_unreadable'.
async function verifyAgainst(urls, stored, opts) {
  if (!Array.isArray(stored) || stored.length !== urls.length) return { ok: false, reason: Array.isArray(stored) ? 'hash_list_mismatch' : 'hash_missing' };
  for (let i = 0; i < urls.length; i++) {
    const s = stored[i];
    if (!s || s.url !== urls[i] || !/^[0-9a-f]{64}$/.test(String(s.sha256))) return { ok: false, reason: 'hash_list_mismatch', url: urls[i] };
    let h;
    try { h = await hashUrl(urls[i], opts); } catch (e) { return { ok: false, reason: 'image_unreadable', url: urls[i], message: e.message }; }
    if (h !== s.sha256) return { ok: false, reason: 'image_changed', url: urls[i] };
  }
  return { ok: true };
}

module.exports = { hashUrl, hashList, verifyAgainst, MAX_IMAGE_BYTES };
