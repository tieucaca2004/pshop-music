// MT-enabled
const { sendSuccess, sendError } = require("../shared/middleware");
const { resolveBusinessId, checkBusinessRole } = require("../shared/apiAdapter");

/*
 * routes/socialMediaCenter.js — Sprint 14 Phase 3 (FINAL mục 17.20). Lọc
 * `aiDrafts` theo 4 module thật (`RELEVANT_MODULES`, đúng
 * js/admin-social-center.js:34-39,80-85). `publish` port
 * `publishVersionToFacebookAfterPermission()` (js/admin-ai.js:378-437) —
 * CÙNG hành vi: kiểm tra `facebookConnection.status`, đánh dấu version
 * "publishing" trước, build message, gọi publishToActivePage() trong tiến trình
 * (G1M: Cloud Function `facebookPublish` giờ chỉ cho super_admin nên KHÔNG proxy
 * sang đó nữa — quyền admin/editor do gateway xác thực), ghi "published"/"failed" vào ĐÚNG version đó — không
 * đổi `draft.status` cấp cao nhất (khác `publishToTarget()`).
 *
 * `schedule` port `schedulePublish()` (js/admin-social-center.js:412-428) —
 * CHỈ ghi `scheduledAt`/`publishStatus:'scheduled'` lên version. **CHƯA có
 * Cloud Scheduler/Cloud Task thật kích hoạt tự động** (audit Phần 5 mục 8,
 * FINAL mục 17.20) — tài liệu gọi đây là "bắt buộc" nhưng tạo hạ tầng GCP
 * mới (Cloud Tasks queue, IAM, chi phí) là quyết định vận hành riêng, KHÔNG
 * tự ý provision — endpoint này chỉ LƯU ý định lịch, giống hệt hành vi
 * client hiện tại (chỉ chạy khi có tab trình duyệt mở với `setInterval`) —
 * KHÔNG regression, KHÔNG giả vờ đã có Scheduler thật.
 */
const admin = require('firebase-admin');
const listResource = require('../shared/listResource');
const fbConn = require('../shared/fbConnectionPatch');

const DRAFTS_NODE = 'aiDrafts';
const RELEVANT_MODULES = ['facebook-post-generator', 'banner-generator', 'blog-writer', 'product-description-writer'];

function canPublish(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

function absolutizeLink(link) {
  const str = String(link || '');
  if (!str) return '';
  return /^https?:\/\//i.test(str) ? str : 'https://pshopmusic.com/' + str.replace(/^\//, '');
}

function buildFacebookPublishMessage(draft, version, product) {
  const c = draft.content || {};
  const parts = [];
  if (version.hook) parts.push(version.hook);
  if (version.caption) parts.push(version.caption);
  if (Array.isArray(c.productHighlights) && c.productHighlights.length) {
    parts.push(c.productHighlights.map(h => '✓ ' + h).join('\n'));
  }
  if (version.cta) parts.push(version.cta);
  if (Array.isArray(version.hashtags) && version.hashtags.length) {
    parts.push(version.hashtags.map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' '));
  }
  if (c.productLink) parts.push('Xem chi tiết: ' + absolutizeLink(c.productLink));
  if (product && product.youtubeUrl) parts.push('Video: ' + product.youtubeUrl);
  return parts.join('\n\n');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  if (path.indexOf('/v1/social-media-center/') !== 0) return null;

  // Admin/Editor (gateway xác thực) hoặc super_admin (xác thực lại ở backend).
  let actorEmail = auth.email || '';
  if (!canPublish(auth)) {
    const sa = await fbConn.verifySuperAdmin(req);
    if (!sa.ok) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng Social Media Center.');
    actorEmail = sa.email;
  }

  if (path === '/v1/social-media-center/drafts' && req.method === 'GET') {
    const all = await listResource.getAll(DRAFTS_NODE);
    return sendSuccess(res, all.filter(d => RELEVANT_MODULES.includes(d.moduleId)));
  }

  const rest = path.slice('/v1/social-media-center/drafts/'.length);
  const [id, action] = rest.split('/');
  if (!id || !action) return sendError(res, 'NOT_FOUND', 'Không tìm thấy route Social Media Center.');

  const draft = await listResource.getOne(DRAFTS_NODE, id);
  if (!draft || !Array.isArray((draft.content || {}).versions)) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Nháp Facebook.');
  const versionLabel = req.body && req.body.versionLabel;
  const idx = draft.content.versions.findIndex(v => v.label === versionLabel);
  if (idx === -1) return sendError(res, 'INVALID_REQUEST', 'Không tìm thấy phiên bản "' + versionLabel + '".');

  if (action === 'schedule' && req.method === 'POST') {
    const when = Number(req.body && req.body.scheduledAt);
    if (!when || isNaN(when) || when <= Date.now()) return sendError(res, 'INVALID_REQUEST', 'scheduledAt phải là timestamp ở tương lai.');
    const versions = draft.content.versions.slice();
    versions[idx] = Object.assign({}, versions[idx], { scheduledAt: when, publishStatus: 'scheduled' });
    const updated = await listResource.update(DRAFTS_NODE, id, { content: Object.assign({}, draft.content, { versions }) });
    return sendSuccess(res, updated);
  }

  if (action === 'publish' && req.method === 'POST') {
    const connSnap = await admin.database().ref('facebookConnection').once('value');
    const conn = connSnap.val() || { status: 'not_connected' };
    if (conn.status !== 'connected' && conn.status !== 'token_expiring') {
      return sendError(res, 'INVALID_REQUEST', 'Chưa kết nối Facebook. Vào "Cài đặt" → "Facebook Configuration" để kết nối trước khi đăng bài thật.');
    }

    const versions = draft.content.versions.slice();
    versions[idx] = Object.assign({}, versions[idx], { publishStatus: 'publishing', publishError: null });
    await listResource.update(DRAFTS_NODE, id, { content: Object.assign({}, draft.content, { versions }) });

    const product = draft.inputParams && draft.inputParams.productId ? await listResource.getOne('products', draft.inputParams.productId) : null;
    const message = buildFacebookPublishMessage(draft, versions[idx], product);
    const c = draft.content;
    const imageUrls = [c.featuredImage].concat(Array.isArray(c.galleryImages) ? c.galleryImages : []).filter(Boolean);

    let ok = false, data = {};
    try {
      const result = await fbConn.publishToActivePage({ message, imageUrls });
      ok = result.status === 200;
      data = result.body || {};
    } catch (err) {
      data = { error: err.message };
    }

    const finalVersions = versions.slice();
    if (ok && data.success) {
      finalVersions[idx] = Object.assign({}, finalVersions[idx], {
        publishStatus: 'published', facebookPostId: data.facebookPostId, publishedAt: Date.now(),
        publishedBy: actorEmail, selectedPage: conn.pageName || ''
      });
    } else {
      finalVersions[idx] = Object.assign({}, finalVersions[idx], { publishStatus: 'failed', publishError: data.error || 'Không rõ nguyên nhân.' });
    }
    const updated = await listResource.update(DRAFTS_NODE, id, { content: Object.assign({}, draft.content, { versions: finalVersions }) });

    if (!ok || !data.success) return sendError(res, 'UPSTREAM_ERROR', finalVersions[idx].publishError, { draft: updated });
    return sendSuccess(res, updated);
  }

  return sendError(res, 'METHOD_NOT_ALLOWED', 'Route/method Social Media Center không hợp lệ.');
}

module.exports = { handle };
