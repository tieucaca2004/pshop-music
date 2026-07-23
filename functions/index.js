/*
 * openaiProxy â€” Cloud Function Proxy cho OpenAI (Sprint 3 Requirement #1,
 * kiáº¿n trÃºc do Chief Architect quyáº¿t Ä‘á»‹nh sau khi phÃ¡t hiá»‡n rá»§i ro lÆ°u API
 * Key phÃ­a client â€” xem ARCHITECTURE_REVIEW_SPRINT3.md).
 *
 * Kiáº¿n trÃºc: Browser (CMS) â†’ Cloud Function Proxy (file nÃ y) â†’ OpenAI API.
 *
 * Function nÃ y CHá»ˆ cÃ³ 3 nhiá»‡m vá»¥, khÃ´ng chá»©a Business Logic (Business Logic
 * váº«n náº±m trong PSH Platform â€” js/ai/modules/*.js, js/ai/job-queue.js...):
 *   1. Nháº­n request (action: "health" | "generate" | "generate_image").
 *   2. Validate request â€” xÃ¡c thá»±c Firebase Auth ID token cá»§a ngÆ°á»i gá»i +
 *      kiá»ƒm tra tÃ i khoáº£n Ä‘Ã³ cÃ³ entry trong node "roles" (Ä‘Ãºng cÃ¹ng cÆ¡ cháº¿
 *      phÃ¢n quyá»n CMS Ä‘Ã£ cÃ³, khÃ´ng táº¡o há»‡ thá»‘ng auth má»›i).
 *   3. Gá»i OpenAI báº±ng OPENAI_API_KEY (lÆ°u trong Secret Manager qua
 *      defineSecret â€” KHÃ”NG BAO GIá»œ gá»­i xuá»‘ng browser, khÃ´ng lÆ°u Firebase
 *      Realtime Database) vÃ  tráº£ káº¿t quáº£ nguyÃªn vÄƒn vá» cho Queue.
 *
 * "generate_image" (Sprint 12 Requirement #11 â€” Image AI) dÃ¹ng ÄÃšNG
 * OPENAI_API_KEY Ä‘Ã£ cÃ³, gá»i Images API (dall-e-3) thay vÃ¬ Chat Completions,
 * rá»“i tá»± táº£i áº£nh vá» lÆ°u vÄ©nh viá»…n vÃ o Firebase Storage (Admin SDK) trÆ°á»›c khi
 * tráº£ URL cho client â€” áº£nh OpenAI tráº£ vá» chá»‰ tá»“n táº¡i táº¡m thá»i, khÃ´ng lÆ°u láº¡i
 * ngay sáº½ vá»¡ link khi Founder xem láº¡i Draft sau.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const facebookGraphApi = require('./facebook-graph-api');
// validateImageUrlOrigin â€” SSRF fix (Sprint 15 Phase 1, Security Audit
// Finding 5). Built Sprint 14 Phase 1 (shared/validation.js) but never wired
// in until now. Used ONLY inside "remove_background" below, per Founder
// scope â€” does not touch editImageWithOpenAI() or "edit_image" (Product
// Banner), which stay exactly as they were.
const { validateImageUrlOrigin } = require('./shared/validation');
const { getApps } = require('firebase-admin/app');

admin.initializeApp();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Sprint 12 â€” Facebook Integration V1. App ID KHÃ”NG hardcode (khÃ¡c quyáº¿t
// Ä‘á»‹nh táº¡m thá»i á»Ÿ Facebook AI V5 trÆ°á»›c Ä‘Ã³) â€” Ä‘á»c tá»« node Firebase
// `facebookAppConfig/appId` (Founder tá»± "Enter App ID" qua UI tháº­t á»Ÿ
// admin/facebook-settings.html, KHÃ”NG cáº§n sá»­a code/redeploy). App Secret váº«n
// PHáº¢I qua Secret Manager (`defineSecret`) â€” khÃ´ng bao giá» hardcode, cÃ¹ng
// nguyÃªn táº¯c Ä‘Ã£ Ã¡p dá»¥ng cho OPENAI_API_KEY.
//
// Mock Mode: `mockMode = !appId` â€” bá» trá»‘ng App ID (tráº¡ng thÃ¡i HIá»†N Táº I,
// chÆ°a cÃ³ Facebook App tháº­t) tá»± Ä‘á»™ng báº­t Mock Mode cho Má»ŒI request má»›i,
// khÃ´ng cáº§n cÃ´ng táº¯c riÃªng nÃ o khÃ¡c. Xem functions/facebook-graph-api.js.
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
    return { ok: false, status: 401, error: 'Thiáº¿u Authorization Bearer token.' };
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    return { ok: false, status: 401, error: 'Token khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.' };
  }
  const roleSnap = await admin.database().ref('roles/' + decoded.uid).once('value');
  if (!roleSnap.exists()) {
    return { ok: false, status: 403, error: 'TÃ i khoáº£n chÆ°a Ä‘Æ°á»£c cáº¥p quyá»n CMS.' };
  }
  return { ok: true, uid: decoded.uid };
}

// editImageWithOpenAI â€” dÃ¹ng CHUNG cho "remove_background" (xÃ³a phÃ´ng, giá»¯
// nguyÃªn sáº£n pháº©m) vÃ  "edit_image" (banner ná»n+chá»¯ má»›i) â€” cáº£ 2 Ä‘á»u cáº§n CÃ™NG
// 1 viá»‡c: gá»­i áº¢NH THáº¬T lÃªn OpenAI Ä‘á»ƒ CHá»ˆNH Sá»¬A trá»±c tiáº¿p (model gpt-image-1,
// endpoint /v1/images/edits â€” KHÃC háº³n generate_image dÃ¹ng dall-e-3 chá»‰ váº½
// áº£nh Má»šI tá»« mÃ´ táº£ chá»¯, khÃ´ng nháº­n áº£nh Ä‘áº§u vÃ o Ä‘Æ°á»£c). Tráº£ vá» URL Storage vÄ©nh
// viá»…n (áº£nh OpenAI tráº£ táº¡m thá»i sáº½ háº¿t háº¡n náº¿u khÃ´ng táº£i vá» lÆ°u ngay).
async function editImageWithOpenAI({ inputUrl, prompt, size, transparentBackground, storagePrefix }) {
  // SSRF guard — validate URL before fetching
  const urlError = validateImageUrlOrigin(inputUrl);
  if (urlError) throw new Error('SSRF guard rejected image URL: ' + urlError);

  // Redirect chain validation — follow up to 5 hops, validate each one
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

  // DNS/IP validation — resolve hostname, block private IPs
  const finalUrl = fetchRes.url || currentUrl;
  try {
    const parsedUrl = new URL(finalUrl);
    const dnsError = await resolveAndValidateIps(parsedUrl.hostname);
    if (dnsError) throw new Error(dnsError);
  } catch (ipErr) {
    throw new Error('DNS validation failed for "' + finalUrl + '": ' + ipErr.message);
  }

  if (!fetchRes.ok) throw new Error('Không tải được ảnh từ URL cung cấp.');

  // Content-Type validation — accept only image/* or octet-stream
  const mimeType = fetchRes.headers.get('content-type') || '';
  const ctError = validateContentType(mimeType);
  if (ctError) throw new Error(ctError);

  const imgBuf = Buffer.from(await fetchRes.arrayBuffer());
  const SIZE_MAP = { '1:1': '1024x1024', '4:5': '1024x1536', '16:9': '1536x1024' };
  const openAiSize = SIZE_MAP[size] || 'auto';

  const form = new FormData();
  form.append('model', 'gpt-image-1');
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
  if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI Images Edit API lá»—i.');
  const item = data.data && data.data[0];
  if (!item || !item.b64_json) throw new Error('OpenAI khÃ´ng tráº£ vá» áº£nh.');

  const buffer = Buffer.from(item.b64_json, 'base64');
  const path = `${storagePrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const bucket = admin.storage().bucket();
  const token = require('crypto').randomUUID();
  await bucket.file(path).save(buffer, {
    metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } }
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

exports.openaiProxy = onRequest({ secrets: [OPENAI_API_KEY], cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chá»‰ há»— trá»£ POST.' });
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
        res.json({ healthy: true, message: 'Káº¿t ná»‘i OpenAI thÃ nh cÃ´ng.' });
        return;
      }
      const body = await r.json().catch(() => ({}));
      res.json({ healthy: false, message: (body.error && body.error.message) || `Lá»—i káº¿t ná»‘i OpenAI (HTTP ${r.status}).` });
    } catch (err) {
      res.json({ healthy: false, message: 'Lá»—i máº¡ng khi gá»i OpenAI: ' + err.message });
    }
    return;
  }

  if (action === 'generate') {
    if (!prompt) {
      res.status(400).json({ error: 'Thiáº¿u "prompt".' });
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
        res.status(r.status).json({ error: (data.error && data.error.message) || 'OpenAI API lá»—i.' });
        return;
      }
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      res.json({ text: (text || '').trim(), raw: data });
    } catch (err) {
      res.status(502).json({ error: 'Lá»—i khi gá»i OpenAI: ' + err.message });
    }
    return;
  }

  // generate_image â€” Sprint 12 Requirement #11 (Image AI). DÃ¹ng ÄÃšNG
  // OPENAI_API_KEY Ä‘Ã£ cÃ³ sáºµn (khÃ´ng cáº§n key/tÃ i khoáº£n má»›i) nhÆ°ng gá»i endpoint
  // Images API (dall-e-3) thay vÃ¬ Chat Completions. áº¢nh tráº£ vá» tá»« OpenAI chá»‰
  // lÃ  URL/base64 Táº M THá»œI (háº¿t háº¡n sau vÃ i giá») â€” pháº£i táº£i vá» vÃ  lÆ°u vÄ©nh
  // viá»…n vÃ o Firebase Storage NGAY trong Cloud Function (Admin SDK, cÃ³ quyá»n
  // ghi Storage khÃ´ng qua Storage Rules) trÆ°á»›c khi tráº£ vá» cho client, Ä‘á»ƒ Image
  // Draft xem láº¡i Ä‘Æ°á»£c sau nÃ y khÃ´ng bá»‹ vá»¡ áº£nh.
  if (action === 'generate_image') {
    if (!prompt) {
      res.status(400).json({ error: 'Thiáº¿u "prompt".' });
      return;
    }
    // dall-e-3 chá»‰ há»— trá»£ ÄÃšNG 3 kÃ­ch thÆ°á»›c cá»‘ Ä‘á»‹nh â€” khÃ´ng cÃ³ tá»‰ lá»‡ 4:5 tháº­t,
    // "4:5" dÃ¹ng táº¡m kÃ­ch thÆ°á»›c dá»c gáº§n nháº¥t (1024x1792). KhÃ´ng giáº£ vá» Ä‘Ã¢y lÃ 
    // crop chÃ­nh xÃ¡c 4:5 â€” UI phÃ­a client pháº£i ghi rÃµ Ä‘Ã¢y lÃ  xáº¥p xá»‰.
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
        res.status(r.status).json({ error: (data.error && data.error.message) || 'OpenAI Images API lá»—i.' });
        return;
      }
      const item = data.data && data.data[0];
      if (!item || !item.b64_json) {
        res.status(502).json({ error: 'OpenAI khÃ´ng tráº£ vá» áº£nh.' });
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
      // CÃ¹ng ÄÃšNG Ä‘á»‹nh dáº¡ng URL mÃ  Firebase Client SDK tá»± sinh ra khi Admin
      // Upload tá»« trÃ¬nh duyá»‡t (getDownloadURL()) - Ä‘á»ƒ hoáº¡t Ä‘á»™ng y há»‡t áº£nh
      // upload thá»§ cÃ´ng á»Ÿ má»i nÆ¡i khÃ¡c trong CMS (Storage Rules Ä‘Ã£ cho phÃ©p
      // "get" cÃ´ng khai cho má»i path, xem storage.rules â€” khÃ´ng cáº§n Ä‘á»•i Rules).
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
      res.json({ imageUrl, raw: { revisedPrompt: item.revised_prompt || '', size: openAiSize } });
    } catch (err) {
      res.status(502).json({ error: 'Lá»—i khi gá»i OpenAI Images API: ' + err.message });
    }
    return;
  }

  // remove_background â€” Req C (XÃ³a phÃ´ng). TRÆ¯á»šC ÄÃ‚Y: GPT-4o Vision mÃ´ táº£ sáº£n
  // pháº©m báº±ng chá»¯ rá»“i DALL-E 3 Váº¼ Láº I TOÃ€N Bá»˜ áº£nh má»›i theo mÃ´ táº£ Ä‘Ã³ â€” khÃ´ng
  // pháº£i áº£nh tháº­t, dá»… sai mÃ u/chi tiáº¿t/logo so vá»›i áº£nh gá»‘c (Founder phÃ¡t hiá»‡n
  // khi yÃªu cáº§u tÃ­nh nÄƒng banner ná»n+chá»¯ má»›i â€” cÃ¹ng gá»‘c rá»…). Giá» dÃ¹ng ÄÃšNG
  // model gpt-image-1 qua /v1/images/edits â€” NHáº¬N áº¢NH Gá»C THáº¬T lÃ m Ä‘áº§u vÃ o,
  // giá»¯ nguyÃªn sáº£n pháº©m, chá»‰ thay ná»n trong suá»‘t â€” khÃ´ng cÃ²n "váº½ láº¡i theo
  // trÃ­ nhá»›" ná»¯a. Giá»¯ NGUYÃŠN tÃªn action + shape response {imageUrl} cho client
  // cÅ© (js/admin-bg-remover.js) khÃ´ng cáº§n sá»­a gÃ¬.
  if (action === 'remove_background') {
    const { imageUrl: inputUrl } = req.body || {};
    if (!inputUrl) {
      res.status(400).json({ error: 'Thiáº¿u "imageUrl".' });
      return;
    }
    // SSRF fix (Sprint 15 Phase 1, Security Audit Finding 5) â€” inputUrl Ä‘i
    // tháº³ng vÃ o fetch() phÃ­a server (qua editImageWithOpenAI() bÃªn dÆ°á»›i);
    // trÆ°á»›c Ä‘Ã¢y KHÃ”NG kiá»ƒm tra nguá»“n, 1 caller Ä‘Ã£ xÃ¡c thá»±c cÃ³ thá»ƒ Ã©p Cloud
    // Function fetch báº¥t ká»³ URL nÃ o. Cháº·n á»Ÿ ÄÃšNG action nÃ y theo yÃªu cáº§u
    // Founder â€” khÃ´ng sá»­a editImageWithOpenAI() (dÃ¹ng chung vá»›i "edit_image",
    // giá»¯ nguyÃªn hÃ nh vi Product Banner).
    if (!validateImageUrlOrigin(inputUrl)) {
      res.status(400).json({ error: 'imageUrl khÃ´ng há»£p lá»‡ â€” chá»‰ cháº¥p nháº­n áº£nh tá»« Firebase Storage cá»§a dá»± Ã¡n.' });
      return;
    }
    try {
      const resultUrl = await editImageWithOpenAI({
        inputUrl,
        prompt: 'Remove the background completely, keep the main product exactly as it is (same colors, shape, logos, text, details) â€” do not redraw or alter the product itself in any way.',
        transparentBackground: true,
        storagePrefix: 'bg-removed'
      });
      res.json({ imageUrl: resultUrl });
    } catch (err) {
      res.status(502).json({ error: 'Lá»—i xÃ³a phÃ´ng: ' + err.message });
    }
    return;
  }

  // edit_image â€” Founder yÃªu cáº§u "Ä‘Æ°a áº£nh gá»‘c lÃªn AI xá»­ lÃ½ ná»n rá»“i bá» chá»¯ vÃ o
  // áº£nh" (banner sáº£n pháº©m kiá»ƒu AlphaTheta) â€” dÃ¹ng CHUNG hÃ m editImageWithOpenAI
  // á»Ÿ trÃªn vá»›i remove_background, chá»‰ khÃ¡c prompt (Ä‘á»•i ná»n theo phong cÃ¡ch +
  // in chá»¯ tÃªn sáº£n pháº©m vÃ o áº£nh) vÃ  KHÃ”NG xÃ³a ná»n trong suá»‘t (banner cáº§n ná»n
  // Ä‘áº§y Ä‘á»§). Tráº£ vá» 1 áº£nh DUY NHáº¤T (ná»n má»›i + chá»¯ Ä‘Ã£ cÃ³ sáºµn trong áº£nh) â€”
  // Ä‘Ãºng yÃªu cáº§u "1 áº£nh táº£i vá» lÃ  xong", khÃ´ng pháº£i ghÃ©p 2 lá»›p CSS nhÆ°
  // generate_image (Product Background Image) Ä‘Ã£ lÃ m trÆ°á»›c Ä‘Ã³.
  if (action === 'edit_image') {
    const { imageUrl: inputUrl, prompt: editPrompt, size } = req.body || {};
    if (!inputUrl) { res.status(400).json({ error: 'Thiáº¿u "imageUrl".' }); return; }
    if (!editPrompt) { res.status(400).json({ error: 'Thiáº¿u "prompt".' }); return; }
    try {
      const resultUrl = await editImageWithOpenAI({ inputUrl, prompt: editPrompt, size, storagePrefix: 'ai-generated' });
      res.json({ imageUrl: resultUrl });
    } catch (err) {
      res.status(502).json({ error: 'Lá»—i khi gá»i OpenAI Images Edit API: ' + err.message });
    }
    return;
  }

  res.status(400).json({ error: 'action khÃ´ng há»£p lá»‡ (chá»‰ há»— trá»£ "generate", "generate_image", "edit_image", "remove_background", hoáº·c "health").' });
});

/*
 * facebookOAuthCallback â€” Ä‘iá»ƒm Facebook redirect trÃ¬nh duyá»‡t Vá»€ sau khi
 * Founder Ä‘Äƒng nháº­p + cáº¥p quyá»n (KHÃ”NG pháº£i 1 lÆ°á»£t fetch() cÃ³ Authorization
 * header nhÆ° openaiProxy â€” Ä‘Ã¢y lÃ  1 GET navigation tháº­t cá»§a trÃ¬nh duyá»‡t, nÃªn
 * KHÃ”NG thá»ƒ xÃ¡c thá»±c báº±ng Firebase ID token á»Ÿ Ä‘Ã¢y). Thay vÃ o Ä‘Ã³, xÃ¡c Ä‘á»‹nh
 * "yÃªu cáº§u nÃ y cá»§a Founder nÃ o" qua tham sá»‘ `state` â€” 1 nonce dÃ¹ng 1 láº§n do
 * client tá»± táº¡o + ghi vÃ o `facebookOAuthState/{state}` TRÆ¯á»šC khi redirect
 * (xem js/admin-facebook-connect.js).
 *
 * Mock Mode (Sprint 12 â€” Facebook Integration V1): `mockMode = !appId` Ä‘Æ°á»£c
 * TÃNH 1 Láº¦N NGAY Táº I ÄÃ‚Y vÃ  LÆ¯U Láº I (`isMock`) xuyÃªn suá»‘t cáº£ token Page láº«n
 * User Token â€” khÃ´ng tÃ­nh láº¡i mockMode á»Ÿ facebookPublish/facebookRefreshToken
 * dá»±a trÃªn App ID hiá»‡n táº¡i, Ä‘á»ƒ 1 káº¿t ná»‘i mock khÃ´ng bá»‹ nháº§m gá»i Graph API
 * tháº­t chá»‰ vÃ¬ Founder vá»«a Ä‘iá»n App ID sau Ä‘Ã³ (pháº£i "Káº¿t ná»‘i láº¡i" tháº­t má»›i
 * chuyá»ƒn háº³n sang cháº¿ Ä‘á»™ tháº­t).
 *
 * Luá»“ng: code -> Short-Lived User Token -> Long-Lived User Token (~60 ngÃ y,
 * LÆ¯U Láº I vÃ o `facebookUserToken` server-only Ä‘á»ƒ facebookRefreshToken dÃ¹ng
 * sau nÃ y) -> danh sÃ¡ch Fanpage + Page Access Token riÃªng tá»«ng Page. Token
 * THáº¬T chá»‰ lÆ°u vÃ o node server-only `facebookPageTokens/{uid}` (Database
 * Rules .read:false/.write:false tuyá»‡t Ä‘á»‘i, chá»‰ Admin SDK Ä‘á»c/ghi Ä‘Æ°á»£c) â€”
 * client chá»‰ nháº­n metadata Page (id/name/áº£nh Ä‘áº¡i diá»‡n) qua
 * `facebookPendingPages` Ä‘á»ƒ hiá»ƒn thá»‹ danh sÃ¡ch chá»n, KHÃ”NG BAO GIá»œ tháº¥y
 * token tháº­t.
 */
exports.facebookOAuthCallback = onRequest({ secrets: [FACEBOOK_APP_SECRET] }, async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query || {};

  if (error) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent(errorDescription || String(error))}`);
    return;
  }
  if (!code || !state) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent('Thiáº¿u code/state tá»« Facebook.')}`);
    return;
  }

  try {
    const stateRef = admin.database().ref('facebookOAuthState/' + state);
    const stateSnap = await stateRef.once('value');
    const stateData = stateSnap.val();
    if (!stateData || !stateData.uid) {
      throw new Error('PhiÃªn káº¿t ná»‘i khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n â€” vui lÃ²ng thá»­ Káº¿t ná»‘i láº¡i.');
    }
    await stateRef.remove(); // dÃ¹ng 1 láº§n, xoÃ¡ ngay sau khi xÃ¡c nháº­n
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
    // Facebook khÃ´ng pháº£i lÃºc nÃ o cÅ©ng tráº£ "expires_in" cho Long-Lived Token â€”
    // máº·c Ä‘á»‹nh Æ°á»›c tÃ­nh 60 ngÃ y (giÃ¡ trá»‹ Meta cÃ´ng bá»‘) náº¿u thiáº¿u, Ä‘á»ƒ tokenExpiresAt
    // khÃ´ng bao giá» lÃ  "khÃ´ng xÃ¡c Ä‘á»‹nh".
    const expiresInSec = longLivedData.expires_in || 60 * 24 * 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;

    const accountsData = await facebookGraphApi.getManagedPages({ mockMode, userToken });
    const pages = accountsData.data || [];
    if (!pages.length) {
      throw new Error('TÃ i khoáº£n Facebook nÃ y chÆ°a quáº£n lÃ½ Fanpage nÃ o.');
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
    // facebookUserToken â€” node TOÃ€N Cá»¤C (khÃ´ng theo uid, chá»‰ 1 káº¿t ná»‘i Facebook
    // cho toÃ n platform táº¡i 1 thá»i Ä‘iá»ƒm, giá»‘ng facebookActiveToken) â€” giá»¯ láº¡i
    // (KHÃ”NG xoÃ¡ á»Ÿ facebookSelectPage) Ä‘á»ƒ facebookRefreshToken dÃ¹ng lÃ m má»›i
    // Page Token sau nÃ y mÃ  khÃ´ng cáº§n Founder Ä‘Äƒng nháº­p láº¡i tá»« Ä‘áº§u.
    await admin.database().ref('facebookUserToken').set({
      accessToken: userToken, obtainedAt: Date.now(), expiresAt, isMock: mockMode, obtainedBy: uid
    });

    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=success`);
  } catch (err) {
    res.redirect(302, `${FACEBOOK_RETURN_URL}?oauth=error&reason=${encodeURIComponent(err.message)}`);
  }
});

/*
 * facebookSelectPage â€” Founder chá»n 1 Fanpage lÃ m Default Page (sau khi
 * facebookOAuthCallback Ä‘Ã£ láº¥y vá» danh sÃ¡ch Fanpage). Gá»i qua fetch() cÃ³
 * Authorization header tháº­t (giá»‘ng openaiProxy) nÃªn validateRequest() dÃ¹ng
 * láº¡i Ä‘Æ°á»£c nguyÃªn váº¹n. Copy token cá»§a ÄÃšNG Page Ä‘Æ°á»£c chá»n tá»«
 * `facebookPageTokens/{uid}` (server-only) sang `facebookActiveToken`
 * (server-only, node DUY NHáº¤T facebookPublish Ä‘á»c Ä‘á»ƒ Ä‘Äƒng bÃ i tháº­t) + ghi
 * `facebookConnection` (chá»‰ metadata, khÃ´ng token â€” client Ä‘á»c Ä‘á»ƒ hiá»ƒn thá»‹
 * card tráº¡ng thÃ¡i).
 */
exports.facebookSelectPage = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chá»‰ há»— trá»£ POST.' });
    return;
  }
  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { pageId } = req.body || {};
  if (!pageId) {
    res.status(400).json({ error: 'Thiáº¿u "pageId".' });
    return;
  }

  try {
    const uid = check.uid;
    const tokenSnap = await admin.database().ref('facebookPageTokens/' + uid + '/' + pageId).once('value');
    const tokenData = tokenSnap.val();
    if (!tokenData) {
      res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y Fanpage Ä‘Ã£ chá»n â€” vui lÃ²ng báº¥m Káº¿t ná»‘i láº¡i.' });
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

    // Dá»n state táº¡m â€” token cá»§a cÃ¡c Page KHÃ”NG Ä‘Æ°á»£c chá»n khÃ´ng cáº§n giá»¯ láº¡i.
    await admin.database().ref('facebookPendingPages/' + uid).remove();
    await admin.database().ref('facebookPageTokens/' + uid).remove();

    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: 'Lá»—i khi lÆ°u Fanpage Ä‘Ã£ chá»n: ' + err.message });
  }
});

/*
 * facebookPublish â€” Ä‘Äƒng THáº¬T lÃªn Fanpage Ä‘Ã£ káº¿t ná»‘i. CHá»ˆ nháº­n ná»™i dung Ä‘Ã£
 * láº¯p sáºµn tá»« client (message/imageUrls) â€” khÃ´ng chá»©a Business Logic biáº¿t vá»
 * aiDrafts/Product/Blog (Ä‘Ãºng nguyÃªn táº¯c Cloud Function chá»‰ proxy, Business
 * Logic láº¯p rÃ¡p caption/hashtag/link/YouTube váº«n náº±m á»Ÿ js/admin-ai.js, xem
 * PROJECT_ARCHITECTURE.md). Äá»c token tháº­t DUY NHáº¤T tá»« `facebookActiveToken`
 * (server-only, Admin SDK) â€” khÃ´ng bao giá» nháº­n token tá»« client.
 */
exports.facebookPublish = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chá»‰ há»— trá»£ POST.' });
    return;
  }
  const check = await validateRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { message, imageUrls } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'Thiáº¿u ná»™i dung bÃ i Ä‘Äƒng ("message").' });
    return;
  }

  try {
    const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
    const active = activeSnap.val();
    if (!active || !active.accessToken) {
      res.status(400).json({ success: false, error: 'ChÆ°a káº¿t ná»‘i Facebook â€” vÃ o CÃ i Ä‘áº·t > Facebook Configuration Ä‘á»ƒ káº¿t ná»‘i trÆ°á»›c.' });
      return;
    }
    if (active.expiresAt && Date.now() > active.expiresAt) {
      res.status(400).json({ success: false, error: 'Token Facebook Ä‘Ã£ háº¿t háº¡n â€” vÃ o CÃ i Ä‘áº·t > Facebook Configuration Ä‘á»ƒ káº¿t ná»‘i láº¡i.' });
      return;
    }

    const pageId = active.pageId;
    const accessToken = active.accessToken;
    // mockMode Láº¤Y Tá»ª chÃ­nh káº¿t ná»‘i Ä‘Ã£ lÆ°u (`active.isMock`), KHÃ”NG tÃ­nh láº¡i
    // tá»« App ID hiá»‡n táº¡i â€” 1 káº¿t ná»‘i Ä‘Æ°á»£c thiáº¿t láº­p á»Ÿ Mock Mode pháº£i TIáº¾P Tá»¤C
    // gá»i Graph API giáº£ láº­p cho tá»›i khi Founder "Káº¿t ná»‘i láº¡i" tháº­t, trÃ¡nh vÃ´
    // tÃ¬nh gá»i Facebook tháº­t báº±ng token giáº£ náº¿u App ID Ä‘Æ°á»£c Ä‘iá»n sau Ä‘Ã³.
    const mockMode = !!active.isMock;
    const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];

    // Nhiá»u áº£nh trong 1 bÃ i Ä‘Äƒng â€” Ä‘Ãºng pattern Graph API cÃ´ng khai: upload
    // tá»«ng áº£nh vá»›i published:false (chÆ°a hiá»ƒn thá»‹ riÃªng láº») Ä‘á»ƒ láº¥y media_fbid,
    // rá»“i láº¯p táº¥t cáº£ vÃ o 1 bÃ i Ä‘Äƒng /feed duy nháº¥t qua "attached_media".
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
 * facebookRefreshToken â€” Sprint 12, Facebook Integration V1 (Token Refresh).
 * Meta cho phÃ©p Ä‘á»•i 1 Long-Lived User Token CÃ’N Háº N láº¥y 1 Long-Lived User
 * Token Má»šI (gia háº¡n thÃªm ~60 ngÃ y) mÃ  KHÃ”NG cáº§n Founder Ä‘Äƒng nháº­p láº¡i â€”
 * Ä‘Ã¢y lÃ  cÆ¡ cháº¿ "lÃ m má»›i" DUY NHáº¤T Facebook há»— trá»£ cho loáº¡i token nÃ y (khÃ´ng
 * cÃ³ refresh token riÃªng nhÆ° OAuth chuáº©n). Náº¿u Token Ä‘Ã£ háº¿t háº¡n HOÃ€N TOÃ€N,
 * Meta sáº½ tá»« chá»‘i Ä‘á»•i â€” lÃºc Ä‘Ã³ khÃ´ng cÃ³ cÃ¡ch nÃ o khÃ¡c ngoÃ i "Káº¿t ná»‘i láº¡i"
 * (Ä‘Äƒng nháº­p Facebook láº¡i tá»« Ä‘áº§u), Ä‘Ã¢y lÃ  giá»›i háº¡n tháº­t cá»§a Facebook, khÃ´ng
 * pháº£i thiáº¿u sÃ³t cá»§a code.
 */
exports.facebookRefreshToken = onRequest({ secrets: [FACEBOOK_APP_SECRET], cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chá»‰ há»— trá»£ POST.' });
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
      res.status(400).json({ success: false, error: 'ChÆ°a tá»«ng káº¿t ná»‘i Facebook â€” vÃ o CÃ i Ä‘áº·t > Facebook Configuration Ä‘á»ƒ káº¿t ná»‘i trÆ°á»›c.' });
      return;
    }
    if (userTokenRecord.expiresAt && Date.now() > userTokenRecord.expiresAt) {
      res.status(400).json({ success: false, error: 'Token Ä‘Ã£ háº¿t háº¡n hoÃ n toÃ n â€” khÃ´ng thá»ƒ tá»± lÃ m má»›i, vui lÃ²ng báº¥m "Káº¿t ná»‘i láº¡i" Ä‘á»ƒ Ä‘Äƒng nháº­p Facebook tá»« Ä‘áº§u.' });
      return;
    }

    const activeSnap = await admin.database().ref('facebookActiveToken').once('value');
    const active = activeSnap.val();
    if (!active || !active.pageId) {
      res.status(400).json({ success: false, error: 'ChÆ°a chá»n Fanpage nÃ o â€” vÃ o CÃ i Ä‘áº·t > Facebook Configuration Ä‘á»ƒ káº¿t ná»‘i trÆ°á»›c.' });
      return;
    }

    // Giá»¯ NGUYÃŠN mockMode cá»§a káº¿t ná»‘i gá»‘c â€” cÃ¹ng lÃ½ do Ä‘Ã£ Ã¡p dá»¥ng á»Ÿ
    // facebookPublish (khÃ´ng tÃ­nh láº¡i theo App ID hiá»‡n táº¡i).
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
      throw new Error('KhÃ´ng cÃ²n tháº¥y Fanpage Ä‘Ã£ káº¿t ná»‘i trong danh sÃ¡ch quáº£n lÃ½ â€” vui lÃ²ng "Káº¿t ná»‘i láº¡i".');
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
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * apiGateway â€” Sprint 14. Phase 1 (Ä‘Ã£ PASS, deploy trÆ°á»›c) = háº¡ táº§ng thuáº§n:
 * API Gateway/Auth/Permission/Validation/Rate Limit/Audit Log/Response-Error
 * chuáº©n/Versioning/Health/Retry/Async Job/Webhook Framework â€” route tháº­t
 * DUY NHáº¤T lÃ  /v1/health (public) + /v1/system/* (admin ná»™i bá»™).
 *
 * Phase 2 (khá»‘i nÃ y thÃªm vÃ o) = Core CMS APIs theo SPRINT14_API_ARCHITECTURE
 * _FINAL.md má»¥c 20 (Founder Ä‘á»•i sá»‘ Phase so vá»›i báº£n gá»‘c â€” má»¥c 20 gá»i Ä‘Ã¢y lÃ 
 * "Phase 1 â€” Core CMS APIs", Founder xÃ¡c nháº­n gá»i lÃ  "Phase 2"): Products,
 * Categories, Brands (má»›i), Tags (má»›i), Blog, Banner, Slider, Video, Menu,
 * Footer, SEO, Media/Storage, Settings, Users/Roles â€” má»¥c 17.2-17.13, 17.22.
 * Routing tháº­t náº±m á»Ÿ functions/routes/cmsLists.js (7 module dáº¡ng danh
 * sÃ¡ch) + cmsSingletons.js (5 module dáº¡ng object cáº¥u hÃ¬nh) + media.js +
 * users.js â€” file nÃ y chá»‰ Ä‘iá»u phá»‘i pipeline chung (Rate Limit â†’ Auth
 * KHÃ”NG Báº®T BUá»˜C cho GET cÃ´ng khai â†’ dispatch) rá»“i giao cho tá»«ng router tá»±
 * quyáº¿t Ä‘á»‹nh quyá»n theo Ä‘Ãºng báº£ng Permission má»¥c 17.
 *
 * Phase 3 (khá»‘i nÃ y thÃªm vÃ o) = Founder APIs theo má»¥c 20 (báº£n gá»‘c "Phase 2",
 * Founder xÃ¡c nháº­n gá»i lÃ  "Phase 3"): Draft/Publish Pipeline (17.14, kÃ¨m
 * chuyá»ƒn publishToTarget() vÃ o Backend), Queue/Jobs (17.15), Facebook
 * Integration (17.21, wrap 3 Cloud Function Facebook cÃ³ sáºµn qua proxy, giá»¯
 * nguyÃªn oauth/callback dáº¡ng redirect), Social Media Center (17.20, publish/
 * schedule â€” schedule CHá»ˆ lÆ°u Ã½ Ä‘á»‹nh, CHÆ¯A cÃ³ Cloud Scheduler tháº­t kÃ­ch hoáº¡t
 * â€” xem routes/socialMediaCenter.js), Logs/History/Workflows (17.23),
 * Founder Home + One Click Marketing (17.19 orchestration, tráº£ 503 rÃµ rÃ ng
 * vÃ¬ phá»¥ thuá»™c AI Generate APIs chÆ°a xÃ¢y â€” xem routes/founder.js). Routing á»Ÿ
 * routes/drafts.js, routes/jobsLogs.js, routes/facebook.js,
 * routes/socialMediaCenter.js, routes/founder.js â€” publishToTarget() port á»Ÿ
 * shared/publishToTarget.js.
 *
 * Phase 4 (khá»‘i nÃ y thÃªm vÃ o) = Agent APIs theo má»¥c 20 (báº£n gá»‘c "Phase 3",
 * Founder xÃ¡c nháº­n gá»i lÃ  "Phase 4"): Founder Agent Plan/Execute (5 nhÃ³m
 * hÃ nh vi, má»¥c 18.1), Undo/Resume/Discard, Conversation Session (má»¥c 18.3,
 * pendingClarification chuyá»ƒn háº³n vÃ o Backend, TTL má»m 30 phÃºt). 2 node RTDB
 * Má»šI: `agentPlans/`, `agentConversations/` â€” Plan/Step trÆ°á»›c Ä‘Ã¢y chá»‰ sá»‘ng
 * trong biáº¿n JS phÃ­a client, giá» cÃ³ nÆ¡i lÆ°u bá»n cho API stateless. NhÃ³m
 * "Äiá»u hÆ°á»›ng" (open-product/update-product-field/open-draft/navigate) Ä‘Æ°á»£c
 * THIáº¾T Káº¾ Láº I tráº£ `deepLinkUrl` thay vÃ¬ tá»± Ä‘iá»u hÆ°á»›ng trÃ¬nh duyá»‡t. NhÃ³m
 * "Generic Plugin" (8 module AI + marker "seo") tráº£ `status:'failed'` rÃµ
 * rÃ ng á»Ÿ Phase 4 â€” Phase 5 (khá»‘i dÆ°á»›i Ä‘Ã¢y) ná»‘i dÃ¢y tháº­t. Routing á»Ÿ
 * routes/agent.js â€” Planner/Executor port á»Ÿ shared/agentPlanner.js,
 * shared/agentExecute.js, shared/agentTools.js.
 *
 * Phase 5 (khá»‘i nÃ y thÃªm vÃ o) = Media AI APIs theo má»¥c 20 (báº£n gá»‘c "Phase
 * 4", Founder xÃ¡c nháº­n gá»i lÃ  "Phase 5"): port 9 module AI content-
 * generation (`js/ai/modules/*.js`) sang `shared/aiModules.js` (prompt/parse/
 * mapToDraftContent NGUYÃŠN VÄ‚N) + `shared/aiGenerate.js` (gá»i OpenAI TRá»°C
 * TIáº¾P báº±ng láº¡i `OPENAI_API_KEY` Secret Ä‘Ã£ cÃ³ â€” khÃ´ng vÃ²ng qua `openaiProxy`
 * â€” rá»“i ghi `aiDrafts`, CÃ™NG shape `AIJobQueue.processItem()` Ä‘Ã£ lÃ m phÃ­a
 * client). 9 route tháº­t `POST /v1/ai/{blog|product-description|seo|
 * facebook-post|banner|image|image-prompt|slider|faq}/generate`
 * (routes/aiGenerate.js) + 3 route khung Video/Voice/Subtitle (tráº£ 503 rÃµ
 * rÃ ng, "chÆ°a impl tháº­t, chá»‰ chuáº©n bá»‹ shape" Ä‘Ãºng má»¥c 20). Äá»“ng bá»™ trong 1
 * request (CHÆ¯A cÃ³ worker ná»n tháº­t â€” xem ghi chÃº trong aiGenerate.js).
 * Ná»‘i dÃ¢y 2 chá»— Ä‘Ã£ stub á»Ÿ Phase 3/4: `/v1/ai/one-click-marketing`
 * (routes/founder.js, gá»i láº¡i 4 route generate â€” Blog/Facebook/Banner/
 * ImagePrompt) vÃ  nhÃ³m "Generic Plugin" cá»§a Founder Agent
 * (shared/agentExecute.js, gá»i `generateForModule()` â€” 1 nguá»“n logic sinh
 * ná»™i dung duy nháº¥t cho cáº£ 3 lá»‘i vÃ o).
 *
 * Phase 6 (khá»‘i nÃ y thÃªm vÃ o) = Self-Healing API (má»¥c 20 báº£n gá»‘c "Phase 5")
 * + OpenClaw Integration (má»¥c 20 báº£n gá»‘c "Phase 6") â€” Founder giao chung 1
 * lÆ°á»£t, gá»i lÃ  "Phase 6". Founder XÃC NHáº¬N Láº I nguyÃªn táº¯c "No Self-Auto-Fix"
 * (má»¥c 13) trÆ°á»›c khi giao: Repair CHá»ˆ cháº¡y khi cÃ³ request rÃµ rÃ ng gá»i tá»›i,
 * KHÃ”NG cÃ³ job ná»n/schedule nÃ o tá»± sá»­a â€” xem shared/selfHealing.js.
 * - **Self-Healing** (`routes/selfHealing.js` + `shared/selfHealing.js`):
 *   `GET /v1/{module}/status`, `POST /v1/{module}/validate`, `POST
 *   /v1/{module}/repair` cho queue/drafts/media/rules/ai-provider (Facebook
 *   cÃ³ route riÃªng trong routes/facebook.js â€” Ä‘Ã£ sá»Ÿ há»¯u domain Ä‘Ã³ tá»« Phase
 *   3). Repair CHá»ˆ tá»± thá»±c thi hÃ nh Ä‘á»™ng Háº  Táº¦NG THUáº¦N (nháº£ lock Job quÃ¡
 *   TTL, xoÃ¡ OAuth state nonce háº¿t háº¡n, refresh Facebook Token qua Ä‘Ãºng API
 *   Ä‘Ã£ cÃ³) â€” Ä‘á»¥ng Dá»® LIá»†U NGHIá»†P Vá»¤ THáº¬T (Draft/Rules/API Key) LUÃ”N tráº£
 *   `requiresApproval:true`, khÃ´ng tá»± sá»­a. `POST /v1/queue/retry` lÃ  alias
 *   gá»i láº¡i `retryFailed()` Ä‘Ã£ cÃ³ (routes/jobsLogs.js), khÃ´ng viáº¿t logic
 *   retry thá»© 2, Ä‘Ãºng "Reconcile vá»›i Jobs Retry" má»¥c 13. ThÃªm `GET
 *   /v1/system/diagnostics` (tá»•ng há»£p toÃ n bá»™ module) + `GET
 *   /v1/system/jobs/monitor` ("Job Monitor" â€” Ä‘áº¿m theo status, phÃ¡t hiá»‡n
 *   Job "running" káº¹t quÃ¡ 10 phÃºt).
 * - **Event Bus + Webhook Events** (`shared/eventBus.js` + `routes/
 *   webhooks.js`) â€” KHÃ”NG táº¡o message broker má»›i, tÃ¡i dÃ¹ng
 *   `shared/webhook.js` (Phase 1, `sendWebhook()` cÃ³ sáºµn nhÆ°ng chÆ°a tá»«ng
 *   Ä‘Æ°á»£c gá»i) â€” `emit()` Ä‘Æ°á»£c gá»i Tá»ª sá»± kiá»‡n THáº¬T Ä‘Ã£ xáº£y ra
 *   (`draft.published` á»Ÿ routes/drafts.js, `ai.generate.completed`/`.failed`
 *   á»Ÿ shared/aiGenerate.js), ghi `apiEvents` (log ngáº¯n háº¡n, giá»¯ 200 gáº§n
 *   nháº¥t) + gá»­i HTTP callback tá»›i URL Ä‘Ã£ Ä‘Äƒng kÃ½ qua `POST /v1/webhooks`.
 *   `GET /v1/events` cho phÃ©p poll láº¡i (dá»± phÃ²ng khi khÃ´ng cÃ³ URL public
 *   nháº­n webhook). AI Generate (Phase 5) VáºªN Ä‘á»“ng bá»™ trong 1 request â€” CHÆ¯A
 *   cÃ³ worker ná»n tháº­t xá»­ lÃ½ báº¥t Ä‘á»“ng bá»™ tháº­t sá»± (jobId tráº£ vá» ngay rá»“i xá»­
 *   lÃ½ sau) nhÆ° tÃ i liá»‡u FINAL má»¥c 14 mÃ´ táº£ â€” ngoÃ i pháº¡m vi mission Phase 6
 *   Ä‘Æ°á»£c giao (khÃ´ng cÃ³ trong danh sÃ¡ch "Implement ONLY"), ghi nháº­n ROADMAP.
 * - **OpenClaw Integration** (`routes/openclaw.js`) â€” ÄÃšNG nguyÃªn táº¯c má»¥c
 *   19: OpenClaw KHÃ”NG cÃ³ quyá»n Ä‘áº·c biá»‡t, dÃ¹ng CHUNG Auth/Permission/Rate-
 *   Limit nhÆ° má»i client â€” vÃ¬ váº­y KHÃ”NG cÃ³ 1 "OpenClaw API" tÃ¡ch biá»‡t nÃ o,
 *   chá»‰ cÃ³ `GET /v1/openclaw/capabilities` (discovery â€” tráº£ vá» nhÃ³m API
 *   nÃ o ngÆ°á»i gá»i ÄANG cÃ³ quyá»n dÃ¹ng tháº­t, dá»±a theo role tháº­t) Ä‘á»ƒ tá»± biáº¿t
 *   Ä‘Æ°á»£c lÃ m gÃ¬ thay vÃ¬ Ä‘oÃ¡n/thá»­-sai qua 403. Má»i thao tÃ¡c nghiá»‡p vá»¥ tháº­t
 *   Ä‘i tháº³ng qua API Phase 1-5 Ä‘Ã£ cÃ³. `structural.write.*` (create-product/
 *   detect-category qua Founder Agent) váº«n KHÃ”NG má»Ÿ máº·c Ä‘á»‹nh â€” role `agent`
 *   váº«n Rá»–NG, chÆ°a cÃ³ Decision Record riÃªng nÃ o kÃ­ch hoáº¡t.
 *
 * openaiProxy + 4 Facebook Function á»Ÿ TRÃŠN giá»¯ NGUYÃŠN Váº¸N, KHÃ”NG Ä‘á»•i.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
const { authenticate, isPublicPath } = require('./shared/auth');
const { hasPermission } = require('./shared/permissions');
const { validateSchema } = require('./shared/validation');
const { checkAndIncrement } = require('./shared/rateLimit');
const { ALLOWED_ORIGINS } = require('./shared/corsConfig');
const auditLog = require('./shared/auditLog');
const { sendWebhook, WEBHOOK_SIGNING_SECRET } = require('./shared/webhook');
const { createJob, getJob, updateJobStatus } = require('./shared/asyncJob');
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

// cors: ALLOWED_ORIGINS (Sprint 15 Phase 1, Task 1.2) â€” trÆ°á»›c Ä‘Ã¢y cors:true
// (báº¥t ká»³ origin nÃ o). KhÃ´ng áº£nh hÆ°á»Ÿng gá»i khÃ´ng cÃ³ Origin header (curl,
// server gá»i server) â€” CORS chá»‰ do trÃ¬nh duyá»‡t thá»±c thi.

// Initialize Firebase Admin if not already done
if (!getApps().length) { admin.initializeApp(); }

exports.apiGateway = onRequest({ secrets: [OPENAI_API_KEY, WEBHOOK_SIGNING_SECRET], cors: ALLOWED_ORIGINS, timeoutSeconds: 120 }, async (req, res) => {
  const requestId = makeRequestId();
  res.locals = { requestId };
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  req.__pshPath = path;
  const helpers = { sendSuccess, sendError };

  // Versioning (má»¥c 15) â€” CHá»ˆ cháº¥p nháº­n /v1/....
  if (!path.startsWith('/v1/')) {
    return sendError(res, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y route (thiáº¿u tiá»n tá»‘ /v1/).');
  }

  try {
    // â”€â”€ GET /v1/health â€” PUBLIC, khÃ´ng cáº§n token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (path === '/v1/health' && req.method === 'GET') {
      const rl = await checkAndIncrement('ip:' + (req.ip || 'unknown'), 'healthPublic');
      if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'VÆ°á»£t giá»›i háº¡n gá»i Health API.');
      const result = await healthRoutes.publicHealth();
      return sendSuccess(res, result, { status: result.healthy ? 200 : 503 });
    }

    // â”€â”€ /v1/system/* â€” ná»™i bá»™, LUÃ”N báº¯t buá»™c Auth (giá»¯ Ä‘Ãºng hÃ nh vi Phase 1
    // Ä‘Ã£ Production Verification: thiáº¿u token â†’ 401, khÃ´ng Ä‘á»•i) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (path === '/v1/system/health' || path === '/v1/system/self-test') {
      const auth = await authenticate(req);
      if (!auth.ok) {
        await auditLog.logSimple({ action: 'apiGateway.auth_failed', requestId, status: 'failed', details: { path, error: auth.error } });
        return sendError(res, auth.code, auth.error);
      }
      const rl = await checkAndIncrement('uid:' + auth.uid, 'authenticated');
      if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'VÆ°á»£t giá»›i háº¡n request (' + rl.max + '/phÃºt).');

      if (path === '/v1/system/health' && req.method === 'GET') {
        if (!hasPermission(auth.role, '*')) {
          await auditLog.logSimple({ uid: auth.uid, email: auth.email, action: 'system.health', requestId, status: 'permission_denied', details: { path } });
          return sendError(res, 'PERMISSION_DENIED', 'Chá»‰ Admin Ä‘Æ°á»£c xem Health chi tiáº¿t.');
        }
        let openaiConfigured = false;
        try { openaiConfigured = !!OPENAI_API_KEY.value(); } catch (e) { openaiConfigured = false; }
        const result = await healthRoutes.systemHealth(openaiConfigured);
        return sendSuccess(res, result, { status: result.healthy ? 200 : 503 });
      }

      if (path === '/v1/system/self-test' && req.method === 'POST') {
        if (!hasPermission(auth.role, '*')) {
          await auditLog.logSimple({ uid: auth.uid, email: auth.email, action: 'system.self_test', requestId, status: 'permission_denied', details: {} });
          return sendError(res, 'PERMISSION_DENIED', 'Chá»‰ Admin Ä‘Æ°á»£c cháº¡y self-test háº¡ táº§ng.');
        }

        const bodyCheck = validateSchema(req.body, { webhookUrl: { required: false, type: 'string' } });
        if (!bodyCheck.valid) return sendError(res, 'INVALID_REQUEST', bodyCheck.issues.join(' '));

        const intentKey = await auditLog.logIntent({ uid: auth.uid, email: auth.email, action: 'system.self_test', requestId, details: {} });

        const report = { asyncJob: null, retry: null, webhook: null };

        // 1) Async Job Framework: táº¡o job giáº£ láº­p â†’ cáº­p nháº­t completed â†’ Ä‘á»c láº¡i.
        const job = await createJob({ uid: auth.uid, type: 'self-test', payload: { requestId } });
        const finished = await updateJobStatus(job.id, 'completed', { note: 'self-test ok' });
        report.asyncJob = { created: !!job.id, finalStatus: finished.status, jobId: job.id };

        // 2) Retry Framework: cá»‘ tÃ¬nh fail 2 láº§n Ä‘áº§u, thÃ nh cÃ´ng láº§n 3 â€” xÃ¡c
        // nháº­n withRetry() tháº­t sá»± thá»­ láº¡i Ä‘Ãºng sá»‘ láº§n trÆ°á»›c khi tráº£ káº¿t quáº£.
        let attemptCount = 0;
        const retryResult = await withRetry(async () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error('giáº£ láº­p lá»—i láº§n ' + attemptCount);
          return 'ok-after-' + attemptCount + '-attempts';
        }, { attempts: 3, backoffMs: () => 50 });
        report.retry = { attemptsUsed: attemptCount, result: retryResult };

        // 3) Webhook Framework: CHá»ˆ gá»­i náº¿u Founder cung cáº¥p webhookUrl tháº­t
        // trong body â€” khÃ´ng tá»± bá»‹a URL gá»i ra ngoÃ i.
        if (req.body && req.body.webhookUrl) {
          const webhookResult = await sendWebhook(req.body.webhookUrl, { test: true, requestId, from: 'apiGateway.self-test' });
          report.webhook = webhookResult;
        } else {
          report.webhook = { skipped: true, reason: 'KhÃ´ng cung cáº¥p webhookUrl Ä‘á»ƒ test.' };
        }

        await auditLog.logResult(intentKey, { status: 'completed', resultDetails: report });
        return sendSuccess(res, report);
      }

      return sendError(res, 'METHOD_NOT_ALLOWED', 'Method khÃ´ng Ä‘Æ°á»£c há»— trá»£.');
    }

    // â”€â”€ GET /v1/auth/me â€” tráº£ vá» danh tÃ­nh Ä‘Ã£ xÃ¡c thá»±c (má»¥c 17.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (path === '/v1/auth/me' && req.method === 'GET') {
      const auth = await authenticate(req);
      if (!auth.ok) return sendError(res, auth.code, auth.error);
      return sendSuccess(res, { uid: auth.uid, email: auth.email, role: auth.role });
    }

    // â”€â”€ Phase 2 Core CMS APIs â€” Auth KHÃ”NG báº¯t buá»™c (nhiá»u route Public Ä‘á»c
    // theo má»¥c 17), má»—i router tá»± quyáº¿t Ä‘á»‹nh quyá»n theo request.auth â”€â”€â”€â”€â”€â”€â”€
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return sendError(res, 'METHOD_NOT_ALLOWED', 'Method khÃ´ng Ä‘Æ°á»£c há»— trá»£.');
    }
    const auth = await authenticate(req); // {ok:false,...} náº¿u thiáº¿u/sai token â€” KHÃ”NG cháº·n á»Ÿ Ä‘Ã¢y
    helpers.auth = auth;

    const rlKey = auth.ok ? 'uid:' + auth.uid : 'ip:' + (req.ip || 'unknown');
    const rlName = auth.ok ? 'authenticated' : 'public';
    const rl = await checkAndIncrement(rlKey, rlName);
    if (!rl.allowed) return sendError(res, 'RATE_LIMITED', 'VÆ°á»£t giá»›i háº¡n request (' + rl.max + '/' + (rlName === 'public' ? 'phÃºt/IP' : 'phÃºt') + ').');

    // selfHealingRoutes PHáº¢I Ä‘á»©ng TRÆ¯á»šC draftsRoutes â€” regex cá»§a nÃ³
    // (/v1/{module}/status|validate|repair) ráº¥t háº¹p (khÃ´ng khá»›p náº¿u {module}
    // khÃ´ng pháº£i Ä‘Ãºng 1 trong 5 tÃªn cá»‘ Ä‘á»‹nh), nhÆ°ng draftsRoutes khá»›p Báº¤T Ká»²
    // path nÃ o báº¯t Ä‘áº§u "/v1/drafts/" (coi pháº§n sau lÃ  Draft ID) â€” náº¿u Ä‘á»ƒ
    // draftsRoutes trÆ°á»›c, nÃ³ sáº½ "nuá»‘t" máº¥t /v1/drafts/status (hiá»ƒu nháº§m
    // "status" lÃ  1 Draft ID) trÆ°á»›c khi tá»›i lÆ°á»£t selfHealingRoutes, lÃ m 3
    // route Self-Healing cá»§a module "drafts" khÃ´ng bao giá» cháº¡m tá»›i Ä‘Æ°á»£c.
    // PhÃ¡t hiá»‡n qua Production Verification (Phase 6) sau khi deploy láº§n 1.
    const routers = [
      cmsListsRoutes, cmsSingletonRoutes, productsRoutes, productMediaRoutes, categoriesRoutes, inventoryRoutes, customersRoutes, ordersRoutes, paymentsRoutes, reportsRoutes, subscriptionsRoutes, registrationRoutes, notificationsRoutes, auditLogsRoutes, apiKeysRoutes, mediaRoutes, usersRoutes,
      businessesRoutes,
      selfHealingRoutes,
      draftsRoutes, jobsLogsRoutes, facebookRoutes, socialMediaCenterRoutes, founderRoutes,
      agentRoutes, aiGenerateRoutes, webhooksRoutes, openclawRoutes
    ];
    for (const router of routers) {
      const result = await router.handle(req, res, helpers);
      if (result !== null) return result; // Ä‘Ã£ xá»­ lÃ½ (Ä‘Ã£ res.json())
    }

    return sendError(res, 'NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y route.');
  } catch (err) {
    return sendError(res, 'UPSTREAM_ERROR', 'Lá»—i há»‡ thá»‘ng: ' + err.message);
  }
});

/*
 * aiGenerateWorker â€” Sprint 15 Phase 3 (Task 3.2). RTDB trigger
 * (`onValueCreated`) trÃªn `apiAsyncJobs/{jobId}` â€” worker ná»n THáº¬T cho
 * Ä‘Æ°á»ng `POST /v1/ai/{module}/generate?async=true` (routes/aiGenerate.js
 * `queueGeneration()`). CHá»ˆ xá»­ lÃ½ Job cÃ³ `payload.async === true` â€” Job do
 * Ä‘Æ°á»ng Äá»’NG Bá»˜ táº¡o (`generateForModule()`, `payload.async === false`) Ä‘Ã£
 * tá»± cháº¡y `runGeneration()` NGAY trong request, function nÃ y Bá»Ž QUA Ä‘á»ƒ
 * KHÃ”NG cháº¡y generate 2 láº§n cho cÃ¹ng 1 Job (double execution).
 *
 * Lá»—i bÃªn trong runGeneration() ÄÃƒ tá»± ghi 'failed' + emit
 * 'ai.generate.failed' (xem shared/aiGenerate.js) â€” function nÃ y CHá»ˆ nuá»‘t
 * lá»—i á»Ÿ ngoÃ i cÃ¹ng Ä‘á»ƒ KHÃ”NG khiáº¿n RTDB trigger tá»± retry vÃ´ háº¡n (hÃ nh vi máº·c
 * Ä‘á»‹nh cá»§a Cloud Functions khi handler throw) â€” Job Ä‘Ã£ á»Ÿ tráº¡ng thÃ¡i
 * 'failed' Ä‘Ãºng nghÄ©a, retry láº¡i khÃ´ng cÃ³ Ã½ nghÄ©a (cÃ¹ng input, cÃ¹ng lá»—i).
 *
 * LÆ¯U Ã: function nÃ y CHÆ¯A cháº¡y tháº­t cho tá»›i khi Ä‘Æ°á»£c deploy (`firebase
 * deploy --only functions:aiGenerateWorker`) â€” khÃ´ng náº±m trong pháº¡m vi
 * phiÃªn lÃ m viá»‡c nÃ y ("No deploy" theo chá»‰ thá»‹ Founder).
 */
exports.aiGenerateWorker = onValueCreated({ ref: '/apiAsyncJobs/{jobId}', region: 'asia-southeast1', secrets: [OPENAI_API_KEY] }, async (event) => {
  const job = event.data.val();
  if (!job || job.status !== 'queued') return;
  if (!job.type || job.type.indexOf('ai-generate:') !== 0) return;
  if (!job.payload || job.payload.async !== true) return;
  try {
    await runGeneration(event.params.jobId, job.payload.moduleId, job.payload.inputParams, job.uid);
  } catch (err) {
    // runGeneration() Ä‘Ã£ tá»± ghi 'failed' + emit event bÃªn trong â€” nuá»‘t lá»—i
    // á»Ÿ Ä‘Ã¢y Ä‘á»ƒ trÃ¡nh RTDB trigger tá»± retry (xem chÃº thÃ­ch Ä‘áº§u function).
  }
});





