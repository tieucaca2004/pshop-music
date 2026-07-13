/*
 * admin-agent.js — Founder Agent V3: CMS Operator (Sprint 13)
 * V1: 1 lệnh -> 1 công cụ -> 1 Draft. V2: 1 lệnh -> nhiều bước (Execution
 * Plan) -> Plugin/Queue/Draft. V3: THÊM khả năng "vận hành CMS thay Founder"
 * — mở đúng trang/đúng bản ghi (Sản phẩm/Draft), điền/đánh dấu 1 field trên
 * CHÍNH form thật đã có — KHÔNG BAO GIỜ tự ghi Firebase trực tiếp ("The
 * Agent never edits database directly. The Agent operates the existing
 * CMS."). Founder luôn là người bấm nút Lưu/Publish THẬT trên trang đích.
 *
 * KIẾN TRÚC: các bước "CMS Operator" mới (open-product/update-product-field/
 * open-draft/navigate) là 4 tool THÊM VÀO cùng danh sách tool Plugin đã có
 * (product-description-writer/blog-writer/...) trong CÙNG 1 Execution Plan —
 * khi CHẠY, chúng ĐIỀU HƯỚNG trình duyệt (window.location.href) sang trang
 * CMS thật, kèm query param (?edit=id, ?highlight=id...) — trang đích (đã
 * sửa THÊM, không viết lại) tự đọc param đó và tái sử dụng ĐÚNG hàm mở form/
 * hiển thị đã có (editProduct(), render()...) — "Do NOT duplicate Product
 * logic/Blog logic". Vì điều hướng phá hủy toàn bộ trạng thái trang hiện tại,
 * Planner được dạy KHÔNG xếp bước nào sau 1 bước điều hướng trong CÙNG Plan.
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
    'navigate':                    { label: 'Mở trang CMS',    icon: '🧭' }
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

  const STATUS_LABEL = { pending: 'Chờ chạy', running: 'Đang chạy', completed: 'Hoàn tất', failed: 'Thất bại', skipped: 'Đã bỏ qua' };

  const SUGGESTED = [
    { label: 'Mở sản phẩm',                  text: 'Mở Pioneer RX3' },
    { label: 'Đổi giá sản phẩm',             text: 'Đổi giá Pioneer RX3 thành 48 triệu' },
    { label: 'Tạo sản phẩm mới (full plan)', text: 'Tạo sản phẩm Pioneer RX3' },
    { label: 'Blog + Facebook cho RX3',      text: 'Viết Blog và Facebook cho Pioneer RX3' }
  ];

  let messages = []; // { id, role:'user'|'agent', text, steps:[...] }
  let user = null;
  let products = [];
  let blogPosts = [];
  let isBusy = false; // chặn gửi lệnh mới trong khi 1 Plan đang Run All (không chặn Run Step/Skip/Retry của Plan đang hiện — chỉ chặn gửi tin nhắn MỚI)

  // ── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    AdminAuth.init({ page: 'founder-agent', title: 'FOUNDER AGENT' }).then(({ user: u }) => {
      user = u;
      Promise.all([
        DB.getAll ? DB.getAll() : Promise.resolve([]),
        BlogDB && BlogDB.getAll ? BlogDB.getAll() : Promise.resolve([])
      ]).then(([prods, posts]) => {
        products = Array.isArray(prods) ? prods : [];
        blogPosts = Array.isArray(posts) ? posts : [];
        renderSuggested();
      }).catch(() => renderSuggested());
    });

    document.getElementById('agentInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.getElementById('agentSendBtn').addEventListener('click', send);
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

  // ── SEND ─────────────────────────────────────────────────────────────────────

  function send() {
    if (isBusy) return;
    const input = document.getElementById('agentInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    messages.push({ role: 'user', text });
    renderMessages();
    hideSuggested();
    planAndShow(text);
  }

  function hideSuggested() {
    const el = document.getElementById('agentSuggestions');
    if (el) el.style.display = 'none';
  }

  // ── PLANNER — GPT-4o-mini qua ĐÚNG Cloud Function openaiProxy đã có ─────────
  // (action="generate", không thêm Provider/API Key/Cloud Function mới — cùng
  // cách V1 dùng cho Tool Router, chỉ khác giờ trả về MẢNG bước thay vì 1
  // bước). Planner CHỈ xây kế hoạch — KHÔNG side-effect, không gọi Plugin nào
  // ở đây (đúng "The Agent itself never generates content. It only builds
  // and executes a plan" — bước "executes" nằm ở executeStep(), tách biệt).

  async function planAndShow(userText) {
    isBusy = true;
    setInputEnabled(false);
    const msgId = pushAgentMsg({ text: 'Đang lập kế hoạch...', steps: null });
    renderMessages();

    try {
      const plan = await buildPlan(userText);
      if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
        updateMsg(msgId, { text: (plan && plan.reason) || 'Không hiểu được yêu cầu này — hãy mô tả cụ thể hơn.', steps: [] });
        renderMessages();
        return;
      }
      const steps = plan.steps.map(s => normalizeStep(s));
      updateMsg(msgId, {
        text: steps.length > 1 ? `Đã lập Execution Plan gồm ${steps.length} bước:` : 'Đã hiểu yêu cầu:',
        steps
      });
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

  async function buildPlan(userText) {
    const idToken = await user.getIdToken();
    const productList = products.slice(0, 30).map(p => `- ${p.name} (id:${p.id})`).join('\n');
    const blogList = blogPosts.slice(0, 10).map(b => `- ${b.title} (id:${b.id})`).join('\n');

    const systemPrompt = `Bạn là Task Planner của PSH Platform (cửa hàng âm thanh DJ). Phân tích yêu cầu của Founder — CÓ THỂ cần NHIỀU công cụ — và trả về 1 Execution Plan dạng JSON (mảng các bước, ĐÚNG THỨ TỰ nên chạy).

Available tools (dùng ĐÚNG tên "tool" sau):
- create-product: TẠO MỚI 1 sản phẩm trống (chỉ có Tên). Dùng khi Founder nói "tạo sản phẩm X" và X CHƯA có trong danh sách sản phẩm dưới đây. inputParams: {"name": "<tên>"}
- product-description-writer: viết mô tả + SEO cho 1 sản phẩm (ĐÃ CÓ SẴN hoặc VỪA được tạo ở bước create-product trong CÙNG Plan này). inputParams: {"productId": "<id thật, hoặc \"$product\" nếu là sản phẩm vừa tạo ở bước create-product CÙNG Plan>", "tone": "Chuyên nghiệp"}
- seo: mốc hiển thị "SEO đã gộp chung vào Product AI" — CHỈ thêm bước này NGAY SAU 1 bước product-description-writer trong CÙNG Plan (không dùng riêng lẻ). inputParams: {}
- blog-writer: viết bài blog. inputParams: {"topic": "<chủ đề>", "tone": "Chuyên nghiệp", "keywords": "", "productId": "<id thật, hoặc \"$product\", hoặc bỏ trống nếu không liên quan sản phẩm nào>"}
- facebook-post-generator: viết bài Facebook. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- banner-generator: tạo banner quảng cáo. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- image-generator: tạo ảnh marketing AI. inputParams: {"productId": "<id thật, hoặc \"$product\", hoặc bỏ trống>"}
- open-product: MỞ trang Sửa 1 sản phẩm ĐÃ CÓ SẴN (KHÔNG sinh nội dung, chỉ điều hướng). Dùng khi Founder nói "Mở X"/"Xem X"/"Sửa X" mà không nói rõ đổi field nào. inputParams: {"productId": "<id thật>"}
- update-product-field: MỞ trang Sửa 1 sản phẩm VÀ điền sẵn 1 field cụ thể (Founder tự bấm Lưu — Agent KHÔNG tự lưu). Dùng khi Founder nói "Đổi <field> của X thành <giá trị>". Field hợp lệ: price/oldprice/name/warranty/stockstatus/status/sku. inputParams: {"productId": "<id thật>", "field": "<1 trong các field hợp lệ>", "value": "<giá trị mới, format đúng kiểu hiển thị — vd giá tiền viết đầy đủ số + đơn vị ₫, vd \"48 triệu\" => \"48.000.000 ₫\">"}
- open-draft: MỞ Social Media Center và làm nổi bật Draft mới nhất khớp yêu cầu (Founder muốn XEM/ĐĂNG 1 Draft ĐÃ TỒN TẠI, không phải tạo mới). Dùng khi Founder nói "Mở Draft Facebook X"/"Đăng Facebook X" (khi RÕ RÀNG muốn xem bản đã có, không phải viết bài mới). inputParams: {"moduleId": "facebook-post-generator" | "banner-generator" | "blog-writer" | "product-description-writer" (tùy loại), "query": "<từ khóa tìm, vd tên sản phẩm>"}
- navigate: MỞ 1 trang CMS chung (không gắn 1 bản ghi cụ thể). inputParams: {"page": "products"|"categories"|"blog"|"banners"|"drafts"|"social-media"|"images"}

QUY TẮC ĐẶC BIỆT — "$product": nếu Plan có bước create-product, MỌI bước sau đó nhắm vào ĐÚNG sản phẩm vừa tạo phải dùng productId:"$product" (không bịa id giả) — hệ thống sẽ tự thay bằng ID thật sau khi bước create-product chạy xong.

QUY TẮC ĐẶC BIỆT — điều hướng: open-product/update-product-field/open-draft/navigate làm trình duyệt CHUYỂN TRANG NGAY — KHÔNG BAO GIỜ đặt bước nào khác SAU 1 trong 4 tool này trong CÙNG Plan (mọi bước sau sẽ không chạy được vì trang đã đổi). Nếu Founder chỉ muốn "Mở X"/"Đổi field", Plan CHỈ có ĐÚNG 1 bước.

VÍ DỤ ĐÃ XÁC NHẬN ĐÚNG (few-shot, làm mẫu — không phải sản phẩm cố định):
Founder: "Mở RX3" (RX3 ĐÃ có, id thật vd "p7") →
{"steps":[{"tool":"open-product","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7"}}]}

Founder: "Đổi giá RX3 thành 48 triệu" (RX3 ĐÃ có, id "p7") →
{"steps":[{"tool":"update-product-field","target":"Pioneer XDJ-RX3","inputParams":{"productId":"p7","field":"price","value":"48.000.000 ₫"}}]}

Founder: "Tạo sản phẩm Pioneer RX3" (RX3 CHƯA có trong danh sách) →
{"steps":[
  {"tool":"create-product","target":"Pioneer RX3","inputParams":{"name":"Pioneer RX3"}},
  {"tool":"product-description-writer","target":"Pioneer RX3","inputParams":{"productId":"$product","tone":"Chuyên nghiệp"}},
  {"tool":"seo","target":"Pioneer RX3","inputParams":{}},
  {"tool":"blog-writer","target":"Pioneer RX3","inputParams":{"topic":"Pioneer RX3","tone":"Chuyên nghiệp","keywords":"","productId":"$product"}},
  {"tool":"facebook-post-generator","target":"Pioneer RX3","inputParams":{"productId":"$product"}},
  {"tool":"banner-generator","target":"Pioneer RX3","inputParams":{"productId":"$product"}},
  {"tool":"image-generator","target":"Pioneer RX3","inputParams":{"productId":"$product"}}
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

Quy tắc:
1. Nếu hiểu được yêu cầu, trả về: {"steps":[{"tool":"...","target":"...","inputParams":{...}}, ...]}
2. Yêu cầu chỉ cần 1 công cụ → mảng "steps" có ĐÚNG 1 phần tử (vẫn hợp lệ).
3. Nếu không hiểu được yêu cầu, trả về: {"steps":[],"reason":"<giải thích ngắn tiếng Việt>"}
4. Trả về JSON thuần, KHÔNG có markdown fence, KHÔNG có giải thích thêm.`;

    const r = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({
        action: 'generate',
        model: 'gpt-4o-mini',
        prompt: systemPrompt + '\n\nYêu cầu của Founder: ' + userText
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Planner lỗi.');

    const raw = (data.text || '').trim();
    try {
      const json = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      return JSON.parse(json);
    } catch (e) {
      return { steps: [], reason: 'Không phân tích được kế hoạch. Hãy thử diễn đạt cụ thể hơn.' };
    }
  }

  // ── EXECUTION — mỗi bước đi ĐÚNG Permission -> PluginManager -> Queue ->
  // Draft (giống hệt V1), "create-product"/"seo" là 2 ngoại lệ KHÔNG PHẢI
  // Plugin thật (xem chú thích TOOL_MAP). KHÔNG BAO GIỜ tự chạy nếu Founder
  // chưa bấm (Run All / Run Step) — đúng "Do NOT add Autonomous Agent".

  // resolveInputParams — thay token "$product" bằng ID thật của sản phẩm vừa
  // tạo TRONG CÙNG PLAN (chỉ khi bước create-product của Plan đó đã
  // Completed) — trả về null nếu còn token chưa resolve được (bước phụ
  // thuộc CHƯA sẵn sàng — chặn chạy nhầm với chuỗi "$product" theo nghĩa đen).
  function resolveInputParams(step, allSteps) {
    const params = Object.assign({}, step.inputParams);
    let ok = true;
    Object.keys(params).forEach(key => {
      if (params[key] === PRODUCT_TOKEN) {
        const createStep = allSteps.find(s => s.tool === 'create-product');
        if (createStep && createStep.status === 'completed' && createStep.productId) {
          params[key] = createStep.productId;
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
      step.errorText = 'Cần hoàn thành bước "Tạo Sản phẩm mới" trước — bấm THỬ LẠI sau khi bước đó Hoàn tất.';
      renderMessages();
      return 'failed';
    }

    step.status = 'running';
    step.errorText = null;
    renderMessages();

    try {
      if (step.tool === 'create-product') {
        const name = (resolvedParams.name || step.target || 'Sản phẩm mới').trim();
        // Không có Plugin nào "tạo sản phẩm mới" — không phải sinh NỘI DUNG
        // bằng AI (0 vi phạm "Never generate content directly"). Tái sử
        // dụng ĐÚNG DB.add() js/admin-products.js dùng cho sản phẩm mới.
        const newProduct = await DB.add({ name, pubStatus: 'draft' });
        step.productId = newProduct.id;
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

  // runAll — chạy tuần tự từ đầu Plan, bỏ qua bước đã Completed/Skipped.
  // DỪNG NGAY khi 1 bước Failed (Pause the plan — không chạy tiếp mù quáng),
  // hiện lý do, chờ Founder tự Thử lại hoặc bấm CHẠY TẤT CẢ lại (idempotent —
  // tự tiếp tục đúng từ bước còn Pending, không chạy lại bước đã xong).
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
        if (result === 'failed') break; // Pause the plan — FAILURE section
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
        return `<div class="agent-msg agent-msg-user"><div class="agent-msg-bubble">${escHtml(m.text)}</div></div>`;
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
    if (step.status === 'running') return `<span class="small-muted">Đang chạy...</span>`;
    return ''; // completed/skipped — không còn hành động
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
  // động Founder có thể bấm (Run/Skip/Cancel/Retry) — đúng PLAN UI + FOUNDER
  // CONTROLS. Có "▶ CHẠY TẤT CẢ" tổng ở trên (Run All).
  function renderPlan(m) {
    if (!m.steps || !m.steps.length) return '';
    const allDone = m.steps.every(s => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed');
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

  return { init, useSuggestion, send, runAll, runStep, skipStep, cancelStep, retryStep };
})();
