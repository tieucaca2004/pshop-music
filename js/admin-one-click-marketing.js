/*
 * One Click Marketing Wizard (admin/ai/one-click-marketing.html) — Sprint 10
 * Requirement #3 (Foundation) + Requirement #4 (Card Wizard Experience &
 * Review Center — hoàn thiện UX, KHÔNG đổi Workflow Engine/AI). Card Wizard
 * 5 bước (Business → Product → Marketing Goal → Review → Generate Marketing
 * Package) + Review Center hiển thị Gói Marketing (6 mục output dạng mẫu).
 * CHỈ là Experience Layer — gọi OneClickMarketing.buildMarketingPackage()
 * (js/one-click-marketing.js, hàm thuần, không AI) để dựng Gói Marketing.
 * KHÔNG gọi PluginManager/AIJobQueue/AIProviderRegistry — không tạo Job,
 * không Generate AI thật.
 *
 * "Business" ở Bước 1 KHÔNG phải chọn giữa nhiều doanh nghiệp — Business
 * Manager (Sprint 10 Requirement #1) mới chỉ là Foundation, chưa có nhiều
 * doanh nghiệp thật. Bước này chỉ xác nhận/ghi đè thông tin doanh nghiệp
 * hiện có (đọc từ SiteContentDB.settings đã có, không đổi Database).
 *
 * "Lưu nháp" dùng localStorage (KHÔNG ghi vào Firebase) — đúng Architectural
 * Constraint "không đổi Database Structure", cùng lý do Workflow Automation
 * (Sprint 7 #4) không lưu định nghĩa Workflow vào Firebase.
 *
 * Sprint 10 Requirement #4 — 2 "thao tác thừa" phát hiện qua rà soát +
 * kiểm thử click-through thật của Requirement #3, đã sửa (chỉ Experience
 * Layer, không đổi số bước/cấu trúc Workflow):
 *   (1) "SỬA LẠI" trước đây luôn nhảy về Bước 1 — buộc bấm lại "TIẾP THEO"
 *       3 lần để quay lại Review Center dù chỉ cần sửa 1 chi tiết nhỏ (vd
 *       Khuyến mãi). Nay nhảy thẳng về Bước 4 "Xem lại" (bước gần Review
 *       Center nhất, vẫn còn nút "TRƯỚC" nếu cần lùi xa hơn).
 *   (2) Progress Indicator trước đây chỉ là nhãn tĩnh — nay các bước ĐÃ ĐI
 *       QUA (kể cả bước hiện tại) có thể bấm trực tiếp để nhảy tới, không
 *       cần bấm "TRƯỚC" nhiều lần. Bước "Gói Marketing" (bước 5) chỉ bấm
 *       được sau khi đã Generate ít nhất 1 lần (tránh nhảy tới màn hình
 *       trống chưa có Gói Marketing).
 *
 * Sprint 11 Requirement #1 (One Click Marketing: Cầu nối Generate Thật) —
 * nút "GENERATE" giờ tạo Job AI THẬT cho 4/6 output, gọi qua
 * PluginManager/AIJobQueue/PermissionService HIỆN CÓ (đúng luồng
 * admin-ai.js đã dùng: Permission → PluginManager.loadPlugin().execute()
 * → AIJobQueue.resume()) — KHÔNG sửa plugin-manager.js/job-queue.js/
 * provider-registry.js/permission-service.js:
 *   websiteArticle  -> Plugin "blog-writer"            (topic/tone/keywords)
 *   facebookPost    -> Plugin "facebook-post-generator" (productId?/message)
 *   bannerRequest   -> Plugin "banner-generator"        (theme/link)
 *   aiImageRequest  -> Plugin "image-prompt-generator"  (subject/style)
 * "SEO Metadata" KHÔNG nối được ở Requirement này: Plugin "seo-generator"
 * bắt buộc 1 Blog Post ĐÃ TỒN TẠI THẬT trong CMS (đọc qua
 * DataProvider.getBlogPost(postId)), trong khi One Click Marketing chưa
 * tạo Blog Post nào — vẫn giữ dạng mẫu/Foundation, đã ghi vào ROADMAP.md,
 * không ép nối sai chỗ. "Video Request" vẫn chưa có Plugin AI Video nào,
 * giữ nguyên "chưa có năng lực" như Requirement #3.
 * Kết quả Generate thật vẫn dừng ở Draft (`aiDrafts`) — Founder vẫn phải tự
 * Review & Publish qua admin/ai/drafts.html, KHÔNG tự Publish ở đây.
 * `js/one-click-marketing.js` (hàm thuần buildMarketingPackage()) KHÔNG bị
 * sửa — toàn bộ logic gọi AI nằm ở lớp Experience Layer này.
 */
const AdminOneClickMarketing = (function () {
  const STORAGE_KEY = 'oneClickMarketingDraft_v1';
  const STEP_LABELS = ['Doanh nghiệp', 'Sản phẩm', 'Mục tiêu Marketing', 'Xem lại', 'Gói Marketing'];

  let state = null;
  let products = [];
  let categories = [];
  let currentStep = 0;
  let packageResult = null;
  let mediaPicker = null;
  let pollTimer = null;

  function defaultState() {
    return {
      businessName: '', address: '',
      productId: '', productName: '', price: '', category: '', image: '',
      promotion: ''
    };
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, currentStep, packageResult })); } catch (e) { /* localStorage không khả dụng - bỏ qua, không phải lỗi nghiêm trọng */ }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // buildAIJobPlan(state) — hàm THUẦN: map dữ liệu Wizard sang đúng
  // inputParams của 4 Plugin AI đã Production tương ứng (xem docstring đầu
  // file). Chỉ trả về kế hoạch khi đã có tên sản phẩm (Bước 2) — thiếu tên
  // sản phẩm thì không đủ nội dung có nghĩa để Generate bất kỳ output nào.
  // Field bắt buộc của Plugin mà Wizard không thu thập (tone/style) dùng
  // giá trị mặc định hợp lý, không bịa thêm dữ kiện nào về sản phẩm/khuyến
  // mãi ngoài input Founder đã nhập (đúng tinh thần AI_RULES.md mục 2).
  function buildAIJobPlan(s) {
    if (!s.productName) return [];
    const productLabel = [s.productName, s.promotion].filter(Boolean).join(' - ');
    const link = s.category ? ('category.html?cat=' + encodeURIComponent(s.category)) : 'index.html';
    return [
      {
        outputKey: 'websiteArticle', moduleId: 'blog-writer', label: 'Website Draft',
        inputParams: { topic: productLabel, tone: 'Chuyên nghiệp', keywords: s.category || s.productName }
      },
      {
        outputKey: 'facebookPost', moduleId: 'facebook-post-generator', label: 'Facebook Draft',
        inputParams: { productId: s.productId || '', message: s.promotion || productLabel }
      },
      {
        outputKey: 'bannerRequest', moduleId: 'banner-generator', label: 'Banner Request',
        inputParams: { theme: s.promotion || s.productName, link }
      },
      {
        outputKey: 'aiImageRequest', moduleId: 'image-prompt-generator', label: 'Image Request',
        inputParams: { subject: productLabel, style: 'Ảnh sản phẩm studio' }
      }
    ];
  }

  function jobStatusLabel(status) {
    return {
      queued: 'Đang chờ xử lý', running: 'Đang xử lý',
      completed: 'Hoàn tất — xem "Marketing Drafts" để Review & Publish',
      failed: 'Thất bại', cancelled: 'Đã hủy'
    }[status] || status;
  }

  // runOnePluginJob — đúng luồng admin-ai.js: Permission → PluginManager →
  // AIJobQueue. Mỗi output là 1 Job RIÊNG (không gộp batch) để 1 output lỗi
  // không chặn các output còn lại.
  function runOnePluginJob(entry, user) {
    return PermissionService.checkPluginExecution(user.uid, user.email, entry.moduleId).then(check => {
      if (!check.granted) {
        state.generatedJobs[entry.outputKey] = { error: `Không có quyền chạy "${entry.label}" (thiếu "${check.permission || 'quyền chưa được gán'}").` };
        return;
      }
      return PluginManager.loadPlugin(entry.moduleId).then(plugin => {
        if (!plugin) {
          state.generatedJobs[entry.outputKey] = { error: 'Không tìm thấy plugin.' };
          return;
        }
        return plugin.execute([entry.inputParams], user.uid, user.email)
          .then(job => {
            state.generatedJobs[entry.outputKey] = { jobId: job.id, status: job.status, moduleId: entry.moduleId };
            return AIJobQueue.resume(user.uid, user.email);
          })
          .catch(err => { state.generatedJobs[entry.outputKey] = { error: err.message }; });
      });
    });
  }

  function triggerRealGeneration() {
    const user = AdminAuth.getUser();
    const plan = buildAIJobPlan(state);
    const noteEl = document.getElementById('ocmGenerateNote');
    if (!plan.length) {
      if (noteEl) noteEl.textContent = 'Cần nhập Tên sản phẩm (Bước 2) trước khi Generate AI thật.';
      return;
    }
    state.generatedJobs = state.generatedJobs || {};
    if (noteEl) noteEl.textContent = 'Đang gửi yêu cầu AI thật...';
    // PluginManager.loadPlugin(id) (khac voi loadPlugins()) KHONG tu seed
    // aiPlugins/{id} - viec seed chi xay ra trong PluginDB.getAll() (xem
    // js/ai/plugin-db.js). Cac trang admin/ai/*.html khac luon goi
    // loadPlugins() truoc (render dashboard) nen aiPlugins da co san; One
    // Click Marketing la trang AI DAU TIEN 1 Founder co the mo ma chua tung
    // qua Dashboard ky thuat, nen phai tu dam bao seed truoc - goi dung
    // PluginManager.loadPlugins() (method cong khai co san, KHONG sua
    // plugin-manager.js/plugin-db.js) 1 lan truoc khi loadPlugin(id) tung
    // Plugin.
    PluginManager.loadPlugins().then(() => Promise.all(plan.map(entry => runOnePluginJob(entry, user)))).then(() => {
      saveDraft();
      render();
      startPolling();
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      const jobs = state.generatedJobs || {};
      const ids = Object.keys(jobs).filter(k => jobs[k] && jobs[k].jobId);
      if (!ids.length) { stopPolling(); return; }
      Promise.all(ids.map(k => JobDB.get(jobs[k].jobId).then(job => { if (job) jobs[k].status = job.status; }))).then(() => {
        saveDraft();
        if (currentStep === STEP_LABELS.length - 1) render();
        const allDone = ids.every(k => ['completed', 'failed', 'cancelled'].includes(jobs[k].status));
        if (allDone) stopPolling();
      });
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function hasPendingOrDoneJobs(s) {
    return !!(s.generatedJobs && Object.keys(s.generatedJobs).some(k => s.generatedJobs[k] && s.generatedJobs[k].jobId));
  }

  function init() {
    AdminAuth.init({ page: 'ai-one-click-marketing', title: 'ONE CLICK MARKETING' }).then(() => {
      Promise.all([DB.getAll(), CategoryDB.getAll(), SiteContentDB.get()]).then(([p, c, content]) => {
        products = p || [];
        categories = c || [];
        const settings = content.settings || {};

        const draft = loadDraft();
        if (draft && draft.state) {
          state = draft.state;
          currentStep = draft.currentStep || 0;
          packageResult = draft.packageResult || null;
          // FIX (Founder 2026-08-13): draft cũ (trước khi lưu packageResult)
          // không có packageResult nhưng ở bước 5 -> tự build lại từ state
          // để nút GENERATE (AI thật) hiển thị được, không kẹt ở "CHƯA gọi
          // AI thật".
          if (currentStep === STEP_LABELS.length - 1 && !packageResult) {
            packageResult = OneClickMarketing.buildMarketingPackage(state);
          }
          renderResumeBanner();
        } else {
          state = defaultState();
          state.businessName = settings.siteName || '';
          state.address = settings.address || '';
        }
        render();
        // Neu ban nhap khoi phuc dang co Job AI that chua xong (queued/
        // running), tiep tuc poll trang thai thay vi bo do sau khi tai lai
        // trang.
        if (hasPendingOrDoneJobs(state)) startPolling();
      });
    });
  }

  function renderResumeBanner() {
    const banner = document.getElementById('ocmResumeBanner');
    banner.style.display = 'block';
    banner.innerHTML = `<p class="small-muted">Có 1 bản nháp chưa hoàn tất — đang tiếp tục từ bước "${escapeHtml(STEP_LABELS[currentStep])}". <a href="#" id="ocmStartOver" style="color:var(--gold-ink)">Bắt đầu lại từ đầu</a></p>`;
    document.getElementById('ocmStartOver').addEventListener('click', e => {
      e.preventDefault();
      stopPolling();
      clearDraft();
      state = defaultState();
      currentStep = 0;
      banner.style.display = 'none';
      render();
    });
  }

  function progressHtml() {
    // Buoc da di qua (i <= currentStep) co the bam thang toi - tru buoc
    // cuoi "Goi Marketing" (index STEP_LABELS.length-1) chi bam duoc SAU KHI
    // da Generate it nhat 1 lan (packageResult ton tai), tranh nhay toi man
    // hinh trong.
    return `<div class="admin-actions" style="gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
      ${STEP_LABELS.map((label, i) => {
        const isLastStep = i === STEP_LABELS.length - 1;
        const clickable = i <= currentStep && (!isLastStep || packageResult);
        const style = i === currentStep ? 'background:var(--gold-ink);color:#fff' : (i < currentStep ? 'background:var(--bg-alt);color:var(--gold-ink)' : 'background:var(--bg-alt);color:var(--ink-mute)');
        const cursor = clickable && i !== currentStep ? 'cursor:pointer' : '';
        const tag = clickable && i !== currentStep ? 'button' : 'span';
        const attrs = tag === 'button' ? `class="ocmStepBadge" data-step="${i}" style="border:none;padding:0.3rem 0.8rem;border-radius:999px;font-size:0.85rem;${style};${cursor}"` : `style="padding:0.3rem 0.8rem;border-radius:999px;font-size:0.85rem;${style}"`;
        return `<${tag} ${attrs}>${i + 1}. ${escapeHtml(label)}</${tag}>`;
      }).join('')}
    </div>`;
  }

  function productOptions() {
    return '<option value="">— Sản phẩm mới (nhập tay) —</option>' +
      products.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === state.productId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  }

  function categoryOptions() {
    return '<option value="">— Chọn danh mục —</option>' +
      categories.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === state.category ? 'selected' : ''}>${escapeHtml(c.label || c.id)}</option>`).join('');
  }

  function stepBusinessHtml() {
    return `<div class="panel">
      <h3 style="margin-top:0">Bước 1 — Doanh nghiệp</h3>
      <p class="small-muted">Thông tin doanh nghiệp dùng chung cho Gói Marketing — lấy từ Cài đặt chung, có thể chỉnh riêng cho lần này.</p>
      <div class="form-group"><label>Thông tin doanh nghiệp</label><input type="text" id="ocmBusinessName" value="${escapeHtml(state.businessName)}"></div>
      <div class="form-group"><label>Địa chỉ</label><input type="text" id="ocmAddress" value="${escapeHtml(state.address)}"></div>
    </div>`;
  }

  function stepProductHtml() {
    return `<div class="panel">
      <h3 style="margin-top:0">Bước 2 — Sản phẩm</h3>
      <div class="form-group"><label>Chọn sản phẩm có sẵn</label><select id="ocmProductSelect">${productOptions()}</select></div>
      <div class="form-group"><label>Tên sản phẩm</label><input type="text" id="ocmProductName" value="${escapeHtml(state.productName)}"></div>
      <div class="form-group"><label>Giá</label><input type="text" id="ocmPrice" value="${escapeHtml(state.price)}"></div>
      <div class="form-group"><label>Danh mục</label><select id="ocmCategory">${categoryOptions()}</select></div>
      <div class="form-group"><label>Hình sản phẩm</label>
        <input type="hidden" id="ocmImageInput" value="${escapeHtml(state.image)}">
        <div id="ocmImagePreview"></div>
      </div>
    </div>`;
  }

  function stepGoalHtml() {
    return `<div class="panel">
      <h3 style="margin-top:0">Bước 3 — Mục tiêu Marketing</h3>
      <div class="form-group"><label>Khuyến mãi</label><textarea id="ocmPromotion" rows="3" placeholder="VD: Giảm 20% cuối tuần, tặng phụ kiện...">${escapeHtml(state.promotion)}</textarea></div>
    </div>`;
  }

  function reviewRow(label, value) {
    return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value) || '<span style="color:var(--ink-mute)">(chưa nhập)</span>'}</td></tr>`;
  }

  function stepReviewHtml() {
    return `<div class="panel">
      <h3 style="margin-top:0">Bước 4 — Xem lại</h3>
      <table class="admin-table">
        <tbody>
          ${reviewRow('Thông tin doanh nghiệp', state.businessName)}
          ${reviewRow('Địa chỉ', state.address)}
          ${reviewRow('Tên sản phẩm', state.productName)}
          ${reviewRow('Giá', state.price)}
          ${reviewRow('Danh mục', state.category)}
          ${reviewRow('Khuyến mãi', state.promotion)}
        </tbody>
      </table>
    </div>`;
  }

  function outputRow(label, content) {
    return `<div class="panel"><h4 style="margin:0 0 0.5rem">${escapeHtml(label)}</h4><div class="small-muted" style="white-space:pre-wrap">${escapeHtml(content)}</div></div>`;
  }

  // outputRowWithStatus — giống outputRow() nhưng thêm 1 dòng trạng thái
  // Job AI THẬT (nếu đã bấm GENERATE) cho 4 output đã nối Plugin (Sprint 11
  // Requirement #1). Không đổi hiển thị bản xem trước dạng mẫu bên trên.
  function outputRowWithStatus(label, content, outputKey) {
    const info = state.generatedJobs && state.generatedJobs[outputKey];
    let statusHtml = '';
    if (info) {
      statusHtml = info.error
        ? `<p class="small-muted" style="color:#b3261e;margin:0.4rem 0 0">AI thật: ${escapeHtml(info.error)}</p>`
        : `<p class="small-muted" style="margin:0.4rem 0 0">AI thật: ${escapeHtml(jobStatusLabel(info.status))}</p>`;
    }
    return `<div class="panel"><h4 style="margin:0 0 0.5rem">${escapeHtml(label)}</h4><div class="small-muted" style="white-space:pre-wrap">${escapeHtml(content)}</div>${statusHtml}</div>`;
  }

  function stepGenerateHtml() {
    if (!packageResult) {
      return `<div class="panel"><p class="small-muted">Bấm "Sinh Gói Marketing" để tạo bản xem trước dạng mẫu — CHƯA gọi AI thật.</p></div>`;
    }
    const p = packageResult;
    const jobsStarted = hasPendingOrDoneJobs(state);
    return `
      <p style="margin-bottom:1rem"><strong style="color:var(--gold-ink)">Review Center — Gói Marketing (bản xem trước dạng mẫu bên dưới mỗi mục; trạng thái "AI thật" chỉ xuất hiện sau khi bấm GENERATE)</strong></p>
      <div class="panel"><h4 style="margin:0 0 0.5rem">Doanh nghiệp / Sản phẩm / Giá / Khuyến mãi</h4>
        <table class="admin-table"><tbody>
          ${reviewRow('Doanh nghiệp', state.businessName)}
          ${reviewRow('Sản phẩm', state.productName)}
          ${reviewRow('Giá', state.price)}
          ${reviewRow('Khuyến mãi', state.promotion)}
        </tbody></table>
      </div>
      ${outputRowWithStatus('Website Draft', p.websiteArticle.title + '\n\n' + p.websiteArticle.body, 'websiteArticle')}
      ${outputRowWithStatus('Facebook Draft', p.facebookPost.text, 'facebookPost')}
      ${outputRow('SEO Metadata', 'Title: ' + p.seoMetadata.title + '\nDescription: ' + p.seoMetadata.description)}
      <p class="small-muted" style="margin:-0.5rem 0 0.8rem">SEO Metadata chưa kết nối AI thật — Plugin "SEO Generator" cần 1 Bài viết đã tồn tại thật trong CMS, One Click Marketing chưa tạo Bài viết nào (xem ROADMAP.md).</p>
      ${outputRowWithStatus('Banner Request', 'Chủ đề: ' + p.bannerRequest.theme + '\nLink: ' + (p.bannerRequest.link || '(chưa có)'), 'bannerRequest')}
      ${outputRowWithStatus('Image Request', p.aiImageRequest.note, 'aiImageRequest')}
      ${outputRow('Video Request', p.aiVideoRequest.note)}
      <div class="admin-actions" style="margin-top:1rem">
        <button class="submit-btn" id="ocmEditBtn" style="background:var(--bg-alt);color:var(--ink)">SỬA LẠI (EDIT)</button>
        <button class="submit-btn" id="ocmGenerateRealBtn" ${jobsStarted ? 'disabled' : ''}>${jobsStarted ? 'ĐÃ GỬI YÊU CẦU AI' : 'GENERATE'}</button>
      </div>
      <p class="small-muted" id="ocmGenerateNote" style="margin-top:0.5rem"></p>`;
  }

  function stepBodyHtml() {
    if (currentStep === 0) return stepBusinessHtml();
    if (currentStep === 1) return stepProductHtml();
    if (currentStep === 2) return stepGoalHtml();
    if (currentStep === 3) return stepReviewHtml();
    return stepGenerateHtml();
  }

  function navHtml() {
    const isFirst = currentStep === 0;
    const isLast = currentStep === STEP_LABELS.length - 1;
    return `<div class="admin-actions" style="margin-top:1rem">
      ${!isFirst ? '<button class="submit-btn" id="ocmPrevBtn" style="background:var(--bg-alt);color:var(--ink)">TRƯỚC</button>' : ''}
      <button class="submit-btn" id="ocmSaveDraftBtn" style="background:var(--bg-alt);color:var(--ink)">LƯU NHÁP</button>
      ${!isLast ? `<button class="submit-btn" id="ocmNextBtn">${currentStep === 3 ? 'SINH GÓI MARKETING' : 'TIẾP THEO'}</button>` : ''}
    </div>`;
  }

  function readStepInputs() {
    if (currentStep === 0) {
      state.businessName = document.getElementById('ocmBusinessName').value.trim();
      state.address = document.getElementById('ocmAddress').value.trim();
    } else if (currentStep === 1) {
      state.productName = document.getElementById('ocmProductName').value.trim();
      state.price = document.getElementById('ocmPrice').value.trim();
      state.category = document.getElementById('ocmCategory').value;
      state.image = document.getElementById('ocmImageInput').value.trim();
    } else if (currentStep === 2) {
      state.promotion = document.getElementById('ocmPromotion').value.trim();
    }
  }

  function render() {
    const root = document.getElementById('ocmWizardRoot');
    root.innerHTML = progressHtml() + stepBodyHtml() + (currentStep < STEP_LABELS.length ? navHtml() : '');
    attachStepHandlers();
  }

  function attachStepHandlers() {
    document.querySelectorAll('.ocmStepBadge').forEach(btn => {
      btn.addEventListener('click', () => {
        readStepInputs();
        currentStep = parseInt(btn.dataset.step, 10);
        render();
      });
    });

    if (currentStep === 1) {
      const select = document.getElementById('ocmProductSelect');
      select.addEventListener('change', () => {
        const chosen = products.find(p => p.id === select.value);
        if (chosen) {
          state.productId = chosen.id;
          document.getElementById('ocmProductName').value = chosen.name || '';
          document.getElementById('ocmPrice').value = chosen.price || '';
          document.getElementById('ocmCategory').value = chosen.category || '';
          document.getElementById('ocmImageInput').value = (chosen.image || (chosen.images && chosen.images[0]) || '');
          mediaPicker && mediaPicker.refresh();
        } else {
          state.productId = '';
        }
      });
      mediaPicker = MediaLibraryPicker.mount('ocmImageInput', 'ocmImagePreview');
    }

    const prevBtn = document.getElementById('ocmPrevBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => { readStepInputs(); currentStep -= 1; render(); });

    const nextBtn = document.getElementById('ocmNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      readStepInputs();
      currentStep += 1;
      if (currentStep === STEP_LABELS.length - 1) {
        // Buoc 5: dung OneClickMarketing.buildMarketingPackage() (ham
        // thuan, khong AI) - KHONG goi PluginManager/AIJobQueue/Provider.
        packageResult = OneClickMarketing.buildMarketingPackage(state);
      }
      saveDraft();
      render();
    });

    const saveDraftBtn = document.getElementById('ocmSaveDraftBtn');
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => { readStepInputs(); saveDraft(); saveDraftBtn.textContent = 'ĐÃ LƯU'; setTimeout(() => { saveDraftBtn.textContent = 'LƯU NHÁP'; }, 1500); });

    const editBtn = document.getElementById('ocmEditBtn');
    // Sprint 10 Requirement #4: nhay ve Buoc 4 "Xem lai" (gan Review Center
    // nhat) thay vi Buoc 1 - tranh phai bam lai "TIEP THEO" 3 lan chi de sua
    // 1 chi tiet nho. Van con nut "TRUOC" tu Buoc 4 neu can lui xa hon.
    if (editBtn) editBtn.addEventListener('click', () => { currentStep = 3; render(); });

    const generateRealBtn = document.getElementById('ocmGenerateRealBtn');
    if (generateRealBtn) generateRealBtn.addEventListener('click', () => {
      if (generateRealBtn.disabled) return;
      triggerRealGeneration();
    });
  }

  return { init };
})();
