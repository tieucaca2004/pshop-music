/*
 * MediaLibraryPicker — Sprint 8 Requirement #2. Lớp Experience Layer DUY
 * NHẤT mà mọi form CMS (Product/Blog/Banner/Slider/Category) dùng để chọn
 * ảnh — thay cho việc gõ URL thủ công vào ô text. Ẩn hoàn toàn URL/Storage
 * Path khỏi giao diện chính (Functional Requirement #9) — chỉ hiện trong
 * mục "Advanced" đóng sẵn (Functional Requirement #10). Không chứa Business
 * Logic CMS (không tự gọi DB.update/BannerDB.update/...) — chỉ đọc/ghi giá
 * trị URL vào đúng ô input/textarea mà từng trang admin đã có sẵn.
 *
 * 2 cách gắn vào 1 field, tuỳ trang:
 *   - mount(inputId, previewContainerId) — field TĨNH, dựng 1 lần lúc trang
 *     tải (Banner/Blog: 1 ảnh, input có sẵn trong HTML).
 *   - mountMulti(textareaId, containerId) — field TĨNH dạng mảng nhiều ảnh
 *     (Product: textarea nhiều dòng URL).
 *   - renderSlot(url, onChange, opts) — trả về HTML string để nhúng vào
 *     template render() lại nhiều lần (Slider/Category: mỗi dòng tự vẽ lại
 *     toàn bộ DOM mỗi khi đổi dữ liệu).
 *
 * Yêu cầu load thứ tự: js/media-library.js → file này.
 */
const MediaLibraryPicker = (function () {
  let slotRegistry = {};
  let slotCounter = 0;
  let modalEl = null;
  let modalOnSelect = null;
  let searchDebounce = null;
  let currentGridItems = [];

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function PSH.PSH.formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';

  /* ================= Slot (1 ô ảnh — dùng chung cho mọi kiểu gắn) ================= */

  function slotHtml(slotId, url, opts) {
    const chooseLabel = (opts && opts.chooseLabel) || 'Chọn ảnh';
    const hasRemoveSlot = !!(opts && opts.onRemoveSlot);
    // opts.wide (Sprint 13) — khung xem trước ngang/rộng (16:9) thay vì khung
    // vuông 96x96 mặc định dùng chung mọi nơi khác (Product/Blog/Banner/
    // Category). CHỈ trang nào truyền wide:true mới đổi (Slider Trang chủ —
    // ảnh Hero Slideshow thật sự là banner ngang, khung vuông cho cảm giác
    // sai lệch tỉ lệ). Không ảnh hưởng bất kỳ nơi gọi renderSlot()/mount()/
    // mountMulti() nào khác — 0 thay đổi hành vi nếu không truyền opts.wide.
    const thumbClass = 'medialib-slot-thumb' + ((opts && opts.wide) ? ' medialib-slot-thumb-wide' : '');
    // onMoveUp/onMoveDown/onSetFeatured/isFeatured (Sprint 12 Requirement #10,
    // Product Management) - CHỈ mountMulti() truyền các key này (sắp xếp lại
    // ảnh cần biết vị trí trong mảng) - mount()/renderSlot() (Blog/Banner/
    // Slider/Category) không truyền nên các nút này không xuất hiện, 0 thay
    // đổi hành vi cũ.
    const moveUpBtn = (opts && opts.onMoveUp) ? `<button type="button" class="link-btn" onclick="MediaLibraryPicker.moveUpFor('${slotId}')">↑</button>` : '';
    const moveDownBtn = (opts && opts.onMoveDown) ? `<button type="button" class="link-btn" onclick="MediaLibraryPicker.moveDownFor('${slotId}')">↓</button>` : '';
    const setFeaturedBtn = (opts && opts.onSetFeatured) ? `<button type="button" class="link-btn" onclick="MediaLibraryPicker.setFeaturedFor('${slotId}')">★ Đặt làm ảnh đại diện</button>` : '';
    const featuredBadge = (opts && opts.isFeatured) ? `<span class="small-muted" style="margin-left:0.3rem">★ Ảnh đại diện</span>` : '';
    return `
      <div class="medialib-slot" id="${slotId}">
        <div class="${thumbClass}">
          ${url ? `<img src="${PSH.escapeHtml(url)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
          <div class="medialib-thumb-empty" style="display:${url ? 'none' : 'flex'}">${url ? 'Ảnh lỗi' : 'Chưa có ảnh'}</div>
        </div>
        <div class="medialib-slot-actions">
          <button type="button" class="link-btn" onclick="MediaLibraryPicker.chooseFor('${slotId}')">${PSH.escapeHtml(chooseLabel)}</button>
          ${(url && !hasRemoveSlot) ? `<button type="button" class="link-btn" onclick="MediaLibraryPicker.clearFor('${slotId}')">Xóa</button>` : ''}
          ${hasRemoveSlot ? `<button type="button" class="link-btn" onclick="MediaLibraryPicker.removeSlotFor('${slotId}')">Bỏ ảnh này</button>` : ''}
          ${moveUpBtn}${moveDownBtn}${setFeaturedBtn}${featuredBadge}
        </div>
        ${url ? `<details class="medialib-advanced"><summary>Advanced</summary><code>${PSH.escapeHtml(url)}</code></details>` : ''}
      </div>`;

  function registerSlot(url, onChange, opts) {
    const slotId = 'medialib-slot-' + (++slotCounter);
    slotRegistry[slotId] = { url, onChange, opts };
    return slotId;

  // renderSlot(url, onChange, opts) -> HTML string, nhúng vào template
  // render() của trang gọi (Slider/Category) — mỗi lần render() chạy lại,
  // gọi lại renderSlot() để lấy slotId MỚI (an toàn, không cần dọn slot cũ).
  function renderSlot(url, onChange, opts) {
    const slotId = registerSlot(url, onChange, opts);
    return slotHtml(slotId, url, opts);

  function refreshSlotDom(slotId) {
    const slot = slotRegistry[slotId];
    const el = document.getElementById(slotId);
    if (!slot || !el) return;
    el.outerHTML = slotHtml(slotId, slot.url, slot.opts);

  function chooseFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot) return;
    openModal(url => {
      slot.url = url;
      slot.onChange(url);
      refreshSlotDom(slotId);

  function clearFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot) return;
    slot.url = '';
    slot.onChange('');
    refreshSlotDom(slotId);

  function removeSlotFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot || !slot.opts || !slot.opts.onRemoveSlot) return;
    slot.opts.onRemoveSlot();

  // moveUpFor/moveDownFor/setFeaturedFor (Sprint 12 Requirement #10) - cùng
  // pattern với removeSlotFor(): slotHtml() chỉ gọi lại đúng callback đã đăng
  // ký trong opts, không tự biết vị trí trong mảng ảnh (mountMulti() mới biết).
  function moveUpFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot || !slot.opts || !slot.opts.onMoveUp) return;
    slot.opts.onMoveUp();

  function moveDownFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot || !slot.opts || !slot.opts.onMoveDown) return;
    slot.opts.onMoveDown();

  function setFeaturedFor(slotId) {
    const slot = slotRegistry[slotId];
    if (!slot || !slot.opts || !slot.opts.onSetFeatured) return;
    slot.opts.onSetFeatured();

  /* ================= mount() — field tĩnh, 1 ảnh (Banner/Blog) ================= */

  function mount(inputId, previewContainerId, opts) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(previewContainerId);
    if (!input || !container) return { refresh() {} };
    input.style.display = 'none';

    function renderInto() {
      container.innerHTML = slotHtml(previewContainerId + '-slot', input.value, opts);
      slotRegistry[previewContainerId + '-slot'] = {
        url: input.value,
        onChange: url => { input.value = url; },
        opts
    renderInto();

  /* ================= mountMulti() — field tĩnh, nhiều ảnh (Product) ================= */

  function mountMulti(textareaId, containerId, opts) {
    const textarea = document.getElementById(textareaId);
    const container = document.getElementById(containerId);
    if (!textarea || !container) return { refresh() {} };
    textarea.style.display = 'none';

    function currentUrls() {
      return textarea.value.split(/[\n,;]/).map(u => u.trim()).filter(Boolean);
    function setUrls(urls) {
      textarea.value = urls.join('\n');
    function renderInto() {
      const urls = currentUrls();
      // Reorder/Set Featured (Sprint 12 Requirement #10, Product Management) -
      // ảnh đầu tiên trong mảng LUÔN là ảnh đại diện (đúng quy ước sẵn có,
      // xem js/admin-products.js saveProduct() data.image = images[0]) - "Đặt
      // làm ảnh đại diện" = đưa ảnh đó lên đầu mảng.
      const slotsHtml = urls.map((url, i) => renderSlot(url, newUrl => {
        const list = currentUrls();
        list[i] = newUrl;
        setUrls(list);
        chooseLabel: 'Đổi ảnh',
        isFeatured: i === 0,
        onRemoveSlot: () => {
          const list = currentUrls();
          list.splice(i, 1);
          setUrls(list);
          renderInto();
        onMoveUp: i > 0 ? () => {
          const list = currentUrls();
          const tmp = list[i - 1];
          list[i - 1] = list[i];
          list[i] = tmp;
          setUrls(list);
          renderInto();
        onMoveDown: i < urls.length - 1 ? () => {
          const list = currentUrls();
          const tmp = list[i + 1];
          list[i + 1] = list[i];
          list[i] = tmp;
          setUrls(list);
          renderInto();
        onSetFeatured: i > 0 ? () => {
          const list = currentUrls();
          const [item] = list.splice(i, 1);
          list.unshift(item);
          setUrls(list);
          renderInto();
      const maxImages = opts && opts.maxImages;
      const atMax = maxImages && urls.length >= maxImages;
      const addSlotId = 'medialib-add-' + (++slotCounter);
      const addSlotHtml = atMax
        ? `<div class="medialib-slot medialib-slot-add medialib-slot-max"><span class="small-muted">Tối đa ${maxImages} ảnh</span></div>`
        : `<div class="medialib-slot medialib-slot-add" id="${addSlotId}">
          <button type="button" class="link-btn" onclick="MediaLibraryPicker.addTo('${addSlotId}')">+ Thêm ảnh</button>
        </div>`;
      container.innerHTML = `<div class="medialib-grid">${slotsHtml}${addSlotHtml}</div>`;
      if (!atMax) {
        slotRegistry[addSlotId] = {
          onAdd: url => {
            const list = currentUrls();
            list.push(url);
            setUrls(list);
            renderInto();
    renderInto();

  function addTo(addSlotId) {
    const slot = slotRegistry[addSlotId];
    if (!slot || !slot.onAdd) return;
    openModal(url => slot.onAdd(url));

  /* ================= Modal dùng chung (tạo 1 lần, tái sử dụng mọi nơi) ================= */

  function ensureModalDom() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay medialib-modal-overlay';
    modalEl.innerHTML = `
      <div class="medialib-modal-box">
        <button type="button" class="medialib-modal-close" onclick="MediaLibraryPicker.closeModal()">&times;</button>
        <h3>THƯ VIỆN ẢNH</h3>
        <div class="medialib-modal-toolbar">
          <input type="text" class="medialib-search" id="medialibSearch" placeholder="Tìm theo tên ảnh...">
          <button type="button" class="upload-btn" id="medialibUploadBtn">&#128247; Tải ảnh lên</button>
          <input type="file" id="medialibUploadInput" accept="image/*" style="display:none">
        </div>
        <div class="medialib-dropzone" id="medialibDropzone">
          <div class="medialib-grid" id="medialibGrid"></div>
          <div class="medialib-dropzone-hint">Kéo thả ảnh vào đây để tải lên</div>
        </div>
        <p class="medialib-status" id="medialibStatus" style="display:none"></p>
      </div>`;
    document.body.appendChild(modalEl);

    document.getElementById('medialibSearch').addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadGrid, 200);
    document.getElementById('medialibUploadBtn').addEventListener('click', () => {
      document.getElementById('medialibUploadInput').click();
    document.getElementById('medialibUploadInput').addEventListener('change', e => {
      if (e.target.files[0]) handleUpload(e.target.files[0]);
      e.target.value = '';

    const dropzone = document.getElementById('medialibDropzone');
    ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.add('medialib-dragover');
    ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.remove('medialib-dragover');
    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.indexOf('image/') === 0) handleUpload(file);

    modalEl.addEventListener('click', e => {
      if (e.target === modalEl) closeModal();

  function showStatus(msg) {
    const el = document.getElementById('medialibStatus');
    el.textContent = msg;
    el.style.display = 'block';
  function hideStatus() {
    document.getElementById('medialibStatus').style.display = 'none';

  function handleUpload(file) {
    showStatus('Đang tải ảnh lên... 0%');
    MediaLibrary.upload(file, pct => showStatus('Đang tải ảnh lên... ' + pct + '%'))
      .then(url => {
        hideStatus();
        document.getElementById('medialibSearch').value = '';
        loadGrid();
        if (modalOnSelect) { modalOnSelect(url); closeModal(); }
      .catch(err => showStatus('Lỗi tải ảnh: ' + err.message));

  function loadGrid() {
    const grid = document.getElementById('medialibGrid');
    grid.innerHTML = '<p class="small-muted">Đang tải...</p>';
    const term = document.getElementById('medialibSearch').value;
    MediaLibrary.list(term).then(items => {
      currentGridItems = items;
      if (!items.length) {
        grid.innerHTML = '<p class="small-muted">Không tìm thấy ảnh nào. Kéo thả hoặc bấm "Tải ảnh lên" để thêm ảnh mới.</p>';
        return;
      grid.innerHTML = items.map((item, index) => itemHtml(item, index)).join('');
      grid.innerHTML = '<p style="color:#c0392b">Không tải được Thư viện ảnh: ' + PSH.escapeHtml(err.message) + '</p>';

  // Dùng index vào currentGridItems thay vì nhúng thẳng URL/fullPath vào
  // chuỗi onclick — tránh URL (có thể chứa ký tự đặc biệt) làm hỏng cú
  // pháp JS trong attribute.
  function itemHtml(item, index) {
    const meta = [PSH.PSH.formatBytes(item.size), item.timeCreated ? new Date(item.timeCreated).toLocaleDateString('vi-VN') : ''].filter(Boolean).join(' · ');
    return `
      <div class="medialib-grid-item">
        <div class="medialib-grid-thumb" onclick="MediaLibraryPicker.pickIndex(${index})">
          <img src="${PSH.escapeHtml(item.url || '')}" loading="lazy">
        </div>
        <div class="medialib-grid-meta">${PSH.escapeHtml(meta)}</div>
        <button type="button" class="link-btn medialib-delete-btn" onclick="MediaLibraryPicker.confirmDeleteIndex(${index})">Xóa khỏi Thư viện</button>
      </div>`;

  function pickIndex(index) {
    const item = currentGridItems[index];
    if (!item || !modalOnSelect) return;
    modalOnSelect(item.url);
    closeModal();

  // confirmDeleteIndex() — Functional Requirement #6: KHÔNG xóa Storage nếu
  // chưa được xác nhận. Đây là hành động XÓA THẬT khỏi Storage (khác với
  // clearFor()/removeSlotFor() chỉ bỏ tham chiếu khỏi 1 field) — luôn hỏi
  // xác nhận trước khi gọi MediaLibrary.remove().
  function confirmDeleteIndex(index) {
    const item = currentGridItems[index];
    if (!item) return;
    if (!confirm('Xóa ảnh này khỏi Thư viện? Hành động này xóa file thật khỏi Storage và không thể hoàn tác. Nếu ảnh đang được dùng ở nơi khác (Product/Banner/...), nơi đó sẽ mất ảnh.')) return;
    MediaLibrary.remove(item.fullPath).then(loadGrid).catch(err => alert('Không xóa được: ' + err.message));

  function openModal(onSelect) {
    ensureModalDom();
    modalOnSelect = onSelect;
    document.getElementById('medialibSearch').value = '';
    modalEl.classList.add('open');
    loadGrid();

  function closeModal() {
    if (modalEl) modalEl.classList.remove('open');
    modalOnSelect = null;

  return {
    mount, mountMulti, renderSlot,
    chooseFor, clearFor, removeSlotFor, addTo,
    moveUpFor, moveDownFor, setFeaturedFor,
    openModal, closeModal, pickIndex, confirmDeleteIndex
})();
