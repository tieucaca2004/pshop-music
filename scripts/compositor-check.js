#!/usr/bin/env node
/*
 * scripts/compositor-check.js — KIỂM CHỨNG MỘT MÁY CHỦ COMPOSITOR ĐÃ HOST (local/HTTPS) TRƯỚC KHI BẬT imageRouterConfig.
 *
 * Chạy:
 *   $env:COMPOSITOR_SECRET = "<secret >= 24 ký tự>"   # KHÔNG dán vào chat/log
 *   node scripts/compositor-check.js --url http://127.0.0.1:8765 --out tools/compositor/out
 *   node scripts/compositor-check.js --url https://<host> --no-mask   # kiểm tra cả rembg (tách nền thật)
 *
 * Việc script làm:
 *   1. GET  /health  → xác nhận server sống.
 *   2. POST /compose với ảnh sản phẩm TỔNG HỢP + mask (hoặc không mask nếu --no-mask) →
 *      xác nhận 200, ảnh PNG hợp lệ, report.product_pixels_preserved === true,
 *      core_pixels > 0 và core_pixels_mismatched === 0.
 *   3. Lưu before.png / after.png vào --out để người vận hành XEM BẰNG MẮT vùng sản phẩm.
 *
 * KHÔNG in secret, KHÔNG ghi secret ra file, KHÔNG gọi dịch vụ ngoài URL đã chỉ định.
 * Không dùng thư viện ngoài (chỉ zlib của Node) — chạy được trên máy chỉ có Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 640, H = 480;

function usage() {
  console.log([
    'Usage: node scripts/compositor-check.js --url <http(s)://host> [options]',
    '',
    '  --url <url>          URL gốc của compositor (router sẽ gọi <url>/compose)',
    '  --secret <secret>    TUỲ CHỌN — mặc định đọc env COMPOSITOR_SECRET (không nên truyền qua CLI)',
    '  --no-mask            Không gửi mask → kiểm tra rembg/tách nền thật trên host',
    '  --style <name>       studio | warm | dark (mặc định studio)',
    '  --out <dir>          Thư mục lưu before.png/after.png (mặc định tools/compositor/out)',
    '  --timeout-ms <n>     Timeout mỗi request (mặc định 60000)',
    '  --skip-health        Bỏ qua GET /health (chỉ dùng khi server cũ không có /health)',
    '  --help               In hướng dẫn này',
    '',
    'Exit: 0 OK · 2 tham số · 3 health · 4 compose lỗi · 5 report không đạt'
  ].join('\n'));
}

function parseArgs(argv) {
  const out = { url: '', secret: process.env.COMPOSITOR_SECRET || '', noMask: false, style: 'studio', out: path.join(__dirname, '..', 'tools', 'compositor', 'out'), timeoutMs: 60000, skipHealth: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    if (a === '--no-mask') { out.noMask = true; continue; }
    if (a === '--skip-health') { out.skipHealth = true; continue; }
    const need = () => { const v = argv[++i]; if (v === undefined || v === '') { console.error('Thiếu giá trị cho ' + a); process.exit(2); } return v; };
    if (a === '--url') out.url = need();
    else if (a === '--secret') out.secret = need();
    else if (a === '--style') out.style = need();
    else if (a === '--out') out.out = need();
    else if (a === '--timeout-ms') out.timeoutMs = Number(need());
    else { console.error('Tham số không hợp lệ: ' + a); usage(); process.exit(2); }
  }
  if (!out.url) { console.error('Thiếu --url'); usage(); process.exit(2); }
  if (!/^https?:\/\//i.test(out.url)) { console.error('--url phải bắt đầu bằng http:// (local) hoặc https://'); process.exit(2); }
  if (!out.secret || out.secret.length < 24) { console.error('Thiếu COMPOSITOR_SECRET (>= 24 ký tự). Đặt env, KHÔNG truyền qua chat/log.'); process.exit(2); }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000 || out.timeoutMs > 300000) { console.error('--timeout-ms không hợp lệ (1000..300000)'); process.exit(2); }
  if (['studio', 'warm', 'dark'].indexOf(out.style) < 0) { console.error('--style chỉ nhận studio|warm|dark'); process.exit(2); }
  out.url = out.url.replace(/\/+$/, '');
  return out;
}

// ── PNG encoder tối giản (RGB, 8-bit, không interlace) ──────────────────────
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function fillRect(rgb, w, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    const o = (y * w + x) * 3; rgb[o] = color[0]; rgb[o + 1] = color[1]; rgb[o + 2] = color[2];
  }
}

// Ảnh sản phẩm tổng hợp: nền nhiễu sáng + thiết bị tối có nút màu/chữ giả. Đủ chi tiết để lộ resize/đổi màu.
function makeProduct() {
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 160 + ((x * 7 + y * 11) % 31); const o = (y * W + x) * 3; rgb[o] = v; rgb[o + 1] = v + 3; rgb[o + 2] = v + 6;
  }
  fillRect(rgb, W, 100, 70, 540, 410, [20, 20, 24]);
  fillRect(rgb, W, 120, 90, 520, 210, [40, 90, 200]);
  for (let i = 0; i < 6; i++) fillRect(rgb, W, 130 + i * 60, 250, 175 + i * 60, 300, [220, 40 + i * 30, 40]);
  fillRect(rgb, W, 150, 330, 490, 360, [240, 240, 240]);
  return encodePng(W, H, rgb);
}
function makeMask() {
  const rgb = Buffer.alloc(W * H * 3, 0);
  fillRect(rgb, W, 100, 70, 540, 410, [255, 255, 255]);
  return encodePng(W, H, rgb);
}
function isPng(buf) { return Buffer.isBuffer(buf) && buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); }

async function fetchTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); } finally { clearTimeout(t); }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const secret = args.secret;

  if (!args.skipHealth) {
    let r, body;
    try { r = await fetchTimeout(args.url + '/health', { method: 'GET' }, Math.min(args.timeoutMs, 15000)); }
    catch (e) { console.error('HEALTH_FAIL: không kết nối được ' + args.url + '/health (' + String(e.message).slice(0, 120) + ')'); process.exit(3); }
    try { body = await r.json(); } catch (e) { body = null; }
    if (!r.ok || !body || body.ok !== true) { console.error('HEALTH_FAIL: HTTP ' + r.status + ' body=' + JSON.stringify(body).slice(0, 160)); process.exit(3); }
    console.log('health: OK (' + args.url + ')');
  }

  const image = makeProduct();
  const mask = args.noMask ? null : makeMask();
  const payload = {
    request_id: 'self-check-' + Date.now(),
    image_b64: image.toString('base64'),
    background_b64: null,
    canvas: { width: 1000, height: 1000 },
    style: args.style
  };
  if (mask) payload.mask_b64 = mask.toString('base64');

  let r, data;
  try {
    r = await fetchTimeout(args.url + '/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Compositor-Secret': secret },
      body: JSON.stringify(payload)
    }, args.timeoutMs);
  } catch (e) {
    console.error('COMPOSE_FAIL: không kết nối được /compose (' + String(e.message).slice(0, 120) + ')');
    process.exit(4);
  }
  try { data = await r.json(); } catch (e) { data = null; }
  if (!r.ok || !data || data.ok !== true) {
    const code = data && data.code ? String(data.code).slice(0, 60) : '?';
    const msg = data && data.message ? String(data.message).slice(0, 200) : '';
    console.error('COMPOSE_FAIL: HTTP ' + r.status + ' code=' + code + (msg ? ' message=' + msg : ''));
    if (code === 'NO_SEGMENTATION') console.error('Gợi ý: host chưa cài rembg/mô hình tách nền; cài requirements hoặc gửi mask.');
    if (code === 'UNAUTHORIZED') console.error('Gợi ý: COMPOSITOR_SECRET của host KHÁC secret đang dùng để kiểm tra.');
    process.exit(4);
  }

  const out = Buffer.from(String(data.image_b64 || ''), 'base64');
  if (!isPng(out)) { console.error('REPORT_FAIL: image_b64 không phải PNG hợp lệ'); process.exit(5); }
  const rep = data.report && typeof data.report === 'object' ? data.report : {};
  const problems = [];
  if (rep.product_pixels_preserved !== true) problems.push('product_pixels_preserved != true');
  if (!(Number(rep.core_pixels) > 0)) problems.push('core_pixels <= 0');
  if (Number(rep.core_pixels_mismatched) !== 0) problems.push('core_pixels_mismatched != 0 (' + rep.core_pixels_mismatched + ')');

  fs.mkdirSync(args.out, { recursive: true });
  const before = path.join(args.out, 'before.png');
  const after = path.join(args.out, args.noMask ? 'after-no-mask.png' : 'after-mask.png');
  fs.writeFileSync(before, image);
  fs.writeFileSync(after, out);
  console.log('compose: HTTP 200 · ' + out.length + ' bytes');
  console.log('report: preserved=' + rep.product_pixels_preserved + ' core=' + rep.core_pixels + ' mismatched=' + rep.core_pixels_mismatched +
    ' canvas=' + JSON.stringify(rep.canvas) + ' product=' + JSON.stringify(rep.product_size) + ' background=' + rep.background);
  console.log('saved: ' + before);
  console.log('saved: ' + after);
  if (problems.length) { console.error('REPORT_FAIL: ' + problems.join('; ')); process.exit(5); }
  console.log('RESULT: OK — host giữ nguyên pixel lõi sản phẩm theo báo cáo; mở after-*.png để kiểm tra bằng mắt.');
})().catch((e) => { console.error('LỖI KHÔNG BẮT ĐƯỢC: ' + (e && e.stack || e)); process.exit(1); });
