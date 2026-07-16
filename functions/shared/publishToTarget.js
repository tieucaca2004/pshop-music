/*
 * shared/publishToTarget.js — Sprint 14 Phase 3 (FINAL mục 17.14: "chuyển
 * business logic rẽ nhánh theo `targetCollection` hẳn vào Backend", audit
 * Phần 5 mục 5). Port NGUYÊN VẸN `publishToTarget()` từ js/admin-ai.js:558-
 * 604 (kèm 3 hàm phụ trợ 26-76) sang server — CÙNG branch, CÙNG thứ tự xử
 * lý, KHÔNG đổi hành vi. Client-side `publishToTarget()`/`publishDraft()`/
 * `publishDraftById()` trong admin-ai.js GIỮ NGUYÊN, không xoá (trang Duyệt
 * nội dung vẫn dùng đường cũ cho tới khi UI được đổi sang gọi API mới —
 * ngoài phạm vi Phase 3, "API only").
 */
const admin = require('firebase-admin');
const listResource = require('./listResource');

function stripCodeFence(str) {
  return String(str || '')
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
}

function stripHtmlTags(str) {
  return String(str || '').replace(/<[^>]+>/g, '').trim();
}

function looksLikeFenceGarbage(title) {
  const t = String(title || '').trim();
  return !t || /^```/.test(t);
}

function sanitizeBlogContentForPublish(content, inputParams) {
  const cleanedContentHtml = stripCodeFence(content.contentHtml);
  const cleanedExcerptRaw = stripCodeFence(content.excerpt);
  let title = content.title;
  if (looksLikeFenceGarbage(title)) {
    const source = cleanedExcerptRaw || cleanedContentHtml;
    const m = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    title = m ? stripHtmlTags(m[1]) : ((inputParams && inputParams.topic) || 'Bài viết');
  }
  let excerpt = cleanedExcerptRaw;
  if (/^<h1[\s>]/i.test(excerpt) || stripHtmlTags(excerpt) === title) excerpt = '';
  else excerpt = stripHtmlTags(excerpt);
  return Object.assign({}, content, {
    title,
    excerpt,
    contentHtml: cleanedContentHtml,
    slug: looksLikeFenceGarbage(content.title) ? '' : content.slug
  });
}

function slugifyForPublish(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function publishToTarget(draft) {
  const target = draft.targetCollection;
  if (!target) return; // Facebook Post / Image Prompt — chỉ để xem/copy, không có nơi ghi

  if (target === 'blogPosts') {
    const sanitized = sanitizeBlogContentForPublish(draft.content, draft.inputParams);
    const content = Object.assign({}, sanitized, { status: 'published' });
    if (draft.targetId) return listResource.update('blogPosts', draft.targetId, content);
    if (!content.slug) content.slug = slugifyForPublish(content.title);
    return listResource.add('blogPosts', content);
  }

  if (target === 'products') {
    const content = Object.assign({}, draft.content, {
      description: stripCodeFence(draft.content.description),
      specifications: stripCodeFence(draft.content.specifications)
    });
    const categories = await listResource.getAll('categories');
    const validCodes = categories.filter(c => c.active !== false).map(c => c.code);
    if (!content.category || validCodes.indexOf(content.category) === -1) {
      delete content.category;
    }
    return listResource.update('products', draft.targetId, content);
  }

  if (target === 'banners') {
    return listResource.add('banners', draft.content);
  }

  if (target === 'siteContent.heroSlides') {
    const snap = await admin.database().ref('siteContent/heroSlides').once('value');
    const heroSlides = Array.isArray(snap.val()) ? snap.val().slice() : [];
    heroSlides.push(draft.content);
    return admin.database().ref('siteContent/heroSlides').set(heroSlides);
  }

  throw new Error('Không nhận diện được targetCollection: ' + target);
}

module.exports = { publishToTarget, stripCodeFence, sanitizeBlogContentForPublish, slugifyForPublish };
