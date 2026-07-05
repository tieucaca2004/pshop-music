/*
 * DataProvider (IDataProvider) — cổng đọc dữ liệu CMS DUY NHẤT mà AI Plugin
 * được phép dùng. Không plugin nào được gọi thẳng DB/CategoryDB/BlogDB/
 * SeoDB/SiteContentDB — mọi loadContext() trong js/ai/modules/*.js chỉ gọi
 * qua DataProvider bên dưới.
 *
 * Pipeline bắt buộc: AI Plugin → DataProvider → CMS Database → Context → AI
 * Provider. DataProvider không bao giờ ghi dữ liệu (không có hàm set/update/
 * publish) — chỉ đọc. Đổi nguồn dữ liệu sau này (nếu có) chỉ cần viết lại
 * file này theo đúng interface dưới, không phải sửa từng plugin.
 *
 * Interface (IDataProvider):
 *   getProduct(id)      -> Promise<product|null>
 *   getProducts()       -> Promise<product[]>
 *   getCategories()      -> Promise<category[]>
 *   getBrands()          -> Promise<string[]>
 *   getMedia(productId)  -> Promise<string[]>
 *   getBlogPost(id)      -> Promise<post|null>
 *   getBlogPosts()       -> Promise<post[]>
 *   getSEO()             -> Promise<seoSettings>
 *   getSettings()        -> Promise<settings>
 */
const DataProvider = (function () {
  function getProduct(id) {
    if (typeof DB === 'undefined' || !id) return Promise.resolve(null);
    return DB.get(id);
  }

  function getProducts() {
    if (typeof DB === 'undefined') return Promise.resolve([]);
    return DB.getAll();
  }

  function getCategories() {
    if (typeof CategoryDB === 'undefined') return Promise.resolve([]);
    return CategoryDB.getAll();
  }

  function getBrands() {
    // Chưa có CMS module Brand riêng — suy ra danh sách brand duy nhất từ
    // field "brand" có sẵn trên Product (xem AI_RULES.md/ROADMAP.md).
    return getProducts().then(products => {
      const set = new Set();
      products.forEach(p => { if (p.brand) set.add(p.brand); });
      return Array.from(set).sort();
    });
  }

  function getMedia(productId) {
    // Chưa có Media Library CMS module — trả về ảnh sẵn có của chính
    // Product được chỉ định làm nguồn "media" duy nhất khả dụng.
    if (!productId) return Promise.resolve([]);
    return getProduct(productId).then(p => {
      if (!p) return [];
      return Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    });
  }

  function getBlogPost(id) {
    if (typeof BlogDB === 'undefined' || !id) return Promise.resolve(null);
    return BlogDB.get(id);
  }

  function getBlogPosts() {
    if (typeof BlogDB === 'undefined') return Promise.resolve([]);
    return BlogDB.getAll();
  }

  function getSEO() {
    if (typeof SeoDB === 'undefined') return Promise.resolve({});
    return SeoDB.get();
  }

  function getSettings() {
    if (typeof SiteContentDB === 'undefined') return Promise.resolve({});
    return SiteContentDB.get().then(content => content.settings || {});
  }

  return { getProduct, getProducts, getCategories, getBrands, getMedia, getBlogPost, getBlogPosts, getSEO, getSettings };
})();
