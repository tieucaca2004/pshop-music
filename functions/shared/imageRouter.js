/*
 * shared/imageRouter.js — IMAGE ROUTER: chọn và gọi provider xử lý ảnh quảng cáo cho bài đăng Facebook.
 *
 * Nguyên tắc cứng:
 *   1. GIỮ NGUYÊN PIXEL SẢN PHẨM GỐC: chỉ tạo nền mới rồi GHÉP sản phẩm gốc lên nền (PYTHON COMPOSITOR,
 *      tools/compositor/). KHÔNG dùng image generation để vẽ lại sản phẩm. Ảnh sản phẩm chỉ đi tới provider
 *      "compositor" do chủ dự án cấu hình tường minh.
 *   2. Chỉ dùng provider đã được cấu hình VÀ cho phép: imageRouterConfig/providers/<tên>.enabled === true và
 *      .approvedForProductPhotos === true (RTDB, server-only). Mặc định KHÔNG provider nào bật → bước ảnh bị
 *      bỏ qua và người duyệt được báo rõ (không im lặng, không giả vờ đã xử lý).
 *   3. Không tự mua credit / bật dịch vụ tính phí: nền do AI sinh (aiBackground) mặc định TẮT, chỉ chạy khi
 *      chủ dự án bật; prompt chỉ mô tả nền, KHÔNG gửi ảnh sản phẩm cho nó.
 *   4. Mọi lỗi (timeout, provider tắt, 5xx, thiếu segmentation) → trả trạng thái rõ ràng; luồng đăng vẫn tiếp
 *      tục an toàn bằng ảnh GỐC nhưng người duyệt thấy cảnh báo.
 *
 * Kết quả: { status: 'ok'|'skipped'|'blocked'|'failed', provider, note, url?, storagePath?, report? }
 */
'use strict';
const admin = require('firebase-admin');
const media = require('./telegramMedia');
const secrets = require('./telegramSecrets');

const DEFAULT_TIMEOUT_MS = 45000;

async function loadConfig() {
  const snap = await admin.database().ref('imageRouterConfig').once('value');
  return snap.val();
}

// normalizeConfig — RTDB là JSON tự do: một lần ghi sai có thể biến node thành chuỗi ("null", "[]"…).
// Phân biệt RÕ "chưa bật" với "cấu hình sai kiểu" để preview không báo sai nguyên nhân.
// Chấp nhận cả chuỗi JSON chứa object (tương thích dữ liệu cũ), nhưng object là dạng đúng.
function configShapeError(cfg) {
  if (cfg.providers != null && (typeof cfg.providers !== 'object' || Array.isArray(cfg.providers))) return 'imageRouterConfig.providers phải là object.';
  const comp = cfg.providers && cfg.providers.compositor;
  if (comp != null && (typeof comp !== 'object' || Array.isArray(comp))) return 'imageRouterConfig.providers.compositor phải là object.';
  return null;
}
function normalizeConfig(raw) {
  if (raw == null) return { cfg: {}, invalid: null };
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return { cfg: {}, invalid: 'imageRouterConfig là chuỗi rỗng — cần object { providers: { compositor: {...} } }.' };
    try {
      const parsed = JSON.parse(s);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { cfg: {}, invalid: 'imageRouterConfig là chuỗi JSON nhưng không phải object (' + (parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed) + ') — cần object.' };
      }
      const shape = configShapeError(parsed);
      return shape ? { cfg: {}, invalid: shape } : { cfg: parsed, invalid: null };
    } catch (e) {
      return { cfg: {}, invalid: 'imageRouterConfig là chuỗi không phải JSON — cần object { providers: { compositor: {...} } }.' };
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { cfg: {}, invalid: 'imageRouterConfig sai kiểu (' + (Array.isArray(raw) ? 'array' : typeof raw) + ') — cần object { providers: { compositor: {...} } }.' };
  }
  const shape = configShapeError(raw);
  return shape ? { cfg: {}, invalid: shape } : { cfg: raw, invalid: null };
}

function isHttpsUrl(u) {
  try { const p = new URL(u); return p.protocol === 'https:' && !!p.hostname; } catch (e) { return false; }
}

// Nền do AI sinh (tuỳ chọn, mặc định tắt). generateForModule được truyền vào để dễ test và tránh phụ thuộc vòng.
async function maybeBackground(cfg, deps, draft) {
  const bg = cfg.providers && cfg.providers.aiBackground;
  if (!bg || bg.enabled !== true || bg.approvedForBackgrounds !== true) return { buffer: null, note: null };
  try {
    const prompt = (bg.prompt || 'Nền studio tối giản, ánh sáng mềm, bề mặt trống phía dưới để đặt sản phẩm, không có chữ, không logo, không vật thể')
      .toString().slice(0, 400);
    const ai = await deps.generateForModule('image-generator', { imageType: 'Background', style: bg.style || 'Minimal', size: '1024x1024', customPrompt: prompt }, deps.uid, deps.email);
    const content = (ai && (ai.content || ai)) || {};
    const url = content.imageUrl;
    if (!isHttpsUrl(url)) return { buffer: null, note: 'Provider nền không trả URL ảnh hợp lệ — dùng nền tự tạo của compositor.' };
    const r = await deps.fetch(url);
    if (!r.ok) return { buffer: null, note: 'Không tải được nền AI (HTTP ' + r.status + ') — dùng nền tự tạo.' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (!media.sniffImage(buf) || buf.length > media.MAX_BYTES) return { buffer: null, note: 'Nền AI không hợp lệ — dùng nền tự tạo.' };
    return { buffer: buf, note: null };
  } catch (e) {
    return { buffer: null, note: 'Nền AI lỗi (' + media.redact(e && e.message).slice(0, 120) + ') — dùng nền tự tạo.' };
  }
}

async function routeImage(draft, originalBuffer, deps) {
  const d = Object.assign({ fetch: global.fetch, generateForModule: async () => { throw new Error('generateForModule chưa được cấp'); }, uid: null, email: null }, deps || {});
  let cfg;
  try {
    const loaded = normalizeConfig(await loadConfig());
    if (loaded.invalid) return { status: 'blocked', provider: null, note: loaded.invalid + ' Dùng ảnh gốc.' };
    cfg = loaded.cfg;
  } catch (e) { return { status: 'failed', provider: null, note: 'Không đọc được imageRouterConfig.' }; }
  const providers = cfg.providers && typeof cfg.providers === 'object' && !Array.isArray(cfg.providers) ? cfg.providers : {};
  const comp = secrets.withCompositorSecret(providers.compositor); // secret từ COMPOSITOR_SECRET, không từ RTDB
  if (!comp || comp.enabled !== true) {
    return { status: 'skipped', provider: null, note: 'Chưa bật provider ghép nền (imageRouterConfig.providers.compositor). Dùng ảnh gốc.' };
  }
  if (comp.approvedForProductPhotos !== true) {
    return { status: 'blocked', provider: 'compositor', note: 'Provider ghép nền chưa được duyệt nhận ảnh sản phẩm (approvedForProductPhotos). Dùng ảnh gốc.' };
  }
  if (!isHttpsUrl(comp.url) || !comp.secret || typeof comp.secret !== 'string') {
    return { status: 'blocked', provider: 'compositor', note: 'Compositor thiếu url HTTPS (RTDB) hoặc COMPOSITOR_SECRET (Functions secret). Dùng ảnh gốc.' };
  }
  if (!Buffer.isBuffer(originalBuffer) || !media.sniffImage(originalBuffer)) {
    return { status: 'failed', provider: 'compositor', note: 'Ảnh gốc không đọc được từ kho lưu trữ.' };
  }

  const bg = await maybeBackground(cfg, d, draft);
  // canvas chỉ gửi khi chủ dự án cấu hình (kích thước TỐI THIỂU); mặc định compositor tự chọn khung theo cỡ sản phẩm.
  const canvas = comp.canvas && Number(comp.canvas.width) > 0 && Number(comp.canvas.height) > 0
    ? { width: Math.min(2048, Number(comp.canvas.width)), height: Math.min(2048, Number(comp.canvas.height)) }
    : null;
  const payload = {
    request_id: draft && draft.id ? String(draft.id) : null,
    image_b64: originalBuffer.toString('base64'),
    background_b64: bg.buffer ? bg.buffer.toString('base64') : null,
    canvas,
    style: typeof comp.style === 'string' ? comp.style.slice(0, 40) : 'studio'
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(comp.timeoutMs) > 0 ? Number(comp.timeoutMs) : DEFAULT_TIMEOUT_MS);
  let resp; let body;
  try {
    resp = await d.fetch(comp.url.replace(/\/+$/, '') + '/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Compositor-Secret': comp.secret },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
  } catch (e) {
    const timedOut = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return { status: 'failed', provider: 'compositor', note: timedOut ? 'Compositor quá thời gian chờ. Dùng ảnh gốc.' : 'Compositor không khả dụng. Dùng ảnh gốc.' };
  } finally { clearTimeout(timer); }
  try { body = await resp.json(); } catch (e) { return { status: 'failed', provider: 'compositor', note: 'Compositor trả dữ liệu không phải JSON. Dùng ảnh gốc.' }; }

  if (!resp.ok || !body || body.ok !== true) {
    const code = body && body.code;
    if (code === 'NO_SEGMENTATION') {
      return { status: 'blocked', provider: 'compositor', note: 'Compositor chưa có mô hình tách nền (segmentation). Dùng ảnh gốc.' };
    }
    return { status: 'failed', provider: 'compositor', note: 'Compositor lỗi' + (code ? ' (' + String(code).slice(0, 40) + ')' : '') + '. Dùng ảnh gốc.' };
  }

  // Kiểm tra kết quả: phải là ảnh hợp lệ, cỡ hợp lý, và compositor PHẢI cam kết pixel sản phẩm được giữ nguyên.
  let out;
  try { out = Buffer.from(String(body.image_b64 || ''), 'base64'); } catch (e) { out = null; }
  const kind = out && out.length ? media.sniffImage(out) : null;
  if (!kind || out.length > media.MAX_BYTES) return { status: 'failed', provider: 'compositor', note: 'Compositor trả ảnh không hợp lệ. Dùng ảnh gốc.' };
  const report = body.report && typeof body.report === 'object' ? body.report : {};
  const corePixels = Number(report.core_pixels);
  const coreMismatch = Number(report.core_pixels_mismatched);
  if (report.product_pixels_preserved !== true || (Number.isFinite(corePixels) && corePixels <= 0) || (Number.isFinite(coreMismatch) && coreMismatch > 0)) {
    const why = Number.isFinite(coreMismatch) && coreMismatch > 0
      ? 'báo lệch ' + coreMismatch + ' pixel lõi'
      : (Number.isFinite(corePixels) && corePixels <= 0 ? 'không có pixel lõi để đối chiếu' : 'không xác nhận giữ nguyên pixel');
    return { status: 'failed', provider: 'compositor', note: 'Compositor ' + why + ' — KHÔNG dùng ảnh kết quả. Dùng ảnh gốc.' };
  }
  try {
    const saved = await media.saveToStorage('fbDrafts/' + draft.id + '/final.' + kind.ext, out, kind.mime);
    return { status: 'ok', provider: 'compositor', note: bg.note || null, url: saved.url, storagePath: saved.path, report: { product_pixels_preserved: true, width: report.width || null, height: report.height || null, background: report.background || null, canvas: Array.isArray(report.canvas) ? report.canvas.slice(0, 2) : null, product_size: Array.isArray(report.product_size) ? report.product_size.slice(0, 2) : null, core_pixels: report.core_pixels || null, core_pixels_mismatched: report.core_pixels_mismatched == null ? null : report.core_pixels_mismatched } };
  } catch (e) {
    return { status: 'failed', provider: 'compositor', note: 'Không lưu được ảnh kết quả. Dùng ảnh gốc.' };
  }
}

module.exports = { routeImage };
