/*
 * AI Assistant (admin/ai/assistant.html) — Entry Point DUY NHẤT của AI theo
 * Sprint 4 Requirement #1. Người dùng gõ yêu cầu tự do, không chọn Plugin,
 * không biết Plugin nào chạy. Lớp này CHỈ làm 2 việc AITaskRouter không được
 * làm: (1) tải danh sách ứng viên (sản phẩm/bài viết) qua đúng DB.getAll()/
 * BlogDB.getAll() có sẵn — giống hệt js/admin-ai.js đã làm cho các ô chọn
 * sản phẩm/bài viết trên Dashboard cũ, không phải cách đọc dữ liệu mới; (2)
 * hiển thị UI/xử lý Safety Checkpoint theo Confidence Score. Mọi quyết định
 * "hiểu yêu cầu" + mọi lời gọi PermissionService/PluginManager đều nằm trong
 * AITaskRouter (js/ai/task-router.js) — file này không tự gọi Permission/
 * PluginManager/Queue/Provider.
 */
const AdminAIAssistant = (function () {
  const CONFIDENCE_AUTO_THRESHOLD = 95;
  let user = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'ai-assistant', title: 'AI ASSISTANT' }).then(({ user: u }) => {
      user = u;
      document.getElementById('assistantSendBtn').addEventListener('click', handleSend);
    });
  }

  function loadCandidates() {
    return Promise.all([
      typeof DB !== 'undefined' ? DB.getAll() : Promise.resolve([]),
      typeof BlogDB !== 'undefined' ? BlogDB.getAll() : Promise.resolve([])
    ]).then(([products, posts]) => ({ products, posts }));
  }

  function setResult(html) {
    document.getElementById('assistantResult').innerHTML = html;
  }

  function reasonMessage(result) {
    // Không lộ tên/id Plugin kỹ thuật ra người dùng (Requirement #4) — chỉ
    // mô tả bằng ngôn ngữ theo Kết quả.
    switch (result.reason) {
      case 'plugin_not_found':
        return 'AI chưa hiểu rõ yêu cầu này. Hãy mô tả cụ thể hơn — ví dụ: "viết mô tả cho sản phẩm ...", "làm SEO cho bài viết ...", "gợi ý nội dung slide quảng cáo cho sản phẩm ...". Bạn cũng có thể vào <a href="index.html" style="color:var(--gold-ink)">Plugin Manager</a> để chọn thủ công.';
      case 'target_not_found':
        return 'AI đã hiểu loại yêu cầu nhưng không xác định được đúng sản phẩm/bài viết — hãy nhắc rõ tên sản phẩm hoặc tiêu đề bài viết trong câu yêu cầu.';
      case 'target_ambiguous':
        return 'AI tìm thấy nhiều mục khớp với yêu cầu, chưa chắc chắn bạn muốn mục nào: ' +
          result.ambiguous.map(a => escapeHtml(a.label)).join(', ') + '. Hãy nói rõ tên đầy đủ hơn.';
      case 'permission_denied':
        return 'Bạn không có quyền thực hiện yêu cầu này.';
      default:
        return 'Không thực hiện được yêu cầu.';
    }
  }

  function dispatchAndShow(routeResult) {
    setResult('<p class="small-muted">Đang xử lý yêu cầu: ' + escapeHtml(routeResult.outcomeLabel) + (routeResult.targetLabel ? ' — "' + escapeHtml(routeResult.targetLabel) + '"' : '') + '...</p>');
    return AITaskRouter.dispatch(routeResult, user.uid, user.email).then(outcome => {
      if (!outcome.dispatched) {
        setResult('<p style="color:#c0392b">' + reasonMessage(Object.assign({}, routeResult, outcome)) + '</p>');
        return;
      }
      setResult('<p>Đã tạo yêu cầu: <strong>' + escapeHtml(routeResult.outcomeLabel) + '</strong>' +
        (routeResult.targetLabel ? ' cho "' + escapeHtml(routeResult.targetLabel) + '"' : '') +
        '. Xem tiến trình ở <a href="jobs.html" style="color:var(--gold-ink)">Job Queue</a>, ' +
        'kết quả chờ duyệt ở <a href="drafts.html" style="color:var(--gold-ink)">Duyệt nội dung</a> — ' +
        'nội dung AI tạo ra không tự động publish, cần bạn duyệt trước.</p>');
    });
  }

  function showConfirmation(routeResult) {
    setResult(`
      <div class="panel">
        <p>Tôi hiểu yêu cầu như sau: <strong>${escapeHtml(routeResult.outcomeLabel)}</strong>${routeResult.targetLabel ? ' cho "' + escapeHtml(routeResult.targetLabel) + '"' : ''}.</p>
        <p class="small-muted">Độ tin cậy: ${routeResult.confidence}%</p>
        <div class="admin-actions">
          <button class="submit-btn" id="assistantConfirmBtn">ĐÚNG, THỰC HIỆN</button>
          <button class="btn-secondary" id="assistantCancelBtn">HỦY</button>
        </div>
      </div>`);
    document.getElementById('assistantConfirmBtn').addEventListener('click', () => dispatchAndShow(routeResult));
    document.getElementById('assistantCancelBtn').addEventListener('click', () => setResult('<p class="small-muted">Đã hủy yêu cầu.</p>'));
  }

  function handleSend() {
    const text = document.getElementById('assistantInput').value.trim();
    if (!text) return;
    setResult('<p class="small-muted">Đang phân tích yêu cầu...</p>');
    loadCandidates().then(candidates => {
      const routeResult = AITaskRouter.route(text, candidates);
      if (!routeResult.pluginId || !routeResult.targetId) {
        setResult('<p style="color:#c0392b">' + reasonMessage(routeResult) + '</p>');
        return;
      }
      if (routeResult.confidence >= CONFIDENCE_AUTO_THRESHOLD) {
        dispatchAndShow(routeResult);
      } else {
        showConfirmation(routeResult);
      }
    });
  }

  return { init };
})();
