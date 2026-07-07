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
js/storage-upload.js    Helper upload ảnh lên Firebase Storage (Sprint 1) — MediaLibrary.upload() vẫn dùng lại hàm này
js/media-library.js     Media Library (Sprint 8) — kho ảnh dùng chung, duyệt/tìm/xóa trực tiếp trên Firebase Storage
js/media-library-picker.js  Giao diện chọn ảnh dùng chung cho Product/Blog/Banner/Slider/Category — thay việc gõ URL thủ công
js/video-utils.js       Parse link YouTube/Vimeo → embed URL + thumbnail
js/ai/                  AI Assistant (Workflow Engine) — xem mục "AI Assistant" bên dưới
admin/ai/               Giao diện quản trị AI Assistant — xem mục "AI Assistant" bên dưới
data/products.json      Bản sao dữ liệu sản phẩm (tham khảo/backup)
scripts/extract.js      Script trích xuất sản phẩm từ pshopmusic.html gốc (đã chạy 1 lần)
scripts/generate-sitemap.js  Tạo lại sitemap.xml từ dữ liệu Firebase thật — chạy: node scripts/generate-sitemap.js
robots.txt, sitemap.xml SEO
netlify.toml            Cấu hình deploy Netlify (tắt pretty_urls để giữ query string ?cat=...)
database.rules.json     Firebase Realtime Database Security Rules (Sprint 8) — nguồn sự thật duy nhất, deploy qua `firebase deploy --only database`
storage.rules           Firebase Storage Security Rules (Sprint 9) — nguồn sự thật duy nhất, deploy qua `firebase deploy --only storage`
firebase.json           Cấu hình Firebase CLI (trỏ tới `database.rules.json`, `storage.rules`, Cloud Functions trong `functions/`)
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
| `admin/ai/assistant.html` | Editor/Admin | AI Assistant hội thoại (Sprint 4) — điểm tương tác dạng chat, định tuyến qua `AITaskRouter` cho các plugin nhắm 1 Product/Blog Post cụ thể. |
| `admin/ai/drafts.html` | Editor/Admin | Duyệt nội dung AI — xem trước, Duyệt & Publish, hoặc Từ chối. |
| `admin/ai/jobs.html` | Editor/Admin | Job Queue — theo dõi tiến độ, hủy job đang chạy. |
| `admin/ai/logs.html` | **Admin** | Nhật ký mọi lượt gọi AI (thời gian, người thực hiện, provider, thành/bại). Hỗ trợ lọc `?module=<id>`. |
| `admin/ai/providers.html` | **Admin** | Chọn/bật nhà cung cấp AI (OpenAI tích hợp thật qua Cloud Function Proxy từ Sprint 3 — xem mục AI Assistant; Claude/Gemini/DeepSeek vẫn là stub). |
| `admin/ai/plugins.html` | Editor/Admin | Plugin Manager (Sprint 2) — bật/tắt, version, gán provider riêng từng plugin. Cả 8/8 plugin viết từ Sprint 1 đã Production từ Sprint 6. |
| `admin/ai/health.html` | **Admin** | Health Check (Sprint 5) — tình trạng kết nối Provider đang active + Queue + Draft Workflow. |
| `admin/ai/context-builder.html` | **Admin** | Context Builder Preview (Sprint 7) — xem thử Context Package (`DataProvider` → prompt text) cho 1 Product/Blog Post, hạ tầng dùng chung, chưa Plugin nào áp dụng. |
| `admin/ai/workflow.html` | **Admin** | Workflow Automation (Sprint 7) — ghép nhiều Plugin chạy tuần tự thủ công (Admin tự bấm "Chạy Workflow"), không lưu lại định nghĩa Workflow. |
| `admin/ai/workflow-insights.html` | **Admin** | Workflow Insights (Sprint 7) — Timeline từng AI Request (Context → Queue → Provider → Draft → Human Review), chỉ đọc. |
| `admin/ai/cost-tracking.html` | **Admin** | Cost Tracking (Sprint 7) — chi phí ƯỚC TÍNH theo Provider/Plugin (số lượt Generate thành công × đơn giá tham khảo tĩnh), KHÔNG phải Billing/token thật. |
| `admin/ai/observability.html` | **Admin** | Observability Dashboard (Sprint 7) — gộp Health/Provider/Queue/Plugin/Usage/Draft vào 1 màn hình, chỉ đọc. |

Vai trò: **Admin** (toàn quyền) và **Editor** (không vào được Menu/Footer/SEO/Cài đặt/Người dùng). Vai trò lưu trong node `roles/{uid}` của Realtime Database, gán khi tạo tài khoản.

## Thiết lập Firebase (bắt buộc phải làm trước khi CMS dùng được)

Dự án Firebase hiện tại (`pshop-music`) đã có **Realtime Database**. Cần bật thêm 2 mục sau trong [Firebase Console](https://console.firebase.google.com):

1. **Authentication** → Sign-in method → bật **Email/Password**.
2. **Storage** → bật Storage (có thể yêu cầu nâng lên gói Blaze — vẫn miễn phí trong hạn mức, chỉ tính phí nếu vượt).
3. **Realtime Database Rules**: KHÔNG copy tay vào Console — dùng đúng file đã version-control trong repo, `database.rules.json` (Sprint 8 Requirement #1), là nguồn sự thật duy nhất, đã đối chiếu với RBAC thật trong `js/ai/permission-service.js` và có bộ kiểm thử riêng (xem `CHANGELOG.md` Sprint 8 Requirement #1 và #4). Deploy bằng Firebase CLI:
   ```
   firebase deploy --only database
   ```
   (yêu cầu đã cài Firebase CLI + `firebase login`, đúng project với Firebase Console.)

   ⚠️ **Quan trọng**: `database.rules.json` **chưa từng được deploy** lên môi trường thật tính đến thời điểm này (xem `ROADMAP.md` mục "Firebase Database Rules"). Rules đang chạy thật trên Firebase Console hiện tại có thể vẫn là một bản cấu hình cũ hơn/kém an toàn hơn (không phân biệt vai trò Admin/Editor, để lộ node `roles` công khai vĩnh viễn) — **hãy vào Firebase Console → Realtime Database → Rules để đối chiếu trước khi giả định Rules đã đúng**, rồi deploy bản trong repo.
4. **Storage Rules**: KHÔNG copy tay vào Console — dùng đúng file đã version-control trong repo, `storage.rules` (Sprint 9 Requirement #3), là nguồn sự thật duy nhất. Deploy bằng Firebase CLI:
   ```
   firebase deploy --only storage
   ```
   (yêu cầu đã cài Firebase CLI + `firebase login`, đúng project với Firebase Console.)

   Ruleset: đọc 1 file cụ thể (`get`) công khai — giữ nguyên như trước, trang khách hotlink ảnh trực tiếp; liệt kê thư mục/bucket (`list`) chỉ dành cho người đã đăng nhập (THẮT CHẶT so với ruleset thủ công cũ, vốn ngầm cho `list` công khai qua `allow read: if true` — chỉ Media Library mới cần `listAll()`, không trang khách nào cần); ghi/xóa (`write`) giữ nguyên yêu cầu đã đăng nhập, không phân biệt Admin/Editor (đúng hành vi CMS thật — Media Library cho phép cả Editor xóa ảnh). Xem `storage.rules` (chú thích đầy đủ) và `PROJECT_ARCHITECTURE.md` cho lý do không thể siết `write` theo đúng vai trò Admin/Editor (giới hạn kỹ thuật thật của Firebase, không phải bỏ sót).

   ⚠️ **Quan trọng**: `storage.rules` **chưa từng được deploy** lên môi trường thật tính đến thời điểm này (xem `ROADMAP.md` mục "Firebase Storage Security Rules"). Rules đang chạy thật trên Firebase Console hiện tại có thể vẫn cho `list` công khai (bất kỳ ai cũng liệt kê được toàn bộ đường dẫn file trong Storage) — **hãy vào Firebase Console → Storage → Rules để đối chiếu trước khi giả định Rules đã đúng**, rồi deploy bản trong repo.
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

Kiến trúc: **CMS → AI Assistant → Draft → Review → Publish** — KHÔNG phải chatbot, AI không tự chạy, không tự publish, không tự bịa dữ liệu. Tài liệu chi tiết: `PROJECT_ARCHITECTURE.md` (kiến trúc tổng thể), `AI_RULES.md` (quy tắc bắt buộc), `ROADMAP.md` (việc chưa làm), `CHANGELOG.md` (lịch sử thay đổi, Sprint 2 → Sprint 9), `SPRINT_9_PLANNING.md` (kế hoạch Sprint đang chờ phê duyệt), `docs/SPRINT_8_FINAL_REPORT.md` (báo cáo Sprint gần nhất đã đóng).

- **Chỉ đọc dữ liệu CMS thật** qua đúng `DB`/`CategoryDB`/`BlogDB`/... đã có, không tạo dữ liệu giả định.
- Mọi kết quả sinh ra lưu vào node **`aiDrafts`** riêng biệt — không bao giờ ghi thẳng vào `products`/`blogPosts`/`siteContent`/... Chỉ khi Admin bấm **Duyệt & Publish** ở `admin/ai/drafts.html` thì mới ghi vào dữ liệu thật, và luôn tái sử dụng đúng hàm ghi dữ liệu có sẵn (`BlogDB.add`, `DB.update`, `BannerDB.add`...).
- **Provider độc lập** (`js/ai/provider-registry.js` + `js/ai/providers/{openai,claude,gemini,deepseek}.js`) — đổi nhà cung cấp AI chỉ cần đổi `activeProvider` trong `admin/ai/providers.html`, không đụng Workflow/UI. **OpenAI đã tích hợp API thật từ Sprint 3** qua Cloud Function Proxy (`functions/openaiProxy` — API key giữ trong Secret Manager, không lộ ra client; xem `ARCHITECTURE_REVIEW_SPRINT3.md`), tuy Cloud Function này chưa được deploy lên môi trường thật (thao tác vận hành, xem `ROADMAP.md`). Claude/Gemini/DeepSeek vẫn là stub, luôn trả lỗi rõ ràng "chưa cấu hình" khi chạy thử.
- **Module/Plugin độc lập** (`js/ai/module-registry.js` + `js/ai/modules/*.js`): Blog Writer, Product Description Writer, SEO Generator, FAQ Generator, Facebook Post Generator, Image Prompt Generator, Slider Generator, Banner Generator — mỗi module 1 file, thêm/gỡ không ảnh hưởng module khác. Cả 8/8 plugin đã Production từ Sprint 6 (không còn plugin "coming soon").
- **Job Queue** (`js/ai/job-queue.js`, node `aiJobs`) xử lý tuần tự từng mục — trên Dashboard, nhập nhiều dòng vào ô chủ đề = tạo hàng loạt (vd 100 dòng = 100 bài). Từ Sprint 8 Requirement #3, Queue có thêm khoá mềm (`aiJobs/{jobId}/lock`, qua Firebase `transaction()`) chống 2 tab/2 Admin cùng xử lý trùng 1 Job.
  - ⚠️ **V1 (hiện tại): chạy phía trình duyệt Admin** — giữ đúng kiến trúc site tĩnh hiện có (Frontend + Firebase Auth/Database/Storage), không thêm Cloud Functions/backend. Nếu đóng tab `admin/ai/jobs.html` giữa chừng, job dở sẽ tiếp tục khi mở lại trang đó. Thiết kế sau interface (`enqueue/resume/cancel`) để thay implementation mà không đổi API/UI khi nâng cấp.
  - **Roadmap V2**: chuyển xử lý sang Firebase Cloud Functions (trigger theo `aiJobs`) — xử lý tuần tự thật, không phụ thuộc trình duyệt Admin còn mở; đồng thời proxy lời gọi AI thật qua Cloud Function để API key nhà cung cấp không lộ ra client.
  - **Roadmap V3**: dedicated queue service (vd Cloud Tasks) khi quy mô lớn hơn.
- **Log đầy đủ** (`aiLogs`, xem tại `admin/ai/logs.html`, Admin-only): thời gian, người thực hiện, module, provider, thời gian xử lý, thành/bại — ghi cả khi thất bại vì chưa cấu hình provider.
- **Đã bổ sung từ Sprint 5-7** (đọc, không thay đổi luồng bắt buộc ở trên): Health Check (`admin/ai/health.html`), Cost Tracking ước tính (`admin/ai/cost-tracking.html`), Context Builder — Context Package dùng chung từ `DataProvider` (`admin/ai/context-builder.html`, chưa Plugin nào dùng), Workflow Automation — ghép nhiều Plugin chạy tuần tự thủ công, không lưu lại định nghĩa (`admin/ai/workflow.html`), Workflow Insights — Timeline từng AI Request, chỉ đọc (`admin/ai/workflow-insights.html`), Observability Dashboard — gộp mọi trạng thái vào 1 màn hình (`admin/ai/observability.html`). Chi tiết đầy đủ: `PROJECT_ARCHITECTURE.md`, `CHANGELOG.md`.

## Media Library (Sprint 8)

Kho ảnh dùng chung cho Product/Blog/Banner/Slider/Category — xây hoàn toàn trên Firebase Storage đã có (`js/storage-upload.js`), không thêm Database node nào. `js/media-library.js` (duyệt đệ quy toàn bộ Storage Bucket, tìm theo tên, upload, xóa) + `js/media-library-picker.js` (Experience Layer: Preview thumbnail, chọn/thay/xóa ảnh, kéo thả để tải lên — không còn ô nhập URL thủ công trên giao diện mặc định). Ảnh mới tải qua Media Library gộp vào thư mục `media/`; ảnh cũ tải trước Sprint 8 (rải rác ở `products/`, `banners/`...) vẫn hiển thị đầy đủ vì Media Library đọc trực tiếp từ Storage, không cần migrate. `js/ai/data-provider.js` (AI Framework) **chưa đọc từ Media Library này** — vẫn suy ra ảnh từ `product.images` của từng sản phẩm như trước (xem `ROADMAP.md`).

## Notes

- Toàn bộ dữ liệu mới (menu/footer/settings/danh mục...) dùng cơ chế "seed nếu rỗng, backfill nếu thiếu key" trong `SiteContentDB`/`CategoryDB` — không ghi đè dữ liệu admin đã tự chỉnh.
- `wordpress-theme/` là gói theme WordPress dựng ở giai đoạn đầu, hiện **không đồng bộ** với kiến trúc CMS mới này — bỏ qua trừ khi được yêu cầu cập nhật riêng.
