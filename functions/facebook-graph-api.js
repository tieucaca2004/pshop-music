/*
 * FacebookGraphAPI — wrapper DUY NHẤT gọi Facebook Graph API thật, dùng
 * chung cho mọi Cloud Function Facebook (functions/index.js). Không phụ
 * thuộc firebase-admin/firebase-functions — chỉ nhận đúng tham số cần thiết
 * qua object argument, để kiểm thử độc lập bằng Node thuần (không cần giả
 * lập toàn bộ Cloud Functions runtime).
 *
 * Mock Mode (Sprint 12 — Facebook Integration V1): mỗi hàm nhận `mockMode`
 * (boolean, do caller tính = !appId — xem functions/index.js) — nếu true,
 * trả dữ liệu GIẢ LẬP nhưng ĐÚNG SHAPE/field như Graph API thật trả về,
 * KHÔNG gọi mạng thật. Chỉ để Chief Architect tự xác minh toàn bộ luồng
 * (OAuth → Page Selection → Publish) hoạt động đúng trước khi có Facebook
 * App thật. Tắt Mock Mode = cung cấp App ID thật (không sửa file này hay bất
 * kỳ nơi gọi nào) — đây là điểm DUY NHẤT trong toàn bộ kiến trúc phân biệt
 * giả/thật, xoá Mock Mode sau này chỉ cần xoá đúng 5 nhánh `if (mockMode)`
 * bên dưới, không đổi bất kỳ file nào khác.
 */
const GRAPH_VERSION = 'v19.0';

// timedFetch — fetch có timeout. Với publishToFeed, mất kết nối/timeout KHÔNG có nghĩa là bài chưa được tạo: lỗi mang
// cờ ambiguous=true để tầng trên KHÔNG cho tự động thử lại (tránh đăng trùng).
async function timedFetch(url, opts, ms, ambiguousOnFail) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  catch (e) { const err = new Error(ambiguousOnFail ? 'Mất kết nối/timeout khi đăng — CHƯA biết Facebook đã tạo bài hay chưa.' : 'Không gọi được Facebook (mạng/timeout).'); if (ambiguousOnFail) err.ambiguous = true; throw err; }
  finally { clearTimeout(t); }
}

function mockPages() {
  return [
    { id: 'mock_page_1', name: '[MOCK] Pshop Music', access_token: 'mock_page_token_1', picture: { data: { url: 'https://via.placeholder.com/64?text=P1' } } },
    { id: 'mock_page_2', name: '[MOCK] Pshop Coffee', access_token: 'mock_page_token_2', picture: { data: { url: 'https://via.placeholder.com/64?text=P2' } } }
  ];
}

async function exchangeCodeForToken({ mockMode, code, appId, appSecret, redirectUri }) {
  if (mockMode) return { access_token: 'mock_short_lived_token_' + Date.now() };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token` +
    `?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error((data.error && data.error.message) || 'Không đổi được "code" lấy Access Token.');
  }
  return data;
}

async function exchangeForLongLivedToken({ mockMode, shortLivedToken, appId, appSecret }) {
  if (mockMode) return { access_token: 'mock_long_lived_token_' + Date.now(), expires_in: 60 * 24 * 3600 };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error((data.error && data.error.message) || 'Không đổi được Long-Lived Access Token.');
  }
  return data;
}

async function getManagedPages({ mockMode, userToken }) {
  if (mockMode) return { data: mockPages() };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,picture&access_token=${userToken}`;
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) {
    throw new Error((data.error && data.error.message) || 'Không lấy được danh sách Fanpage.');
  }
  return data;
}

async function uploadPhoto({ mockMode, pageId, imageUrl, pageAccessToken }) {
  if (mockMode) return { id: 'mock_photo_' + Date.now() + '_' + Math.random().toString(36).slice(2) };
  const r = await timedFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, published: false, access_token: pageAccessToken })
  }, 30000, false);
  const data = await r.json();
  if (!r.ok || !data.id) {
    throw new Error((data.error && data.error.message) || 'Không tải được ảnh lên Facebook.');
  }
  return data;
}

async function publishToFeed({ mockMode, pageId, message, attachedMedia, pageAccessToken }) {
  if (mockMode) return { id: pageId + '_mockpost_' + Date.now() };
  const body = { message, access_token: pageAccessToken };
  if (attachedMedia && attachedMedia.length) body.attached_media = attachedMedia;
  const r = await timedFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 30000, true);
  let data;
  try { data = await r.json(); } catch (e) { const err = new Error('Facebook trả phản hồi không đọc được — CHƯA biết bài đã được tạo hay chưa.'); err.ambiguous = true; throw err; }
  if (!r.ok || !data.id) {
    throw new Error((data.error && data.error.message) || 'Facebook API từ chối đăng bài.');
  }
  return data;
}

// getPageInfo — đọc {id, name} của chính Page bằng page token (chỉ đọc, không đăng gì). Dùng để xác minh token còn
// hiệu lực CHO ĐÚNG Page trước khi gửi bản xem trước/đăng và để hiện tên Page cho người duyệt. Token đi trong
// header Authorization, không đưa vào URL/log.
async function getPageInfo({ mockMode, pageId, pageAccessToken }) {
  if (mockMode) return { id: pageId, name: '[MOCK] ' + pageId };
  const r = await timedFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=id,name`, {
    headers: { Authorization: 'Bearer ' + pageAccessToken }
  }, 20000, false);
  const data = await r.json();
  if (!r.ok || !data.id) {
    throw new Error((data.error && data.error.message) || 'Token không truy cập được Page này.');
  }
  if (String(data.id) !== String(pageId)) throw new Error('Token thuộc Page khác (' + data.id + ').');
  return data;
}

module.exports = { exchangeCodeForToken, exchangeForLongLivedToken, getManagedPages, uploadPhoto, publishToFeed, getPageInfo };
