/*
 * Media Library (admin/media-library.html) — Sprint 10 Requirement #5
 * (Founder Daily Workflow). Trang duyệt/tải/xoá ảnh ĐỘC LẬP, đầu tiên trong
 * dự án — trước đây `MediaLibrary`/`MediaLibraryPicker` (Sprint 8) chỉ tồn
 * tại dưới dạng Modal gắn vào 1 field cụ thể trên form CMS (Product/Blog/
 * Banner/Slider/Category), chưa có nơi duyệt độc lập. Trang này KHÔNG viết
 * lại logic Storage — chỉ gọi lại đúng `MediaLibrary.list()/upload()/
 * remove()` (js/media-library.js, Sprint 8, không sửa). Đúng Architectural
 * Constraint "chỉ thay đổi Experience Layer" — không thêm Field/Collection
 * Firebase nào.
 */
const AdminMediaLibrary = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    AdminAuth.init({ page: 'media-library', title: 'THƯ VIỆN ẢNH' }).then(() => {
      document.getElementById('mlSearchInput').addEventListener('input', () => load(document.getElementById('mlSearchInput').value));
      document.getElementById('mlUploadInput').addEventListener('change', handleUpload);
      load('');
    });
  }

  function load(searchTerm) {
    const grid = document.getElementById('mlGrid');
    grid.innerHTML = '<p class="small-muted">Đang tải...</p>';
    MediaLibrary.list(searchTerm).then(items => {
      if (!items.length) {
        grid.innerHTML = `<p class="small-muted">${searchTerm ? 'Không tìm thấy ảnh nào khớp "' + escapeHtml(searchTerm) + '".' : 'Chưa có ảnh nào trong Thư viện — tải ảnh lên để bắt đầu.'}</p>`;
        return;
      }
      grid.innerHTML = items.map(item => `
        <div class="panel" style="padding:0.75rem" data-path="${escapeHtml(item.fullPath)}">
          <img src="${escapeHtml(item.url || '')}" alt="${escapeHtml(item.name)}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;background:var(--bg-alt)">
          <p class="small-muted" style="margin:0.5rem 0 0;word-break:break-all">${escapeHtml(item.name)}</p>
          <button class="submit-btn ml-remove-btn" data-path="${escapeHtml(item.fullPath)}" style="width:100%;margin-top:0.5rem;background:var(--bg-alt);color:#c0392b">XOÁ</button>
        </div>`).join('');
      grid.querySelectorAll('.ml-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => removeItem(btn.dataset.path, searchTerm));
      });
    });
  }

  function removeItem(fullPath, searchTerm) {
    if (!confirm('Xoá ảnh này khỏi Thư viện? Ảnh đang dùng ở nơi khác (Product/Banner/Blog...) sẽ mất ảnh.')) return;
    MediaLibrary.remove(fullPath).then(() => load(searchTerm));
  }

  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('mlUploadStatus');
    status.textContent = 'Đang tải lên...';
    MediaLibrary.upload(file).then(() => {
      status.textContent = 'Đã tải lên.';
      e.target.value = '';
      load(document.getElementById('mlSearchInput').value);
      setTimeout(() => { status.textContent = ''; }, 2000);
    }).catch(err => {
      status.textContent = 'Lỗi khi tải lên: ' + err.message;
    });
  }

  return { init };
})();
