/*
 * admin-telegram-publisher.js — CMS quản lý cấu hình KHÔNG bí mật của PSH Telegram→Facebook Publisher.
 *
 * Mọi đọc/ghi đi qua Cloud Function `telegramPublisherConfig` (xác thực ID token, kiểm super_admin Ở SERVER). Trình duyệt KHÔNG
 * đọc/ghi telegramConfig trực tiếp. Việc ẩn form với người không phải super_admin chỉ là tiện ích hiển thị, không phải ranh giới bảo mật.
 * Không có ô nhập token/secret; không có công tắc dryRun (giai đoạn này luôn dryRun:true).
 */
const AdminTelegramPublisher = (function () {
  const CONFIG_URL = 'https://us-central1-pshop-music.cloudfunctions.net/telegramPublisherConfig';
  // Cùng định dạng validation phía server (functions/shared/telegramConfigAdmin.js) — server vẫn là nơi quyết định.
  const CHAT_NUMERIC = /^-?[1-9]\d{0,19}$/;
  const CHAT_USERNAME = /^@[A-Za-z0-9_]{4,}$/;
  const TG_ID = /^[1-9]\d{0,19}$/;
  const UID = /^[A-Za-z0-9_-]{1,128}$/;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function callApi(method, body) {
    return firebase.auth().currentUser.getIdToken().then(token => fetch(CONFIG_URL, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    })).then(res => res.json().catch(() => ({})).then(data => ({ ok: res.ok, status: res.status, data })));
  }

  function showNotice(msg) {
    const n = $('tgNotice');
    n.style.display = 'block';
    n.textContent = msg;
    $('tgModeCard').style.display = 'none';
    $('tgPageCard').style.display = 'none';
    $('tgFormCard').style.display = 'none';
  }

  function showErrors(list) {
    const el = $('tgErrors');
    if (!list || !list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    el.innerHTML = '<ul style="margin-left:1.2rem">' + list.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
  }

  function rowHtml(tid, uid, status) {
    const warn = status === 'no_publish_permission'
      ? '<span style="color:#b00020"> ⚠️ UID này hiện chưa có quyền đăng (cần Super Admin/Admin/Editor)</span>' : '';
    return '<div class="tg-row" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem">' +
      '<input type="text" class="tg-tid" placeholder="Telegram user ID (số)" value="' + esc(tid) + '" autocomplete="off" style="flex:1;min-width:160px">' +
      '<input type="text" class="tg-uid" placeholder="Firebase UID" value="' + esc(uid) + '" autocomplete="off" style="flex:2;min-width:220px">' +
      '<button type="button" class="btn-danger tg-del">Xoá</button>' + warn + '</div>';
  }

  function addRow(tid, uid, status) {
    const box = $('tgApproverRows');
    const wrap = document.createElement('div');
    wrap.innerHTML = rowHtml(tid || '', uid || '', status);
    const row = wrap.firstChild;
    row.querySelector('.tg-del').addEventListener('click', () => row.remove());
    box.appendChild(row);
  }

  function render(cfg) {
    const live = cfg.effectiveMode === 'live';
    $('tgModeText').innerHTML = live
      ? '<strong style="color:#b00020">⚠️ RTDB đang đặt dryRun = false (ĐĂNG THẬT).</strong> CMS không thể đổi chế độ này. Lưu cấu hình ở đây sẽ đặt lại dryRun = true.'
      : '🧪 <strong>DRY-RUN</strong> — duyệt bài sẽ KHÔNG đăng lên Facebook.';
    const p = cfg.activePage || {};
    $('tgPageText').innerHTML = p.connected
      ? esc(p.pageName || '(không tên)') + ' <span class="small-muted">(ID ' + esc(p.pageId) + ')</span>' + (p.isMock ? ' <strong>[MOCK]</strong>' : '')
      : '⚪ Chưa có Fanpage nào được chọn / đang ngắt kết nối.';
    $('tgChatId').value = cfg.chatId || '';
    $('tgApproverRows').innerHTML = '';
    const ids = cfg.approverIds || [];
    const map = cfg.approverMap || {};
    ids.forEach(id => addRow(id, map[id] || '', (cfg.mappingStatus || {})[id]));
    if (!ids.length) addRow('', '', null);
  }

  function collect() {
    const rows = Array.prototype.slice.call(document.querySelectorAll('#tgApproverRows .tg-row'));
    const approverIds = []; const approverMap = {}; const errors = [];
    const chatId = $('tgChatId').value.trim();
    if (!chatId) errors.push('Thiếu Chat ID.');
    else if (!CHAT_NUMERIC.test(chatId) && !CHAT_USERNAME.test(chatId)) errors.push('Chat ID không hợp lệ: cần số (vd -1001234567890) hoặc @ten_kenh.');
    rows.forEach((row, i) => {
      const tid = row.querySelector('.tg-tid').value.trim();
      const uid = row.querySelector('.tg-uid').value.trim();
      if (!tid && !uid) return;
      if (!TG_ID.test(tid)) { errors.push('Dòng ' + (i + 1) + ': Telegram user ID chỉ gồm chữ số.'); return; }
      if (!UID.test(uid)) { errors.push('Dòng ' + (i + 1) + ': Firebase UID không hợp lệ (chữ, số, "_", "-").'); return; }
      if (approverMap[tid]) { errors.push('Dòng ' + (i + 1) + ': Telegram user ID bị trùng.'); return; }
      approverIds.push(tid); approverMap[tid] = uid;
    });
    if (!approverIds.length && !errors.length) errors.push('Cần ít nhất 1 người duyệt.');
    return { errors, body: { chatId, approverIds, approverMap, dryRun: true } };
  }

  function save() {
    const c = collect();
    showErrors(c.errors);
    if (c.errors.length) return;
    $('tgSaveBtn').disabled = true;
    callApi('POST', c.body).then(r => {
      if (!r.ok) { showErrors(r.data && r.data.errors ? r.data.errors : [r.data && r.data.error ? r.data.error : 'Không lưu được (mã ' + r.status + ').']); return; }
      render(r.data.config);
      showErrors([]);
      alert('Đã lưu cấu hình. Chế độ: DRY-RUN.');
    }).catch(err => showErrors(['Lỗi mạng: ' + err.message])).then(() => { $('tgSaveBtn').disabled = false; });
  }

  function init() {
    $('tgAddRowBtn').addEventListener('click', () => addRow('', '', null));
    $('tgSaveBtn').addEventListener('click', save);
    callApi('GET').then(r => {
      if (r.status === 401 || r.status === 403) { showNotice('Chỉ Super Admin được xem và chỉnh sửa cấu hình Telegram Publisher.'); return; }
      if (!r.ok) { showNotice('Không tải được cấu hình (mã ' + r.status + ').'); return; }
      render(r.data.config);
    }).catch(err => showNotice('Lỗi mạng: ' + err.message));
  }

  return { init };
})();
