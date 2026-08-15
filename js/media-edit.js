/*
 * MediaEdit — EDIT-FIRST workflow cho PSH Media Center.
 *
 * NGuyÊN TẮC (spec Founder 2026-08-12):
 *  - Media Center KHÔNG mặc định "vẽ lại sản phẩm".
 *  - Ưu tiên tuyệt đối: SOURCE IMAGE → EDIT → PREVIEW → APPROVE → SAVE.
 *  - Chỉ GENERATE FROM SCRATCH khi Founder chủ động chọn "Create New".
 *  - AI phải GIỮ NGUYÊN sản phẩm (model/shape/logo/text/color/button/port) —
 *    edit qua /v1/images/edits với source ảnh thật, không redraw.
 *  - Luôn hiển thị cost label ("AI Edit" / "AI Generate") trước thao tác.
 *  - Không ghi đè ảnh gốc: SOURCE → DRAFT(edit result) → PREVIEW → APPROVE.
 *
 * Backend thật (openaiProxy — đã PASS test):
 *  - edit_image        → /v1/images/edits model gpt-image-1, giữ sản phẩm
 *  - remove_background → xóa nền, giữ nguyên sản phẩm
 *  - generate_image    → /v1/images/generations model gpt-image-1 (từ-scratch)
 */
const MediaEdit = (function () {
  'use strict';
  let activeSource = null; // { url, name }
  let activeDraft = null; // { url, op, source }

  const OPENAI_PROXY = 'https://us-central1-pshop-music.cloudfunctions.net/openaiProxy';

  // Cost transparency (spec Founder 2026-08-12): đừng gọi AI nếu action là FREE.
  const FREE_LABEL = 'FREE';
  const AI_EDIT_LABEL = 'AI EDIT · Có phí API';
  const AI_GEN_LABEL = 'AI GENERATE · Có phí API';

  // Preset EDIT: prompt giữ sản phẩm, chỉ xử lý phông/ánh sáng/khung cảnh.
  const PRESETS = {
    'remove-background': {
      label: 'AI Edit · Remove Background',
      cost: 'AI Edit',
      prompt: 'Remove the background completely, keep the main product exactly as it is (same colors, shape, logos, text, details). Do not redraw or alter the product in any way.',
      transparent: true
    },
    'replace-background': {
      label: 'AI Edit · Replace Background (white)',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is (same shape, logos, text, colors, details). Replace only the background with a clean pure-white studio backdrop. Do not redraw or modify the product itself.'
    },
    'clean': {
      label: 'AI Edit · Clean Product Photo',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is. Clean up the photo: remove dust, scratches and blemishes, keep sharp details, logos and text untouched. Do not redraw or change the product.'
    },
    'lighting': {
      label: 'AI Edit · Improve Lighting',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is. Improve the studio lighting: soft even illumination, balanced exposure, natural shadows. Do not redraw, change shape, logos or colors.'
    },
    'shadow': {
      label: 'AI Edit · Add Soft Shadow',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is. Add a subtle, natural drop shadow beneath it on a clean light background. Do not redraw or modify the product itself.'
    },
    'hero': {
      label: 'AI Edit · Product Hero',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is (model, shape, logos, text, colors, ports, physical details). Present it as a premium product hero shot on a clean gradient studio backdrop with professional lighting. Do not redraw or recreate the product.'
    },
    'lifestyle': {
      label: 'AI Edit · Lifestyle Scene',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is (same model, shape, logos, text, colors, details). Place it in a realistic lifestyle scene that matches the product usage. Do not redraw or alter the product itself.'
    },
    'social': {
      label: 'AI Edit · Social Ad',
      cost: 'AI Edit',
      prompt: 'Keep the product exactly as it is (same model, shape, logos, text, colors, details). Create an eye-catching social media advertisement layout on a clean background. Do not redraw or modify the product itself.'
    },
    'custom': {
      label: 'AI Edit · Custom',
      cost: 'AI Edit',
      prompt: null // dùng prompt người dùng nhập
    }
  };

  function $(id) { return document.getElementById(id); }
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function esc(s) { return escapeHtml(s); }

  function getToken() {
    // Lấy Firebase ID token hiện tại từ auth-context (đã init trong page)
    if (typeof AuthContext !== 'undefined' && typeof AuthContext.getCurrentUser === 'function') {
      var u = AuthContext.getCurrentUser();
      if (u && typeof u.getIdToken === 'function') return u.getIdToken();
      if (u && u.auth && typeof u.auth.getIdToken === 'function') return u.auth.getIdToken();
    }
    // Fallback: firebase.auth() global
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return firebase.auth().currentUser.getIdToken();
    }
    return Promise.reject(new Error('Chưa đăng nhập — không lấy được token.'));
  }

  function proxyCall(action, body) {
    return getToken().then(function (idToken) {
      return fetch(OPENAI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify(Object.assign({ action: action }, body))
      }).then(function (r) { return r.json().then(function (b) { return { status: r.status, data: b }; }); });
    });
  }

  function setStatus(msg, isError) {
    var el = $('meStatus');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
    el.style.color = isError ? '#b3261e' : '#374151';
    el.style.background = isError ? '#fdecea' : '#f5f6f8';
  }

  function setPreview(url, label) {
    var img = $('mePreviewImg');
    var info = $('mePreviewInfo');
    if (img) { img.onload = function () { img.style.display = 'block'; }; img.src = url; img.style.display = 'block'; }
    if (info) info.textContent = label || (url ? url.slice(0, 80) : '');
  }

  /* ================= Source selection ================= */
  function pickFromLibrary(event) {
    // event.currentTarget dataset.url
    var url = event.currentTarget.getAttribute('data-url');
    var name = event.currentTarget.getAttribute('data-name') || 'Source';
    activeSource = { url: url, name: name };
    setPreview(url, 'SOURCE: ' + name);
    setStatus('Nguồn đã chọn: ' + name + '. Chọn thao tác EDIT bên dưới (giữ nguyên sản phẩm).');
    $('meEditBtn') && ($('meEditBtn').disabled = false);
    $('meRemoveBgBtn') && ($('meRemoveBgBtn').disabled = false);
    $('meSourceName') && ($('meSourceName').textContent = name);
    // Tab "② Chỉnh sửa" ship disabled trong HTML (chưa có nguồn thì chưa cho
    // vào) nhưng không nơi nào tự mở khoá lại sau khi chọn nguồn — khoá vĩnh
    // viễn, không click được (Founder báo lỗi live 2026-08-14).
    $('meTabEdit') && ($('meTabEdit').disabled = false);
  }

  function loadLibrary() {
    var grid = $('meLibraryGrid');
    if (!grid) return;
    if (typeof MediaLibrary === 'undefined' || typeof MediaLibrary.list !== 'function') { grid.innerHTML = '<p class="mc-note">Media Library engine chưa sẵn sàng.</p>'; return; }
    grid.innerHTML = '<p class="mc-note">Đang quét Media Library...</p>';
    // FIX (Founder 2026-08-13): MediaLibrary KHÔNG có hàm listFiles() — chỉ
    // export { list, upload, remove, rename, kindOf }. Gọi listFiles() =
    // "MediaLibrary.listFiles is not a function" -> kẹt "Đang quét..." mãi,
    // không render thẻ ảnh để click chọn nguồn. Dùng đúng list().
    MediaLibrary.list().then(function (items) {
      var list = (items || []).slice(0, 60);
      if (!list.length) { grid.innerHTML = '<p class="mc-note">Chưa có media. Upload hoặc Generate trước.</p>'; return; }
      grid.innerHTML = list.map(function (it) {
        var url = it.url || it.downloadURL || '';
        return '<div class="me-lib-item" data-url="' + esc(url) + '" data-name="' + esc(it.name || '') + '">' +
          '<img src="' + esc(url) + '" onerror="this.style.display=\'none\'"><div class="n">' + esc(it.name || '') + '</div></div>';
      }).join('');
      grid.querySelectorAll('.me-lib-item').forEach(function (el) {
        el.addEventListener('click', pickFromLibrary);
      });
    }).catch(function (e) { grid.innerHTML = '<p class="mc-note">Lỗi quét media: ' + esc(e.message) + '</p>'; });
  }

  function pickUpload(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setStatus('Chỉ chấp nhận ảnh.', true); return; }
    setStatus('Đang upload ảnh nguồn lên Storage...');
    var reader = new FileReader();
    reader.onload = function (ev) {
      // Upload qua storage-upload module nếu có, ngược lại dùng firebase storage trực tiếp
      var uploadFn = (typeof StorageUpload !== 'undefined' && typeof StorageUpload.uploadFile === 'function')
        ? StorageUpload.uploadFile(file, 'media-center/source')
        : firebase.storage().ref('media-center/source/' + Date.now() + '-' + file.name).put(file);
      var uploadedRef = null;
      Promise.resolve(uploadFn).then(function (snap) {
        var ref = snap.ref || (snap && snap.ref);
        uploadedRef = ref; // giữ lại để đăng ký fullPath thật vào Media Index
        return ref.getDownloadURL();
      }).then(function (url) {
        activeSource = { url: url, name: file.name };
        setPreview(url, 'SOURCE (uploaded): ' + file.name);
        setStatus('Đã upload nguồn: ' + file.name + '. Chọn EDIT bên dưới.');
        $('meEditBtn') && ($('meEditBtn').disabled = false);
        $('meRemoveBgBtn') && ($('meRemoveBgBtn').disabled = false);
        $('meSourceName') && ($('meSourceName').textContent = file.name);
        $('meTabEdit') && ($('meTabEdit').disabled = false);
        // Ảnh vừa upload đã nằm trong Storage nhưng lưới meLibraryGrid chỉ
        // render 1 lần lúc init() — không refresh sau upload sẽ vẫn hiện
        // "Chưa có media" cũ, ảnh mới không click chọn lại được. Refresh
        // ngay sau khi upload xong.
        //
        // Đăng ký fullPath thật vào Media Index TRƯỚC khi refresh — Storage
        // listAll() đang 403 trên Production nên Thư viện dựng danh sách từ
        // index này (xem js/media-library.js); refresh trước khi ghi xong sẽ
        // không thấy ảnh vừa tải lên.
        var recorded = (uploadedRef && typeof MediaLibrary !== 'undefined' && MediaLibrary.recordUpload)
          ? MediaLibrary.recordUpload(uploadedRef.fullPath, { contentType: file.type, size: file.size })
          : Promise.resolve(null);
        return recorded.then(function () { loadLibrary(); });
      }).catch(function (e) { setStatus('Upload lỗi: ' + e.message, true); });
    };
    reader.readAsDataURL(file);
  }

  function urlSource() {
    var url = $('meSourceUrl').value.trim();
    if (!url) { setStatus('Nhập URL ảnh nguồn trước.', true); return; }
    // Cho phép bất kỳ ảnh trực tuyến; backend edit_image sẽ validate (SSRF guard)
    // và tải ảnh hợp lệ. Xác minh nhanh ảnh có tải được không.
    var probe = new Image();
    probe.onload = function () {
      activeSource = { url: url, name: url.slice(0, 60) };
      setPreview(url, 'SOURCE (internet): ' + url.slice(0, 60));
      setStatus('Đã thêm ảnh nguồn từ URL. Chọn EDIT bên dưới.');
      $('meEditBtn') && ($('meEditBtn').disabled = false);
      $('meRemoveBgBtn') && ($('meRemoveBgBtn').disabled = false);
      $('meTabEdit') && ($('meTabEdit').disabled = false);
      // pickFromLibrary()/pickUpload() cả 2 đều cập nhật nhãn "NGUỒN" trong
      // tab Chỉnh sửa — urlSource() thiếu dòng này, nên sau khi thêm nguồn từ
      // URL, nhãn NGUỒN vẫn hiện tên nguồn CŨ (hoặc "(chưa chọn)").
      $('meSourceName') && ($('meSourceName').textContent = activeSource.name);
    };
    probe.onerror = function () { setStatus('Không tải được ảnh từ URL — kiểm tra link.', true); };
    probe.src = url;
  }

  /* ================= EDIT execution ================= */
  function doEdit(presetKey) {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước khi Edit.', true); return; }
    var p = PRESETS[presetKey];
    if (!p) { setStatus('Preset không hợp lệ.', true); return; }
    var prompt = p.prompt;
    if (presetKey === 'custom') {
      var cp = $('meCustomPrompt') && $('meCustomPrompt').value.trim();
      if (!cp) { setStatus('Nhập prompt chỉnh sửa (custom) trước.', true); return; }
      prompt = 'Keep the product exactly as it is (same model, shape, logos, text, colors, details). ' + cp + ' Do not redraw or recreate the product.';
    }
    var size = ($('meEditSize') && $('meEditSize').value) || '1:1';
    setStatus('Đang thực hiện: ' + p.label + ' (Ảnh nguồn được giữ nguyên, chỉ xử lý phông/ánh sáng)...');
    var body = { imageUrl: activeSource.url, prompt: prompt, size: size };
    if (p.transparent) body.transparent = true;
    var hist = { sourceAsset: activeSource.name, operation: 'EDIT', provider: 'OpenAI', model: 'gpt-image-1', quality: (($('meQuality') && $('meQuality').value) || suggestedQuality('edit', ($('meGenType') && $('meGenType').value), true)), status: 'PROCESSING' };
    recordHistory(hist);
    return proxyCall('edit_image', body).then(function (res) {
      if (res.data.imageUrl) {
        hist.outputAsset = res.data.imageUrl; hist.status = 'COMPLETED'; hist.cost = null; // N/A cho tới khi provider trả cost chính xác
        recordHistory(hist); renderHistory();
        setStatus('✅ ' + p.label + ' xong. Xem DRAFT bên dưới — Approve để lưu (không ghi đè nguồn).');
        setPreview(res.data.imageUrl, 'DRAFT: ' + p.label);
        $('meApproveBtn') && ($('meApproveBtn').disabled = false);
        $('meDiscardBtn') && ($('meDiscardBtn').disabled = false);
        $('meOpsLabel') && ($('meOpsLabel').textContent = p.cost);
        // lưu draft URL để approve/discard
        activeDraft = { url: res.data.imageUrl, op: p.cost, source: activeSource.name };
      } else {
        setStatus('Edit thất bại: ' + JSON.stringify(res.data), true);
      }
    }).catch(function (e) { setStatus('Lỗi khi gọi edit: ' + e.message, true); });
  }

  function removeBg() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước.', true); return; }
    setStatus('AI Edit · Remove Background — giữ nguyên sản phẩm...');
    var hist = { sourceAsset: activeSource.name, operation: 'REMOVE_BACKGROUND', provider: 'OpenAI', model: 'gpt-image-1', quality: 'MEDIUM', status: 'PROCESSING' };
    recordHistory(hist);
    proxyCall('remove_background', { imageUrl: activeSource.url }).then(function (res) {
      if (res.data.imageUrl) {
        hist.outputAsset = res.data.imageUrl; hist.status = 'COMPLETED'; recordHistory(hist);
        setStatus('✅ Remove Background xong. Xem DRAFT — Approve để lưu.');
        setPreview(res.data.imageUrl, 'DRAFT: Remove Background');
        // doEdit() gán activeDraft trước khi enable Approve — removeBg() thiếu
        // dòng này (Founder báo live 2026-08-14: bấm Approve báo "Chưa có
        // draft để lưu" dù Remove Background đã chạy xong thành công) khiến
        // Approve luôn thất bại dù nút không hề bị disable.
        activeDraft = { url: res.data.imageUrl, op: 'AI Edit', source: activeSource.name };
        $('meApproveBtn') && ($('meApproveBtn').disabled = false);
        $('meDiscardBtn') && ($('meDiscardBtn').disabled = false);
        $('meOpsLabel') && ($('meOpsLabel').textContent = 'AI Edit');
        renderHistory();
      } else { hist.status = 'FAILED'; hist.error = JSON.stringify(res.data); recordHistory(hist); renderHistory(); setStatus('Remove background thất bại: ' + JSON.stringify(res.data), true); }
    }).catch(function (e) { hist.status = 'FAILED'; hist.error = e.message; recordHistory(hist); renderHistory(); setStatus('Lỗi: ' + e.message, true); });
  }

  // approve: xác nhận ảnh đã chỉnh (edit_image/remove_background đã lưu vào Firebase
  // Storage thật qua openaiProxy). MediaLibrary KHÔNG có addAsset() — chỉ export
  // { list, upload, remove, rename, kindOf, recordUpload, pathFromDownloadURL }.
  // Ảnh draft đã là URL Storage công khai, nhưng Cloud Function ghi thẳng qua
  // Admin SDK KHÔNG tự đăng ký vào Media Index — và Storage listAll() đang 403
  // trên Production (xem js/media-library.js) nên Thư viện CHỈ dựng được từ
  // Media Index. Approve mà không ghi index thì ảnh vừa lưu KHÔNG BAO GIỜ hiện
  // lại trong Library dù đã nằm thật trong Storage (Founder báo lỗi live
  // 2026-08-14, xác nhận qua E2E: Library vẫn còn đúng 1 item sau Approve).
  // KHÔNG ghi đè ảnh gốc.
  // dataUriToFile — draft của thao tác FREE là 1 data: URI trong bộ nhớ trình
  // duyệt, CHƯA hề nằm trên Storage. Đổi về File để tải lên thật.
  function dataUriToFile(dataUri, name) {
    return fetch(dataUri).then(function (r) { return r.blob(); }).then(function (blob) {
      return new File([blob], name, { type: blob.type || 'image/png' });
    });
  }

  function approveDraft() {
    if (!activeDraft) { setStatus('Chưa có draft để lưu.', true); return; }
    var url = activeDraft.url;
    var srcName = (activeDraft.source || 'source');
    setStatus('Đang lưu ảnh vào Media Library...');
    return Promise.resolve().then(function () {
      // Thao tác FREE (canvas cục bộ) tạo data: URI — chưa có gì trên Storage.
      // Trước đây Approve chỉ đổi chữ trạng thái thành "đã lưu trong Storage"
      // rồi reload Library: ảnh KHÔNG BAO GIỜ được lưu thật, và câu thông báo
      // đó là báo thành công sai sự thật. Giờ tải lên thật qua đúng
      // MediaLibrary.upload() (tự ghi Media Index luôn) rồi mới báo xong.
      if (/^data:/.test(String(url))) {
        var ext = (/^data:image\/(\w+)/.exec(url) || [])[1] || 'png';
        var fname = String(srcName).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') + '-edited.' + ext;
        return dataUriToFile(url, fname).then(function (file) {
          return MediaLibrary.upload(file);
        });
      }
      // Ảnh do Cloud Function sinh ra (AI Edit/Remove Background) đã nằm thật
      // trên Storage nhưng Admin SDK không tự đăng ký vào Media Index, mà
      // Storage listAll() đang 403 trên Production (xem js/media-library.js)
      // nên Thư viện CHỈ dựng được từ index — không ghi index thì ảnh vừa
      // Approve không bao giờ hiện lại dù đã lưu thật.
      var fullPath = (typeof MediaLibrary !== 'undefined' && MediaLibrary.pathFromDownloadURL)
        ? MediaLibrary.pathFromDownloadURL(url) : null;
      return (fullPath && MediaLibrary.recordUpload)
        ? MediaLibrary.recordUpload(fullPath, {})
        : null;
    }).then(function () {
      setStatus('✅ Đã Approve ảnh (' + srcName + ') — ảnh đã lưu vào Media Library, ảnh gốc KHÔNG bị ghi đè.');
      $('meApproveBtn') && ($('meApproveBtn').disabled = true);
      $('meDiscardBtn') && ($('meDiscardBtn').disabled = true);
      return loadLibrary();
    }).catch(function (e) { setStatus('Lưu lỗi: ' + e.message, true); });
  }

  function discardDraft() {
    activeDraft = null;
    if ($('meApproveBtn')) $('meApproveBtn').disabled = true;
    if ($('meDiscardBtn')) $('meDiscardBtn').disabled = true;
    setStatus('Đã bỏ draft. Nguồn được giữ nguyên.');
    // hiển thị lại source
    if (activeSource) setPreview(activeSource.url, 'SOURCE: ' + activeSource.name);
  }

  /* ================= Generate (action riêng, cảnh báo cost) ================= */
  function generateNew() {
    var p = $('meGenProduct') && $('meGenProduct').value;
    var prompt = $('meGenPrompt') && $('meGenPrompt').value.trim();
    if (!prompt && !p) { setStatus('Chọn sản phẩm HOẶC nhập prompt để Generate.', true); return; }
    if (!confirm('Generate New creates a new image and consumes an image generation request. Tiếp tục?')) return;
    setStatus('AI Generate · đang tạo ảnh mới từ-scratch (qua engine AdminImageAI)...');
    // AdminImageAI KHÔNG export runGeneration() (chỉ export { init, regenerate,
    // deleteDraft, saveToProductGallery, saveAsFeatured, saveToBlogCover,
    // insertIntoBlog, saveAsBanner }) — điều kiện `typeof AdminImageAI.runGeneration
    // === 'function'` dưới đây LUÔN false, nên nút "GENERATE NEW IMAGE" ở tab
    // "✦ Generate New" chưa từng thực sự tạo ảnh, chỉ hiện thông báo trỏ sang
    // nơi khác (Founder báo live 2026-08-15). Đúng nguyên tắc Reuse: đồng bộ
    // field vào ĐÚNG form DOM ids mà buildInputParamsFromForm() đọc rồi bấm
    // THẬT nút #imgGenerateBtn (đã wire đúng generate()→runGeneration() nội bộ
    // ở Generate Studio bên dưới) — không tự viết lại logic gọi AI.
    var imgType = document.getElementById('imgType');
    var imgProduct = document.getElementById('imgProduct');
    var imgCustomPrompt = document.getElementById('imgCustomPrompt');
    var imgSize = document.getElementById('imgSize');
    var imgGenerateBtn = document.getElementById('imgGenerateBtn');
    if (imgGenerateBtn && imgType && imgProduct && imgCustomPrompt && imgSize) {
      imgType.value = ($('meGenType') && $('meGenType').value) || 'Product Hero Image';
      imgProduct.value = p || '';
      imgCustomPrompt.value = prompt || '';
      imgSize.value = ($('meGenSize') && $('meGenSize').value) || '1:1';
      var hist = { sourceAsset: p || (prompt ? 'prompt:' + prompt.slice(0, 30) : 'new'), operation: 'GENERATE', provider: 'OpenAI', model: 'gpt-image-1', quality: (($('meQuality') && $('meQuality').value) || suggestedQuality('generate', ($('meGenType') && $('meGenType').value), false)), status: 'PROCESSING' };
      recordHistory(hist);
      renderHistory();
      imgGenerateBtn.click();
    } else {
      setStatus('Generate từ-scratch được xử lý tại tab Image Studio chính.');
    }
  }

  function loadGenProducts() {
    var sel = $('meGenProduct');
    if (!sel) return;
    if (typeof DB !== 'undefined' && typeof DB.getAll === 'function') {
      DB.getAll().then(function (list) {
        sel.innerHTML = '<option value="">(không chọn)</option>' + list.map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>';
        }).join('');
      }).catch(function () {});
    }
  }

  /* ================= FREE operations (canvas, KHÔNG gọi OpenAI) ================= */
  // Tất cả đều xử lý ảnh nguồn cục bộ, tạo DRAFT mới (dataURI) — không gọi API, miễn phí.
  // loadImageEl(src) -> Promise<HTMLImageElement> đọc được pixel (không bị
  // canvas "tainted").
  //
  // Thử TRỰC TIẾP trước (crossOrigin='anonymous'): nhanh nhất, không tốn 1
  // lượt gọi server, và tự khôi phục nguyên vẹn nếu sau này bucket Storage
  // được đặt CORS thật (`gsutil cors set`) — lúc đó không cần sửa lại file này.
  // Chỉ khi trình duyệt từ chối mới lùi về proxy bytes qua Cloud Function
  // (action `fetch_image_data`, FREE — không gọi OpenAI); xem functions/index.js
  // để biết vì sao Storage GET hiện không trả Access-Control-Allow-Origin.
  function rawLoad(src, useCors) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('Không đọc được ảnh nguồn.')); };
      if (useCors) im.crossOrigin = 'anonymous';
      im.src = src;
    });
  }

  function loadImageEl(src) {
    return rawLoad(src, true).catch(function () {
      // Ảnh đã là data:/blob: mà vẫn lỗi thì proxy cũng không cứu được.
      if (/^(data:|blob:)/.test(String(src || ''))) throw new Error('Không đọc được ảnh nguồn.');
      return proxyCall('fetch_image_data', { imageUrl: src }).then(function (res) {
        if (!res.data || !res.data.dataUri) {
          throw new Error((res.data && res.data.error) || 'Không đọc được ảnh nguồn.');
        }
        return rawLoad(res.data.dataUri, false);
      });
    });
  }

  function canvasToDraft(canvas, mime, quality) {
    var dataUrl = canvas.toDataURL(mime || 'image/png', quality == null ? 0.9 : quality);
    activeDraft = { url: dataUrl, op: 'FREE', source: (activeSource && activeSource.name) || 'source', free: true };
    setPreview(dataUrl, 'DRAFT (FREE — không gọi AI)');
    setStatus('✅ Thao tác FREE đã xong (canvas cục bộ, KHÔNG gọi OpenAI). Approve để lưu.');
    if ($('meApproveBtn')) $('meApproveBtn').disabled = false;
    if ($('meDiscardBtn')) $('meDiscardBtn').disabled = false;
    return dataUrl;
  }

  function freeRotate() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var c = document.createElement('canvas');
      c.width = im.naturalHeight; c.height = im.naturalWidth;
      var ctx = c.getContext('2d');
      ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
      canvasToDraft(c, 'image/png');
    }).catch(function (e) { setStatus('FREE rotate lỗi: ' + e.message, true); });
  }

  function freeResize() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth / 2); c.height = Math.round(im.naturalHeight / 2);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      canvasToDraft(c, 'image/png');
    }).catch(function (e) { setStatus('FREE resize lỗi: ' + e.message, true); });
  }

  function freeCropSquare() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var s = Math.min(im.naturalWidth, im.naturalHeight);
      var c = document.createElement('canvas');
      c.width = s; c.height = s;
      c.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, s, s);
      canvasToDraft(c, 'image/png');
    }).catch(function (e) { setStatus('FREE crop lỗi: ' + e.message, true); });
  }

  function freeCompress() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var max = 1000;
      var w = im.naturalWidth, h = im.naturalHeight;
      if (Math.max(w, h) > max) { var k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      canvasToDraft(c, 'image/jpeg', 0.7);
    }).catch(function (e) { setStatus('FREE compress lỗi: ' + e.message, true); });
  }

  function freeConvert(mime) {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      canvasToDraft(c, mime);
    }).catch(function (e) { setStatus('FREE convert lỗi: ' + e.message, true); });
  }

  // freeChangeBackground(color) — FREE, xử lý canvas cục bộ, KHÔNG gọi AI.
  // Tô 1 nền màu đặc rồi vẽ ảnh nguồn đè lên trên (giữ nguyên alpha). Chỉ THẬT
  // SỰ đổi màu nền nhìn thấy được khi ảnh nguồn đã có vùng trong suốt (vd
  // ảnh vừa qua "Remove Background" — AI, có phí) — với ảnh còn nền đặc (ảnh
  // chụp sản phẩm gốc), thao tác này không tách được nền cũ ra (tách nền cần
  // AI, đúng ranh giới FREE=canvas / AI=OpenAI của toàn bộ Media Center).
  function freeChangeBackground(color) {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    return loadImageEl(activeSource.url).then(function (im) {
      var c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      var ctx = c.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0);
      canvasToDraft(c, 'image/png');
    }).catch(function (e) { setStatus('FREE đổi nền lỗi: ' + e.message, true); });
  }

  // drawCover(ctx, img, w, h) — vẽ img phủ kín khung w×h, giữ nguyên tỉ lệ
  // (cắt bớt phần thừa thay vì méo hình) — cùng logic CSS background-size:cover.
  function drawCover(ctx, img, w, h) {
    var ir = img.naturalWidth / img.naturalHeight;
    var cr = w / h;
    var sw, sh, sx, sy;
    if (ir > cr) { sh = img.naturalHeight; sw = sh * cr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else { sw = img.naturalWidth; sh = sw / cr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  }

  var freeBgImageFile = null;

  function pickFreeBgImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setStatus('Chỉ chấp nhận ảnh làm nền.', true); return; }
    freeBgImageFile = file;
    var reader = new FileReader();
    reader.onload = function (ev) {
      $('meFreeBgPreviewImg') && ($('meFreeBgPreviewImg').src = ev.target.result);
      $('meFreeBgPreviewName') && ($('meFreeBgPreviewName').textContent = file.name);
      var card = $('meFreeBgPreviewCard');
      if (card) card.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }

  // freeChangeBackgroundImage() — FREE, canvas cục bộ, KHÔNG gọi AI. Ảnh nền
  // tự phóng/cắt "cover" vừa khung theo đúng kích thước ảnh nguồn (không méo),
  // ảnh sản phẩm canh giữa vẽ đè lên trên — cùng giới hạn với đổi nền màu:
  // chỉ ghép đẹp thấy rõ khi ảnh nguồn đã trong suốt.
  function freeChangeBackgroundImage() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    if (!freeBgImageFile) { setStatus('Chọn ảnh nền từ máy tính trước.', true); return; }
    var reader = new FileReader();
    var readBg = new Promise(function (resolve, reject) {
      reader.onload = function (ev) { resolve(ev.target.result); };
      reader.onerror = function () { reject(new Error('Không đọc được ảnh nền.')); };
      reader.readAsDataURL(freeBgImageFile);
    });
    return Promise.all([loadImageEl(activeSource.url), readBg.then(loadImageEl)])
      .then(function (imgs) {
        var product = imgs[0], bg = imgs[1];
        var c = document.createElement('canvas');
        c.width = product.naturalWidth; c.height = product.naturalHeight;
        var ctx = c.getContext('2d');
        drawCover(ctx, bg, c.width, c.height);
        ctx.drawImage(product, 0, 0);
        canvasToDraft(c, 'image/png');
      }).catch(function (e) { setStatus('FREE ghép nền lỗi: ' + e.message, true); });
  }

  // freeInsertText() — FREE, canvas cục bộ, KHÔNG gọi AI. Vẽ chữ (đầy đủ dấu
  // tiếng Việt) lên ảnh nguồn bằng 1 trong 6 font Google Fonts đã nạp sẵn
  // trong <head> (đều có bộ ký tự tiếng Việt chuẩn, không phải font chọn đại
  // rồi vỡ dấu — xem psh/platform/media-center/index.html).
  //
  // ensureFontsLoaded(): canvas.fillText() dùng font hiện có trong bộ nhớ
  // trình duyệt TẠI THỜI ĐIỂM gọi — nếu font web vừa khai báo trong CSS
  // nhưng CHƯA tải xong, canvas âm thầm vẽ bằng font hệ thống mặc định thay
  // vào (không lỗi, không cảnh báo, chỉ ra SAI font). Dùng CSS Font Loading
  // API để tải xong font trước khi vẽ, truyền đúng `text` cần vẽ để trình
  // duyệt tải đúng phần ký tự (kể cả dấu tiếng Việt) của font đó.
  function ensureFontsLoaded(fontFamily, text) {
    if (!(document.fonts && document.fonts.load)) return Promise.resolve();
    return document.fonts.load('700 48px ' + fontFamily, text).catch(function () {})
      .then(function () { return document.fonts.ready; });
  }

  function freeInsertText() {
    if (!activeSource) { setStatus('Chọn ảnh nguồn trước — FREE.', true); return; }
    var text = (($('meTextContent') && $('meTextContent').value) || '').trim();
    if (!text) { setStatus('Nhập chữ cần chèn trước.', true); return; }
    var fontFamily = ($('meTextFont') && $('meTextFont').value) || 'Inter,sans-serif';
    var fontSize = parseInt(($('meTextSize') && $('meTextSize').value) || '44', 10);
    var color = ($('meTextColor') && $('meTextColor').value) || '#ffffff';
    var pos = ($('meTextPos') && $('meTextPos').value) || 'middle-center';
    var withShadow = !!($('meTextShadow') && $('meTextShadow').checked);
    return ensureFontsLoaded(fontFamily, text).then(function () {
      return loadImageEl(activeSource.url);
    }).then(function (im) {
      var c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      var ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0);
      // Cỡ chữ trong UI là cho ảnh ~1000px chiều ngang — co giãn theo đúng
      // kích thước ảnh nguồn thật để chữ không quá nhỏ/quá to bất thường.
      var scaledSize = Math.max(12, Math.round(fontSize * (c.width / 1000)));
      ctx.font = '700 ' + scaledSize + 'px ' + fontFamily;
      ctx.fillStyle = color;
      if (withShadow) {
        ctx.shadowColor = 'rgba(0,0,0,.6)';
        ctx.shadowBlur = scaledSize * 0.15;
        ctx.shadowOffsetY = scaledSize * 0.05;
      }
      var pad = Math.round(c.width * 0.04);
      var lines = text.split('\n');
      var lineHeight = scaledSize * 1.3;
      var vAlign = pos.indexOf('top') === 0 ? 'top' : (pos.indexOf('bottom') === 0 ? 'bottom' : 'middle');
      var hAlign = pos.indexOf('left') >= 0 ? 'left' : (pos.indexOf('right') >= 0 ? 'right' : 'center');
      ctx.textAlign = hAlign;
      var x = hAlign === 'left' ? pad : (hAlign === 'right' ? c.width - pad : c.width / 2);
      var startY;
      if (vAlign === 'top') { ctx.textBaseline = 'top'; startY = pad; }
      else if (vAlign === 'bottom') { ctx.textBaseline = 'bottom'; startY = c.height - pad - lineHeight * (lines.length - 1); }
      else { ctx.textBaseline = 'middle'; startY = c.height / 2 - lineHeight * (lines.length - 1) / 2; }
      lines.forEach(function (line, i) { ctx.fillText(line, x, startY + i * lineHeight); });
      canvasToDraft(c, 'image/png');
    }).catch(function (e) { setStatus('FREE chèn chữ lỗi: ' + e.message, true); });
  }

  /* ================= PROMPT OPTIMIZER (rule-based, FREE — không gọi AI) ================= */
  // Chuyển câu tự nhiên thành instruction có cấu trúc. KHÔNG gọi OpenAI.
  const STYLE_TAGS = {
    'white': 'white background', 'trắng': 'white background', 'nền trắng': 'white background',
    'studio': 'studio lighting', 'studio đẹp': 'studio lighting', 'ánh sáng studio': 'studio lighting',
    'premium': 'premium look', 'cao cấp': 'premium look',
    'lifestyle': 'lifestyle scene', 'đời thực': 'lifestyle scene',
    'hero': 'product hero shot',
    'social': 'social ad', 'quảng cáo': 'social ad',
    'shadow': 'soft shadow', 'đổ bóng': 'soft shadow', 'bóng': 'soft shadow'
  };
  function detect(prompt) {
    var t = (prompt || '').toLowerCase();
    var tags = [];
    if (/nền trắng|nên trắng|background.*white|white.*background|bỏ nền/.test(t)) tags.push('background:white');
    else if (/nền bàn|background/.test(t)) tags.push('background:clean');
    if (/studio|ánh sáng|lighting|đẹp/.test(t)) tags.push('lighting:studio');
    if (/cao cấp|premium|sang/.test(t)) tags.push('style:premium');
    if (/lifestyle|đời thực|scene/.test(t)) tags.push('composition:lifestyle');
    if (/bóng|shadow/.test(t)) tags.push('lighting:soft-shadow');
    if (/hero/.test(t)) tags.push('composition:hero');
    if (/quảng cáo|social|ad/.test(t)) tags.push('composition:social-ad');
    if (/giữ nguyên|keep.*product|same|không.*vẽ/.test(t)) tags.push('constraint:keep-product-identical');
    if (/clean|sạch|lau/.test(t)) tags.push('operation:clean');
    return tags;
  }
  function optimizePrompt(raw) {
    var subject = '';
    if (activeSource) subject = 'SOURCE IMAGE (giữ nguyên sản phẩm/SOURCE): ' + (activeSource.name || 'source');
    else subject = 'SUBJECT: sản phẩm (mô tả bên dưới)';
    var tags = detect(raw);
    var structured = [
      subject,
      'OPERATION: ' + (tags.some(function (x) { return x.indexOf('operation:') === 0; }) ? 'làm sạch/nâng cấp ảnh' : 'edit ảnh sản phẩm'),
      'BACKGROUND: ' + (tags.some(function (x) { return x === 'background:white'; }) ? 'trắng tinh, studio' : (tags.some(function (x) { return x === 'background:clean'; }) ? 'sạch, không lộn xộn' : 'giữ nguyên nền hiện tại hoặc nền sạch')),
      'LIGHTING: ' + (tags.some(function (x) { return x.indexOf('lighting') === 0; }) ? 'studio mềm đều' : 'tự nhiên'),
      'COMPOSITION: ' + (tags.some(function (x) { return x === 'composition:hero'; }) ? 'hero, sản phẩm nổi bật' : (tags.some(function (x) { return x === 'composition:lifestyle'; }) ? 'lifestyle, ngữ cảnh sử dụng' : (tags.some(function (x) { return x === 'composition:social-ad'; }) ? 'layout quảng cáo social' : 'trung tâm khung hình'))),
      'STYLE: ' + (tags.some(function (x) { return x === 'style:premium'; }) ? 'cao cấp, chuyên nghiệp' : 'chân thực, thương mại'),
      'OUTPUT: 1 ảnh PNG rõ nét, sản phẩm sắc nét',
      'CONSTRAINTS: ' + (tags.some(function (x) { return x === 'constraint:keep-product-identical'; }) ? 'GIỮ NGUYÊN sản phẩm (model/logo/chữ/màu/nút/cổng/chi tiết) — KHÔNG vẽ lại.' : 'GIỮ NGUYÊN sản phẩm (model/logo/chữ/màu/chi tiết) — KHÔNG redraw.')
    ];
    return structured.join('\n');
  }

  /* ================= VOICE INPUT (Web Speech API, FREE — không gọi backend) ================= */
  let recognition = null;
  let listening = false;
  function toggleVoice(targetInputId) {
    var wsr = (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!wsr) { setStatus('Trình duyệt không hỗ trợ nhận dạng giọng nói — gõ tay.', true); return; }
    if (listening) { if (recognition) recognition.stop(); listening = false; setStatus('Đã dừng nghe.'); return; }
    try {
      recognition = new wsr();
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      var inp = $(targetInputId);
      recognition.onstart = function () { listening = true; setStatus('🎙 Đang nghe... nói ý tưởng, xong bấm lại để dừng.'); };
      recognition.onresult = function (e) {
        var t = '';
        for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        if (inp) {
          inp.value = t.trim();
          var ev = document.createEvent('Event'); ev.initEvent('change', true, true); inp.dispatchEvent(ev);
        }
        setStatus('✅ Đã chuyển giọng nói thành text (FREE, browser local). Bấm OPTIMIZE hoặc chỉnh sửa.');
      };
      recognition.onerror = function () { listening = false; setStatus('Lỗi nhận dạng giọng nói: ' + (e && e.error || 'unknown'), true); };
      recognition.onend = function () { listening = false; };
      recognition.start();
    } catch (err) { setStatus('Không khởi động được mic: ' + err.message, true); }
  }

  /* ================= QUALITY PRESETS ================= */
  function suggestedQuality(operation, imageType, sourceHas) {
    if (imageType && /hero|banner|important|social/i.test(imageType)) return 'HIGH';
    if ((operation === 'generate' && !sourceHas) || /draft|test/i.test(operation)) return 'LOW';
    return 'MEDIUM'; // product/e-commerce mặc định medium
  }

  /* ================= AI HISTORY (localStorage + trong-memory, FREE đọc) ================= */
  const HISTORY_KEY = 'psh_media_center_history';
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveHistory(arr) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 100))); } catch (e) {} }
  // recordHistory(rec) — mỗi thao tác gọi 2 lần: 1 lần lúc bắt đầu
  // (status PROCESSING) và 1 lần khi xong (COMPLETED/FAILED). Trước đây luôn
  // unshift 1 dòng MỚI, nên dòng PROCESSING đầu tiên KHÔNG BAO GIỜ được cập
  // nhật — AI History tích tụ vĩnh viễn các dòng "PROCESSING" mồ côi bên cạnh
  // dòng kết quả thật, nhìn như thao tác bị treo (Founder thấy trên
  // Production). Gắn cho mỗi thao tác 1 `hid` rồi cập nhật ĐÚNG dòng đó.
  var histSeq = 0;
  function recordHistory(rec) {
    if (!rec.hid) rec.hid = 'h' + Date.now() + '-' + (++histSeq);
    var arr = loadHistory();
    var idx = arr.findIndex(function (h) { return h && h.hid === rec.hid; });
    if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], rec);
    else arr.unshift(Object.assign({ ts: Date.now() }, rec));
    saveHistory(arr);
  }
  function renderHistory() {
    var el = $('meHistoryList');
    if (!el) return;
    var arr = loadHistory();
    if (!arr.length) { el.innerHTML = '<p class="mc-note">Chưa có hoạt động AI nào.</p>'; return; }
    el.innerHTML = arr.map(function (h, i) {
      var time = new Date(h.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      var statusColor = h.status === 'COMPLETED' ? '#059669' : (h.status === 'FAILED' ? '#b3261e' : '#c2410c');
      var cost = h.actualCost ? (h.actualCost + ' USD') : 'N/A';
      return '<div class="me-hist" style="border:1px solid #e6e8ec;border-radius:8px;padding:.5rem .7rem;margin-bottom:.4rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:180px"><strong>' + esc(h.sourceAsset || '—') + '</strong><br>' +
        '<span class="small-muted">' + esc(h.operation || '') + ' · ' + esc(h.model || '') + ' · ' + esc(h.quality || '') + ' · ' + time + '</span></div>' +
        '<span style="color:' + statusColor + ';font-weight:700">' + esc(h.status || '') + '</span>' +
        '<span class="small-muted">Cost: ' + cost + '</span>' +
        '<span>' + (h.outputAsset ? '<button class="mc-btn ghost" data-use="/me-hist-use-\'' + i + '\'">USE</button>' : '') +
        '<button class="mc-btn ghost" data-discard-index="' + i + '">DISCARD</button></span>' +
        '<p class="small-muted" style="width:100%;margin:0">' + esc(h.error || '') + '</p></div>';
    }).join('');
    el.querySelectorAll('[data-discard-index]').forEach(function (b) {
      b.addEventListener('click', function () { discardHistory(parseInt(b.getAttribute('data-discard-index'), 10)); });
    });
    el.querySelectorAll('[data-use]').forEach(function (b) {
      b.addEventListener('click', function () { var hRec = loadHistory()[parseInt(b.getAttribute('data-use').replace(/\D/g, ''), 10)]; if (hRec && hRec.outputAsset) { setPreview(hRec.outputAsset, 'Kết quả đã dùng trước: ' + hRec.operation); setStatus('Đã nạp ảnh từ History — Approve để lưu.'); activeDraft = { url: hRec.outputAsset, op: hRec.operation, source: hRec.sourceAsset }; $('meApproveBtn') && ($('meApproveBtn').disabled = false); $('meDiscardBtn') && ($('meDiscardBtn').disabled = false); } });
    });
  }
  function discardHistory(idx) {
    var arr = loadHistory();
    if (arr[idx]) { arr[idx].status = 'DISCARDED'; arr[idx].error = 'Discarded by user'; saveHistory(arr); renderHistory(); setStatus('Đã đánh dấu DISCARDED — không gọi AI.'); }
  }

  function init() {
    // Bắt sự kiện upload file
    var up = $('meFileInput');
    if (up) up.addEventListener('change', function () { pickUpload(up.files && up.files[0]); });

    var btnUrl = $('meUrlBtn'); if (btnUrl) btnUrl.addEventListener('click', urlSource);

    var rm = $('meRemoveBgBtn'); if (rm) rm.addEventListener('click', removeBg);

    var editBtn = $('meEditBtn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        var psel = $('mePreset'); var key = psel ? psel.value : 'replace-background';
        doEdit(key);
      });
    }
    var preset = $('mePreset');
    if (preset) {
      preset.addEventListener('change', function () {
        var k = preset.value;
        var customWrap = $('meCustomWrap');
        if (customWrap) customWrap.style.display = (k === 'custom') ? 'block' : 'none';
        var lbl = $('meOpsLabel');
        if (lbl && PRESETS[k]) lbl.textContent = PRESETS[k].cost;
      });
    }

    var ap = $('meApproveBtn'); if (ap) ap.addEventListener('click', approveDraft);
    var dc = $('meDiscardBtn'); if (dc) dc.addEventListener('click', discardDraft);

    var gen = $('meGenerateBtn'); if (gen) gen.addEventListener('click', generateNew);

    // Voice + optimize
    var mic = $('meMicBtn'); if (mic) mic.addEventListener('click', function () { toggleVoice('meGenPrompt'); });
    var opt = $('meOptimizeBtn'); if (opt) opt.addEventListener('click', function () {
      var raw = ($('meGenPrompt') && $('meGenPrompt').value) || '';
      if (!raw.trim()) { setStatus('Nhập ý tưởng hoặc nói trước khi Optimize.', true); return; }
      var out = optimizePrompt(raw);
      if ($('meGenPrompt')) $('meGenPrompt').value = out;
      var pv = $('mePromptPreview');
      if (pv) { pv.style.display = 'block'; pv.textContent = 'OPTIMIZED PROMPT (FREE — rule-based, không gọi AI):\n' + out; }
      setStatus('✅ Prompt đã tối ưu (FREE). Bạn có thể sửa trước khi bấm EDIT/GENERATE.');
    });

    // Quality override
    var qs = document.querySelectorAll('.me-q');
    var setQ = function (q) {
      qs.forEach(function (x) { x.classList.remove('active'); });
      qs.forEach(function (x) { if (x.getAttribute('data-q') === q) x.classList.add('active'); });
      var hidden = $('meQuality'); if (hidden) hidden.value = q;
    };
    qs.forEach(function (b) {
      b.addEventListener('click', function () { setQ(b.getAttribute('data-q')); });
    });
    // PART 2.1 — tự chọn quality theo loại ảnh (product=MEDIUM, hero/banner=HIGH, draft=test=LOW)
    var genType = $('meGenType');
    var syncQuality = function () {
      var t = (genType && genType.value) || '';
      var q = suggestedQuality('generate', t, !!activeSource);
      setQ(q);
      if ($('meQualityHint')) $('meQualityHint').textContent = 'Tự đề xuất: ' + q + ' (Override được). Product→MEDIUM · Hero/Banner→HIGH · Draft/Test→LOW.';
    };
    if (genType) genType.addEventListener('change', syncQuality);
    syncQuality();

    // FREE ops — canvas cục bộ, KHÔNG gọi OpenAI
    var bRot = $('meFreeRotate'); if (bRot) bRot.addEventListener('click', freeRotate);
    var bRes = $('meFreeResize'); if (bRes) bRes.addEventListener('click', freeResize);
    var bCrop = $('meFreeCrop'); if (bCrop) bCrop.addEventListener('click', freeCropSquare);
    var bCmp = $('meFreeCompress'); if (bCmp) bCmp.addEventListener('click', freeCompress);
    var bPng = $('meFreeConvertPng'); if (bPng) bPng.addEventListener('click', function () { freeConvert('image/png'); });
    var bWebp = $('meFreeConvertWebp'); if (bWebp) bWebp.addEventListener('click', function () { freeConvert('image/webp'); });
    var bBgWhite = $('meFreeBgWhite'); if (bBgWhite) bBgWhite.addEventListener('click', function () { freeChangeBackground('#ffffff'); });
    var bBgBlack = $('meFreeBgBlack'); if (bBgBlack) bBgBlack.addEventListener('click', function () { freeChangeBackground('#000000'); });
    var bBgCustom = $('meFreeBgCustom'); if (bBgCustom) bBgCustom.addEventListener('click', function () { freeChangeBackground(($('meFreeBgColor') && $('meFreeBgColor').value) || '#ffffff'); });
    var bgFileInput = $('meFreeBgFileInput'); if (bgFileInput) bgFileInput.addEventListener('change', function () { pickFreeBgImage(bgFileInput.files && bgFileInput.files[0]); });
    var bgApplyBtn = $('meFreeBgApplyBtn'); if (bgApplyBtn) bgApplyBtn.addEventListener('click', freeChangeBackgroundImage);
    var textApplyBtn = $('meTextApplyBtn'); if (textApplyBtn) textApplyBtn.addEventListener('click', freeInsertText);

    loadLibrary();
    loadGenProducts();
    renderHistory(); // hiển thị AI History dựa trên localStorage (xem KHÔNG gọi AI)
  }

  return { init: init, loadLibrary: loadLibrary, runGeneration: generateNew };
})();
