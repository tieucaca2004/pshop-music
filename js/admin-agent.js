/*
 * admin-agent.js — Founder Agent V5: Final Polish (Sprint 13)
 * V1: 1 lệnh -> 1 công cụ -> 1 Draft. V2: 1 lệnh -> nhiều bước (Execution
 * Plan) -> Plugin/Queue/Draft. V3: THÊM khả năng "vận hành CMS thay Founder"
 * (điều hướng trang thật). V4: THÊM khả năng tạo 1 Sản phẩm gần như đầy đủ
 * chỉ từ 1 dòng gợi ý — nghiên cứu tên/thương hiệu, kiểm tra trùng lặp, tự
 * gán Danh mục, viết nội dung (tái dùng Product AI), gợi ý Sản phẩm liên
 * quan, tính Điểm chất lượng, báo cáo thông tin còn thiếu — cộng khả năng
 * đính kèm ảnh/file/Micro ngay tại ô nhập. V4.1: hỏi-đáp không lập lại từ
 * đầu, SELF CHECK (root cause "no Draft created" đã sửa), Dashboard/Undo/
 * Resume/History. V5 (bản cuối Sprint 13): SMART BACKGROUND tự động (phát
 * hiện + xóa phông nền trắng ngay trong luồng tạo sản phẩm — không cần
 * Founder tự bấm), hiểu thêm lệnh "Cập nhật X"/"Xuất bản X", Final Review mở
 * rộng (Featured Image/Gallery/Background/Internal Links), điểm phong cách
 * Category Cover "Technology", và các điểm mở rộng (extension points) cho
 * Web Search/YouTube/Official Document/Background Provider trong tương lai
 * — KHÔNG triển khai API trả phí nào, chỉ chuẩn bị chỗ gắn vào sau.
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
    'missing-info-report':         { label: 'Báo cáo thiếu thông tin', icon: '📋' },
    // Sprint 13 V5 (Final Polish) — xem chú thích đầu file.
    'smart-background':            { label: 'Xóa phông tự động', icon: '🎨' },
    // Founder yêu cầu "đưa ảnh gốc lên AI xử lý nền rồi bỏ chữ vào ảnh" —
    // khác hẳn image-generator (dall-e-3, chỉ vẽ ảnh MỚI từ mô tả, không
    // nhận ảnh đầu vào) — tool này NHẬN ẢNH THẬT sản phẩm, model gpt-image-1
    // chỉnh sửa trực tiếp trên ảnh đó (đổi nền + in chữ tên sản phẩm), trả về
    // 1 ảnh DUY NHẤT. Xem executeStep() nhánh riêng (không qua PluginManager/
    // Queue/DraftDB — giống smart-background, một tác vụ ảnh đơn lẻ).
    'product-banner':              { label: 'Banner sản phẩm (AI)', icon: '🪧' }
  };

  // EXTERNAL_PROVIDERS (Sprint 13 V5 — "FOUNDATION FOR FUTURE") — điểm mở
  // rộng cho 4 nguồn dữ liệu bên ngoài Requirement liệt kê, CHƯA triển khai
  // (đúng "without implementing paid APIs"). Founder gõ đúng từ khóa liên
  // quan → Agent trả lời rõ CHƯA có provider thật, KHÔNG giả vờ tra cứu được
  // (cùng nguyên tắc "Provider Not Configured" đã dùng cho Internet
  // Background ở Category Cover). Khi có provider thật, chỉ cần thêm URL/
  // key vào đây + 1 nhánh gọi thật trong hàm tương ứng — KHÔNG đổi cấu trúc
  // Plan/Execution đã có.
  const EXTERNAL_PROVIDERS = {
    webSearch: { label: 'Web Search Provider', configured: false, keywords: ['tìm trên internet', 'tìm kiếm web', 'search internet', 'tra cứu internet'] },
    youtube: { label: 'YouTube Provider', configured: false, keywords: ['tìm video youtube', 'youtube chính hãng', 'video chính thức'] },
    officialDocument: { label: 'Official Document Provider', configured: false, keywords: ['tài liệu chính hãng', 'manual chính thức', 'tìm datasheet', 'tìm firmware chính hãng'] },
    backgroundProvider: { label: 'Background Provider (Internet)', configured: false, keywords: ['ảnh nền internet', 'ảnh nền từ mạng'] }
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
    { label: 'Cập nhật nội dung RX3',  text: 'Cập nhật Pioneer RX3' },
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

  // pendingClarification — "Conversation Workflow": khi Planner báo thiếu
  // thông tin (steps rỗng + reason), GIỮ LẠI yêu cầu gốc ở đây thay vì bỏ đi
  // — câu trả lời TIẾP THEO của Founder sẽ được GHÉP với yêu cầu gốc thành 1
  // yêu cầu đầy đủ gửi lại Planner, KHÔNG lập kế hoạch lại từ đầu, KHÔNG hỏi
  // lại y hệt câu đã hỏi (yêu cầu gộp mỗi lần khác nhau tự nhiên đổi câu hỏi
  // nếu Planner vẫn còn thiếu gì khác).
  let pendingClarification = null; // { originalText, attachments }

  // Resume Workflow (localStorage, cùng cơ chế UI Mode toggle ở js/admin-
  // auth.js — KHÔNG ghi Firebase, giới hạn per-browser đã biết trước).
  const WORKFLOW_SNAPSHOT_KEY = 'pshopFounderAgentWorkflowSnapshot';

  // ── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    // Khoá ô nhập/nút Gửi ngay từ đầu — trước đây 2 nút này BẬT SẴN trước khi
    // AdminAuth.init() xác nhận xong "user" (chờ mạng/Firebase), Founder gõ
    // + Enter quá nhanh sẽ gọi callOpenAI() với user còn null -> "Cannot read
    // properties of null (reading 'getIdToken')". Mở khoá lại NGAY khi user
    // đã sẵn sàng.
    setInputEnabled(false);
    AdminAuth.init({ page: 'founder-agent', title: 'FOUNDER AGENT' }).then(({ user: u }) => {
      user = u;
      setInputEnabled(true);
      Promise.all([
        DB.getAll ? DB.getAll() : Promise.resolve([]),
        BlogDB && BlogDB.getAll ? BlogDB.getAll() : Promise.resolve([]),
        typeof CategoryDB !== 'undefined' && CategoryDB.getAll ? CategoryDB.getAll() : Promise.resolve([])
      ]).then(([prods, posts, cats]) => {
        products = Array.isArray(prods) ? prods : [];
        blogPosts = Array.isArray(posts) ? posts : [];
        categories = Array.isArray(cats) ? cats : [];
        renderSuggested();
        tryOfferResume();
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

  // renderSuggested — TRƯỚC ĐÂY nhúng JSON.stringify(s.text) (dấu ngoặc kép)
  // thẳng vào bên trong thuộc tính onclick="..." (cũng dùng dấu ngoặc kép) —
  // 2 dấu ngoặc kép ĐỤNG NHAU làm hỏng HTML, khiến bấm nút không chạy được gì
  // (im lặng, không báo lỗi — đúng hiện tượng Founder mô tả). Giờ lưu câu mẫu
  // vào thuộc tính data-* (đã escape đúng chuẩn HTML), đọc lại qua
  // this.dataset — không còn xung đột dấu ngoặc.
  function renderSuggested() {
    const wrap = document.getElementById('agentSuggestions');
    if (!wrap) return;
    wrap.innerHTML = SUGGESTED.map(s =>
      `<button type="button" class="agent-suggestion-chip" data-suggestion-text="${escHtml(s.text)}" onclick="AdminAgent.useSuggestion(this.dataset.suggestionText)">${escHtml(s.label)}</button>`
    ).join('');
  }

  // useSuggestion — CHỈ điền sẵn câu mẫu vào ô nhập, KHÔNG tự gửi ngay — trước
  // đây gửi ngay khiến Founder bấm thẻ gợi ý (dùng tên mẫu cố định "Pioneer
  // RX3") mà không có cơ hội sửa lại thành đúng tên sản phẩm thật đang có,
  // lệnh gửi đi tìm không thấy sản phẩm nên trông như "không dùng được".
  function useSuggestion(text) {
    const input = document.getElementById('agentInput');
    input.value = text;
    input.focus();
    input.setSelectionRange(0, input.value.length);
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

  // Lệnh gõ trực tiếp (không qua Planner) — "Undo last step"/"Workflow
  // History" là thao tác ĐIỀU KHIỂN Agent, không phải yêu cầu tạo Plan mới.
  const UNDO_COMMANDS = ['undo last step', 'hoàn tác bước trước', 'hoàn tác bước cuối', 'hoàn tác'];
  const HISTORY_COMMANDS = ['workflow history', 'lịch sử', 'lịch sử workflow'];

  function send() {
    if (isBusy) return;
    const input = document.getElementById('agentInput');
    const text = input.value.trim();
    const attachments = pendingAttachments.filter(a => a.url); // chỉ gửi kèm file đã tải lên xong
    if (!text && !attachments.length) return;
    const normalized = text.toLowerCase();

    if (UNDO_COMMANDS.indexOf(normalized) !== -1) {
      input.value = '';
      const lastPlanMsg = messages.slice().reverse().find(m => m.role === 'agent' && m.steps && m.steps.length);
      if (lastPlanMsg) undoLastStep(lastPlanMsg.id);
      else alert('Không có kế hoạch nào để hoàn tác.');
      return;
    }
    if (HISTORY_COMMANDS.indexOf(normalized) !== -1) {
      input.value = '';
      showHistory();
      return;
    }
    // EXTERNAL_PROVIDERS stub (V5, "FOUNDATION FOR FUTURE") — nhận diện đúng
    // ý định cần nguồn NGOÀI hệ thống, trả lời trung thực "chưa cấu hình"
    // thay vì lặng lẽ bỏ qua hoặc chuyển cho Planner (dễ khiến AI tự bịa).
    const providerKey = Object.keys(EXTERNAL_PROVIDERS).find(k => EXTERNAL_PROVIDERS[k].keywords.some(kw => normalized.indexOf(kw) !== -1));
    if (providerKey) {
      input.value = '';
      const provider = EXTERNAL_PROVIDERS[providerKey];
      pushAgentMsg({ text: `Provider Not Configured — ${provider.label} chưa được kết nối trong hệ thống này. Đây là điểm mở rộng đã chuẩn bị sẵn cho tương lai, chưa triển khai (không dùng API trả phí khi chưa được Chief Architect xác nhận).`, steps: [] });
      renderMessages();
      return;
    }

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

  // detectWhiteBackground(imageUrl) -> Promise<boolean> — "SMART BACKGROUND:
  // Automatically remove obvious white backgrounds" — lấy mẫu màu 6 điểm
  // (4 góc + 2 điểm giữa cạnh) qua Canvas API CÓ SẴN trình duyệt (KHÔNG cần
  // Cloud Function/API mới cho bước PHÁT HIỆN — chỉ bước XÓA PHÔNG sau đó
  // mới gọi ĐÚNG remove_background đã có). Lỗi đọc pixel (CORS/ảnh hỏng) ->
  // resolve(false) — "không xác định được" không chặn Plan, không coi là
  // false-positive nguy hiểm hơn false-negative (thà bỏ qua còn hơn tự ý xử
  // lý nhầm 1 ảnh không phải nền trắng).
  function detectWhiteBackground(imageUrl) {
    return new Promise(resolve => {
      if (!imageUrl || typeof Image === 'undefined' || typeof document.createElement !== 'function') { resolve(false); return; }
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const w = canvas.width = Math.min(img.naturalWidth || img.width || 0, 100) || 100;
            const h = canvas.height = Math.min(img.naturalHeight || img.height || 0, 100) || 100;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const samples = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [Math.floor(w / 2), 0], [0, Math.floor(h / 2)]];
            let whiteCount = 0;
            samples.forEach(([x, y]) => {
              const px = ctx.getImageData(x, y, 1, 1).data;
              if (px[0] > 235 && px[1] > 235 && px[2] > 235) whiteCount++;
            });
            resolve(whiteCount >= samples.length - 1); // hầu hết góc/viền gần trắng thuần
          } catch (e) { resolve(false); }
        };
        img.onerror = () => resolve(false);
        img.src = imageUrl;
      } catch (e) { resolve(false); }
    });
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
    const msgId = pushAgentMsg({ text: 'Đang lập kế hoạch...', steps: null, startedAt: Date.now() });
    renderMessages();

    // "Conversation Workflow" — nếu tin nhắn Agent TRƯỚC ĐÓ là 1 câu hỏi làm
    // rõ còn treo (pendingClarification), GHÉP câu trả lời MỚI với yêu cầu
    // GỐC thành 1 yêu cầu đầy đủ — "Continue from the exact previous step.
    // Never restart the workflow." KHÔNG lập kế hoạch chỉ từ câu trả lời
    // ngắn gọn (thường thiếu ngữ cảnh, Planner sẽ lại không hiểu).
    let effectiveText = userText;
    let effectiveAttachments = attachments;
    if (pendingClarification) {
      effectiveText = (pendingClarification.originalText + '. ' + userText).trim();
      effectiveAttachments = (pendingClarification.attachments || []).concat(attachments || []);
    }

    try {
      const plan = await buildPlan(effectiveText, effectiveAttachments);
      if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
        // Vẫn thiếu thông tin — GIỮ pendingClarification (đã gộp thêm câu trả
        // lời vừa nhận) để lượt trả lời TIẾP THEO tiếp tục đúng từ đây —
        // "Never ask duplicate questions" (yêu cầu gộp đổi mỗi lần, Planner
        // tự nhiên không hỏi lại y hệt câu cũ).
        pendingClarification = { originalText: effectiveText, attachments: effectiveAttachments };
        updateMsg(msgId, { text: (plan && plan.reason) || 'Không hiểu được yêu cầu này — hãy mô tả cụ thể hơn.', steps: [] });
        renderMessages();
        return;
      }
      pendingClarification = null; // đủ thông tin — kết thúc chuỗi hỏi-đáp
      const steps = plan.steps.map(s => normalizeStep(s));
      // Ảnh đính kèm (nếu có) dùng làm Ảnh đại diện cho bước create-product
      // trong CÙNG Plan — media THẬT do Founder cung cấp, không phải AI sinh.
      const imageAttachments = (effectiveAttachments || []).filter(a => a.type === 'image');
      const imageAttachment = imageAttachments[0];
      if (imageAttachment) {
        const createStep = steps.find(s => s.tool === 'create-product');
        if (createStep) createStep.attachedImageUrl = imageAttachment.url;
      }
      // Founder đính kèm ảnh khi nhờ viết Blog (không đi qua create-product) —
      // trước đây ảnh đính kèm bị BỎ QUA hoàn toàn cho blog-writer, khiến bài
      // ra không có ảnh dù Founder đã gửi. Gán trực tiếp vào inputParams.images
      // (field mới, tối đa 5) của bước blog-writer trong CÙNG Plan.
      if (imageAttachments.length) {
        const blogStep = steps.find(s => s.tool === 'blog-writer');
        if (blogStep) {
          const existing = Array.isArray(blogStep.inputParams.images) ? blogStep.inputParams.images : [];
          blogStep.inputParams.images = existing.concat(imageAttachments.map(a => a.url)).slice(0, 5);
        }
      }
      const fileAttachment = (effectiveAttachments || []).find(a => a.type === 'file');
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
    // Trước đây giới hạn 30 sản phẩm đầu — sản phẩm nằm ngoài top-30 sẽ vô
    // hình với AI, khiến AI không tìm được id thật và dùng nhầm token
    // "$product" cho sản phẩm ĐÃ CÓ (chỉ hợp lệ khi Plan có bước create-
    // product) → bước Product AI/SEO báo lỗi "cần bước trước hoàn tất" dù
    // sản phẩm đã tồn tại. Bỏ giới hạn — AI cần thấy TOÀN BỘ danh sách thật
    // để chọn đúng id.
    const productList = products.map(p => `- ${p.name} (id:${p.id}, sku:${p.sku || ''})`).join('\n');
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
- smart-background: Tự động phát hiện + xóa phông nền trắng cho ảnh sản phẩm (nếu Sản phẩm có ảnh). Đặt NGAY SAU create-product khi tạo sản phẩm mới VÀ Founder đã đính kèm ảnh. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- detect-category: Tự động phân tích và gán Danh mục phù hợp cho 1 sản phẩm ĐÃ CÓ (dùng danh sách Danh mục thật bên dưới, KHÔNG bịa mã mới). Đặt SAU create-product khi tạo sản phẩm mới. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- product-description-writer: viết mô tả + SEO cho 1 sản phẩm (ĐÃ CÓ SẴN hoặc VỪA được tạo ở bước create-product trong CÙNG Plan này). inputParams: {"productId": "<id thật, hoặc \"$product\" nếu là sản phẩm vừa tạo ở bước create-product CÙNG Plan>", "tone": "Chuyên nghiệp"}
- seo: mốc hiển thị "SEO đã gộp chung vào Product AI" — CHỈ thêm bước này NGAY SAU 1 bước product-description-writer trong CÙNG Plan (không dùng riêng lẻ). inputParams: {}
- blog-writer: viết bài blog. inputParams: {"topic": "<chủ đề>", "tone": "Chuyên nghiệp", "keywords": "", "productId": "<id thật, hoặc \"$product\", hoặc bỏ trống nếu không liên quan sản phẩm nào>"}
- facebook-post-generator: viết bài Facebook. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- banner-generator: tạo banner quảng cáo. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- image-generator: tạo ảnh marketing AI HOÀN TOÀN MỚI từ mô tả chữ (không dùng ảnh sản phẩm thật). inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- product-banner: chỉnh sửa TRỰC TIẾP trên ảnh sản phẩm THẬT đã có sẵn (đổi nền + in chữ tên sản phẩm vào ảnh) — ra 1 ảnh banner hoàn chỉnh, giữ nguyên sản phẩm gốc. CHỈ dùng khi Founder nói rõ muốn "đổi nền ảnh có sẵn"/"làm banner từ ảnh thật"/"giữ nguyên ảnh sản phẩm chỉ đổi nền" — sản phẩm PHẢI đã có ảnh thật (image/images), không dùng được nếu chưa có ảnh. inputParams: {"productId": "<id thật, KHÔNG dùng \"$product\">", "style": "<phong cách nền, vd Dark/Luxury/Technology/Studio, mặc định Dark nếu Founder không nói rõ>", "tagline": "<câu mô tả ngắn tuỳ chọn hiện dưới tên sản phẩm, để trống nếu Founder không yêu cầu>"}
- related-products: gợi ý Sản phẩm liên quan (cùng Danh mục/Thương hiệu). Đặt SAU detect-category khi tạo sản phẩm mới. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- quality-score: tính Điểm chất lượng Sản phẩm (dựa trên dữ liệu THẬT đã có, không bịa). Đặt gần cuối Plan tạo sản phẩm mới, SAU các bước AI content. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- missing-info-report: báo cáo thông tin còn thiếu (Ảnh/Video/Tài liệu/Bảo hành/Danh mục). Đặt SAU quality-score. inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- open-product: MỞ trang Sửa 1 sản phẩm ĐÃ CÓ SẴN (KHÔNG sinh nội dung, chỉ điều hướng). Dùng khi Founder nói "Mở X"/"Xem X"/"Sửa X" mà không nói rõ đổi field nào, HOẶC làm bước CUỐI CÙNG của 1 Plan tạo sản phẩm mới đầy đủ (để Founder Review). inputParams: {"productId": "<id thật, hoặc \"$product\">"}
- update-product-field: MỞ trang Sửa 1 sản phẩm VÀ điền sẵn 1 field cụ thể (Founder tự bấm Lưu — Agent KHÔNG tự lưu). Dùng khi Founder nói "Đổi <field> của X thành <giá trị>". Field hợp lệ: price/oldprice/name/warranty/stockstatus/status/sku. inputParams: {"productId": "<id thật>", "field": "<1 trong các field hợp lệ>", "value": "<giá trị mới, format đúng kiểu hiển thị — vd giá tiền viết đầy đủ số + đơn vị ₫, vd \"48 triệu\" => \"48.000.000 ₫\">"}
- open-draft: MỞ Social Media Center và làm nổi bật Draft mới nhất khớp yêu cầu (Founder muốn XEM/ĐĂNG 1 Draft ĐÃ TỒN TẠI, không phải tạo mới). Dùng khi Founder nói "Mở Draft Facebook X"/"Đăng Facebook X" (khi RÕ RÀNG muốn xem bản đã có, không phải viết bài mới). inputParams: {"moduleId": "facebook-post-generator" | "banner-generator" | "blog-writer" | "product-description-writer" (tùy loại), "query": "<từ khóa tìm, vd tên sản phẩm>"}
- navigate: MỞ 1 trang CMS chung (không gắn 1 bản ghi cụ thể). inputParams: {"page": "products"|"categories"|"blog"|"banners"|"drafts"|"social-media"|"images"}

QUY TẮC ĐẶC BIỆT — "$product": nếu Plan có bước create-product, MỌI bước sau đó nhắm vào ĐÚNG sản phẩm vừa tạo phải dùng productId:"$product" (không bịa id giả) — hệ thống sẽ tự thay bằng ID thật sau khi bước create-product chạy xong.

QUY TẮC ĐẶC BIỆT — "$research.name"/"$research.brand"/"$research.model": nếu Plan có bước research-product, các bước check-duplicate/create-product SAU ĐÓ có thể dùng token này thay vì bịa tên/thương hiệu — hệ thống tự thay bằng kết quả nghiên cứu thật sau khi bước research-product chạy xong.

QUY TẮC ĐẶC BIỆT — "Tạo sản phẩm X đầy đủ" (Complete Product Creation): khi Founder muốn TẠO 1 sản phẩm mới ĐẦY ĐỦ (không chỉ tạo trống), LUÔN dùng ĐÚNG thứ tự: research-product (nếu tên có vẻ viết tắt) → check-duplicate → create-product → smart-background (chỉ khi có ảnh đính kèm) → detect-category → product-description-writer → seo → blog-writer → facebook-post-generator → banner-generator → image-generator → related-products → quality-score → missing-info-report → open-product (bước cuối, để Founder Review). Nếu tên Founder gõ ĐÃ đầy đủ rõ ràng (có thương hiệu + model), có thể bỏ qua research-product và dùng thẳng tên đó.

QUY TẮC ĐẶC BIỆT — "Cập nhật X" (Sản phẩm ĐÃ CÓ): khi Founder nói "Cập nhật X"/"Làm mới nội dung X" mà KHÔNG nói rõ cần làm gì cụ thể, hiểu là viết lại Product AI + SEO cho ĐÚNG sản phẩm đó (KHÔNG tạo sản phẩm mới, KHÔNG chạy lại check-duplicate/create-product). Nếu Founder nói rõ hơn (vd "Cập nhật giá X") thì dùng đúng tool tương ứng (update-product-field).

QUY TẮC ĐẶC BIỆT — "Xuất bản X" (Publish): Agent KHÔNG BAO GIỜ tự Publish/Xuất bản thay Founder (Draft Before Publish). Khi Founder nói "Xuất bản X"/"Đăng X"/"Publish X", LUÔN dùng open-draft (nếu rõ loại Draft, vd "Xuất bản Blog X" → moduleId "blog-writer") hoặc open-product (nếu nói chung chung "Xuất bản X") để MỞ ĐÚNG trang — Founder tự bấm nút Lưu/Publish/Duyệt & Publish thật trên trang đó.

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

Founder: "Tạo sản phẩm Denon SC6000" kèm đính kèm 1 Ảnh sản phẩm (SC6000 CHƯA có trong danh sách) →
{"steps":[
  {"tool":"check-duplicate","target":"Denon SC6000","inputParams":{"name":"Denon SC6000"}},
  {"tool":"create-product","target":"Denon SC6000","inputParams":{"name":"Denon SC6000","brand":"Denon DJ"}},
  {"tool":"smart-background","target":"Denon SC6000","inputParams":{"productId":"$product"}},
  {"tool":"detect-category","target":"Denon SC6000","inputParams":{"productId":"$product"}},
  {"tool":"product-description-writer","target":"Denon SC6000","inputParams":{"productId":"$product","tone":"Chuyên nghiệp"}},
  {"tool":"seo","target":"Denon SC6000","inputParams":{}},
  {"tool":"related-products","target":"Denon SC6000","inputParams":{"productId":"$product"}},
  {"tool":"quality-score","target":"Denon SC6000","inputParams":{"productId":"$product"}},
  {"tool":"missing-info-report","target":"Denon SC6000","inputParams":{"productId":"$product"}},
  {"tool":"open-product","target":"Denon SC6000","inputParams":{"productId":"$product"}}
]}

Founder: "Cập nhật RX3" (RX3 ĐÃ có, id "p7") →
{"steps":[
  {"tool":"product-description-writer","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7","tone":"Chuyên nghiệp"}},
  {"tool":"seo","target":"Pioneer XDJ-RX3","inputParams":{}}
]}

Founder: "Xuất bản Blog RX3" (RX3 ĐÃ có, id "p7") →
{"steps":[{"tool":"open-draft","target":"Pioneer XDJ-RX3","inputParams":{"moduleId":"blog-writer","query":"rx3"}}]}

Founder: "Xuất bản RX3" (chung chung, không rõ loại Draft, RX3 ĐÃ có, id "p7") →
{"steps":[{"tool":"open-product","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7"}}]}

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
      } else if (key === 'productId' && !val && step.target) {
        // AI thà để trống productId còn hơn bịa id giả (đúng nguyên tắc) khi
        // không chắc — nhưng sản phẩm ĐÃ CÓ thật trong danh sách thì vẫn nên
        // tự đối chiếu lại được. Dùng ĐÚNG cách so khớp (chuẩn hoá + fuzzy
        // substring) mà bước check-duplicate đang dùng, tránh báo lỗi oan.
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
        // Lưu lại categoryIds TRƯỚC khi gán — cần cho "Undo last step" (rollback
        // đúng giá trị cũ, không phải xóa trắng).
        const prodBefore = products.find(p => p.id === pid) || {};
        step._previousCategoryIds = Array.isArray(prodBefore.categoryIds) ? prodBefore.categoryIds.slice() : [];
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
      } else if (step.tool === 'smart-background') {
        // "SMART BACKGROUND: Automatically remove obvious white backgrounds.
        // Blend Products naturally." — CHỈ xử lý khi Sản phẩm CÓ ảnh thật
        // (Founder tự tải lên qua đính kèm chat/Product Editor) VÀ ảnh đó
        // được phát hiện nền trắng rõ ràng — không đụng vào ảnh không có,
        // không đụng vào ảnh KHÔNG phải nền trắng (tránh xử lý nhầm). Tái
        // dùng ĐÚNG AdminBgRemover.removeBackgroundUrl() (Cloud Function
        // remove_background đã có) — KHÔNG gọi API xóa phông mới.
        const pid = resolvedParams.productId;
        step.productId = pid;
        const prod = products.find(p => p.id === pid) || {};
        const firstImage = Array.isArray(prod.images) && prod.images.length ? prod.images[0] : (prod.image || '');
        if (!firstImage) {
          step.smartBackground = { applied: false, reason: 'Sản phẩm chưa có ảnh — bỏ qua.' };
          step.status = 'completed';
        } else if (typeof AdminBgRemover === 'undefined' || !AdminBgRemover.removeBackgroundUrl) {
          step.smartBackground = { applied: false, reason: 'Công cụ xóa phông chưa sẵn sàng trên trang này.' };
          step.status = 'completed';
        } else {
          const isWhiteBg = await detectWhiteBackground(firstImage);
          if (!isWhiteBg) {
            step.smartBackground = { applied: false, reason: 'Không phát hiện nền trắng rõ ràng — giữ nguyên ảnh gốc.' };
            step.status = 'completed';
          } else {
            try {
              const resultUrl = await AdminBgRemover.removeBackgroundUrl(firstImage);
              // Lưu ảnh GỐC để "Undo last step" khôi phục đúng — dữ liệu THẬT
              // Founder tải lên, không phải AI sinh, nên phải giữ lại được.
              step._previousImages = Array.isArray(prod.images) ? prod.images.slice() : [];
              step._previousImage = prod.image || '';
              const newImages = step._previousImages.length ? [resultUrl].concat(step._previousImages.slice(1)) : [resultUrl];
              await DB.update(pid, { images: newImages, image: resultUrl });
              Object.assign(prod, { images: newImages, image: resultUrl });
              step.smartBackground = { applied: true, resultUrl };
              step.status = 'completed';
            } catch (err) {
              // Xóa phông thất bại (Provider/Cloud Function lỗi) — KHÔNG chặn
              // toàn bộ Plan, chỉ báo rõ và giữ nguyên ảnh gốc thật.
              step.smartBackground = { applied: false, reason: 'Lỗi xóa phông: ' + err.message };
              step.status = 'completed';
            }
          }
        }
      } else if (step.tool === 'product-banner') {
        // "đưa ảnh gốc lên AI xử lý nền rồi bỏ chữ vào ảnh" (Founder yêu cầu
        // trực tiếp) — CHỈNH SỬA ảnh THẬT (model gpt-image-1 /v1/images/edits
        // qua AdminBgRemover.editImageUrl(), KHÁC hẳn image-generator dall-e-3
        // chỉ vẽ ảnh mới). Không tự ghi đè ảnh sản phẩm/bgImage nào — CHỈ trả
        // về 1 ảnh kết quả để Founder tự xem/tải, tự quyết định dùng ở đâu
        // (đúng "Draft Before Publish", tránh ghi nhầm ảnh chính sản phẩm).
        const pid = resolvedParams.productId;
        step.productId = pid;
        const prod = products.find(p => p.id === pid);
        if (!prod) throw new Error('Không xác định được sản phẩm cần làm banner.');
        const sourceImage = (Array.isArray(prod.images) && prod.images.length ? prod.images[0] : prod.image) || '';
        if (!sourceImage) throw new Error('Sản phẩm "' + prod.name + '" chưa có ảnh thật — cần tải ảnh lên trước (Quản lý Sản phẩm) rồi mới làm banner được.');
        if (typeof AdminBgRemover === 'undefined' || !AdminBgRemover.editImageUrl) throw new Error('Công cụ chỉnh sửa ảnh chưa sẵn sàng trên trang này.');
        const style = String(resolvedParams.style || 'Dark').trim();
        const tagline = String(resolvedParams.tagline || '').trim();
        const editPrompt = `Professional product marketing banner background for a DJ/audio equipment store. Style: ${style} theme — dramatic gradient, spot lighting, premium tech aesthetic. Add bold, clearly legible white text overlay in the lower-left area saying exactly: "${prod.name}"${tagline ? `, with a smaller subtitle line below it saying exactly: "${tagline}"` : ''}. Keep the product in the photo exactly as it is — same shape, colors, logos, and details, do not redraw or alter the product itself.`;
        const resultUrl = await AdminBgRemover.editImageUrl(sourceImage, editPrompt, '16:9');
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
        const descStep = m.steps.find(s => s.tool === 'product-description-writer' && s.status === 'completed');
        let draftContent = {};
        if (descStep && descStep.draftId) {
          const d = await DraftDB.get(descStep.draftId);
          draftContent = (d && d.content) || {};
        }
        const catStep = m.steps.find(s => s.tool === 'detect-category');
        const hasCategory = !!(catStep && catStep.categoryResult && (catStep.categoryResult.autoAssigned || []).length) || (Array.isArray(prod.categoryIds) && prod.categoryIds.length > 0);
        // 11 hạng mục ĐÚNG "FINAL REVIEW" Requirement V5 liệt kê (Product/SEO/
        // Categories/Featured Image/Gallery/Background/Video/Files/Blog/
        // Facebook/Banner — "Internal Links" là chỉ số THÔNG TIN riêng, không
        // cộng điểm — trùng lặp với Blog/Facebook/Banner đã tính rồi, cộng
        // thêm sẽ tính 2 lần). Blog/Facebook/Banner tính "đạt" khi bước tương
        // ứng trong CÙNG Plan đã Completed VÀ có draftId thật (không tự suy
        // đoán — dùng chính kết quả SELF CHECK). "Background" tính "đạt" khi
        // bước smart-background ĐÃ CHẠY (dù áp dụng xóa phông hay xác nhận
        // không cần) — nghĩa là trình bày ảnh ĐÃ được xem xét, không phải bỏ
        // qua hoàn toàn.
        const blogStep = m.steps.find(s => s.tool === 'blog-writer' && s.status === 'completed' && s.draftId);
        const fbStep = m.steps.find(s => s.tool === 'facebook-post-generator' && s.status === 'completed' && s.draftId);
        const bannerStep = m.steps.find(s => s.tool === 'banner-generator' && s.status === 'completed' && s.draftId);
        const bgStep = m.steps.find(s => s.tool === 'smart-background' && s.status === 'completed');
        const imgCount = Array.isArray(prod.images) ? prod.images.length : 0;
        const dims = [
          { label: 'Product', weight: 10, ok: !!descStep },
          { label: 'SEO', weight: 12, ok: !!(draftContent.seoTitle && draftContent.metaDescription) },
          { label: 'Categories', weight: 12, ok: hasCategory },
          { label: 'Featured Image', weight: 10, ok: imgCount > 0 },
          { label: 'Gallery', weight: 6, ok: imgCount >= 2 },
          { label: 'Background', weight: 10, ok: !!bgStep },
          { label: 'Video', weight: 6, ok: !!prod.youtubeUrl },
          { label: 'Tài liệu', weight: 4, ok: false }, // chưa có hạ tầng đính kèm file cho Sản phẩm — luôn thiếu, xem missing-info-report
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
        // Từng dòng ĐÚNG tên literal Requirement liệt kê (Missing Images/PDF/
        // Firmware/Driver/Warranty/Video/Gallery) — PDF/Firmware/Driver LUÔN
        // xuất hiện (hạ tầng đính kèm file cho Sản phẩm chưa tồn tại, không
        // phải lỗi từng sản phẩm) — phản ánh ĐÚNG THỰC TẾ, không phải lỗi.
        const missing = [];
        if (!imgCount) missing.push('Thiếu Ảnh sản phẩm (Missing Images) — Founder tự tải lên qua 📷 hoặc Thư viện ảnh.');
        else if (imgCount < 2) missing.push('Thiếu Gallery (Missing Gallery) — chỉ có 1 ảnh, cần thêm ảnh các góc khác.');
        if (!prod.youtubeUrl) missing.push('Thiếu Video YouTube (Missing Video).');
        missing.push('Thiếu file PDF hướng dẫn (Missing PDF) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
        missing.push('Thiếu Firmware (Missing Firmware) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
        missing.push('Thiếu Driver (Missing Driver) — hệ thống hiện chưa hỗ trợ đính kèm file cho Sản phẩm.');
        if (!prod.warranty) missing.push('Thiếu thông tin Bảo hành (Missing Warranty).');
        if (!prod.sku) missing.push('Thiếu SKU.');
        const bgStepForMissing = m.steps.find(s => s.tool === 'smart-background' && s.status === 'completed');
        if (!bgStepForMissing) missing.push('Chưa xử lý Ảnh nền (Missing Background) — Founder tự kiểm tra qua "Xóa phông ảnh sản phẩm".');
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

        // SELF CHECK (root cause đã xác nhận với Founder: "Founder Agent
        // finishes but no Draft is created") — AIJobQueue.resume() KHÔNG BAO
        // GIỜ throw dù job/item bên trong thất bại (Provider chưa cấu hình/
        // lỗi API/rate limit) — job-queue.js tự nuốt lỗi, ghi LogDB, đánh dấu
        // job status:'failed' rồi RESOLVE bình thường (xem PROJECT_
        // ARCHITECTURE.md). Vì vậy KHÔNG được coi "không throw" = "đã có
        // Draft thật" — phải tự xác nhận lại bằng cách tìm đúng Draft MỚI
        // (createdAt >= lúc bắt đầu bước này), không phải "Draft draft mới
        // nhất bất kỳ" (có thể là Draft CŨ còn sót từ trước, gây báo nhầm).
        const runOnce = async () => {
          const startedAt = Date.now();
          await plugin.execute([resolvedParams], user.uid, user.email);
          await AIJobQueue.resume(user.uid, user.email);
          const drafts = await DraftDB.getAll();
          const sorted = drafts.filter(d => d.status === 'draft' && d.moduleId === step.tool && (d.createdAt || 0) >= startedAt)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          return sorted[0] || null;
        };

        // "If any step fails, retry automatically where possible" — 1 lần
        // thử lại tự động (KHÔNG lặp vô hạn) trước khi báo Thất bại thật.
        let newDraft = await runOnce();
        if (!newDraft) newDraft = await runOnce();
        if (!newDraft) {
          throw new Error('AI không tạo được nội dung (đã tự thử lại 1 lần) — kiểm tra Provider/Nhật ký lỗi tại "Plugin AI (Thủ công) > Nhật ký".');
        }
        step.draftId = newDraft.id;
        step.status = 'completed';
        // Tự động nối Ảnh nền sản phẩm AI vừa vẽ vào đúng ô "ẢNH NỀN SẢN
        // PHẨM" (pBgImage, admin/products.html) — Founder yêu cầu tự động,
        // khỏi phải tự vào "Duyệt nội dung" copy link rồi dán tay. CHỈ áp
        // dụng khi Founder RÕ RÀNG chọn đúng loại ảnh "Product Background
        // Image" + đã chọn đúng 1 Sản phẩm thật (productId) — không tự suy
        // đoán/ghi nhầm sản phẩm khác, không áp dụng cho các loại ảnh khác.
        if (step.tool === 'image-generator' && resolvedParams.imageType === 'Product Background Image' && resolvedParams.productId && newDraft.content && newDraft.content.imageUrl) {
          await DB.update(resolvedParams.productId, { bgImage: newDraft.content.imageUrl });
          const prod = products.find(p => p.id === resolvedParams.productId);
          if (prod) prod.bgImage = newDraft.content.imageUrl;
          step.autoAppliedBgImage = { productId: resolvedParams.productId, imageUrl: newDraft.content.imageUrl };
        }
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
      // WORKFLOW HISTORY — tự ghi lại 1 lần duy nhất khi TOÀN BỘ Plan đã dừng
      // (Completed/Failed/Skipped, không còn Pending) — "Store Workflow Name/
      // Created Time/Duration/Completed/Failed/Skipped Steps". Chỉ khoá
      // _historyRecorded khi ghi THÀNH CÔNG thật (xem recordWorkflowHistory).
      if (m.steps.length && !m._historyRecorded && m.steps.every(s => ['completed', 'skipped', 'failed'].indexOf(s.status) !== -1)) {
        recordWorkflowHistory(m).then(ok => { if (ok) m._historyRecorded = true; });
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

  // ── CONTINUE MISSING ITEMS / FINISH — Founder Review Dashboard ──────────

  // continueMissingItems — đặt lại mọi bước Thất bại/Đã bỏ qua về Chờ chạy
  // rồi CHẠY TẤT CẢ lại — "Founder can click Continue Missing Items."
  function continueMissingItems(msgId) {
    if (isBusy) return;
    const m = findMsg(msgId);
    if (!m || !m.steps) return;
    m.steps.forEach(s => {
      if (s.status === 'failed' || s.status === 'skipped') {
        s.status = 'pending';
        s.errorText = null;
      }
    });
    m._historyRecorded = false; // Plan chưa thật sự xong — cho phép ghi History lại khi hoàn tất lần nữa
    renderMessages();
    runAll(msgId);
  }

  // finishWorkflow — Founder xác nhận đã xem xét xong — ghi Lịch sử (nếu
  // chưa ghi), xoá snapshot Resume (Plan này không còn "dang dở" nữa).
  function finishWorkflow(msgId) {
    const m = findMsg(msgId);
    if (!m) return;
    m.finished = true;
    if (!m._historyRecorded) {
      recordWorkflowHistory(m).then(ok => { if (ok) m._historyRecorded = true; renderMessages(); });
    }
    try { localStorage.removeItem(WORKFLOW_SNAPSHOT_KEY); } catch (e) { /* localStorage không khả dụng - bỏ qua */ }
    renderMessages();
  }

  // ── UNDO LAST STEP — "Rollback only the previous step." ─────────────────
  // Chỉ hoàn tác bước HOÀN TẤT GẦN NHẤT trong Plan (theo thứ tự Plan, không
  // phải theo thời gian bấm). Hành động hoàn tác tuỳ loại bước:
  //   - Bước tạo Draft (Product/SEO/Blog/Facebook/Banner/Image AI): TỪ CHỐI
  //     Draft đó qua ĐÚNG AdminAI.rejectDraftById() đã có (giữ lại để tra
  //     cứu, không xoá — cùng hành vi nút "TỪ CHỐI" ở trang Duyệt nội dung).
  //   - detect-category (đã tự gán): GHI LẠI categoryIds CŨ (đã lưu từ lúc
  //     gán) qua ĐÚNG DB.update() — không xoá trắng.
  //   - create-product: XOÁ THẬT sản phẩm qua ĐÚNG DB.remove() — CHỈ cho
  //     phép khi đây là bước hoàn tất DUY NHẤT (chưa bước nào SAU nó ghi dữ
  //     liệu thật), và LUÔN hỏi xác nhận trước (cùng UX confirm() các trang
  //     Admin khác đã dùng cho xoá thật) — hành động phá huỷ duy nhất trong
  //     toàn bộ Founder Agent, cần cẩn trọng tối đa.
  //   - check-duplicate/related-products/quality-score/missing-info-report/
  //     điều hướng: không ghi gì thật — chỉ đặt lại Chờ chạy.
  const UNDOABLE_DRAFT_TOOLS = ['product-description-writer', 'seo', 'blog-writer', 'facebook-post-generator', 'banner-generator', 'image-generator'];

  function undoLastStep(msgId) {
    if (isBusy) return;
    const m = findMsg(msgId);
    if (!m || !m.steps) { alert('Không có kế hoạch nào để hoàn tác.'); return; }
    let idx = -1;
    for (let i = m.steps.length - 1; i >= 0; i--) {
      if (m.steps[i].status === 'completed') { idx = i; break; }
    }
    if (idx === -1) { alert('Không có bước nào đã Hoàn tất để hoàn tác.'); return; }
    const step = m.steps[idx];

    if (UNDOABLE_DRAFT_TOOLS.indexOf(step.tool) !== -1) {
      if (!step.draftId || typeof AdminAI === 'undefined' || !AdminAI.rejectDraftById) {
        step.status = 'pending'; step.draftId = null;
        renderMessages();
        return;
      }
      AdminAI.rejectDraftById(step.draftId).then(() => {
        step.status = 'pending'; step.draftId = null; step.errorText = null;
        renderMessages();
      });
      return;
    }
    if (step.tool === 'detect-category') {
      if (step.categoryResult && step.categoryResult.autoAssigned && step._previousCategoryIds !== undefined) {
        const activeCats = categories.filter(c => c.active !== false);
        const prevIds = step._previousCategoryIds;
        const first = activeCats.find(c => c.code === prevIds[0]);
        DB.update(step.productId, { categoryIds: prevIds, category: prevIds[0] || '', categoryLabel: first ? first.label : '' }).then(() => {
          const p = products.find(x => x.id === step.productId);
          if (p) p.categoryIds = prevIds;
          step.status = 'pending'; step.categoryResult = null;
          renderMessages();
        });
        return;
      }
      step.status = 'pending'; step.categoryResult = null;
      renderMessages();
      return;
    }
    if (step.tool === 'create-product') {
      const laterCompleted = m.steps.slice(idx + 1).some(s => s.status === 'completed');
      if (laterCompleted) { alert('Không thể hoàn tác — đã có bước SAU đó hoàn tất (Danh mục/Draft/...). Hãy hoàn tác các bước sau trước, theo đúng thứ tự.'); return; }
      if (!confirm('Hoàn tác sẽ XOÁ VĨNH VIỄN sản phẩm "' + step.target + '" vừa tạo. Không thể khôi phục. Tiếp tục?')) return;
      DB.remove(step.productId).then(() => {
        products = products.filter(p => p.id !== step.productId);
        step.status = 'pending'; step.productId = null;
        renderMessages();
      });
      return;
    }
    if (step.tool === 'smart-background') {
      if (step.smartBackground && step.smartBackground.applied && step._previousImages !== undefined) {
        DB.update(step.productId, { images: step._previousImages, image: step._previousImage || '' }).then(() => {
          const p = products.find(x => x.id === step.productId);
          if (p) Object.assign(p, { images: step._previousImages, image: step._previousImage || '' });
          step.status = 'pending'; step.smartBackground = null;
          renderMessages();
        });
        return;
      }
      step.status = 'pending'; step.smartBackground = null;
      renderMessages();
      return;
    }
    // check-duplicate / related-products / quality-score / missing-info-report / điều hướng — không ghi dữ liệu thật.
    step.status = 'pending';
    renderMessages();
  }

  // ── RESUME WORKFLOW / AUTO SAVE (localStorage) ───────────────────────────
  // "Save progress after every successful step. If the browser closes, save
  // the workflow. Next time, display: Resume previous workflow?" — dùng
  // localStorage (KHÔNG ghi Firebase, cùng cơ chế/giới hạn UI Mode toggle ở
  // js/admin-auth.js: per-browser, không theo tài khoản).

  function saveWorkflowSnapshot() {
    try {
      const m = messages.slice().reverse().find(x => x.role === 'agent' && x.steps && x.steps.length && !x.finished);
      if (!m || m.steps.every(s => ['completed', 'skipped', 'failed'].indexOf(s.status) !== -1)) {
        localStorage.removeItem(WORKFLOW_SNAPSHOT_KEY);
        return;
      }
      localStorage.setItem(WORKFLOW_SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), message: m }));
    } catch (e) { /* localStorage không khả dụng - bỏ qua */ }
  }

  function tryOfferResume() {
    try {
      const raw = localStorage.getItem(WORKFLOW_SNAPSHOT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap || !snap.message || !snap.message.steps || !snap.message.steps.length) {
        localStorage.removeItem(WORKFLOW_SNAPSHOT_KEY);
        return;
      }
      pushAgentMsg({
        text: 'Tìm thấy 1 kế hoạch chưa hoàn tất từ phiên trước (' + new Date(snap.savedAt).toLocaleString('vi-VN') + '). Tiếp tục kế hoạch trước đó?',
        steps: null,
        resumeOffer: snap.message
      });
      renderMessages();
    } catch (e) { /* dữ liệu snapshot lỗi - bỏ qua, không chặn trang tải */ }
  }

  function resumeWorkflow(offerMsgId) {
    const offerMsg = findMsg(offerMsgId);
    if (!offerMsg || !offerMsg.resumeOffer) return;
    const restored = offerMsg.resumeOffer;
    restored.id = 'msg_' + (++msgCounter);
    messages.push(restored);
    offerMsg.resumeOffer = null;
    offerMsg.text = 'Đã tiếp tục kế hoạch trước đó.';
    renderMessages();
  }

  function discardWorkflow(offerMsgId) {
    try { localStorage.removeItem(WORKFLOW_SNAPSHOT_KEY); } catch (e) { /* bỏ qua */ }
    const offerMsg = findMsg(offerMsgId);
    if (offerMsg) { offerMsg.text = 'Đã bỏ qua kế hoạch trước đó.'; offerMsg.resumeOffer = null; }
    renderMessages();
  }

  // ── WORKFLOW HISTORY — WorkflowDB (js/ai/ai-db.js, factory makeListDB() có
  // sẵn — không viết CRUD mới). Cần Chief Architect deploy thêm rule
  // "founderAgentWorkflows" trong database.rules.json (Firebase Rules chỉ
  // Chief Architect tự deploy) — cho tới lúc đó, mọi lỗi ở đây được bắt và
  // báo rõ, KHÔNG chặn phần còn lại của Founder Agent hoạt động.

  // recordWorkflowHistory — trả về Promise<boolean> (true = đã ghi thành
  // công) để CALLER tự quyết định có đánh dấu m._historyRecorded hay không —
  // KHÔNG được khoá "đã ghi" khi thật ra ghi thất bại (vd Database Rules cho
  // "founderAgentWorkflows" chưa được Chief Architect deploy), nếu không sẽ
  // MẤT VĨNH VIỄN cơ hội ghi lại Workflow đó kể cả sau khi Rules đã deploy.
  function recordWorkflowHistory(m) {
    if (typeof WorkflowDB === 'undefined' || !WorkflowDB.add) return Promise.resolve(false);
    const completed = m.steps.filter(s => s.status === 'completed').length;
    const failed = m.steps.filter(s => s.status === 'failed').length;
    const skipped = m.steps.filter(s => s.status === 'skipped').length;
    const idx = messages.indexOf(m);
    const firstUserMsg = idx > 0 ? messages.slice(0, idx).reverse().find(x => x.role === 'user') : null;
    const name = ((firstUserMsg && firstUserMsg.text) || m.text || 'Workflow').slice(0, 80);
    const productStep = m.steps.find(s => s.productId);
    return WorkflowDB.add({
      name,
      startedAt: m.startedAt || null,
      finishedAt: Date.now(),
      durationMs: m.startedAt ? (Date.now() - m.startedAt) : null,
      completedCount: completed,
      failedCount: failed,
      skippedCount: skipped,
      productId: productStep ? productStep.productId : null
    }).then(() => true).catch(() => false); // Database Rules có thể chưa deploy — không chặn Founder, chỉ báo "chưa ghi được"
  }

  function showHistory() {
    if (typeof WorkflowDB === 'undefined' || !WorkflowDB.getAll) {
      pushAgentMsg({ text: 'Lịch sử Workflow chưa khả dụng trên trang này.', steps: [] });
      renderMessages();
      return;
    }
    const msgId = pushAgentMsg({ text: 'Đang tải Lịch sử Workflow...', steps: null });
    renderMessages();
    WorkflowDB.getAll().then(list => {
      const sorted = list.slice().sort((a, b) => (b.finishedAt || b.createdAt || 0) - (a.finishedAt || a.createdAt || 0)).slice(0, 10);
      if (!sorted.length) { updateMsg(msgId, { text: 'Chưa có Workflow nào trong Lịch sử.', steps: [] }); renderMessages(); return; }
      const rows = sorted.map(w => {
        const dur = w.durationMs ? Math.round(w.durationMs / 1000) + 's' : '—';
        const link = w.productId ? ` <a href="/admin/products.html?edit=${encodeURIComponent(w.productId)}" class="agent-open-draft-btn">Mở Sản phẩm →</a>` : '';
        return `<li>${escHtml(w.name)} — ${new Date(w.finishedAt || w.createdAt).toLocaleString('vi-VN')} (${dur}) — ${w.completedCount || 0} Hoàn tất / ${w.failedCount || 0} Thất bại / ${w.skippedCount || 0} Bỏ qua${link}</li>`;
      }).join('');
      updateMsg(msgId, { text: 'Lịch sử Workflow gần đây:', steps: [], historyHtml: `<ul class="agent-plan-report-links">${rows}</ul>` });
      renderMessages();
    }).catch(err => {
      updateMsg(msgId, { text: 'Không tải được Lịch sử Workflow: ' + err.message + ' (có thể do Database Rules cho "founderAgentWorkflows" chưa được Chief Architect deploy).', steps: [] });
      renderMessages();
    });
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
    saveWorkflowSnapshot(); // Auto Save — "Save progress after every successful step."
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
    // Plan "Cập nhật/SEO cho sản phẩm ĐÃ CÓ" (chỉ Product AI + SEO, không có
    // bước detect-category riêng) không hề hiện Danh mục hiện tại ở đâu —
    // Founder không biết sản phẩm đang nằm trong mục nào. Hiện luôn ngay khi
    // productId đã resolve được (không chờ Hoàn tất, để Founder thấy sớm).
    if (step.tool === 'product-description-writer' && step.productId) {
      const prod = products.find(p => p.id === step.productId);
      if (prod) {
        const catLabel = prod.categoryLabel || (Array.isArray(prod.categoryIds) && prod.categoryIds.length ? prod.categoryIds.join(', ') : '');
        return `<div class="agent-step-extra">🏷 Danh mục hiện tại: <strong>${escHtml(catLabel || 'Chưa gán Danh mục')}</strong></div>`;
      }
    }
    if (step.tool === 'product-banner' && step.productBannerResult) {
      const url = step.productBannerResult.imageUrl;
      return `<div class="agent-step-extra">🪧 <strong>Banner sản phẩm đã xong.</strong><br>
        <img src="${escHtml(url)}" alt="Banner sản phẩm" style="max-width:280px;margin-top:0.5rem;border-radius:4px;display:block">
        <a href="${escHtml(url)}" target="_blank" rel="noopener" class="agent-open-draft-btn">Xem/Tải ảnh đầy đủ →</a>
      </div>`;
    }
    if (step.tool === 'image-generator' && step.autoAppliedBgImage) {
      const prod = products.find(p => p.id === step.autoAppliedBgImage.productId);
      return `<div class="agent-step-extra">🖼 <strong>Đã tự động gắn làm Ảnh nền sản phẩm${prod ? ' cho "' + escHtml(prod.name) + '"' : ''}.</strong> Xem/chỉnh lại ở <a href="/admin/products.html?edit=${encodeURIComponent(step.autoAppliedBgImage.productId)}" class="agent-open-draft-btn">Sửa Sản phẩm →</a></div>`;
    }
    if (step.tool === 'smart-background' && step.smartBackground) {
      const sb = step.smartBackground;
      if (sb.applied) return `<div class="agent-step-extra">🎨 <strong>Đã tự động phát hiện + xóa phông nền trắng.</strong> Ảnh gốc vẫn giữ lại (gõ "hoàn tác" nếu muốn khôi phục).</div>`;
      return `<div class="agent-step-extra">🎨 ${escHtml(sb.reason || 'Không có gì để xử lý.')}</div>`;
    }
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
      const linksLine = `<br>${q.hasInternalLinks ? '✓' : '✗'} Internal Links <span class="small-muted">(không cộng điểm — tự tính từ Blog/Facebook/Banner ở trên)</span>`;
      return `<div class="agent-step-extra">⭐ <strong>Điểm chất lượng: ${q.score}/100</strong><br>${rows}${linksLine}</div>`;
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
  // Draft links" — tính TRỰC TIẾP từ steps[], không lưu cờ riêng. Plan có
  // bước quality-score/missing-info-report (Complete Product Creation) hiện
  // "Founder Review Dashboard" đầy đủ hơn (Completed/Missing/Warnings/
  // Quality Score + nút Open Product/Open <X> Draft/Continue Missing Items/
  // Finish) — Plan V1-V3 đơn giản (Mở Sản phẩm/Đổi field/Blog+Facebook...)
  // vẫn giữ NGUYÊN báo cáo gọn cũ, không đổi hành vi.
  function renderReport(m) {
    const completed = m.steps.filter(s => s.status === 'completed');
    const failed = m.steps.filter(s => s.status === 'failed');
    const skipped = m.steps.filter(s => s.status === 'skipped');
    const qualityStep = m.steps.find(s => s.tool === 'quality-score' && s.qualityScore);
    const missingStep = m.steps.find(s => s.tool === 'missing-info-report' && s.missingInfo);

    if (qualityStep || missingStep) {
      const catStep = m.steps.find(s => s.tool === 'detect-category');
      const productStep = m.steps.find(s => s.productId);
      const pid = productStep ? productStep.productId : null;
      const draftBtn = (tool, label) => {
        const s = m.steps.find(x => x.tool === tool && x.status === 'completed' && x.draftId);
        return s ? `<button type="button" class="agent-plan-btn" onclick="window.location.href='/admin/ai/drafts.html'">${label}</button>` : '';
      };
      const buttons = [
        pid ? `<button type="button" class="agent-plan-btn" onclick="window.location.href='/admin/products.html?edit=${encodeURIComponent(pid)}'">Mở Sản phẩm</button>` : '',
        draftBtn('product-description-writer', 'Mở Product AI Draft'),
        draftBtn('blog-writer', 'Mở Blog Draft'),
        draftBtn('facebook-post-generator', 'Mở Facebook Draft'),
        draftBtn('banner-generator', 'Mở Banner Draft'),
        (failed.length || skipped.length) ? `<button type="button" class="agent-plan-btn" onclick="AdminAgent.continueMissingItems('${m.id}')">Tiếp tục mục còn thiếu</button>` : '',
        !m.finished ? `<button type="button" class="agent-plan-btn" onclick="AdminAgent.finishWorkflow('${m.id}')">Hoàn tất</button>` : ''
      ].filter(Boolean).join(' ');
      const warnings = [];
      if (catStep && catStep.categoryResult && catStep.categoryResult.noMatch) warnings.push('Không tìm thấy Danh mục phù hợp — Founder tự gán qua Quản lý Sản phẩm.');
      return `<div class="agent-plan-report agent-dashboard">
        <p><strong>Founder Review Dashboard</strong></p>
        <p>${completed.length} Hoàn tất · ${failed.length} Thất bại · ${skipped.length} Đã bỏ qua</p>
        ${qualityStep ? `<p><strong>Điểm chất lượng (Quality Score): ${qualityStep.qualityScore.score}/100</strong></p>` : ''}
        ${missingStep && missingStep.missingInfo.length ? `<p><strong>Còn thiếu (Missing):</strong><br>${missingStep.missingInfo.map(escHtml).join('<br>')}</p>` : ''}
        ${warnings.length ? `<p class="agent-step-warn"><strong>Cảnh báo (Warnings):</strong><br>${warnings.map(escHtml).join('<br>')}</p>` : ''}
        <div class="agent-plan-actions">${buttons}</div>
      </div>`;
    }

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
    const resumeButtons = m.resumeOffer
      ? `<div class="agent-plan-actions"><button type="button" class="agent-plan-btn" onclick="AdminAgent.resumeWorkflow('${m.id}')">Tiếp tục</button><button type="button" class="agent-plan-btn agent-plan-btn-danger" onclick="AdminAgent.discardWorkflow('${m.id}')">Bỏ qua</button></div>`
      : '';
    const history = m.historyHtml || '';
    return `<div class="agent-msg agent-msg-agent">
      <div class="agent-msg-bubble">
        <div class="agent-msg-body">${body}</div>
        ${plan}
        ${resumeButtons}
        ${history}
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
    attachImage, attachFileClick, handleFileSelected, removeAttachment, toggleMic,
    continueMissingItems, finishWorkflow, undoLastStep,
    resumeWorkflow, discardWorkflow
  };
})();
