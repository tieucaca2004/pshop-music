# PSH Platform — Kiến trúc tổng thể

## Tổng quan

PSH Platform (Pshop Music) là site tĩnh 100%: vanilla HTML/CSS/JS, không build step, deploy thẳng lên Netlify. Không có server/backend riêng — toàn bộ dữ liệu động (sản phẩm, danh mục, blog, banner, slider, cài đặt, người dùng, AI Assistant) chạy qua Firebase (Realtime Database + Authentication + Storage) gọi thẳng từ trình duyệt.

```
Trình duyệt (khách + admin)
   ├─ Site khách (index/category/blog/videos.html) — đọc dữ liệu công khai
   └─ CMS Admin (/admin/*.html) — Firebase Auth, đọc + ghi dữ liệu
          │
          ▼
   Firebase (Realtime Database + Authentication + Storage)
```

Không có Cloud Functions, không có máy chủ ứng dụng riêng — mọi logic (kể cả AI Assistant) chạy phía client, được bảo vệ bằng Firebase Auth + Database Rules (không phải bằng backend kiểm soát).

## Các lớp trong hệ thống

1. **Site khách** — `index.html`, `category.html`, `blog.html`, `blog-post.html`, `videos.html`. Render từ dữ liệu Firebase qua `js/db.js`/`js/cms-db.js`, có fallback seed (`js/*-seed.js`) để không "trắng trang" khi Firebase chậm/lỗi.
2. **CMS Admin** (`admin/*.html`) — 13 trang quản lý (Dashboard, Product/Category/Banner/Slider/Blog/Video/Menu/Footer/SEO/Settings/Users Manager), bảo vệ bằng `js/admin-auth.js` (Firebase Auth guard, 2 vai trò Admin/Editor).
3. **AI Assistant** (`admin/ai/*.html`, `js/ai/*`) — module con của CMS Admin, kiến trúc Plugin-Based Workflow (xem `AI_RULES.md`). Không phải 1 lớp độc lập — dùng chung Firebase, chung Auth, chung data layer với 2 lớp trên.

## Data layer (không đổi khi mở rộng tính năng)

- `js/db.js` — `DB` (sản phẩm), `SiteContentDB` (hero slider/category tiles/menu/footer/settings/dịch vụ).
- `js/cms-db.js` — `CategoryDB`, `BannerDB`, `BlogDB`, `VideoDB`, `SeoDB`, factory `makeListDB()` dùng chung cho mọi node dạng danh sách.
- `js/ai/ai-db.js` — `DraftDB`, `JobDB`, `LogDB` (tái dùng `makeListDB()`), `ProviderConfigDB`.
- `js/ai/plugin-db.js` — `PluginDB` (node `aiPlugins`, key = moduleId — không dùng `makeListDB()` vì cần key tùy chỉnh).
- `js/ai/data-provider.js` — `DataProvider` (`IDataProvider`): cổng đọc CMS DUY NHẤT cho AI Plugin (`getProduct/getProducts/getCategories/getBrands/getMedia/getBlogPost/getBlogPosts/getSEO/getSettings`) — bọc quanh `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB` ở trên, không thêm node Firebase mới. Xem mục "Data Provider Layer" bên dưới.

Mọi tính năng mới (kể cả AI) đều phải tái sử dụng các hàm data layer đã có (`DB.get/update`, `BlogDB.add/update`, `SiteContentDB.get/save`...) thay vì viết logic ghi Firebase mới — nguyên tắc xuyên suốt từ CMS ban đầu tới AI Assistant.

## Vị trí AI Assistant trong tổng thể

AI Assistant KHÔNG phải chatbot, KHÔNG có quyền ghi trực tiếp vào dữ liệu gốc. Nó là 1 tập Plugin chạy qua Job Queue phía trình duyệt Admin, đọc CMS thật, sinh **Draft**, chờ Admin duyệt mới ghi vào dữ liệu thật (qua đúng hàm data layer ở trên). Chi tiết đầy đủ: xem `AI_RULES.md`.

## Data Provider Layer (Sprint 2, Requirement #3)

AI Plugin **không bao giờ** gọi thẳng `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB`. Mọi truy vấn CMS của plugin đi qua đúng 1 cổng trung gian:

```
AI Plugin → DataProvider (IDataProvider) → CMS Database (Firebase) → Context → AI Provider
```

`DataProvider` (`js/ai/data-provider.js`) chỉ có hàm đọc (`get*`), không có hàm ghi — đúng nguyên tắc "AI không được tự sửa dữ liệu gốc". Đổi nguồn dữ liệu trong tương lai (nếu có) chỉ cần viết lại nội dung file này theo đúng interface `IDataProvider`, không phải sửa từng plugin trong `js/ai/modules/*.js`.

`getBrands()` và `getMedia(productId)` hiện suy ra từ dữ liệu Product có sẵn (field `brand`, `images`) vì CMS chưa có module Brand/Media Library riêng — xem `AI_RULES.md`/`ROADMAP.md`.

## Giới hạn kiến trúc đã biết (không tự ý "vá" bằng cách thêm hạ tầng mới)

- **Không có backend/Cloud Functions** — Job Queue AI xử lý tuần tự phía trình duyệt Admin (V1). Nâng cấp lên Cloud Functions là quyết định kiến trúc cần người phụ trách xác nhận trước, không tự triển khai — xem `ROADMAP.md`.
- **Không có Media Library CMS module** — ảnh hiện quản lý rời rạc theo từng field (product/banner/slider/blog cover) qua Firebase Storage, không có kho ảnh trung tâm để duyệt/chọn lại.
- **Sản phẩm không có trang riêng** — chỉ hiển thị dạng lưới + modal trên `category.html`, không có URL/route riêng từng sản phẩm để đặt thẻ Meta/OG/Schema riêng.

## Lịch sử phát triển

Xem `CHANGELOG.md` cho từng đợt (Sprint) và mốc thay đổi cụ thể.
