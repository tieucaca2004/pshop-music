/*
 * Social Media Publishing Center (Sprint 12) — 1 nơi DUY NHẤT quản lý toàn bộ
 * nội dung AI (Facebook/Banner/Blog/Product): xem, lọc, tìm kiếm, xem trước,
 * sửa, Publish/Lên lịch (Facebook), Nhân bản, Xóa, Lịch sử đăng bài.
 *
 * TÁI SỬ DỤNG TUYỆT ĐỐI — không viết lại bất kỳ phần nào đã có:
 *   - Draft System: đọc/ghi qua DraftDB (js/ai/ai-db.js) — cùng node
 *     `aiDrafts` mọi Plugin AI đã dùng, KHÔNG tạo Collection/node mới.
 *   - Publish Pipeline: Facebook → `AdminAI.publishVersionToFacebook()`
 *     (đăng thật qua Cloud Function facebookPublish); Banner/Blog/Product →
 *     `AdminAI.publishDraftById()` (gọi đúng `publishToTarget()` đã có, ghi
 *     đúng `banners`/`blogPosts`/`products`). KHÔNG viết lại logic ghi dữ
 *     liệu ở bất kỳ đâu trong file này.
 *   - Preview: `AdminAI.draftBodyHtml(draft)` — ĐÚNG html Facebook Preview/
 *     Banner Preview đã dùng ở admin/ai/drafts.html, không viết lại template.
 *   - Ảnh: `MediaLibraryPicker.mount()`/`mountMulti()` — ĐÚNG cách chọn ảnh
 *     Product/Blog/Banner đã dùng, không viết Media Picker mới.
 *
 * Post History KHÔNG cần bảng/collection mới — đọc lại ĐÚNG field đã có sẵn
 * trên chính Draft (`content.versions[].publishStatus/facebookPostId/
 * publishedAt/publishedBy/selectedPage/publishError` cho Facebook;
 * `status`/`publishedAt` cho Banner/Blog/Product).
 *
 * Schedule Publish (Facebook, V1) — CHỈ client-side: lưu `scheduledAt` +
 * `publishStatus:'scheduled'` ngay trên chính Draft (không bảng mới), 1
 * `setInterval` chạy khi trang này đang mở kiểm tra + tự Publish đúng lúc.
 * Đây là giới hạn V1 CÙNG BẢN CHẤT với `AIJobQueue` ("V1: xử lý phía trình
 * duyệt Admin... nâng cấp Cloud Functions ở V2 mà không cần đổi hàm
 * enqueue/resume/cancel") — không phải thiếu sót, là quyết định kiến trúc
 * nhất quán với tiền lệ đã có, để không tự ý thêm hạ tầng Cloud Scheduler
 * mới ngoài phạm vi "Reuse everything, Do NOT redesign".
 */
const AdminSocialCenter = (function () {
  const MODULE_LABELS = {
    'facebook-post-generator': 'Facebook',
    'banner-generator': 'Banner',
    'blog-writer': 'Blog',
    'product-description-writer': 'Product'
  };
  const RELEVANT_MODULES = Object.keys(MODULE_LABELS);

  let allDrafts = [];
  let allProducts = [];
  let editingDraftId = null;
  let currentView = 'list';
  let scheduleTimer = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : '';
  }

  // getYoutubeEmbedUrl — cùng pattern đã lặp lại ở js/category.js/
  // js/ai/modules/blog-writer.js/facebook-post-generator.js/
  // js/admin-products.js — Experience Layer riêng, không có 1 nguồn chung để
  // gọi lại (đã ghi nhận trong PROJECT_ARCHITECTURE.md).
  function getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  /* ================= Load dữ liệu (tái sử dụng DraftDB/DB đã có) ================= */

  function loadProducts() {
    return (typeof DB !== 'undefined' ? DB.getAll() : Promise.resolve([])).then(list => { allProducts = list; });
  }

  function loadDrafts() {
    return DraftDB.getAll().then(list => {
      allDrafts = list.filter(d => RELEVANT_MODULES.includes(d.moduleId));
      render();
    });
  }

  /* ================= Filter + Search ================= */

  function currentFilters() {
    return {
      platform: (document.getElementById('smcFilterPlatform') || {}).value || '',
      status: (document.getElementById('smcFilterStatus') || {}).value || '',
      dateFrom: (document.getElementById('smcFilterDateFrom') || {}).value || '',
      search: ((document.getElementById('smcSearch') || {}).value || '').trim().toLowerCase()
    };
  }

  function productNameFor(draft) {
    const pid = (draft.inputParams && draft.inputParams.productId) || draft.targetId;
    if (!pid) return '';
    const p = allProducts.find(x => x.id === pid);
    return p ? p.name : '';
  }

  function draftSearchText(draft) {
    const c = draft.content || {};
    const parts = [
      productNameFor(draft),
      c.name, c.title, c.subtitle, c.cta,
      Array.isArray(c.versions) ? c.versions.map(v => `${v.hook} ${v.caption} ${v.cta} ${(v.hashtags || []).join(' ')}`).join(' ') : '',
      Array.isArray(c.tags) ? c.tags.join(' ') : ''
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function filterDrafts(drafts, filters) {
    return drafts.filter(d => {
      if (filters.platform && d.moduleId !== filters.platform) return false;
      if (filters.status && d.status !== filters.status) return false;
      if (filters.dateFrom) {
        const fromTs = new Date(filters.dateFrom).getTime();
        if (!isNaN(fromTs) && (d.createdAt || 0) < fromTs) return false;
      }
      if (filters.search && !draftSearchText(d).includes(filters.search)) return false;
      return true;
    });
  }

  /* ================= Render Danh sách ================= */

  function renderCard(draft) {
    const isEditing = editingDraftId === draft.id;
    const label = MODULE_LABELS[draft.moduleId] || draft.moduleId;
    const statusLabel = draft.status === 'published' ? 'Đã publish' : draft.status === 'rejected' ? 'Đã từ chối' : 'Nháp';
    const bodyHtml = isEditing
      ? renderEditPanel(draft)
      : (typeof AdminAI !== 'undefined' && AdminAI.draftBodyHtml ? AdminAI.draftBodyHtml(draft) : '<p class="small-muted">Không xem trước được.</p>');

    const productName = productNameFor(draft);
    const actionsHtml = isEditing ? '' : renderActionBar(draft);

    return `
      <div class="panel" data-draft-id="${draft.id}" style="margin-bottom:1.2rem">
        <div class="toolbar-row">
          <h3 style="margin:0">${escapeHtml(label)}${productName ? ' — ' + escapeHtml(productName) : ''}</h3>
          <span class="small-muted">${escapeHtml(statusLabel)} · ${formatDate(draft.createdAt)}</span>
        </div>
        <div style="margin-top:0.8rem">${bodyHtml}</div>
        ${actionsHtml}
      </div>`;
  }

  function renderActionBar(draft) {
    const isFacebook = draft.moduleId === 'facebook-post-generator';
    const canPublish = draft.status === 'draft';
    return `
      <div class="admin-actions" style="margin-top:0.8rem;flex-wrap:wrap">
        <button type="button" class="btn-secondary" onclick="AdminSocialCenter.toggleEdit('${draft.id}')">✏️ Sửa</button>
        <button type="button" class="btn-secondary" onclick="AdminSocialCenter.duplicateDraft('${draft.id}')">⧉ Nhân bản</button>
        <button type="button" class="btn-danger" onclick="AdminSocialCenter.deleteDraft('${draft.id}')">🗑 Xóa</button>
        ${(!isFacebook && canPublish) ? `<button type="button" class="submit-btn" onclick="AdminSocialCenter.publishNow('${draft.id}')">📤 Publish Now</button>` : ''}
        ${(!isFacebook && canPublish) ? `<button type="button" class="btn-secondary" onclick="AdminSocialCenter.rejectDraftAction('${draft.id}')">TỪ CHỐI</button>` : ''}
      </div>
      ${isFacebook && canPublish ? renderFacebookScheduleBar(draft) : ''}`;
  }

  // renderFacebookScheduleBar — "Schedule Publish" chỉ áp dụng Facebook (đúng
  // phạm vi "For now, implement only Facebook"). "Publish Now" cho Facebook
  // ĐÃ có sẵn NGAY TRONG phần Preview tái sử dụng (draftBodyHtml ->
  // versionCardHtml đã có nút "Đăng lên Facebook" mỗi phiên bản) — không tạo
  // nút Publish Now trùng lặp ở đây.
  function renderFacebookScheduleBar(draft) {
    const versions = (draft.content && draft.content.versions) || [];
    return `<div class="panel" style="margin-top:0.8rem;background:var(--bg-alt)">
      <p class="small-muted" style="margin-bottom:0.5rem">🕒 Lên lịch đăng (chỉ hoạt động khi trang này đang mở trong trình duyệt — xem PROJECT_ARCHITECTURE.md).</p>
      ${versions.map(v => `
        <div class="admin-actions" style="margin:0 0 0.5rem;align-items:center">
          <span class="small-muted">Phiên bản ${escapeHtml(v.label)}${v.scheduledAt ? ` — đã lên lịch ${formatDate(v.scheduledAt)}` : ''}</span>
          <input type="datetime-local" id="scheduleInput-${draft.id}-${escapeHtml(v.label)}">
          <button type="button" class="btn-secondary" onclick="AdminSocialCenter.schedulePublish('${draft.id}','${escapeHtml(v.label)}')">Lên lịch</button>
        </div>`).join('')}
    </div>`;
  }

  function render() {
    if (currentView === 'history') { renderHistory(); return; }
    const filters = currentFilters();
    const filtered = filterDrafts(allDrafts, filters).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const totalEl = document.getElementById('smcTotal');
    if (totalEl) totalEl.textContent = filtered.length;
    const list = document.getElementById('smcList');
    if (!list) return;
    list.innerHTML = filtered.length ? filtered.map(renderCard).join('') : '<p class="small-muted">Không có nội dung nào khớp bộ lọc.</p>';
    if (editingDraftId && filtered.some(d => d.id === editingDraftId)) mountEditPanel(editingDraftId);
  }

  /* ================= Post History (đọc lại field đã có sẵn, không bảng mới) ================= */

  function renderHistory() {
    const rows = [];
    allDrafts.forEach(d => {
      if (d.moduleId === 'facebook-post-generator') {
        (d.content.versions || []).forEach(v => {
          if (v.publishStatus === 'published' || v.publishStatus === 'failed') {
            rows.push({
              platform: 'Facebook', destination: v.selectedPage || '(không rõ)',
              status: v.publishStatus, publishedAt: v.publishedAt || 0,
              postId: v.facebookPostId || '', error: v.publishError || ''
            });
          }
        });
      } else if (d.status === 'published') {
        rows.push({
          platform: MODULE_LABELS[d.moduleId] || d.moduleId, destination: '—',
          status: 'published', publishedAt: d.publishedAt || 0, postId: '—', error: ''
        });
      }
    });
    rows.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    const body = document.getElementById('smcHistoryBody');
    if (!body) return;
    body.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(r.platform)}</td>
        <td>${escapeHtml(r.destination)}</td>
        <td>${r.status === 'failed' ? '<span style="color:#b3261e">Thất bại</span>' : '✅ Đã đăng'}</td>
        <td>${formatDate(r.publishedAt)}</td>
        <td><code>${escapeHtml(r.postId)}</code></td>
        <td>${escapeHtml(r.error)}</td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted2);padding:2rem">Chưa có lịch sử đăng bài nào.</td></tr>';
  }

  function switchView(view) {
    currentView = view;
    document.getElementById('smcListView').style.display = view === 'list' ? 'block' : 'none';
    document.getElementById('smcHistoryView').style.display = view === 'history' ? 'block' : 'none';
    render();
  }

  /* ================= Edit Panel (mới — không có sẵn ở drafts.html) ================= */

  function toggleEdit(draftId) {
    editingDraftId = editingDraftId === draftId ? null : draftId;
    render();
  }

  function cancelEdit() {
    editingDraftId = null;
    render();
  }

  function renderEditPanel(draft) {
    const c = draft.content || {};
    const id = draft.id;
    if (draft.moduleId === 'facebook-post-generator') {
      const versions = Array.isArray(c.versions) ? c.versions : [];
      return `<div class="panel">
        <h4 style="margin-top:0">Chỉnh sửa</h4>
        ${versions.map((v, i) => `
          <div style="margin-bottom:1rem;padding-bottom:0.8rem;border-bottom:1px solid var(--border2,#333)">
            <p class="small-muted"><strong>Phiên bản ${escapeHtml(v.label)}</strong></p>
            <div class="form-group full"><label>Hook</label><input type="text" id="editHook-${id}-${i}" value="${escapeHtml(v.hook || '')}"></div>
            <div class="form-group full"><label>Caption</label><textarea id="editCaption-${id}-${i}" rows="3">${escapeHtml(v.caption || '')}</textarea></div>
            <div class="form-group full"><label>CTA</label><input type="text" id="editCta-${id}-${i}" value="${escapeHtml(v.cta || '')}"></div>
            <div class="form-group full"><label>Hashtags (phân tách bằng dấu phẩy)</label><input type="text" id="editHashtags-${id}-${i}" value="${escapeHtml((v.hashtags || []).join(', '))}"></div>
          </div>`).join('')}
        <div class="form-group full"><label>Link YouTube (dán link mới để thay Video, để trống để bỏ Video)</label><input type="text" id="editYoutube-${id}" value="${escapeHtml(c.youtubeEmbedUrl || '')}"></div>
        <div class="form-group full"><label>Ảnh đại diện</label><textarea id="editFeaturedInput-${id}" style="display:none">${escapeHtml(c.featuredImage || '')}</textarea><div id="editFeaturedBox-${id}"></div></div>
        <div class="form-group full"><label>Ảnh Gallery (Thêm/Bỏ ảnh)</label><textarea id="editGalleryInput-${id}" style="display:none">${(c.galleryImages || []).join('\n')}</textarea><div id="editGalleryBox-${id}"></div></div>
        ${renderSaveCancel(id)}
      </div>`;
    }
    if (draft.moduleId === 'banner-generator') {
      return `<div class="panel">
        <h4 style="margin-top:0">Chỉnh sửa Banner</h4>
        <div class="form-group full"><label>Tiêu đề</label><input type="text" id="editTitle-${id}" value="${escapeHtml(c.title || '')}"></div>
        <div class="form-group full"><label>Phụ đề</label><input type="text" id="editSubtitle-${id}" value="${escapeHtml(c.subtitle || '')}"></div>
        <div class="form-group full"><label>CTA</label><input type="text" id="editCta-${id}" value="${escapeHtml(c.cta || '')}"></div>
        <div class="form-group full"><label>Ảnh Banner</label><textarea id="editFeaturedInput-${id}" style="display:none">${escapeHtml(c.image || '')}</textarea><div id="editFeaturedBox-${id}"></div></div>
        ${renderSaveCancel(id)}
      </div>`;
    }
    if (draft.moduleId === 'blog-writer') {
      return `<div class="panel">
        <h4 style="margin-top:0">Chỉnh sửa Blog</h4>
        <div class="form-group full"><label>Tiêu đề</label><input type="text" id="editTitle-${id}" value="${escapeHtml(c.title || '')}"></div>
        <div class="form-group full"><label>Đoạn trích</label><textarea id="editExcerpt-${id}" rows="3">${escapeHtml(c.excerpt || '')}</textarea></div>
        <div class="form-group full"><label>Ảnh Cover</label><textarea id="editFeaturedInput-${id}" style="display:none">${escapeHtml(c.coverImage || '')}</textarea><div id="editFeaturedBox-${id}"></div></div>
        ${renderSaveCancel(id)}
      </div>`;
    }
    if (draft.moduleId === 'product-description-writer') {
      return `<div class="panel">
        <h4 style="margin-top:0">Chỉnh sửa Product</h4>
        <div class="form-group full"><label>Tên</label><input type="text" id="editTitle-${id}" value="${escapeHtml(c.name || '')}"></div>
        <div class="form-group full"><label>Mô tả ngắn</label><textarea id="editExcerpt-${id}" rows="2">${escapeHtml(c.shortDescription || '')}</textarea></div>
        <div class="form-group full"><label>Tags (phân tách bằng dấu phẩy)</label><input type="text" id="editTags-${id}" value="${escapeHtml((c.tags || []).join(', '))}"></div>
        ${renderSaveCancel(id)}
      </div>`;
    }
    return '<p class="small-muted">Không có trình chỉnh sửa cho loại nội dung này.</p>';
  }

  function renderSaveCancel(id) {
    return `<div class="admin-actions">
      <button type="button" class="submit-btn" onclick="AdminSocialCenter.saveEdit('${id}')">LƯU</button>
      <button type="button" class="btn-secondary" onclick="AdminSocialCenter.cancelEdit()">HỦY</button>
    </div>`;
  }

  // mountEditPanel — gắn MediaLibraryPicker (tái sử dụng NGUYÊN VẸN, không
  // viết Media Picker mới) vào đúng ô ảnh vừa render — PHẢI gọi SAU khi
  // innerHTML đã chèn vào DOM (đúng thứ tự mount() yêu cầu, giống mọi trang
  // Product/Blog/Banner khác).
  function mountEditPanel(draftId) {
    if (document.getElementById('editFeaturedInput-' + draftId)) {
      MediaLibraryPicker.mount('editFeaturedInput-' + draftId, 'editFeaturedBox-' + draftId);
    }
    if (document.getElementById('editGalleryInput-' + draftId)) {
      MediaLibraryPicker.mountMulti('editGalleryInput-' + draftId, 'editGalleryBox-' + draftId);
    }
  }

  function saveEdit(draftId) {
    const draft = allDrafts.find(d => d.id === draftId);
    if (!draft) return;
    const c = draft.content || {};
    let newContent = Object.assign({}, c);

    if (draft.moduleId === 'facebook-post-generator') {
      const versions = (c.versions || []).map((v, i) => ({
        ...v,
        hook: (document.getElementById(`editHook-${draftId}-${i}`) || {}).value || '',
        caption: (document.getElementById(`editCaption-${draftId}-${i}`) || {}).value || '',
        cta: (document.getElementById(`editCta-${draftId}-${i}`) || {}).value || '',
        hashtags: ((document.getElementById(`editHashtags-${draftId}-${i}`) || {}).value || '').split(',').map(s => s.trim()).filter(Boolean)
      }));
      const youtubeInput = (document.getElementById('editYoutube-' + draftId) || {}).value || '';
      const featuredInput = (document.getElementById('editFeaturedInput-' + draftId) || {}).value || '';
      const galleryInput = (document.getElementById('editGalleryInput-' + draftId) || {}).value || '';
      newContent = Object.assign({}, newContent, {
        versions,
        youtubeEmbedUrl: getYoutubeEmbedUrl(youtubeInput),
        featuredImage: featuredInput,
        galleryImages: galleryInput.split(/[\n,;]/).map(s => s.trim()).filter(Boolean)
      });
    } else if (draft.moduleId === 'banner-generator') {
      newContent = Object.assign({}, newContent, {
        title: (document.getElementById('editTitle-' + draftId) || {}).value || '',
        subtitle: (document.getElementById('editSubtitle-' + draftId) || {}).value || '',
        cta: (document.getElementById('editCta-' + draftId) || {}).value || '',
        image: (document.getElementById('editFeaturedInput-' + draftId) || {}).value || ''
      });
    } else if (draft.moduleId === 'blog-writer') {
      newContent = Object.assign({}, newContent, {
        title: (document.getElementById('editTitle-' + draftId) || {}).value || '',
        excerpt: (document.getElementById('editExcerpt-' + draftId) || {}).value || '',
        coverImage: (document.getElementById('editFeaturedInput-' + draftId) || {}).value || ''
      });
    } else if (draft.moduleId === 'product-description-writer') {
      newContent = Object.assign({}, newContent, {
        name: (document.getElementById('editTitle-' + draftId) || {}).value || '',
        shortDescription: (document.getElementById('editExcerpt-' + draftId) || {}).value || '',
        tags: ((document.getElementById('editTags-' + draftId) || {}).value || '').split(',').map(s => s.trim()).filter(Boolean)
      });
    }

    DraftDB.update(draftId, { content: newContent }).then(() => {
      editingDraftId = null;
      loadDrafts();
    });
  }

  /* ================= Duplicate / Delete / Publish / Reject (tái sử dụng DraftDB/AdminAI) ================= */

  function duplicateDraft(draftId) {
    const draft = allDrafts.find(d => d.id === draftId);
    if (!draft) return;
    if (!confirm('Nhân bản nội dung này thành 1 Nháp mới?')) return;
    DraftDB.add({
      moduleId: draft.moduleId,
      targetCollection: draft.targetCollection,
      targetId: draft.targetId,
      inputParams: draft.inputParams,
      content: JSON.parse(JSON.stringify(draft.content)),
      status: 'draft',
      providerUsed: draft.providerUsed,
      createdBy: draft.createdBy
    }).then(loadDrafts);
  }

  function deleteDraft(draftId) {
    if (!confirm('Xóa nội dung này? Không thể hoàn tác.')) return;
    DraftDB.remove(draftId).then(loadDrafts);
  }

  // publishNow — Banner/Blog/Product tái sử dụng publishDraftById() (gọi
  // đúng publishToTarget() có sẵn, KHÔNG viết lại Publish Pipeline). Facebook
  // KHÔNG dùng hàm này — nút Publish của Facebook đã có sẵn trong chính
  // Preview tái sử dụng (versionCardHtml → publishVersionToFacebook()).
  function publishNow(draftId) {
    AdminAI.publishDraftById(draftId).then(loadDrafts).catch(err => alert('Lỗi khi Publish: ' + err.message));
  }

  function rejectDraftAction(draftId) {
    if (!confirm('Từ chối nội dung này? Vẫn giữ lại để tra cứu, không xóa.')) return;
    AdminAI.rejectDraftById(draftId).then(loadDrafts);
  }

  /* ================= Schedule Publish (Facebook, V1 — client-side) ================= */

  function schedulePublish(draftId, versionLabel) {
    const input = document.getElementById(`scheduleInput-${draftId}-${versionLabel}`);
    if (!input || !input.value) { alert('Vui lòng chọn thời gian đăng.'); return; }
    const when = new Date(input.value).getTime();
    if (isNaN(when) || when <= Date.now()) { alert('Thời gian phải ở tương lai.'); return; }
    DraftDB.get(draftId).then(draft => {
      if (!draft || !Array.isArray(draft.content.versions)) return;
      const versions = draft.content.versions.slice();
      const idx = versions.findIndex(v => v.label === versionLabel);
      if (idx === -1) return;
      versions[idx] = Object.assign({}, versions[idx], { scheduledAt: when, publishStatus: 'scheduled' });
      return DraftDB.update(draftId, { content: Object.assign({}, draft.content, { versions }) });
    }).then(() => {
      alert('Đã lên lịch đăng lúc ' + new Date(when).toLocaleString('vi-VN') + '. Chỉ tự động đăng khi trang Social Media Center đang mở trong trình duyệt.');
      loadDrafts();
    });
  }

  // checkScheduled — quét mọi Draft Facebook còn ở trạng thái Nháp, tìm phiên
  // bản có `scheduledAt` đã tới hạn (`publishStatus === 'scheduled'`), tự gọi
  // publishVersionToFacebook() ĐÃ CÓ SẴN — KHÔNG viết lại logic đăng bài.
  function checkScheduled() {
    DraftDB.getAll().then(list => {
      list.filter(d => d.moduleId === 'facebook-post-generator' && d.status === 'draft').forEach(draft => {
        (draft.content.versions || []).forEach(v => {
          if (v.publishStatus === 'scheduled' && v.scheduledAt && Date.now() >= v.scheduledAt) {
            AdminAI.publishVersionToFacebook(draft.id, v.label);
          }
        });
      });
    });
  }

  function startScheduleChecker() {
    if (scheduleTimer) return;
    checkScheduled();
    scheduleTimer = setInterval(checkScheduled, 60000);
  }

  function init() {
    Promise.all([loadProducts(), loadDrafts()]);

    const platformSel = document.getElementById('smcFilterPlatform');
    const statusSel = document.getElementById('smcFilterStatus');
    const dateInput = document.getElementById('smcFilterDateFrom');
    const searchInput = document.getElementById('smcSearch');
    if (platformSel) platformSel.addEventListener('change', render);
    if (statusSel) statusSel.addEventListener('change', render);
    if (dateInput) dateInput.addEventListener('change', render);
    if (searchInput) searchInput.addEventListener('input', render);

    const tabList = document.getElementById('smcTabList');
    const tabHistory = document.getElementById('smcTabHistory');
    if (tabList) tabList.addEventListener('click', () => switchView('list'));
    if (tabHistory) tabHistory.addEventListener('click', () => switchView('history'));

    startScheduleChecker();
  }

  return {
    init, toggleEdit, cancelEdit, saveEdit,
    duplicateDraft, deleteDraft, publishNow, rejectDraftAction, schedulePublish
  };
})();
