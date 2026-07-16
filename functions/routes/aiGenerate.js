/*
 * routes/aiGenerate.js — Sprint 14 Phase 5 (FINAL mục 17.19). `POST
 * /v1/ai/{route}/generate` cho 9 module AI thật + 3 route khung (Video/
 * Voice/Subtitle — "chưa impl thật, chỉ chuẩn bị shape" đúng nguyên văn mục
 * 20 Phase 4 gốc, trả 501 rõ ràng thay vì giả vờ hoạt động).
 */
const { generateForModule } = require('../shared/aiGenerate');
const { validateSchema } = require('../shared/validation');

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

  if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng Media AI.');

  const schema = REQUIRED_SCHEMA[route];
  const check = validateSchema(req.body, schema);
  if (!check.valid) return sendError(res, 'INVALID_REQUEST', check.issues.join(' '));

  try {
    const draft = await generateForModule(moduleId, req.body || {}, auth.uid, auth.email);
    return sendSuccess(res, draft, { status: 201 });
  } catch (err) {
    return sendError(res, 'UPSTREAM_ERROR', 'Generate thất bại: ' + err.message);
  }
}

module.exports = { handle, ROUTE_TO_MODULE };
