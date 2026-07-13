/*
 * admin-agent.js — Founder Agent V4: Complete Product Creation (Sprint 13)
 * V1: 1 lệnh -> 1 công cụ -> 1 Draft. V2: 1 lệnh -> nhiều bước (Execution
 * Plan) -> Plugin/Queue/Draft. V3: THÊM khả năng "vận hành CMS thay Founder"
 * (điều hướng trang thật). V4: THÊM khả năng tạo 1 Sản phẩm gần như đầy đủ
 * chỉ từ 1 dòng gợi ý — nghiên cứu tên/thương hiệu, kiểm tra trùng lặp, tự
 * gán Danh mục, viết nội dung (tái dùng Product AI), gợi ý Sản phẩm liên
 * quan, tính Điểm chất lượng, báo cáo thông tin còn thiếu — cộng khả năng
 * đính kèm ảnh/file/Micro ngay tại ô nhập.
 *
 * GIỚI HẠN THẬT ĐÃ XÁC NHẬN VỚI CHIEF ARCHITECT (không tự bịa để "cho đủ"):
 * hệ thống KHÔNG có khả năng duyệt Internet thật (không có Search API/
 * scraping/YouTube Data API) — vì vậy V4 KHÔNG tự thu thập "Official Image/
 * Official YouTube/Official Manual" như Requirement gốc mô tả. "Nghiên cứu"
 * (research-product) chỉ là 1 lượt hỏi GPT-4o-mini dựa trên kiến thức đã
 * học sẵn (có thể sai/lỗi thời) để đoán TÊN/THƯƠNG HIỆU/MODEL đầy đủ — LUÔN
 * hiển thị rõ đây là "AI đề xuất, chưa xác minh", KHÔNG bao giờ tự nhận là
 * đã tra cứu nguồn chính hãng thật ("Never invent specifications" / "Never
 * fabricate information" áp dụng nghiêm ngặt). Vì lý do tương tự, các mục
 * Ảnh/Video/Tài liệu chính hãng sẽ LUÔN xuất hiện trong "Báo cáo thiếu
 * thông tin" — đây là phản ánh ĐÚNG THỰC TẾ, không phải lỗi.
 *
 * KIẾN TRÚC: 6 tool mới (research-product/check-duplicate/detect-category/
 * related-products/quality-score/missing-info-report) THÊM VÀO cùng danh
 * sách tool đã có (V1-V3) trong CÙNG 1 Execution Plan — dùng lại NGUYÊN VẸN
 * Product AI (product-description-writer) để sinh nội dung, KHÔNG viết
 * Plugin mới, KHÔNG gọi AI 2 lần cho cùng việc. Việc GÁN DANH MỤC tự động
 * (detect-category, độ tin cậy >=90%) và TẠO SẢN PHẨM (create-product) là 2
 * NGOẠI LỆ ghi Firebase trực tiếp — cả 2 đều là dữ liệu CẤU TRÚC (structural:
 * ID mới, mã Danh mục đã có sẵn), KHÔNG PHẢI "nội dung AI sinh ra" (content),
 * nên không vi phạm "Never generate content directly"/"Draft Before Publish"
 * — đúng tiền lệ đã thiết lập ở V1 cho create-product. Mọi NỘI DUNG văn bản
 * (mô tả/thông số/SEO/Blog/Facebook/Banner/Image) vẫn dừng lại ở Draft như
 * cũ, Founder phải tự Publish.
 *
 * Mọi bước Plugin (V1/V2) vẫn đi ĐÚNG Permission -> PluginManager -> Queue ->
 * Draft như cũ, không đổi gì.
 */
const AdminAgent = (function () {
  const PROXY_URL = 'https://us-central1-pshop-music.cloudfunctions.net/openaiProxy';

  // "$product" — token đại diện cho ID sản phẩm SẼ ĐƯỢC TẠO bởi bước
  // "create-product" trong CÙNG 1 Plan (chưa tồn tại tại thời điểm lập kế
  // hoạch — Planner không thể biết trước ID thật). resolveInputParams() thay
  // token này bằng ID thật NGAY TRƯỚC KHI chạy 1 bước, chỉ khi bước
  // "create-product" trong CÙNG Plan đã Completed.
  const PRODUCT_TOKEN = '$product';

  // "$research.<field>" — token đại diện cho kết quả bước "research-product"
  // (TÊN/THƯƠNG HIỆU/MODEL do AI đề xuất) trong CÙNG Plan — chỉ resolve khi
  // bước research-product đã Completed, cùng cơ chế với "$product".
  const RESEARCH_TOKENS = ['$research.name', '$research.brand', '$research.model'];

  // Map tool -> tên thân thiện + icon. "create-product" và "seo" KHÔNG PHẢI
  // Plugin thật (xem executeStep()) — "seo" là mốc hiển thị, gộp chung 1 lần
  // generate với product-description-writer (Product AI đã sinh đủ cả nội
  // dung LẪN field SEO trong 1 JSON — đúng nguyên tắc "tránh gọi AI 2 lần"
  // đã áp dụng từ Sprint 12 Requirement #10, nút "Generate SEO" trên
  // admin/products.html cũng gọi CHUNG plugin này, không phải plugin riêng).
  const TOOL_MAP = {
    'create-product':             { label: 'Tạo Sản phẩm mới', icon: '🆕' },
    'product-description-writer': { label: 'Product AI',       icon: '🎸' },
    'seo':                        { label: 'SEO',               icon: '🔍' },
    'blog-writer':                { label: 'Blog AI',          icon: '📝' },
    'facebook-post-generator':    { label: 'Facebook AI',      icon: '📱' },
    'banner-generator':           { label: 'Banner AI',        icon: '🖼' },
    'image-generator':            { label: 'Image AI',         icon: '✨' },
    'slider-generator':           { label: 'Slider AI',        icon: '🎞' },
    'faq-generator':              { label: 'FAQ AI',           icon: '❓' },
    // Sprint 13 V3 (CMS Operator) — điều hướng trình duyệt, KHÔNG gọi Plugin/
    // Queue/Draft nào, xem executeStep().
    'open-product':                { label: 'Mở Sản phẩm',     icon: '📂' },
    'update-product-field':        { label: 'Sửa Sản phẩm',    icon: '✏️' },
    'open-draft':                  { label: 'Mở Nháp',          icon: '📄' },
    'navigate':                    { label: 'Mở trang CMS',    icon: '🧭' },
    // Sprint 13 V4 (Complete Product Creation) — xem chú thích đầu file.
    'research-product':            { label: 'Nghiên cứu (AI)', icon: '🔎' },
    'check-duplicate':             { label: 'Kiểm tra trùng lặp', icon: '🔁' },
    'detect-category':             { label: 'Tự động gán Danh mục', icon: '🏷' },
    'related-products':            { label: 'Sản phẩm liên quan', icon: '🔗' },
    'quality-score':               { label: 'Điểm chất lượng', icon: '⭐' },
    'missing-info-report':         { label: 'Báo cáo thiếu thông tin', icon: '📋' }
  };

  // NAV_PAGES — "Navigate CMS": trang CMS thật Agent được phép điều hướng
  // tới (Reuse existing pages — không tạo trang mới).
  const NAV_PAGES = {
    products: '/admin/products.html',
    categories: '/admin/categories.html',
    blog: '/admin/blog.html',
    banners: '/admin/banners.html',
    drafts: '/admin/ai/drafts.html',
    'social-media': '/admin/social-media-center.html',
    images: '/admin/ai/images.html'
  };

  // AGENT_FIELD_LABELS — field Sản phẩm Agent được phép điền qua
  // update-product-field (khớp ĐÚNG AGENT_FIELD_MAP ở js/admin-products.js —
  // 2 danh sách phải cùng bộ khóa, xem PROJECT_ARCHITECTURE.md).
  const AGENT_FIELD_LABELS = { price: 'Giá', oldprice: 'Giá cũ', name: 'Tên', warranty: 'Bảo hành', stockstatus: 'Trạng thái kho', status: 'Tình trạng', sku: 'SKU' };

  const STATUS_LABEL = {
    pending: 'Chờ chạy', running: 'Đang chạy', completed: 'Hoàn tất', failed: 'Thất bại', skipped: 'Đã bỏ qua',
    'duplicate-found': 'Trùng lặp — cần xác nhận', 'category-review': 'Chờ xác nhận Danh mục'
  };

  const CATEGORY_CONFIDENCE_AUTO = 90; // ">=90% Assign automatically. <90% Suggest Categories. Founder confirms."

  const SUGGESTED = [
    { label: 'Mở sản phẩm',            text: 'Mở Pioneer RX3' },
    { label: 'Đổi giá sản phẩm',       text: 'Đổi giá Pioneer RX3 thành 48 triệu' },
    { label: 'Tạo sản phẩm đầy đủ',    text: 'Tạo sản phẩm Pioneer XDJ-RX3' },
    { label: 'Blog + Facebook cho RX3', text: 'Viết Blog và Facebook cho Pioneer RX3' }
  ];

  let messages = []; // { id, role:'user'|'agent', text, steps:[...], attachments:[...] }
  let user = null;
  let products = [];
  let blogPosts = [];
  let categories = [];
  let isBusy = false; // chặn gửi lệnh mới trong khi 1 Plan đang Run All (không chặn Run Step/Skip/Retry của Plan đang hiện — chỉ chặn gửi tin nhắn MỚI)
  let pendingAttachments = []; // { type:'image'|'file'|'error', name, url, uploading, error } chờ gửi kèm tin nhắn TIẾP THEO
  let micRecognizer = null;

  // ── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    AdminAuth.init({ page: 'founder-agent', title: 'FOUNDER AGENT' }).then(({ user: u }) => {
      user = u;
      Promise.all([
        DB.getAll ? DB.getAll() : Promise.resolve([]),
        BlogDB && BlogDB.getAll ? BlogDB.getAll() : Promise.resolve([]),
        typeof CategoryDB !== 'undefined' && CategoryDB.getAll ? CategoryDB.getAll() : Promise.resolve([])
      ]).then(([prods, posts, cats]) => {
        products = Array.isArray(prods) ? prods : [];
        blogPosts = Array.isArray(posts) ? posts : [];
        categories = Array.isArray(cats) ? cats : [];
        renderSuggested();
      }).catch(() => renderSuggested());
    });

    document.getElementById('agentInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.getElementById('agentInput').addEventListener('paste', handlePaste);
    document.getElementById('agentSendBtn').addEventListener('click', send);

    const wrap = document.getElementById('agentChatWrap');
    if (wrap) {
      wrap.addEventListener('dragover', e => { e.preventDefault(); });
      wrap.addEventListener('drop', handleDrop);
    }
  }

  // ── SUGGESTED ACTIONS ───────────────────────────────────────────────────────

  function renderSuggested() {
    const wrap = document.getElementById('agentSuggestions');
    if (!wrap) return;
    wrap.innerHTML = SUGGESTED.map(s =>
      `<button type="button" class="agent-suggestion-chip" onclick="AdminAgent.useSuggestion(${JSON.stringify(s.text)})">${escHtml(s.label)}</button>`
    ).join('');
  }

  function useSuggestion(text) {
    document.getElementById('agentInput').value = text;
    send();
  }

  // ── INPUT: ĐÍNH KÈM ẢNH / FILE / DÁN / KÉO-THẢ / MICRO ──────────────────────
  // "Image Upload -> Media Library -> Upload", "Drag & Drop", "Paste (Ctrl+V)",
  // "Attach File", "Microphone -> Speech To Text -> Fill Prompt" — tái dụng
  // NGUYÊN VẸN MediaLibrary/StorageUpload đã có (0 logic Storage mới); ảnh
  // đính kèm vào Media Library dùng chung, file khác (PDF...) đi thư mục
  // riêng "agent-files" qua ĐÚNG StorageUpload.uploadImage() (chỉ là tên hàm
  // lịch sử, hàm này không kiểm tra/giới hạn kiểu file — xem js/storage-
  // upload.js). Trình duyệt KHÔNG có khả năng đọc nội dung PDF/DOCX/XLSX/ZIP
  // để trích xuất thông số — file được lưu lại làm tham chiếu, Agent nói rõ
  // giới hạn này, không giả vờ đã "đọc" được nội dung.

  function attachImage() {
    if (typeof MediaLibraryPicker === 'undefined') { alert('Thư viện ảnh chưa sẵn sàng.'); return; }
    MediaLibraryPicker.openModal(url => {
      pendingAttachments.push({ type: 'image', name: 'Ảnh đính kèm', url });
      renderPendingAttachments();
    });
  }

  function attachFileClick() {
    const input = document.getElementById('agentFileInput');
    if (input) input.click();
  }

  function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) uploadAttachment(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadAttachment(file);
  }

  function handlePaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        const file = items[i].getAsFile();
        if (file) { uploadAttachment(file); e.preventDefault(); }
        break;
      }
    }
  }

  function uploadAttachment(file) {
    const isImage = file.type && file.type.indexOf('image/') === 0;
    const record = { type: isImage ? 'image' : 'file', name: file.name, uploading: true };
    pendingAttachments.push(record);
    renderPendingAttachments();

    const uploadPromise = isImage
      ? MediaLibrary.upload(file)
      : StorageUpload.uploadImage(file, 'agent-files');

    uploadPromise.then(url => {
      record.uploading = false;
      record.url = url;
      renderPendingAttachments();
    }).catch(err => {
      record.uploading = false;
      record.error = err.message;
      renderPendingAttachments();
    });
  }

  function removeAttachment(index) {
    pendingAttachments.splice(index, 1);
    renderPendingAttachments();
  }

  function renderPendingAttachments() {
    const wrap = document.getElementById('agentAttachments');
    if (!wrap) return;
    if (!pendingAttachments.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = pendingAttachments.map((a, i) => {
      const icon = a.type === 'image' ? '🖼' : (a.type === 'error' ? '⚠' : '📎');
      const status = a.uploading ? ' (đang tải lên...)' : (a.error ? ' (lỗi: ' + escHtml(a.error) + ')' : '');
      return `<span class="agent-attachment-chip">${icon} ${escHtml(a.name)}${status} <button type="button" onclick="AdminAgent.removeAttachment(${i})">✕</button></span>`;
    }).join('');
  }

  // Ghi âm -> Văn bản qua Web Speech API CÓ SẴN trong trình duyệt (Chrome/Edge)
  // — KHÔNG cần Cloud Function/API key mới, hoàn toàn client-side, 0 chi phí
  // mới phát sinh. Nếu trình duyệt không hỗ trợ, báo rõ thay vì im lặng.
  function toggleMic() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { alert('Trình duyệt này không hỗ trợ Ghi âm → Văn bản. Hãy dùng Chrome/Edge, hoặc nhập tay.'); return; }
    if (micRecognizer) { micRecognizer.stop(); return; }
    const btn = document.getElementById('agentMicBtn');
    micRecognizer = new SpeechRec();
    micRecognizer.lang = 'vi-VN';
    micRecognizer.interimResults = false;
    micRecognizer.onresult = function (e) {
      const text = e.results[0][0].transcript;
      const input = document.getElementById('agentInput');
      input.value = (input.value ? input.value + ' ' : '') + text;
    };
    micRecognizer.onerror = function (e) { alert('Lỗi Ghi âm: ' + e.error); };
    micRecognizer.onend = function () { micRecognizer = null; if (btn) btn.classList.remove('agent-mic-active'); };
    micRecognizer.start();
    if (btn) btn.classList.add('agent-mic-active');
  }

  // ── SEND ─────────────────────────────────────────────────────────────────────

  function send() {
    if (isBusy) return;
    const input = document.getElementById('agentInput');
    const text = input.value.trim();
    const attachments = pendingAttachments.filter(a => a.url); // chỉ gửi kèm file đã tải lên xong
    if (!text && !attachments.length) return;
    input.value = '';
    pendingAttachments = [];
    renderPendingAttachments();

    messages.push({ role: 'user', text: text || '(đính kèm)', attachments });
    renderMessages();
    hideSuggested();
    planAndShow(text, attachments);
  }

  function hideSuggested() {
    const el = document.getElementById('agentSuggestions');
    if (el) el.style.display = 'none';
  }

  // ── AI HELPER — 1 hàm fetch DÙNG CHUNG cho Planner + research-product +
  // detect-category (tránh lặp lại boilerplate fetch/token 3 nơi) — vẫn ĐÚNG
  // 1 Cloud Function openaiProxy đã có, không thêm Provider/API key mới.

  async function callOpenAI(promptText) {
    const idToken = await user.getIdToken();
    const r = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ action: 'generate', model: 'gpt-4o-mini', prompt: promptText })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'AI lỗi.');
    return (data.text || '').trim();
  }

  function parseAIJson(raw) {
    const cleaned = String(raw || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(cleaned); } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch (e2) { return null; } }
      return null;
    }
  }

  // ── PLANNER — GPT-4o-mini qua ĐÚNG Cloud Function openaiProxy đã có ─────────
  // (action="generate", không thêm Provider/API Key/Cloud Function mới — cùng
  // cách V1 dùng cho Tool Router, chỉ khác giờ trả về MẢNG bước thay vì 1
  // bước). Planner CHỈ xây kế hoạch — KHÔNG side-effect, không gọi Plugin nào
  // ở đây (đúng "The Agent itself never generates content. It only builds
  // and executes a plan" — bước "executes" nằm ở executeStep(), tách biệt).

  async function planAndShow(userText, attachments) {
    isBusy = true;
    setInputEnabled(false);
    const msgId = pushAgentMsg({ text: 'Đang lập kế hoạch...', steps: null });
    renderMessages();

    try {
      const plan = await buildPlan(userText, attachments);
      if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
        updateMsg(msgId, { text: (plan && plan.reason) || 'Không hiểu được yêu cầu này — hãy mô tả cụ thể hơn.', steps: [] });
        renderMessages();
        return;
      }
      const steps = plan.steps.map(s => normalizeStep(s));
      // Ảnh đính kèm (nếu có) dùng làm Ảnh đại diện cho bước create-product
      // trong CÙNG Plan — media THẬT do Founder cung cấp, không phải AI sinh.
      const imageAttachment = (attachments || []).find(a => a.type === 'image');
      if (imageAttachment) {
        const createStep = steps.find(s => s.tool === 'create-product');
        if (createStep) createStep.attachedImageUrl = imageAttachment.url;
      }
      const fileAttachment = (attachments || []).find(a => a.type === 'file');
      let introText = steps.length > 1 ? `Đã lập Execution Plan gồm ${steps.length} bước:` : 'Đã hiểu yêu cầu:';
      if (fileAttachment) {
        introText += ' (Đã nhận file "' + fileAttachment.name + '" — hệ thống hiện chưa tự đọc được nội dung PDF/Word/Excel/ZIP để trích xuất thông số, vui lòng mô tả thêm bằng văn bản nếu cần.)';
      }
      updateMsg(msgId, { text: introText, steps });
      renderMessages();
    } catch (err) {
      updateMsg(msgId, { text: 'Lỗi lập kế hoạch: ' + err.message, steps: [] });
      renderMessages();
    } finally {
      isBusy = false;
      setInputEnabled(true);
    }
  }

  function normalizeStep(s) {
    return {
      tool: s.tool,
      target: s.target || '',
      inputParams: s.inputParams || {},
      status: 'pending',
      errorText: null,
      draftId: null,
      productId: null
    };
  }

  async function buildPlan(userText, attachments) {
    const productList = products.slice(0, 30).map(p => `- ${p.name} (id:${p.id}, sku:${p.sku || ''})`).join('\n');
    const blogList = blogPosts.slice(0, 10).map(b => `- ${b.title} (id:${b.id})`).join('\n');
    const categoryList = categories.filter(c => c.active !== false).map(c => `${c.code} (${c.label})`).join(', ');
    const attachmentNote = (attachments || []).length
      ? '\n\nFounder đã đính kèm: ' + attachments.map(a => (a.type === 'image' ? 'Ảnh sản phẩm' : 'File ' + a.name)).join(', ') + '.'
      : '';

    const systemPrompt = `Bạn là Task Planner của PSH Platform (cửa hàng âm thanh DJ). Phân tích yêu cầu của Founder — CÓ THỂ cần NHIỀU công cụ — và trả về 1 Execution Plan dạng JSON (mảng các bước, ĐÚNG THỨ TỰ nên chạy).

Available tools (dùng ĐÚNG tên "tool" sau):
- research-product: Dùng KIẾN THỨC AI đã học (KHÔNG duyệt Internet thật) để đoán TÊN ĐẦY ĐỦ/THƯƠNG HIỆU/MODEL từ 1 gợi ý ngắn (vd "RX3"). CHỈ dùng khi Founder gõ tên sản phẩm CÓ VẺ viết tắt/không đầy đủ VÀ đang muốn TẠO sản phẩm mới. inputParams: {"hint": "<đúng nguyên văn Founder gõ>"}
- check-duplicate: Kiểm tra Sản phẩm đã tồn tại trước khi tạo mới (Tên/SKU/Model/Slug). LUÔN đặt NGAY TRƯỚC create-product khi Founder muốn TẠO sản phẩm mới. inputParams: {"name": "<tên, hoặc \"$research.name\" nếu có bước research-product trước đó>"}
- create-product: TẠO MỚI 1 sản phẩm trống (chỉ có Tên/Thương hiệu/Model). Dùng khi Founder nói "tạo sản phẩm X" và X CHƯA có trong danh sách sản phẩm dưới đây. inputParams: {"name": "<tên, hoặc \"$research.name\">", "brand": "<hoặc \"$research.brand\", có thể bỏ trống>", "model": "<hoặc \"$research.model\", có thể bỏ trống>"}
- detect-category: Tự động phân tích và gán Danh mục phù hợp cho 1 sản phẩm ĐÃ CÓ (dùng danh sách Danh mục thật bên dưới, KHÔNG bịa mã mới). Đặt SAU create-product khi tạo sản phẩm mới. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- product-description-writer: viết mô tả + SEO cho 1 sản phẩm (ĐÃ CÓ SẴN hoặc VỪA được tạo ở bước create-product trong CÙNG Plan này). inputParams: {"productId": "<id thật, hoặc \"$product\" nếu là sản phẩm vừa tạo ở bước create-product CÙNG Plan>", "tone": "Chuyên nghiệp"}
- seo: mốc hiển thị "SEO đã gộp chung vào Product AI" — CHỈ thêm bước này NGAY SAU 1 bước product-description-writer trong CÙNG Plan (không dùng riêng lẻ). inputParams: {}
- blog-writer: viết bài blog. inputParams: {"topic": "<chủ đề>", "tone": "Chuyên nghiệp", "keywords": "", "productId": "<id thật, hoặc \"$product\", hoặc bỏ trống nếu không liên quan sản phẩm nào>"}
- facebook-post-generator: viết bài Facebook. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- banner-generator: tạo banner quảng cáo. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- image-generator: tạo ảnh marketing AI. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- related-products: gợi ý Sản phẩm liên quan (cùng Danh mục/Thương hiệu). Đặt SAU detect-category khi tạo sản phẩm mới. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- quality-score: tính Điểm chất lượng Sản phẩm (dựa trên dữ liệu THẬT đã có, không bịa). Đặt gần cuối Plan tạo sản phẩm mới, SAU các bước AI content. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- missing-info-report: báo cáo thông tin còn thiếu (Ảnh/Video/Tài liệu/Bảo hành/Danh mục). Đặt SAU quality-score. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- open-product: MỞ trang Sửa 1 sản phẩm ĐÃ CÓ SẴN (KHÔNG sinh nội dung, chỉ điều hướng). Dùng khi Founder nói "Mở X"/"Xem X"/"Sửa X" mà không nói rõ đổi field nào, HOẶC làm bước CUỐI CÙNG của 1 Plan tạo sản phẩm mới đầy đủ (để Founder Review). inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- update-product-field: MỞ trang Sửa 1 sản phẩm VÀ điền sẵn 1 field cụ thể (Founder tự bấm Lưu — Agent KHÔNG tự lưu). Dùng khi Founder nói "Đổi <field> của X thành <giá trị>". Field hợp lệ: price/oldprice/name/warranty/stockstatus/status/sku. inputParams: {"productId": "<id thật>", "field": "<1 trong các field hợp lệ>", "value": "<giá trị mới, format đúng kiểu hiển thị — vd giá tiền viết đầy đủ số + đơn vị ₫, vd \"48 triệu\" => \"48.000.000 ₫\">"}
- open-draft: MỞ Social Media Center và làm nổi bật Draft mới nhất khớp yêu cầu (Founder muốn XEM/ĐĂNG 1 Draft ĐÃ TỒN TẠI, không phải tạo mới). Dùng khi Founder nói "Mở Draft Facebook X"/"Đăng Facebook X" (khi RÕ RÀNG muốn xem bản đã có, không phải viết bài mới). inputParams: {"moduleId": "facebook-post-generator" | "banner-generator" | "blog-writer" | "product-description-writer" (tùy loại), "query": "<từ khóa tìm, vd tên sản phẩm>"}
- navigate: MỞ 1 trang CMS chung (không gắn 1 bản ghi cụ thể). inputParams: {"page": "products"|"categories"|"blog"|"banners"|"drafts"|"social-media"|"images"}

QUY TẮC ĐẶC BIỆT — "$product": nếu Plan có bước create-product, MỌI bước sau đó nhắm vào ĐÚNG sản phẩm vừa tạo phải dùng productId:"$product" (không bịa id giả) — hệ thống sẽ tự thay bằng ID thật sau khi bước create-product chạy xong.

QUY TẮC ĐẶC BIỆT — "$research.name"/"$research.brand"/"$research.model": nếu Plan có bước research-product, các bước check-duplicate/create-product SAU ĐÓ có thể dùng token này thay vì bịa tên/thương hiệu — hệ thống tự thay bằng kết quả nghiên cứu thật sau khi bước research-product chạy xong.

QUY TẮC ĐẶC BIỆT — "Tạo sản phẩm X đầy đủ" (Complete Product Creation): khi Founder muốn TẠO 1 sản phẩm mới ĐẦY ĐỦ (không chỉ tạo trống), LUÔN dùng ĐÚNG thứ tự: research-product (nếu tên có vẻ viết tắt) → check-duplicate → create-product → detect-category → product-description-writer → seo → blog-writer → facebook-post-generator → banner-generator → image-generator → related-products → quality-score → missing-info-report → open-product (bước cuối, để Founder Review). Nếu tên Founder gõ ĐÃ đầy đủ rõ ràng (có thương hiệu + model), có thể bỏ qua research-product và dùng thẳng tên đó.

QUY TẮC ĐẶC BIỆT — điều hướng: open-product/update-product-field/open-draft/navigate làm trình duyệt CHUYỂN TRANG NGAY — KHÔNG BAO GIỜ đặt bước nào khác SAU 1 trong 4 tool này trong CÙNG Plan (mọi bước sau sẽ không chạy được vì trang đã đổi). Nếu Founder chỉ muốn "Mở X"/"Đổi field", Plan CHỈ có ĐÚNG 1 bước.

VÍ DỤ ĐÃ XÁC NHẬN ĐÚNG (few-shot, làm mẫu — không phải sản phẩm cố định):
Founder: "Mở RX3" (RX3 ĐÃ có, id thật vd "p7") →
{"steps":[{"tool":"open-product","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7"}}]}

Founder: "Đổi giá RX3 thành 48 triệu" (RX3 ĐÃ có, id "p7") →
{"steps":[{"tool":"update-product-field","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7","field":"price","value":"48.000.000 ₫"}}]}

Founder: "Tạo sản phẩm Pioneer XDJ-RX3" (RX3 CHƯA có trong danh sách, tên ĐÃ đầy đủ) →
{"steps":[
  {"tool":"check-duplicate","target":"Pioneer XDJ-RX3","inputParams":{"name":"Pioneer XDJ-RX3"}},
  {"tool":"create-product","target":"Pioneer XDJ-RX3","inputParams":{"name":"Pioneer XDJ-RX3","brand":"Pioneer DJ","model":"XDJ-RX3"}},
  {"tool":"detect-category","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"product-description-writer","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product","tone":"Chuyên nghiệp"}},
  {"tool":"seo","target":"Pioneer XDJ-RX3","inputParams":{}},
  {"tool":"blog-writer","target":"Pioneer XDJ-RX3","inputParams":{"topic":"Pioneer XDJ-RX3","tone":"Chuyên nghiệp","keywords":"","productId":"$product"}},
  {"tool":"facebook-post-generator","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"banner-generator","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"image-generator","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"related-products","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"quality-score","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"missing-info-report","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}},
  {"tool":"open-product","target":"Pioneer XDJ-RX3","inputParams":{"productId":"$product"}}
]}

Founder: "Tạo sản phẩm RX3" (RX3 CHƯA có trong danh sách, tên VIẾT TẮT) →
{"steps":[
  {"tool":"research-product","target":"RX3","inputParams":{"hint":"RX3"}},
  {"tool":"check-duplicate","target":"RX3","inputParams":{"name":"$research.name"}},
  {"tool":"create-product","target":"RX3","inputParams":{"name":"$research.name","brand":"$research.brand","model":"$research.model"}},
  {"tool":"detect-category","target":"RX3","inputParams":{"productId":"$product"}},
  {"tool":"product-description-writer","target":"RX3","inputParams":{"productId":"$product","tone":"Chuyên nghiệp"}},
  {"tool":"seo","target":"RX3","inputParams":{}},
  {"tool":"related-products","target":"RX3","inputParams":{"productId":"$product"}},
  {"tool":"quality-score","target":"RX3","inputParams":{"productId":"$product"}},
  {"tool":"missing-info-report","target":"RX3","inputParams":{"productId":"$product"}},
  {"tool":"open-product","target":"RX3","inputParams":{"productId":"$product"}}
]}

Founder: "Viết Blog và Facebook cho RX3" (RX3 ĐÃ có trong danh sách, id thật vd "p7") →
{"steps":[
  {"tool":"blog-writer","target":"Pioneer RX3","inputParams":{"topic":"Pioneer RX3","tone":"Chuyên nghiệp","keywords":"","productId":"p7"}},
  {"tool":"facebook-post-generator","target":"Pioneer RX3","inputParams":{"productId":"p7"}}
]}

Founder: "Tạo Banner và ảnh Facebook cho RX3" (RX3 ĐÃ có, id "p7") →
{"steps":[
  {"tool":"image-generator","target":"Pioneer RX3","inputParams":{"productId":"p7"}},
  {"tool":"banner-generator","target":"Pioneer RX3","inputParams":{"productId":"p7"}}
]}

Danh sách sản phẩm hiện có:
${productList || '(chưa có)'}

Danh sách bài blog hiện có:
${blogList || '(chưa có)'}

Danh sách mã Danh mục ĐANG HOẠT ĐỘNG (chỉ tham khảo — detect-category sẽ tự đọc lại danh sách này khi chạy):
${categoryList || '(chưa có)'}

Quy tắc:
1. Nếu hiểu được yêu cầu, trả về: {"steps":[{"tool":"...","target":"...","inputParams":{...}}, ...]}
2. Yêu cầu chỉ cần 1 công cụ → mảng "steps" có ĐÚNG 1 phần tử (vẫn hợp lệ).
3. Nếu không hiểu được yêu cầu, trả về: {"steps":[],"reason":"<giải thích ngắn tiếng Việt>"}
4. Trả về JSON thuần, KHÔNG có markdown fence, KHÔNG có giải thích thêm.`;

    const raw = await callOpenAI(systemPrompt + '\n\nYêu cầu của Founder: ' + userText + attachmentNote);
    const parsed = parseAIJson(raw);
    return parsed || { steps: [], reason: 'Không phân tích được kế hoạch. Hãy thử diễn đạt cụ thể hơn.' };
  }

  // ── EXECUTION — mỗi bước Plugin đi ĐÚNG Permission -> PluginManager ->
  // Queue -> Draft (giống hệt V1). "create-product"/"detect-category" (chỉ
  // khi độ tin cậy >=90%) là 2 NGOẠI LỆ ghi Firebase trực tiếp — dữ liệu CẤU
  // TRÚC, không phải NỘI DUNG AI, xem chú thích đầu file. KHÔNG BAO GIỜ tự
  // chạy nếu Founder chưa bấm (Run All / Run Step) — đúng "Do NOT add
  // Autonomous Agent".

  // resolveInputParams — thay token "$product"/"$research.*" bằng giá trị
  // thật của bước TRƯỚC ĐÓ trong CÙNG PLAN (chỉ khi bước nguồn đã Completed)
  // — trả về null nếu còn token chưa resolve được (bước phụ thuộc CHƯA sẵn
  // sàng — chặn chạy nhầm với chuỗi token theo nghĩa đen).
  function resolveInputParams(step, allSteps) {
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
      }
    });
    return ok ? params : null;
  }

  async function executeStep(msgId, stepIndex) {
    const m = findMsg(msgId);
    if (!m) return 'failed';
    const step = m.steps[stepIndex];
    if (!step || step.status === 'running') return step ? step.status : 'failed';

    const resolvedParams = resolveInputParams(step, m.steps);
    if (resolvedParams === null) {
      step.status = 'failed';
      step.errorText = 'Cần hoàn thành bước trước đó trong Plan này trước — bấm THỬ LẠI sau khi bước đó Hoàn tất.';
      renderMessages();
      return 'failed';
    }

    step.status = 'running';
    step.errorText = null;
    renderMessages();

    try {
      if (step.tool === 'create-product') {
        const name = (resolvedParams.name || step.target || 'Sản phẩm mới').trim();
        const extra = {};
        if (resolvedParams.brand) extra.brand = String(resolvedParams.brand).trim();
        if (resolvedParams.model) extra.model = String(resolvedParams.model).trim();
        if (step.attachedImageUrl) { extra.images = [step.attachedImageUrl]; extra.image = step.attachedImageUrl; }
        // Không có Plugin nào "tạo sản phẩm mới" — không phải sinh NỘI DUNG
        // bằng AI (0 vi phạm "Never generate content directly"). Tái sử
        // dụng ĐÚNG DB.add() js/admin-products.js dùng cho sản phẩm mới.
        const newProduct = await DB.add(Object.assign({ name, pubStatus: 'draft' }, extra));
        step.productId = newProduct.id;
        products.push(newProduct); // đồng bộ cache cục bộ cho các bước SAU trong CÙNG phiên (detect-category/related-products/check-duplicate của Plan kế tiếp)
        step.status = 'completed';
      } else if (step.tool === 'research-product') {
        // "Smart Brand Detection" — CHỈ dựa trên kiến thức AI đã học, KHÔNG
        // duyệt Internet thật (hạ tầng chưa có, xem chú thích đầu file).
        // Nghiêm cấm bịa THÔNG SỐ ở đây — chỉ đoán TÊN/THƯƠNG HIỆU/MODEL.
        const hint = String(resolvedParams.hint || step.target || '').trim();
        const prompt = `Bạn là trợ lý xác định TÊN SẢN PHẨM ĐẦY ĐỦ cho cửa hàng thiết bị DJ/âm thanh, CHỈ dựa vào kiến thức đã học sẵn (KHÔNG có khả năng truy cập Internet/duyệt web thật — có thể sai hoặc lỗi thời). Founder gõ: "${hint}".
Nếu đây là tên viết tắt/model của 1 thiết bị DJ/âm thanh thật (vd "RX3" → "Pioneer XDJ-RX3"), đề xuất Tên đầy đủ CHUẨN kèm Thương hiệu (brand) + Model. TUYỆT ĐỐI KHÔNG suy đoán/bịa thông số kỹ thuật ở đây — CHỈ xác định Tên/Thương hiệu/Model. Nếu có NHIỀU khả năng, liệt kê tối đa 3 candidates. Nếu không chắc chắn, để confidence THẤP và ghi rõ lý do.
Trả về DUY NHẤT JSON: {"resolvedName":"...","brand":"...","model":"...","confidence":0-100,"candidates":["tên khác 1","tên khác 2"],"note":"..."}`;
        const raw = await callOpenAI(prompt);
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
        // "Never create duplicate Products" — so khớp Tên/SKU/Model/Slug với
        // danh sách Sản phẩm THẬT đã tải (0 gọi AI, tránh chi phí/độ trễ thừa).
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
          step.status = 'duplicate-found'; // pause plan — Founder phải chọn 1 trong 3 hành động
        } else {
          step.status = 'completed';
        }
      } else if (step.tool === 'detect-category') {
        // "Category Detection" — CHỈ dùng Danh mục THẬT đang Hoạt động, KHÔNG
        // BAO GIỜ tạo Danh mục mới. >=90% tự gán trực tiếp (dữ liệu CẤU TRÚC,
        // không phải "nội dung"); <90% hiển thị gợi ý, chờ Founder xác nhận.
        const pid = resolvedParams.productId;
        if (!pid) throw new Error('Không xác định được sản phẩm cần gán danh mục.');
        step.productId = pid;
        const activeCats = categories.filter(c => c.active !== false);
        if (!activeCats.length) {
          step.categoryResult = { assignments: [], noMatch: true };
          step.status = 'completed';
        } else {
          const prod = products.find(p => p.id === pid) || {};
          const catListText = activeCats.map(c => `${c.code} :: ${c.label}`).join('\n');
          const prompt = `Danh sách Danh mục ĐANG HOẠT ĐỘNG (chỉ được chọn mã "code" trong danh sách này, KHÔNG bịa mã mới):\n${catListText}\n\nSản phẩm cần gán Danh mục:\n- Tên: ${prod.name || ''}\n- Thương hiệu: ${prod.brand || ''}\n- Model: ${prod.model || ''}\n\nChọn TỐI ĐA 3 Danh mục phù hợp nhất, mỗi mục kèm % độ tin cậy (0-100, số nguyên) và lý do ngắn (Product Type/Brand/Keyword). Nếu KHÔNG có Danh mục nào phù hợp, trả "assignments":[].\nTrả về DUY NHẤT JSON: {"assignments":[{"code":"...","confidence":0,"reason":"..."}]}`;
          const raw = await callOpenAI(prompt);
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
            step.status = 'category-review'; // pause — chờ Founder xác nhận
          } else {
            step.status = 'completed'; // "No suitable Category found" — không chặn Plan, đã hiện trong categoryResult
          }
        }
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
        const descStep = m.steps.find(s => s.tool === 'product-description-writer' && s.status === 'completed');
        let draftContent = {};
        if (descStep && descStep.draftId) {
          const d = await DraftDB.get(descStep.draftId);
          draftContent = (d && d.content) || {};
        }
        const catStep = m.steps.find(s => s.tool === 'detect-category');
        const hasCategory = !!(catStep && catStep.categoryResult && (catStep.categoryResult.autoAssigned || []).length) || (Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0);
        const dims = [
          { label: 'SEO', weight: 20, ok: !!(draftContent.seoTitle && draftContent.metaDescription) },
          { label: 'Thông số kỹ thuật', weight: 15, ok: !!draftContent.specifications },
          { label: 'Tính năng', weight: 10, ok: Array.isArray(draftContent.features) && draftContent.features.length > 0 },
          { label: 'FAQ', weight: 10, ok: Array.isArray(draftContent.faq) && draftContent.faq.length > 0 },
          { label: 'Danh mục', weight: 15, ok: hasCategory },
          { label: 'Hình ảnh', weight: 15, ok: Array.isArray(prod.images) && prod.images.length > 0 },
          { label: 'Video', weight: 10, ok: !!prod.youtubeUrl },
          { label: 'Tài liệu (Manual/Firmware/Driver)', weight: 5, ok: false } // chưa có hạ tầng đính kèm file cho Sản phẩm — luôn thiếu, xem missing-info-report
        ];
        const score = dims.reduce((sum, d) => sum + (d.ok ? d.weight : 0), 0);
        step.qualityScore = { score, dims };
        step.status = 'completed';
      } else if (step.tool === 'missing-info-report') {
        const pid = resolvedParams.productId;
        const prod = products.find(p => p.id === pid) || {};
        const missing = [];
        if (!Array.isArray(prod.images) || !prod.images.length) missing.push('Chưa có ảnh sản phẩm chính thức — Founder tự tải lên qua 📷 hoặc Thư viện ảnh.');
        if (!prod.youtubeUrl) missing.push('Chưa có Video YouTube chính thức.');
        missing.push('Chưa có Manual/Firmware/Driver — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
        if (!prod.warranty) missing.push('Chưa có thông tin Bảo hành.');
        if (!prod.sku) missing.push('Chưa có SKU.');
        const catStep = m.steps.find(s => s.tool === 'detect-category');
        const hasCategory = !!(catStep && catStep.categoryResult && (catStep.categoryResult.autoAssigned || []).length) || (Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0);
        if (!hasCategory) missing.push('Chưa có Danh mục phù hợp — Founder tự gán qua Quản lý Sản phẩm.');
        step.missingInfo = missing;
        step.status = 'completed';
      } else if (step.tool === 'seo') {
        // Mốc hiển thị — KHÔNG gọi Plugin riêng (tránh gọi AI 2 lần trên
        // cùng 1 sản phẩm — product-description-writer đã sinh đủ field SEO
        // trong CÙNG 1 JSON, đúng nguyên tắc Sprint 12 Requirement #10).
        // Chỉ hợp lệ khi bước Product AI TRƯỚC ĐÓ trong CÙNG Plan đã Completed.
        const prodStep = m.steps.slice(0, stepIndex).reverse().find(s => s.tool === 'product-description-writer');
        if (prodStep && prodStep.status === 'completed') {
          step.draftId = prodStep.draftId;
          step.status = 'completed';
        } else {
          step.status = 'failed';
          step.errorText = 'Cần bước Product AI hoàn tất trước (SEO dùng chung 1 lần generate với Product AI, không gọi AI riêng lần 2).';
        }
      } else if (step.tool === 'open-product') {
        // CMS Operator — ĐIỀU HƯỚNG, không sinh nội dung, không ghi Firebase
        // ("The Agent never edits database directly. The Agent operates the
        // existing CMS."). admin/products.html đọc ?edit= rồi tự gọi
        // editProduct() ĐÃ CÓ — 0 logic mở form mới ("Do NOT duplicate
        // Product logic").
        const pid = resolvedParams.productId;
        if (!pid) throw new Error('Không xác định được sản phẩm cần mở.');
        step.productId = pid;
        step.status = 'completed';
        renderMessages();
        window.location.href = '/admin/products.html?edit=' + encodeURIComponent(pid);
        return step.status;
      } else if (step.tool === 'update-product-field') {
        // Điền sẵn field + đánh dấu trên CHÍNH form thật — Founder tự bấm Lưu
        // ("Locate Product -> Update Price field -> Highlight change -> Ask
        // Founder to Save"). Agent KHÔNG gọi DB.update() ở đây.
        const pid = resolvedParams.productId;
        const field = String(resolvedParams.field || '').toLowerCase();
        const value = resolvedParams.value;
        if (!pid) throw new Error('Không xác định được sản phẩm cần sửa.');
        if (!AGENT_FIELD_LABELS[field]) throw new Error('Field không hợp lệ: ' + field);
        if (value === undefined || value === null || value === '') throw new Error('Thiếu giá trị mới cần điền.');
        step.productId = pid;
        step.status = 'completed';
        renderMessages();
        window.location.href = '/admin/products.html?edit=' + encodeURIComponent(pid) + '&field=' + encodeURIComponent(field) + '&value=' + encodeURIComponent(value);
        return step.status;
      } else if (step.tool === 'open-draft') {
        // Tìm Draft mới nhất khớp — tái sử dụng ĐÚNG DraftDB.getAll() đã có,
        // không viết logic tìm kiếm/lưu trữ mới. Điều hướng tới Social Media
        // Center (đã có sẵn từ Sprint 12), KHÔNG tự Publish.
        const drafts = await DraftDB.getAll();
        let candidates = drafts;
        if (resolvedParams.moduleId) candidates = candidates.filter(d => d.moduleId === resolvedParams.moduleId);
        const q = String(resolvedParams.query || '').trim().toLowerCase();
        if (q) {
          candidates = candidates.filter(d => JSON.stringify(d.content || {}).toLowerCase().includes(q) || JSON.stringify(d.inputParams || {}).toLowerCase().includes(q));
        }
        candidates = candidates.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const found = candidates[0];
        if (!found) throw new Error('Không tìm thấy Nháp phù hợp.');
        step.draftId = found.id;
        step.status = 'completed';
        renderMessages();
        window.location.href = '/admin/social-media-center.html?highlight=' + encodeURIComponent(found.id);
        return step.status;
      } else if (step.tool === 'navigate') {
        const page = NAV_PAGES[resolvedParams.page];
        if (!page) throw new Error('Không nhận diện được trang CMS: ' + resolvedParams.page);
        step.status = 'completed';
        renderMessages();
        window.location.href = page;
        return step.status;
      } else {
        // Plugin thật — ĐÚNG 4 bước cũ (V1/AITaskRouter.dispatch()), không đổi.
        const perm = await PermissionService.checkPluginExecution(user.uid, user.email, step.tool);
        if (!perm.granted) throw new Error('Không có quyền chạy ' + (TOOL_MAP[step.tool] ? TOOL_MAP[step.tool].label : step.tool) + ': ' + perm.reason);

        const plugin = await PluginManager.loadPlugin(step.tool);
        if (!plugin) throw new Error('Không tìm thấy công cụ: ' + step.tool);

        await plugin.execute([resolvedParams], user.uid, user.email);
        await AIJobQueue.resume(user.uid, user.email);

        const drafts = await DraftDB.getAll();
        const sorted = drafts.filter(d => d.status === 'draft').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        step.draftId = sorted[0] ? sorted[0].id : null;
        step.status = 'completed';
      }
    } catch (err) {
      step.status = 'failed';
      step.errorText = err.message;
    }

    renderMessages();
    return step.status;
  }

  // applyCategoryAssignment — GHI TRỰC TIẾP categoryIds (dữ liệu CẤU TRÚC đã
  // validate khớp mã Danh mục THẬT đang Hoạt động — không phải "nội dung AI",
  // xem chú thích đầu file). Tái dùng ĐÚNG DB.update() Product Editor cũng
  // dùng để Lưu — không viết logic ghi Category mới.
  function applyCategoryAssignment(productId, categoryIds, activeCats) {
    const first = activeCats.find(c => c.code === categoryIds[0]);
    const data = { categoryIds, category: categoryIds[0], categoryLabel: first ? first.label : '' };
    return DB.update(productId, data).then(() => {
      const p = products.find(x => x.id === productId);
      if (p) Object.assign(p, data);
    });
  }

  // runAll — chạy tuần tự từ đầu Plan, bỏ qua bước đã Completed/Skipped.
  // DỪNG NGAY khi 1 bước Failed/duplicate-found/category-review (Pause the
  // plan — không chạy tiếp mù quáng), hiện lý do, chờ Founder tự quyết định
  // rồi bấm CHẠY TẤT CẢ lại (idempotent — tự tiếp tục đúng từ bước còn
  // Pending, không chạy lại bước đã xong).
  async function runAll(msgId) {
    if (isBusy) return;
    isBusy = true;
    setInputEnabled(false);
    const m = findMsg(msgId);
    if (m) {
      for (let i = 0; i < m.steps.length; i++) {
        const s = m.steps[i];
        if (s.status === 'completed' || s.status === 'skipped') continue;
        const result = await executeStep(msgId, i);
        if (result === 'failed' || result === 'duplicate-found' || result === 'category-review') break; // Pause the plan
      }
    }
    isBusy = false;
    setInputEnabled(true);
  }

  async function runStep(msgId, stepIndex) {
    if (isBusy) return;
    isBusy = true;
    setInputEnabled(false);
    await executeStep(msgId, stepIndex);
    isBusy = false;
    setInputEnabled(true);
  }

  function skipStep(msgId, stepIndex) {
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'pending') return;
    step.status = 'skipped';
    renderMessages();
  }

  // cancelStep — cùng hiệu ứng skipStep() cho bước CHƯA chạy (Pending). Queue
  // hiện có KHÔNG hỗ trợ hủy 1 lệnh gọi mạng đang chạy giữa chừng, và sửa
  // Queue để thêm cơ chế đó nằm ngoài phạm vi "Do NOT redesign... Queue" —
  // "Hủy" ở đây nghĩa là "không để bước này chạy", đúng với 1 bước còn Pending.
  function cancelStep(msgId, stepIndex) {
    skipStep(msgId, stepIndex);
  }

  function retryStep(msgId, stepIndex) {
    if (isBusy) return;
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'failed') return;
    step.status = 'pending';
    step.errorText = null;
    runStep(msgId, stepIndex);
  }

  // ── DUPLICATE DETECTION — "Offer: Open Existing Product / Create Copy /
  // Cancel. Never create duplicate Products." ─────────────────────────────

  function openDuplicateProduct(msgId, stepIndex) {
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'duplicate-found' || !step.duplicateProductId) return;
    window.location.href = '/admin/products.html?edit=' + encodeURIComponent(step.duplicateProductId);
  }

  function createDuplicateCopy(msgId, stepIndex) {
    if (isBusy) return;
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'duplicate-found') return;
    step.status = 'completed'; // Founder chủ động chọn "Tạo bản sao" — cho phép Plan tiếp tục
    step.errorText = null;
    renderMessages();
  }

  function cancelDuplicatePlan(msgId, stepIndex) {
    const m = findMsg(msgId);
    if (!m) return;
    m.steps.forEach((s, i) => {
      if (i === stepIndex) { s.status = 'skipped'; return; }
      if (i > stepIndex && s.status === 'pending') s.status = 'skipped';
    });
    renderMessages();
  }

  // ── CATEGORY REVIEW — "<90%: Suggest Categories. Founder confirms." ─────

  function confirmCategorySuggestions(msgId, stepIndex) {
    if (isBusy) return;
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'category-review' || !step.categoryResult) return;
    const activeCats = categories.filter(c => c.active !== false);
    const codes = step.categoryResult.assignments.map(a => a.code);
    isBusy = true;
    setInputEnabled(false);
    applyCategoryAssignment(step.productId, codes, activeCats).then(() => {
      step.categoryResult.autoAssigned = codes;
      step.status = 'completed';
      isBusy = false;
      setInputEnabled(true);
      renderMessages();
    });
  }

  function skipCategorySuggestions(msgId, stepIndex) {
    const step = findStep(msgId, stepIndex);
    if (!step || step.status !== 'category-review') return;
    step.status = 'completed'; // Founder tự gán Danh mục sau qua Product Editor — không chặn phần còn lại của Plan
    renderMessages();
  }

  // ── MESSAGE HELPERS ──────────────────────────────────────────────────────────

  let msgCounter = 0;
  function pushAgentMsg(data) {
    const id = 'msg_' + (++msgCounter);
    messages.push(Object.assign({ id, role: 'agent' }, data));
    return id;
  }
  function updateMsg(id, data) {
    const m = messages.find(x => x.id === id);
    if (m) Object.assign(m, data);
  }
  function findMsg(id) { return messages.find(x => x.id === id); }
  function findStep(msgId, i) { const m = findMsg(msgId); return m && m.steps ? m.steps[i] : null; }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  function renderMessages() {
    const list = document.getElementById('agentMessages');
    if (!list) return;
    list.innerHTML = messages.map(m => {
      if (m.role === 'user') {
        const atts = (m.attachments || []).map(a => a.type === 'image'
          ? `<img src="${escHtml(a.url)}" class="agent-msg-attachment-img" alt="">`
          : `<span class="agent-attachment-chip">📎 ${escHtml(a.name)}</span>`).join('');
        return `<div class="agent-msg agent-msg-user"><div class="agent-msg-bubble">${escHtml(m.text)}${atts}</div></div>`;
      }
      return renderAgentMsg(m);
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  function stepActions(m, step, i) {
    if (step.status === 'pending') {
      return `<button type="button" class="agent-plan-btn" onclick="AdminAgent.runStep('${m.id}',${i})">▶ Chạy</button>
        <button type="button" class="agent-plan-btn" onclick="AdminAgent.skipStep('${m.id}',${i})">⏭ Bỏ qua</button>
        <button type="button" class="agent-plan-btn agent-plan-btn-danger" onclick="AdminAgent.cancelStep('${m.id}',${i})">✕ Hủy</button>`;
    }
    if (step.status === 'failed') {
      return `<button type="button" class="agent-plan-btn" onclick="AdminAgent.retryStep('${m.id}',${i})">🔁 Thử lại</button>`;
    }
    if (step.status === 'duplicate-found') {
      return `<button type="button" class="agent-plan-btn" onclick="AdminAgent.openDuplicateProduct('${m.id}',${i})">📂 Mở Sản phẩm đã có</button>
        <button type="button" class="agent-plan-btn" onclick="AdminAgent.createDuplicateCopy('${m.id}',${i})">🆕 Tạo bản sao</button>
        <button type="button" class="agent-plan-btn agent-plan-btn-danger" onclick="AdminAgent.cancelDuplicatePlan('${m.id}',${i})">✕ Hủy</button>`;
    }
    if (step.status === 'category-review') {
      return `<button type="button" class="agent-plan-btn" onclick="AdminAgent.confirmCategorySuggestions('${m.id}',${i})">✓ Xác nhận & Gán</button>
        <button type="button" class="agent-plan-btn" onclick="AdminAgent.skipCategorySuggestions('${m.id}',${i})">⏭ Tự gán sau</button>`;
    }
    if (step.status === 'running') return `<span class="small-muted">Đang chạy...</span>`;
    return ''; // completed/skipped — không còn hành động
  }

  // stepExtra — nội dung mở rộng riêng cho từng loại bước V4 (nghiên cứu/
  // trùng lặp/danh mục/liên quan/điểm chất lượng/báo cáo thiếu) — hiển thị
  // NGAY DƯỚI hàng trạng thái, tách biệt errorText.
  function stepExtra(step) {
    if (step.tool === 'research-product' && step.research) {
      const r = step.research;
      let html = `<div class="agent-step-extra">🔎 <strong>AI đề xuất (chưa xác minh nguồn chính hãng):</strong> ${escHtml(r.name)}`;
      if (r.brand) html += ` — Thương hiệu: ${escHtml(r.brand)}`;
      if (r.model) html += ` — Model: ${escHtml(r.model)}`;
      html += ` (độ tin cậy AI: ${escHtml(String(r.confidence))}%)`;
      if (r.candidates && r.candidates.length) html += `<br>Khả năng khác: ${r.candidates.map(escHtml).join(', ')}`;
      if (r.note) html += `<br><em>${escHtml(r.note)}</em>`;
      html += '</div>';
      return html;
    }
    if (step.tool === 'check-duplicate' && step.status === 'duplicate-found') {
      return `<div class="agent-step-extra agent-step-warn">⚠ Đã tìm thấy sản phẩm trùng: <strong>${escHtml(step.duplicateProductName)}</strong>.</div>`;
    }
    if (step.tool === 'detect-category' && step.categoryResult) {
      const cr = step.categoryResult;
      if (cr.noMatch) return `<div class="agent-step-extra">🏷 <strong>Không tìm thấy Danh mục phù hợp.</strong> <a href="/admin/categories.html" class="agent-open-draft-btn">Mở Quản lý Danh mục →</a></div>`;
      const rows = cr.assignments.map(a => `${escHtml(a.label)} (${escHtml(String(a.confidence))}% — ${escHtml(a.reason || '')})`).join('<br>');
      const label = cr.autoAssigned ? '🏷 <strong>Đã tự động gán Danh mục:</strong>' : '🏷 <strong>Đề xuất Danh mục (cần xác nhận):</strong>';
      return `<div class="agent-step-extra">${label}<br>${rows}</div>`;
    }
    if (step.tool === 'related-products' && step.relatedProducts) {
      if (!step.relatedProducts.length) return `<div class="agent-step-extra">🔗 Không tìm thấy sản phẩm liên quan.</div>`;
      const links = step.relatedProducts.map(p => `<a href="/admin/products.html?edit=${encodeURIComponent(p.id)}" class="agent-open-draft-btn">${escHtml(p.name)}</a>`).join(', ');
      return `<div class="agent-step-extra">🔗 <strong>Sản phẩm liên quan:</strong> ${links}</div>`;
    }
    if (step.tool === 'quality-score' && step.qualityScore) {
      const q = step.qualityScore;
      const rows = q.dims.map(d => `${d.ok ? '✓' : '✗'} ${escHtml(d.label)} (${d.weight} điểm)`).join(' · ');
      return `<div class="agent-step-extra">⭐ <strong>Điểm chất lượng: ${q.score}/100</strong><br>${rows}</div>`;
    }
    if (step.tool === 'missing-info-report' && step.missingInfo) {
      if (!step.missingInfo.length) return `<div class="agent-step-extra">📋 Không thiếu thông tin nào.</div>`;
      return `<div class="agent-step-extra">📋 <strong>Thông tin còn thiếu:</strong><br>${step.missingInfo.map(escHtml).join('<br>')}<br><em>Founder quyết định có tiếp tục hoàn thiện hay không.</em></div>`;
    }
    return '';
  }

  // stepLink — link dự phòng NẾU điều hướng tự động (window.location.href)
  // vì lý do gì đó không xảy ra (vd trình duyệt chặn) — trỏ ĐÚNG trang thật
  // Agent đã điều hướng tới cho từng loại bước, không phải 1 URL đoán chung.
  function stepLink(step) {
    if (step.status !== 'completed') return '';
    if (step.tool === 'open-draft' && step.draftId) return ` <a href="/admin/social-media-center.html?highlight=${encodeURIComponent(step.draftId)}" class="agent-open-draft-btn">Mở Nháp →</a>`;
    if ((step.tool === 'open-product' || step.tool === 'update-product-field') && step.productId) return ` <a href="/admin/products.html?edit=${encodeURIComponent(step.productId)}" class="agent-open-draft-btn">Mở Sản phẩm →</a>`;
    if (step.draftId) return ` <a href="/admin/ai/drafts.html" class="agent-open-draft-btn">Mở Nháp →</a>`;
    if (step.productId) return ` <a href="/admin/products.html" class="agent-open-draft-btn">Mở Sản phẩm →</a>`;
    return '';
  }

  // renderPlan — "Execution Plan": mỗi bước hiện Tool/Target/Status + hành
  // động Founder có thể bấm (Run/Skip/Cancel/Retry + Duplicate/Category
  // Review) — đúng PLAN UI + FOUNDER CONTROLS. Có "▶ CHẠY TẤT CẢ" tổng ở trên
  // (Run All).
  function renderPlan(m) {
    if (!m.steps || !m.steps.length) return '';
    const allDone = m.steps.every(s => ['completed', 'skipped', 'failed'].indexOf(s.status) !== -1);
    const hasPending = m.steps.some(s => s.status === 'pending');
    const rows = m.steps.map((step, i) => {
      const tool = TOOL_MAP[step.tool] || { label: step.tool, icon: '🔧' };
      return `
        <div class="agent-plan-row agent-plan-row-${step.status}">
          <span class="agent-plan-tool">${escHtml(tool.icon)} ${escHtml(tool.label)}</span>
          <span class="agent-plan-target">${escHtml(step.target || '—')}</span>
          <span class="agent-plan-status agent-plan-status-${step.status}">${escHtml(STATUS_LABEL[step.status] || step.status)}</span>
          <span class="agent-plan-actions">${stepActions(m, step, i)}${stepLink(step)}</span>
          ${step.errorText ? `<div class="agent-plan-error">${escHtml(step.errorText)}</div>` : ''}
          ${stepExtra(step)}
        </div>`;
    }).join('');

    const runAllBtn = hasPending
      ? `<button type="button" class="submit-btn agent-plan-runall" onclick="AdminAgent.runAll('${m.id}')">▶ CHẠY TẤT CẢ</button>`
      : '';

    return `<div class="agent-plan">${rows}</div>${runAllBtn}${allDone ? renderReport(m) : ''}`;
  }

  // renderReport — "After completion show: Completed / Failed / Skipped /
  // Draft links" — tính TRỰC TIẾP từ steps[], không lưu cờ riêng.
  function renderReport(m) {
    const completed = m.steps.filter(s => s.status === 'completed');
    const failed = m.steps.filter(s => s.status === 'failed');
    const skipped = m.steps.filter(s => s.status === 'skipped');
    const draftLinks = completed.filter(s => s.draftId || s.productId).map(s => {
      const tool = TOOL_MAP[s.tool] || { label: s.tool };
      const href = s.draftId ? '/admin/ai/drafts.html' : '/admin/products.html';
      const label = s.draftId ? 'Mở Nháp' : 'Mở Sản phẩm';
      return `<li>${escHtml(tool.label)} — <a href="${href}" class="agent-open-draft-btn">${label} →</a></li>`;
    }).join('');
    return `<div class="agent-plan-report">
      <p><strong>Báo cáo:</strong> ${completed.length} Hoàn tất · ${failed.length} Thất bại · ${skipped.length} Đã bỏ qua</p>
      ${draftLinks ? `<ul class="agent-plan-report-links">${draftLinks}</ul>` : ''}
    </div>`;
  }

  function renderAgentMsg(m) {
    const body = `<span class="agent-msg-text">${escHtml(m.text)}</span>`;
    const plan = m.steps ? renderPlan(m) : '';
    return `<div class="agent-msg agent-msg-agent">
      <div class="agent-msg-bubble">
        <div class="agent-msg-body">${body}</div>
        ${plan}
      </div>
    </div>`;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setInputEnabled(enabled) {
    const input = document.getElementById('agentInput');
    const btn = document.getElementById('agentSendBtn');
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
  }

  return {
    init, useSuggestion, send, runAll, runStep, skipStep, cancelStep, retryStep,
    openDuplicateProduct, createDuplicateCopy, cancelDuplicatePlan,
    confirmCategorySuggestions, skipCategorySuggestions,
    attachImage, attachFileClick, handleFileSelected, removeAttachment, toggleMic
  };
})();
