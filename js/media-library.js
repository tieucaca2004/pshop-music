/*
 * MediaLibrary — Sprint 8 Requirement #2. Kho ảnh DÙNG CHUNG cho toàn bộ
 * CMS (Product/Blog/Banner/Slider/Category...), xây HOÀN TOÀN trên Firebase
 * Storage đã có (`js/storage-upload.js`, Sprint 1) — KHÔNG thêm Field hay
 * Collection Realtime Database nào (đúng "Media Library chỉ là lớp
 * Experience Layer", không đổi Business Logic/Database Structure).
 *
 * "Danh sách ảnh có sẵn" lấy trực tiếp từ chính Storage Bucket (duyệt đệ
 * quy toàn bộ thư mục qua `ref().listAll()`) — không cần 1 node Firebase
 * riêng để "biết" ảnh nào đã có, nên ảnh đã upload từ TRƯỚC Requirement này
 * (nằm rải rác ở `products/`, `banners/`, `sliders/`, `category-tiles/`,
 * `blog/`, `uploads/`...) vẫn hiện đầy đủ trong Library, không cần migrate
 * dữ liệu cũ. Ảnh MỚI qua Media Library tải lên 1 thư mục chung `media/`.
 *
 * Yêu cầu load thứ tự: firebase-storage-compat.js → firebase-config.js →
 * js/storage-upload.js (tái sử dụng `StorageUpload.uploadImage()` cho việc
 * tải lên thật — không viết lại logic Storage) → file này.
 */
const MediaLibrary = (function () {
  const SHARED_UPLOAD_FOLDER = 'media';

  // Tenant-aware: a real (non-pshop-music) business user browses/uploads
  // under businesses/{id}/media only (matches Storage rules' tenant-isolated
  // path); legacy admin/editor/pshop-music keeps the full-bucket behavior
  // unchanged (existing images predate per-tenant folders).
  function effectiveBusinessId() {
    return (typeof AuthContext !== 'undefined') ? AuthContext.getEffectiveBusinessId() : null;
  }

  function storageRoot() {
    const businessId = effectiveBusinessId();
    if (businessId) return firebase.storage().ref('businesses/' + businessId);
    return firebase.storage().ref();
  }

  function uploadFolder() {
    const businessId = effectiveBusinessId();
    if (businessId) return 'businesses/' + businessId + '/' + SHARED_UPLOAD_FOLDER;
    return SHARED_UPLOAD_FOLDER;
  }

  function toMediaItem(itemRef) {
    return Promise.all([
      itemRef.getDownloadURL().catch(() => null),
      itemRef.getMetadata().catch(() => null)
    ]).then(([url, meta]) => ({
      fullPath: itemRef.fullPath,
      name: itemRef.name,
      url,
      size: (meta && meta.size) || null,
      contentType: (meta && meta.contentType) || null,
      timeCreated: (meta && meta.timeCreated) ? new Date(meta.timeCreated).getTime() : null
    }));
  }

  // Duyệt đệ quy toàn bộ Storage Bucket — không hard-code danh sách thư mục
  // (products/banners/sliders/...), tự động phủ mọi thư mục hiện có + tương
  // lai. Bỏ qua file không phải ảnh (contentType không bắt đầu bằng "image/").
  function listAllRecursive(ref) {
    return ref.listAll().then(res => {
      const filesPromise = Promise.all(res.items.map(toMediaItem));
      // Bỏ qua nhánh businesses/ khi duyệt từ gốc: đó là dữ liệu riêng của
      // từng tenant, Storage Rules luôn từ chối cho phiên legacy/CMS này —
      // đệ quy vào sẽ làm reject cả danh sách thay vì chỉ thiếu nhánh đó.
      const subfoldersPromise = Promise.all(
        res.prefixes.filter(p => p.name !== 'businesses').map(listAllRecursive)
      );
      return Promise.all([filesPromise, subfoldersPromise]).then(([files, nestedLists]) => {
        return files.concat.apply(files, nestedLists);
      });
    });
  }

  // Thư mục ảnh đã biết, dùng LÀM DỰ PHÒNG khi quét từ gốc bị Storage Rules
  // từ chối. Quét từ gốc (`ref().listAll()` trên path "") đòi quyền `list` ở
  // ĐÚNG path rỗng — một trường hợp riêng mà Rules rất dễ bỏ sót, và khi
  // thiếu thì TOÀN BỘ Thư viện ảnh chết với storage/unauthorized (Founder
  // báo lỗi này ở mọi nút "CHỌN ẢNH" trong CMS). Quét từng thư mục con thì
  // chỉ cần quyền `list` trên chính thư mục đó — luôn khớp block
  // `match /{allPaths=**}` thông thường, không phụ thuộc dòng rules đặc biệt
  // cho path rỗng.
  //
  // Đây là DỰ PHÒNG, không thay thế: quét gốc vẫn được thử TRƯỚC (tự phủ cả
  // thư mục mới phát sinh sau này mà không cần sửa danh sách dưới đây), chỉ
  // khi bị từ chối mới lùi về danh sách này.
  // 'media-center' — Media Center's own upload (js/media-edit.js pickUpload())
  // ghi vào `media-center/source/...`, nhưng thư mục này CHƯA từng có trong
  // danh sách dự phòng, nên khi quét gốc bị từ chối thì ảnh Founder vừa tải
  // lên qua Media Center KHÔNG BAO GIỜ xuất hiện lại trong lưới "CHỌN ẢNH TỪ
  // MEDIA LIBRARY" — dù upload đã thành công thật trên Storage.
  const KNOWN_MEDIA_FOLDERS = [
    'media', 'media-center', 'products', 'banners', 'sliders', 'category-tiles', 'blog', 'uploads'
  ];

  // listFromRoot() -> Promise<MediaItem[]> — quét gốc, có dự phòng như trên.
  // Thư mục dự phòng nào không tồn tại/không đọc được chỉ trả về mảng rỗng,
  // không làm hỏng cả danh sách.
  function listFromRoot() {
    const root = storageRoot();
    return listAllRecursive(root).catch(err => {
      const code = err && err.code;
      if (code !== 'storage/unauthorized') throw err;
      return Promise.all(
        KNOWN_MEDIA_FOLDERS.map(folder => listAllRecursive(root.child(folder)).catch(() => []))
      ).then(lists => [].concat.apply([], lists));
    });
  }

  // ── Media Index — nguồn dự phòng khi Storage LIST không dùng được ────────
  // Trên Production, Storage listAll() trả 403 "Permission denied." ở MỌI
  // path (kể cả gốc) dù Rules đã cho phép và cùng token đó GET/WRITE vẫn
  // PASS — đã xác minh bằng Rules Simulator trên đúng ruleset đang live, đang
  // chờ Firebase Support. Không có LIST thì không cách nào biết file nào đã
  // tồn tại, nên Thư viện luôn rỗng dù upload thật sự thành công.
  //
  // Index này KHÔNG phải dữ liệu giả: nó chỉ ghi lại ĐÚNG fullPath thật của
  // file vừa upload, để sau khi tải lại trang còn biết đường hỏi Storage. URL
  // vẫn được resolve LẠI từ Storage thật qua getDownloadURL() mỗi lần đọc.
  //
  // Lưu ở `siteContent/mediaAssets` — node siteContent ĐÃ được
  // database.rules.json cho phép admin/editor ghi. KHÔNG tạo node top-level
  // mới vì `$other` trong rules chặn hết, và Rules không nằm trong phạm vi
  // sửa của việc này. Ghi/xóa THẲNG vào child ref, KHÔNG đi qua
  // SiteContentDB.save() (hàm đó set() cả object, sẽ đụng dữ liệu khác).
  const MEDIA_INDEX_PATH = 'siteContent/mediaAssets';

  function indexRef() {
    return firebase.database().ref(MEDIA_INDEX_PATH);
  }

  // pathFromDownloadURL(url) — Firebase download URL luôn có dạng
  // `.../o/<fullPath đã URL-encode>?alt=media&token=...`, nên tách lại
  // fullPath là xác định, không phải phỏng đoán.
  function pathFromDownloadURL(url) {
    const m = String(url || '').match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // recordUpload(fullPath, meta) -> Promise — ghi 1 file thật vừa upload vào
  // index. Lỗi ghi index KHÔNG được làm hỏng luồng upload (ảnh đã nằm trên
  // Storage rồi) nên nuốt lỗi, chỉ trả null.
  function recordUpload(fullPath, meta) {
    if (!fullPath) return Promise.resolve(null);
    return indexRef().push({
      fullPath: fullPath,
      name: fullPath.split('/').pop(),
      contentType: (meta && meta.contentType) || null,
      size: (meta && meta.size) || null,
      timeCreated: Date.now()
    }).then(() => fullPath).catch(() => null);
  }

  function removeFromIndex(fullPath) {
    return indexRef().once('value').then(snap => {
      const val = snap.val() || {};
      const updates = {};
      Object.keys(val).forEach(k => {
        if (val[k] && val[k].fullPath === fullPath) updates[k] = null;
      });
      return Object.keys(updates).length ? indexRef().update(updates) : null;
    }).catch(() => null);
  }

  // listFromIndex() -> Promise<MediaItem[]> — dựng lại danh sách từ index và
  // resolve URL thật qua getDownloadURL() (Storage GET vẫn hoạt động bình
  // thường). Entry trỏ tới file đã bị xóa nơi khác sẽ tự bị loại, không hiện
  // ảnh hỏng và không cần dọn index thủ công.
  function listFromIndex() {
    return indexRef().once('value').then(snap => {
      const val = snap.val() || {};
      return Promise.all(Object.keys(val).map(k => {
        const e = val[k];
        if (!e || !e.fullPath) return null;
        return firebase.storage().ref(e.fullPath).getDownloadURL()
          .then(url => ({
            fullPath: e.fullPath,
            name: e.name || e.fullPath.split('/').pop(),
            url: url,
            size: e.size || null,
            contentType: e.contentType || null,
            timeCreated: e.timeCreated || null
          }))
          .catch(() => null);
      })).then(items => items.filter(Boolean));
    }).catch(() => []);
  }

  // listSource() — ƯU TIÊN Storage thật; chỉ lùi về index khi Storage không
  // trả được gì. Khi Storage LIST được sửa, hành vi cũ tự khôi phục nguyên
  // vẹn mà không cần đụng lại file này.
  function listSource() {
    return listFromRoot()
      .then(items => (items && items.length) ? items : listFromIndex())
      .catch(() => listFromIndex());
  }

  // kindOf(item) -> 'image' | 'video' | 'document' — single shared
  // classification (Task 2.7, Customer Workspace Files/Documents) so every
  // caller that needs to tell media types apart (Media Library UI, Files UI,
  // opts.kind filtering below) uses the exact same rule instead of each
  // re-implementing it.
  function kindOf(item) {
    const ct = (item && item.contentType) || '';
    if (ct.indexOf('image/') === 0) return 'image';
    if (ct.indexOf('video/') === 0) return 'video';
    return 'document';
  }

  // list(searchTerm, opts) -> Promise<MediaItem[]>, mới nhất trước. Không bao
  // giờ reject — 1 item đọc lỗi (getDownloadURL/getMetadata) vẫn được giữ lại
  // với field null thay vì làm hỏng cả danh sách.
  //
  // opts.allTypes (Task 2.6, Customer Workspace Media Library) — khi true,
  // BỎ bộ lọc "chỉ ảnh" để hiện cả video/tài liệu. Mặc định (opts bỏ trống,
  // đúng cách MỌI caller hiện có gọi — media-library-picker.js/
  // admin-media-library.js) giữ NGUYÊN hành vi cũ (chỉ ảnh), 0 thay đổi cho
  // các nơi đang dùng làm "chọn ảnh sản phẩm/banner/...".
  //
  // opts.kind === 'documents' (Task 2.7, Customer Workspace Files/Documents)
  // — filters to non-image/non-video files only (PDF/DOCX/XLSX/TXT/ZIP/...),
  // using the same Storage tree/upload folder as Media Library (both are
  // filtered views over the same tenant Storage data, not separate systems).
  function list(searchTerm, opts) {
    const allTypes = !!(opts && opts.allTypes);
    const documentsOnly = !!(opts && opts.kind === 'documents');
    return listSource()
      .then(items => {
        if (documentsOnly) return items.filter(it => kindOf(it) === 'document');
        return allTypes ? items : items.filter(it => !it.contentType || it.contentType.indexOf('image/') === 0);
      })
      .then(items => {
        const term = (searchTerm || '').trim().toLowerCase();
        const filtered = term ? items.filter(it => it.name.toLowerCase().indexOf(term) !== -1) : items;
        return filtered.sort((a, b) => (b.timeCreated || 0) - (a.timeCreated || 0));
      });
  }

  // upload(file, onProgress) -> Promise<string (download URL)> — tái sử dụng
  // nguyên vẹn StorageUpload.uploadImage() (không viết lại logic tải lên
  // Storage). Chỉ trả về URL — sau khi tải lên xong, gọi lại list() để lấy
  // đúng MediaItem đầy đủ (fullPath/size/...) từ chính Storage, tránh tự
  // suy luận fullPath từ URL (không đáng tin cậy bằng đọc thẳng từ Storage).
  //
  // Sau khi tải lên xong còn ghi thêm 1 dòng vào Media Index (xem phần trên)
  // để Thư viện còn dựng lại được danh sách khi Storage LIST không dùng được.
  // fullPath lấy từ chính download URL Storage vừa trả về — xác định, không
  // phỏng đoán. Ghi index lỗi cũng KHÔNG chặn upload (ảnh đã lên Storage).
  function upload(file, onProgress) {
    return StorageUpload.uploadImage(file, uploadFolder(), onProgress).then(url => {
      return recordUpload(pathFromDownloadURL(url), {
        contentType: file && file.type,
        size: file && file.size
      }).then(() => url);
    });
  }

  // remove(fullPath) -> Promise — xóa THẬT khỏi Storage. CHỈ được gọi sau
  // khi UI đã xác nhận rõ ràng với người dùng (Functional Requirement #6:
  // "không xóa Storage nếu chưa được xác nhận") — hàm này tự nó không hỏi,
  // trách nhiệm xác nhận thuộc về UI gọi nó (media-library-picker.js).
  // Xóa xong còn gỡ luôn dòng tương ứng trong Media Index để Thư viện không
  // còn trỏ tới file đã mất sau khi tải lại trang.
  function remove(fullPath) {
    return firebase.storage().ref(fullPath).delete()
      .then(() => removeFromIndex(fullPath))
      .then(() => true);
  }

  // rename(fullPath, newName) -> Promise<string (new fullPath)> — Task 2.6.
  // Firebase Storage has no native rename/move; the standard approach is
  // fetch the existing blob, upload it to a new path in the SAME folder
  // (preserving contentType), then delete the original. New to this file
  // (didn't exist before) but self-contained -- reuses the same Storage
  // instance/patterns, not a new/parallel system.
  function rename(fullPath, newName) {
    const oldRef = firebase.storage().ref(fullPath);
    const lastSlash = fullPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? fullPath.substring(0, lastSlash) : '';
    const safeName = String(newName || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName) return Promise.reject(new Error('Invalid file name'));
    const newPath = (dir ? dir + '/' : '') + safeName;
    if (newPath === fullPath) return Promise.resolve(fullPath);
    return Promise.all([oldRef.getDownloadURL(), oldRef.getMetadata()])
      .then(([url, meta]) => fetch(url).then(r => r.blob()).then(blob => {
        const newRef = firebase.storage().ref(newPath);
        return newRef.put(blob, { contentType: meta.contentType || undefined });
      }))
      .then(() => oldRef.delete())
      .then(() => newPath);
  }

  // recordUpload được export để các trang tự upload thẳng qua Storage SDK
  // (js/media-edit.js — Media Center giữ nguyên path `media-center/source/`)
  // đăng ký được file vừa tải lên vào cùng 1 Media Index, không phải tự dựng
  // cơ chế riêng.
  //
  // pathFromDownloadURL được export để js/media-edit.js dùng lại ĐÚNG cách
  // tách fullPath này khi Approve 1 draft (kết quả AI Edit/Remove Background
  // — Cloud Function đã lưu thẳng vào Storage qua Admin SDK, KHÔNG tự đăng ký
  // vào Media Index) thay vì tự viết lại regex parse URL ở nơi khác.
  return { list, upload, remove, rename, kindOf, recordUpload, pathFromDownloadURL };
})();
