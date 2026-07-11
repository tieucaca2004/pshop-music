/*
 * Facebook Page Integration — Sprint 12 Requirement #9 (Facebook AI V4).
 *
 * PHẠM VI ĐÃ TRIỂN KHAI: CHỈ phần UI/khung an toàn (card kết nối, dialog
 * xin phép đúng nội dung đã yêu cầu, luồng Ngắt kết nối ghi Firebase thật).
 * KHÔNG có OAuth thật, KHÔNG gọi Facebook Graph API thật.
 *
 * Lý do: OAuth đăng nhập Facebook + đăng bài thật đòi hỏi Chief Architect tự
 * tạo 1 Facebook App thật trên Meta for Developers + hoàn tất App Review
 * cho quyền "pages_manage_posts" (Meta bắt buộc review thủ công bởi chính
 * chủ tài khoản, không ai làm thay được) + deploy 1 Cloud Function mới giữ
 * App Secret an toàn phía server (không bao giờ để lộ ra client — cùng bài
 * học đã áp dụng cho OPENAI_API_KEY ở Sprint 3, xem
 * docs/CLOUD_FUNCTIONS_DEPLOYMENT.md). Toàn bộ các bước cần làm được liệt
 * kê đầy đủ trong docs/FACEBOOK_INTEGRATION_SETUP.md.
 *
 * Node Firebase `facebookConnection` (rule đã thêm vào database.rules.json,
 * CHƯA deploy — cần Chief Architect tự `firebase deploy --only database`
 * khi sẵn sàng) CHỈ lưu metadata trạng thái kết nối (status/pageId/
 * pageName/connectedAt/tokenExpiresAt/connectedBy) — KHÔNG BAO GIỜ lưu
 * Access Token thật ở đây (đúng "Never expose tokens in the UI" — token
 * thật sẽ sống ở Secret Manager/server-side qua Cloud Function tương lai).
 */
const AdminFacebookConnect = (function () {
  function ref() {
    return firebase.database().ref('facebookConnection');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // getStatus() — mặc định an toàn 'not_connected' nếu chưa có dữ liệu HOẶC
  // nếu đọc lỗi (vd Database Rules cho node này chưa được deploy) — không
  // bao giờ để card hiển thị sai trạng thái/vỡ giao diện.
  function getStatus() {
    return ref().once('value')
      .then(snap => snap.val() || { status: 'not_connected' })
      .catch(() => ({ status: 'not_connected' }));
  }

  const STATUS_LABELS = {
    not_connected: { icon: '⚪', label: 'Chưa kết nối' },
    connected: { icon: '🟢', label: 'Đã kết nối' },
    token_expiring: { icon: '🟠', label: 'Token sắp hết hạn' },
    token_expired: { icon: '🔴', label: 'Token đã hết hạn' }
  };

  function renderCard(data) {
    const statusEl = document.getElementById('fbConnectStatus');
    const connectBtn = document.getElementById('fbConnectBtn');
    const changePageBtn = document.getElementById('fbChangePageBtn');
    const disconnectBtn = document.getElementById('fbDisconnectBtn');
    const reconnectBtn = document.getElementById('fbReconnectBtn');
    if (!statusEl) return;

    const s = STATUS_LABELS[data.status] || STATUS_LABELS.not_connected;
    statusEl.innerHTML = `${s.icon} ${escapeHtml(s.label)}` +
      ((data.status !== 'not_connected' && data.pageName) ? `<br>Fanpage: <strong>${escapeHtml(data.pageName)}</strong>` : '');

    const connected = data.status === 'connected' || data.status === 'token_expiring';
    const expired = data.status === 'token_expired';

    if (connectBtn) connectBtn.style.display = (!connected && !expired) ? 'inline-block' : 'none';
    if (changePageBtn) changePageBtn.style.display = connected ? 'inline-block' : 'none';
    if (disconnectBtn) disconnectBtn.style.display = (connected || expired) ? 'inline-block' : 'none';
    if (reconnectBtn) reconnectBtn.style.display = expired ? 'inline-block' : 'none';
  }

  function refresh() {
    return getStatus().then(renderCard);
  }

  function openConsentDialog() {
    const modal = document.getElementById('fbConsentModal');
    if (modal) modal.classList.add('open');
  }

  function closeConsentDialog() {
    const modal = document.getElementById('fbConsentModal');
    if (modal) modal.classList.remove('open');
  }

  // proceedOAuth() — CHƯA có OAuth thật (xem comment đầu file). Hiển thị rõ
  // ràng lý do và hướng dẫn thay vì giả vờ đăng nhập thành công hoặc im
  // lặng không phản hồi — đúng nguyên tắc trung thực xuyên suốt dự án này.
  function proceedOAuth() {
    closeConsentDialog();
    alert('Facebook App chưa được cấu hình.\n\nCần Chief Architect tạo Facebook App thật trên Meta for Developers, hoàn tất App Review cho quyền "pages_manage_posts", và deploy Cloud Function xử lý OAuth trước khi tính năng này hoạt động được.\n\nXem hướng dẫn đầy đủ từng bước: docs/FACEBOOK_INTEGRATION_SETUP.md');
  }

  function disconnect() {
    if (!confirm('Ngắt kết nối Facebook? Bạn có thể kết nối lại bất kỳ lúc nào.')) return;
    ref().set({ status: 'not_connected' }).then(refresh).catch(() => {
      alert('Không ghi được vào Firebase — có thể Database Rules cho node "facebookConnection" chưa được deploy. Xem docs/FACEBOOK_INTEGRATION_SETUP.md.');
    });
  }

  function init() {
    const connectBtn = document.getElementById('fbConnectBtn');
    const changePageBtn = document.getElementById('fbChangePageBtn');
    const disconnectBtn = document.getElementById('fbDisconnectBtn');
    const reconnectBtn = document.getElementById('fbReconnectBtn');
    const cancelBtn = document.getElementById('fbConsentCancel');
    const cancelXBtn = document.getElementById('fbConsentCancelX');
    const proceedBtn = document.getElementById('fbConsentProceed');

    if (connectBtn) connectBtn.addEventListener('click', openConsentDialog);
    if (changePageBtn) changePageBtn.addEventListener('click', openConsentDialog);
    if (reconnectBtn) reconnectBtn.addEventListener('click', openConsentDialog);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);
    if (cancelBtn) cancelBtn.addEventListener('click', closeConsentDialog);
    if (cancelXBtn) cancelXBtn.addEventListener('click', closeConsentDialog);
    if (proceedBtn) proceedBtn.addEventListener('click', proceedOAuth);

    refresh();
  }

  return { init, getStatus, refresh };
})();
