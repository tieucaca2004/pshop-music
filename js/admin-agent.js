/*
 * admin-agent.js — Founder Agent V1 (Sprint 13)
 * Entry Point AI DUY NHẤT cho toàn bộ PSH Platform: Founder gõ tự do bằng
 * tiếng Việt → Agent hiểu ý định → chọn đúng công cụ → thực thi → hiển thị
 * tiến trình → mở Nháp. Agent CHỈ LÀ ORCHESTRATOR — không tự sinh nội dung
 * (mọi generation thật do đúng Plugin đã có thực hiện qua Queue như bình
 * thường), không thay thế/sửa bất kỳ Plugin nào.
 *
 * Khác với "Trợ lý AI" (admin/ai/assistant.html, js/admin-ai-assistant.js) —
 * dùng AITaskRouter (Sprint 4, rule-based khớp từ khóa cố định, cố tình
 * KHÔNG gọi AI thật để phân loại ý định, đúng ràng buộc Sprint 4 lúc đó) —
 * Founder Agent dùng GPT-4o-mini QUA ĐÚNG Cloud Function openaiProxy đã có
 * (action="generate", không thêm Provider/API Key mới) làm Tool Router, để
 * hiểu được câu tự do linh hoạt hơn (vd "Tạo sản phẩm Pioneer RX3" — ý định
 * KHÁC hẳn "Viết mô tả Pioneer RX3", AITaskRouter không phân biệt được vì
 * route cố định theo từ khóa). Đây là năng lực MỚI có chủ đích của
 * Requirement này — phần THỰC THI phía sau (PermissionService ->
 * PluginManager -> AIJobQueue -> Draft) tái sử dụng NGUYÊN VẸN, giống hệt
 * AITaskRouter.dispatch() đã làm, không viết lại logic Queue/Publish Pipeline
 * ở bất kỳ đâu trong file này.
 *
 * "Tạo sản phẩm X" — KHÔNG có Plugin nào "tạo sản phẩm mới" (product-
 * description-writer chỉ viết mô tả cho sản phẩm ĐÃ CÓ). Đây không phải sinh
 * NỘI DUNG bằng AI (không vi phạm "Never generate content directly") — chỉ
 * tạo 1 dòng dữ liệu Sản phẩm trống (chỉ có Tên) ở trạng thái Nháp, tái sử
 * dụng ĐÚNG DB.add() js/admin-products.js đã dùng cho sản phẩm mới, rồi
 * hướng Founder qua Product Editor thật để tự điền tiếp — không qua Queue/
 * Plugin vì không có bước generate AI nào ở hành động này.
 */
const AdminAgent = (function () {
  const PROXY_URL = 'https://us-central1-pshop-music.cloudfunctions.net/openaiProxy';

  // 4 bước cố định của Execution Timeline — hiển thị tiến trình rõ ràng cho
  // MỌI yêu cầu, không phụ thuộc công cụ nào được chọn.
  const STEPS = ['Hiểu ý định', 'Chọn công cụ AI', 'Đang thực thi', 'Hoàn tất'];

  // Map moduleId (kể cả "create-product", KHÔNG phải Plugin thật) → tên
  // thân thiện + icon hiển thị trên timeline/chip.
  const TOOL_MAP = {
    'create-product':             { label: 'Tạo Sản phẩm mới', icon: '🆕' },
    'product-description-writer': { label: 'Product AI',       icon: '🎸' },
    'blog-writer':                { label: 'Blog AI',          icon: '📝' },
    'facebook-post-generator':    { label: 'Facebook AI',      icon: '📱' },
    'banner-generator':           { label: 'Banner AI',        icon: '🖼' },
    'image-generator':            { label: 'Image AI',         icon: '✨' },
    'slider-generator':           { label: 'Slider AI',        icon: '🎞' },
    'seo-generator':              { label: 'SEO AI',           icon: '🔍' },
    'faq-generator':              { label: 'FAQ AI',           icon: '❓' }
  };

  const SUGGESTED = [
    { label: 'Tạo sản phẩm mới',           text: 'Tạo sản phẩm Pioneer RX3' },
    { label: 'Viết mô tả Pioneer RX3',     text: 'Viết mô tả sản phẩm Pioneer RX3' },
    { label: 'Viết bài Facebook cho RX3',  text: 'Viết bài Facebook cho Pioneer RX3' },
    { label: 'Viết blog Pioneer RX3',      text: 'Viết bài blog về Pioneer RX3' },
    { label: 'Tạo banner giảm giá 20%',    text: 'Tạo banner giảm giá 20%' },
    { label: 'Tạo ảnh marketing RX3',      text: 'Tạo ảnh marketing cho Pioneer RX3' }
  ];

  let messages = []; // { id, role:'user'|'agent', text, toolName, toolIcon, stepIndex, stepState:'active'|'done'|'error', draftId, productId }
  let user = null;
  let products = [];
  let blogPosts = [];
  let isRunning = false;

  // ── INIT ────────────────────────────────────────────────────────────────────

  function init() {
    AdminAuth.init({ page: 'founder-agent', title: 'FOUNDER AGENT' }).then(u => {
      user = u;
      // Load products + blog posts để router dùng khi resolve tên
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
    if (isRunning) return;
    const input = document.getElementById('agentInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    messages.push({ role: 'user', text });
    renderMessages();
    hideSuggested();
    run(text);
  }

  function hideSuggested() {
    const el = document.getElementById('agentSuggestions');
    if (el) el.style.display = 'none';
  }

  // ── AGENT LOOP ───────────────────────────────────────────────────────────────

  async function run(userText) {
    isRunning = true;
    setInputEnabled(false);

    // Bước 1: Hiểu ý định
    const msgId = pushAgentMsg({ text: 'Đang phân tích yêu cầu...' });
    renderMessages();

    try {
      // Bước 2: Tool Router — gọi GPT-4o-mini để chọn công cụ
      const routeResult = await route(userText);

      if (!routeResult.moduleId) {
        setStep(msgId, 0, 'error', { text: routeResult.reason || 'Không tìm được công cụ phù hợp cho yêu cầu này.' });
        renderMessages();
        return;
      }

      const tool = TOOL_MAP[routeResult.moduleId];
      setStep(msgId, 1, 'done', {
        text: `Đã chọn: ${tool ? tool.label : routeResult.moduleId}`,
        toolName: tool ? tool.label : routeResult.moduleId,
        toolIcon: tool ? tool.icon : '🔧'
      });
      renderMessages();

      // Bước 3: Thực thi — "create-product" không qua Plugin (không có bước
      // generate AI nào), mọi công cụ khác qua Plugin Framework/Queue như cũ.
      if (routeResult.moduleId === 'create-product') {
        await executeCreateProduct(msgId, routeResult.inputParams);
      } else {
        await executePlugin(msgId, routeResult.moduleId, routeResult.inputParams);
      }

    } catch (err) {
      setStep(msgId, 2, 'error', { text: 'Lỗi: ' + err.message });
      renderMessages();
    } finally {
      isRunning = false;
      setInputEnabled(true);
    }
  }

  // ── TOOL ROUTER ──────────────────────────────────────────────────────────────

  async function route(userText) {
    const idToken = await user.getIdToken();
    const productList = products.slice(0, 30).map(p => `- ${p.name} (id:${p.id})`).join('\n');
    const blogList = blogPosts.slice(0, 10).map(b => `- ${b.title} (id:${b.id})`).join('\n');

    const systemPrompt = `Bạn là Tool Router của PSH Platform (cửa hàng âm thanh DJ). Phân tích yêu cầu của Founder và trả về JSON chọn đúng tool.

Available tools:
- create-product: TẠO MỚI 1 sản phẩm trống (chỉ có Tên) để Founder tự vào Sửa tiếp — dùng khi Founder nói "tạo sản phẩm X"/"thêm sản phẩm X" (KHÁC HẲN product-description-writer — tool đó CHỈ viết mô tả cho sản phẩm ĐÃ CÓ SẴN trong danh sách dưới, không tạo sản phẩm mới). inputParams: {name}
- product-description-writer: viết/cập nhật mô tả cho 1 sản phẩm ĐÃ CÓ SẴN trong danh sách dưới. inputParams: {productId, tone}
- blog-writer: viết bài blog. inputParams: {topic, tone, keywords, productId}
- facebook-post-generator: viết bài đăng Facebook. inputParams: {productId?, topic?, promotion?}
- banner-generator: tạo banner quảng cáo. inputParams: {productId?, promotion?, event?, link?}
- image-generator: tạo ảnh marketing AI. inputParams: {productId?, promotion?, blogPostId?, customPrompt?}
- slider-generator: tạo slide hero. inputParams: {productId, ctaStyle}
- seo-generator: tối ưu SEO bài blog. inputParams: {postId}
- faq-generator: tạo FAQ. inputParams: {topic, questionCount}

Danh sách sản phẩm hiện có:
${productList || '(chưa có)'}

Danh sách bài blog hiện có:
${blogList || '(chưa có)'}

Quy tắc:
1. Nếu tìm được tool phù hợp, trả về: {"moduleId":"<id>","inputParams":{...},"confidence":"high"|"medium"}
2. Nếu Founder đề cập tên sản phẩm ĐÃ CÓ trong danh sách trên, tìm đúng productId (khớp một phần tên là được). Nếu Founder muốn TẠO MỚI 1 sản phẩm chưa có trong danh sách, dùng create-product với tên đó.
3. Nếu không tìm được tool phù hợp, trả về: {"moduleId":null,"reason":"<giải thích ngắn tiếng Việt>"}
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
    if (!r.ok) throw new Error(data.error || 'Router lỗi.');

    const raw = (data.text || '').trim();
    try {
      // Strip markdown fence nếu có
      const json = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      return JSON.parse(json);
    } catch (e) {
      return { moduleId: null, reason: 'Không phân tích được yêu cầu. Hãy thử diễn đạt cụ thể hơn.' };
    }
  }

  // ── EXECUTE: TẠO SẢN PHẨM MỚI (không qua Plugin/Queue) ──────────────────────

  async function executeCreateProduct(msgId, inputParams) {
    setStep(msgId, 2, 'active', { text: 'Đang tạo sản phẩm mới...' });
    renderMessages();

    const name = (inputParams && String(inputParams.name || '').trim()) || 'Sản phẩm mới';
    // Tái sử dụng ĐÚNG DB.add() (js/db.js) — CHÍNH CƠ CHẾ js/admin-products.js
    // saveProduct() dùng khi tạo sản phẩm mới, không viết lại logic ghi dữ
    // liệu. pubStatus:'draft' khớp ĐÚNG quy ước "sản phẩm mới mặc định Nháp"
    // đã có từ Sprint 12 Requirement #10 (Product Management).
    const newProduct = await DB.add({ name, pubStatus: 'draft' });

    setStep(msgId, 3, 'done', {
      text: `Đã tạo sản phẩm "${name}" (Nháp) — mở Quản lý Sản phẩm để điền đầy đủ thông tin (Danh mục, Giá, Ảnh...).`,
      productId: newProduct.id
    });
    renderMessages();
  }

  // ── EXECUTE: CHẠY PLUGIN QUA PLUGIN FRAMEWORK (nguyên vẹn, không đổi) ───────

  async function executePlugin(msgId, moduleId, inputParams) {
    setStep(msgId, 2, 'active', { text: 'Đang chạy...' });
    renderMessages();

    // 1. Permission check
    const perm = await PermissionService.checkPluginExecution(user.uid, user.email, moduleId);
    if (!perm.granted) {
      setStep(msgId, 2, 'error', { text: 'Không có quyền chạy ' + moduleId + ': ' + perm.reason });
      renderMessages();
      return;
    }

    // 2. Load plugin
    const plugin = await PluginManager.loadPlugin(moduleId);
    if (!plugin) {
      setStep(msgId, 2, 'error', { text: 'Không tìm thấy plugin: ' + moduleId });
      renderMessages();
      return;
    }

    // 3. Execute (enqueues job) — ĐÚNG API công khai Plugin Framework đã có.
    await plugin.execute([inputParams], user.uid, user.email);

    // 4. Resume queue (chạy generation thật) — ĐÚNG API công khai Queue đã có.
    setStep(msgId, 2, 'active', { text: 'AI đang tạo nội dung...' });
    renderMessages();
    await AIJobQueue.resume(user.uid, user.email);

    // 5. Tìm draft mới nhất vừa tạo
    const drafts = await DraftDB.getAll();
    const sorted = drafts.filter(d => d.status === 'draft')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const newDraft = sorted[0];

    setStep(msgId, 3, 'done', {
      text: 'Hoàn tất! Nháp đã được tạo.',
      draftId: newDraft ? newDraft.id : null
    });
    renderMessages();
  }

  // ── MESSAGE HELPERS ──────────────────────────────────────────────────────────

  let msgCounter = 0;
  function pushAgentMsg(data) {
    const id = 'msg_' + (++msgCounter);
    messages.push(Object.assign({ id, role: 'agent', stepIndex: 0, stepState: 'active' }, data));
    return id;
  }
  // setStep — cập nhật đúng 1 nấc của Execution Timeline (0-3, xem STEPS) +
  // trạng thái ('active'|'done'|'error') + dữ liệu hiển thị kèm theo. Timeline
  // luôn hiển thị ĐỦ 4 bước, tô đậm/đánh dấu theo stepIndex/stepState hiện tại
  // — khác hẳn cách cũ (chỉ 1 chip trạng thái bị GHI ĐÈ mỗi bước, mất dấu vết
  // các bước trước).
  function setStep(id, stepIndex, stepState, extra) {
    const m = messages.find(x => x.id === id);
    if (m) Object.assign(m, { stepIndex, stepState }, extra || {});
  }

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

  // renderTimeline — 4 bước cố định (STEPS), đánh dấu ✓ (đã xong)/●(đang
  // chạy)/✕(lỗi tại bước này)/○ (chưa tới) — "Execution Timeline" độc lập với
  // dòng "Running Status" (agent-msg-text) bên dưới, đúng yêu cầu UI có cả 2.
  function renderTimeline(m) {
    return `<div class="agent-timeline">${STEPS.map((label, i) => {
      let cls = 'agent-step-pending', icon = '○';
      if (m.stepState === 'error' && i === m.stepIndex) { cls = 'agent-step-error'; icon = '✕'; }
      else if (i < m.stepIndex || (i === m.stepIndex && m.stepState === 'done')) { cls = 'agent-step-done'; icon = '✓'; }
      else if (i === m.stepIndex && m.stepState === 'active') { cls = 'agent-step-active'; icon = '●'; }
      return `<span class="agent-step ${cls}">${icon} ${escHtml(label)}</span>`;
    }).join('<span class="agent-step-sep">›</span>')}</div>`;
  }

  function renderAgentMsg(m) {
    let statusChip = '';
    if (m.stepState === 'active') statusChip = `<span class="agent-status agent-status-running">⚙ Đang xử lý</span>`;
    else if (m.stepState === 'done') statusChip = `<span class="agent-status agent-status-done">✓ Hoàn tất</span>`;
    else if (m.stepState === 'error') statusChip = `<span class="agent-status agent-status-error">✕ Lỗi</span>`;
    else if (m.toolName) statusChip = `<span class="agent-status agent-status-selected">${escHtml(m.toolIcon || '🔧')} ${escHtml(m.toolName)}</span>`;

    let body = `<span class="agent-msg-text">${escHtml(m.text)}</span>`;
    if (m.stepState === 'done' && m.draftId) {
      body += ` <a href="/admin/ai/drafts.html" class="agent-open-draft-btn">Mở Nháp →</a>`;
    }
    if (m.stepState === 'done' && m.productId) {
      body += ` <a href="/admin/products.html" class="agent-open-draft-btn">Mở Sản phẩm →</a>`;
    }

    return `<div class="agent-msg agent-msg-agent">
      <div class="agent-msg-bubble">
        ${renderTimeline(m)}
        ${statusChip}
        <div class="agent-msg-body">${body}</div>
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

  return { init, useSuggestion, send };
})();
