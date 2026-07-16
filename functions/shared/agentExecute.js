/*
 * shared/agentExecute.js — Sprint 14 Phase 4 (FINAL mục 18.1-18.2). Port
 * `resolveInputParams()`/`executeStep()` (js/admin-agent.js:700-1107) —
 * CÙNG 5 nhóm hành vi, CÙNG logic mỗi tool. Khác biệt bắt buộc so với
 * client (server không có trình duyệt/DOM):
 *
 * - Nhóm "Điều hướng" (open-product/update-product-field/open-draft/
 *   navigate): tài liệu FINAL mục 18.1 yêu cầu THIẾT KẾ LẠI — trả
 *   `deepLinkUrl` thay vì tự `window.location.href=...` (vô nghĩa với
 *   OpenClaw không có trình duyệt). Founder/OpenClaw tự mở URL đó.
 * - Nhóm "Xử lý ảnh đơn lẻ" (smart-background/product-banner): gọi PROXY
 *   sang action `remove_background`/`edit_image` có sẵn trong `openaiProxy`
 *   (forward Authorization) thay vì `AdminBgRemover` (chỉ tồn tại phía
 *   client) — CÙNG Cloud Function xử lý ảnh thật, không viết lại.
 * - Nhóm "Generic Plugin" (5 tool content-generation, "seo" xử lý riêng ở
 *   nhánh của nó): Phase 4 ban đầu trả `status:'failed'` (chưa có API Media
 *   AI Generate). Phase 5 nối dây thật — gọi `generateForModule()` (CÙNG
 *   hàm 9 route `/v1/ai/{module}/generate` dùng, routes/aiGenerate.js), 1
 *   nguồn logic sinh nội dung duy nhất, không viết lại.
 * - Nhóm "Ghi Firebase trực tiếp"/"Đọc thuần": port ĐẦY ĐỦ, hoạt động thật
 *   100% (không phụ thuộc bất kỳ Phase nào sau).
 */
const listResource = require('./listResource');
const { callOpenAI, parseAIJson } = require('./agentPlanner');
const { generateForModule } = require('./aiGenerate');
const {
  PRODUCT_TOKEN, RESEARCH_TOKENS, CATEGORY_CONFIDENCE_AUTO,
  TOOL_GROUPS, TOOL_MAP, NAV_PAGES, AGENT_FIELD_LABELS, UNDOABLE_DRAFT_TOOLS,
  GROUP_WRITE_DIRECT, GROUP_IMAGE_SYNC, GROUP_READONLY, GROUP_NAVIGATE, GROUP_GENERIC_PLUGIN
} = require('./agentTools');

const FUNCTIONS_BASE = 'https://us-central1-pshop-music.cloudfunctions.net';

function resolveInputParams(step, allSteps, products) {
  const params = Object.assign({}, step.inputParams);
  let ok = true;
  const createStep = allSteps.find(s => s.tool === 'create-product');
  const researchStep = allSteps.find(s => s.tool === 'research-product');
  Object.keys(params).forEach(key => {
    const val = params[key];
    if (val === PRODUCT_TOKEN) {
      if (createStep && createStep.status === 'completed' && createStep.productId) {
        params[key] = createStep.productId;
      } else {
        ok = false;
      }
    } else if (RESEARCH_TOKENS.indexOf(val) !== -1) {
      if (researchStep && researchStep.status === 'completed' && researchStep.research) {
        const field = val.split('.')[1];
        params[key] = researchStep.research[field] || '';
      } else {
        ok = false;
      }
    } else if (key === 'productId' && !val && step.target) {
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(step.target);
      const match = target ? products.find(p => {
        if (norm(p.name) === target || norm(p.sku) === target || norm(p.model) === target) return true;
        return target.length > 4 && (norm(p.name).indexOf(target) !== -1 || target.indexOf(norm(p.name)) !== -1);
      }) : null;
      if (match) params[key] = match.id;
    }
  });
  return ok ? params : null;
}

async function applyCategoryAssignment(productId, categoryIds, activeCats) {
  const first = activeCats.find(c => c.code === categoryIds[0]);
  return listResource.update('products', productId, { categoryIds, category: categoryIds[0], categoryLabel: first ? first.label : '' });
}

async function proxyImageAction(action, body, authHeader) {
  const upstream = await fetch(FUNCTIONS_BASE + '/openaiProxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(Object.assign({ action }, body))
  });
  const data = await upstream.json();
  if (!upstream.ok) throw new Error(data.error || (action + ' lỗi.'));
  return data.imageUrl;
}

async function executeStep(step, allSteps, ctx) {
  const { authHeader } = ctx;
  const products = await listResource.getAll('products');
  const resolvedParams = resolveInputParams(step, allSteps, products);
  if (resolvedParams === null) {
    step.status = 'failed';
    step.errorText = 'Cần hoàn thành bước trước đó trong Plan này trước — thử lại sau khi bước đó Hoàn tất.';
    return step;
  }

  step.status = 'running';
  step.errorText = null;

  try {
    const group = TOOL_GROUPS[step.tool];

    if (step.tool === 'create-product') {
      const name = (resolvedParams.name || step.target || 'Sản phẩm mới').trim();
      const extra = {};
      if (resolvedParams.brand) extra.brand = String(resolvedParams.brand).trim();
      if (resolvedParams.model) extra.model = String(resolvedParams.model).trim();
      if (step.attachedImageUrl) { extra.images = [step.attachedImageUrl]; extra.image = step.attachedImageUrl; }
      const newProduct = await listResource.add('products', Object.assign({ name, pubStatus: 'draft' }, extra));
      step.productId = newProduct.id;
      step.status = 'completed';

    } else if (step.tool === 'research-product') {
      const hint = String(resolvedParams.hint || step.target || '').trim();
      const prompt = `Bạn là trợ lý xác định TÊN SẢN PHẨM ĐẦY ĐỦ cho cửa hàng thiết bị DJ/âm thanh, CHỈ dựa vào kiến thức đã học sẵn (KHÔNG có khả năng truy cập Internet/duyệt web thật — có thể sai hoặc lỗi thời). Founder gõ: "${hint}".
Nếu đây là tên viết tắt/model của 1 thiết bị DJ/âm thanh thật (vd "RX3" → "Pioneer XDJ-RX3"), đề xuất Tên đầy đủ CHUẨN kèm Thương hiệu (brand) + Model. TUYỆT ĐỐI KHÔNG suy đoán/bịa thông số kỹ thuật ở đây — CHỈ xác định Tên/Thương hiệu/Model. Nếu có NHIỀU khả năng, liệt kê tối đa 3 candidates. Nếu không chắc chắn, để confidence THẤP và ghi rõ lý do.
Trả về DUY NHẤT JSON: {"resolvedName":"...","brand":"...","model":"...","confidence":0-100,"candidates":["tên khác 1","tên khác 2"],"note":"..."}`;
      const raw = await callOpenAI(prompt, authHeader);
      const parsed = parseAIJson(raw) || {};
      step.research = {
        name: parsed.resolvedName || hint,
        brand: parsed.brand || '',
        model: parsed.model || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
        note: parsed.note || ''
      };
      step.status = 'completed';

    } else if (step.tool === 'check-duplicate') {
      const nameToCheck = String(resolvedParams.name || step.target || '').trim();
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(nameToCheck);
      const match = target ? products.find(p => {
        if (norm(p.name) === target || norm(p.sku) === target || norm(p.model) === target || norm(p.slug) === target) return true;
        return target.length > 4 && (norm(p.name).indexOf(target) !== -1 || target.indexOf(norm(p.name)) !== -1);
      }) : null;
      if (match) {
        step.duplicateProductId = match.id;
        step.duplicateProductName = match.name;
        step.status = 'duplicate-found';
      } else {
        step.status = 'completed';
      }

    } else if (step.tool === 'detect-category') {
      const pid = resolvedParams.productId;
      if (!pid) throw new Error('Không xác định được sản phẩm cần gán danh mục.');
      step.productId = pid;
      const prodBefore = products.find(p => p.id === pid) || {};
      step._previousCategoryIds = Array.isArray(prodBefore.categoryIds) ? prodBefore.categoryIds.slice() : [];
      const categories = await listResource.getAll('categories');
      const activeCats = categories.filter(c => c.active !== false);
      if (!activeCats.length) {
        step.categoryResult = { assignments: [], noMatch: true };
        step.status = 'completed';
      } else {
        const prod = products.find(p => p.id === pid) || {};
        const catListText = activeCats.map(c => `${c.code} :: ${c.label}`).join('\n');
        const prompt = `Danh sách Danh mục ĐANG HOẠT ĐỘNG (chỉ được chọn mã "code" trong danh sách này, KHÔNG bịa mã mới):\n${catListText}\n\nSản phẩm cần gán Danh mục:\n- Tên: ${prod.name || ''}\n- Thương hiệu: ${prod.brand || ''}\n- Model: ${prod.model || ''}\n\nChọn TỐI ĐA 3 Danh mục phù hợp nhất, mỗi mục kèm % độ tin cậy (0-100, số nguyên) và lý do ngắn (Product Type/Brand/Keyword). Nếu KHÔNG có Danh mục nào phù hợp, trả "assignments":[].\nTrả về DUY NHẤT JSON: {"assignments":[{"code":"...","confidence":0,"reason":"..."}]}`;
        const raw = await callOpenAI(prompt, authHeader);
        const parsed = parseAIJson(raw) || { assignments: [] };
        const assignments = (Array.isArray(parsed.assignments) ? parsed.assignments : [])
          .filter(a => a && activeCats.some(c => c.code === a.code))
          .map(a => ({ code: a.code, confidence: typeof a.confidence === 'number' ? a.confidence : 0, reason: a.reason || '', label: (activeCats.find(c => c.code === a.code) || {}).label || a.code }));
        const highConf = assignments.filter(a => a.confidence >= CATEGORY_CONFIDENCE_AUTO);
        step.categoryResult = { assignments, noMatch: !assignments.length };
        if (highConf.length) {
          const codes = highConf.map(a => a.code);
          await applyCategoryAssignment(pid, codes, activeCats);
          step.categoryResult.autoAssigned = codes;
          step.status = 'completed';
        } else if (assignments.length) {
          step.status = 'category-review';
        } else {
          step.status = 'completed';
        }
      }

    } else if (step.tool === 'smart-background') {
      const pid = resolvedParams.productId;
      step.productId = pid;
      const prod = products.find(p => p.id === pid) || {};
      const firstImage = Array.isArray(prod.images) && prod.images.length ? prod.images[0] : (prod.image || '');
      if (!firstImage) {
        step.smartBackground = { applied: false, reason: 'Sản phẩm chưa có ảnh — bỏ qua.' };
        step.status = 'completed';
      } else {
        try {
          const resultUrl = await proxyImageAction('remove_background', { imageUrl: firstImage }, authHeader);
          step._previousImages = Array.isArray(prod.images) ? prod.images.slice() : [];
          step._previousImage = prod.image || '';
          const newImages = step._previousImages.length ? [resultUrl].concat(step._previousImages.slice(1)) : [resultUrl];
          await listResource.update('products', pid, { images: newImages, image: resultUrl });
          step.smartBackground = { applied: true, resultUrl };
          step.status = 'completed';
        } catch (err) {
          step.smartBackground = { applied: false, reason: 'Lỗi xóa phông: ' + err.message };
          step.status = 'completed';
        }
      }

    } else if (step.tool === 'product-banner') {
      const pid = resolvedParams.productId;
      step.productId = pid;
      const prod = products.find(p => p.id === pid);
      if (!prod) throw new Error('Không xác định được sản phẩm cần làm banner.');
      const sourceImage = (Array.isArray(prod.images) && prod.images.length ? prod.images[0] : prod.image) || '';
      if (!sourceImage) throw new Error('Sản phẩm "' + prod.name + '" chưa có ảnh thật — cần tải ảnh lên trước (Quản lý Sản phẩm) rồi mới làm banner được.');
      const style = String(resolvedParams.style || 'Dark').trim();
      const tagline = String(resolvedParams.tagline || '').trim();
      const editPrompt = `Professional product marketing banner background for a DJ/audio equipment store. Style: ${style} theme — dramatic gradient, spot lighting, premium tech aesthetic. Add bold, clearly legible white text overlay in the lower-left area saying exactly: "${prod.name}"${tagline ? `, with a smaller subtitle line below it saying exactly: "${tagline}"` : ''}. Keep the product in the photo exactly as it is — same shape, colors, logos, and details, do not redraw or alter the product itself.`;
      const resultUrl = await proxyImageAction('edit_image', { imageUrl: sourceImage, prompt: editPrompt, size: '16:9' }, authHeader);
      step.productBannerResult = { productId: pid, imageUrl: resultUrl };
      step.status = 'completed';

    } else if (step.tool === 'related-products') {
      const pid = resolvedParams.productId;
      const prod = products.find(p => p.id === pid) || {};
      const pCats = Array.isArray(prod.categoryIds) ? prod.categoryIds : [];
      const scored = products.filter(p => p.id !== pid).map(p => {
        const shared = Array.isArray(p.categoryIds) ? p.categoryIds.filter(c => pCats.indexOf(c) !== -1).length : 0;
        const brandMatch = (prod.brand && p.brand === prod.brand) ? 1 : 0;
        return { id: p.id, name: p.name, score: shared * 2 + brandMatch };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
      step.relatedProducts = scored;
      step.status = 'completed';

    } else if (step.tool === 'quality-score') {
      const pid = resolvedParams.productId;
      step.productId = pid;
      const prod = products.find(p => p.id === pid) || {};
      const descStep = allSteps.find(s => s.tool === 'product-description-writer' && s.status === 'completed');
      let draftContent = {};
      if (descStep && descStep.draftId) {
        const d = await listResource.getOne('aiDrafts', descStep.draftId);
        draftContent = (d && d.content) || {};
      }
      const catStep = allSteps.find(s => s.tool === 'detect-category');
      const hasCategory = !!(catStep && catStep.categoryResult && (catStep.categoryResult.autoAssigned || []).length) || (Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0);
      const blogStep = allSteps.find(s => s.tool === 'blog-writer' && s.status === 'completed' && s.draftId);
      const fbStep = allSteps.find(s => s.tool === 'facebook-post-generator' && s.status === 'completed' && s.draftId);
      const bannerStep = allSteps.find(s => s.tool === 'banner-generator' && s.status === 'completed' && s.draftId);
      const bgStep = allSteps.find(s => s.tool === 'smart-background' && s.status === 'completed');
      const imgCount = Array.isArray(prod.images) ? prod.images.length : 0;
      const dims = [
        { label: 'Product', weight: 10, ok: !!descStep },
        { label: 'SEO', weight: 12, ok: !!(draftContent.seoTitle && draftContent.metaDescription) },
        { label: 'Categories', weight: 12, ok: hasCategory },
        { label: 'Featured Image', weight: 10, ok: imgCount > 0 },
        { label: 'Gallery', weight: 6, ok: imgCount >= 2 },
        { label: 'Background', weight: 10, ok: !!bgStep },
        { label: 'Video', weight: 6, ok: !!prod.youtubeUrl },
        { label: 'Tài liệu', weight: 4, ok: false },
        { label: 'Blog', weight: 10, ok: !!blogStep },
        { label: 'Facebook', weight: 10, ok: !!fbStep },
        { label: 'Banner', weight: 10, ok: !!bannerStep }
      ];
      const score = dims.reduce((sum, d) => sum + (d.ok ? d.weight : 0), 0);
      const hasInternalLinks = !!(blogStep || fbStep || bannerStep);
      step.qualityScore = { score, dims, hasInternalLinks };
      step.status = 'completed';

    } else if (step.tool === 'missing-info-report') {
      const pid = resolvedParams.productId;
      const prod = products.find(p => p.id === pid) || {};
      const imgCount = Array.isArray(prod.images) ? prod.images.length : 0;
      const missing = [];
      if (!imgCount) missing.push('Thiếu Ảnh sản phẩm (Missing Images) — Founder tự tải lên qua 📷 hoặc Thư viện ảnh.');
      else if (imgCount < 2) missing.push('Thiếu Gallery (Missing Gallery) — chỉ có 1 ảnh, cần thêm ảnh các góc khác.');
      if (!prod.youtubeUrl) missing.push('Thiếu Video YouTube (Missing Video).');
      missing.push('Thiếu file PDF hướng dẫn (Missing PDF) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
      missing.push('Thiếu Firmware (Missing Firmware) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
      missing.push('Thiếu Driver (Missing Driver) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
      if (!prod.warranty) missing.push('Thiếu thông tin Bảo hành (Missing Warranty).');
      if (!prod.sku) missing.push('Thiếu SKU.');
      const bgStepForMissing = allSteps.find(s => s.tool === 'smart-background' && s.status === 'completed');
      if (!bgStepForMissing) missing.push('Chưa xử lý Ảnh nền (Missing Background) — Founder tự kiểm tra qua "Xóa phông ảnh sản phẩm".');
      const catStep = allSteps.find(s => s.tool === 'detect-category');
      const hasCategory = !!(catStep && catStep.categoryResult && (catStep.categoryResult.autoAssigned || []).length) || (Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0);
      if (!hasCategory) missing.push('Chưa có Danh mục phù hợp — Founder tự gán qua Quản lý Sản phẩm.');
      step.missingInfo = missing;
      step.status = 'completed';

    } else if (group === GROUP_NAVIGATE) {
      if (step.tool === 'open-product') {
        const pid = resolvedParams.productId;
        if (!pid) throw new Error('Không xác định được sản phẩm cần mở.');
        step.productId = pid;
        step.deepLinkUrl = '/admin/products.html?edit=' + encodeURIComponent(pid);
        step.status = 'completed';
      } else if (step.tool === 'update-product-field') {
        const pid = resolvedParams.productId;
        const field = String(resolvedParams.field || '').toLowerCase();
        const value = resolvedParams.value;
        if (!pid) throw new Error('Không xác định được sản phẩm cần sửa.');
        if (!AGENT_FIELD_LABELS[field]) throw new Error('Field không hợp lệ: ' + field);
        if (value === undefined || value === null || value === '') throw new Error('Thiếu giá trị mới cần điền.');
        step.productId = pid;
        step.deepLinkUrl = '/admin/products.html?edit=' + encodeURIComponent(pid) + '&field=' + encodeURIComponent(field) + '&value=' + encodeURIComponent(value);
        step.status = 'completed';
      } else if (step.tool === 'open-draft') {
        const drafts = await listResource.getAll('aiDrafts');
        let candidates = drafts;
        if (resolvedParams.moduleId) candidates = candidates.filter(d => d.moduleId === resolvedParams.moduleId);
        const q = String(resolvedParams.query || '').trim().toLowerCase();
        if (q) candidates = candidates.filter(d => JSON.stringify(d.content || {}).toLowerCase().includes(q) || JSON.stringify(d.inputParams || {}).toLowerCase().includes(q));
        candidates = candidates.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const found = candidates[0];
        if (!found) throw new Error('Không tìm thấy Nháp phù hợp.');
        step.draftId = found.id;
        step.deepLinkUrl = '/admin/social-media-center.html?highlight=' + encodeURIComponent(found.id);
        step.status = 'completed';
      } else if (step.tool === 'navigate') {
        const page = NAV_PAGES[resolvedParams.page];
        if (!page) throw new Error('Không nhận diện được trang CMS: ' + resolvedParams.page);
        step.deepLinkUrl = page;
        step.status = 'completed';
      }

    } else if (step.tool === 'seo') {
      const idx = allSteps.indexOf(step);
      const prodStep = allSteps.slice(0, idx === -1 ? allSteps.length : idx).reverse().find(s => s.tool === 'product-description-writer');
      if (prodStep && prodStep.status === 'completed') {
        step.draftId = prodStep.draftId;
        step.status = 'completed';
      } else {
        step.status = 'failed';
        step.errorText = 'Cần bước Product AI hoàn tất trước (SEO dùng chung 1 lần generate với Product AI, không gọi AI riêng lần 2).';
      }

    } else if (group === GROUP_GENERIC_PLUGIN) {
      // Phase 5 — cùng hàm generateForModule() 4 route /v1/ai/{module}/
      // generate dùng (routes/aiGenerate.js), không viết lại logic sinh nội
      // dung riêng cho Founder Agent — 1 nguồn duy nhất.
      const draft = await generateForModule(step.tool, resolvedParams, ctx.uid, ctx.email);
      step.draftId = draft.id;
      step.status = 'completed';
      // Port nguyên văn hành vi tự nối Ảnh nền sản phẩm AI vừa vẽ vào ô "ẢNH
      // NỀN SẢN PHẨM" (js/admin-agent.js:1093-1098) — CHỈ khi Founder chọn
      // đúng loại ảnh "Product Background Image" + đã chọn đúng 1 Sản phẩm
      // thật, không tự suy đoán/ghi nhầm sản phẩm khác.
      if (step.tool === 'image-generator' && resolvedParams.imageType === 'Product Background Image' && resolvedParams.productId && draft.content && draft.content.imageUrl) {
        await listResource.update('products', resolvedParams.productId, { bgImage: draft.content.imageUrl });
        step.autoAppliedBgImage = { productId: resolvedParams.productId, imageUrl: draft.content.imageUrl };
      }

    } else {
      step.status = 'failed';
      step.errorText = 'Không nhận diện được tool: ' + step.tool;
    }
  } catch (err) {
    step.status = 'failed';
    step.errorText = err.message;
  }

  return step;
}

// undoLastStep — port js/admin-agent.js:1287-1355. Tìm bước Completed CUỐI
// CÙNG (quét ngược), rollback đúng theo loại tool, trả {ok, message?}.
async function undoLastStep(steps) {
  let idx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === 'completed') { idx = i; break; }
  }
  if (idx === -1) return { ok: false, message: 'Không có bước nào đã Hoàn tất để hoàn tác.' };
  const step = steps[idx];

  if (UNDOABLE_DRAFT_TOOLS.indexOf(step.tool) !== -1) {
    if (step.draftId) {
      await listResource.update('aiDrafts', step.draftId, { status: 'rejected' });
    }
    step.status = 'pending'; step.draftId = null; step.errorText = null;
    return { ok: true };
  }

  if (step.tool === 'detect-category') {
    if (step.categoryResult && step.categoryResult.autoAssigned && step._previousCategoryIds !== undefined) {
      const categories = await listResource.getAll('categories');
      const activeCats = categories.filter(c => c.active !== false);
      const prevIds = step._previousCategoryIds;
      const first = activeCats.find(c => c.code === prevIds[0]);
      await listResource.update('products', step.productId, { categoryIds: prevIds, category: prevIds[0] || '', categoryLabel: first ? first.label : '' });
    }
    step.status = 'pending'; step.categoryResult = null;
    return { ok: true };
  }

  if (step.tool === 'create-product') {
    const laterCompleted = steps.slice(idx + 1).some(s => s.status === 'completed');
    if (laterCompleted) return { ok: false, message: 'Không thể hoàn tác — đã có bước SAU đó hoàn tất (Danh mục/Draft/...). Hãy hoàn tác các bước sau trước, theo đúng thứ tự.' };
    await listResource.remove('products', step.productId);
    step.status = 'pending'; step.productId = null;
    return { ok: true };
  }

  if (step.tool === 'smart-background') {
    if (step.smartBackground && step.smartBackground.applied && step._previousImages !== undefined) {
      await listResource.update('products', step.productId, { images: step._previousImages, image: step._previousImage || '' });
    }
    step.status = 'pending'; step.smartBackground = null;
    return { ok: true };
  }

  // check-duplicate / related-products / quality-score / missing-info-report / điều hướng — không ghi dữ liệu thật.
  step.status = 'pending';
  return { ok: true };
}

module.exports = { resolveInputParams, executeStep, applyCategoryAssignment, undoLastStep };
