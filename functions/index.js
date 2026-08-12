/*
 * openaiProxy — Cloud Function Proxy cho OpenAI (Sprint 3 Requirement #1,
 * kiến trúc do Chief Architect quyết định sau khi phát hiện rủi ro lưu API
 * Key phía client — xem ARCHITECTURE_REVIEW_SPRINT3.md).
 *
 * Kiến trúc: Browser (CMS) → Cloud Function Proxy (file này) → OpenAI API.
 *
 * Function này CHỈ có 3 nhiệm vụ, không chứa Business Logic (Business Logic
 * vẫn nằm trong PSH Platform — js/ai/modules/*.js, js/ai/job-queue.js...):
 *   1. Nhận request (action: "health" | "generate" | "generate_image").
 *   2. Validate request — xác thực Firebase Auth ID token của người gọi +
 *      kiểm tra tài khoản đó có entry trong node "roles" (đúng cùng cơ chế
 *      phân quyền CMS đã có, không tạo hệ thống auth mới).
 *   3. Gọi OpenAI bằng OPENAI_API_KEY (lưu trong Secret Manager qua
 *      defineSecret — KHÔNG BAO GIỜ gửi xuống browser, không lưu Firebase
 *      Realtime Database) và trả kết quả nguyên văn về cho Queue.
 *
 * "generate_image" (Sprint 12 Requirement #11 — Image AI) dùng ĐÚNG
 * OPENAI_API_KEY đã có, gọi Images API (dall-e-3) thay vì Chat Completions,
 * rồi tự tải ảnh về lưu vĩnh viễn vào Firebase Storage (Admin SDK) trước khi
 * trả URL cho client — ảnh OpenAI trả về chỉ tồn tại tạm thời, không lưu lại
 * ngay sẽ vỡ link khi Founder xem lại Draft sau.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const facebookGraphApi = require('./facebook-graph-api');
// validateImageUrlOrigin — SSRF fix (Sprint 15 Phase 1, Security Audit
// Finding 5). Built Sprint 14 Phase 1 (shared/validation.js) but never wired
// in until now. Used ONLY inside "remove_background" below, per Founder
// scope — does not touch editImageWithOpenAI() or "edit_image" (Product
// Banner), which stay exactly as they were.
const { validateImageUrlOrigin, validateContentType, resolveAndValidateIps } = require('./shared/validation');
const { getApps } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');

admin.initializeApp();

// Compat shim: firebase-admin v14 uses modular API.
// The legacy admin.database()/auth()/storage() no longer exist on the root.
// This shim restores the old-call-syntax so all 30+ route files keep working
// without rewriting every admin.database().ref() call site.
admin.database = getDatabase;
admin.database.ServerValue = ServerValue;
admin.auth = getAuth;
admin.storage = getStorage;

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Sprint 12 — Facebook Integration V1. App ID KHÔNG hardcode (khác quyết
// định tạm thời ở Facebook AI V5 trước đó) — đọc từ node Firebase
// `facebookAppConfig/appId` (Founder tự "Enter App ID" qua UI thật ở
// admin/facebook-settings.html, KHÔNG cần sửa code/redeploy). App Secret vẫn
// PHẢI qua Secret Manager (`defineSecret`) — không bao giờ hardcode, cùng
// nguyên tắc đã áp dụng cho OPENAI_API_KEY.
//
// Mock Mode: `mockMode = !appId` — bỏ trống App ID (trạng thái HIỆN TẠI,
// chưa có Facebook App thật) tự động bật Mock Mode cho MỌI request mới,
// không cần công tắc riêng nào khác. Xem functions/facebook-graph-api.js.
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');
const FACEBOOK_OAUTH_CALLBACK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback';
const FACEBOOK_RETURN_URL = 'https://pshopmusic.com/admin/facebook-settings.html';

function getFacebookAppId() {
  return admin.database().ref('facebookAppConfig/appId').once('value').then(snap => snap.val() || '');
}

async function validateRequest(req) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, status: 401, error: 'Thiếu Authorization Bearer token.' };
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    return { ok: false, status: 401, error: 'Token không hợp lệ hoặc đã hết hạn.' };
  }
  const roleSnap = await admin.database().ref('roles/' + decoded.uid).once('value');
  if (!roleSnap.exists()) {
    return { ok: false, status: 403, error: 'Tài khoản chưa được cấp quyền CMS.' };
  }
  return { ok: true, uid: decoded.uid };
}

// editImageWithOpenAI — dùng CHUNG cho "remove_background" (xóa phông, giữ
// nguyên sản phẩm) và "edit_image" (banner nền+chữ mới) — cả 2 đều cần CÙNG
// 1 việc: gửi ẢNH THẬT lên OpenAI để CHỈNH SỬA trực tiếp (model gpt-image-1,
// endpoint /v1/images/edits — KHÁC hẳn generate_image dùng dall-e-3 chỉ vẽ
// ảnh MỚI từ mô tả chữ, không nhận ảnh đầu vào được). Trả về URL Storage vĩnh
// viễn (ảnh OpenAI trả tạm thời sẽ hết hạn nếu không tải về lưu ngay).
async function editImageWithOpenAI({ inputUrl, prompt, size, transparentBackground, storagePrefix }) {
  // SSRF guard � validate URL before fetching
  const urlError = validateImageUrlOrigin(inputUrl);
  if (urlError) throw new Error('SSRF guard rejected image URL: ' + urlError);

  // Redirect chain validation � follow up to 5 hops, validate each one
  let currentUrl = inputUrl;
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;
  let fetchRes;
  while (true) {
    fetchRes = await fetch(currentUrl, { redirect: 'manual' });
    if (fetchRes.status < 300 || fetchRes.status >= 400) break;
    if (++redirectCount > MAX_REDIRECTS) throw new Error('Too many redirects fetching image URL');
    const location = fetchRes.headers.get('location');
    if (!location) throw new Error('Redirect without Location header');
    const resolved = new URL(location, currentUrl).href;
    const redirectError = validateImageUrlOrigin(resolved);
    if (redirectError) throw new Error('SSRF guard rejected redirect target: ' + redirectError);
    currentUrl = resolved;
  }

  // DNS/IP validation � resolve hostname, block private IPs
  const finalUrl = fetchRes.url || currentUrl;
  try {
    const parsedUrl = new URL(finalUrl);
    const dnsError = await resolveAndValidateIps(parsedUrl.hostname);
    if (dnsError) throw new Error(dnsError);
  } catch (ipErr) {
    throw new Error('DNS validation failed for "' + finalUrl + '": ' + ipErr.message);
  }

  if (!fetchRes.ok) throw new Error('Kh�ng t?i du?c ?nh t? URL cung c?p.');

  // Content-Type validation � accept only image/* or octet-stream
  const mimeType = fetchRes.headers.get('content-type') || '';
  const ctError = validateContentType(mimeType);
  if (ctError) throw new Error(ctError);

  const imgBuf = Buffer.from(await fetchRes.arrayBuffer());
  const SIZE_MAP = { '1:1': '1024x1024', '4:5': '1024x1536', '16:9': '1536x1024' };
  const openAiSize = SIZE_MAP[size] || 'auto';

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('image', new Blob([imgBuf], { type: mimeType }), 'source.png');
  form.append('prompt', prompt);
  form.append('size', openAiSize);
  form.append('n', '1');
  if (transparentBackground) form.append('background', 'transparent');

  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OPENAI_API_KEY.value() },
    body: form
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI Images Edit API lỗi.');
  const item = data.data && data.data[0];
  if (!item || !item.b64_json) throw new Error('OpenAI không trả về ảnh.');

  const buffer = Buffer.from(item.b64_json, 'base64');
  const path = `${storagePrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const bucket = admin.storage().bucket();
  const token = require('crypto').randomUUID();
  await bucket.file(path).save(buffer, {
    metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } }
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

exports.openaiProxy = onRequest({ secrets: [OPENAI_API_KEY], cors: true, timeoutSeconds: 120 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
    return;
  }

  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { action, model, prompt, size } = req.body || {};

  if (action === 'health') {
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: 'Bearer ' + OPENAI_API_KEY.value() }
      });
      if (r.ok) {
        res.json({ healthy: true, message: 'Kết nối OpenAI thành công.' });
        return;
      }
      const body = await r.json().catch(() => ({}));
      res.json({ healthy: false, message: (body.error && body.error.message) || `Lỗi kết nối OpenAI (HTTP ${r.status}).` });
    } catch (err) {
      res.json({ healthy: false, message: 'Lỗi mạng khi gọi OpenAI: ' + err.message });
    }
    return;
  }

  if (action === 'generate') {
    if (!prompt) {
      res.status(400).json({ error: 'Thiếu "prompt".' });
      return;
    }
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + OPENAI_API_KEY.value()
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      const data = await r.json();
      if (!r.ok) {
        res.status(r.status).json({ error: (data.error && data.error.message) || 'OpenAI API lỗi.' });
        return;
      }
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      res.json({ text: (text || '').trim(), raw: data });
    } catch (err) {
      res.status(502).json({ error: 'Lỗi khi gọi OpenAI: ' + err.message });
    }
    return;
  }

  // generate_image — Sprint 12 Requirement #11 (Image AI). Dùng ĐÚNG
  // OPENAI_API_KEY đã có sẵn (không cần key/tài khoản mới) nhưng gọi endpoint
  // Images API (dall-e-3) thay vì Chat Completions. Ảnh trả về từ OpenAI chỉ
  // là URL/base64 TẠM THỜI (hết hạn sau vài giờ) — phải tải về và lưu vĩnh
  // viễn vào Firebase Storage NGAY trong Cloud Function (Admin SDK, có quyền
  // ghi Storage không qua Storage Rules) trước khi trả về cho client, để Image
  // Draft xem lại được sau này không bị vỡ ảnh.
  if (action === 'generate_image') {
    if (!prompt) {
      res.status(400).json({ error: 'Thiếu "prompt".' });
      return;
    }
    // dall-e-3 chỉ hỗ trợ ĐÚNG 3 kích thước cố định — không có tỉ lệ 4:5 thật,
    // "4:5" dùng tạm kích thước dọc gần nhất (1024x1792). Không giả vờ đây là
    // crop chính xác 4:5 — UI phía client phải ghi rõ đây là xấp xỉ.
    const SIZE_MAP = { '1:1': '1024x1024', '4:5': '1024x1792', '16:9': '1792x1024' };
    const openAiSize = SIZE_MAP[size] || '1024x1024';
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + OPENAI_API_KEY.value()
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          size: openAiSize,
          n: 1
        })
      });
      const data = await r.json();
      if (!r.ok) {
        res.status(r.status).json({ error: (data.error && data.error.message) || 'OpenAI Images API lỗi.' });
        return;
      }
      const item = data.data && data.data[0];
      if (!item || !item.b64_json) {
        res.status(502).json({ error: 'OpenAI không trả về ảnh.' });
        return;
      }
      const buffer = Buffer.from(item.b64_json, 'base64');
      const path = `ai-generated/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const bucket = admin.storage().bucket();
      const token = require('crypto').randomUUID();
      await bucket.file(path).save(buffer, {
        metadata: {
          contentType: 'image/png',
          metadata: { firebaseStorageDownloadTokens: token }
        }
      });
      // Cùng ĐÚNG định dạng URL mà Firebase Client SDK tự sinh ra khi Admin
      // Upload từ trình duyệt (getDownloadURL()) - để hoạt động y hệt ảnh
      // upload thủ công ở mọi nơi khác trong CMS (Storage Rules đã cho phép
      // "get" công khai cho mọi path, xem storage.rules — không cần đổi Rules).
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
      res.json({ imageUrl, raw: { revisedPrompt: item.revised_prompt || '', size: openAiSize } });
    } catch (err) {
      res.status(502).json({ error: 'Lỗi khi gọi OpenAI Images API: ' + err.message });
    }
    return;
  }

  // remove_background — Req C (Xóa phông). TRƯỚC ĐÂY: GPT-4o Vision mô tả sản
  // phẩm bằng chữ rồi DALL-E 3 VẼ LẠI TOÀN BỘ ảnh mới theo mô tả đó — không
  // phải ảnh thật, dễ sai màu/chi tiết/logo so với ảnh gốc (Founder phát hiện
  // khi yêu cầu tính năng banner nền+chữ mới — cùng gốc rễ). Giờ dùng ĐÚNG
  // model gpt-image-1 qua /v1/images/edits — NHẬN ẢNH GỐC THẬT làm đầu vào,
  // giữ nguyên sản phẩm, chỉ thay nền trong suốt — không còn "vẽ lại theo
  // trí nhớ" nữa. Giữ NGUYÊN tên action + shape response {imageUrl} cho client
  // cũ (js/admin-bg-remover.js) không cần sửa gì.
  if (action === 'remove_background') {
    const { imageUrl: inputUrl } = req.body || {};
    if (!inputUrl) {
      res.status(400).json({ error: 'Thiếu "imageUrl".' });
      return;
    }
    // SSRF fix (Sprint 15 Phase 1, Security Audit Finding 5) — inputUrl đi
    // thẳng vào fetch() phía server (qua editImageWithOpenAI() bên dưới);
    // trước đây KHÔNG kiểm tra nguồn, 1 caller đã xác thực có thể ép Cloud
    // Function fetch bất kỳ URL nào. Chặn ở ĐÚNG action này theo yêu cầu
    // Founder — không sửa editImageWithOpenAI() (dùng chung với "edit_image",
    // giữ nguyên hành vi Product Banner).
    if (!validateImageUrlOrigin(inputUrl)) {
      res.status(400).json({ error: 'imageUrl không hợp lệ — chỉ chấp nhận ảnh từ Firebase Storage của dự án.' });
      return;
    }
    try {
      const resultUrl = await editImageWithOpenAI({
        inputUrl,
        prompt: 'Remove the background completely, keep the main product exactly as it is (same colors, shape, logos, text, details) — do not redraw or alter the product itself in any way.',
        transparentBackground: true,
        storagePrefix: 'bg-removed'
      });
      res.json({ imageUrl: resultUrl });
    } catch (err) {
      res.status(502).json({ error: 'Lỗi xóa phông: ' + err.message });
    }
    return;
  }

  // edit_image — Founder yêu cầu "đưa ảnh gốc lên AI xử lý nền rồi bỏ chữ vào
  // ảnh" (banner sản phẩm kiểu AlphaTheta) — dùng CHUNG hàm editImageWithOpenAI
  // ở trên với remove_background, chỉ khác prompt (đổi nền theo phong cách +
  // in chữ tên sản phẩm vào ảnh) và KHÔNG xóa nền trong suốt (banner cần nền
  // đầy đủ). Trả về 1 ảnh DUY NHẤT (nền mới + chữ đã có sẵn trong ảnh) —
  // đúng yêu cầu "1 ảnh tải về là xong", không phải ghép 2 lớp CSS như
  // generate_image (Product Background Image) đã làm trước đó.
  if (action === 'edit_image') {
    const { imageUrl: inputUrl, prompt: editPrompt, size } = req.body || {};
    if (!inputUrl) { res.status(400).json({ error: 'Thiếu "imageUrl".' }); return; }
    if (!editPrompt) { res.status(400).json({ error: 'Thiếu "prompt".' }); return; }
    try {
      const resultUrl = await editImageWithOpenAI({ inputUrl, prompt: editPrompt, size, storagePrefix: 'ai-generated' });
      res.json({ imageUrl: resultUrl });
    } catch (err) {
      res.status(502).json({ error: 'Lỗi khi gọi OpenAI Images Edit API: ' + err.message });
    }
    return;
  }

  res.status(400).json({ error: 'action không hợp lệ (chỉ hỗ trợ "generate", "generate_image", "edit_image", "remove_background", hoặc "health").' });
});

/*
 * facebookOAuthCallback — điểm Facebook redirect trình duyệt VỀ sau khi
 * Founder đăng nhập + cấp quyền (KHÔNG phải 1 lượt fetch() có Authorization
 * header như openaiProxy — đây là 1 GET navigation thật của trình duyệt, nên
 * KHÔNG thể xác thực bằng Firebase ID token ở đây). Thay vào đó, xác định
 * "yêu cầu này của Founder nào" qua tham số `state` — 1 nonce dùng 1 lần do
 * client tự tạo + ghi vào `facebookOAuthState/{state}` TRƯỚC khi redirect
 * (xem js/admin-facebook-connect.js).
 *
 * Mock Mode (Sprint 12 — Facebook Integration V1): `mockMode = !appId` được
 * TÍNH 1 LẦN NGAY TẠI ĐÂY và LƯU LẠI (`isMock`) xuyên suốt cả token Page lẫn
 * User Token — không tính lại mockMode ở facebookPublish/facebookRefreshToken
 * dựa trên App ID hiện tại, để 1 kết nối mock không bị nhầm gọi Graph API
 * thật chỉ vì Founder vừa điền App ID sau đó (phải "Kết nối lại" thật mới
 * chuyển hẳn sang chế độ thật).
 *
 * Luồng: code -> Short-Lived User Token -> Long-Lived User Token (~60 ngày,
 * LƯU LẠI vào `facebookUserToken` server-only để facebookRefreshToken dùng
 * sau này) -> danh sách Fanpage + Page Access Token riêng từng Page. Token
 * THẬT chỉ lưu vào node server-only `facebookPageTokens/{uid}` (Database
 * Rules .read:false/.write:false tuyệt đối, chỉ Admin SDK đọc/ghi được) —
 * client chỉ nhận metadata Page (id/name/ảnh đại diện) qua
 * `facebookPendingPages` để hiển thị danh sách chọn, KHÔNG BAO GIỜ thấy
 * token thật.
 */
exports.facebookOAuthCallback = onRequest({ secrets: [FACEBOOK_APP_SECRET] }, async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query || {};

  if (error) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent(errorDescription || String(error))}`);
    return;
  }
  if (!code || !state) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent('Thiếu code/state từ Facebook.')}`);
    return;
  }

  try {
    const stateRef = admin.database().ref('facebookOAuthState/' + state);
    const stateSnap = await stateRef.once('value');
    const stateData = stateSnap.val();
    if (!stateData || !stateData.uid) {
      throw new Error('Phiên kết nối không hợp lệ hoặc đã hết hạn — vui lòng thử Kết nối lại.');
    }
    await stateRef.remove(); // dùng 1 lần, xoá ngay sau khi xác nhận
    const uid = stateData.uid;

    const appId = await getFacebookAppId();
    const mockMode = !appId;
    const appSecret = FACEBOOK_APP_SECRET.value();

    const tokenData = await facebookGraphApi.exchangeCodeForToken({
      mockMode, code, appId, appSecret, redirectUri: FACEBOOK_OAUTH_CALLBACK_URL
    });

    const longLivedData = await facebookGraphApi.exchangeForLongLivedToken({
      mockMode, shortLivedToken: tokenData.access_token, appId, appSecret
    });
    const userToken = longLivedData.access_token;
    // Facebook không phải lúc nào cũng trả "expires_in" cho Long-Lived Token —
    // mặc định ước tính 60 ngày (giá trị Meta công bố) nếu thiếu, để tokenExpiresAt
    // không bao giờ là "không xác định".
    const expiresInSec = longLivedData.expires_in || 60 * 24 * 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;

    const accountsData = await facebookGraphApi.getManagedPages({ mockMode, userToken });
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
      tokenUpdates[p.id] = { accessToken: p.access_token, name: p.name, obtainedAt: Date.now(), expiresAt, isMock: mockMode };
    });

    await admin.database().ref('facebookPendingPages/' + uid).set({ pages: pendingPages, fetchedAt: Date.now(), isMock: mockMode });
    await admin.database().ref('facebookPageTokens/' + uid).set(tokenUpdates);
    // facebookUserToken — node TOÀN CỤC (không theo uid, chỉ 1 kết nối Facebook
    // cho toàn platform tại 1 thời điểm, giống facebookActiveToken) — giữ lại
    // (KHÔNG xoá ở facebookSelectPage) để facebookRefreshToken dùng làm mới
    // Page Token sau này mà không cần Founder đăng nhập lại từ đầu.
    await admin.database().ref('facebookUserToken').set({
      accessToken: userToken, obtainedAt: Date.now(), expiresAt, isMock: mockMode, obtainedBy: uid
    });

    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=success`);
  } catch (err) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent(err.message)}`);
  }
});

/*
 * facebookSelectPage — Founder chọn 1 Fanpage làm Default Page (sau khi
 * facebookOAuthCallback đã lấy về danh sách Fanpage). Gọi qua fetch() có
 * Authorization header thật (giống openaiProxy) nên validateRequest() dùng
 * lại được nguyên vẹn. Copy token của ĐÚNG Page được chọn từ
 * `facebookPageTokens/{uid}` (server-only) sang `facebookActiveToken`
 * (server-only, node DUY NHẤT facebookPublish đọc để đăng bài thật) + ghi
 * `facebookConnection` (chỉ metadata, không token — client đọc để hiển thị
 * card trạng thái).
 */
exports.facebookSelectPage = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
    return;
  }
  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { pageId } = req.body || {};
  if (!pageId) {
    res.status(400).json({ error: 'Thiếu "pageId".' });
    return;
  }

  try {
    const uid = check.uid;
    const tokenSnap = await admin.database().ref('facebookPageTokens/' + uid + '/' + pageId).once('value');
    const tokenData = tokenSnap.val();
    if (!tokenData) {
      res.status(404).json({ error: 'Không tìm thấy Fanpage đã chọn — vui lòng bấm Kết nối lại.' });
      return;
    }
    const pendingSnap = await admin.database().ref('facebookPendingPages/' + uid + '/pages').once('value');
    const pendingPages = pendingSnap.val() || [];
    const pageMeta = pendingPages.find(p => p.id === pageId) || {};
    const userRecord = await admin.auth().getUser(uid);

    await admin.database().ref('facebookActiveToken').set({
      pageId,
      accessToken: tokenData.accessToken,
      obtainedAt: tokenData.obtainedAt,
      expiresAt: tokenData.expiresAt,
      isMock: !!tokenData.isMock
    });

    await admin.database().ref('facebookConnection').set({
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
    await admin.database().ref('facebookPendingPages/' + uid).remove();
    await admin.database().ref('facebookPageTokens/' + uid).remove();

    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: 'Lỗi khi lưu Fanpage đã chọn: ' + err.message });
  }
});

/*
 * facebookPublish — đăng THẬT lên Fanpage đã kết nối. CHỈ nhận nội dung đã
 * lắp sẵn từ client (message/imageUrls) — không chứa Business Logic biết về
 * aiDrafts/Product/Blog (đúng nguyên tắc Cloud Function chỉ proxy, Business
 * Logic lắp ráp caption/hashtag/link/YouTube vẫn nằm ở js/admin-ai.js, xem
 * PROJECT_ARCHITECTURE.md). Đọc token thật DUY NHẤT từ `facebookActiveToken`
 * (server-only, Admin SDK) — không bao giờ nhận token từ client.
 */
exports.facebookPublish = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
    return;
  }
  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { message, imageUrls } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'Thiếu nội dung bài đăng ("message").' });
    return;
  }

  try {
    const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
    const active = activeSnap.val();
    if (!active || !active.accessToken) {
      res.status(400).json({ success: false, error: 'Chưa kết nối Facebook — vào Cài đặt > Facebook Configuration để kết nối trước.' });
      return;
    }
    if (active.expiresAt && Date.now() > active.expiresAt) {
      res.status(400).json({ success: false, error: 'Token Facebook đã hết hạn — vào Cài đặt > Facebook Configuration để kết nối lại.' });
      return;
    }

    const pageId = active.pageId;
    const accessToken = active.accessToken;
    // mockMode LẤY TỪ chính kết nối đã lưu (`active.isMock`), KHÔNG tính lại
    // từ App ID hiện tại — 1 kết nối được thiết lập ở Mock Mode phải TIẾP TỤC
    // gọi Graph API giả lập cho tới khi Founder "Kết nối lại" thật, tránh vô
    // tình gọi Facebook thật bằng token giả nếu App ID được điền sau đó.
    const mockMode = !!active.isMock;
    const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

    // Nhiều ảnh trong 1 bài đăng — đúng pattern Graph API công khai: upload
    // từng ảnh với published:false (chưa hiển thị riêng lẻ) để lấy media_fbid,
    // rồi lắp tất cả vào 1 bài đăng /feed duy nhất qua "attached_media".
    const attachedMedia = [];
    for (const url of images) {
      const photoData = await facebookGraphApi.uploadPhoto({ mockMode, pageId, imageUrl: url, pageAccessToken: accessToken });
      attachedMedia.push({ media_fbid: photoData.id });
    }

    const feedData = await facebookGraphApi.publishToFeed({ mockMode, pageId, message, attachedMedia, pageAccessToken: accessToken });

    res.json({ success: true, facebookPostId: feedData.id, mockMode });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/*
 * facebookRefreshToken — Sprint 12, Facebook Integration V1 (Token Refresh).
 * Meta cho phép đổi 1 Long-Lived User Token CÒN HẠN lấy 1 Long-Lived User
 * Token MỚI (gia hạn thêm ~60 ngày) mà KHÔNG cần Founder đăng nhập lại —
 * đây là cơ chế "làm mới" DUY NHẤT Facebook hỗ trợ cho loại token này (không
 * có refresh token riêng như OAuth chuẩn). Nếu Token đã hết hạn HOÀN TOÀN,
 * Meta sẽ từ chối đổi — lúc đó không có cách nào khác ngoài "Kết nối lại"
 * (đăng nhập Facebook lại từ đầu), đây là giới hạn thật của Facebook, không
 * phải thiếu sót của code.
 */
exports.facebookRefreshToken = onRequest({ secrets: [FACEBOOK_APP_SECRET], cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
    return;
  }
  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  try {
    const userTokenSnap = await admin.database().ref('facebookUserToken').once('value');
    const userTokenRecord = userTokenSnap.val();
    if (!userTokenRecord || !userTokenRecord.accessToken) {
      res.status(400).json({ success: false, error: 'Chưa từng kết nối Facebook — vào Cài đặt > Facebook Configuration để kết nối trước.' });
      return;
    }
    if (userTokenRecord.expiresAt && Date.now() > userTokenRecord.expiresAt) {
      res.status(400).json({ success: false, error: 'Token đã hết hạn hoàn toàn — không thể tự làm mới, vui lòng bấm "Kết nối lại" để đăng nhập Facebook từ đầu.' });
      return;
    }

    const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
    const active = activeSnap.val();
    if (!active || !active.pageId) {
      res.status(400).json({ success: false, error: 'Chưa chọn Fanpage nào — vào Cài đặt > Facebook Configuration để kết nối trước.' });
      return;
    }

    // Giữ NGUYÊN mockMode của kết nối gốc — cùng lý do đã áp dụng ở
    // facebookPublish (không tính lại theo App ID hiện tại).
    const mockMode = !!userTokenRecord.isMock;
    const appId = await getFacebookAppId();
    const appSecret = FACEBOOK_APP_SECRET.value();

    const refreshed = await facebookGraphApi.exchangeForLongLivedToken({
      mockMode, shortLivedToken: userTokenRecord.accessToken, appId, appSecret
    });
    const freshUserToken = refreshed.access_token;
    const expiresInSec = refreshed.expires_in || 60 * 24 * 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;

    const accountsData = await facebookGraphApi.getManagedPages({ mockMode, userToken: freshUserToken });
    const pages = accountsData.data || [];
    const matchingPage = pages.find(p => p.id === active.pageId);
    if (!matchingPage) {
      throw new Error('Không còn thấy Fanpage đã kết nối trong danh sách quản lý — vui lòng "Kết nối lại".');
    }

    await admin.database().ref('facebookUserToken').set({
      accessToken: freshUserToken, obtainedAt: Date.now(), expiresAt, isMock: mockMode, obtainedBy: check.uid
    });
    await admin.database().ref('facebookActiveToken').update({
      accessToken: matchingPage.access_token, obtainedAt: Date.now(), expiresAt
    });
    await admin.database().ref('facebookConnection').update({ tokenExpiresAt: expiresAt });

    res.json({ success: true, tokenExpiresAt: expiresAt });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/*
 * ════════════════════════════════════════════════════════════════════════
 * apiGateway — Sprint 14. Phase 1 (đã PASS, deploy trước) = hạ tầng thuần:
 * API Gateway/Auth/Permission/Validation/Rate Limit/Audit Log/Response-Error
 * chuẩn/Versioning/Health/Retry/Async Job/Webhook Framework — route thật
 * DUY NHẤT là /v1/health (public) + /v1/system/* (admin nội bộ).
 *
 * Phase 2 (khối này thêm vào) = Core CMS APIs theo SPRINT14_API_ARCHITECTURE
 * _FINAL.md mục 20 (Founder đổi số Phase so với bản gốc — mục 20 gọi đây là
 * "Phase 1 — Core CMS APIs", Founder xác nhận gọi là "Phase 2"): Products,
 * Categories, Brands (mới), Tags (mới), Blog, Banner, Slider, Video, Menu,
 * Footer, SEO, Media/Storage, Settings, Users/Roles — mục 17.2-17.13, 17.22.
 * Routing thật nằm ở functions/routes/cmsLists.js (7 module dạng danh
 * sách) + cmsSingletons.js (5 module dạng object cấu hình) + media.js +
 * users.js — file này chỉ điều phối pipeline chung (Rate Limit → Auth
 * KHÔNG BẮT BUỘC cho GET công khai → dispatch) rồi giao cho từng router tự
 * quyết định quyền theo đúng bảng Permission mục 17.
 *
 * Phase 3 (khối này thêm vào) = Founder APIs theo mục 20 (bản gốc "Phase 2",
 * Founder xác nhận gọi là "Phase 3"): Draft/Publish Pipeline (17.14, kèm
 * chuyển publishToTarget() vào Backend), Queue/Jobs (17.15), Facebook
 * Integration (17.21, wrap 3 Cloud Function Facebook có sẵn qua proxy, giữ
 * nguyên oauth/callback dạng redirect), Social Media Center (17.20, publish/
 * schedule — schedule CHỈ lưu ý định, CHƯA có Cloud Scheduler thật kích hoạt
 * — xem routes/socialMediaCenter.js), Logs/History/Workflows (17.23),
 * Founder Home + One Click Marketing (17.19 orchestration, trả 503 rõ ràng
 * vì phụ thuộc AI Generate APIs chưa xây — xem routes/founder.js). Routing ở
 * routes/drafts.js, routes/jobsLogs.js, routes/facebook.js,
 * routes/socialMediaCenter.js, routes/founder.js — publishToTarget() port ở
 * shared/publishToTarget.js.
 *
 * Phase 4 (khối này thêm vào) = Agent APIs theo mục 20 (bản gốc "Phase 3",
 * Founder xác nhận gọi là "Phase 4"): Founder Agent Plan/Execute (5 nhóm
 * hành vi, mục 18.1), Undo/Resume/Discard, Conversation Session (mục 18.3,
 * pendingClarification chuyển hẳn vào Backend, TTL mềm 30 phút). 2 node RTDB
 * MỚI: `agentPlans/`, `agentConversations/` — Plan/Step trước đây chỉ sống
 * trong biến JS phía client, giờ có nơi lưu bền cho API stateless. Nhóm
 * "Điều hướng" (open-product/update-product-field/open-draft/navigate) được
 * THIẾT KẾ LẠI trả `deepLinkUrl` thay vì tự điều hướng trình duyệt. Nhóm
 * "Generic Plugin" (8 module AI + marker "seo") trả `status:'failed'` rõ
 * ràng ở Phase 4 — Phase 5 (khối dưới đây) nối dây thật. Routing ở
 * routes/agent.js — Planner/Executor port ở shared/agentPlanner.js,
 * shared/agentExecute.js, shared/agentTools.js.
 *
 * Phase 5 (khối này thêm vào) = Media AI APIs theo mục 20 (bản gốc "Phase
 * 4", Founder xác nhận gọi là "Phase 5"): port 9 module AI content-
 * generation (`js/ai/modules/*.js`) sang `shared/aiModules.js` (prompt/parse/
 * mapToDraftContent NGUYÊN VĂN) + `shared/aiGenerate.js` (gọi OpenAI TRỰC
 * TIẾP bằng lại `OPENAI_API_KEY` Secret đã có — không vòng qua `openaiProxy`
 * — rồi ghi `aiDrafts`, CÙNG shape `AIJobQueue.processItem()` đã làm phía
 * client). 9 route thật `POST /v1/ai/{blog|product-description|seo|
 * facebook-post|banner|image|image-prompt|slider|faq}/generate`
 * (routes/aiGenerate.js) + 3 route khung Video/Voice/Subtitle (trả 503 rõ
 * ràng, "chưa impl thật, chỉ chuẩn bị shape" đúng mục 20). Đồng bộ trong 1
 * request (CHƯA có worker nền thật — xem ghi chú trong aiGenerate.js).
 * Nối dây 2 chỗ đã stub ở Phase 3/4: `/v1/ai/one-click-marketing`
 * (routes/founder.js, gọi lại 4 route generate — Blog/Facebook/Banner/
 * ImagePrompt) và nhóm "Generic Plugin" của Founder Agent
 * (shared/agentExecute.js, gọi `generateForModule()` — 1 nguồn logic sinh
 * nội dung duy nhất cho cả 3 lối vào).
 *
 * Phase 6 (khối này thêm vào) = Self-Healing API (mục 20 bản gốc "Phase 5")
 * + OpenClaw Integration (mục 20 bản gốc "Phase 6") — Founder giao chung 1
 * lượt, gọi là "Phase 6". Founder XÁC NHẬN LẠI nguyên tắc "No Self-Auto-Fix"
 * (mục 13) trước khi giao: Repair CHỈ chạy khi có request rõ ràng gọi tới,
 * KHÔNG có job nền/schedule nào tự sửa — xem shared/selfHealing.js.
 * - **Self-Healing** (`routes/selfHealing.js` + `shared/selfHealing.js`):
 *   `GET /v1/{module}/status`, `POST /v1/{module}/validate`, `POST
 *   /v1/{module}/repair` cho queue/drafts/media/rules/ai-provider (Facebook
 *   có route riêng trong routes/facebook.js — đã sở hữu domain đó từ Phase
 *   3). Repair CHỈ tự thực thi hành động HẠ TẦNG THUẦN (nhả lock Job quá
 *   TTL, xoá OAuth state nonce hết hạn, refresh Facebook Token qua đúng API
 *   đã có) — đụng DỮ LIỆU NGHIỆP VỤ THẬT (Draft/Rules/API Key) LUÔN trả
 *   `requiresApproval:true`, không tự sửa. `POST /v1/queue/retry` là alias
 *   gọi lại `retryFailed()` đã có (routes/jobsLogs.js), không viết logic
 *   retry thứ 2, đúng "Reconcile với Jobs Retry" mục 13. Thêm `GET
 *   /v1/system/diagnostics` (tổng hợp toàn bộ module) + `GET
 *   /v1/system/jobs/monitor` ("Job Monitor" — đếm theo status, phát hiện
 *   Job "running" kẹt quá 10 phút).
 * - **Event Bus + Webhook Events** (`shared/eventBus.js` + `routes/
 *   webhooks.js`) — KHÔNG tạo message broker mới, tái dùng
 *   `shared/webhook.js` (Phase 1, `sendWebhook()` có sẵn nhưng chưa từng
 *   được gọi) — `emit()` được gọi TỪ sự kiện THẬT đã xảy ra
 *   (`draft.published` ở routes/drafts.js, `ai.generate.completed`/`.failed`
 *   ở shared/aiGenerate.js), ghi `apiEvents` (log ngắn hạn, giữ 200 gần
 *   nhất) + gửi HTTP callback tới URL đã đăng ký qua `POST /v1/webhooks`.
 *   `GET /v1/events` cho phép poll lại (dự phòng khi không có URL public
 *   nhận webhook). AI Generate (Phase 5) VẪN đồng bộ trong 1 request — CHƯA
 *   có worker nền thật xử lý bất đồng bộ thật sự (jobId trả về ngay rồi xử
 *   lý sau) như tài liệu FINAL mục 14 mô tả — ngoài phạm vi mission Phase 6
 *   được giao (không có trong danh sách "Implement ONLY"), ghi nhận ROADMAP.
 * - **OpenClaw Integration** (`routes/openclaw.js`) — ĐÚNG nguyên tắc mục
 *   19: OpenClaw KHÔNG có quyền đặc biệt, dùng CHUNG Auth/Permission/Rate-
 *   Limit như mọi client — vì vậy KHÔNG có 1 "OpenClaw API" tách biệt nào,
 *   chỉ có `GET /v1/openclaw/capabilities` (discovery — trả về nhóm API
 *   nào người gọi ĐANG có quyền dùng thật, dựa theo role thật) để tự biết
 *   được làm gì thay vì đoán/thử-sai qua 403. Mọi thao tác nghiệp vụ thật
 *   đi thẳng qua API Phase 1-5 đã có. `structural.write.*` (create-product/
 *   detect-category qua Founder Agent) vẫn KHÔNG mở mặc định — role `agent`
 *   vẫn RỖNG, chưa có Decision Record riêng nào kích hoạt.
 *
 * openaiProxy + 4 Facebook Function ở TRÊN giữ NGUYÊN VẸN, KHÔNG đổi.
 * ════════════════════════════════════════════════════════════════════════
 */
const { authenticate, isPublicPath } = require('./shared/auth');
const { hasPermission } = require('./shared/permissions');
const { validateSchema } = require('./shared/validation');
const { checkAndIncrement } = require('./shared/rateLimit');
const { ALLOWED_ORIGINS } = require('./shared/corsConfig');
const auditLog = require('./shared/auditLog');
const { sendWebhook, WEBHOOK_SIGNING_SECRET } = require('./shared/webhook');
const { createJob, getJob, updateJobStatus, updateWorkflowState, appendExecutionLog, getWorkflowConfig } = require('./shared/asyncJob');
const { onValueCreated } = require('firebase-functions/v2/database');
const { runGeneration } = require('./shared/aiGenerate');
const { withRetry } = require('./shared/retry');
const { sendSuccess, sendError, makeRequestId } = require('./shared/response');
const healthRoutes = require('./routes/health');
const cmsListsRoutes = require('./routes/cmsLists');
const cmsSingletonRoutes = require('./routes/cmsSingletons');
const mediaRoutes = require('./routes/media');
const usersRoutes = require('./routes/users');
const draftsRoutes = require('./routes/drafts');
const jobsLogsRoutes = require('./routes/jobsLogs');
const facebookRoutes = require('./routes/facebook');
const socialMediaCenterRoutes = require('./routes/socialMediaCenter');
const founderRoutes = require('./routes/founder');
const agentRoutes = require('./routes/agent');
const aiGenerateRoutes = require('./routes/aiGenerate');
const selfHealingRoutes = require('./routes/selfHealing');
const webhooksRoutes = require('./routes/webhooks');
const categoriesRoutes = require('./routes/categories');
const inventoryRoutes = require('./routes/inventory');
const customersRoutes = require('./routes/customers');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const openclawRoutes = require('./routes/openclaw');
const businessesRoutes = require('./routes/businesses');
const productsRoutes = require('./routes/products');
const productMediaRoutes = require('./routes/productMedia');
const reportsRoutes = require('./routes/reports');
const subscriptionsRoutes = require('./routes/subscriptions');
const registrationRoutes = require('./routes/registration');
const notificationsRoutes = require('./routes/notifications');
const auditLogsRoutes = require('./routes/auditLogs');
const apiKeysRoutes = require('./routes/apiKeys');
const transactionsRoutes = require('./routes/transactions');
const teamRoutes = require('./routes/team');
const tenantCmsRoutes = require('./routes/tenantCms');
const tenantSettingsRoutes = require('./routes/tenantSettings');

// cors: ALLOWED_ORIGINS (Sprint 15 Phase 1, Task 1.2) — trước đây cors:true
// (bất kỳ origin nào). Không ảnh hưởng gọi không có Origin header (curl,
// server gọi server) — CORS chỉ do trình duyệt thực thi.

// Initialize Firebase Admin if not already done
if (!getApps().length) { admin.initializeApp(); }

exports.apiGateway = onRequest({ secrets: [OPENAI_API_KEY, WEBHOOK_SIGNING_SECRET], cors: ALLOWED_ORIGINS, timeoutSeconds: 120 }, async (req, res) => {
  const requestId = makeRequestId();
  res.locals = { requestId };
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  req.__pshPath = path;
  const helpers = { sendSuccess, sendError };

  // Versioning (mục 15) — CHỈ chấp nhận /v1/....
  if (!path.startsWith('/v1/')) {
    return sendError(res, 'NOT_FOUND', 'Không tìm thấy route (thiếu tiền tố /v1/).');
  }

  try {
    // ── GET /v1/health — PUBLIC, không cần token ──────────────────────────
    if (path === '/v1/health' && req.method === 'GET') {
      const rl = await checkAndIncrement('ip:' + (req.ip || 'unknown'), 'healthPublic');
      if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'Vượt giới hạn gọi Health API.');
      const result = await healthRoutes.publicHealth();
      return sendSuccess(res, result, { status: result.healthy ? 200 : 503 });
    }

    // ── /v1/system/* — nội bộ, LUÔN bắt buộc Auth (giữ đúng hành vi Phase 1
    // đã Production Verification: thiếu token → 401, không đổi) ────────────
    if (path === '/v1/system/health' || path === '/v1/system/self-test') {
      const auth = await authenticate(req);
      if (!auth.ok) {
        await auditLog.logSimple({ action: 'apiGateway.auth_failed', requestId, status: 'failed', details: { path, error: auth.error } });
        return sendError(res, auth.code, auth.error);
      }
      const rl = await checkAndIncrement('uid:' + auth.uid, 'authenticated');
      if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'Vượt giới hạn request (' + rl.max + '/phút).');

      if (path === '/v1/system/health' && req.method === 'GET') {
        if (!hasPermission(auth.role, '*')) {
          await auditLog.logSimple({ uid: auth.uid, email: auth.email, action: 'system.health', requestId, status: 'permission_denied', details: { path } });
          return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được xem Health chi tiết.');
        }
        let openaiConfigured = false;
        try { openaiConfigured = !!OPENAI_API_KEY.value(); } catch (e) { openaiConfigured = false; }
        const result = await healthRoutes.systemHealth(openaiConfigured);
        return sendSuccess(res, result, { status: result.healthy ? 200 : 503 });
      }

      if (path === '/v1/system/self-test' && req.method === 'POST') {
        if (!hasPermission(auth.role, '*')) {
          await auditLog.logSimple({ uid: auth.uid, email: auth.email, action: 'system.self_test', requestId, status: 'permission_denied', details: {} });
          return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin được chạy self-test hạ tầng.');
        }

        const bodyCheck = validateSchema(req.body, { webhookUrl: { required: false, type: 'string' } });
        if (!bodyCheck.valid) return sendError(res, 'INVALID_REQUEST', bodyCheck.issues.join(' '));

        const intentKey = await auditLog.logIntent({ uid: auth.uid, email: auth.email, action: 'system.self_test', requestId, details: {} });

        const report = { asyncJob: null, retry: null, webhook: null };

        // 1) Async Job Framework: tạo job giả lập → cập nhật completed → đọc lại.
        const job = await createJob({ uid: auth.uid, type: 'self-test', payload: { requestId } });
        const finished = await updateJobStatus(job.id, 'completed', { note: 'self-test ok' });
        report.asyncJob = { created: !!job.id, finalStatus: finished.status, jobId: job.id };

        // 2) Retry Framework: cố tình fail 2 lần đầu, thành công lần 3 — xác
        // nhận withRetry() thật sự thử lại đúng số lần trước khi trả kết quả.
        let attemptCount = 0;
        const retryResult = await withRetry(async () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error('giả lập lỗi lần ' + attemptCount);
          return 'ok-after-' + attemptCount + '-attempts';
        }, { attempts: 3, backoffMs: () => 50 });
        report.retry = { attemptsUsed: attemptCount, result: retryResult };

        // 3) Webhook Framework: CHỈ gửi nếu Founder cung cấp webhookUrl thật
        // trong body — không tự bịa URL gọi ra ngoài.
        if (req.body && req.body.webhookUrl) {
          const webhookResult = await sendWebhook(req.body.webhookUrl, { test: true, requestId, from: 'apiGateway.self-test' });
          report.webhook = webhookResult;
        } else {
          report.webhook = { skipped: true, reason: 'Không cung cấp webhookUrl để test.' };
        }

        await auditLog.logResult(intentKey, { status: 'completed', resultDetails: report });
        return sendSuccess(res, report);
      }

      return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ.');
    }

    // ── GET /v1/auth/me — trả về danh tính đã xác thực (mục 17.1) ─────────
    if (path === '/v1/auth/me' && req.method === 'GET') {
      const auth = await authenticate(req);
      if (!auth.ok) return sendError(res, auth.code, auth.error);
      return sendSuccess(res, { uid: auth.uid, email: auth.email, role: auth.role });
    }

    // ── Phase 2 Core CMS APIs — Auth KHÔNG bắt buộc (nhiều route Public đọc
    // theo mục 17), mỗi router tự quyết định quyền theo request.auth ───────
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return sendError(res, 'METHOD_NOT_ALLOWED', 'Method không được hỗ trợ.');
    }
    const auth = await authenticate(req); // {ok:false,...} nếu thiếu/sai token — KHÔNG chặn ở đây
    helpers.auth = auth;

    const rlKey = auth.ok ? 'uid:' + auth.uid : 'ip:' + (req.ip || 'unknown');
    const rlName = auth.ok ? 'authenticated' : 'public';
    const rl = await checkAndIncrement(rlKey, rlName);
    if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'Vượt giới hạn request (' + rl.max + '/' + (rlName === 'public' ? 'phút/IP' : 'phút') + ').');

    // selfHealingRoutes PHẢI đứng TRƯỚC draftsRoutes — regex của nó
    // (/v1/{module}/status|validate|repair) rất hẹp (không khớp nếu {module}
    // không phải đúng 1 trong 5 tên cố định), nhưng draftsRoutes khớp BẤT KỲ
    // path nào bắt đầu "/v1/drafts/" (coi phần sau là Draft ID) — nếu để
    // draftsRoutes trước, nó sẽ "nuốt" mất /v1/drafts/status (hiểu nhầm
    // "status" là 1 Draft ID) trước khi tới lượt selfHealingRoutes, làm 3
    // route Self-Healing của module "drafts" không bao giờ chạm tới được.
    // Phát hiện qua Production Verification (Phase 6) sau khi deploy lần 1.
    const routers = [
      cmsListsRoutes, cmsSingletonRoutes, productsRoutes, productMediaRoutes, categoriesRoutes, inventoryRoutes, customersRoutes, ordersRoutes, paymentsRoutes, reportsRoutes, subscriptionsRoutes, registrationRoutes, notificationsRoutes, auditLogsRoutes, apiKeysRoutes, transactionsRoutes, teamRoutes, tenantCmsRoutes, tenantSettingsRoutes, mediaRoutes, usersRoutes,
      businessesRoutes,
      selfHealingRoutes,
      draftsRoutes, jobsLogsRoutes, facebookRoutes, socialMediaCenterRoutes, founderRoutes,
      agentRoutes, aiGenerateRoutes, webhooksRoutes, openclawRoutes
    ];
    for (const router of routers) {
      const result = await router.handle(req, res, helpers);
      if (result !== null) return result; // đã xử lý (đã res.json())
    }

    return sendError(res, 'NOT_FOUND', 'Không tìm thấy route.');
  } catch (err) {
    return sendError(res, 'UPSTREAM_ERROR', 'Lỗi hệ thống: ' + err.message);
  }
});

/*
 * aiGenerateWorker — Sprint 15 Phase 3 (Task 3.2). RTDB trigger
 * (`onValueCreated`) trên `apiAsyncJobs/{jobId}` — worker nền THẬT cho
 * đường `POST /v1/ai/{module}/generate?async=true` (routes/aiGenerate.js
 * `queueGeneration()`). CHỈ xử lý Job có `payload.async === true` — Job do
 * đường ĐỒNG BỘ tạo (`generateForModule()`, `payload.async === false`) đã
 * tự chạy `runGeneration()` NGAY trong request, function này BỎ QUA để
 * KHÔNG chạy generate 2 lần cho cùng 1 Job (double execution).
 *
 * Lỗi bên trong runGeneration() ĐÃ tự ghi 'failed' + emit
 * 'ai.generate.failed' (xem shared/aiGenerate.js) — function này CHỈ nuốt
 * lỗi ở ngoài cùng để KHÔNG khiến RTDB trigger tự retry vô hạn (hành vi mặc
 * định của Cloud Functions khi handler throw) — Job đã ở trạng thái
 * 'failed' đúng nghĩa, retry lại không có ý nghĩa (cùng input, cùng lỗi).
 *
 * LƯU Ý: function này CHƯA chạy thật cho tới khi được deploy (`firebase
 * deploy --only functions:aiGenerateWorker`) — không nằm trong phạm vi
 * phiên làm việc này ("No deploy" theo chỉ thị Founder).
 */
exports.aiGenerateWorker = onValueCreated({ ref: '/apiAsyncJobs/{jobId}', region: 'asia-southeast1', secrets: [OPENAI_API_KEY] }, async (event) => {
  const job = event.data.val();
  if (!job || job.status !== 'queued') return;
  if (!job.type || (job.type.indexOf('ai-generate:') !== 0 && job.type !== 'workflow:auto')) return;
  if (!job.payload || job.payload.async !== true) return;

  // WORKFLOW-02 Orchestration & Execution (directive 17:06): Workflow Engine
  // thành Orchestrator thật sự — job `workflow:auto` tự chạy chuỗi Plugin
  // (Product → AI Content → Blog → Facebook → Banner) với:
  //   - Workflow State bền (QUEUED/RUNNING/.../COMPLETED) lưu RTDB
  //   - Resume từ Step cuối sau worker/server restart (không chạy lại từ đầu)
  //   - Retry theo Step (không retry toàn Workflow) + Skip Step
  //   - Cancel/Pause qua cập nhật workflowState
  //   - Execution Log bền từng step (start/finish/duration/input/output/error)
  //   - Workflow Config đọc từ Firebase (workflowConfigs) — không hardcode
  // Reuse WorkflowEngine + aiGenerateWorker + queueGeneration + asyncJob.
  if (job.type === 'workflow:auto') {
    const wfName = (job.payload && job.payload.workflowName) || 'product-auto';
    try {
      const cfg = await getWorkflowConfig(wfName);
      const steps = (cfg && cfg.steps && cfg.steps.length)
        ? cfg.steps
        : (job.payload.steps && job.payload.steps.length ? job.payload.steps : []);
      if (!steps.length) {
        await updateWorkflowState(event.params.jobId, 'FAILED', { error: 'Workflow config empty' });
        return;
      }
      const productId = job.payload.productId || null;
      const baseParams = { productId: productId };

      // Resume: bắt đầu từ Step chưa hoàn thành (dựa executionLog/stepIndex)
      const cur = (await getJob(event.params.jobId));
      const logMap = (cur && cur.executionLog) || {};
      let startIndex = 0;
      for (let i = 0; i < steps.length; i++) {
        const e = logMap[i];
        if (e && (e.status === 'SUCCESS' || e.status === 'SKIPPED')) { startIndex = i + 1; /* tiếp tục sau step đã xong */ }
      }
      // Bỏ qua các step trước startIndex mà chưa có log (đánh SKIPPED) — không chạy lại

      await updateWorkflowState(event.params.jobId, 'RUNNING', { currentStep: startIndex, totalSteps: steps.length });
      for (let i = startIndex; i < steps.length; i++) {
        const step = steps[i];
        if (!step || !step.moduleId) continue;
        // Cancel/Pause check mỗi step (worker đọc state mới)
        const fresh = await getJob(event.params.jobId);
        if (fresh && fresh.workflowState === 'CANCELLED') {
          await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'SKIPPED', finishedAt: Date.now(), error: 'CANCELLED' });
          return;
        }
        if (fresh && fresh.workflowState === 'PAUSED') {
          await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'PENDING', finishedAt: Date.now(), note: 'PAUSED — sẽ resume từ step này' });
          return; // dừng, workflow sẽ resume từ step này khi unpause (instance giữ currentStep)
        }
        const stepJobId = event.params.jobId + ':step' + i;
        const t0 = Date.now();
        await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'RUNNING', startedAt: t0 });
        let stepErr = null;
        let attempts = 0;
        const maxRetry = (step.config && step.config.retryCount) || 0;
        // Retry theo STEP (không retry toàn workflow)
        while (attempts <= maxRetry) {
          try {
            if (attempts > 0) await updateWorkflowState(event.params.jobId, 'RETRYING', { stepIndex: i, retryCount: attempts });
            await runGeneration(stepJobId, step.moduleId, Object.assign({}, baseParams, step.inputParams || {}, (step.config && step.config._skipFallback) ? {} : {}), job.uid);
            stepErr = null;
            break;
          } catch (e) {
            stepErr = e;
            attempts++;
            if (attempts <= maxRetry) {
              const d = (step.config && step.config.retryDelayMs) || (attempts * 2000);
              await new Promise(r => setTimeout(r, d));
            }
          }
        }
        if (stepErr) {
          await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'FAILED', finishedAt: Date.now(), durationMs: Date.now() - t0, error: String(stepErr && stepErr.message || stepErr), retry: attempts });
          // Skip Step nếu not required — config.step.required === false → đánh SKIPPED, tiếp tục
          if (step.config && step.config.required === false) {
            await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'SKIPPED', finishedAt: Date.now(), error: 'step-failed-skipped' });
            continue;
          }
          await updateWorkflowState(event.params.jobId, 'FAILED', { stepIndex: i, stepModule: step.moduleId, stepStatus: 'FAILED', error: String(stepErr && stepErr.message || stepErr), retryCount: attempts });
          return; // dừng chuỗi tại step fail
        } else {
          await appendExecutionLog(event.params.jobId, { stepIndex: i, moduleId: step.moduleId, status: 'SUCCESS', finishedAt: Date.now(), durationMs: Date.now() - t0, retry: attempts });
        }
        await updateWorkflowState(event.params.jobId, 'RUNNING', { currentStep: i + 1 });
      }
      await updateWorkflowState(event.params.jobId, 'COMPLETED', { currentStep: steps.length, totalSteps: steps.length });
    } catch (err) {
      try { await updateWorkflowState(event.params.jobId, 'FAILED', { error: String(err && err.message || err) }); } catch (_) {/* noop */}
    }
    return;
  }

  try {
    await runGeneration(event.params.jobId, job.payload.moduleId, job.payload.inputParams, job.uid);
  } catch (err) {
    // runGeneration() đã tự ghi 'failed' + emit event bên trong — nuốt lỗi
    // ở đây để tránh RTDB trigger tự retry (xem chú thích đầu function).
  }
});







