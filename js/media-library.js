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
  const KNOWN_MEDIA_FOLDERS = [
    'media', 'products', 'banners', 'sliders', 'category-tiles', 'blog', 'uploads'
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
    return listFromRoot()
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
  function upload(file, onProgress) {
    return StorageUpload.uploadImage(file, uploadFolder(), onProgress);
  }

  // remove(fullPath) -> Promise — xóa THẬT khỏi Storage. CHỈ được gọi sau
  // khi UI đã xác nhận rõ ràng với người dùng (Functional Requirement #6:
  // "không xóa Storage nếu chưa được xác nhận") — hàm này tự nó không hỏi,
  // trách nhiệm xác nhận thuộc về UI gọi nó (media-library-picker.js).
  function remove(fullPath) {
    return firebase.storage().ref(fullPath).delete();
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

  return { list, upload, remove, rename, kindOf };
})();
