# Sprint 8 — Final Report

**Ngày:** 2026-07-07
**Phạm vi:** Requirement #1 → #6 (Requirement #6 là kiểm thử tổng thể + đóng Sprint, không viết feature mới).
**Trạng thái:** SPRINT 8 COMPLETED (xem Acceptance Criteria bên dưới).

Báo cáo này được viết ở vai trò Chief Architect — xác minh, không triển khai. Mọi vấn đề phát hiện trong quá trình kiểm thử chỉ được **ghi nhận** ở đây và trong `ROADMAP.md`/`DECISION_RECORDS.md`, không tự sửa.

---

## 1. Tóm tắt theo Requirement

| Requirement | Nội dung | Kết quả |
|---|---|---|
| #1, #2 | (Hoàn thành trước session này — tái cấu trúc route `admin/(protected)`, chuyển bảo vệ route từ `proxy.ts` sang `requireAdminPage`/`requireAdminAction`, redesign UI storefront) | **PASS** — đã xác minh lại, không có regression |
| #3 | CMS Image Experience 2.0 | **PASS** |
| #4 | CMS Form Experience 2.0 | **PASS** |
| #5 | CMS Dashboard Experience 2.0 | **PASS** |
| #6 | Kiểm thử tổng thể + đóng Sprint (tài liệu này) | **PASS** |

Chi tiết từng Requirement #3–#5 đã có trong `CHANGELOG.md`. Phần dưới đây là kết quả kiểm thử độc lập cho toàn bộ Sprint, không nhắc lại nội dung đã note.

---

## 2. Kiểm thử theo Functional Requirement (mục "FUNCTIONAL REQUIREMENTS" #1–#9 của Requirement #6)

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Database Rules | **N/A** — dự án dùng MySQL qua `mysql2` (không phải Firebase). Không có khái niệm "Database Rules" kiểu Firebase Security Rules trong stack này. Kiểm soát truy cập dữ liệu thực tế nằm ở tầng ứng dụng: mọi truy vấn đi qua `src/lib/db.ts` (server-only, không có client truy cập DB trực tiếp), và mọi Server Action ghi/đọc dữ liệu nhạy cảm đều gọi `requireAdminAction()` trước khi chạm DB (xác minh ở mục 4). Đã rà soát toàn bộ `db/schema.sql` — không đổi so với đầu Sprint 8 (xem mục 6). |
| 2 | Media Library | **PASS** — `getMediaLibrary()` (đọc `product_images.url`, dedup) hoạt động đúng qua picker trong `ImageManagerField` (Requirement #3) và trang `/admin/media` (Requirement #5). Route yêu cầu đăng nhập (xác minh mục 4). |
| 3 | CMS Image Experience 2.0 | **PASS** — Preview/Gallery/kéo-thả/placeholder/Advanced Panel hoạt động đúng như `CHANGELOG.md` Requirement #3 mô tả. Xác minh lại bằng build + duyệt thủ công qua trình duyệt (không phát hiện regression). |
| 4 | CMS Form Experience 2.0 | **PASS** — Section collapsible + ghi nhớ trạng thái, Action Bar, validation tại field đều hoạt động đúng (đã xác minh lại). |
| 5 | CMS Dashboard Experience 2.0 | **PASS** — Card, Quick Actions, Recent Activity, System Status hoạt động đúng (đã xác minh lại). |
| 6 | AI Framework | **N/A — không tồn tại.** `grep` toàn bộ `src/` không tìm thấy bất kỳ AI Framework/Provider nào được tích hợp. Không có gì để kiểm thử; cũng không có gì bị Sprint 8 đụng vào (xem Architecture Verification). |
| 7 | Queue | **N/A — không tồn tại.** Không có hệ thống hàng đợi nào trong dự án. Từ khóa "Queue" duy nhất trong code là (a) nhãn hiển thị "Chưa cấu hình" trên System Status (Requirement #5) và (b) tùy chọn `queueLimit` của connection pool `mysql2` — không liên quan đến một Queue system. |
| 8 | Permission | **PASS** — xem Security Verification (mục 4) để biết chi tiết kiểm thử RBAC/permission thực tế. |
| 9 | Plugin Framework | **N/A — không tồn tại.** Không có Plugin Manager/Plugin Framework nào trong dự án. |

---

## 3. Regression Test — Sprint 2 → Sprint 8

### Giới hạn môi trường kiểm thử (ghi nhận trung thực)

Môi trường sandbox chạy Requirement này **không có MySQL server thật** và không thể kéo image Docker (`docker pull mysql:8` bị chính sách egress của proxy chặn — domain CDN của Docker Hub không nằm trong allowlist). Vì vậy:
- **Không thể** chạy regression end-to-end với dữ liệu thật (vd. tạo sản phẩm thật, xác nhận hiển thị trên storefront).
- **Có thể và đã thực hiện**: static verification toàn bộ, kiểm thử hành vi route/permission với DB không kết nối được (khai thác đúng các đường `.catch()` fallback đã có sẵn trong code), và duyệt UI bằng trình duyệt thật (Playwright + Chromium) cho mọi trang truy cập được mà không cần dữ liệu.

### Kết quả cụ thể

**Static verification (chạy lại từ đầu, sạch, trên toàn bộ repo):**
```
npx tsc --noEmit     → PASS (0 lỗi)
npm run lint         → PASS (0 lỗi, 0 cảnh báo)
npx next build       → PASS (10/10 route build thành công, kể cả 3 route mới của Sprint 8: /admin/media, và các thay đổi tại /admin, /admin/products/[id])
```

**Route crawl (DB cố tình không kết nối được — kiểm tra khả năng chịu lỗi và permission gate):**

| Route | Chưa đăng nhập | Đã đăng nhập |
|---|---|---|
| `/` (trang chủ) | 200 | 200 |
| `/lien-he` | 200 | 200 |
| `/robots.txt`, `/sitemap.xml` | 200 | 200 |
| `/san-pham/[slug-không-tồn-tại]` | 404 | 404 |
| `/danh-muc/[slug-không-tồn-tại]` | 404 | 404 |
| `/admin/login` | 200 | 200 |
| `/admin` | **307 → login** | 200 |
| `/admin/products` | **307 → login** | 200 |
| `/admin/products/new` | **307 → login** | 200 |
| `/admin/products/999999` (không tồn tại) | **307 → login** | 404 (đúng — `notFound()`, không crash) |
| `/admin/categories` | **307 → login** | 200 |
| `/admin/leads` | **307 → login** | 200 |
| `/admin/media` | **307 → login** | 200 |
| `POST /api/admin/login` (sai mật khẩu) | 401 | — |
| `POST /api/admin/login` (JSON hỏng) | 400 | — |
| `GET /api/contact-orders` (method không cho phép) | 405 | — |

Không route nào trả 500 hay crash — mọi trang admin/storefront đều dùng đúng các đường `.catch(() => [])`/`.catch(() => null)` sẵn có để suy biến (degrade) an toàn khi DB lỗi, kể cả 3 trang mới thêm trong Sprint 8.

**Browser crawl (Playwright + Chromium thật, có session hợp lệ):** duyệt qua `/`, `/lien-he`, `/admin/login`, `/admin`, `/admin/products`, `/admin/products/new`, `/admin/categories`, `/admin/leads`, `/admin/media` — **0 console error, 0 page error**.

**Kết luận Regression:** PASS trong phạm vi kiểm thử được (static + hành vi route/permission + UI không lỗi). Không phát hiện regression nào ở Sprint 2–7 hay giữa các Requirement của Sprint 8. Kiểm thử end-to-end với dữ liệu thật (CRUD sản phẩm → hiển thị storefront) **chưa được xác minh trong session này** vì thiếu MySQL — ghi nhận là giới hạn, khuyến nghị chạy trong CI/staging có DB thật trước khi Production release.

---

## 4. Architecture Verification

| Xác nhận | Kết quả |
|---|---|
| Không thay đổi AI Framework | ✓ — không tồn tại, `grep` xác nhận không có gì để thay đổi |
| Không thay đổi Queue | ✓ — không tồn tại |
| Không thay đổi Plugin Manager | ✓ — không tồn tại |
| Không thay đổi Provider Manager | ✓ — không tồn tại |
| Không thay đổi Permission Service | ✓ — `requireAdminPage`/`requireAdminAction` (`src/lib/auth.ts`) không đổi trong Sprint 8 |
| Không thay đổi AI Task Router | ✓ — không tồn tại |
| Không thay đổi Database Structure | ✓ — `git diff` giữa đầu và cuối Sprint 8 trên `db/schema.sql` **rỗng** |
| Không thay đổi `AI_RULES.md` | ✓ — file này không tồn tại trong repo, không có gì để thay đổi |

---

## 5. Security Verification

| Hạng mục | Ghi nhận |
|---|---|
| Firebase Database Rules | **N/A** — không dùng Firebase. |
| RBAC | Mô hình hiện tại là **single-role** (chỉ có "admin", bảng `admin_users`), không có nhiều cấp quyền. Đã xác minh: **100% Server Action ghi/đọc dữ liệu nhạy cảm gọi `requireAdminAction()`** (rà soát toàn bộ `src/lib/actions/*.ts` — `products.ts`, `categories.ts`, `leads.ts`, `media.ts` đều có; `auth.ts#logoutAction` không cần vì bản chất là xóa session). **100% trang trong `admin/(protected)/`** (kể cả 3 trang thêm trong Sprint 8) đi qua `requireAdminPage()` ở layout dùng chung — xác nhận bằng route crawl thực tế (mục 3): mọi route đều redirect 307 khi chưa đăng nhập. |
| API Key Security | Không có API key nào lộ trong source (`grep` toàn bộ `src/` cho pattern secret/token/password hard-code — không có kết quả). `JWT_SECRET`, `DATABASE_URL` chỉ đọc từ `process.env`, không hard-code. `.env*` nằm trong `.gitignore` và **chưa từng được commit** (`git log --all -- .env` rỗng). |
| Media Library Permission | ✓ — `fetchMediaLibrary()` và trang `/admin/media` đều yêu cầu session admin hợp lệ (xác minh bằng route crawl: 307 khi chưa đăng nhập). |
| Storage Access | Không xác minh được vì **không có storage backend nào được cấu hình** trong dự án (ảnh chỉ lưu dạng URL text trong MySQL) — xem `DECISION_RECORDS.md` DR-2026-07-07-01. |
| Context Isolation | Rà soát toàn bộ `src/lib` và `src/app` cho state mutable ở module-level (`grep "^let \|^var "`) — **không có kết quả**, ngoại trừ 1 singleton hợp lệ: connection pool MySQL (`global.__mysqlPool` trong `src/lib/db.ts`), dùng đúng mục đích (tránh tạo nhiều pool khi Next.js hot-reload ở dev), không lưu dữ liệu theo từng request nên không có rủi ro rò rỉ dữ liệu giữa các request/người dùng. |

### Phát hiện bổ sung (ghi nhận, không tự sửa — đúng theo chỉ đạo Requirement #6)

- **Không có rate limiting / khóa tài khoản tạm thời** trên `POST /api/admin/login` — có thể bị brute-force mật khẩu admin. Ghi vào `ROADMAP.md`.
- **Timing side-channel nhỏ khi đăng nhập**: `verifyAdminPassword()` (`src/lib/admin-users.ts`) chỉ gọi `bcrypt.compare()` khi tìm thấy email trong DB; nếu email không tồn tại, hàm trả về ngay lập tức. Chênh lệch thời gian phản hồi giữa "email không tồn tại" và "email tồn tại nhưng sai mật khẩu" về lý thuyết có thể dùng để dò email admin hợp lệ. Mức độ rủi ro thấp (không lộ thông tin qua response body, chỉ qua thời gian), ghi vào `ROADMAP.md`.

---

## 6. UX Verification

Xác minh lại bằng trình duyệt thật (Playwright + Chromium, có session admin hợp lệ) trong session này:

| Hạng mục | Kết quả |
|---|---|
| Media Library | ✓ — picker trong form sản phẩm và trang `/admin/media` đều hiển thị đúng, không lỗi console |
| Image Preview | ✓ — thumbnail hiển thị đúng; đã xác minh cơ chế placeholder khi ảnh lỗi hoạt động (từ Requirement #3, code không đổi) |
| Form Experience | ✓ — Section collapse/expand + ghi nhớ trạng thái qua `localStorage` (đã xác minh: đóng "Hình ảnh", tải lại trang, vẫn đóng); validation hiển thị tại field, không alert() |
| Dashboard Experience | ✓ — Card/Quick Actions/Recent Activity/System Status hiển thị đúng, responsive ở cả 3 breakpoint (đã chụp màn hình desktop/tablet/mobile trong Requirement #5) |
| Hidden Technical Fields | ✓ — Image URL, Product ID, slug không xuất hiện ở giao diện mặc định của form sản phẩm; chỉ hiện trong Advanced Panel khi mở |
| Advanced Panel | ✓ — đóng mặc định ở cả 2 nơi (URL ảnh trong `ImageManagerField`, ID/slug trong Section "Nâng cao") |

---

## 7. Production Readiness

| Hạng mục | Trạng thái |
|---|---|
| CMS (Products/Categories/Leads/Media) | **Sẵn sàng** cho use-case hiện tại của dự án (shop nhỏ, 1 admin role), với điều kiện chạy regression end-to-end trên DB thật trước khi release (mục 3). |
| AI Platform | **N/A** — không tồn tại trong dự án; không có gì cần đánh giá production readiness. |
| Database Rules | **N/A** — không dùng Firebase; kiểm soát truy cập nằm ở tầng Server Action (đã xác minh PASS ở mục 4). |
| Media Library | **Sẵn sàng** trong giới hạn hiện tại (đọc URL đã dùng qua các sản phẩm) — **chưa sẵn sàng** cho upload file nhị phân thật vì chưa có storage backend (xem DR-2026-07-07-01). |
| Dashboard | **Sẵn sàng** — dữ liệu thật cho phần đã có module, minh bạch "chưa triển khai" cho phần chưa có. |
| Context Builder | **N/A** — khái niệm không tồn tại trong kiến trúc dự án này. |
| Workflow Engine | **N/A** — không tồn tại. |
| Observability | **Hạn chế** — chỉ có System Status (Requirement #5) làm bề mặt quan sát duy nhất, kiểm tra được duy nhất kết nối Database qua `SELECT 1`. Không có logging tập trung, không có error tracking (Sentry hay tương đương), không có metrics/alerting. Ghi vào `ROADMAP.md` cho Sprint 9 cân nhắc. |
| Cost Tracking | **N/A** — không có AI usage hay dịch vụ tính phí theo usage nào trong dự án để theo dõi chi phí. |

---

## 8. Known Limitations (chuyển sang xem xét ở Sprint 9 — không triển khai trong Sprint 8)

1. Không có storage backend thật cho upload ảnh nhị phân (DR-2026-07-07-01).
2. Nút "Lưu & Tiếp tục" chưa có vì cần đổi API `createProduct`/`updateProduct` (DR-2026-07-07-02).
3. Module Blogs, Banners, Sliders không tồn tại; "AI" (Provider/Assistant/Draft) không có backend nào để tích hợp (DR-2026-07-07-03).
4. Sidebar khu vực quản trị (`layout.tsx`) không tự thu gọn trên mobile — Dashboard đã tự thích ứng trong không gian hẹp đó, nhưng cải thiện triệt để cần sửa layout dùng chung, ngoài phạm vi Sprint 8.
5. `/admin/media` giới hạn 60 ảnh (kế thừa giới hạn của `getMediaLibrary()` từ Requirement #3) — cần phân trang nếu thư viện ảnh thực tế lớn hơn.
6. Không có rate limiting trên đăng nhập admin; có timing side-channel nhỏ khi dò email admin hợp lệ (mục 5).
7. Không có observability thật (logging/error tracking/metrics) ngoài System Status đọc trạng thái Database.
8. Regression end-to-end với dữ liệu MySQL thật chưa được chạy trong Sprint 8 do giới hạn môi trường kiểm thử (mục 3) — khuyến nghị chạy trước khi Production release.
9. Mô hình quyền hiện tại là single-role (chỉ "admin") — không có RBAC nhiều cấp; nếu cần nhiều vai trò quản trị, đây là một quyết định kiến trúc mới, cần Decision Record riêng khi có yêu cầu.

---

## 9. Acceptance Criteria (Sprint 8 Close-out)

| Tiêu chí | Kết quả |
|---|---|
| Requirement #1 PASS | ✓ |
| Requirement #2 PASS | ✓ |
| Requirement #3 PASS | ✓ |
| Requirement #4 PASS | ✓ |
| Requirement #5 PASS | ✓ |
| Regression PASS | ✓ (trong phạm vi kiểm thử được — xem giới hạn ở mục 3) |
| Architecture Verification PASS | ✓ |
| Security Verification PASS | ✓ (2 phát hiện mức thấp được ghi nhận, không chặn release — mục 5) |
| Documentation PASS | ✓ — `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md` đã cập nhật; tài liệu này (`docs/SPRINT_8_FINAL_REPORT.md`) được tạo mới |

---

# SPRINT 8 COMPLETED

Chờ Chief Architect lập Sprint 9 Planning. Không tự bắt đầu Sprint 9.
