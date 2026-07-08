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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, currentStep })); } catch (e) { /* localStorage không khả dụng - bỏ qua, không phải lỗi nghiêm trọng */ }
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
          renderResumeBanner();
        } else {
          state = defaultState();
          state.businessName = settings.siteName || '';
          state.address = settings.address || '';
        }
        render();
      });
    });
  }

  function renderResumeBanner() {
    const banner = document.getElementById('ocmResumeBanner');
    banner.style.display = 'block';
    banner.innerHTML = `<p class="small-muted">Có 1 bản nháp chưa hoàn tất — đang tiếp tục từ bước "${escapeHtml(STEP_LABELS[currentStep])}". <a href="#" id="ocmStartOver" style="color:var(--gold-ink)">Bắt đầu lại từ đầu</a></p>`;
    document.getElementById('ocmStartOver').addEventListener('click', e => {
      e.preventDefault();
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

  function stepGenerateHtml() {
    if (!packageResult) {
      return `<div class="panel"><p class="small-muted">Bấm "Sinh Gói Marketing" để tạo bản xem trước dạng mẫu — CHƯA gọi AI thật.</p></div>`;
    }
    const p = packageResult;
    return `
      <p style="margin-bottom:1rem"><strong style="color:var(--gold-ink)">Review Center — Gói Marketing (bản xem trước dạng mẫu — KHÔNG phải nội dung AI đã sinh thật)</strong></p>
      <div class="panel"><h4 style="margin:0 0 0.5rem">Doanh nghiệp / Sản phẩm / Giá / Khuyến mãi</h4>
        <table class="admin-table"><tbody>
          ${reviewRow('Doanh nghiệp', state.businessName)}
          ${reviewRow('Sản phẩm', state.productName)}
          ${reviewRow('Giá', state.price)}
          ${reviewRow('Khuyến mãi', state.promotion)}
        </tbody></table>
      </div>
      ${outputRow('Website Draft', p.websiteArticle.title + '\n\n' + p.websiteArticle.body)}
      ${outputRow('Facebook Draft', p.facebookPost.text)}
      ${outputRow('SEO Metadata', 'Title: ' + p.seoMetadata.title + '\nDescription: ' + p.seoMetadata.description)}
      ${outputRow('Banner Request', 'Chủ đề: ' + p.bannerRequest.theme + '\nLink: ' + (p.bannerRequest.link || '(chưa có)'))}
      ${outputRow('Image Request', p.aiImageRequest.note)}
      ${outputRow('Video Request', p.aiVideoRequest.note)}
      <div class="admin-actions" style="margin-top:1rem">
        <button class="submit-btn" id="ocmEditBtn" style="background:var(--bg-alt);color:var(--ink)">SỬA LẠI (EDIT)</button>
        <button class="submit-btn" id="ocmGenerateRealBtn">GENERATE</button>
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
      document.getElementById('ocmGenerateNote').textContent = 'Sinh nội dung AI thật CHƯA được kết nối ở Requirement này (Foundation only) — đây chỉ là bản xem trước dạng mẫu. Xem ROADMAP.md cho Requirement kết nối AI Provider thật.';
    });
  }

  return { init };
})();
