/*
 * Video Manager (admin/videos.html) — CRUD over "videos" node (VideoDB).
 * Videos are YouTube/Vimeo links only (no file upload) — kept intentionally
 * simple and free to host, per the user's choice.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'videos', title: 'QUẢN LÝ VIDEO' }).then(load);

  let videos = [];
  let editingId = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    VideoDB.getAll().then(list => {
      videos = list;
      render();
    });
  }

  function render() {
    document.getElementById('videoTotal').textContent = videos.length;
    const body = document.getElementById('videoTableBody');
    if (!videos.length) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có video nào.</td></tr>';
      return;
    }
    body.innerHTML = videos.map(v => {
      const parsed = parseVideoUrl(v.url);
      return `
      <tr>
        <td>${parsed && parsed.thumbnail ? `<img src="${escapeHtml(parsed.thumbnail)}">` : '—'}</td>
        <td>${escapeHtml(v.title)}</td>
        <td>${parsed ? parsed.platform : '<span style="color:#c0392b">Link không hợp lệ</span>'}</td>
        <td>${v.active !== false ? 'Hiển thị' : '<span style="color:var(--ink-mute)">Tạm ẩn</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="link-btn" onclick="AdminVideos.edit('${v.id}')">Sửa</button>
            <button class="btn-danger" onclick="AdminVideos.remove('${v.id}')">Xóa</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function edit(id) {
    // Đọc LẠI bản ghi từ DB trước khi điền form: danh sách chỉ tải lúc mở
    // trang — bản ghi đã được sửa ở tab khác/AI/Agent sau đó thì form nạp
    // giá trị cũ và bấm Lưu GHI ĐÈ thay đổi mới (mất dữ liệu).
    return VideoDB.get(id).catch(() => null).then(fresh => fillEdit(id, fresh || videos.find(x => x.id === id)));
  }

  function fillEdit(id, v) {
    if (!v) return;
    editingId = id;
    CmsEditGuard.capture('video', v); // chụp bản ghi lúc mở form — so sánh khi Lưu
    CmsDirtyForm.clean('videoFormPanel');
    document.getElementById('vTitle').value = v.title || '';
    document.getElementById('vUrl').value = v.url || '';
    document.getElementById('vDescription').value = v.description || '';
    document.getElementById('vOrder').value = v.order || 0;
    document.getElementById('vActive').checked = v.active !== false;
    document.getElementById('videoFormTitle').textContent = 'SỬA VIDEO';
    document.getElementById('videoSaveBtn').textContent = 'CẬP NHẬT VIDEO';
    document.getElementById('videoFormPanel').scrollIntoView({ behavior: 'smooth' });
  }

  function resetForm() {
    editingId = null;
    CmsEditGuard.clear('video');
    CmsDirtyForm.clean('videoFormPanel');
    ['vTitle', 'vUrl', 'vDescription'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('vOrder').value = 0;
    document.getElementById('vActive').checked = true;
    document.getElementById('videoFormTitle').textContent = 'THÊM VIDEO MỚI';
    document.getElementById('videoSaveBtn').textContent = 'LƯU VIDEO';
  }

  function save() {
    const title = document.getElementById('vTitle').value.trim();
    const url = document.getElementById('vUrl').value.trim();
    if (!title || !url) { alert('Vui lòng nhập tiêu đề và link video.'); return; }
    if (!parseVideoUrl(url)) { alert('Link video không hợp lệ — chỉ hỗ trợ YouTube hoặc Vimeo.'); return; }
    const data = {
      title,
      url,
      description: document.getElementById('vDescription').value.trim(),
      order: parseInt(document.getElementById('vOrder').value, 10) || 0,
      active: document.getElementById('vActive').checked
    };
    // Chặn bấm Lưu lần 2 khi lượt trước chưa xong (trước đây tạo bản ghi trùng).
    const saveBtn = document.getElementById('videoSaveBtn');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    // Lưu có kiểm tra xung đột: bản ghi đổi ở nơi khác sau khi mở form → KHÔNG ghi đè, hỏi Founder.
    const action = CmsEditGuard.guardedSave('video', editingId, id => VideoDB.get(id),
      () => (editingId ? VideoDB.update(editingId, data) : VideoDB.add(data)), id => edit(id));
    action.then(result => {
      if (result && result.conflict) return; // Founder chọn giữ form / tải lại — chưa lưu
      showStatus(editingId ? 'Đã cập nhật video.' : 'Đã thêm video mới.');
      resetForm();
      load();
    }).catch(CmsSaveError.report)
      .then(() => { saveBtn.disabled = false; });
  }

  function remove(id) {
    if (!confirm('Xóa video này?')) return;
    VideoDB.remove(id).then(load);
  }

  function showStatus(msg) {
    const el = document.getElementById('videoStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('videoSaveBtn').addEventListener('click', save);
  CmsDirtyForm.watch('videoFormPanel');
  document.getElementById('videoResetBtn').addEventListener('click', resetForm);

  window.AdminVideos = { edit, remove };
});
