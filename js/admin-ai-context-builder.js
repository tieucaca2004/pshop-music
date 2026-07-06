/*
 * AI Context Builder — Preview (admin/ai/context-builder.html, Admin-only) —
 * Sprint 7 Requirement #3. Chỉ là Experience Layer: gọi ContextBuilder.build()
 * (js/ai/context-builder.js) và hiển thị Context Package + bản xem trước
 * đoạn Context ghép vào Prompt. CHỈ ĐỌC — không gọi PluginManager.execute(),
 * không gọi AIJobQueue/AIProviderRegistry, không tạo Job/Draft.
 *
 * Danh sách sản phẩm/bài viết cho dropdown lấy trực tiếp qua DB.getAll()/
 * BlogDB.getAll() — đúng khuôn mẫu js/admin-ai.js đã dùng cho
 * productSelect/blogSelect (AI_RULES.md mục 2b: quy tắc "chỉ qua
 * DataProvider" áp dụng cho loadContext() của Plugin, không áp dụng cho UI
 * tải danh sách để hiển thị dropdown).
 */
const AdminAIContextBuilder = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-context-builder', title: 'AI ASSISTANT — CONTEXT BUILDER', requiredRole: 'admin' }).then(() => {
      document.getElementById('cbPluginSelect').addEventListener('change', onPluginChange);
      document.getElementById('cbBuildBtn').addEventListener('click', onBuild);
      loadPlugins();
    });
  }

  // Danh sách Plugin qua PluginManager (AI_RULES.md mục 5b) — không đọc
  // thẳng PluginDB. Liệt kê cả Plugin đang Disable/Coming Soon vì đây là
  // công cụ xem trước kiến trúc Context, không phải nơi chạy Plugin thật.
  function loadPlugins() {
    return PluginManager.loadPlugins().then(plugins => {
      const select = document.getElementById('cbPluginSelect');
      select.innerHTML = plugins.map(p => `<option value="${escapeHtml(p.metadata.id)}">${escapeHtml(p.metadata.name)}</option>`).join('');
      onPluginChange();
    });
  }

  // inputFields không có trong PluginManager.metadata — đọc qua
  // AIModuleRegistry.get(), đúng cách js/admin-ai.js đã làm để dựng form
  // input động cho từng Plugin.
  function currentModule() {
    const id = document.getElementById('cbPluginSelect').value;
    return typeof AIModuleRegistry !== 'undefined' ? AIModuleRegistry.get(id) : null;
  }

  function onPluginChange() {
    const module = currentModule();
    const fields = (module && module.inputFields) || [];
    const hasProduct = fields.some(f => f.type === 'productSelect');
    const hasPost = fields.some(f => f.type === 'blogSelect');

    document.getElementById('cbProductGroup').style.display = hasProduct ? '' : 'none';
    document.getElementById('cbPostGroup').style.display = hasPost ? '' : 'none';
    if (hasProduct) loadProducts();
    if (hasPost) loadPosts();
  }

  function loadProducts() {
    const select = document.getElementById('cbProductSelect');
    if (select.dataset.loaded || typeof DB === 'undefined') return;
    select.dataset.loaded = '1';
    DB.getAll().then(list => {
      select.innerHTML = list.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    });
  }

  function loadPosts() {
    const select = document.getElementById('cbPostSelect');
    if (select.dataset.loaded || typeof BlogDB === 'undefined') return;
    select.dataset.loaded = '1';
    BlogDB.getAll().then(list => {
      select.innerHTML = list.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('');
    });
  }

  function currentInputParams() {
    const module = currentModule();
    const params = {};
    ((module && module.inputFields) || []).forEach(f => {
      if (f.type === 'productSelect') params.productId = document.getElementById('cbProductSelect').value || null;
      if (f.type === 'blogSelect') params.postId = document.getElementById('cbPostSelect').value || null;
    });
    return params;
  }

  function onBuild() {
    const module = currentModule();
    const resultEl = document.getElementById('cbResult');
    if (!module) {
      resultEl.innerHTML = '<p class="small-muted">Chưa có Plugin nào để xây dựng Context.</p>';
      return;
    }
    resultEl.innerHTML = '<p class="small-muted">Đang xây dựng Context...</p>';

    ContextBuilder.build(module.id, currentInputParams()).then(pkg => {
      const promptPreview = ContextBuilder.toPromptText(pkg);
      const statusLine = pkg.missing.length
        ? `Thiếu: ${pkg.missing.map(m => escapeHtml(m)).join(', ')} — vẫn hoạt động bình thường, không phải lỗi hệ thống.`
        : 'Đầy đủ dữ liệu.';
      resultEl.innerHTML = `
        <div class="panel">
          <p><strong>Context Package cho "${escapeHtml(module.label)}"</strong></p>
          <p class="small-muted">Đóng gói lúc ${escapeHtml(new Date(pkg.builtAt).toLocaleString('vi-VN'))} — ${statusLine}</p>
          <h4 style="margin:1rem 0 0.5rem">Dữ liệu đã thu thập (Context Package)</h4>
          <pre style="white-space:pre-wrap;background:var(--bg-alt);padding:1rem;font-size:0.82rem;max-height:320px;overflow:auto">${escapeHtml(JSON.stringify(pkg.data, null, 2))}</pre>
          <h4 style="margin:1rem 0 0.5rem">Xem trước đoạn Context ghép vào Prompt</h4>
          <pre style="white-space:pre-wrap;background:var(--bg-alt);padding:1rem;font-size:0.82rem">${escapeHtml(promptPreview || '(Không có Context bổ sung — Plugin vẫn chạy bình thường chỉ với dữ liệu người dùng nhập.)')}</pre>
          <p class="small-muted" style="margin-top:1rem">Chỉ là bản xem trước cấu trúc Context — trang này KHÔNG tạo Job, KHÔNG gọi AI Provider, KHÔNG tạo Draft. Muốn chạy Plugin thật, dùng <a href="index.html" style="color:var(--gold-ink)">AI Assistant Dashboard</a>.</p>
        </div>`;
    }).catch(err => {
      resultEl.innerHTML = '<p style="color:#c0392b">Không xây dựng được Context: ' + escapeHtml(err.message) + '</p>';
    });
  }

  return { init };
})();
