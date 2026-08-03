/*!
 * product-runtime-render.js — PRODUCT RUNTIME MIGRATION
 * Cơ chế chung (kiến trúc) cho mọi trang Product Detail:
 * Website dùng Product Database làm nguồn dữ liệu DUY NHẤT cho SEO + display,
 * KHÔNG phụ thuộc products-seed.js hay HTML hardcoded cho Product Detail.
 *
 * Cách dùng: mỗi product-*.html khai báo trước script này:
 *   <script>window.PRODUCT_ID = '41';</script>
 *   <script src="js/db.js" defer></script>
 *   <script src="js/product-runtime-render.js" defer></script>
 *
 * Script đọc DB.get(PRODUCT_ID), render <head> SEO từ Database:
 *   title, meta description, keywords, canonical, og:title, og:description,
 *   og:image, og:url, twitter — và display (product-title, product-price).
 */
(function () {
  var id = (typeof window.PRODUCT_ID !== 'undefined') ? window.PRODUCT_ID : null;
  if (!id || typeof DB === 'undefined') return;

  function resolveUrl() {
    // canonical mặc định theo URL hiện tại của trang, bỏ query/hash
    return location.origin + location.pathname;
  }
  function textOf(v) {
    if (!v) return '';
    // bỏ thẻ HTML, gộp khoảng trắng
    return String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function setMeta(attr, name, content) {
    if (!content) return;
    var el = document.querySelector(attr + '[name="' + name + '"]') ||
             document.querySelector(attr + '[property="' + name + '"]');
    if (el) { el.content = content; return; }
    var m = document.createElement('meta');
    if (attr === 'meta') { m.name = name; } else { m.setAttribute('property', name); }
    m.content = content;
    document.head.appendChild(m);
  }
  function setCanonical(url) {
    var c = document.querySelector('link[rel="canonical"]');
    if (c) { c.href = url; return; }
    var l = document.createElement('link');
    l.rel = 'canonical'; l.href = url;
    document.head.appendChild(l);
  }

  function apply(p) {
    if (!p) return;
    var title = textOf(p.seoTitle || p.name) || '';
    var desc = textOf(p.metaDescription || p.shortDescription || p.description) || '';
    var kw = Array.isArray(p.seoKeywords) ? p.seoKeywords.join(', ')
            : (p.seoKeywords ? String(p.seoKeywords) : '');
    var img = p.ogImage || p.image || p.backgroundImage || '';
    var url = p.canonical || resolveUrl();
    var brand = p.brand || '';

    // SEO
    if (title) {
      document.title = title;
      setMeta('meta', 'title', title);
      setMeta('meta', 'og:title', title);
      setMeta('meta', 'twitter:title', title);
    }
    if (desc) {
      setMeta('meta', 'description', desc);
      setMeta('meta', 'og:description', desc);
      setMeta('meta', 'twitter:description', desc);
    }
    if (kw) setMeta('meta', 'keywords', kw);
    if (img) {
      setMeta('meta', 'og:image', img);
      setMeta('meta', 'og:image:secure_url', img);
      setMeta('meta', 'twitter:image', img);
    }
    setMeta('meta', 'og:url', url);
    if (brand) setMeta('meta', 'product:brand', brand);
    setCanonical(url);

    // Display data (nếu có container chuẩn trong trang)
    var t = document.getElementById('product-title');
    if (t && title) t.textContent = title;
    var pr = document.getElementById('product-price');
    if (pr && p.price) pr.textContent = p.price;
  }

  function boot() {
    if (!DB || !DB.get) return;
    DB.get(id).then(apply).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
