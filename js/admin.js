/*
 * Dev-grade client-side password gate. This runs entirely in the browser,
 * so anyone can read ADMIN_PASSWORD from source — it only deters casual
 * access, not a determined attacker. Change the password below before
 * deploying, and see README.md for upgrading to real Firebase Auth.
 */
const ADMIN_PASSWORD = 'pshop2024';
const SESSION_KEY = 'pshop_admin_auth';

const AdminApp = (function () {
  let products = [];
  let editingId = null;

  const catLabels = { dj: 'Máy DJ', loa: 'Loa kiểm âm', tainghe: 'Tai nghe', soundcard: 'Soundcard', phukien: 'Phụ kiện' };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadProducts();
  }

  function login() {
    const val = document.getElementById('loginPassword').value;
    if (val === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      showDashboard();
    } else {
      document.getElementById('loginError').style.display = 'block';
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  }

  function loadProducts(filter) {
    DB.getAll().then(list => {
      products = list;
      renderTable(filter || '');
    });
  }

  function renderTable(query) {
    const q = (query || '').toLowerCase();
    const filtered = products.filter(p => !q || (p.name + ' ' + p.brand).toLowerCase().includes(q));
    document.getElementById('productTotal').textContent = products.length;

    const body = document.getElementById('productTableBody');
    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--muted2);text-align:center;padding:2rem">Không có sản phẩm.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map(p => `
      <tr>
        <td>${p.image ? `<img src="${escapeHtml(p.image)}" onerror="this.style.display='none'">` : '—'}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${catLabels[p.category] || p.category}</td>
        <td>${p.price ? escapeHtml(p.price) : '<span style="color:var(--muted2)">Liên hệ</span>'}</td>
        <td>${p.status === 'Used' ? 'Qua sử dụng' : 'Mới'}</td>
        <td>
          <div class="row-actions">
            <button class="link-btn" onclick="AdminApp.editProduct('${p.id}')">Sửa</button>
            <button class="btn-danger" onclick="AdminApp.deleteProduct('${p.id}')">Xóa</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById('pId').value = p.id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pCategory').value = p.category || 'dj';
    document.getElementById('pStatus').value = p.status || 'New';
    document.getElementById('pBrand').value = p.brand || '';
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pSpecs').value = p.specs || '';
    document.getElementById('pBadgeText').value = p.badgeText || '';
    document.getElementById('pDescription').value = p.description || '';
    document.getElementById('pImage').value = p.image || '';
    document.getElementById('formTitle').textContent = 'SỬA SẢN PHẨM';
    document.getElementById('saveBtn').textContent = 'CẬP NHẬT SẢN PHẨM';
    document.getElementById('formPanel').scrollIntoView({ behavior: 'smooth' });
  }

  function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Xóa sản phẩm "${p.name}"? Hành động này không thể hoàn tác.`)) return;
    DB.remove(id).then(() => {
      showStatus('Đã xóa sản phẩm.');
      loadProducts(document.getElementById('adminSearch').value);
    });
  }

  function resetForm() {
    editingId = null;
    document.getElementById('pId').value = '';
    ['pName', 'pBrand', 'pPrice', 'pSpecs', 'pBadgeText', 'pDescription', 'pImage'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('pCategory').value = 'dj';
    document.getElementById('pStatus').value = 'New';
    document.getElementById('formTitle').textContent = 'THÊM SẢN PHẨM MỚI';
    document.getElementById('saveBtn').textContent = 'LƯU SẢN PHẨM';
  }

  function saveProduct() {
    const name = document.getElementById('pName').value.trim();
    if (!name) { alert('Vui lòng nhập tên sản phẩm.'); return; }

    const category = document.getElementById('pCategory').value;
    const data = {
      name,
      category,
      categoryLabel: catLabels[category],
      status: document.getElementById('pStatus').value,
      brand: document.getElementById('pBrand').value.trim(),
      price: document.getElementById('pPrice').value.trim(),
      specs: document.getElementById('pSpecs').value.trim(),
      badgeText: document.getElementById('pBadgeText').value.trim(),
      description: document.getElementById('pDescription').value.trim(),
      image: document.getElementById('pImage').value.trim()
    };

    const action = editingId ? DB.update(editingId, data) : DB.add(data);
    action.then(() => {
      showStatus(editingId ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm mới.');
      resetForm();
      loadProducts(document.getElementById('adminSearch').value);
    });
  }

  function showStatus(msg) {
    const el = document.getElementById('formStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  function exportJson() {
    DB.getAll().then(list => {
      const blob = new Blob([JSON.stringify({ products: list }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pshop-products-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        const list = Array.isArray(parsed) ? parsed : parsed.products;
        if (!Array.isArray(list)) throw new Error('Invalid format');
        DB.replaceAll(list).then(() => {
          showStatus('Đã nhập ' + list.length + ' sản phẩm.');
          loadProducts();
        });
      } catch (err) {
        alert('File JSON không hợp lệ.');
      }
    };
    reader.readAsText(file);
  }

  function resetToSeed() {
    if (!confirm('Khôi phục về dữ liệu gốc? Mọi thay đổi hiện tại sẽ bị mất.')) return;
    DB.resetToSeed().then(() => {
      showStatus('Đã khôi phục dữ liệu gốc.');
      loadProducts();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') showDashboard();
    else showLogin();

    document.getElementById('loginPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    });

    let debounce;
    document.getElementById('adminSearch').addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderTable(e.target.value), 150);
    });

    document.getElementById('importFile').addEventListener('change', e => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
  });

  return { login, logout, editProduct, deleteProduct, saveProduct, resetForm, exportJson, resetToSeed };
})();
