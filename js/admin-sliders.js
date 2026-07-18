/*
 * Slider Manager (admin/sliders.html) — per-slide form UI over
 * siteContent.heroSlides node (js/home.js renderHeroSlides).
 * Sprint 13: + SortableJS drag-reorder.
 * Sprint 14: Founder yêu cầu bỏ HẲN lưới 9 điểm vị trí — thay bằng kéo TỰ DO
 * (không snap) cho VỊ TRÍ Tiêu đề/Mô tả (8 hướng bất kỳ, không giới hạn 9 ô)
 * VÀ kéo TỰ DO cho CỠ CHỮ Tiêu đề/Mô tả (không còn cỡ chữ cố định). Slide cũ
 * (chỉ có field "position" 9 điểm) tự quy đổi sang toạ độ % gần đúng qua
 * LEGACY_POSITION_XY — không cần migration ghi lại Firebase.
 * Sprint 14 (đợt 2): + Zoom/di chuyển TỰ DO ảnh nền Slide (kéo trực tiếp
 * trong khung xem trước). + ẢNH SLIDE giờ TỰ ĐỘNG xóa phông trắng khi upload
 * (Founder báo "nền trắng xấu quá") — tái dùng ĐÚNG detectWhiteBackground()
 * (Canvas, không API mới) + AdminBgRemover.removeBackgroundUrl() (Cloud
 * Function remove_background đã có, xem js/admin-agent.js/js/admin-bg-
 * remover.js — cùng kỹ thuật Founder Agent V5 "smart-background"). + Thêm
 * "ẢNH NỀN" riêng (tùy chọn) — Founder KHÔNG đặt = ẢNH SLIDE tự làm backdrop
 * như trước (0 regression); ĐẶT = Ảnh nền làm backdrop, ẢNH SLIDE (đã xóa
 * phông) chồng lên như 1 sản phẩm — xem js/home.js renderHeroSlides/
 * updateHeroText().
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'sliders', title: 'QUẢN LÝ SLIDER TRANG CHỦ' }).then(load);

  let siteContent = null;
  let slides = [];
  let sortable = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // detectWhiteBackground(imageUrl) -> Promise<boolean> — ĐÚNG bản gốc ở
  // js/admin-agent.js (Founder Agent V5 "smart-background") — lấy mẫu màu 6
  // điểm qua Canvas API có sẵn (KHÔNG gọi API/Cloud Function nào cho bước
  // PHÁT HIỆN, chỉ bước XÓA PHÔNG sau đó mới gọi remove_background đã có).
  // Lỗi đọc pixel (CORS/ảnh hỏng) -> resolve(false) — "không xác định được"
  // không chặn upload, không tự ý xử lý nhầm 1 ảnh không phải nền trắng.
  function detectWhiteBackground(imageUrl) {
    return new Promise(resolve => {
      if (!imageUrl || typeof Image === 'undefined' || typeof document.createElement !== 'function') { resolve(false); return; }
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const w = canvas.width = Math.min(img.naturalWidth || img.width || 0, 100) || 100;
            const h = canvas.height = Math.min(img.naturalHeight || img.height || 0, 100) || 100;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const samples = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [Math.floor(w / 2), 0], [0, Math.floor(h / 2)]];
            let whiteCount = 0;
            samples.forEach(([x, y]) => {
              const px = ctx.getImageData(x, y, 1, 1).data;
              if (px[0] > 235 && px[1] > 235 && px[2] > 235) whiteCount++;
            });
            resolve(whiteCount >= samples.length - 1);
          } catch (e) { resolve(false); }
        };
        img.onerror = () => resolve(false);
        img.src = imageUrl;
      } catch (e) { resolve(false); }
    });
  }

  // handleSlideImageUpload — Founder chọn/tải Ảnh Slide mới: reset Zoom/Vị
  // trí về mặc định (khung cũ không hợp bố cục ảnh mới hoàn toàn khác), rồi
  // TỰ ĐỘNG phát hiện + xóa phông trắng (không cần bấm nút nào) — im lặng bỏ
  // qua nếu không phải nền trắng/lỗi mạng, KHÔNG chặn Founder tiếp tục làm
  // việc dù thành hay bại.
  function handleSlideImageUpload(i, url) {
    setField(i, 'image', url);
    setField(i, 'imageZoom', 100);
    setField(i, 'imagePosX', 50);
    setField(i, 'imagePosY', 30);
    refreshPreview(i);
    if (typeof AdminBgRemover === 'undefined' || !AdminBgRemover.removeBackgroundUrl) return;
    detectWhiteBackground(url).then(isWhite => {
      if (!isWhite || slides[i].image !== url) return; // Founder đã đổi ảnh khác trong lúc chờ -> bỏ qua kết quả cũ
      return AdminBgRemover.removeBackgroundUrl(url).then(resultUrl => {
        if (slides[i].image !== url) return; // vẫn kiểm tra lại phòng Founder đổi ảnh ngay trong lúc xóa phông
        slides[i].image = resultUrl;
        refreshPreview(i);
        showStatus('Đã tự động phát hiện + xóa phông nền trắng cho Ảnh Slide ' + (i + 1) + '.');
      }).catch(() => {}); // lỗi Cloud Function -> giữ nguyên ảnh gốc thật, không báo lỗi làm phiền
    }).catch(() => {});
  }

  // LEGACY_POSITION_XY/deriveTitlePos/deriveSubPos — ĐÚNG logic quy đổi 9
  // điểm cũ đã dùng ở js/home.js (updateHeroText) để khung xem trước ở đây
  // KHÔNG BAO GIỜ lệch với trang thật — sửa 1 nơi phải sửa nơi kia.
  const LEGACY_POSITION_XY = {
    'top-left': { x: 8, y: 18 }, 'top-center': { x: 50, y: 18 }, 'top-right': { x: 92, y: 18 },
    'middle-left': { x: 8, y: 50 }, 'middle-center': { x: 50, y: 50 }, 'middle-right': { x: 92, y: 50 },
    'bottom-left': { x: 8, y: 58 }, 'bottom-center': { x: 50, y: 58 }, 'bottom-right': { x: 92, y: 58 }
  };
  function deriveTitlePos(s) {
    if (typeof s.titlePosX === 'number' && typeof s.titlePosY === 'number') return { x: s.titlePosX, y: s.titlePosY };
    return LEGACY_POSITION_XY[s.position] || LEGACY_POSITION_XY['bottom-left'];
  }
  function deriveSubPos(s) {
    if (typeof s.subPosX === 'number' && typeof s.subPosY === 'number') return { x: s.subPosX, y: s.subPosY };
    const t = deriveTitlePos(s);
    return { x: t.x, y: Math.min(96, t.y + 22) };
  }
  // deriveTagPos/deriveBtnsPos — ĐÚNG logic quy đổi ở js/home.js (Nhãn địa
  // danh/2 nút bấm giờ kéo/ẩn riêng được theo từng Slide) — sửa 1 nơi phải
  // sửa nơi kia.
  function deriveTagPos(s) {
    if (typeof s.tagPosX === 'number' && typeof s.tagPosY === 'number') return { x: s.tagPosX, y: s.tagPosY };
    const t = deriveTitlePos(s);
    return { x: t.x, y: Math.max(2, t.y - 10) };
  }
  function deriveBtnsPos(s) {
    if (typeof s.btnsPosX === 'number' && typeof s.btnsPosY === 'number') return { x: s.btnsPosX, y: s.btnsPosY };
    const sp = deriveSubPos(s);
    return { x: sp.x, y: Math.min(96, sp.y + 10) };
  }
  const TITLE_BASE_FONT = 0.62; // rem, khớp cỡ chữ mini-label cũ ở titleScale=100
  const SUB_BASE_FONT = 0.5;    // rem, cỡ chữ mô tả trong khung mini nhỏ hơn tiêu đề

  // Mini hero preview — kéo TỰ DO (không snap) Tiêu đề VÀ Mô tả để di chuyển
  // tới BẤT KỲ vị trí nào (Founder yêu cầu bỏ hẳn lưới 9 điểm cũ), mỗi nhãn
  // có thêm 1 tay cầm góc để kéo đổi CỠ CHỮ tự do — không giới hạn mức nào.
  // Bấm ✕ để xóa tiêu đề khỏi Slide này (giữ nguyên từ trước).
  // Sprint 14: + kéo TỰ DO Zoom/Vị trí chính ẢNH NỀN Slide — lớp
  // .hero-mini-preview-bg TÁCH RIÊNG khỏi khung ngoài .hero-mini-preview để
  // transform:scale() (Zoom) CHỈ ảnh hưởng ảnh, KHÔNG kéo lệch vị trí Tiêu
  // đề/Mô tả (2 lớp con độc lập, không lồng vào lớp bị transform).
  function miniPreview(i, s) {
    const bgSrc = s.bgImage || s.image; // ĐÚNG logic js/home.js — Ảnh nền riêng nếu có, không thì Ảnh Slide tự làm backdrop
    const zoom = typeof s.imageZoom === 'number' ? s.imageZoom : 100;
    const posX = typeof s.imagePosX === 'number' ? s.imagePosX : 50;
    const posY = typeof s.imagePosY === 'number' ? s.imagePosY : 30;
    const bgStyle = bgSrc
      ? `background-image:url('${escapeHtml(bgSrc)}');background-position:${posX}% ${posY}%;transform:scale(${zoom / 100})`
      : 'background:#222';
    // Ảnh sản phẩm chồng lên — CHỈ hiện khi có Ảnh nền riêng (2 lớp), khớp
    // đúng điều kiện js/home.js updateHeroText().
    const subjectHtml = (s.bgImage && s.image) ? `<img class="hero-mini-subject" src="${escapeHtml(s.image)}" alt="">` : '';
    const tp = deriveTitlePos(s);
    const sp = deriveSubPos(s);
    const titleScale = typeof s.titleScale === 'number' ? s.titleScale : 100;
    const subScale = typeof s.subScale === 'number' ? s.subScale : 100;
    const hasTitle = !!(s.title && s.title.trim());
    const titleHtml = hasTitle ? `
      <div class="hero-mini-label hero-mini-title" style="left:${tp.x}%;top:${tp.y}%;font-size:${(TITLE_BASE_FONT * titleScale / 100).toFixed(2)}rem" onpointerdown="event.stopPropagation();AdminSliders.startTitleDrag(event,${i})" title="Kéo để di chuyển Tiêu đề">
        ${escapeHtml(s.title)}
        <button type="button" class="hero-mini-label-del" onclick="event.stopPropagation();AdminSliders.deleteTitle(${i})" title="Xóa tiêu đề">✕</button>
        <span class="hero-mini-resize-handle" title="Kéo để đổi cỡ chữ Tiêu đề" onpointerdown="event.stopPropagation();AdminSliders.startTitleResize(event,${i})"></span>
      </div>` : `<div class="hero-mini-label-empty">Chưa có tiêu đề — gõ ở ô bên trái</div>`;
    const hasSub = !!(s.subtitle && s.subtitle.trim());
    const subHtml = hasSub ? `
      <div class="hero-mini-label hero-mini-sub" style="left:${sp.x}%;top:${sp.y}%;font-size:${(SUB_BASE_FONT * subScale / 100).toFixed(2)}rem" onpointerdown="event.stopPropagation();AdminSliders.startSubDrag(event,${i})" title="Kéo để di chuyển Mô tả">
        ${escapeHtml(s.subtitle)}
        <span class="hero-mini-resize-handle" title="Kéo để đổi cỡ chữ Mô tả" onpointerdown="event.stopPropagation();AdminSliders.startSubResize(event,${i})"></span>
      </div>` : '';
    const zoomHandle = bgSrc ? `<span class="hero-mini-zoom-handle" title="Kéo để Zoom ảnh nền (${zoom}%)" onpointerdown="event.stopPropagation();AdminSliders.startImageZoom(event,${i})"></span>` : '';
    // Nhãn địa danh + 2 nút bấm — chữ DÙNG CHUNG cho mọi Slide (sửa ở Cài đặt
    // > HERO TRANG CHỦ), nhưng vị trí + ẩn/hiện giờ RIÊNG từng Slide.
    const tagP = deriveTagPos(s);
    const btnsP = deriveBtnsPos(s);
    const tagText = (siteContent && siteContent.heroTag) || 'Nha Trang · Khánh Hòa';
    const cta1Text = (siteContent && siteContent.heroCtaLabel) || 'XEM SẢN PHẨM';
    const cta2Text = (siteContent && siteContent.heroCta2Label) || 'DỊCH VỤ CHO THUÊ';
    const tagHtml = s.tagHidden
      ? `<div class="hero-mini-hidden-chip" style="left:${tagP.x}%;top:${tagP.y}%" onclick="AdminSliders.toggleTagHidden(${i})" title="Bấm để hiện lại Nhãn địa danh">Nhãn địa danh: Đã ẩn — bấm để hiện lại</div>`
      : `<div class="hero-mini-label hero-mini-tag" style="left:${tagP.x}%;top:${tagP.y}%" onpointerdown="event.stopPropagation();AdminSliders.startTagDrag(event,${i})" title="Kéo để di chuyển Nhãn địa danh (chữ dùng chung, sửa ở Cài đặt &gt; HERO TRANG CHỦ)">
        ${escapeHtml(tagText)}
        <button type="button" class="hero-mini-label-del" onclick="event.stopPropagation();AdminSliders.toggleTagHidden(${i})" title="Ẩn Nhãn địa danh ở Slide này">✕</button>
      </div>`;
    const btnsHtml = s.btnsHidden
      ? `<div class="hero-mini-hidden-chip" style="left:${btnsP.x}%;top:${btnsP.y}%" onclick="AdminSliders.toggleBtnsHidden(${i})" title="Bấm để hiện lại 2 Nút bấm">2 Nút bấm: Đã ẩn — bấm để hiện lại</div>`
      : `<div class="hero-mini-label hero-mini-btns" style="left:${btnsP.x}%;top:${btnsP.y}%" onpointerdown="event.stopPropagation();AdminSliders.startBtnsDrag(event,${i})" title="Kéo để di chuyển 2 Nút bấm (chữ dùng chung, sửa ở Cài đặt &gt; HERO TRANG CHỦ)">
        ${escapeHtml(cta1Text)} / ${escapeHtml(cta2Text)}
        <button type="button" class="hero-mini-label-del" onclick="event.stopPropagation();AdminSliders.toggleBtnsHidden(${i})" title="Ẩn 2 Nút bấm ở Slide này">✕</button>
      </div>`;
    return `
      <div class="hero-mini-preview">
        <div class="hero-mini-preview-bg" style="${bgStyle}" onpointerdown="AdminSliders.startImageDrag(event,${i})" title="${bgSrc ? 'Kéo để di chuyển ảnh nền' : ''}"></div>
        ${subjectHtml}
        ${tagHtml}
        ${titleHtml}
        ${subHtml}
        ${btnsHtml}
        ${zoomHandle}
      </div>`;
  }

  // startTitleDrag/startSubDrag — kéo TỰ DO nhãn Tiêu đề/Mô tả bằng Pointer
  // Events, ghi thẳng % thật (không snap về ô nào) — CHỈ cập nhật style tại
  // chỗ trong lúc kéo (không gọi refreshPreview() giữa chừng — sẽ REBUILD
  // toàn bộ innerHTML, mất tham chiếu DOM đang kéo) — commit thật (ghi vào
  // `slides`) đúng 1 lần khi thả chuột (pointerup). Neo GÓC TRÊN-TRÁI của
  // nhãn tại điểm kéo — khớp đúng .hero-title-block/.hero-sub-block trên
  // trang thật (css/style.css) — không center-anchor để tránh lệch WYSIWYG.
  function startTextDrag(e, i, field) {
    e.preventDefault();
    const labelEl = e.currentTarget;
    const box = labelEl.closest('.hero-mini-preview');
    if (!box) return;
    labelEl.classList.add('dragging');
    const posXField = field + 'PosX', posYField = field + 'PosY';
    const DERIVE_POS = { title: deriveTitlePos, sub: deriveSubPos, tag: deriveTagPos, btns: deriveBtnsPos };
    const start = (DERIVE_POS[field] || deriveSubPos)(slides[i]);
    let lastX = start.x, lastY = start.y;

    function move(ev) {
      const rect = box.getBoundingClientRect();
      lastX = Math.round(Math.min(100, Math.max(0, (ev.clientX - rect.left) / rect.width * 100)) * 10) / 10;
      lastY = Math.round(Math.min(100, Math.max(0, (ev.clientY - rect.top) / rect.height * 100)) * 10) / 10;
      labelEl.style.left = lastX + '%';
      labelEl.style.top = lastY + '%';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('dragging');
      slides[i][posXField] = lastX;
      slides[i][posYField] = lastY;
      refreshPreview(i);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  function startTitleDrag(e, i) { startTextDrag(e, i, 'title'); }
  function startSubDrag(e, i) { startTextDrag(e, i, 'sub'); }
  function startTagDrag(e, i) { startTextDrag(e, i, 'tag'); }
  function startBtnsDrag(e, i) { startTextDrag(e, i, 'btns'); }

  // toggleTagHidden/toggleBtnsHidden — Nhãn địa danh/2 nút bấm dùng CHUNG chữ
  // (admin/settings.html "HERO TRANG CHỦ") nên KHÔNG xóa chữ được ở đây (sẽ
  // mất luôn cho mọi Slide khác) — chỉ ẨN HIỂN THỊ riêng cho Slide này, đúng
  // ý Founder "xóa và di chuyển được mấy chữ đó" áp dụng cho từng Slide.
  function toggleTagHidden(i) {
    slides[i].tagHidden = !slides[i].tagHidden;
    refreshPreview(i);
  }
  function toggleBtnsHidden(i) {
    slides[i].btnsHidden = !slides[i].btnsHidden;
    refreshPreview(i);
  }

  // startTitleResize/startSubResize — kéo TỰ DO tay cầm góc nhãn để đổi CỠ
  // CHỮ (không giới hạn mức nào, thay hẳn cho không có control cỡ chữ trước
  // đây) — khoảng cách từ góc trên-trái nhãn tới điểm thả chuột so với
  // khoảng cách ban đầu quyết định tỉ lệ phóng to/nhỏ, kẹp 40%-300% tránh
  // chữ biến mất hẳn hoặc tràn khung xem trước.
  function startTextResize(e, i, field, baseFont) {
    e.preventDefault();
    const handle = e.currentTarget;
    const labelEl = handle.closest('.hero-mini-label');
    if (!labelEl) return;
    const scaleField = field + 'Scale';
    const startRect = labelEl.getBoundingClientRect();
    const startScale = typeof slides[i][scaleField] === 'number' ? slides[i][scaleField] : 100;
    const startDist = Math.max(10, Math.hypot(startRect.width, startRect.height));
    labelEl.classList.add('resizing-text');
    let lastScale = startScale;

    function move(ev) {
      const dist = Math.hypot(ev.clientX - startRect.left, ev.clientY - startRect.top);
      lastScale = Math.min(300, Math.max(40, Math.round(startScale * (dist / startDist))));
      labelEl.style.fontSize = (baseFont * lastScale / 100).toFixed(2) + 'rem';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      labelEl.classList.remove('resizing-text');
      slides[i][scaleField] = lastScale;
      refreshPreview(i);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  function startTitleResize(e, i) { startTextResize(e, i, 'title', TITLE_BASE_FONT); }
  function startSubResize(e, i) { startTextResize(e, i, 'sub', SUB_BASE_FONT); }

  // startImageDrag — kéo TỰ DO chính ẢNH NỀN Slide để di chuyển vừa khung
  // (đổi background-position %) — kéo chuột sang phải/xuống làm ẢNH TRÔNG
  // như trượt theo đúng hướng tay (giảm % vị trí khi kéo phải, đúng cách
  // background-position hoạt động: % càng lớn càng lộ phần bên phải/dưới
  // của ảnh). Neo theo % thật, CHỈ ghi thật (slides[i].imagePosX/Y) khi thả
  // chuột — kéo giữa chừng chỉ cập nhật style tại chỗ, không rebuild DOM.
  function startImageDrag(e, i) {
    e.preventDefault();
    const bgEl = e.currentTarget;
    const box = bgEl.closest('.hero-mini-preview');
    if (!box || !(slides[i].bgImage || slides[i].image)) return;
    bgEl.classList.add('dragging-bg');
    const rect = box.getBoundingClientRect();
    const startPosX = typeof slides[i].imagePosX === 'number' ? slides[i].imagePosX : 50;
    const startPosY = typeof slides[i].imagePosY === 'number' ? slides[i].imagePosY : 30;
    const startClientX = e.clientX, startClientY = e.clientY;
    let lastX = startPosX, lastY = startPosY;

    function move(ev) {
      const dx = (ev.clientX - startClientX) / rect.width * 100;
      const dy = (ev.clientY - startClientY) / rect.height * 100;
      lastX = Math.round(Math.min(100, Math.max(0, startPosX - dx)));
      lastY = Math.round(Math.min(100, Math.max(0, startPosY - dy)));
      bgEl.style.backgroundPosition = lastX + '% ' + lastY + '%';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      bgEl.classList.remove('dragging-bg');
      slides[i].imagePosX = lastX;
      slides[i].imagePosY = lastY;
      refreshPreview(i);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // startImageZoom — kéo TỰ DO tay cầm góc dưới-phải khung để Zoom to/nhỏ
  // ảnh nền — khoảng cách từ góc trên-trái khung tới điểm thả chuột so với
  // khoảng cách ban đầu quyết định tỉ lệ, kẹp SÀN 100% (ảnh luôn phủ đủ
  // khung — background-size:cover đã đảm bảo ở 100%, không cho zoom nhỏ hơn
  // để tránh hở nền) và TRẦN 300%.
  function startImageZoom(e, i) {
    e.preventDefault();
    const handle = e.currentTarget;
    const box = handle.closest('.hero-mini-preview');
    const bgEl = box && box.querySelector('.hero-mini-preview-bg');
    if (!box || !bgEl || !(slides[i].bgImage || slides[i].image)) return;
    bgEl.classList.add('zooming-bg');
    const startRect = box.getBoundingClientRect();
    const startZoom = typeof slides[i].imageZoom === 'number' ? slides[i].imageZoom : 100;
    const startDist = Math.max(10, Math.hypot(startRect.width, startRect.height));
    let lastZoom = startZoom;

    function move(ev) {
      const dist = Math.hypot(ev.clientX - startRect.left, ev.clientY - startRect.top);
      lastZoom = Math.min(300, Math.max(100, Math.round(startZoom * (dist / startDist))));
      bgEl.style.transform = 'scale(' + (lastZoom / 100) + ')';
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      bgEl.classList.remove('zooming-bg');
      slides[i].imageZoom = lastZoom;
      refreshPreview(i);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function deleteTitle(i) {
    slides[i].title = '';
    refreshPreview(i);
    const input = document.getElementById('slideTitleInput-' + i);
    if (input) input.value = '';
  }

  function load() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      slides = Array.isArray(content.heroSlides) ? content.heroSlides.slice() : [];
      render();
    });
  }

  function render() {
    const wrap = document.getElementById('slideList');
    wrap.innerHTML = slides.map((s, i) => `
      <div class="panel slide-panel" data-idx="${i}" style="margin-bottom:1rem">
        <div class="slide-panel-inner">
          <div class="slide-drag-handle" title="Kéo để sắp xếp lại thứ tự">&#9776;</div>
          <div class="slide-panel-content">
            <div class="slide-panel-top">
              <div class="slide-form-col">
                <div class="field-grid">
                  <div class="form-group full">
                    <label>ẢNH SLIDE ${i + 1} (khung ngang — đúng tỉ lệ banner thật) <span class="small-muted">(tự động xóa phông nền trắng khi tải lên — kéo ảnh trong khung bên phải để di chuyển vừa khung, kéo góc dưới-phải khung để Zoom to/nhỏ)</span></label>
                    ${MediaLibraryPicker.renderSlot(s.image, url => handleSlideImageUpload(i, url), { wide: true })}
                  </div>
                  <div class="form-group full">
                    <label>ẢNH NỀN <span class="small-muted">(tùy chọn — để trống = ẢNH SLIDE tự làm nền như hiện tại; đặt Ảnh nền = Ảnh nền làm backdrop, ẢNH SLIDE chồng lên như sản phẩm)</span></label>
                    ${MediaLibraryPicker.renderSlot(s.bgImage, url => { setField(i, 'bgImage', url); refreshPreview(i); }, { wide: true })}
                  </div>
                  <div class="form-group">
                    <label>TIÊU ĐỀ LỚN <span class="small-muted">(kéo trong khung bên phải để di chuyển tự do, kéo góc để đổi cỡ chữ, bấm ✕ để xóa)</span></label>
                    <input type="text" id="slideTitleInput-${i}" value="${escapeHtml(s.title)}" oninput="AdminSliders.setField(${i},'title',this.value);AdminSliders.refreshPreview(${i})">
                  </div>
                  <div class="form-group">
                    <label>LINK KHI BẤM (để trống = cuộn xuống danh mục)</label>
                    <input type="text" value="${escapeHtml(s.link)}" placeholder="category.html?cat=loa" oninput="AdminSliders.setField(${i},'link',this.value)">
                  </div>
                  <div class="form-group full">
                    <label>MÔ TẢ NGẮN <span class="small-muted">(kéo trong khung bên phải để di chuyển tự do, kéo góc để đổi cỡ chữ)</span></label>
                    <input type="text" value="${escapeHtml(s.subtitle)}" oninput="AdminSliders.setField(${i},'subtitle',this.value);AdminSliders.refreshPreview(${i})">
                  </div>
                </div>
              </div>
              <div class="slide-preview-col">
                <label>XEM TRƯỚC — kéo ẢNH NỀN/chữ để di chuyển, kéo các góc để đổi Zoom/cỡ chữ, hoàn toàn tự do</label>
                <div id="preview-${i}">${miniPreview(i, s)}</div>
              </div>
            </div>
            <div class="admin-actions">
              <button class="btn-danger" onclick="AdminSliders.remove(${i})">XÓA SLIDE</button>
            </div>
          </div>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có slide nào. Bấm "+ THÊM SLIDE" để bắt đầu.</p>';

    initSortable();
  }

  // Cập nhật mini preview tại chỗ mà không render lại toàn bộ (tránh mất focus input).
  function refreshPreview(i) {
    const el = document.getElementById('preview-' + i);
    if (el) el.innerHTML = miniPreview(i, slides[i]);
  }

  function setField(i, field, value) {
    slides[i][field] = value;
  }

  function remove(i) {
    if (!confirm('Xóa slide này?')) return;
    slides.splice(i, 1);
    render();
  }

  // addSlide — ghi thẳng toạ độ % mặc định (KHÔNG dùng field "position" 9
  // điểm cũ đã bỏ) — trùng khớp toạ độ LEGACY_POSITION_XY['bottom-left'] để
  // Slide mới trông giống hệt Slide cũ chưa từng chỉnh gì.
  function addSlide() {
    const def = LEGACY_POSITION_XY['bottom-left'];
    slides.push({ image: '', title: '', subtitle: '', link: '', titlePosX: def.x, titlePosY: def.y });
    render();
  }

  function saveAll() {
    const content = Object.assign({}, siteContent, { heroSlides: slides });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('Đã lưu slider trang chủ — có hiệu lực ngay cho mọi khách truy cập.');
    });
  }

  function showStatus(msg) {
    const el = document.getElementById('sliderStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  // SortableJS — khởi tạo lại sau mỗi render() vì DOM được rebuild hoàn toàn.
  function initSortable() {
    if (sortable) { sortable.destroy(); sortable = null; }
    const wrap = document.getElementById('slideList');
    if (!wrap || !window.Sortable) return;
    sortable = Sortable.create(wrap, {
      handle: '.slide-drag-handle',
      animation: 150,
      ghostClass: 'slide-drag-ghost',
      onEnd(evt) {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === newIndex) return;
        const moved = slides.splice(oldIndex, 1)[0];
        slides.splice(newIndex, 0, moved);
        render(); // rebuild với thứ tự mới để idx labels đúng
      }
    });
  }

  document.getElementById('addSlideBtn').addEventListener('click', addSlide);
  document.getElementById('saveSlidesBtn').addEventListener('click', saveAll);

  window.AdminSliders = {
    setField, startTitleDrag, startSubDrag, startTitleResize, startSubResize, deleteTitle,
    startTagDrag, startBtnsDrag, toggleTagHidden, toggleBtnsHidden,
    startImageDrag, startImageZoom,
    move: (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= slides.length) return;
      [slides[i], slides[j]] = [slides[j], slides[i]];
      render();
    }, remove, refreshPreview
  };
});
