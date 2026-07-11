/*
 * Logic dùng chung cho 4 trang admin/ai/{index,drafts,jobs,logs}.html.
 * Mỗi trang gọi đúng 1 hàm init tương ứng (AdminAI.initDashboard/initDrafts/
 * initJobs/initLogs). Publish chỉ gọi các hàm data layer đã có sẵn (BlogDB,
 * DB, BannerDB, SiteContentDB) — không viết logic ghi dữ liệu mới.
 */
const AdminAI = (function () {
  let drafts = [];
  let jobs = [];
  let logs = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Sprint 12 Requirement #3 (Media Content Rendering) — OpenAI đôi khi tự bọc
  // cả phản hồi trong 1 khối code markdown (```html ... ```) dù Prompt không
  // yêu cầu, và/hoặc đặt tiêu đề trong thẻ <h1> ở dòng sau thay vì dòng đầu
  // dạng chữ thường như module.buildPrompt() đã yêu cầu — khiến
  // mapToDraftContent() (js/ai/modules/blog-writer.js, faq-generator.js) tách
  // nhầm dòng khối code fence (vd "```html") thành title. Sanitize CHỈ áp
  // dụng cho bản ghi sắp ghi vào collection thật (products/blogPosts) — không
  // sửa draft.content gốc trong aiDrafts (không đổi Draft System).
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

  // Khôi phục tiêu đề thật từ thẻ <h1> nếu title bị tách nhầm thành fence rác
  // — nơi AI đã vô tình đặt tiêu đề vào (xem comment stripCodeFence ở trên).
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

  function formatDate(ts) {
    return ts ? new Date(ts).toLocaleString('vi-VN') : '';
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

  /* ============== DASHBOARD (admin/ai/index.html) ============== */

  function initDashboard() {
    AdminAuth.init({ page: 'ai', title: 'PLUGIN AI' }).then(() => renderModuleCards());
  }

  function fieldOptionsIfNeeded(field) {
    if (field.type === 'productSelect' && typeof DB !== 'undefined') {
      return DB.getAll().then(list => list.map(p => ({ value: p.id, label: p.name })));
    }
    if (field.type === 'blogSelect' && typeof BlogDB !== 'undefined') {
      return BlogDB.getAll().then(list => list.map(p => ({ value: p.id, label: p.title })));
    }
    return Promise.resolve(null);
  }

  function renderFieldHtml(moduleId, field, index, options) {
    const id = `f-${moduleId}-${field.key}`;
    if (index === 0 && field.type === 'text') {
      return `<div class="form-group full">
        <label>${escapeHtml(field.label)}</label>
        <textarea id="${id}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}"></textarea>
        <p class="small-muted">Mỗi dòng = 1 lần chạy riêng (dùng để tạo hàng loạt, VD 100 dòng = 100 bài).</p>
      </div>`;
    }
    if (field.type === 'textarea') {
      return `<div class="form-group full"><label>${escapeHtml(field.label)}</label><textarea id="${id}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}"></textarea></div>`;
    }
    if (field.type === 'select') {
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select></div>`;
    }
    if (field.type === 'productSelect' || field.type === 'blogSelect') {
      const opts = options || [];
      return `<div class="form-group"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.optional ? '<option value="">(không chọn)</option>' : ''}${opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
    }
    return `<div class="form-group"><label>${escapeHtml(field.label)}</label><input type="text" id="${id}" placeholder="${escapeHtml(field.placeholder || '')}"></div>`;
  }

  function renderModuleForm(module) {
    const container = document.getElementById('form-' + module.id);
    if (!container) return;
    Promise.all(module.inputFields.map(fieldOptionsIfNeeded)).then(optionsList => {
      container.innerHTML = module.inputFields.map((f, i) => renderFieldHtml(module.id, f, i, optionsList[i])).join('');
    });
  }

  function renderModuleCards() {
    const wrap = document.getElementById('moduleCards');
    // Chỉ hiện plugin đang Enable — hỏi qua PluginManager.loadPlugins(),
    // không đọc thẳng PluginDB (PluginManager là điểm gọi Plugin duy nhất).
    // 5 module Sprint 1 khác vẫn còn code, chỉ đang "coming_soon".
    PluginManager.loadPlugins().then(plugins => {
      const enabledIds = plugins.filter(p => p.metadata.enabled).map(p => p.metadata.id);
      const modules = AIModuleRegistry.getAll().filter(m => enabledIds.includes(m.id));
      wrap.innerHTML = modules.map(m => `
        <div class="panel">
          <h3>${escapeHtml(m.label)}</h3>
          <p class="small-muted">${escapeHtml(m.description)}</p>
          <div id="form-${m.id}"></div>
          <div class="admin-actions">
            <button class="submit-btn" onclick="AdminAI.runModule('${m.id}')">CHẠY</button>
          </div>
          <p class="status-msg" id="status-${m.id}"></p>
        </div>`).join('') || '<p class="small-muted">Chưa có plugin nào đang bật — xem <a href="plugins.html" style="color:var(--gold-ink)">Plugin Manager</a>.</p>';
      modules.forEach(renderModuleForm);
    });
  }

  function showModuleStatus(moduleId, msg) {
    const el = document.getElementById('status-' + moduleId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function runModule(moduleId) {
    const module = AIModuleRegistry.get(moduleId);
    if (!module) return;
    const user = AdminAuth.getUser();

    // Permission & Safety Layer (Sprint 2, Requirement #8): User → Permission
    // → Queue → AI Provider → Draft. Kiểm tra quyền TRƯỚC khi chạm tới
    // PluginManager/Queue — nếu bị từ chối thì dừng ở đây, không gọi
    // execute() nên chắc chắn không tạo Job/không vào Queue/không gọi AI
    // Provider/không tạo Draft. Không sửa plugin-manager.js hay
    // job-queue.js để thêm bước này (giữ nguyên 2 module đó theo yêu cầu).
    PermissionService.checkPluginExecution(user.uid, user.email, moduleId).then(check => {
      if (!check.granted) {
        showModuleStatus(moduleId, `Không có quyền chạy plugin này (thiếu "${check.permission || 'quyền chưa được gán'}").`);
        return;
      }

      // Gọi Plugin thông qua Interface (PluginManager.loadPlugin().execute()) —
      // không tự kiểm tra/ghi PluginDB hay gọi AIJobQueue.enqueue() trực tiếp ở
      // đây. execute() tự chặn nếu plugin đang tắt, và chỉ GỬI job vào Queue —
      // Queue (AIJobQueue) mới là nơi thực thi.
      PluginManager.loadPlugin(moduleId).then(plugin => {
        if (!plugin) {
          showModuleStatus(moduleId, 'Không tìm thấy plugin.');
          return;
        }

        const values = {};
        let primaryKey = null;
        let batchLines = null;

        module.inputFields.forEach((field, i) => {
          const el = document.getElementById(`f-${moduleId}-${field.key}`);
          if (!el) return;
          if (i === 0 && field.type === 'text') {
            primaryKey = field.key;
            batchLines = el.value.split('\n').map(l => l.trim()).filter(Boolean);
          } else {
            values[field.key] = el.value;
          }
        });

        const items = (batchLines && batchLines.length ? batchLines : [null]).map(line => {
          const item = Object.assign({}, values);
          if (primaryKey) item[primaryKey] = line || '';
          return item;
        });

        showModuleStatus(moduleId, `Đã tạo job (${items.length} mục) — đang xử lý...`);
        plugin.execute(items, user.uid, user.email)
          .then(() => AIJobQueue.resume(user.uid, user.email))
          .then(() => showModuleStatus(moduleId, 'Đã xử lý xong job — xem "Nhật ký"/"Job Queue" để biết kết quả (nếu provider chưa cấu hình hoặc gặp lỗi, job sẽ báo lỗi rõ trong Nhật ký).'))
          .catch(err => showModuleStatus(moduleId, 'Lỗi: ' + err.message));
      });
    });
  }

  /* ============== DRAFTS / REVIEW QUEUE (admin/ai/drafts.html) ============== */

  function initDrafts() {
    AdminAuth.init({ page: 'ai', title: 'PLUGIN AI — DUYỆT NỘI DUNG' }).then(loadDrafts);
  }

  function loadDrafts() {
    DraftDB.getAll().then(list => {
      drafts = list.filter(d => d.status === 'draft').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderDrafts();
    });
  }

  // Sprint 12 Requirement #6 (Media AI — Facebook AI V2) — "Content displays
  // correctly inside the CMS": Facebook AI V2 sinh nhiều field có cấu trúc
  // (hook/mainContent/cta/hashtags/ảnh/video/link) — hiển thị raw JSON như
  // mọi Plugin khác sẽ khó đọc. CHỈ đổi cách hiển thị cho đúng moduleId này
  // — mọi Plugin khác vẫn giữ NGUYÊN VẸN <pre>JSON</pre> như cũ (0 regression).
  // Sprint 12 Requirement #7 (Facebook AI V3) — mediaBlockHtml() dùng
  // CHUNG cho cả 3 phiên bản (Featured Image/Gallery/YouTube/Product Link
  // đều gắn theo Sản phẩm, không đổi theo từng phiên bản A/B/C) — hiển thị
  // đúng 1 lần, không lặp lại 3 lần cho mỗi bản.
  function mediaBlockHtml(c) {
    const imgHtml = c.featuredImage
      ? `<a href="${escapeHtml(c.featuredImage)}" download target="_blank" rel="noopener"><img src="${escapeHtml(c.featuredImage)}" style="max-width:280px;width:100%;border-radius:8px;margin-bottom:0.4rem;display:block" alt=""></a>`
      : '';
    const galleryHtml = Array.isArray(c.galleryImages) && c.galleryImages.length
      ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin:0.4rem 0 0.4rem">${c.galleryImages.map(g => `<a href="${escapeHtml(g)}" download target="_blank" rel="noopener"><img src="${escapeHtml(g)}" style="width:72px;height:72px;object-fit:cover;border-radius:6px"></a>`).join('')}</div>`
      : '';
    // "Download Images" — trình duyệt chỉ ép tải xuống thật khi ảnh cùng
    // origin; ảnh lưu ngoài (Cloudinary...) trình duyệt có thể vẫn chỉ mở
    // tab mới do giới hạn bảo mật cross-origin — không có cách khắc phục
    // thuần client-side, đã ghi rõ giới hạn này trong CHANGELOG.md.
    const downloadLinksHtml = (c.featuredImage || (Array.isArray(c.galleryImages) && c.galleryImages.length))
      ? `<p style="font-size:0.78rem;color:var(--ink-mute);margin-bottom:0.6rem">Bấm vào ảnh để tải xuống (ảnh lưu ngoài có thể mở tab mới thay vì tải trực tiếp, tuỳ trình duyệt).</p>`
      : '';
    const videoHtml = c.youtubeEmbedUrl
      ? `<div style="position:relative;padding-top:56.25%;height:0;max-width:360px;margin-bottom:0.6rem;border-radius:8px;overflow:hidden"><iframe src="${escapeHtml(c.youtubeEmbedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe></div>`
      : '';
    const highlightsHtml = Array.isArray(c.productHighlights) && c.productHighlights.length
      ? `<ul style="margin:0.3rem 0 0.6rem 1.2rem">${c.productHighlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
      : '';
    const linkHtml = c.productLink
      ? `<p><a href="${escapeHtml(c.productLink)}" target="_blank" rel="noopener" style="color:var(--gold-ink)">Xem sản phẩm →</a></p>`
      : '';
    if (!imgHtml && !galleryHtml && !videoHtml && !highlightsHtml && !linkHtml) return '';
    return `<div style="margin-bottom:1rem">${imgHtml}${downloadLinksHtml}${galleryHtml}${highlightsHtml}${videoHtml}${linkHtml}</div>`;
  }

  // versionCardHtml() — "Facebook Preview" mô phỏng giao diện 1 bài đăng
  // Facebook thật (Requirement #7: "Draft preview should support: Facebook
  // Preview, Copy Caption, Copy Hashtags") + nút Copy dùng data-copy-text
  // (trình duyệt tự giải mã HTML entity khi đọc lại qua getAttribute, không
  // cần tự decode) để tránh vỡ khi caption có ký tự đặc biệt.
  function versionCardHtml(v, draftId) {
    const hashtagsText = (v.hashtags || []).map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' ');
    const pubStatus = v.publishStatus || 'idle';
    // Trạng thái Publish (Sprint 12, Facebook AI V5) — hiển thị NGAY DƯỚI
    // preview, trước dãy nút — Publishing/Published/Failed đúng yêu cầu CMS
    // "Display status". Published hiển thị đúng Facebook Post ID thật (bằng
    // chứng đã đăng thật, không phải chỉ đổi label nút).
    const statusHtml = pubStatus === 'publishing'
      ? '<p class="small-muted">⏳ Đang đăng lên Facebook...</p>'
      : pubStatus === 'published'
        ? `<p class="small-muted" style="color:#2e7d32">✅ Đã đăng — Facebook Post ID: <code>${escapeHtml(v.facebookPostId || '')}</code> · ${formatDate(v.publishedAt)}${v.publishedBy ? ' · bởi ' + escapeHtml(v.publishedBy) : ''}</p>`
        : pubStatus === 'failed'
          ? `<p class="small-muted" style="color:#b3261e">❌ Đăng thất bại: ${escapeHtml(v.publishError || '')}</p>`
          : '';
    const publishBtnLabel = pubStatus === 'published' ? '📤 Đăng lại lên Facebook' : '📤 Đăng lên Facebook';
    return `
      <div class="panel" style="margin-top:0.8rem">
        <h4 style="margin-bottom:0.5rem">Phiên bản ${escapeHtml(v.label)}</h4>
        <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden;max-width:420px;background:#fff;color:#1c1c1c">
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.7rem">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">P</div>
            <div>
              <div style="font-weight:700;font-size:0.85rem">Pshop Music</div>
              <div style="font-size:0.72rem;color:#65676b">Được tài trợ · 🌐</div>
            </div>
          </div>
          <div style="padding:0 0.7rem 0.7rem;font-size:0.85rem;white-space:pre-wrap">${v.hook ? `<strong>${escapeHtml(v.hook)}</strong>\n\n` : ''}${escapeHtml(v.caption)}</div>
          ${hashtagsText ? `<div style="padding:0 0.7rem 0.7rem;font-size:0.8rem;color:#1877f2">${escapeHtml(hashtagsText)}</div>` : ''}
          ${v.cta ? `<div style="padding:0.7rem;font-weight:600;font-size:0.85rem;border-top:1px solid #eee">${escapeHtml(v.cta)}</div>` : ''}
        </div>
        ${statusHtml}
        <div class="admin-actions" style="margin-top:0.6rem">
          <button type="button" class="btn-secondary" data-copy-text="${escapeHtml(v.postText)}" onclick="AdminAI.copyDraftText(this)">📋 Copy Caption</button>
          ${hashtagsText ? `<button type="button" class="btn-secondary" data-copy-text="${escapeHtml(hashtagsText)}" onclick="AdminAI.copyDraftText(this)">#️⃣ Copy Hashtags</button>` : ''}
          <button type="button" class="submit-btn" ${pubStatus === 'publishing' ? 'disabled' : ''} onclick="AdminAI.publishVersionToFacebook('${draftId}', '${escapeHtml(v.label)}')">${publishBtnLabel}</button>
        </div>
      </div>`;
  }

  const FACEBOOK_PUBLISH_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookPublish';

  // absolutizeLink()/buildFacebookPublishMessage() — Sprint 12, Facebook AI
  // V5. Không sửa js/ai/modules/facebook-post-generator.js (Plugin — cấm sửa
  // theo Requirement) để đổi productLink thành URL tuyệt đối hay thêm link
  // YouTube thật — 2 việc đó lắp lại Ở ĐÂY (Publish Pipeline/Experience
  // Layer, không phải Plugin) từ đúng dữ liệu draft.content/Product thật đã
  // có, không bịa thêm gì.
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
    // "If Product contains a YouTube URL, append the YouTube link. Do NOT
    // upload the video itself." — link THẬT (product.youtubeUrl, Admin tự
    // nhập tay ở admin/products.html), KHÔNG phải youtubeEmbedUrl (dạng
    // embed, không phải link xem trực tiếp phù hợp để chia sẻ công khai).
    if (product && product.youtubeUrl) parts.push('Video: ' + product.youtubeUrl);
    return parts.join('\n\n');
  }

  // publishVersionToFacebook() — Sprint 12, Facebook AI V5 (nâng cấp thật từ
  // khung UI V4). Đăng THẬT lên Fanpage đã kết nối qua Cloud Function
  // `facebookPublish` (functions/index.js) — token thật KHÔNG BAO GIỜ đi qua
  // đây, chỉ Cloud Function (Admin SDK, node server-only `facebookActiveToken`)
  // mới đọc được. Theo dõi trạng thái Publishing/Published/Failed NGAY trên
  // đúng phiên bản (versions[].label) vừa bấm — không ảnh hưởng 2 phiên bản
  // A/B/C còn lại, cho phép đăng nhiều phiên bản độc lập nếu Founder muốn.
  function publishVersionToFacebook(draftId, versionLabel) {
    const notConnectedMsg = 'Chưa kết nối Facebook. Vào "Cài đặt" → "Facebook Configuration" để kết nối trước khi đăng bài thật.';
    firebase.database().ref('facebookConnection').once('value').then(snap => {
      const conn = snap.val() || { status: 'not_connected' };
      if (conn.status !== 'connected' && conn.status !== 'token_expiring') {
        alert(notConnectedMsg);
        return;
      }
      return DraftDB.get(draftId).then(draft => {
        if (!draft || !Array.isArray(draft.content.versions)) return;
        const versions = draft.content.versions.slice();
        const idx = versions.findIndex(v => v.label === versionLabel);
        if (idx === -1) return;

        // Cập nhật "Đang đăng..." ngay lập tức để Founder thấy phản hồi tức
        // thời trong lúc chờ Graph API thật trả lời (có thể mất vài giây).
        versions[idx] = Object.assign({}, versions[idx], { publishStatus: 'publishing', publishError: null });
        return DraftDB.update(draftId, { content: Object.assign({}, draft.content, { versions }) }).then(() => {
          if (typeof loadDrafts === 'function') loadDrafts();

          const productLookup = (draft.inputParams && draft.inputParams.productId && typeof DB !== 'undefined')
            ? DB.get(draft.inputParams.productId)
            : Promise.resolve(null);

          return productLookup.then(product => {
            const message = buildFacebookPublishMessage(draft, versions[idx], product);
            const c = draft.content;
            const imageUrls = [c.featuredImage].concat(Array.isArray(c.galleryImages) ? c.galleryImages : []).filter(Boolean);
            const user = AdminAuth.getUser();

            return firebase.auth().currentUser.getIdToken().then(idToken => {
              return fetch(FACEBOOK_PUBLISH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
                body: JSON.stringify({ message, imageUrls })
              }).then(res => res.json().then(data => ({ ok: res.ok, data })));
            }).then(({ ok, data }) => {
              const finalVersions = versions.slice();
              if (ok && data.success) {
                finalVersions[idx] = Object.assign({}, finalVersions[idx], {
                  publishStatus: 'published',
                  facebookPostId: data.facebookPostId,
                  publishedAt: Date.now(),
                  publishedBy: user.email,
                  selectedPage: conn.pageName || ''
                });
              } else {
                finalVersions[idx] = Object.assign({}, finalVersions[idx], {
                  publishStatus: 'failed',
                  publishError: (data && data.error) || 'Không rõ nguyên nhân.'
                });
              }
              return DraftDB.update(draftId, { content: Object.assign({}, draft.content, { versions: finalVersions }) })
                .then(() => { if (typeof loadDrafts === 'function') loadDrafts(); });
            });
          });
        });
      });
    }).catch(err => alert('Lỗi khi đăng bài: ' + err.message));
  }

  // copyDraftText() — Clipboard API (yêu cầu HTTPS, pshopmusic.com đã có) +
  // fallback execCommand('copy') cho trình duyệt cũ hơn — không thêm phụ
  // thuộc/thư viện mới nào.
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* bỏ qua — nút vẫn không báo lỗi ra người dùng */ }
    document.body.removeChild(ta);
  }

  function copyDraftText(btn) {
    const text = btn.getAttribute('data-copy-text') || '';
    const showCopied = () => {
      const old = btn.textContent;
      btn.textContent = '✅ Đã copy!';
      setTimeout(() => { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => { fallbackCopy(text); showCopied(); });
    } else {
      fallbackCopy(text);
      showCopied();
    }
  }

  // Sprint 12 Requirement #8 (Banner AI V2) — "Banner Draft Preview should
  // display: Banner Image, Banner Title, Subtitle, CTA" — CHỈ đổi cách hiển
  // thị cho moduleId này, mọi Plugin khác không bị ảnh hưởng.
  function bannerDraftHtml(c) {
    const imgHtml = c.image
      ? `<img src="${escapeHtml(c.image)}" style="max-width:320px;width:100%;border-radius:8px;margin-bottom:0.8rem;display:block" alt="">`
      : '';
    const galleryHtml = Array.isArray(c.galleryImages) && c.galleryImages.length
      ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem">${c.galleryImages.map(g => `<img src="${escapeHtml(g)}" style="width:72px;height:72px;object-fit:cover;border-radius:6px">`).join('')}</div>`
      : '';
    return `
      <div style="background:var(--bg-alt);padding:1rem;border-radius:8px">
        ${imgHtml}
        ${galleryHtml}
        ${c.title ? `<p style="font-weight:700;font-size:1.1rem">${escapeHtml(c.title)}</p>` : ''}
        ${c.subtitle ? `<p>${escapeHtml(c.subtitle)}</p>` : ''}
        ${c.cta ? `<p style="font-weight:600;color:var(--gold-ink)">${escapeHtml(c.cta)}</p>` : ''}
        ${c.link ? `<p class="small-muted">Link: ${escapeHtml(c.link)}</p>` : ''}
      </div>`;
  }

  function draftBodyHtml(d) {
    if (d.moduleId === 'banner-generator') {
      return bannerDraftHtml(d.content || {});
    }
    if (d.moduleId === 'facebook-post-generator') {
      const c = d.content || {};
      // Facebook AI V3 (Requirement #7) — nhiều phiên bản (content.versions).
      if (Array.isArray(c.versions) && c.versions.length) {
        return `<div>${mediaBlockHtml(c)}${c.versions.map(v => versionCardHtml(v, d.id)).join('')}</div>`;
      }
      // Hồi quy: Draft cũ từ Facebook AI V2 (Requirement #6, trước khi có
      // "versions") — giữ NGUYÊN VẸN cách hiển thị cũ, không phá dữ liệu đã
      // tạo trước đó còn nằm trong aiDrafts.
      const imgHtml = c.featuredImage
        ? `<img src="${escapeHtml(c.featuredImage)}" style="max-width:280px;width:100%;border-radius:8px;margin-bottom:0.8rem;display:block" alt="">`
        : '';
      const galleryHtml = Array.isArray(c.galleryImages) && c.galleryImages.length
        ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem">${c.galleryImages.map(g => `<img src="${escapeHtml(g)}" style="width:72px;height:72px;object-fit:cover;border-radius:6px">`).join('')}</div>`
        : '';
      const videoHtml = c.youtubeEmbedUrl
        ? `<div style="position:relative;padding-top:56.25%;height:0;max-width:360px;margin-bottom:0.8rem;border-radius:8px;overflow:hidden"><iframe src="${escapeHtml(c.youtubeEmbedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe></div>`
        : '';
      const highlightsHtml = Array.isArray(c.productHighlights) && c.productHighlights.length
        ? `<ul style="margin:0.3rem 0 0.8rem 1.2rem">${c.productHighlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
        : '';
      const linkHtml = c.productLink
        ? `<p><a href="${escapeHtml(c.productLink)}" target="_blank" rel="noopener" style="color:var(--gold-ink)">Xem sản phẩm →</a></p>`
        : '';
      const hashtagsHtml = Array.isArray(c.hashtags) && c.hashtags.length
        ? `<p style="color:var(--gold-ink)">${c.hashtags.map(h => escapeHtml(h.indexOf('#') === 0 ? h : '#' + h)).join(' ')}</p>`
        : '';
      return `
        <div style="background:var(--bg-alt);padding:1rem;border-radius:8px">
          ${imgHtml}
          ${c.hook ? `<p style="font-weight:700">${escapeHtml(c.hook)}</p>` : ''}
          ${c.mainContent ? `<p style="white-space:pre-wrap">${escapeHtml(c.mainContent)}</p>` : ''}
          ${highlightsHtml}
          ${galleryHtml}
          ${videoHtml}
          ${c.cta ? `<p style="font-weight:600">${escapeHtml(c.cta)}</p>` : ''}
          ${hashtagsHtml}
          ${linkHtml}
        </div>`;
    }
    return `<pre style="white-space:pre-wrap;background:var(--bg-alt);padding:1rem;font-size:0.82rem;max-height:260px;overflow:auto">${escapeHtml(JSON.stringify(d.content, null, 2))}</pre>`;
  }

  function renderDrafts() {
    const wrap = document.getElementById('draftsList');
    if (!wrap) return;
    if (!drafts.length) {
      wrap.innerHTML = '<p class="small-muted">Không có nội dung nào đang chờ duyệt.</p>';
      return;
    }
    wrap.innerHTML = drafts.map(d => {
      const module = AIModuleRegistry.get(d.moduleId);
      return `
      <div class="panel" data-id="${d.id}">
        <h3>${escapeHtml(module ? module.label : d.moduleId)}</h3>
        <p class="small-muted">Tạo lúc ${formatDate(d.createdAt)} · Provider: ${escapeHtml(d.providerUsed || '—')} · Đích: ${escapeHtml(d.targetCollection || '(chỉ xem/copy)')}</p>
        ${draftBodyHtml(d)}
        <div class="admin-actions">
          <button class="submit-btn" onclick="AdminAI.publishDraft('${d.id}')">DUYỆT &amp; PUBLISH</button>
          <button class="btn-danger" onclick="AdminAI.rejectDraft('${d.id}')">TỪ CHỐI</button>
        </div>
      </div>`;
    }).join('');
  }

  function publishToTarget(draft) {
    const target = draft.targetCollection;
    if (!target) return Promise.resolve(); // Facebook Post / Image Prompt — chỉ để xem/copy, không có nơi ghi
    if (target === 'blogPosts') {
      // Sprint 12 Requirement #3 fix (status): module.mapToDraftContent()
      // (blog-writer/faq-generator) sets status:'draft' as the DRAFT-preview
      // representation — that value must not survive into the live record, or
      // the public blog (js/cms-db.js BlogDB.getAll() filters
      // status==='published') never shows it despite the write succeeding.
      const sanitized = sanitizeBlogContentForPublish(draft.content, draft.inputParams);
      const content = Object.assign({}, sanitized, { status: 'published' });
      if (draft.targetId) return BlogDB.update(draft.targetId, content);
      if (!content.slug) content.slug = slugifyForPublish(content.title);
      return BlogDB.add(content);
    }
    if (target === 'products') {
      // Sprint 12 Requirement #1 (Product AI V2): sản phẩm giờ có thêm
      // "category" do AI tự đề xuất — AI có thể trả về 1 mã không tồn tại
      // trong CategoryDB thật (hoặc bỏ trống nếu không chắc) — phải validate
      // trước khi ghi, không được để sai lệch điều hướng category.html thật.
      const content = Object.assign({}, draft.content, {
        description: stripCodeFence(draft.content.description),
        specifications: stripCodeFence(draft.content.specifications)
      });
      return CategoryDB.getAll().then(categories => {
        // Cùng điều kiện "active !== false" category.html thật đang dùng
        // (js/category.js loadCategories()) — tránh gán category còn tồn tại
        // trong CategoryDB nhưng đã bị Admin tắt hiển thị.
        const validCodes = categories.filter(c => c.active !== false).map(c => c.code);
        if (!content.category || validCodes.indexOf(content.category) === -1) {
          delete content.category; // giữ nguyên category hiện tại của sản phẩm, không ghi đè bằng mã không hợp lệ
        }
        return DB.update(draft.targetId, content);
      });
    }
    if (target === 'banners') {
      return BannerDB.add(draft.content);
    }
    if (target === 'siteContent.heroSlides') {
      return SiteContentDB.get().then(sc => {
        const heroSlides = Array.isArray(sc.heroSlides) ? sc.heroSlides.slice() : [];
        heroSlides.push(draft.content);
        return SiteContentDB.save(Object.assign({}, sc, { heroSlides }));
      });
    }
    return Promise.reject(new Error('Không nhận diện được targetCollection: ' + target));
  }

  function publishDraft(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    publishToTarget(draft)
      .then(() => DraftDB.update(id, { status: 'published', publishedAt: Date.now() }))
      .then(loadDrafts)
      .catch(err => alert('Lỗi khi publish: ' + err.message));
  }

  function rejectDraft(id) {
    if (!confirm('Từ chối nội dung này? Vẫn giữ lại để tra cứu, không xóa.')) return;
    DraftDB.update(id, { status: 'rejected' }).then(loadDrafts);
  }

  // publishDraftById/rejectDraftById (Sprint 4, Requirement #2) — tái sử dụng
  // ĐÚNG cơ chế publish/reject có sẵn (publishToTarget() ở trên, không viết
  // lại) nhưng không phụ thuộc mảng `drafts` cục bộ của trang Duyệt nội dung
  // — cho phép AI Assistant (admin/ai/assistant.html) publish/reject 1 Draft
  // biết trước id mà không cần gọi initDrafts()/loadDrafts() của trang này
  // trước (tránh gọi trùng AdminAuth.init() giữa 2 trang, giảm coupling).
  // Không đổi publishDraft()/rejectDraft()/initDrafts() ở trên.
  function publishDraftById(id) {
    return DraftDB.get(id).then(draft => {
      if (!draft) return Promise.reject(new Error('Không tìm thấy nội dung nháp.'));
      return publishToTarget(draft).then(() => DraftDB.update(id, { status: 'published', publishedAt: Date.now() }));
    });
  }

  function rejectDraftById(id) {
    return DraftDB.update(id, { status: 'rejected' });
  }

  /* ============== JOB QUEUE MONITOR (admin/ai/jobs.html) ============== */

  function initJobs() {
    AdminAuth.init({ page: 'ai', title: 'PLUGIN AI — JOB QUEUE' }).then(({ user }) => {
      AIJobQueue.resume(user.uid, user.email).then(loadJobs);
      loadJobs();
      setInterval(loadJobs, 3000);
    });
  }

  function loadJobs() {
    JobDB.getAll().then(list => {
      jobs = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderJobs();
    });
  }

  const JOB_STATUS_LABELS = { queued: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };

  function renderJobs() {
    const body = document.getElementById('jobsTableBody');
    if (!body) return;
    if (!jobs.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có job nào.</td></tr>';
      return;
    }
    body.innerHTML = jobs.map(j => {
      const module = AIModuleRegistry.get(j.moduleId);
      const canCancel = j.status === 'queued' || j.status === 'running';
      const canRetry = j.status === 'failed' || (j.status === 'completed' && j.progress.failed > 0) || j.status === 'cancelled';
      const actions = [
        canCancel ? `<button class="btn-danger" onclick="AdminAI.cancelJob('${j.id}')">Hủy</button>` : '',
        canRetry ? `<button class="btn-secondary" onclick="AdminAI.retryJob('${j.id}')">Thử lại</button>` : ''
      ].filter(Boolean).join(' ');
      return `
      <tr>
        <td>${escapeHtml(module ? module.label : j.moduleId)}</td>
        <td>${JOB_STATUS_LABELS[j.status] || escapeHtml(j.status)}</td>
        <td>${j.progress.done}/${j.progress.total} (lỗi: ${j.progress.failed})</td>
        <td>${formatDate(j.createdAt)}</td>
        <td>${escapeHtml(j.createdByEmail || '')}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }

  function retryJob(id) {
    const user = AdminAuth.getUser();
    AIJobQueue.retryFailed(id).then(() => AIJobQueue.resume(user.uid, user.email)).then(loadJobs);
  }

  function cancelJob(id) {
    // Gọi Plugin thông qua Interface (plugin.cancel()) thay vì gọi thẳng
    // AIJobQueue.cancel() — plugin.cancel() vẫn ủy quyền cho Queue bên trong.
    // Truyền user hiện tại để Queue ghi Log đúng ai là người hủy job.
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const user = AdminAuth.getUser();
    PluginManager.loadPlugin(job.moduleId).then(plugin => {
      const cancelPromise = plugin ? plugin.cancel(id, user.uid, user.email) : AIJobQueue.cancel(id, user.uid, user.email);
      return cancelPromise.then(loadJobs);
    });
  }

  /* ============== LOGS (admin/ai/logs.html) ============== */

  function initLogs() {
    AdminAuth.init({ page: 'ai', title: 'PLUGIN AI — NHẬT KÝ', requiredRole: 'admin' }).then(loadLogs);
  }

  function loadLogs() {
    const moduleFilter = new URLSearchParams(location.search).get('module');
    LogDB.getAll().then(list => {
      logs = list
        .filter(l => !moduleFilter || l.moduleId === moduleFilter)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 200);
      renderLogs();
    });
  }

  const LOG_STATUS_LABELS = {
    completed: 'Completed',
    failed: '<span style="color:#c0392b">Failed</span>',
    cancelled: '<span style="color:var(--ink-mute)">Cancelled</span>',
    permission_denied: '<span style="color:#c0392b">Permission Denied</span>'
  };

  function renderLogs() {
    const body = document.getElementById('logsTableBody');
    if (!body) return;
    if (!logs.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có log nào.</td></tr>';
      return;
    }
    body.innerHTML = logs.map(l => {
      const module = AIModuleRegistry.get(l.moduleId);
      return `
      <tr>
        <td>${formatDate(l.timestamp)}</td>
        <td>${escapeHtml(l.userEmail || '')}</td>
        <td>${escapeHtml(module ? module.label : l.moduleId)}</td>
        <td>${escapeHtml(l.provider || '')}</td>
        <td>${LOG_STATUS_LABELS[l.status] || escapeHtml(l.status || '')}</td>
        <td>${escapeHtml(l.errorMessage || '')}</td>
      </tr>`;
    }).join('');
  }

  return { initDashboard, runModule, initDrafts, publishDraft, rejectDraft, publishDraftById, rejectDraftById, initJobs, cancelJob, retryJob, initLogs, copyDraftText, publishVersionToFacebook };
})();
