/*
 * shared/fbReconcileRead.js — ĐỐI SOÁT chỉ-đọc với Fanpage (GET). KHÔNG đăng, KHÔNG POST. Tách khỏi facebook-graph-api.js để không
 * đổi bề mặt export G1.
 *
 * FAIL-CLOSED: không có hàm nào ở đây "đoán". listPostsInWindow trả toàn bộ bài trong cửa sổ [startMs, endMs] (có phân trang) hoặc
 * ném lỗi / báo complete:false; matchPosts lọc theo Page + caption + số ảnh; người gọi chỉ được chốt khi ĐÚNG MỘT bài khớp.
 */
'use strict';
const GRAPH_VERSION = 'v25.0';
const GRAPH_HOST = 'https://graph.facebook.com/';
const PAGE_LIMIT = 25;
const MAX_PAGES = 10; // 250 bài trong cửa sổ — vượt mức này ⇒ complete:false (không kết luận)

function countPhotos(p) {
  const at = p && p.attachments && Array.isArray(p.attachments.data) ? p.attachments.data : [];
  let n = 0;
  for (const a of at) {
    if (a && a.subattachments && Array.isArray(a.subattachments.data)) n += a.subattachments.data.filter((x) => x && x.media_type === 'photo').length;
    else if (a && a.media_type === 'photo') n += 1;
  }
  return n;
}

async function getJson(url, pageAccessToken, f) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try { r = await f(url, { method: 'GET', headers: { Authorization: 'Bearer ' + pageAccessToken }, signal: ctrl.signal }); }
  catch (e) { throw new Error('Không gọi được Facebook (mạng/timeout).'); }
  finally { clearTimeout(t); }
  let data;
  try { data = await r.json(); } catch (e) { throw new Error('Facebook trả phản hồi không đọc được.'); }
  if (!r.ok || !data || !Array.isArray(data.data)) throw new Error((data && data.error && data.error.message) || 'Không đọc được danh sách bài của Page.');
  return data;
}

// listPostsInWindow — { complete, posts:[{ id, message, createdMs, fromId, imageCount }] }. Ném lỗi khi GET lỗi.
async function listPostsInWindow({ pageId, pageAccessToken, startMs, endMs, fetchImpl }) {
  if (!pageId || !pageAccessToken) throw new Error('Thiếu Page/token để đối soát.');
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs) && startMs > 0 && endMs > startMs)) throw new Error('Cửa sổ thời gian không hợp lệ.');
  const f = fetchImpl || global.fetch;
  let url = GRAPH_HOST + GRAPH_VERSION + '/' + encodeURIComponent(pageId) + '/published_posts?fields=' +
    encodeURIComponent('id,message,created_time,from{id},attachments{media_type,subattachments{media_type}}') +
    '&since=' + Math.floor(startMs / 1000) + '&until=' + Math.ceil(endMs / 1000) + '&limit=' + PAGE_LIMIT;
  const posts = [];
  let complete = true;
  for (let page = 0; url; page++) {
    if (page >= MAX_PAGES) { complete = false; break; }
    const data = await getJson(url, pageAccessToken, f);
    for (const p of data.data) {
      const ts = Date.parse(p && p.created_time);
      posts.push({ id: p && p.id != null ? String(p.id) : '', message: typeof (p && p.message) === 'string' ? p.message : '', createdMs: ts, fromId: p && p.from && p.from.id != null ? String(p.from.id) : null, imageCount: countPhotos(p) });
    }
    const next = data.paging && typeof data.paging.next === 'string' ? data.paging.next : null;
    if (next && next.indexOf(GRAPH_HOST) !== 0) throw new Error('Liên kết phân trang không hợp lệ.'); // không theo URL lạ (chống rò token)
    url = next;
  }
  return { complete, posts };
}

// matchPosts — chỉ giữ bài: đúng Page (tiền tố id hoặc from.id), caption KHỚP TUYỆT ĐỐI (sau trim), nằm trong cửa sổ, đúng số ảnh.
function matchPosts(posts, { pageId, message, imageCount, startMs, endMs }) {
  const want = String(message || '').trim();
  return posts.filter((p) => {
    const pagePrefix = String(p.id).split('_')[0];
    const pageOk = pagePrefix === String(pageId) || (p.fromId !== null && p.fromId === String(pageId));
    return pageOk && p.message.trim() === want && Number.isFinite(p.createdMs) && p.createdMs >= startMs && p.createdMs <= endMs && p.imageCount === imageCount;
  });
}

// getPost — GET đúng 1 bài theo Post ID (chỉ đọc) để Founder-recovery XÁC MINH Post ID do người dùng nhập. Trả { id, message, createdMs, fromId }.
// Ném lỗi khi Facebook từ chối / không trả id. KHÔNG tin Post ID người nhập: caller phải so id, Page, thời điểm, nội dung.
async function getPost({ postId, pageAccessToken, fetchImpl }) {
  if (!postId || !pageAccessToken) throw new Error('Thiếu Post ID/token để xác minh.');
  const f = fetchImpl || global.fetch;
  const url = GRAPH_HOST + GRAPH_VERSION + '/' + encodeURIComponent(postId) + '?fields=' + encodeURIComponent('id,message,created_time,from{id}');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try { r = await f(url, { method: 'GET', headers: { Authorization: 'Bearer ' + pageAccessToken }, signal: ctrl.signal }); }
  catch (e) { throw new Error('Không gọi được Facebook (mạng/timeout).'); }
  finally { clearTimeout(t); }
  let data;
  try { data = await r.json(); } catch (e) { throw new Error('Facebook trả phản hồi không đọc được.'); }
  if (!r.ok || !data || data.id == null) throw new Error((data && data.error && data.error.message) || 'Facebook không trả bài với Post ID này.');
  return { id: String(data.id), message: typeof data.message === 'string' ? data.message : '', createdMs: Date.parse(data.created_time), fromId: data.from && data.from.id != null ? String(data.from.id) : null };
}

// probeReadable — chứng minh token ĐỌC ĐƯỢC danh sách bài của Page (trả >= 1 bài, không cửa sổ). Danh sách rỗng trong cửa sổ chỉ có giá trị
// bằng chứng "chưa đăng" khi đã chứng minh token không bị mù (thiếu quyền có thể trả rỗng thay vì lỗi). Ném lỗi khi GET lỗi.
async function probeReadable({ pageId, pageAccessToken, fetchImpl }) {
  if (!pageId || !pageAccessToken) throw new Error('Thiếu Page/token.');
  const f = fetchImpl || global.fetch;
  const data = await getJson(GRAPH_HOST + GRAPH_VERSION + '/' + encodeURIComponent(pageId) + '/published_posts?fields=id&limit=1', pageAccessToken, f);
  return data.data.length >= 1;
}

module.exports = { listPostsInWindow, matchPosts, countPhotos, getPost, probeReadable, MAX_PAGES };
