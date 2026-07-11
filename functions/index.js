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
