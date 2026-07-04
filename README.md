# Pshop Music — E-Commerce Site + CMS

Static, light/editorial e-commerce site for Pshop Music (DJ & audio equipment, Nha Trang). Vanilla HTML/CSS/JS — no build step, deploy as-is. Backed by Firebase (Realtime Database + Authentication + Storage) so every visitor shares the same live data and the whole site is manageable from a real admin CMS.

## Structure

```
index.html              Trang chủ (hero, danh mục, dịch vụ, liên hệ) — tối giản, không liệt kê sản phẩm
category.html           Danh sách sản phẩm theo danh mục (?cat=dj|loa|tainghe|soundcard|phukien)
blog.html               Danh sách bài viết blog
blog-post.html          Chi tiết 1 bài viết (?slug=...)
videos.html             Thư viện video (YouTube/Vimeo nhúng)
admin.html              Redirect sang admin/index.html (giữ link cũ không bị hỏng)
admin/                  Toàn bộ CMS — xem "CMS Admin" bên dưới
css/style.css           Style dùng chung cho site khách
css/admin.css           Style riêng cho CMS admin
js/db.js                DB (sản phẩm) + SiteContentDB (hero/category tiles/menu/footer/settings/dịch vụ)
js/cms-db.js            CategoryDB, BannerDB, BlogDB, VideoDB, SeoDB — cùng pattern Promise-based với db.js
js/site-content-seed.js Dữ liệu mặc định (seed) cho toàn bộ site — dùng khi Firebase rỗng lần đầu
js/products-seed.js     42 sản phẩm gốc trích từ pshopmusic.html
js/site-chrome.js       Render menu + footer động trên mọi trang khách (dùng chung)
js/admin-auth.js        Firebase Auth guard + sidebar dùng chung cho mọi trang admin/*.html
js/storage-upload.js    Helper upload ảnh lên Firebase Storage
js/video-utils.js       Parse link YouTube/Vimeo → embed URL + thumbnail
js/ai/                  AI Assistant (Workflow Engine) — xem mục "AI Assistant" bên dưới
admin/ai/               Giao diện quản trị AI Assistant — xem mục "AI Assistant" bên dưới
data/products.json      Bản sao dữ liệu sản phẩm (tham khảo/backup)
scripts/extract.js      Script trích xuất sản phẩm từ pshopmusic.html gốc (đã chạy 1 lần)
scripts/generate-sitemap.js  Tạo lại sitemap.xml từ dữ liệu Firebase thật — chạy: node scripts/generate-sitemap.js
robots.txt, sitemap.xml SEO
netlify.toml            Cấu hình deploy Netlify (tắt pretty_urls để giữ query string ?cat=...)
```

## Running locally

No build step needed:
```
npx serve .
```
(Mở `index.html` trực tiếp bằng file:// cũng chạy được, nhưng nên dùng server tĩnh ở trên để tránh vài quirk của trình duyệt.)

## CMS Admin — `/admin/`

| Trang | Vai trò yêu cầu | Chức năng |
|---|---|---|
| `admin/login.html` | — | Đăng nhập Firebase Auth. Nếu chưa có tài khoản nào (`roles` rỗng), hiện form tạo Admin đầu tiên. |
| `admin/index.html` | Editor/Admin | Dashboard — số liệu tổng quan, link nhanh tới mọi mục. |
| `admin/products.html` | Editor/Admin | Product Manager — CRUD sản phẩm, mô tả rich text (Quill), nhiều ảnh, upload ảnh. |
| `admin/categories.html` | Editor/Admin | Category Manager — danh sách danh mục gốc + ô danh mục hiển thị trang chủ. |
| `admin/banners.html` | Editor/Admin | Banner Manager — banner quảng cáo theo "zone" (hiện có zone `home-top`). |
| `admin/sliders.html` | Editor/Admin | Slider Manager — slide ảnh hero trang chủ. |
| `admin/blog.html` | Editor/Admin | Blog Manager — bài viết, slug, SEO, publish/draft. |
| `admin/videos.html` | Editor/Admin | Video Manager — link YouTube/Vimeo. |
| `admin/menu.html` | **Admin** | Menu Manager — menu điều hướng mọi trang. |
| `admin/footer.html` | **Admin** | Footer Manager — cột footer, mạng xã hội, bản quyền. |
| `admin/seo.html` | **Admin** | SEO Manager — Google Analytics, Search Console, mô tả/ảnh mặc định. |
| `admin/settings.html` | **Admin** | Cài đặt chung — thông tin liên hệ, nội dung mục Dịch vụ. |
| `admin/users.html` | **Admin** | Người dùng & Phân quyền — tạo tài khoản, gán vai trò, thu hồi quyền. |
| `admin/ai/index.html` | Editor/Admin | AI Assistant Dashboard — chạy từng module (Blog Writer, SEO Generator...). |
| `admin/ai/drafts.html` | Editor/Admin | Duyệt nội dung AI — xem trước, Duyệt & Publish, hoặc Từ chối. |
| `admin/ai/jobs.html` | Editor/Admin | Job Queue — theo dõi tiến độ, hủy job đang chạy. |
| `admin/ai/logs.html` | **Admin** | Nhật ký mọi lượt gọi AI (thời gian, người thực hiện, provider, thành/bại). Hỗ trợ lọc `?module=<id>`. |
| `admin/ai/providers.html` | **Admin** | Chọn/bật nhà cung cấp AI (chưa tích hợp API thật — xem mục AI Assistant). |
| `admin/ai/plugins.html` | Editor/Admin | Plugin Manager (Sprint 2) — bật/tắt, version, gán provider riêng từng plugin. |

Vai trò: **Admin** (toàn quyền) và **Editor** (không vào được Menu/Footer/SEO/Cài đặt/Người dùng). Vai trò lưu trong node `roles/{uid}` của Realtime Database, gán khi tạo tài khoản.

## Thiết lập Firebase (bắt buộc phải làm trước khi CMS dùng được)

Dự án Firebase hiện tại (`pshop-music`) đã có **Realtime Database**. Cần bật thêm 2 mục sau trong [Firebase Console](https://console.firebase.google.com):

1. **Authentication** → Sign-in method → bật **Email/Password**.
2. **Storage** → bật Storage (có thể yêu cầu nâng lên gói Blaze — vẫn miễn phí trong hạn mức, chỉ tính phí nếu vượt).
3. Vào **Realtime Database → Rules**, thay bằng:
   ```json
   {
     "rules": {
       "products": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "categories": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "banners": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "siteContent": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "blogPosts": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "videos": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "seoSettings": { ".read": true, ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "aiDrafts": { ".read": "auth != null && root.child('roles').child(auth.uid).exists()", ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "aiJobs": { ".read": "auth != null && root.child('roles').child(auth.uid).exists()", ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "aiLogs": { ".read": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'", ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "aiProviderConfig": { ".read": "auth != null && root.child('roles').child(auth.uid).exists()", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'" },
       "aiPlugins": { ".read": "auth != null && root.child('roles').child(auth.uid).exists()", ".write": "auth != null && root.child('roles').child(auth.uid).exists()" },
       "roles": {
         ".read": true,
         "$uid": {
           ".write": "auth != null && ((!root.child('roles').exists() && auth.uid === $uid) || root.child('roles').child(auth.uid).child('role').val() === 'admin')"
         }
       }
     }
   }
   ```
4. Vào **Storage → Rules**, thay bằng:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```
5. Truy cập `/admin/login.html` lần đầu → tạo tài khoản Admin đầu tiên ngay trên form (không cần vào Console tạo user).

⚠️ Trước khi 2 bước 1–4 hoàn tất, các trang admin mới (ngoài Product Manager cũ) và các node mới (banner/category/blog/video) sẽ báo lỗi kết nối rõ ràng trên console — trang khách vẫn chạy bình thường, không vỡ giao diện.

## SEO

- `robots.txt` chặn `/admin/`, trỏ tới `sitemap.xml`.
- `sitemap.xml` tạo bằng `node scripts/generate-sitemap.js` (đọc dữ liệu Firebase thật, không cần thiết lập gì thêm) — chạy lại mỗi khi thêm/xóa danh mục hoặc bài blog.
- Mỗi bài blog có JSON-LD `BlogPosting` + meta title/description/OG riêng, cập nhật động qua JS (client-side, không SSR).
- Google Analytics + xác minh Search Console cấu hình trong `admin/seo.html`, áp dụng tự động cho mọi trang khách qua `js/site-chrome.js`.

## Deploying to Netlify

1. `netlify.toml` đã tắt `pretty_urls` — bắt buộc để giữ query string (`?cat=...`, `?slug=...`) khi Netlify serve các trang `.html`.
2. Deploy: `npx netlify-cli deploy --dir=. --prod` (hoặc qua Git).
3. Đặt custom domain / HTTPS qua Netlify dashboard như bình thường.

## Contact integration

- Phone / Zalo, Facebook, Shopee: cấu hình trong `admin/settings.html` (Cài đặt chung) — áp dụng cho nav, footer, mục liên hệ trang chủ.
- Danh mục sản phẩm: `admin/categories.html` là nguồn duy nhất — đổi tên/thêm/xóa danh mục ở đây sẽ tự cập nhật dropdown Product Manager và tab lọc trên `category.html`.

## AI Assistant (Workflow Engine)

Kiến trúc: **CMS → AI Assistant → Draft → Review → Publish** — KHÔNG phải chatbot, AI không tự chạy, không tự publish, không tự bịa dữ liệu. Tài liệu chi tiết: `PROJECT_ARCHITECTURE.md` (kiến trúc tổng thể), `AI_RULES.md` (quy tắc bắt buộc), `ROADMAP.md` (việc chưa làm), `CHANGELOG.md` (lịch sử thay đổi), `docs/SPRINT_2_PROGRESS.md` (tiến độ Sprint hiện tại).

- **Chỉ đọc dữ liệu CMS thật** qua đúng `DB`/`CategoryDB`/`BlogDB`/... đã có, không tạo dữ liệu giả định.
- Mọi kết quả sinh ra lưu vào node **`aiDrafts`** riêng biệt — không bao giờ ghi thẳng vào `products`/`blogPosts`/`siteContent`/... Chỉ khi Admin bấm **Duyệt & Publish** ở `admin/ai/drafts.html` thì mới ghi vào dữ liệu thật, và luôn tái sử dụng đúng hàm ghi dữ liệu có sẵn (`BlogDB.add`, `DB.update`, `BannerDB.add`...).
- **Provider độc lập** (`js/ai/provider-registry.js` + `js/ai/providers/{openai,claude,gemini,deepseek}.js`) — đổi nhà cung cấp AI chỉ cần đổi `activeProvider` trong `admin/ai/providers.html`, không đụng Workflow/UI. **Chưa tích hợp API AI thật** — mọi provider hiện là stub, luôn trả lỗi rõ ràng "chưa cấu hình" khi chạy thử (đây là thiết kế của giai đoạn này, không phải lỗi).
- **Module/Plugin độc lập** (`js/ai/module-registry.js` + `js/ai/modules/*.js`): Blog Writer, Product Description Writer, SEO Generator, FAQ Generator, Facebook Post Generator, Image Prompt Generator, Slider Generator, Banner Generator — mỗi module 1 file, thêm/gỡ không ảnh hưởng module khác.
- **Job Queue** (`js/ai/job-queue.js`, node `aiJobs`) xử lý tuần tự từng mục — trên Dashboard, nhập nhiều dòng vào ô chủ đề = tạo hàng loạt (vd 100 dòng = 100 bài).
  - ⚠️ **V1 (hiện tại): chạy phía trình duyệt Admin** — giữ đúng kiến trúc site tĩnh hiện có (Frontend + Firebase Auth/Database/Storage), không thêm Cloud Functions/backend. Nếu đóng tab `admin/ai/jobs.html` giữa chừng, job dở sẽ tiếp tục khi mở lại trang đó. Thiết kế sau interface (`enqueue/resume/cancel`) để thay implementation mà không đổi API/UI khi nâng cấp.
  - **Roadmap V2**: chuyển xử lý sang Firebase Cloud Functions (trigger theo `aiJobs`) — xử lý tuần tự thật, không phụ thuộc trình duyệt Admin còn mở; đồng thời proxy lời gọi AI thật qua Cloud Function để API key nhà cung cấp không lộ ra client.
  - **Roadmap V3**: dedicated queue service (vd Cloud Tasks) khi quy mô lớn hơn.
- **Log đầy đủ** (`aiLogs`, xem tại `admin/ai/logs.html`, Admin-only): thời gian, người thực hiện, module, provider, thời gian xử lý, thành/bại — ghi cả khi thất bại vì chưa cấu hình provider.

## Notes

- Toàn bộ dữ liệu mới (menu/footer/settings/danh mục...) dùng cơ chế "seed nếu rỗng, backfill nếu thiếu key" trong `SiteContentDB`/`CategoryDB` — không ghi đè dữ liệu admin đã tự chỉnh.
- `wordpress-theme/` là gói theme WordPress dựng ở giai đoạn đầu, hiện **không đồng bộ** với kiến trúc CMS mới này — bỏ qua trừ khi được yêu cầu cập nhật riêng.
