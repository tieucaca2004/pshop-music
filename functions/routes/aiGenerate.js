// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/aiGenerate.js — Sprint 14 Phase 5 (FINAL mục 17.19). `POST
 * /v1/ai/{route}/generate` cho 9 module AI thật + 3 route khung (Video/
 * Voice/Subtitle — "chưa impl thật, chỉ chuẩn bị shape" đúng nguyên văn mục
 * 20 Phase 4 gốc, trả 501 rõ ràng thay vì giả vờ hoạt động).
 *
 * Agent RBAC Foundation (Sprint 15) — CHỈ 3/9 module mở cho role "agent"
 * (đúng phạm vi Founder chỉ định: Blog Draft + Sinh Media/Ảnh), qua
 * `canAccess(auth, ROUTE_TO_PERMISSION[route])` — Admin/Editor KHÔNG đổi
 * hành vi (canAccess luôn cho qua 2 role này y hệt isStaff() cũ). 6 module
 * còn lại (product-description/seo/facebook-post/banner/slider/faq) và cả
 * 3 route khung (video/voice/subtitle) KHÔNG có entry trong
 * ROUTE_TO_PERMISSION — canAccess() trả về false cho agent ở các route đó,
 * y hệt trước đây (chỉ Admin/Editor).
 *
 * Sprint 15 Phase 3 (Task 3.2) — `?async=true` (query string) chuyển sang
 * đường bất đồng bộ: trả `{jobId, status:'queued'}` NGAY (202), KHÔNG chờ
 * OpenAI. Mặc định (không có `?async=true`) GIỮ NGUYÊN hành vi đồng bộ gốc
 * — 0 thay đổi cho caller cũ (routes/founder.js one-click-marketing gọi
 * generateForModule() trực tiếp, không qua route này, cũng không đổi).
 */
const { generateForModule, queueGeneration } = require('../shared/aiGenerate');
const { validateSchema } = require('../shared/validation');
const { checkAndIncrement } = require('../shared/rateLimit');
const { canAccess } = require('../shared/permissions');

const ROUTE_TO_MODULE = {
  blog: 'blog-writer',
  'product-description': 'product-description-writer',
  seo: 'seo-generator',
  'facebook-post': 'facebook-post-generator',
  banner: 'banner-generator',
  image: 'image-generator',
  'image-prompt': 'image-prompt-generator',
  slider: 'slider-generator',
  faq: 'faq-generator'
};

// ROUTE_TO_PERMISSION — CHỈ 3 route agent được phép (Blog Draft + Media
// generation). Route không liệt kê ở đây = agent luôn bị từ chối, dù có gọi
// canAccess() với permission rỗng/không khớp — không cần liệt kê "false".
const ROUTE_TO_PERMISSION = {
  blog: 'ai.generate.blog',
  image: 'ai.generate.image',
  'image-prompt': 'ai.generate.imagePrompt'
};

const REQUIRED_SCHEMA = {
  blog: { topic: { required: true, type: 'string' } },
  'product-description': { productId: { required: true, type: 'string' } },
  seo: { postId: { required: true, type: 'string' } },
  'facebook-post': {},
  banner: {},
  image: { imageType: { required: true, type: 'string' } },
  'image-prompt': { subject: { required: true, type: 'string' } },
  slider: { productId: { required: true, type: 'string' } },
  faq: { topic: { required: true, type: 'string' } }
};

const STUB_ROUTES = new Set(['video', 'voice', 'subtitle']);

function isStaff(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  const match = path.match(/^\/v1\/ai\/([a-z-]+)\/generate$/);
  if (!match) return null;
  const route = match[1];
  if (req.method !== 'POST') return sendError(res, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ POST.');

  if (STUB_ROUTES.has(route)) {
    if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng Media AI.');
    return sendError(res, 'SERVICE_UNAVAILABLE', 'API Media AI "' + route + '" chưa được triển khai — chỉ chuẩn bị shape route ("Think Ahead. Build Later"), chưa có Provider/model nào tích hợp.');
  }

  const moduleId = ROUTE_TO_MODULE[route];
  if (!moduleId) return null;

  if (!canAccess(auth, ROUTE_TO_PERMISSION[route] || '__no_agent_access__')) {
    return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng Media AI.');
  }

  const schema = REQUIRED_SCHEMA[route];
  const check = validateSchema(req.body, schema);
  if (!check.valid) return sendError(res, 'INVALID_REQUEST', check.issues.join(' '));

  // Rate limit (Sprint 15 Phase 1, Task 1.2/objective 7) — LIMITS.aiGenerate/
  // aiGenerateDaily đã định nghĩa sẵn ở shared/rateLimit.js từ Phase 1 gốc
  // nhưng chưa route nào gọi tới — mỗi lần generate là 1 lệnh gọi OpenAI thật
  // (tốn phí), cần giới hạn riêng chặt hơn mức "authenticated" chung.
  const perMinute = await checkAndIncrement('uid:' + auth.uid, 'aiGenerate');
  if (!perMinute.allowed) return sendError(res, 'RATE_LIMITED', 'Vượt giới hạn AI Generate (' + perMinute.max + '/phút).');
  const perDay = await checkAndIncrement('uid:' + auth.uid, 'aiGenerateDaily');
  if (!perDay.allowed) return sendError(res, 'RATE_LIMITED', 'Vượt giới hạn AI Generate (' + perDay.max + '/ngày).');

  const isAsync = req.query && (req.query.async === 'true' || req.query.async === '1');
  if (isAsync) {
    try {
      const job = await queueGeneration(moduleId, req.body || {}, auth.uid);
      return sendSuccess(res, { jobId: job.id, status: 'queued' }, { status: 202 });
    } catch (err) {
      return sendError(res, 'UPSTREAM_ERROR', 'Không tạo được Job: ' + err.message);
    }
  }

  try {
    const draft = await generateForModule(moduleId, req.body || {}, auth.uid, auth.email);
    return sendSuccess(res, draft, { status: 201 });
  } catch (err) {
    return sendError(res, 'UPSTREAM_ERROR', 'Generate thất bại: ' + err.message);
  }
}

module.exports = { handle, ROUTE_TO_MODULE };
