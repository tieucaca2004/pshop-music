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
      const subfoldersPromise = Promise.all(res.prefixes.map(listAllRecursive));
      return Promise.all([filesPromise, subfoldersPromise]).then(([files, nestedLists]) => {
        return files.concat.apply(files, nestedLists);
      });
    });
  }

  // list(searchTerm) -> Promise<MediaItem[]>, mới nhất trước. Không bao giờ
  // reject — 1 item đọc lỗi (getDownloadURL/getMetadata) vẫn được giữ lại
  // với field null thay vì làm hỏng cả danh sách.
  function list(searchTerm) {
    return listAllRecursive(storageRoot())
      .then(items => items.filter(it => !it.contentType || it.contentType.indexOf('image/') === 0))
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

  return { list, upload, remove };
})();
