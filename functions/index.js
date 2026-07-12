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

admin.initializeApp();

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

exports.openaiProxy = onRequest({ secrets: [OPENAI_API_KEY], cors: true }, async (req, res) => {
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
          model: 'dall-e-3',
          prompt,
          size: openAiSize,
          n: 1,
          response_format: 'b64_json'
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

  res.status(400).json({ error: 'action không hợp lệ (chỉ hỗ trợ "generate", "generate_image", hoặc "health").' });
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
