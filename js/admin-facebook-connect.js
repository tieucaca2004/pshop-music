/*
 * Facebook Configuration — Sprint 12 Requirement #9 (Facebook AI V4, khung UI
 * an toàn) → nâng cấp thật ở Facebook AI V5 (Sprint 12 Requirement kế tiếp).
 *
 * V4 CHỈ có khung UI (card kết nối, dialog xin phép, Ngắt kết nối ghi Firebase
 * thật) — KHÔNG có OAuth thật. V5 nối OAuth THẬT: redirect sang Facebook Login
 * Dialog → Cloud Function `facebookOAuthCallback` (functions/index.js) xử lý
 * đổi code lấy token + lấy danh sách Fanpage → trang này hiển thị danh sách
 * để Founder chọn Default Page → Cloud Function `facebookSelectPage` lưu lựa
 * chọn thật.
 *
 * `FACEBOOK_APP_ID` dưới đây CHƯA có giá trị thật — Facebook App chỉ Chief
 * Architect tự tạo được (developers.facebook.com), xem
 * docs/FACEBOOK_INTEGRATION_SETUP.md. App ID KHÔNG nhạy cảm (an toàn ở phía
 * client, giống mọi trang OAuth khác) — App Secret KHÔNG BAO GIỜ xuất hiện ở
 * đây, chỉ sống trong Secret Manager phía Cloud Function.
 *
 * Token thật (User Access Token/Page Access Token) KHÔNG BAO GIỜ đi qua file
 * này hay bất kỳ đâu phía client — toàn bộ nằm trong node server-only
 * `facebookPageTokens`/`facebookActiveToken` (Database Rules .read:false/
 * .write:false tuyệt đối, chỉ Cloud Function Admin SDK đọc/ghi được). Trang
 * này chỉ đọc `facebookConnection` (metadata) và `facebookPendingPages/{uid}`
 * (danh sách Page để hiển thị chọn, cũng không có token).
 */
const AdminFacebookConnect = (function () {
  // TODO: Chief Architect điền App ID thật sau khi tạo Facebook App.
  const FACEBOOK_APP_ID = '';
  const FACEBOOK_OAUTH_DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
  const FACEBOOK_OAUTH_CALLBACK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback';
  const FACEBOOK_SELECT_PAGE_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookSelectPage';
  const FACEBOOK_SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';
  // Facebook Long-Lived User Token thường sống ~60 ngày — cảnh báo "sắp hết
  // hạn" khi còn dưới 7 ngày, để Founder có thời gian tự kết nối lại.
  const TOKEN_EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

  function ref() {
    return firebase.database().ref('facebookConnection');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function generateStateNonce() {
    return 'st-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  }

  // getStatus() — mặc định an toàn 'not_connected' nếu chưa có dữ liệu HOẶC
  // nếu đọc lỗi (vd Database Rules cho node này chưa được deploy) — không
  // bao giờ để card hiển thị sai trạng thái/vỡ giao diện.
  function getStatus() {
    return ref().once('value')
      .then(snap => snap.val() || { status: 'not_connected' })
      .catch(() => ({ status: 'not_connected' }));
  }

  // computeEffectiveStatus() — Cloud Function chỉ ghi 'connected' tại thời
  // điểm chọn Page; độ "tươi" của Token phải tự tính LẠI mỗi lần hiển thị (so
  // với đồng hồ hiện tại), không dựa vào giá trị `status` tĩnh đã ghi từ
  // trước — nếu không, card sẽ vẫn báo 🟢 mãi mãi dù Token đã hết hạn từ lâu.
  function computeEffectiveStatus(data) {
    if (data.status !== 'connected' && data.status !== 'token_expiring') return data.status || 'not_connected';
    if (!data.tokenExpiresAt) return data.status;
    const remaining = data.tokenExpiresAt - Date.now();
    if (remaining <= 0) return 'token_expired';
    if (remaining <= TOKEN_EXPIRING_SOON_MS) return 'token_expiring';
    return 'connected';
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

    const effectiveStatus = computeEffectiveStatus(data);
    const s = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.not_connected;
    statusEl.innerHTML = `${s.icon} ${escapeHtml(s.label)}` +
      ((effectiveStatus !== 'not_connected' && data.pageName) ? `<br>Fanpage: <strong>${escapeHtml(data.pageName)}</strong>` : '');

    const connected = effectiveStatus === 'connected' || effectiveStatus === 'token_expiring';
    const expired = effectiveStatus === 'token_expired';

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

  // proceedOAuth() — bắt đầu OAuth THẬT (Sprint 12, Facebook AI V5). Ghi 1
  // nonce dùng 1 lần vào `facebookOAuthState/{state}` TRƯỚC khi rời trang —
  // đây là cách DUY NHẤT Cloud Function `facebookOAuthCallback` (nhận redirect
  // từ Facebook, không có Firebase Auth header vì là navigation trình duyệt
  // thật, không phải fetch()) biết được "yêu cầu OAuth này của Founder nào".
  // Nếu App ID chưa được cấu hình (Facebook App chưa tồn tại), báo rõ ràng —
  // không redirect tới 1 URL chắc chắn lỗi.
  function proceedOAuth() {
    closeConsentDialog();
    if (!FACEBOOK_APP_ID) {
      alert('Facebook App chưa được cấu hình (thiếu App ID thật).\n\nCần Chief Architect tạo Facebook App tại developers.facebook.com rồi điền App ID vào js/admin-facebook-connect.js + functions/index.js trước khi tính năng này hoạt động được.\n\nXem hướng dẫn đầy đủ: docs/FACEBOOK_INTEGRATION_SETUP.md');
      return;
    }
    const user = AdminAuth.getUser();
    const state = generateStateNonce();
    firebase.database().ref('facebookOAuthState/' + state).set({ uid: user.uid, createdAt: Date.now() }).then(() => {
      const authUrl = `${FACEBOOK_OAUTH_DIALOG_URL}?client_id=${encodeURIComponent(FACEBOOK_APP_ID)}` +
        `&redirect_uri=${encodeURIComponent(FACEBOOK_OAUTH_CALLBACK_URL)}` +
        `&scope=${encodeURIComponent(FACEBOOK_SCOPES)}&response_type=code&state=${encodeURIComponent(state)}`;
      window.location.href = authUrl;
    }).catch(err => alert('Không khởi tạo được phiên kết nối: ' + err.message));
  }

  function disconnect() {
    if (!confirm('Ngắt kết nối Facebook? Bạn có thể kết nối lại bất kỳ lúc nào.')) return;
    ref().set({ status: 'not_connected' }).then(refresh).catch(() => {
      alert('Không ghi được vào Firebase — có thể Database Rules cho node "facebookConnection" chưa được deploy. Xem docs/FACEBOOK_INTEGRATION_SETUP.md.');
    });
  }

  /* ================= Page Selection (sau khi OAuth thật hoàn tất) ================= */

  function pageSelectBox() { return document.getElementById('fbPageSelectBox'); }

  function renderPageSelection(pages) {
    const box = pageSelectBox();
    if (!box) return;
    if (!pages || !pages.length) {
      box.style.display = 'block';
      box.innerHTML = '<div class="panel"><p class="small-muted">Tài khoản Facebook này chưa quản lý Fanpage nào.</p></div>';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = `<div class="panel">
      <h3>CHỌN FANPAGE MẶC ĐỊNH</h3>
      <p class="small-muted">Chọn Fanpage sẽ dùng để AI đăng bài tự động sau khi Founder duyệt.</p>
      <div style="display:flex;flex-direction:column;gap:0.6rem;margin:0.8rem 0">
        ${pages.map((p, i) => `
          <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer">
            <input type="radio" name="fbPageChoice" value="${escapeHtml(p.id)}" ${i === 0 ? 'checked' : ''}>
            ${p.picture ? `<img src="${escapeHtml(p.picture)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : ''}
            <span>${escapeHtml(p.name)}</span>
          </label>`).join('')}
      </div>
      <div class="admin-actions">
        <button type="button" class="submit-btn" id="fbPageSaveBtn">LƯU</button>
      </div>
    </div>`;
    document.getElementById('fbPageSaveBtn').addEventListener('click', saveSelectedPage);
  }

  function saveSelectedPage() {
    const chosen = document.querySelector('input[name="fbPageChoice"]:checked');
    if (!chosen) { alert('Vui lòng chọn 1 Fanpage.'); return; }
    firebase.auth().currentUser.getIdToken().then(idToken => {
      return fetch(FACEBOOK_SELECT_PAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ pageId: chosen.value })
      }).then(res => res.json().then(data => ({ ok: res.ok, data })));
    }).then(({ ok, data }) => {
      if (!ok) { alert('Lỗi khi lưu Fanpage: ' + (data.error || 'Không rõ nguyên nhân.')); return; }
      const box = pageSelectBox();
      if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      refresh();
    }).catch(err => alert('Lỗi khi lưu Fanpage: ' + err.message));
  }

  // checkOAuthReturn() — sau khi Cloud Function facebookOAuthCallback redirect
  // trình duyệt về đúng trang này (?oauth=success hoặc ?oauth=error&reason=...).
  // Luôn dọn query string khỏi URL sau khi xử lý (history.replaceState) để
  // tải lại trang không xử lý lại cùng 1 kết quả OAuth.
  function checkOAuthReturn() {
    const params = new URLSearchParams(location.search);
    const oauth = params.get('oauth');
    if (!oauth) return;

    const cleanUrl = location.pathname;
    history.replaceState({}, '', cleanUrl);

    if (oauth === 'error') {
      alert('Kết nối Facebook thất bại: ' + (params.get('reason') || 'Không rõ nguyên nhân.'));
      return;
    }
    if (oauth === 'success') {
      const user = AdminAuth.getUser();
      firebase.database().ref('facebookPendingPages/' + user.uid + '/pages').once('value').then(snap => {
        renderPageSelection(snap.val());
      }).catch(() => {
        alert('Đăng nhập Facebook thành công nhưng không đọc được danh sách Fanpage — vui lòng thử Kết nối lại.');
      });
    }
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
    checkOAuthReturn();
  }

  return { init, getStatus, refresh };
})();
