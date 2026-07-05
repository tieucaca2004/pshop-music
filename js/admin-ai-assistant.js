/*
 * AI Assistant (admin/ai/assistant.html) — Entry Point DUY NHẤT của AI
 * (Sprint 4, Requirement #1) + theo dõi tiến trình/Draft ngay tại chỗ
 * (Sprint 4, Requirement #2 — Experience Layer hoàn chỉnh). Người dùng gõ
 * yêu cầu tự do, không chọn Plugin, không biết Plugin nào chạy, và không
 * cần rời trang để biết kết quả.
 *
 * File này CHỈ là Experience Layer — không chứa Business Logic:
 * - "Hiểu yêu cầu + chọn Plugin" nằm trong AITaskRouter (js/ai/task-router.js).
 * - "Publish/Reject Draft" tái sử dụng ĐÚNG cơ chế có sẵn trong js/admin-ai.js
 *   (AdminAI.publishDraftById/rejectDraftById — thêm ở Requirement #2, dùng
 *   lại nguyên hàm publishToTarget() private đã có, không viết lại).
 * - Danh sách ứng viên (sản phẩm/bài viết) tải qua đúng DB.getAll()/
 *   BlogDB.getAll() có sẵn — giống hệt js/admin-ai.js đã làm cho
 *   productSelect/blogSelect trên Dashboard cũ.
 * - Theo dõi tiến trình chỉ đọc đúng 1 Job vừa tạo (JobDB.get(jobId)) —
 *   không polling toàn bộ JobDB như admin/ai/jobs.html.
 */
const AdminAIAssistant = (function () {
  const CONFIDENCE_AUTO_THRESHOLD = 95;
  const POLL_INTERVAL_MS = 1200;
  const POLL_MAX_ATTEMPTS = 50; // ~60s — tránh polling vô hạn nếu Job kẹt
  let user = null;
  let pollTimer = null;

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
    stopPolling();
    document.getElementById('assistantResult').innerHTML = html;
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function reasonMessage(result) {
    // Không lộ tên/id Plugin kỹ thuật ra người dùng (Requirement #4, Sprint 4
    // Requirement #1) — chỉ mô tả bằng ngôn ngữ theo Kết quả.
    switch (result.reason) {
      case 'plugin_not_found':
        return 'AI chưa hiểu rõ yêu cầu này. Hãy mô tả cụ thể hơn — ví dụ: "viết mô tả cho sản phẩm ...", "làm SEO cho bài viết ...", "gợi ý nội dung slide quảng cáo cho sản phẩm ...". Bạn cũng có thể vào <a href="index.html" style="color:var(--gold-ink)">Plugin Manager</a> để chọn thủ công.';
      case 'target_not_found':
        return 'AI đã hiểu loại yêu cầu nhưng không xác định được đúng sản phẩm/bài viết — hãy nhắc rõ tên sản phẩm hoặc tiêu đề bài viết trong câu yêu cầu.';
      case 'permission_denied':
        return 'Bạn không có quyền thực hiện yêu cầu này.';
      default:
        return 'Không thực hiện được yêu cầu.';
    }
  }

  // ============== Đối tượng mơ hồ — Ambiguous Target Resolution (Sprint 4,
  // Requirement #3) ==============
  //
  // Không sửa js/ai/task-router.js — chỉ ĐỌC THÊM dữ liệu Router đã công
  // khai sẵn (AITaskRouter.ROUTES, routeResult.ambiguous) để mở rộng cách xử
  // lý kết quả, đúng yêu cầu "chỉ mở rộng khả năng xử lý kết quả do AI Task
  // Router trả về, không tạo đường xử lý mới ngoài Workflow hiện tại".

  function findRouteConfig(pluginId) {
    return AITaskRouter.ROUTES.find(r => r.pluginId === pluginId);
  }

  // Router chỉ trả {id,label} trong routeResult.ambiguous — Assistant tự làm
  // giàu thông tin hiển thị (danh mục/ngày tạo) bằng cách đối chiếu lại với
  // `candidates` ĐÃ tải sẵn ở handleSend() (không gọi thêm Firebase nào, giữ
  // đúng NFR Performance/Coupling).
  function enrichAmbiguous(routeResult, candidates, routeConfig) {
    const list = (routeConfig.targetType === 'product' ? candidates.products : candidates.posts) || [];
    const nameKey = routeConfig.targetType === 'product' ? 'name' : 'title';
    const ids = (routeResult.ambiguous || []).map(a => a.id);
    return list.filter(item => ids.includes(item.id)).map(item => ({
      id: item.id,
      label: item[nameKey],
      categoryLabel: routeConfig.targetType === 'product' ? (item.categoryLabel || item.category || '') : '',
      createdAt: item.createdAt || null
    }));
  }

  function showAmbiguousPicker(routeResult, candidates) {
    const routeConfig = findRouteConfig(routeResult.pluginId);
    const details = enrichAmbiguous(routeResult, candidates, routeConfig);

    if (!details.length) {
      // An toàn: nếu vì lý do gì không đối chiếu được chi tiết, vẫn không
      // được tự đoán — báo rõ, không tạo Job (giữ đúng Functional Req #4).
      setResult('<p style="color:#c0392b">AI tìm thấy nhiều mục khớp nhưng không tải được chi tiết để bạn chọn — hãy nói rõ tên đầy đủ hơn trong yêu cầu.</p>');
      return;
    }

    const rows = details.map(d => `
      <tr>
        <td>${escapeHtml(d.label)}</td>
        <td>${escapeHtml(d.categoryLabel || '—')}</td>
        <td>${escapeHtml(d.id)}</td>
        <td>${d.createdAt ? escapeHtml(new Date(d.createdAt).toLocaleDateString('vi-VN')) : '—'}</td>
        <td><button class="btn-secondary assistant-pick-btn" data-id="${escapeHtml(d.id)}">Chọn</button></td>
      </tr>`).join('');

    setResult(`
      <div class="panel">
        <p>Yêu cầu của bạn khớp với nhiều mục cho: <strong>${escapeHtml(routeResult.outcomeLabel)}</strong>. Vui lòng chọn đúng đối tượng — không cần gõ lại yêu cầu.</p>
        <table class="admin-table">
          <thead><tr><th>Tên</th><th>Danh mục</th><th>ID</th><th>Ngày tạo</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="admin-actions">
          <button class="btn-secondary" id="assistantPickCancelBtn">HỦY</button>
        </div>
      </div>`);

    document.querySelectorAll('.assistant-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = details.find(d => d.id === btn.getAttribute('data-id'));
        if (!chosen) return;
        // Tiếp tục ĐÚNG Workflow hiện tại (Permission -> Plugin Manager ->
        // Queue -> AI Provider -> Draft -> Human Review) qua dispatchAndShow()
        // đã có — không tạo đường xử lý mới, không cần người dùng nhập lại
        // Prompt (Functional Req #3).
        dispatchAndShow({
          pluginId: routeResult.pluginId,
          outcomeLabel: routeResult.outcomeLabel,
          targetId: chosen.id,
          targetLabel: chosen.label,
          confidence: 100,
          ambiguous: [],
          inputParams: routeConfig.buildInputParams(chosen.id),
          reason: 'ok'
        });
      });
    });
    // Hủy: Workflow dừng hẳn — không tạo Job, không ghi Draft (Functional Req #5).
    document.getElementById('assistantPickCancelBtn').addEventListener('click', () => setResult('<p class="small-muted">Đã hủy yêu cầu.</p>'));
  }

  // ============== Theo dõi tiến trình (Sprint 4, Requirement #2) ==============

  function progressPanel(stageLabel, routeResult, extraHtml) {
    return `
      <div class="panel">
        <p><strong>${escapeHtml(routeResult.outcomeLabel)}</strong>${routeResult.targetLabel ? ' — "' + escapeHtml(routeResult.targetLabel) + '"' : ''}</p>
        <p class="small-muted">Trạng thái: ${escapeHtml(stageLabel)}</p>
        ${extraHtml || ''}
      </div>`;
  }

  function renderDraftPreview(draft, routeResult) {
    setResult(`
      <div class="panel">
        <p><strong>${escapeHtml(routeResult.outcomeLabel)}</strong>${routeResult.targetLabel ? ' — "' + escapeHtml(routeResult.targetLabel) + '"' : ''}</p>
        <p class="small-muted">Trạng thái: Draft Ready — xem trước bên dưới, chưa áp dụng vào dữ liệu thật.</p>
        <pre style="white-space:pre-wrap;background:var(--bg-alt);padding:1rem;font-size:0.82rem;max-height:260px;overflow:auto">${escapeHtml(JSON.stringify(draft.content, null, 2))}</pre>
        <div class="admin-actions">
          <button class="submit-btn" id="assistantPublishBtn">DUYỆT &amp; PUBLISH</button>
          <button class="btn-danger" id="assistantRejectBtn">TỪ CHỐI</button>
        </div>
      </div>`);
    document.getElementById('assistantPublishBtn').addEventListener('click', () => {
      setResult(progressPanel('Đang publish...', routeResult));
      AdminAI.publishDraftById(draft.id).then(() => {
        setResult(progressPanel('Hoàn tất — đã publish vào dữ liệu thật.', routeResult));
      }).catch(err => {
        setResult(progressPanel('Publish thất bại: ' + escapeHtml(err.message), routeResult));
      });
    });
    document.getElementById('assistantRejectBtn').addEventListener('click', () => {
      if (!confirm('Từ chối nội dung này? Vẫn giữ lại để tra cứu, không xóa.')) return;
      AdminAI.rejectDraftById(draft.id).then(() => {
        setResult(progressPanel('Đã từ chối nội dung này.', routeResult));
      });
    });
  }

  function handleJobFinished(job, routeResult) {
    const item = job.items && job.items[0];
    if (job.status === 'completed' && item && item.status === 'completed' && item.resultDraftId) {
      DraftDB.get(item.resultDraftId).then(draft => {
        if (!draft) {
          setResult(progressPanel('Hoàn tất nhưng không tìm thấy Draft — kiểm tra ở <a href="drafts.html" style="color:var(--gold-ink)">Duyệt nội dung</a>.', routeResult));
          return;
        }
        renderDraftPreview(draft, routeResult);
      });
      return;
    }
    // Failed — hiển thị đúng nguyên nhân từ item.error (Requirement #5, Sprint
    // 4 Req #2: không hiển thị "Unknown Error" chung chung).
    const reason = (item && item.error) || 'Không rõ nguyên nhân — kiểm tra ở Nhật ký.';
    setResult(progressPanel('Failed', routeResult, `<p style="color:#c0392b">${escapeHtml(reason)}</p>`));
  }

  // Chỉ theo dõi đúng 1 Job vừa tạo (JobDB.get(jobId)) — không polling toàn
  // bộ JobDB như admin/ai/jobs.html, giảm tải Firebase (NFR Performance).
  function trackJob(jobId, routeResult) {
    let attempts = 0;
    setResult(progressPanel('Processing...', routeResult));
    pollTimer = setInterval(() => {
      attempts++;
      JobDB.get(jobId).then(job => {
        if (!job) { stopPolling(); return; }
        if (job.status === 'completed' || job.status === 'failed') {
          stopPolling();
          handleJobFinished(job, routeResult);
          return;
        }
        if (job.status === 'cancelled') {
          stopPolling();
          setResult(progressPanel('Đã hủy — job này đã bị hủy (có thể từ Job Queue).', routeResult));
          return;
        }
        if (attempts >= POLL_MAX_ATTEMPTS) {
          stopPolling();
          setResult(progressPanel('Đang xử lý lâu hơn dự kiến — kiểm tra ở <a href="jobs.html" style="color:var(--gold-ink)">Job Queue</a>.', routeResult));
        }
        // vẫn 'queued'/'running' — giữ nguyên panel "Processing...", chờ lượt poll kế tiếp.
      });
    }, POLL_INTERVAL_MS);
  }

  // ============== Gửi yêu cầu / Safety Checkpoint ==============

  function dispatchAndShow(routeResult) {
    setResult(progressPanel('Request Received', routeResult));
    return AITaskRouter.dispatch(routeResult, user.uid, user.email).then(outcome => {
      if (!outcome.dispatched) {
        setResult('<p style="color:#c0392b">' + reasonMessage(Object.assign({}, routeResult, outcome)) + '</p>');
        return;
      }
      // Job chỉ được TẠO (enqueue) bởi PluginManager.execute() bên trong
      // AITaskRouter.dispatch() — Queue tự xử lý tuần tự khi resume() được
      // gọi, đúng cơ chế công khai đã có (giống hệt js/admin-ai.js.runModule()
      // đang làm cho Dashboard cũ). Không bypass Queue — chỉ gọi API công khai.
      AIJobQueue.resume(user.uid, user.email);
      trackJob(outcome.job.id, routeResult);
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
      if (routeResult.reason === 'target_ambiguous') {
        showAmbiguousPicker(routeResult, candidates);
        return;
      }
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
