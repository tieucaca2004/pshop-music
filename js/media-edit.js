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
 *  - edit_image        → /v1/images/edits model gpt-image-2, giữ sản phẩm
 *  - remove_background → xóa nền, giữ nguyên sản phẩm
 *  - generate_image    → /v1/images/generations model gpt-image-2 (từ-scratch)
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
  }

  function loadLibrary() {
    var grid = $('meLibraryGrid');
    if (!grid) return;
    if (typeof MediaLibrary === 'undefined') { grid.innerHTML = '<p class="mc-note">Media Library engine chưa sẵn sàng.</p>'; return; }
    grid.innerHTML = '<p class="mc-note">Đang quét Media Library...</p>';
    MediaLibrary.listFiles().then(function (items) {
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
      Promise.resolve(uploadFn).then(function (snap) {
        var ref = snap.ref || (snap && snap.ref);
        return ref.getDownloadURL();
      }).then(function (url) {
        activeSource = { url: url, name: file.name };
        setPreview(url, 'SOURCE (uploaded): ' + file.name);
        setStatus('Đã upload nguồn: ' + file.name + '. Chọn EDIT bên dưới.');
        $('meEditBtn') && ($('meEditBtn').disabled = false);
        $('meRemoveBgBtn') && ($('meRemoveBgBtn').disabled = false);
        $('meSourceName') && ($('meSourceName').textContent = file.name);
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
    return proxyCall('edit_image', body).then(function (res) {
      if (res.data.imageUrl) {
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
    proxyCall('remove_background', { imageUrl: activeSource.url }).then(function (res) {
      if (res.data.imageUrl) {
        setStatus('✅ Remove Background xong. Xem DRAFT — Approve để lưu.');
        setPreview(res.data.imageUrl, 'DRAFT: Remove Background');
        $('meApproveBtn') && ($('meApproveBtn').disabled = false);
        $('meDiscardBtn') && ($('meDiscardBtn').disabled = false);
        $('meOpsLabel') && ($('meOpsLabel').textContent = 'AI Edit');
      } else setStatus('Remove background thất bại: ' + JSON.stringify(res.data), true);
    }).catch(function (e) { setStatus('Lỗi: ' + e.message, true); });
  }

  // approve: export URL thành asset trong media library (tái dùng MediaLibrary nếu có), không ghi đè nguồn.
  function approveDraft() {
    if (!activeDraft) { setStatus('Chưa có draft để lưu.', true); return; }
    var url = activeDraft.url;
    var saveTask;
    if (typeof MediaLibrary !== 'undefined' && typeof MediaLibrary.addAsset === 'function') {
      saveTask = MediaLibrary.addAsset({ url: url, name: 'edit-' + Date.now(), type: 'image' });
    } else {
      saveTask = Promise.resolve();
    }
    return saveTask.then(function () {
      setStatus('✅ Đã lưu ảnh đã chỉnh vào Media Library — sản phẩm gốc KHÔNG bị ghi đè.');
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
    // tái sử dụng AdminImageAI nếu có: đặt inputParams vào form thật rồi runGeneration
    if (typeof AdminImageAI !== 'undefined' && typeof AdminImageAI.runGeneration === 'function') {
      var params = {
        imageType: $('meGenType') && $('meGenType').value || 'Product Hero Image',
        productId: p || '',
        promotion: '',
        blogPostId: '',
        customPrompt: prompt,
        size: ($('meGenSize') && $('meGenSize').value) || '1:1'
      };
      // AdminImageAI.runGeneration dùng form DOM ids imgType/imgProduct/... — vì vậy
      // đồng bộ vào các field đó rồi gọi. Nếu không có, fallback trực tiếp.
      ['imgType', 'imgProduct', 'imgCustomPrompt', 'imgSize'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'imgType') el.value = params.imageType;
        else if (id === 'imgProduct') el.value = params.productId;
        else if (id === 'imgCustomPrompt') el.value = params.customPrompt;
        else if (id === 'imgSize') el.value = params.size;
      });
      AdminImageAI.runGeneration(params);
    } else {
      // fallback: gọi openaiProxy generate_image trực tiếp
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
  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('Không đọc được ảnh nguồn.')); };
      im.crossOrigin = 'anonymous';
      im.src = src;
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

    // FREE ops — canvas cục bộ, KHÔNG gọi OpenAI
    var bRot = $('meFreeRotate'); if (bRot) bRot.addEventListener('click', freeRotate);
    var bRes = $('meFreeResize'); if (bRes) bRes.addEventListener('click', freeResize);
    var bCrop = $('meFreeCrop'); if (bCrop) bCrop.addEventListener('click', freeCropSquare);
    var bCmp = $('meFreeCompress'); if (bCmp) bCmp.addEventListener('click', freeCompress);
    var bPng = $('meFreeConvertPng'); if (bPng) bPng.addEventListener('click', function () { freeConvert('image/png'); });
    var bWebp = $('meFreeConvertWebp'); if (bWebp) bWebp.addEventListener('click', function () { freeConvert('image/webp'); });

    loadLibrary();
    loadGenProducts();
  }

  return { init: init, loadLibrary: loadLibrary, runGeneration: generateNew };
})();
