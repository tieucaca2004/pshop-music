/*
 * admin-agent.js — Founder Agent V2: Task Planner (Sprint 13)
 * Nâng cấp V1 (1 lệnh -> 1 công cụ -> 1 Draft) thành Task Planner: 1 lệnh CÓ
 * THỂ cần NHIỀU công cụ, Agent tự XÂY DỰNG 1 Execution Plan (danh sách bước,
 * mỗi bước là 1 công cụ + đích nhắm), Founder tự quyết định chạy bước nào,
 * khi nào — Agent KHÔNG BAO GIỜ tự chạy khi chưa được bấm (Do NOT add
 * Autonomous Agent). Agent vẫn CHỈ LÀ ORCHESTRATOR — không tự sinh nội
 * dung, mọi generation thật đi qua ĐÚNG Plugin/Queue/Draft đã có, không
 * viết lại/sửa bất kỳ Plugin nào (giữ nguyên toàn bộ nguyên tắc V1).
 *
 * KIẾN TRÚC: V2 THAY THẾ hoàn toàn luồng "1 công cụ" của V1 bằng 1 Plan có
 * thể chỉ có ĐÚNG 1 bước (trường hợp thoái hoá — vd "Viết mô tả RX3" vẫn
 * hoạt động y hệt V1, chỉ khác hiển thị trong khung Execution Plan 1 dòng
 * thay vì Timeline 4 bước cũ) — không giữ 2 đường code song song cho cùng
 * 1 file, tránh trùng lặp logic thực thi Plugin.
 *
 * Mỗi bước khi CHẠY vẫn đi ĐÚNG 5 bước cũ (Permission -> PluginManager ->
 * Queue -> Draft), giống hệt V1/AITaskRouter.dispatch() — không đổi.
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
    'faq-generator':              { label: 'FAQ AI',           icon: '❓' }
  };

  const STATUS_LABEL = { pending: 'Chờ chạy', running: 'Đang chạy', completed: 'Hoàn tất', failed: 'Thất bại', skipped: 'Đã bỏ qua' };

  const SUGGESTED = [
    { label: 'Tạo sản phẩm mới (full plan)', text: 'Tạo sản phẩm Pioneer RX3' },
    { label: 'Blog + Facebook cho RX3',      text: 'Viết Blog và Facebook cho Pioneer RX3' },
    { label: 'Banner + ảnh Facebook',        text: 'Tạo Banner và ảnh Facebook cho Pioneer RX3' },
    { label: 'Viết mô tả Pioneer RX3',       text: 'Viết mô tả sản phẩm Pioneer RX3' }
  ];

  let messages = []; // { id, role:'user'|'agent', text, steps:[...] }
  let user = null;
  let products = [];
  let blogPosts = [];
  let isBusy = false; // chặn gửi lệnh mới trong khi 1 Plan đang Run All (không chặn Run Step/Skip/Retry của Plan đang hiện — chỉ chặn gửi tin nhắn MỚI)

  // ── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    AdminAuth.init({ page: 'founder-agent', title: 'FOUNDER AGENT' }).then(u => {
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

QUY TẮC ĐẶC BIỆT — "$product": nếu Plan có bước create-product, MỌI bước sau đó nhắm vào ĐÚNG sản phẩm vừa tạo phải dùng productId:"$product" (không bịa id giả) — hệ thống sẽ tự thay bằng ID thật sau khi bước create-product chạy xong.

VÍ DỤ ĐÃ XÁC NHẬN ĐÚNG (few-shot, làm mẫu — không phải sản phẩm cố định):
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

  function stepLink(step) {
    if (step.status !== 'completed') return '';
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
