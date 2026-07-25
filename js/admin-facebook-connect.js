/*
 * Facebook Configuration — Sprint 12 Requirement #9 (Facebook AI V4, khung UI
 * an toàn) → OAuth thật ở Facebook AI V5 → kiến trúc production hoàn chỉnh +
 * Mock Mode ở Facebook Integration V1 (Requirement hiện tại).
 *
 * App ID KHÔNG hardcode ở đây (khác quyết định tạm thời ở V5) — đọc từ node
 * Firebase `facebookAppConfig/appId`, Founder tự "Enter App ID" qua ô nhập
 * trên chính trang này (`#fbAppIdInput`/`#fbAppIdSaveBtn`), KHÔNG cần sửa
 * code/redeploy. App Secret vẫn KHÔNG BAO GIỜ xuất hiện ở client — chỉ sống
 * trong Secret Manager phía Cloud Function.
 *
 * Mock Mode: App ID rỗng (trạng thái HIỆN TẠI, chưa có Facebook App thật) tự
 * động bật Mock Mode cho toàn bộ luồng — không có công tắc riêng nào khác.
 * `proceedOAuth()` khi đó KHÔNG redirect sang Facebook thật (không có gì để
 * redirect tới) mà đi thẳng tới CHÍNH Cloud Function `facebookOAuthCallback`
 * của mình với 1 code giả — Cloud Function tự nhận biết Mock Mode (App ID
 * rỗng) và trả dữ liệu giả lập đúng shape Graph API thật qua
 * functions/facebook-graph-api.js, để toàn bộ phần còn lại của luồng (state
 * nonce → callback → Page Selection → Publish) chạy Y HỆT luồng thật, chỉ
 * khác không có Facebook thật đứng giữa. Loại bỏ Mock Mode sau này = điền
 * App ID thật — không cần sửa file này hay bất kỳ nơi nào khác.
 *
 * Token thật (User Access Token/Page Access Token) KHÔNG BAO GIỜ đi qua file
 * này hay bất kỳ đâu phía client — toàn bộ nằm trong node server-only
 * `facebookPageTokens`/`facebookActiveToken`/`facebookUserToken` (Database
 * Rules .read:false/.write:false tuyệt đối, chỉ Cloud Function Admin SDK đọc/
 * ghi được). Trang này chỉ đọc `facebookConnection` (metadata) và
 * `facebookPendingPages/{uid}` (danh sách Page để hiển thị chọn).
 */
const AdminFacebookConnect = (function () {
  const FACEBOOK_OAUTH_DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
  const FACEBOOK_OAUTH_CALLBACK_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback';
  const FACEBOOK_SELECT_PAGE_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookSelectPage';
  const FACEBOOK_REFRESH_TOKEN_URL = 'https://us-central1-pshop-music.cloudfunctions.net/facebookRefreshToken';
  const FACEBOOK_SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';
  // Facebook Long-Lived User Token thường sống ~60 ngày — cảnh báo "sắp hết
  // hạn" khi còn dưới 7 ngày, để Founder có thời gian tự làm mới/kết nối lại.
  const TOKEN_EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

  function ref() {
    return firebase.database().ref('facebookConnection');
  }

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function generateStateNonce() {
    return 'st-' + Math.random().toString(36).slice(2) + '-' + Date.now();

  function getAppId() {
    return firebase.database().ref('facebookAppConfig/appId').once('value')
      .then(snap => snap.val() || '')
      .catch(() => '');

  // getStatus() — mặc định an toàn 'not_connected' nếu chưa có dữ liệu HOẶC
  // nếu đọc lỗi (vd Database Rules cho node này chưa được deploy) — không
  // bao giờ để card hiển thị sai trạng thái/vỡ giao diện.
  function getStatus() {
    return ref().once('value')
      .then(snap => snap.val() || { status: 'not_connected' })
      .catch(() => ({ status: 'not_connected' }));

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

  const STATUS_LABELS = {
    not_connected: { icon: '⚪', label: 'Chưa kết nối' },
    connected: { icon: '🟢', label: 'Đã kết nối' },
    token_expiring: { icon: '🟠', label: 'Token sắp hết hạn' },
    token_expired: { icon: '🔴', label: 'Token đã hết hạn' }

  function renderMockBadge(isMockActive) {
    const badge = document.getElementById('fbMockModeBadge');
    if (!badge) return;
    if (!isMockActive) { badge.style.display = 'none'; badge.innerHTML = ''; return; }
    badge.style.display = 'block';
    badge.innerHTML = '<p class="small-muted" style="color:#b36b00">🧪 Mock Mode — chưa có App ID thật, mọi kết nối/đăng bài hiện chỉ là dữ liệu giả lập để tự kiểm thử luồng.</p>';

  function renderCard(data, appId) {
    const statusEl = document.getElementById('fbConnectStatus');
    const connectBtn = document.getElementById('fbConnectBtn');
    const changePageBtn = document.getElementById('fbChangePageBtn');
    const disconnectBtn = document.getElementById('fbDisconnectBtn');
    const reconnectBtn = document.getElementById('fbReconnectBtn');
    const refreshTokenBtn = document.getElementById('fbRefreshTokenBtn');
    if (!statusEl) return;

    const effectiveStatus = computeEffectiveStatus(data);
    const s = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.not_connected;
    statusEl.innerHTML = `${s.icon} ${PSH.escapeHtml(s.label)}` +
      ((effectiveStatus !== 'not_connected' && data.pageName) ? `<br>Fanpage: <strong>${PSH.escapeHtml(data.pageName)}</strong>` : '');

    const connected = effectiveStatus === 'connected' || effectiveStatus === 'token_expiring';
    const expired = effectiveStatus === 'token_expired';

    if (connectBtn) connectBtn.style.display = (!connected && !expired) ? 'inline-block' : 'none';
    if (changePageBtn) changePageBtn.style.display = connected ? 'inline-block' : 'none';
    if (refreshTokenBtn) refreshTokenBtn.style.display = (connected || expired) ? 'inline-block' : 'none';
    if (disconnectBtn) disconnectBtn.style.display = (connected || expired) ? 'inline-block' : 'none';
    if (reconnectBtn) reconnectBtn.style.display = expired ? 'inline-block' : 'none';

    // Mock Mode đang thật sự áp dụng nếu CHƯA điền App ID (mọi kết nối MỚI sẽ
    // là giả) HOẶC kết nối HIỆN TẠI đã được thiết lập lúc còn Mock Mode
    // (`facebookConnection.isMock`) — giữ đúng cho tới khi Founder "Kết nối
    // lại" thật, tránh hiển thị nhầm 🟢 "đã kết nối thật" trong khi vẫn đang
    // dùng dữ liệu giả.
    renderMockBadge(!appId || !!data.isMock);

  function refresh() {
    return Promise.all([getStatus(), getAppId()]).then(([data, appId]) => renderCard(data, appId));

  function openConsentDialog() {
    const modal = document.getElementById('fbConsentModal');
    if (modal) modal.classList.add('open');

  function closeConsentDialog() {
    const modal = document.getElementById('fbConsentModal');
    if (modal) modal.classList.remove('open');

  // proceedOAuth() — Facebook Integration V1: KHÔNG còn báo "chưa cấu hình"
  // khi thiếu App ID — thay vào đó tự động chạy Mock Mode (xem comment đầu
  // file). Ghi 1 nonce dùng 1 lần vào `facebookOAuthState/{state}` TRƯỚC khi
  // rời trang trong CẢ 2 trường hợp (thật/mock) — đây là cách DUY NHẤT Cloud
  // Function `facebookOAuthCallback` (nhận redirect, không có Firebase Auth
  // header vì là navigation trình duyệt thật, không phải fetch()) biết được
  // "yêu cầu OAuth này của Founder nào".
  function proceedOAuth() {
    closeConsentDialog();
    const user = AdminAuth.getUser();
    const state = generateStateNonce();
    Promise.all([
      getAppId(),
      firebase.database().ref('facebookOAuthState/' + state).set({ uid: user.uid, createdAt: Date.now() })
    ]).then(([appId]) => {
      if (!appId) {
        // Mock Mode — không có gì để redirect sang Facebook thật, đi thẳng
        // tới CHÍNH Cloud Function callback của mình với code giả để kiểm
        // thử toàn bộ luồng còn lại (state → exchange giả lập → pages giả →
        // page selection → publish) y hệt luồng thật.
        window.location.href = `${FACEBOOK_OAUTH_CALLBACK_URL}?code=mock-code&state=${encodeURIComponent(state)}`;
        return;
      const authUrl = `${FACEBOOK_OAUTH_DIALOG_URL}?client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(FACEBOOK_OAUTH_CALLBACK_URL)}` +
        `&scope=${encodeURIComponent(FACEBOOK_SCOPES)}&response_type=code&state=${encodeURIComponent(state)}`;
      window.location.href = authUrl;

  function disconnect() {
    if (!confirm('Ngắt kết nối Facebook? Bạn có thể kết nối lại bất kỳ lúc nào.')) return;
    ref().set({ status: 'not_connected' }).then(refresh).catch(() => {
      alert('Không ghi được vào Firebase — có thể Database Rules cho node "facebookConnection" chưa được deploy. Xem docs/FACEBOOK_INTEGRATION_SETUP.md.');

  // refreshToken() — Token Refresh (Facebook Integration V1). Gọi Cloud
  // Function facebookRefreshToken (đổi Long-Lived User Token còn hạn lấy 1
  // token mới, gia hạn thêm ~60 ngày) — không cần Founder đăng nhập lại nếu
  // Token vẫn còn hạn. Nếu đã hết hạn hoàn toàn, Cloud Function trả lỗi rõ
  // ràng yêu cầu "Kết nối lại" thay vì báo chung chung.
  function refreshToken() {
    firebase.auth().currentUser.getIdToken().then(idToken => {
      return fetch(FACEBOOK_REFRESH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({})
      if (!ok || !data.success) { alert('Không làm mới được Token: ' + ((data && data.error) || 'Không rõ nguyên nhân.')); return; }
      alert('Đã làm mới Token thành công.');
      refresh();

  /* ================= App ID (Founder tự "Enter App ID" qua UI, không sửa code) ================= */

  function loadAppIdField() {
    const input = document.getElementById('fbAppIdInput');
    if (!input) return Promise.resolve();
    return getAppId().then(appId => { input.value = appId; });

  function saveAppId() {
    const input = document.getElementById('fbAppIdInput');
    if (!input) return;
    const appId = input.value.trim();
    firebase.database().ref('facebookAppConfig').update({ appId }).then(() => {
      alert(appId ? 'Đã lưu App ID.' : 'Đã xoá App ID — hệ thống quay lại Mock Mode.');
      refresh();

  /* ================= Page Selection (sau khi OAuth hoàn tất — thật hoặc Mock Mode) ================= */

  function pageSelectBox() { return document.getElementById('fbPageSelectBox'); }

  function renderPageSelection(pages) {
    const box = pageSelectBox();
    if (!box) return;
    if (!pages || !pages.length) {
      box.style.display = 'block';
      box.innerHTML = '<div class="panel"><p class="small-muted">Tài khoản Facebook này chưa quản lý Fanpage nào.</p></div>';
      return;
    box.style.display = 'block';
    box.innerHTML = `<div class="panel">
      <h3>CHỌN FANPAGE MẶC ĐỊNH</h3>
      <p class="small-muted">Chọn Fanpage sẽ dùng để AI đăng bài tự động sau khi Founder duyệt.</p>
      <div style="display:flex;flex-direction:column;gap:0.6rem;margin:0.8rem 0">
        ${pages.map((p, i) => `
          <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer">
            <input type="radio" name="fbPageChoice" value="${PSH.escapeHtml(p.id)}" ${i === 0 ? 'checked' : ''}>
            ${p.picture ? `<img src="${PSH.escapeHtml(p.picture)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : ''}
            <span>${PSH.escapeHtml(p.name)}</span>
          </label>`).join('')}
      </div>
      <div class="admin-actions">
        <button type="button" class="submit-btn" id="fbPageSaveBtn">LƯU</button>
      </div>
    </div>`;
    document.getElementById('fbPageSaveBtn').addEventListener('click', saveSelectedPage);

  function saveSelectedPage() {
    const chosen = document.querySelector('input[name="fbPageChoice"]:checked');
    if (!chosen) { alert('Vui lòng chọn 1 Fanpage.'); return; }
    firebase.auth().currentUser.getIdToken().then(idToken => {
      return fetch(FACEBOOK_SELECT_PAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ pageId: chosen.value })
      if (!ok) { alert('Lỗi khi lưu Fanpage: ' + (data.error || 'Không rõ nguyên nhân.')); return; }
      const box = pageSelectBox();
      if (box) { box.style.display = 'none'; box.innerHTML = ''; }
      refresh();

  // checkOAuthReturn() — sau khi Cloud Function facebookOAuthCallback redirect
  // trình duyệt về đúng trang này (?oauth=success hoặc ?oauth=error&reason=...),
  // dù là kết nối thật hay Mock Mode. Luôn dọn query string khỏi URL sau khi
  // xử lý (history.replaceState) để tải lại trang không xử lý lại cùng 1 kết
  // quả OAuth.
  function checkOAuthReturn() {
    const params = new URLSearchParams(location.search);
    const oauth = params.get('oauth');
    if (!oauth) return;

    const cleanUrl = location.pathname;
    history.replaceState({}, '', cleanUrl);

    if (oauth === 'error') {
      alert('Kết nối Facebook thất bại: ' + (params.get('reason') || 'Không rõ nguyên nhân.'));
      return;
    if (oauth === 'success') {
      const user = AdminAuth.getUser();
      firebase.database().ref('facebookPendingPages/' + user.uid + '/pages').once('value').then(snap => {
        renderPageSelection(snap.val());
        alert('Đăng nhập Facebook thành công nhưng không đọc được danh sách Fanpage — vui lòng thử Kết nối lại.');

  function init() {
    const connectBtn = document.getElementById('fbConnectBtn');
    const changePageBtn = document.getElementById('fbChangePageBtn');
    const disconnectBtn = document.getElementById('fbDisconnectBtn');
    const reconnectBtn = document.getElementById('fbReconnectBtn');
    const refreshTokenBtn = document.getElementById('fbRefreshTokenBtn');
    const appIdSaveBtn = document.getElementById('fbAppIdSaveBtn');
    const cancelBtn = document.getElementById('fbConsentCancel');
    const cancelXBtn = document.getElementById('fbConsentCancelX');
    const proceedBtn = document.getElementById('fbConsentProceed');

    if (connectBtn) connectBtn.addEventListener('click', openConsentDialog);
    if (changePageBtn) changePageBtn.addEventListener('click', openConsentDialog);
    if (reconnectBtn) reconnectBtn.addEventListener('click', openConsentDialog);
    if (refreshTokenBtn) refreshTokenBtn.addEventListener('click', refreshToken);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);
    if (appIdSaveBtn) appIdSaveBtn.addEventListener('click', saveAppId);
    if (cancelBtn) cancelBtn.addEventListener('click', closeConsentDialog);
    if (cancelXBtn) cancelXBtn.addEventListener('click', closeConsentDialog);
    if (proceedBtn) proceedBtn.addEventListener('click', proceedOAuth);

    loadAppIdField();
    refresh();
    checkOAuthReturn();

  return { init, getStatus, refresh };
})();
