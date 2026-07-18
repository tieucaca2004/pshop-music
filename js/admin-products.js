/*
 * Product Manager (admin/products.html) — same fields/behavior as the old
 * password-gated admin.html, just running inside the new CMS shell with
 * Firebase Auth (js/admin-auth.js) instead of a hardcoded password, and an
 * "Upload ảnh" button (js/storage-upload.js) alongside the URL textarea.
 * Category list now comes from CategoryDB (js/cms-db.js) instead of a
 * hardcoded object, so Category Manager edits show up here automatically.
 */
const AdminApp = (function () {
  let products = [];
  let categories = [];
  let editingId = null;
  let quill = null;
  let pImagesPicker = null;
  let pBgImagePicker = null; // Sprint 13: ảnh nền sản phẩm

  function catLabel(code) {
    const c = categories.find(x => x.code === code);
    return c ? c.label : code;
  }

  // productCategoryIds — Sprint 13 (Product Management V2: Category
  // Assignment). Đọc categoryIds (mới, nhiều danh mục) nếu có; sản phẩm CŨ
  // chỉ có "category" (1 mã, field cũ VẪN GIỮ NGUYÊN không xóa) thì tự coi
  // như đã "migrate" thành mảng 1 phần tử ngay tại thời điểm đọc — không cần
  // chạy migration ghi hàng loạt vào Firebase, cùng cách pubStatus đã làm ở
  // Sprint 12 Requirement #10 (derive-at-read, backfill dần khi Founder Sửa
  // và Lưu lại sản phẩm đó).
  function productCategoryIds(p) {
    if (Array.isArray(p.categoryIds) && p.categoryIds.length) return p.categoryIds;
    return p.category ? [p.category] : [];
  }

  // catLabelsJoined — hiển thị TẤT CẢ danh mục đã gán (không chỉ 1) ở bảng
  // danh sách sản phẩm. Danh mục đã bị xóa khỏi CategoryDB tự động bỏ qua
  // (catLabel() đã fallback về code nếu không tìm thấy — ở đây lọc hẳn ra
  // khỏi hiển thị để không gây hiểu lầm, đúng "Ignore missing Categories
  // gracefully").
  function catLabelsJoined(p) {
    const ids = productCategoryIds(p);
    const labels = ids.map(id => categories.find(x => x.code === id)).filter(Boolean).map(c => c.label);
    return labels.length ? labels.join(', ') : '—';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // getYoutubeEmbedUrl - cung logic da dung o js/category.js/blog-writer.js/
  // facebook-post-generator.js (xem PROJECT_ARCHITECTURE.md) - lap lai o day
  // vi day la Experience Layer rieng cua trang Product, khong phai AI module.
  function getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  function renderYoutubePreview() {
    const box = document.getElementById('pYoutubePreview');
    if (!box) return;
    const embedUrl = getYoutubeEmbedUrl(document.getElementById('pYoutubeUrl').value);
    if (!embedUrl) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = `<div style="position:relative;padding-top:56.25%;height:0;max-width:360px;border-radius:8px;overflow:hidden"><iframe src="${escapeHtml(embedUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy"></iframe></div>`;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối database')), ms))
    ]);
  }

  // renderCategoryCheckboxes — RULES Sprint 13: chỉ danh mục đang Hoạt động
  // (active !== false, đã lọc ở loadCategories), sắp theo displayOrder (field
  // "order" có sẵn trong CategoryDB — không tạo field trùng lặp mới), hiển
  // thị icon nếu Category có field "icon" (chưa có UI nào ghi field này, chỉ
  // hiển thị NẾU tự có sẵn trong dữ liệu — "if available").
  function renderCategoryCheckboxes(selectedIds) {
    const wrap = document.getElementById('pCategoriesList');
    wrap.innerHTML = categories.map(c => `
      <label>
        <input type="checkbox" value="${escapeHtml(c.code)}" ${selectedIds.includes(c.code) ? 'checked' : ''}>
        ${c.icon ? escapeHtml(c.icon) + ' ' : ''}${escapeHtml(c.label)}
      </label>`).join('') || '<p class="small-muted">Chưa có danh mục nào đang hoạt động.</p>';
  }

  function getCheckedCategoryIds() {
    return Array.from(document.querySelectorAll('#pCategoriesList input[type="checkbox"]:checked')).map(cb => cb.value);
  }

  function loadCategories() {
    return withTimeout(CategoryDB.getAll(), 10000).then(list => {
      categories = list.filter(c => c.active !== false).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      renderCategoryCheckboxes([]);
    });
  }

  function loadProducts(filter) {
    withTimeout(DB.getAll(), 10000).then(list => {
      products = list;
      renderTable(filter || '');
      applyDeepLink();
    }).catch(err => {
      console.error('Không tải được dữ liệu sản phẩm:', err);
      document.getElementById('productTableBody').innerHTML =
        '<tr><td colspan="8" style="color:#c0392b;text-align:center;padding:2rem">Không kết nối được database.</td></tr>';
    });
  }

  // ── Deep link từ Founder Agent V3 (CMS Operator) ────────────────────────────
  // ?edit=<id> — tự mở đúng form Sửa, tái sử dụng NGUYÊN VẸN editProduct() đã
  // có (0 logic mở form mới, "Do NOT duplicate Product logic"). Tuỳ chọn
  // &field=<tên>&value=<giá trị> — tự điền + đánh dấu 1 field (KHÔNG tự Lưu —
  // Founder tự bấm nút Lưu thật, đúng "The Agent never edits database
  // directly... Ask Founder to Save"). deepLinkHandled chặn lặp lại mỗi khi
  // loadProducts() được gọi lại (vd sau khi Founder tự Lưu) — chỉ áp dụng
  // ĐÚNG 1 LẦN lúc tải trang.
  let deepLinkHandled = false;
  const AGENT_FIELD_MAP = { price: 'pPrice', oldprice: 'pOldPrice', name: 'pName', warranty: 'pWarranty', stockstatus: 'pStockStatus', status: 'pStatus', sku: 'pSku' };
  function applyDeepLink() {
    if (deepLinkHandled) return;
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    if (!editId || !products.some(p => p.id === editId)) return;
    deepLinkHandled = true;
    editProduct(editId);
    const field = (params.get('field') || '').toLowerCase();
    const value = params.get('value');
    const fieldElId = AGENT_FIELD_MAP[field];
    if (fieldElId && value !== null) {
      const el = document.getElementById(fieldElId);
      if (el) {
        el.value = value;
        el.classList.add('agent-field-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // rowHtml — 1 dòng sản phẩm (tách riêng khỏi renderTable để dùng lại được
  // trong từng khối Danh mục bên dưới).
  function rowHtml(p) {
    return `
      <tr>
        <td>${p.image ? `<img src="${escapeHtml(p.image)}" onerror="this.style.display='none'">` : '—'}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(catLabelsJoined(p))}</td>
        <td>${p.price ? escapeHtml(p.price) : '<span style="color:var(--muted2)">Liên hệ</span>'}</td>
        <td>${p.status === 'Used' ? 'Qua sử dụng' : 'Mới'}</td>
        <td>${p.stockStatus === 'outofstock' ? '<span style="color:#c0392b;font-weight:600">Hết hàng</span>' : 'Còn hàng'}</td>
        <td>${pubStatusLabel(p.pubStatus)}</td>
        <td>
          <div class="row-actions">
            <button class="link-btn" onclick="AdminApp.editProduct('${p.id}')">Sửa</button>
            <button class="btn-danger" onclick="AdminApp.deleteProduct('${p.id}')">Xóa</button>
          </div>
        </td>
      </tr>`;
  }

  // renderTable — Founder báo "tất cả sản phẩm chung 1 chỗ khó tìm" → nhóm
  // theo Danh mục CHÍNH (categoryIds[0]), mỗi nhóm 1 khối thu gọn/mở rộng
  // (<details>) hiện sẵn số lượng, giữ NGUYÊN cột/hành động Sửa/Xóa cũ. Sản
  // phẩm chưa gán Danh mục vẫn hiện đủ ở khối riêng "Chưa gán Danh mục" (0
  // sản phẩm nào biến mất). Đang gõ tìm kiếm → chỉ khối có kết quả khớp mới
  // hiện + tự mở sẵn, khỏi phải bấm mở từng khối để tìm.
  function renderTable(query) {
    const q = (query || '').toLowerCase();
    const filtered = products.filter(p => !q || (p.name + ' ' + p.brand).toLowerCase().includes(q));
    document.getElementById('productTotal').textContent = products.length;

    const body = document.getElementById('productTableBody');
    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="8" style="color:var(--muted2);text-align:center;padding:2rem">Không có sản phẩm.</td></tr>';
      return;
    }

    const NONE_CODE = '__none__';
    const groups = {};
    filtered.forEach(p => {
      const code = productCategoryIds(p)[0] || NONE_CODE;
      (groups[code] = groups[code] || []).push(p);
    });
    const orderedCodes = categories.map(c => c.code).filter(code => groups[code]);
    if (groups[NONE_CODE]) orderedCodes.push(NONE_CODE);

    body.innerHTML = orderedCodes.map(code => {
      const label = code === NONE_CODE ? 'Chưa gán Danh mục' : catLabel(code);
      const rows = groups[code];
      return `<tr class="admin-cat-group-row"><td colspan="8" style="padding:0;border:none">
        <details class="admin-cat-group"${q ? ' open' : ''}>
          <summary>${escapeHtml(label)} <span class="admin-cat-count">(${rows.length})</span></summary>
          <table class="admin-table admin-table-nested"><tbody>${rows.map(rowHtml).join('')}</tbody></table>
        </details>
      </td></tr>`;
    }).join('');
  }

  // pubStatus mới thêm (Sprint 12 Requirement #10) — 42 sản phẩm thật hiện có
  // đều CHƯA có field này (undefined), phải hiển thị/coi như "Đã xuất bản"
  // (visible công khai) để không gây hiểu lầm là chưa xuất bản — đồng bộ
  // đúng quy tắc backward-compatible ở js/category.js.
  function pubStatusLabel(pubStatus) {
    if (pubStatus === 'draft') return '<span style="color:var(--muted2)">Nháp</span>';
    if (pubStatus === 'hidden') return '<span style="color:#c0392b;font-weight:600">Ẩn</span>';
    return 'Đã xuất bản';
  }

  function setBrandValue(brand) {
    const select = document.getElementById('pBrand');
    const custom = document.getElementById('pBrandCustom');
    const options = Array.from(select.options).map(o => o.value);
    if (brand && options.includes(brand)) {
      select.value = brand;
      custom.style.display = 'none';
      custom.value = '';
    } else {
      select.value = '__other__';
      custom.style.display = 'block';
      custom.value = brand || '';
    }
  }

  function toggleCustomBrand() {
    const select = document.getElementById('pBrand');
    const custom = document.getElementById('pBrandCustom');
    custom.style.display = select.value === '__other__' ? 'block' : 'none';
  }

  function getBrandValue() {
    const select = document.getElementById('pBrand');
    if (select.value === '__other__') return document.getElementById('pBrandCustom').value.trim();
    return select.value;
  }

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById('pId').value = p.id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pSku').value = p.sku || '';
    // pubStatus (Sprint 12 Requirement #10) - san pham that hien co chua co
    // field nay (undefined) - mac dinh hien "published" khi Sua de dung voi
    // trang thai hien tai tren web cong khai (xem js/category.js filter).
    document.getElementById('pPubStatus').value = p.pubStatus || 'published';
    renderCategoryCheckboxes(productCategoryIds(p));
    document.getElementById('pCategoriesError').style.display = 'none';
    document.getElementById('pStatus').value = p.status || 'New';
    document.getElementById('pStockStatus').value = p.stockStatus || 'instock';
    document.getElementById('pWarranty').value = p.warranty || '';
    setBrandValue(p.brand || '');
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pOldPrice').value = p.oldPrice || '';
    document.getElementById('pSpecs').value = p.specs || '';
    document.getElementById('pBadgeText').value = p.badgeText || '';
    document.getElementById('pSpecifications').value = p.specifications || '';
    document.getElementById('pFeatures').value = Array.isArray(p.features) ? p.features.join('\n') : '';
    document.getElementById('pTags').value = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    document.getElementById('pYoutubeUrl').value = p.youtubeUrl || '';
    renderYoutubePreview();
    if (quill) quill.root.innerHTML = p.description || '';
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    document.getElementById('pImages').value = images.join('\n');
    pImagesPicker.refresh();
    document.getElementById('pBgImage').value = p.backgroundImage || '';
    if (pBgImagePicker) pBgImagePicker.refresh();
    // Sync ảnh đại diện đầu tiên vào BgRemover làm ảnh nguồn gợi ý
    if (typeof AdminBgRemover !== 'undefined' && images[0]) {
      AdminBgRemover.setSourceUrl('pBgRemover', images[0]);
    }
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
    ['pName', 'pSku', 'pWarranty', 'pPrice', 'pOldPrice', 'pSpecs', 'pBadgeText', 'pSpecifications', 'pFeatures', 'pTags', 'pImages', 'pYoutubeUrl', 'pBgImage'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderYoutubePreview();
    pImagesPicker.refresh();
    if (pBgImagePicker) pBgImagePicker.refresh();
    if (quill) quill.setText('');
    renderCategoryCheckboxes([]);
    document.getElementById('pCategoriesError').style.display = 'none';
    document.getElementById('pStatus').value = 'New';
    document.getElementById('pStockStatus').value = 'instock';
    // San pham MOI mac dinh la Nhap (chua hien tren web cong khai) - Founder
    // tu chuyen sang "Da xuat ban" khi san sang (dung "Founder Acceptance
    // Test": Saves Draft -> Publishes -> Product appears on website).
    document.getElementById('pPubStatus').value = 'draft';
    setBrandValue('');
    document.getElementById('formTitle').textContent = 'THÊM SẢN PHẨM MỚI';
    document.getElementById('saveBtn').textContent = 'LƯU SẢN PHẨM';
  }

  function saveProduct() {
    const name = document.getElementById('pName').value.trim();
    if (!name) { alert('Vui lòng nhập tên sản phẩm.'); return; }

    // VALIDATION Sprint 13 (Category Assignment): "At least ONE Category
    // must be selected. Do not allow saving without a Category." — chặn
    // Lưu, hiện đúng thông báo yêu cầu, KHÔNG cho phép Lưu sản phẩm không có
    // danh mục nào (khác các field tuỳ chọn khác trong form này).
    const categoryIds = getCheckedCategoryIds();
    const categoriesError = document.getElementById('pCategoriesError');
    if (!categoryIds.length) { categoriesError.style.display = 'block'; document.getElementById('pCategoriesList').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    categoriesError.style.display = 'none';

    // category/categoryLabel (field CŨ) VẪN được ghi — "Do NOT remove
    // existing category field. Remain backward compatible" — lấy danh mục
    // ĐẦU TIÊN trong số đã chọn, để mọi nơi còn đọc field cũ (vd cột "Danh
    // mục" ở nơi khác, dữ liệu export JSON) vẫn có 1 giá trị hợp lệ.
    const category = categoryIds[0];
    const images = document.getElementById('pImages').value.split(/[\n,;]/).map(url => url.trim()).filter(Boolean);
    const data = {
      name,
      sku: document.getElementById('pSku').value.trim(),
      pubStatus: document.getElementById('pPubStatus').value,
      category,
      categoryLabel: catLabel(category),
      categoryIds,
      status: document.getElementById('pStatus').value,
      stockStatus: document.getElementById('pStockStatus').value,
      warranty: document.getElementById('pWarranty').value.trim(),
      brand: getBrandValue(),
      price: document.getElementById('pPrice').value.trim(),
      oldPrice: document.getElementById('pOldPrice').value.trim(),
      specs: document.getElementById('pSpecs').value.trim(),
      badgeText: document.getElementById('pBadgeText').value.trim(),
      specifications: document.getElementById('pSpecifications').value.trim(),
      features: document.getElementById('pFeatures').value.split('\n').map(s => s.trim()).filter(Boolean),
      tags: document.getElementById('pTags').value.split(',').map(s => s.trim()).filter(Boolean),
      youtubeUrl: document.getElementById('pYoutubeUrl').value.trim(),
      backgroundImage: document.getElementById('pBgImage').value.trim(),
      description: quill && quill.getText().trim() ? quill.root.innerHTML : '',
      images: images,
      image: images[0] || ''
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
    AdminAuth.init({ page: 'products', title: 'QUẢN LÝ SẢN PHẨM' }).then(() => {
      loadCategories().then(() => loadProducts());
    });

    pImagesPicker = MediaLibraryPicker.mountMulti('pImages', 'pImagesGrid');
    pBgImagePicker = MediaLibraryPicker.mount('pBgImage', 'pBgImageSlot');

    if (typeof AdminBgRemover !== 'undefined') {
      AdminBgRemover.mount('pBgRemover', {
        label: 'XÓA PHÔNG ẢNH SẢN PHẨM',
        onResult: function (url) {
          document.getElementById('pBgImage').value = url;
          if (pBgImagePicker) pBgImagePicker.refresh();
        }
      });
    }

    if (typeof Quill !== 'undefined') {
      quill = new Quill('#pDescriptionEditor', {
        theme: 'snow',
        placeholder: 'Mô tả đầy đủ hiển thị trong popup chi tiết sản phẩm...',
        modules: {
          toolbar: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['image', 'link'],
            ['clean']
          ]
        }
      });
    }

    let debounce;
    document.getElementById('adminSearch').addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderTable(e.target.value), 150);
    });

    document.getElementById('importFile').addEventListener('change', e => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    document.getElementById('pYoutubeUrl').addEventListener('input', renderYoutubePreview);
  });

  return { editProduct, deleteProduct, saveProduct, resetForm, exportJson, resetToSeed, toggleCustomBrand };
})();
