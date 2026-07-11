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

admin.initializeApp();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Sprint 12 Requirement — Facebook AI V5 (Facebook Configuration & Auto
// Publish). App ID KHÔNG nhạy cảm (an toàn để hardcode, giống cách mọi trang
// OAuth khác hoạt động) — CHƯA có giá trị thật vì Facebook App chưa được tạo
// (chỉ Chief Architect tự tạo được tại developers.facebook.com, xem
// docs/FACEBOOK_INTEGRATION_SETUP.md). App Secret PHẢI qua Secret Manager,
// không bao giờ hardcode — cùng nguyên tắc đã áp dụng cho OPENAI_API_KEY.
const FACEBOOK_APP_ID = ''; // TODO: điền App ID thật sau khi tạo Facebook App
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');
const FACEBOOK_GRAPH_VERSION = 'v19.0';
const FACEBOOK_OAUTH_CALLBACK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback';
const FACEBOOK_RETURN_URL = 'https://pshopmusic.com/admin/facebook-settings.html';

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
 * sang Facebook (xem js/admin-facebook-connect.js).
 *
 * Luồng: code -> Short-Lived User Token -> Long-Lived User Token (~60 ngày)
 * -> danh sách Fanpage + Page Access Token riêng từng Page. Token THẬT chỉ
 * lưu vào node server-only `facebookPageTokens/{uid}` (Database Rules
 * .read:false/.write:false tuyệt đối, chỉ Admin SDK đọc/ghi được) — client
 * chỉ nhận metadata Page (id/name/ảnh đại diện) qua `facebookPendingPages`
 * để hiển thị danh sách chọn, KHÔNG BAO GIỜ thấy token thật.
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

    const tokenUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token` +
      `?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_OAUTH_CALLBACK_URL)}` +
      `&client_secret=${FACEBOOK_APP_SECRET.value()}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error((tokenData.error && tokenData.error.message) || 'Không đổi được "code" lấy Access Token.');
    }

    const longLivedUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET.value()}` +
      `&fb_exchange_token=${tokenData.access_token}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();
    if (!longLivedRes.ok || !longLivedData.access_token) {
      throw new Error((longLivedData.error && longLivedData.error.message) || 'Không đổi được Long-Lived Access Token.');
    }
    const userToken = longLivedData.access_token;
    // Facebook không phải lúc nào cũng trả "expires_in" cho Long-Lived Token —
    // mặc định ước tính 60 ngày (giá trị Meta công bố) nếu thiếu, để tokenExpiresAt
    // không bao giờ là "không xác định".
    const expiresInSec = longLivedData.expires_in || 60 * 24 * 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;

    const accountsUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts` +
      `?fields=id,name,access_token,picture&access_token=${userToken}`;
    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();
    if (!accountsRes.ok) {
      throw new Error((accountsData.error && accountsData.error.message) || 'Không lấy được danh sách Fanpage.');
    }
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
      tokenUpdates[p.id] = { accessToken: p.access_token, name: p.name, obtainedAt: Date.now(), expiresAt };
    });

    await admin.database().ref('facebookPendingPages/' + uid).set({ pages: pendingPages, fetchedAt: Date.now() });
    await admin.database().ref('facebookPageTokens/' + uid).set(tokenUpdates);

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
      expiresAt: tokenData.expiresAt
    });

    await admin.database().ref('facebookConnection').set({
      status: 'connected',
      pageId,
      pageName: pageMeta.name || tokenData.name || '',
      pageProfileImage: pageMeta.picture || '',
      connectedAt: Date.now(),
      tokenExpiresAt: tokenData.expiresAt,
      connectedBy: userRecord.email || uid
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
    const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

    // Nhiều ảnh trong 1 bài đăng — đúng pattern Graph API công khai: upload
    // từng ảnh với published:false (chưa hiển thị riêng lẻ) để lấy media_fbid,
    // rồi lắp tất cả vào 1 bài đăng /feed duy nhất qua "attached_media".
    const attachedMedia = [];
    for (const url of images) {
      const photoRes = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, published: false, access_token: accessToken })
      });
      const photoData = await photoRes.json();
      if (!photoRes.ok || !photoData.id) {
        throw new Error((photoData.error && photoData.error.message) || 'Không tải được ảnh lên Facebook.');
      }
      attachedMedia.push({ media_fbid: photoData.id });
    }

    const feedBody = { message, access_token: accessToken };
    if (attachedMedia.length) feedBody.attached_media = attachedMedia;

    const feedRes = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedBody)
    });
    const feedData = await feedRes.json();
    if (!feedRes.ok || !feedData.id) {
      throw new Error((feedData.error && feedData.error.message) || 'Facebook API từ chối đăng bài.');
    }

    res.json({ success: true, facebookPostId: feedData.id });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});
