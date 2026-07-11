/*
 * Image AI Studio (Sprint 12 Requirement #11) — trang riêng
 * (admin/ai/images.html), tái sử dụng NGUYÊN VẸN PermissionService →
 * PluginManager → AIJobQueue → Draft (đúng luồng js/admin-ai.js/
 * js/admin-products-ai-assist.js đã dùng) cho Plugin `image-generator` duy
 * nhất — không tạo Queue/Provider/Draft System mới.
 *
 * Khác các Plugin văn bản: ảnh không có 1 đích Publish cố định — Founder có
 * thể dùng cùng 1 ảnh cho nhiều nơi (Product Gallery/Featured/Blog Cover/
 * Banner...). Vì vậy KHÔNG dùng `AdminAI.publishDraftById()` (chỉ biết ghi
 * đúng 1 targetCollection cố định) — các hành động "Save to..." bên dưới tự
 * gọi thẳng DB/BlogDB/BannerDB (tái sử dụng Product Management/Blog/Banner
 * data layer đã có, KHÔNG viết lại logic ghi dữ liệu) và LUÔN CỘNG THÊM
 * (không xóa/ghi đè ảnh đang có) — đúng RULES "Do NOT overwrite existing
 * images automatically". Draft KHÔNG bị xóa/đánh dấu published sau khi dùng
 * — chỉ ghi lại `usedIn` để Founder biết ảnh đã dùng ở đâu, vẫn có thể dùng
 * tiếp cho việc khác cho tới khi tự bấm Xóa.
 */
const AdminImageAI = (function () {
  const MODULE_ID = 'image-generator';
  let pollTimer = null;
  let activeJobId = null;
  let allProducts = [];
  let allBlogPosts = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : '';
  }

  function box() { return document.getElementById('imgStatusBox'); }

  function showMessage(msg) {
    const b = box();
    if (!b) return;
    b.style.display = 'block';
    b.innerHTML = `<div class="panel"><p class="small-muted">${escapeHtml(msg)}</p></div>`;
  }

  /* ================= Load Product/Blog options (form + picker trong từng card) ================= */

  function loadProductOptions() {
    return DB.getAll().then(list => {
      allProducts = list;
      const select = document.getElementById('imgProduct');
      if (select) select.innerHTML = '<option value="">(không chọn)</option>' + list.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    });
  }

  function loadBlogOptions() {
    return BlogDB.getAll().then(list => {
      allBlogPosts = list;
      const select = document.getElementById('imgBlogPost');
      if (select) select.innerHTML = '<option value="">(không chọn)</option>' + list.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('');
    });
  }

  function productPickerOptionsHtml() {
    return '<option value="">(chọn sản phẩm)</option>' + allProducts.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  }

  function blogPickerOptionsHtml() {
    return '<option value="">(chọn bài Blog)</option>' + allBlogPosts.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('');
  }

  /* ================= Sinh ảnh (form "TẠO ẢNH" + "Tạo lại") ================= */

  function buildInputParamsFromForm() {
    return {
      imageType: document.getElementById('imgType').value,
      productId: document.getElementById('imgProduct').value || '',
      promotion: document.getElementById('imgPromotion').value.trim(),
      blogPostId: document.getElementById('imgBlogPost').value || '',
      customPrompt: document.getElementById('imgCustomPrompt').value.trim(),
      size: document.getElementById('imgSize').value
    };
  }

  function renderInProgress(job) {
    showMessage('');
    const b = box();
    b.innerHTML = `<div class="panel">
      <p class="small-muted">Đang tạo ảnh (${job.status === 'running' ? 'đang chạy' : 'đang chờ trong hàng đợi'})...</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="imgCancelBtn">HỦY</button>
      </div>
    </div>`;
    document.getElementById('imgCancelBtn').addEventListener('click', () => cancelJob(job.id));
  }

  function renderFailed(job, item) {
    const b = box();
    b.style.display = 'block';
    const errorMsg = (item && item.error) || 'Tạo ảnh thất bại.';
    b.innerHTML = `<div class="panel">
      <p class="small-muted" style="color:#b3261e">Lỗi: ${escapeHtml(errorMsg)}</p>
      <div class="admin-actions" style="margin-top:0.6rem">
        <button type="button" class="btn-secondary" id="imgRetryBtn">THỬ LẠI</button>
      </div>
    </div>`;
    document.getElementById('imgRetryBtn').addEventListener('click', () => retryJob(job.id));
  }

  function retryJob(jobId) {
    showMessage('Đang thử lại...');
    const user = AdminAuth.getUser();
    AIJobQueue.retryFailed(jobId).then(() => AIJobQueue.resume(user.uid, user.email)).then(() => {
      activeJobId = jobId;
      pollJob();
      startPolling();
    });
  }

  function cancelJob(jobId) {
    const user = AdminAuth.getUser();
    AIJobQueue.cancel(jobId, user.uid, user.email).then(() => {
      stopPolling();
      showMessage('Đã hủy yêu cầu tạo ảnh.');
    });
  }

  function pollJob() {
    if (!activeJobId) return;
    const jobId = activeJobId;
    JobDB.get(jobId).then(job => {
      if (!job) return;
      if (job.status === 'queued' || job.status === 'running') {
        renderInProgress(job);
        return;
      }
      stopPolling();
      const item = job.items && job.items[0];
      if (job.status === 'completed' && item && item.status === 'completed' && item.resultDraftId) {
        showMessage('Đã tạo ảnh xong — xem bên dưới. Ảnh vẫn ở dạng Nháp, chưa dùng vào đâu cả.');
        loadImageDrafts();
        return;
      }
      if (job.status === 'cancelled') { showMessage('Đã hủy yêu cầu tạo ảnh.'); return; }
      renderFailed(job, item);
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollJob, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function runGeneration(inputParams) {
    const user = AdminAuth.getUser();
    showMessage('Đang gửi yêu cầu tạo ảnh...');
    PermissionService.checkPluginExecution(user.uid, user.email, MODULE_ID).then(check => {
      if (!check.granted) {
        showMessage(`Không có quyền tạo ảnh (thiếu "${check.permission || 'quyền chưa được gán'}").`);
        return;
      }
      return PluginManager.loadPlugins().then(() => PluginManager.loadPlugin(MODULE_ID)).then(plugin => {
        if (!plugin) { showMessage('Không tìm thấy Plugin "Image AI" — vào Plugin Manager để bật.'); return; }
        return plugin.execute([inputParams], user.uid, user.email).then(job => {
          activeJobId = job.id;
          return AIJobQueue.resume(user.uid, user.email);
        }).then(() => { pollJob(); startPolling(); });
      });
    }).catch(err => showMessage('Lỗi: ' + err.message));
  }

  function generate() {
    runGeneration(buildInputParamsFromForm());
  }

  function regenerate(draftId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      runGeneration(d.inputParams);
    });
  }

  /* ================= Founder Actions — luôn CỘNG THÊM, không ghi đè/xóa ảnh đang có ================= */

  function appendUsedIn(draftId, label) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const usedIn = Array.isArray(d.content.usedIn) ? d.content.usedIn.slice() : [];
      usedIn.push(label);
      return DraftDB.update(draftId, { content: Object.assign({}, d.content, { usedIn }) });
    });
  }

  function saveToProductGallery(draftId, explicitProductId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const productId = explicitProductId || d.content.sourceProductId;
      if (!productId) { showMessage('Vui lòng chọn 1 sản phẩm trước khi thêm vào Gallery.'); return; }
      return DB.get(productId).then(p => {
        if (!p) { showMessage('Không tìm thấy sản phẩm.'); return; }
        const images = Array.isArray(p.images) && p.images.length ? p.images.slice() : (p.image ? [p.image] : []);
        if (images.indexOf(d.content.imageUrl) === -1) images.push(d.content.imageUrl);
        return DB.update(productId, { images, image: p.image || images[0] || '' }).then(() => {
          return appendUsedIn(draftId, 'Product Gallery: ' + (p.name || productId)).then(() => {
            showMessage(`Đã thêm ảnh vào Gallery của "${p.name}".`);
            return loadImageDrafts();
          });
        });
      });
    });
  }

  // saveAsFeatured — đưa ảnh mới lên ĐẦU mảng images (đúng quy ước có sẵn
  // "ảnh đầu = ảnh đại diện", data.image = images[0], xem js/admin-products.js)
  // — KHÔNG xóa ảnh cũ, chỉ đổi thứ tự + set `image`.
  function saveAsFeatured(draftId, explicitProductId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const productId = explicitProductId || d.content.sourceProductId;
      if (!productId) { showMessage('Vui lòng chọn 1 sản phẩm trước khi đặt Ảnh đại diện.'); return; }
      return DB.get(productId).then(p => {
        if (!p) { showMessage('Không tìm thấy sản phẩm.'); return; }
        const existing = Array.isArray(p.images) && p.images.length ? p.images.slice() : (p.image ? [p.image] : []);
        const rest = existing.filter(u => u !== d.content.imageUrl);
        const images = [d.content.imageUrl].concat(rest);
        return DB.update(productId, { images, image: d.content.imageUrl }).then(() => {
          return appendUsedIn(draftId, 'Featured Image: ' + (p.name || productId)).then(() => {
            showMessage(`Đã đặt làm Ảnh đại diện cho "${p.name}".`);
            return loadImageDrafts();
          });
        });
      });
    });
  }

  function saveToBlogCover(draftId, explicitBlogPostId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const blogPostId = explicitBlogPostId || d.content.sourceBlogPostId;
      if (!blogPostId) { showMessage('Vui lòng chọn 1 bài Blog trước khi đặt Cover.'); return; }
      return BlogDB.get(blogPostId).then(post => {
        if (!post) { showMessage('Không tìm thấy bài Blog.'); return; }
        return BlogDB.update(blogPostId, { coverImage: d.content.imageUrl }).then(() => {
          return appendUsedIn(draftId, 'Blog Cover: ' + (post.title || blogPostId)).then(() => {
            showMessage(`Đã đặt làm Cover cho bài "${post.title}".`);
            return loadImageDrafts();
          });
        });
      });
    });
  }

  function insertIntoBlog(draftId, explicitBlogPostId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const blogPostId = explicitBlogPostId || d.content.sourceBlogPostId;
      if (!blogPostId) { showMessage('Vui lòng chọn 1 bài Blog trước khi chèn ảnh.'); return; }
      return BlogDB.get(blogPostId).then(post => {
        if (!post) { showMessage('Không tìm thấy bài Blog.'); return; }
        const imgTag = `<img src="${escapeHtml(d.content.imageUrl)}" alt="" class="blog-inline-image">`;
        const contentHtml = (post.contentHtml || '') + '\n' + imgTag;
        return BlogDB.update(blogPostId, { contentHtml }).then(() => {
          return appendUsedIn(draftId, 'Chèn vào bài Blog: ' + (post.title || blogPostId)).then(() => {
            showMessage(`Đã chèn ảnh vào bài "${post.title}".`);
            return loadImageDrafts();
          });
        });
      });
    });
  }

  // saveAsBanner — luôn tạo Banner MỚI (không có Banner nào để "ghi đè" —
  // đúng "Do NOT overwrite existing images automatically"). Title/CTA/Link để
  // trống, Founder tự hoàn thiện trong Banner Manager sau.
  function saveAsBanner(draftId) {
    return DraftDB.get(draftId).then(d => {
      if (!d) return;
      const c = d.content;
      return BannerDB.add({
        image: c.imageUrl,
        title: c.sourceProductName || '',
        subtitle: '', cta: '', link: '',
        zone: 'home-top', order: 0, active: true
      }).then(() => {
        return appendUsedIn(draftId, 'Banner mới').then(() => {
          showMessage('Đã tạo Banner mới — vào Banner Manager để hoàn thiện Tiêu đề/CTA/Link.');
          return loadImageDrafts();
        });
      });
    });
  }

  function deleteDraft(draftId) {
    if (!confirm('Xóa ảnh này? Không thể hoàn tác.')) return;
    return DraftDB.remove(draftId).then(loadImageDrafts);
  }

  /* ================= Render lưới ảnh đã tạo ================= */

  function renderCard(d) {
    const c = d.content || {};
    const hasProduct = !!c.sourceProductId;
    const hasBlog = !!c.sourceBlogPostId;
    const usedInHtml = (c.usedIn || []).map(u => `<span class="small-muted" style="display:inline-block;background:var(--bg-alt);padding:0.15rem 0.5rem;border-radius:4px;margin:0.2rem 0.3rem 0 0">✅ ${escapeHtml(u)}</span>`).join('');

    const productActionsHtml = hasProduct
      ? `<div class="admin-actions" style="flex-wrap:wrap;margin:0">
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveToProductGallery('${d.id}')">➕ Vào Gallery Sản phẩm</button>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveAsFeatured('${d.id}')">★ Đặt làm Ảnh đại diện</button>
        </div>`
      : `<div class="admin-actions" style="flex-wrap:wrap;margin:0;align-items:center">
          <select id="pick-product-${d.id}" style="max-width:170px">${productPickerOptionsHtml()}</select>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveToProductGallery('${d.id}', document.getElementById('pick-product-${d.id}').value)">➕ Vào Gallery</button>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveAsFeatured('${d.id}', document.getElementById('pick-product-${d.id}').value)">★ Featured</button>
        </div>`;

    const blogActionsHtml = hasBlog
      ? `<div class="admin-actions" style="flex-wrap:wrap;margin:0">
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveToBlogCover('${d.id}')">📝 Làm Cover Blog</button>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.insertIntoBlog('${d.id}')">➕ Chèn vào bài Blog</button>
        </div>`
      : `<div class="admin-actions" style="flex-wrap:wrap;margin:0;align-items:center">
          <select id="pick-blog-${d.id}" style="max-width:170px">${blogPickerOptionsHtml()}</select>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveToBlogCover('${d.id}', document.getElementById('pick-blog-${d.id}').value)">📝 Cover</button>
          <button type="button" class="btn-secondary" onclick="AdminImageAI.insertIntoBlog('${d.id}', document.getElementById('pick-blog-${d.id}').value)">➕ Chèn vào bài</button>
        </div>`;

    return `
      <div class="panel" data-draft-id="${d.id}" style="display:flex;flex-direction:column;gap:0.5rem">
        <img src="${escapeHtml(c.imageUrl)}" style="width:100%;border-radius:8px;aspect-ratio:1/1;object-fit:cover;background:var(--bg-alt)" onerror="this.style.opacity='0.3'" alt="">
        <p class="small-muted" style="margin:0"><strong>${escapeHtml(c.imageType || '')}</strong> · ${escapeHtml(c.size || '')} · ${formatDate(d.createdAt)} · ${escapeHtml(d.providerUsed || '—')}</p>
        <details><summary class="small-muted" style="cursor:pointer">Xem Prompt</summary><p class="small-muted" style="white-space:pre-wrap">${escapeHtml(c.prompt || '')}</p></details>
        ${usedInHtml ? `<div>${usedInHtml}</div>` : ''}
        <div class="admin-actions" style="flex-wrap:wrap;margin:0">
          <button type="button" class="btn-secondary" onclick="AdminImageAI.regenerate('${d.id}')">🔄 Tạo lại</button>
          <a class="btn-secondary" href="${escapeHtml(c.imageUrl)}" download target="_blank" rel="noopener">⬇ Tải xuống</a>
          <button type="button" class="btn-danger" onclick="AdminImageAI.deleteDraft('${d.id}')">🗑 Xóa</button>
        </div>
        ${productActionsHtml}
        ${blogActionsHtml}
        <div class="admin-actions" style="flex-wrap:wrap;margin:0">
          <button type="button" class="btn-secondary" onclick="AdminImageAI.saveAsBanner('${d.id}')">🖼 Dùng làm Banner</button>
        </div>
      </div>`;
  }

  function loadImageDrafts() {
    return DraftDB.getAll().then(list => {
      const drafts = list
        .filter(d => d.moduleId === MODULE_ID && d.status !== 'rejected')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const totalEl = document.getElementById('imgDraftTotal');
      if (totalEl) totalEl.textContent = drafts.length;
      const grid = document.getElementById('imgDraftsGrid');
      if (!grid) return;
      grid.innerHTML = drafts.length
        ? drafts.map(renderCard).join('')
        : '<p class="small-muted">Chưa có ảnh nào — dùng form phía trên để tạo ảnh đầu tiên.</p>';
    });
  }

  function init() {
    AdminAuth.init({ page: 'ai', title: 'IMAGE AI' }).then(() => {
      loadProductOptions();
      loadBlogOptions();
      loadImageDrafts();
    });
    const btn = document.getElementById('imgGenerateBtn');
    if (btn) btn.addEventListener('click', generate);
  }

  return {
    init, regenerate, deleteDraft,
    saveToProductGallery, saveAsFeatured, saveToBlogCover, insertIntoBlog, saveAsBanner
  };
})();
