/*
 * admin-bg-remover.js — Công cụ xóa phông sản phẩm dùng chung
 * Gọi Cloud Function openaiProxy action="remove_background" (GPT-4o Vision +
 * DALL-E 3) → kết quả lưu Firebase Storage → trả URL vĩnh viễn.
 *
 * Tích hợp: AdminBgRemover.mount(containerId, opts)
 *   opts.onResult(url) — callback khi xóa phông xong, nhận URL kết quả
 *   opts.sourceImageUrl — URL ảnh nguồn pre-fill (tùy chọn)
 *   opts.label — tiêu đề panel (mặc định "XÓA PHÔNG ẢNH")
 */
const AdminBgRemover = (function () {
  const PROXY_URL = 'https://us-central1-pshop-music.cloudfunctions.net/openaiProxy';

  // Tạo HTML panel xóa phông và mount vào container
  function mount(containerId, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;

    const label = opts.label || 'XÓA PHÔNG ẢNH';
    container.innerHTML = `
      <div class="bg-remover-panel">
        <p class="bg-remover-heading">${label}</p>
        <div class="bg-remover-row">
          <div class="bg-remover-col">
            <p class="bg-remover-col-label">ẢNH GỐC</p>
            <div class="bg-remover-drop-zone" id="${containerId}_dropZone">
              <input type="file" id="${containerId}_fileInput" accept="image/*" style="display:none">
              <div class="bg-remover-drop-hint" id="${containerId}_dropHint">
                <span>Kéo ảnh vào đây hoặc</span>
                <button type="button" class="link-btn" onclick="document.getElementById('${containerId}_fileInput').click()">chọn file</button>
              </div>
              <div class="bg-remover-preview-wrap" id="${containerId}_srcWrap" style="display:none">
                <img id="${containerId}_srcImg" class="bg-remover-img-fit" alt="Ảnh gốc">
                <button type="button" class="bg-remover-clear-btn" onclick="AdminBgRemover.clearSource('${containerId}')" title="Xóa">✕</button>
              </div>
            </div>
            ${opts.showUrlInput !== false ? `
            <div style="margin-top:0.5rem;display:flex;gap:0.4rem;align-items:center">
              <input type="text" id="${containerId}_urlInput" placeholder="Hoặc dán URL ảnh..." style="flex:1;font-size:0.78rem;padding:0.4rem 0.6rem;background:var(--bg-alt);border:1px solid var(--line2);color:var(--ink)">
              <button type="button" class="btn-secondary" style="padding:0.4rem 0.7rem;font-size:0.72rem" onclick="AdminBgRemover.loadUrl('${containerId}')">DÙNG URL</button>
            </div>` : ''}
          </div>
          <div class="bg-remover-col">
            <p class="bg-remover-col-label">KẾT QUẢ</p>
            <div class="bg-remover-result-wrap" id="${containerId}_resultWrap">
              <div class="bg-remover-result-empty" id="${containerId}_resultEmpty">Kết quả hiện ra đây sau khi xử lý</div>
              <div id="${containerId}_resultImgWrap" style="display:none;position:relative;width:100%;height:100%">
                <img id="${containerId}_resultImg" class="bg-remover-img-fit" alt="Ảnh đã xóa phông">
              </div>
            </div>
          </div>
        </div>
        <div class="admin-actions" style="margin-top:0.75rem;align-items:center">
          <button type="button" class="submit-btn" id="${containerId}_runBtn" onclick="AdminBgRemover.run('${containerId}')">✂ XÓA PHÔNG</button>
          <span id="${containerId}_status" class="status-msg" style="display:none;margin:0"></span>
        </div>
        ${opts.onResult ? `
        <div id="${containerId}_resultActions" style="display:none;margin-top:0.5rem">
          <button type="button" class="btn-secondary" id="${containerId}_useBtn">✔ DÙNG ẢNH NÀY</button>
        </div>` : ''}
      </div>`;

    // Drag & drop
    const dropZone = document.getElementById(containerId + '_dropZone');
    const fileInput = document.getElementById(containerId + '_fileInput');

    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('bg-remover-drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('bg-remover-drag-over');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('bg-remover-drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) _loadFile(containerId, file);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) _loadFile(containerId, fileInput.files[0]);
    });

    // Lưu opts vào container element để dùng lại trong run()
    container._bgRemoverOpts = opts;

    // Pre-fill nếu có sourceImageUrl
    if (opts.sourceImageUrl) {
      _setSourceUrl(containerId, opts.sourceImageUrl);
    }

    // Nút "Dùng ảnh này"
    if (opts.onResult) {
      const useBtn = document.getElementById(containerId + '_useBtn');
      if (useBtn) {
        useBtn.addEventListener('click', function () {
          const url = container._bgRemoverResultUrl;
          if (url) opts.onResult(url);
        });
      }
    }
  }

  // Đọc file → FileReader → set preview src + lưu dataURL
  function _loadFile(containerId, file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      _setSourceDataUrl(containerId, e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function _setSourceDataUrl(containerId, dataUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container._bgRemoverSrcDataUrl = dataUrl;
    container._bgRemoverSrcUrl = null; // dataUrl mode
    const img = document.getElementById(containerId + '_srcImg');
    const wrap = document.getElementById(containerId + '_srcWrap');
    const hint = document.getElementById(containerId + '_dropHint');
    if (img) img.src = dataUrl;
    if (wrap) wrap.style.display = 'flex';
    if (hint) hint.style.display = 'none';
  }

  function _setSourceUrl(containerId, url) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container._bgRemoverSrcUrl = url;
    container._bgRemoverSrcDataUrl = null;
    const img = document.getElementById(containerId + '_srcImg');
    const wrap = document.getElementById(containerId + '_srcWrap');
    const hint = document.getElementById(containerId + '_dropHint');
    const urlInput = document.getElementById(containerId + '_urlInput');
    if (img) img.src = url;
    if (wrap) wrap.style.display = 'flex';
    if (hint) hint.style.display = 'none';
    if (urlInput) urlInput.value = url;
  }

  function clearSource(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container._bgRemoverSrcUrl = null;
    container._bgRemoverSrcDataUrl = null;
    const wrap = document.getElementById(containerId + '_srcWrap');
    const hint = document.getElementById(containerId + '_dropHint');
    const fileInput = document.getElementById(containerId + '_fileInput');
    if (wrap) wrap.style.display = 'none';
    if (hint) hint.style.display = 'flex';
    if (fileInput) fileInput.value = '';
  }

  function loadUrl(containerId) {
    const urlInput = document.getElementById(containerId + '_urlInput');
    const url = urlInput && urlInput.value.trim();
    if (!url) return;
    _setSourceUrl(containerId, url);
  }

  function _setStatus(containerId, msg, isError) {
    const el = document.getElementById(containerId + '_status');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'inline' : 'none';
    el.style.color = isError ? '#c0392b' : 'var(--gold-ink)';
  }

  function _setRunning(containerId, running) {
    const btn = document.getElementById(containerId + '_runBtn');
    if (!btn) return;
    btn.disabled = running;
    btn.textContent = running ? '⏳ Đang xử lý...' : '✂ XÓA PHÔNG';
  }

  // removeBackgroundUrl(imageUrl) -> Promise<string kết quả> — CORE gọi Cloud
  // Function, tách khỏi run() (DOM-heavy) để Founder Agent V5 (SMART
  // BACKGROUND — tự động phát hiện + xóa phông nền trắng trong luồng Tạo sản
  // phẩm) TÁI SỬ DỤNG được đúng 1 lệnh gọi API này, không viết lại/gọi trùng
  // Cloud Function. UI (run()) vẫn là nơi DUY NHẤT thao tác DOM.
  async function removeBackgroundUrl(imageUrl) {
    if (!imageUrl) throw new Error('Thiếu URL ảnh nguồn.');
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Chưa đăng nhập.');
    const token = await user.getIdToken();
    const r = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: 'remove_background', imageUrl })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Lỗi server.');
    return data.imageUrl;
  }

  // editImageUrl — CORE gọi action "edit_image" (Cloud Function, model
  // gpt-image-1 /v1/images/edits) — nhận ẢNH GỐC THẬT + prompt mô tả cần
  // sửa gì (đổi nền/thêm chữ...), trả về 1 ảnh DUY NHẤT đã chỉnh sửa. Dùng
  // cho "Banner sản phẩm" (Founder Agent) — khác removeBackgroundUrl() ở
  // chỗ KHÔNG cố định prompt/transparent, Founder Agent tự soạn prompt theo
  // phong cách + tên sản phẩm.
  async function editImageUrl(imageUrl, prompt, size) {
    if (!imageUrl) throw new Error('Thiếu URL ảnh nguồn.');
    if (!prompt) throw new Error('Thiếu mô tả cần chỉnh sửa.');
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Chưa đăng nhập.');
    const token = await user.getIdToken();
    const r = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: 'edit_image', imageUrl, prompt, size })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Lỗi server.');
    return data.imageUrl;
  }

  async function run(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Upload dataURL lên Storage trước nếu là file local
    let imageUrl = container._bgRemoverSrcUrl;
    const dataUrl = container._bgRemoverSrcDataUrl;

    if (!imageUrl && !dataUrl) {
      _setStatus(containerId, 'Vui lòng chọn ảnh nguồn trước.', true);
      return;
    }

    _setRunning(containerId, true);
    _setStatus(containerId, 'Đang phân tích ảnh...', false);

    try {
      // Nếu là dataUrl (file local) → upload lên Firebase Storage trước
      if (dataUrl && !imageUrl) {
        _setStatus(containerId, 'Đang upload ảnh...', false);
        imageUrl = await _uploadDataUrlToStorage(dataUrl);
      }

      _setStatus(containerId, 'Đang xóa phông (GPT-4o + DALL-E)...', false);
      const resultUrl = await removeBackgroundUrl(imageUrl);
      container._bgRemoverResultUrl = resultUrl;

      // Hiển thị kết quả
      const resultImg = document.getElementById(containerId + '_resultImg');
      const resultImgWrap = document.getElementById(containerId + '_resultImgWrap');
      const resultEmpty = document.getElementById(containerId + '_resultEmpty');
      if (resultImg) resultImg.src = resultUrl;
      if (resultImgWrap) resultImgWrap.style.display = 'block';
      if (resultEmpty) resultEmpty.style.display = 'none';

      const resultActions = document.getElementById(containerId + '_resultActions');
      if (resultActions) resultActions.style.display = 'block';

      _setStatus(containerId, 'Xóa phông hoàn tất.', false);
    } catch (err) {
      _setStatus(containerId, 'Lỗi: ' + err.message, true);
    } finally {
      _setRunning(containerId, false);
    }
  }

  // Upload dataURL lên Firebase Storage (ai-uploads/ folder)
  async function _uploadDataUrlToStorage(dataUrl) {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) throw new Error('dataUrl không hợp lệ.');
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const base64 = match[2];
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeType });

    const path = 'ai-uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
    const storageRef = firebase.storage().ref(path);
    await storageRef.put(blob, { contentType: mimeType });
    return await storageRef.getDownloadURL();
  }

  // Cập nhật ảnh nguồn từ bên ngoài (vd khi Founder chọn ảnh sản phẩm xong)
  function setSourceUrl(containerId, url) {
    _setSourceUrl(containerId, url);
  }

  return { mount, run, clearSource, loadUrl, setSourceUrl, removeBackgroundUrl, editImageUrl };
})();
