// P0 DATA SAFETY — publishToTarget() không được phá dữ liệu thật.
// Chạy MÃ NGUỒN THẬT (không mock logic): js/ai/modules-core.js
// (mapToDraftContent), js/admin-ai.js (publishDraftById → publishToTarget
// phía client, trong Node vm) và functions/shared/publishToTarget.js (phía
// server, chỉ thay listResource bằng bộ nhớ). DB giả lập đúng ngữ nghĩa
// Firebase update() = merge nông.
// Chạy: node tests/publish-safety.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'js/ai/modules-core.js'));
const PDW = Core.MODULES['product-description-writer'];
const SEO = Core.MODULES['seo-generator'];

// ── Dữ liệu "Production" mẫu ────────────────────────────────────────────
function seed() {
  return {
    products: {
      p1: { id: 'p1', name: 'Pioneer DDJ-FLX4', brand: 'Pioneer', category: 'controller',
        shortDescription: 'Mô tả ngắn thật', specifications: '<ul><li>2 deck</li></ul>',
        faq: [{ question: 'Q thật', answer: 'A thật' }], seoTitle: 'SEO thật', metaDescription: 'Meta thật',
        seoKeywords: ['ddj'], slug: 'pioneer-ddj-flx4', tags: ['dj'], price: 6990000 }
    },
    categories: { c1: { id: 'c1', code: 'controller', label: 'Controller' }, c2: { id: 'c2', code: 'loa', label: 'Loa', active: false } },
    blogPosts: { b1: { id: 'b1', title: 'Bài thật', contentHtml: '<p>Nội dung thật</p>', status: 'published', slug: 'bai-that' } },
    banners: { k1: { id: 'k1', title: 'Banner cũ', active: true, order: 3 } },
    aiDrafts: {}
  };
}

function productDraft(text, id) {
  const ctx = { product: seed().products.p1, categories: Object.values(seed().categories) };
  return { id: id || 'd1', moduleId: 'product-description-writer', targetCollection: 'products', targetId: 'p1',
    inputParams: { productId: 'p1' }, status: 'pending_review',
    content: PDW.mapToDraftContent({ text }, { productId: 'p1' }, ctx) };
}

const CASES = {
  malformed: 'Xin lỗi, đây là mô tả tự do không phải JSON',
  missing: JSON.stringify({ description: '<p>Mô tả mới</p>' }),
  empty: JSON.stringify({ name: '', shortDescription: '', description: '<p>Mô tả mới</p>', specifications: '', faq: [], seoTitle: '', slug: '', tags: [], category: '' }),
  partial: JSON.stringify({ description: '<p>Mô tả mới</p>', seoTitle: 'SEO mới', category: 'loa' /* inactive */ }),
  complete: JSON.stringify({ name: 'Pioneer DDJ-FLX4 Controller', shortDescription: 'Ngắn mới', description: '<p>Dài mới</p>',
    specifications: '<ul><li>2 deck mới</li></ul>', features: ['a'], faq: [{ question: 'Q mới', answer: 'A mới' }],
    seoTitle: 'SEO mới', metaDescription: 'Meta mới', seoKeywords: ['k'], slug: 'slug-moi', tags: ['t'], category: 'controller', altText: 'alt' })
};

// ── Runner phía CLIENT (js/admin-ai.js trong vm) ─────────────────────────
function makeClient(db) {
  const listDB = node => ({
    getAll: () => Promise.resolve(Object.values(db[node]).map(x => Object.assign({}, x))),
    get: id => Promise.resolve(db[node][id] ? Object.assign({}, db[node][id]) : null),
    add: data => { const id = node + '_new' + Object.keys(db[node]).length; db[node][id] = Object.assign({}, data, { id }); return Promise.resolve(db[node][id]); },
    update: (id, ch) => { for (const k in ch) if (ch[k] === undefined) return Promise.reject(new Error('Firebase: undefined value ' + k)); db[node][id] = Object.assign({}, db[node][id], ch); return Promise.resolve(); }
  });
  const ctx = {
    console, Date, Promise, JSON, Object, Array, String, Number, Math, RegExp, Error,
    DB: listDB('products'), CategoryDB: listDB('categories'), BlogDB: listDB('blogPosts'),
    BannerDB: listDB('banners'), DraftDB: listDB('aiDrafts'), SiteContentDB: { get: () => Promise.resolve({}), save: () => Promise.resolve() },
    AIModuleRegistry: { get: () => null }, document: { getElementById: () => null }, window: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/admin-ai.js'), 'utf8') + '\n;this.AdminAI = AdminAI;', ctx);
  return draft => { db.aiDrafts[draft.id] = draft; return ctx.AdminAI.publishDraftById(draft.id); };
}

// ── Runner phía SERVER (functions/shared/publishToTarget.js) ─────────────
function makeServer(db) {
  const fake = {
    getAll: async n => Object.values(db[n]).map(x => Object.assign({}, x)),
    getOne: async (n, id) => db[n][id] ? Object.assign({}, db[n][id]) : null,
    add: async (n, data) => { const id = n + '_new' + Object.keys(db[n]).length; db[n][id] = Object.assign({}, data, { id }); return db[n][id]; },
    update: async (n, id, ch) => { for (const k in ch) if (ch[k] === undefined) throw new Error('Firebase: undefined value ' + k); db[n][id] = Object.assign({}, db[n][id], ch); return db[n][id]; }
  };
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === './listResource') return fake;
    if (req === 'firebase-admin') return { database: () => ({}) };
    return origLoad.apply(this, arguments);
  };
  const file = path.join(ROOT, 'functions/shared/publishToTarget.js');
  delete require.cache[file];
  const mod = require(file);
  Module._load = origLoad;
  return draft => { db.aiDrafts[draft.id] = draft; return mod.publishToTarget(draft); };
}

async function suite(label, make) {
  const results = [];
  const t = async (name, fn) => { try { await fn(); results.push('  ✔ ' + name); } catch (e) { results.push('  ✘ ' + name + ' — ' + e.message); process.exitCode = 1; } };

  await t('malformed JSON → từ chối publish, sản phẩm KHÔNG đổi', async () => {
    const db = seed(); const before = JSON.stringify(db.products.p1);
    const d = productDraft(CASES.malformed);
    assert.strictEqual(d.content._parseError, true);
    await assert.rejects(make(db)(d), /không đúng định dạng JSON/);
    assert.strictEqual(JSON.stringify(db.products.p1), before);
  });
  await t('JSON thiếu field → giữ nguyên giá trị cũ', async () => {
    const db = seed(); await make(db)(productDraft(CASES.missing));
    const p = db.products.p1;
    assert.strictEqual(p.description, '<p>Mô tả mới</p>');
    assert.strictEqual(p.specifications, '<ul><li>2 deck</li></ul>');
    assert.deepStrictEqual(p.faq, [{ question: 'Q thật', answer: 'A thật' }]);
    assert.strictEqual(p.seoTitle, 'SEO thật'); assert.strictEqual(p.slug, 'pioneer-ddj-flx4');
    assert.deepStrictEqual(p.tags, ['dj']); assert.strictEqual(p.category, 'controller'); assert.strictEqual(p.price, 6990000);
  });
  await t('JSON field rỗng → không ghi đè rỗng', async () => {
    const db = seed(); await make(db)(productDraft(CASES.empty));
    const p = db.products.p1;
    assert.strictEqual(p.name, 'Pioneer DDJ-FLX4'); assert.strictEqual(p.shortDescription, 'Mô tả ngắn thật');
    assert.strictEqual(p.specifications, '<ul><li>2 deck</li></ul>'); assert.strictEqual(p.faq.length, 1);
    assert.strictEqual(p.slug, 'pioneer-ddj-flx4');
  });
  await t('JSON partial + category không active → cập nhật phần có, giữ category cũ', async () => {
    const db = seed(); await make(db)(productDraft(CASES.partial));
    const p = db.products.p1;
    assert.strictEqual(p.seoTitle, 'SEO mới'); assert.strictEqual(p.category, 'controller'); assert.strictEqual(p.metaDescription, 'Meta thật');
  });
  await t('JSON đầy đủ → cập nhật đủ, KHÔNG có field nội bộ _productName/_parseError', async () => {
    const db = seed(); await make(db)(productDraft(CASES.complete));
    const p = db.products.p1;
    assert.strictEqual(p.name, 'Pioneer DDJ-FLX4 Controller'); assert.strictEqual(p.slug, 'slug-moi');
    assert.strictEqual(p.faq[0].question, 'Q mới'); assert.strictEqual(p.price, 6990000);
    assert.ok(!('_productName' in p) && !('_parseError' in p), 'field nội bộ lọt vào sản phẩm');
  });
  await t('SEO-only draft (seo-generator) → không xoá title/contentHtml, không đổi status', async () => {
    const db = seed();
    db.blogPosts.b1.status = 'draft';
    const content = SEO.mapToDraftContent({ text: 'Meta T\nMeta D\nk1, k2\nOG T\nOG D\nArticle' }, { postId: 'b1' }, { post: db.blogPosts.b1 });
    await make(db)({ id: 'd2', moduleId: 'seo-generator', targetCollection: 'blogPosts', targetId: 'b1', inputParams: { postId: 'b1' }, content });
    const b = db.blogPosts.b1;
    assert.strictEqual(b.title, 'Bài thật'); assert.strictEqual(b.contentHtml, '<p>Nội dung thật</p>');
    assert.strictEqual(b.status, 'draft'); assert.strictEqual(b.seoTitle, 'Meta T'); assert.ok(!('_postTitle' in b));
  });
  console.log(label); results.forEach(r => console.log(r));
}

(async () => {
  await suite('CLIENT js/admin-ai.js', makeClient);
  await suite('SERVER functions/shared/publishToTarget.js', makeServer);
  if (process.exitCode) console.log('FAILED'); else console.log('publish-safety: OK');
})();
