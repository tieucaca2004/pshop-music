# CMS ARCHITECTURE

Chỉ mục tổng hợp kiến trúc CMS của PSH Platform.

## 1. Data layer

- **Firebase Realtime Database** — nguồn dữ liệu thật (Products, Categories, Brands, Media, Blog, SEO, Settings, aiDrafts, apiAsyncJobs).
- **DB classes (Promise-based pattern):** `js/db.js` (DB + SiteContentDB), `js/cms-db.js` (CategoryDB, BannerDB, BlogDB, VideoDB, SeoDB).
- **Seed:** `js/site-content-seed.js` (mặc định khi Firebase rỗng), `js/products-seed.js` (42 sản phẩm gốc).

## 2. Admin CMS (`admin/`)

| Trang | Vai trò | Chức năng |
|---|---|---|
| admin/login.html | — | Firebase Auth, tạo Admin đầu tiên nếu roles rỗng |
| admin/index.html | Editor/Admin | Dashboard |
| admin/products.html | Editor/Admin | Product Manager — CRUD, Quill, nhiều ảnh, upload |
| admin/categories.html / banners.html / sliders.html / blog.html / videos.html | Editor/Admin | Category/Banner/Slider/Blog/Video Manager |
| admin/menu.html / footer.html / seo.html / settings.html | Admin | Menu/Footer/SEO/Cài đặt |
| admin/users.html | Admin | Users & phân quyền |
| admin/ai/* | Editor/Admin | AI Assistant (assistant, drafts, jobs, logs, providers, plugins, health, context-builder, workflow, workflow-insights, cost-tracking, observability) |

Vai trò: **Admin** (toàn quyền), **Editor** (không Menu/Footer/SEO/Cài đặt/Users). Lưu tại node `roles/{uid}`.

## 3. Product SEO (Product 41)

- 6 field SEO trong Database: `seoTitle`, `metaDescription`, `seoKeywords`, `canonical`, `ogImage`, `slug`.
- Website Product Detail hiện render SEO từ HTML hardcode + `products-seed.js` (KHÔNG đọc DB) — xem `docs/product-runtime/PRODUCT_RUNTIME_ARCHITECTURE.md`.

## 4. Nguồn sự thật

- GitHub = Single Source of Truth. Runtime Evidence thắng suy luận.

## Liên quan

- `docs/ARCHITECTURE.md` · `docs/DATABASE_STRUCTURE.md` · `docs/product-runtime/*`
