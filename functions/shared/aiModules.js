/*
 * shared/aiModules.js — Sprint 14 Phase 5 (FINAL mục 17.19), refactored
 * Sprint 15 Phase 2 (AI Architecture Consolidation, Option B — approved by
 * Founder). `buildPrompt()`/`mapToDraftContent()`/`targetCollection` (+
 * IMAGE_TYPE_DIRECTION/STYLE_DIRECTION for image-generator) now come from
 * `shared/aiModulesCore.js` — the single source of truth, also used
 * verbatim by the client (`js/ai/modules-core.js`, kept byte-identical, see
 * that file's header). This file's own job is now narrower: `loadContext()`
 * per module (the one genuinely server-specific piece — uses
 * `shared/listResource.js`, where the client uses `DataProvider`) and
 * re-exporting the same `{ MODULES, parseJsonResponse }` shape
 * `shared/aiGenerate.js` already depends on — that shape is UNCHANGED, so
 * nothing downstream of this file needed to change.
 *
 * No prompt wording, no parsing logic, no field mapping changed by this
 * refactor — see AI_CONSOLIDATION_REPORT.md for the verbatim-preservation
 * verification done before this file was touched.
 */
const listResource = require('./listResource');
const AiModulesCore = require('./aiModulesCore');

const { parseJsonResponse, stripCodeFence, escapeHtml, getYoutubeEmbedUrl, productCategoryLabels } = AiModulesCore;

async function productAndCategories(productId) {
  if (!productId) return {};
  const [product, categories] = await Promise.all([
    listResource.getOne('products', productId),
    listResource.getAll('categories')
  ]);
  return { product: product || {}, categories: categories || [] };
}

// LOAD_CONTEXT — the one genuinely environment-specific piece per module
// (server reads via shared/listResource.js; client reads via DataProvider,
// see each js/ai/modules/*.js file). Everything else comes from
// AiModulesCore.MODULES[id] unchanged.
const LOAD_CONTEXT = {
  'blog-writer': async (inputParams) => productAndCategories(inputParams.productId),
  'product-description-writer': async (inputParams) => productAndCategories(inputParams.productId),
  'seo-generator': async (inputParams) => {
    if (!inputParams.postId) return {};
    const post = await listResource.getOne('blogPosts', inputParams.postId);
    if (!post || !post.relatedProductId) return { post };
    const { product, categories } = await productAndCategories(post.relatedProductId);
    return { post, product, categories };
  },
  'facebook-post-generator': async (inputParams) => productAndCategories(inputParams.productId),
  'banner-generator': async (inputParams) => productAndCategories(inputParams.productId),
  'image-generator': async (inputParams) => {
    if (inputParams.productId) { const product = await listResource.getOne('products', inputParams.productId); return { product: product || {} }; }
    if (inputParams.blogPostId) { const post = await listResource.getOne('blogPosts', inputParams.blogPostId); return { post: post || {} }; }
    return {};
  },
  'image-prompt-generator': async () => ({}),
  'slider-generator': async (inputParams) => {
    if (!inputParams.productId) return {};
    const product = await listResource.getOne('products', inputParams.productId);
    const media = (product && Array.isArray(product.images) && product.images.length) ? product.images : (product && product.image ? [product.image] : []);
    return { product: product || {}, media };
  },
  'faq-generator': async () => ({})
};

// MODULES — same public shape as before this refactor (targetCollection/
// loadContext/buildPrompt/mapToDraftContent per id), so shared/aiGenerate.js
// (the only consumer, `const { MODULES } = require('./aiModules')`) needs
// no changes at all.
const MODULES = {};
Object.keys(AiModulesCore.MODULES).forEach(id => {
  MODULES[id] = Object.assign({ loadContext: LOAD_CONTEXT[id] }, AiModulesCore.MODULES[id]);
});

module.exports = { MODULES, parseJsonResponse, stripCodeFence, escapeHtml, getYoutubeEmbedUrl, productCategoryLabels };
