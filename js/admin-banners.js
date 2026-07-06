/*
 * Banner Manager (admin/banners.html) — CRUD over "banners" node (BannerDB).
 * Independent from the hero Slider — banners render in fixed "zones" on the
 * public site; currently only zone "home-top" is wired into index.html
 * (the strip between the hero and the category tiles).
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'banners', title: 'QUẢN LÝ BANNER' }).then(load);

  let banners = [];
  let editingId = null;
  const bImagePicker = MediaLibraryPicker.mount('bImage', 'bImagePreview');

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    BannerDB.getAll().then(list => {
      banners = list;
      render();
    });
  }

  function render() {
    document.getElementById('bannerTotal').textContent = banners.length;
    const body = document.getElementById('bannerTableBody');
    if (!banners.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có banner nào.</td></tr>';
      return;
    }
    body.innerHTML = banners.map(b => `
      <tr>
        <td>${b.image ? `<img src="${escapeHtml(b.image)}" onerror="this.style.display='none'">` : '—'}</td>
        <td>${escapeHtml(b.title || '(không tiêu đề)')}</td>
        <td>${escapeHtml(b.zone)}</td>
        <td>${b.order || 0}</td>
        <td>${b.active !== false ? 'Đang chạy' : '<span style="color:var(--ink-mute)">Tạm tắt</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="link-btn" onclick="AdminBanners.edit('${b.id}')">Sửa</button>
            <button class="btn-danger" onclick="AdminBanners.remove('${b.id}')">Xóa</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function edit(id) {
    const b = banners.find(x => x.id === id);
    if (!b) return;
    editingId = id;
    document.getElementById('bTitle').value = b.title || '';
    document.getElementById('bImage').value = b.image || '';
    bImagePicker.refresh();
    document.getElementById('bLink').value = b.link || '';
    document.getElementById('bZone').value = b.zone || 'home-top';
    document.getElementById('bOrder').value = b.order || 0;
    document.getElementById('bActive').checked = b.active !== false;
    document.getElementById('bannerFormTitle').textContent = 'SỬA BANNER';
    document.getElementById('bannerSaveBtn').textContent = 'CẬP NHẬT BANNER';
    document.getElementById('bannerFormPanel').scrollIntoView({ behavior: 'smooth' });
  }

  function resetForm() {
    editingId = null;
    ['bTitle', 'bImage', 'bLink'].forEach(id => { document.getElementById(id).value = ''; });
    bImagePicker.refresh();
    document.getElementById('bZone').value = 'home-top';
    document.getElementById('bOrder').value = 0;
    document.getElementById('bActive').checked = true;
    document.getElementById('bannerFormTitle').textContent = 'THÊM BANNER MỚI';
    document.getElementById('bannerSaveBtn').textContent = 'LƯU BANNER';
  }

  function save() {
    const image = document.getElementById('bImage').value.trim();
    if (!image) { alert('Vui lòng nhập hoặc upload ảnh banner.'); return; }
    const data = {
      title: document.getElementById('bTitle').value.trim(),
      image,
      link: document.getElementById('bLink').value.trim(),
      zone: document.getElementById('bZone').value,
      order: parseInt(document.getElementById('bOrder').value, 10) || 0,
      active: document.getElementById('bActive').checked
    };
    const action = editingId ? BannerDB.update(editingId, data) : BannerDB.add(data);
    action.then(() => {
      showStatus(editingId ? 'Đã cập nhật banner.' : 'Đã thêm banner mới.');
      resetForm();
      load();
    });
  }

  function remove(id) {
    if (!confirm('Xóa banner này?')) return;
    BannerDB.remove(id).then(load);
  }

  function showStatus(msg) {
    const el = document.getElementById('bannerStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('bannerSaveBtn').addEventListener('click', save);
  document.getElementById('bannerResetBtn').addEventListener('click', resetForm);

  window.AdminBanners = { edit, remove };
});
