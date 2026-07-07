# Roadmap

Danh sách ý tưởng phát sinh trong quá trình triển khai các Requirement, nhưng không thuộc phạm vi hiện tại nên không được triển khai ngay ("Nếu phát hiện ý tưởng mới: Không triển khai. Ghi vào ROADMAP.md.").

## Từ Sprint 8 — Requirement #3 (CMS Image Experience 2.0)

- **Storage backend thật sự cho Upload ảnh** — cần chọn Firebase Storage / S3 / Netlify Blobs (hoặc khác) để hỗ trợ upload file nhị phân trực tiếp thay vì chỉ nhập/chọn URL. Xem `DECISION_RECORDS.md` (DR-2026-07-07-01).
- **Thumbnail preview trong danh sách sản phẩm admin** (`/admin/products`) — hiện bảng danh sách sản phẩm chỉ hiển thị tên/giá/trạng thái, chưa có ảnh đại diện. Có thể cải thiện UX nhưng nằm ngoài phạm vi Requirement #3 (chỉ yêu cầu form nhập liệu).
- **Quản lý ảnh cho Category** — danh mục hiện không có ảnh; nếu tương lai cần, `ImageManagerField` đã được viết dạng tái sử dụng được cho các entity khác.
- **Xóa ảnh không còn được sản phẩm nào tham chiếu khỏi Media Library** — Media Library hiện chỉ đọc URL còn tồn tại trong `product_images`; chưa có cơ chế dọn dẹp/quản lý ảnh mồ côi vì chưa có storage backend thật sự để dọn theo (xem mục đầu tiên).

## Từ Sprint 8 — Requirement #4 (CMS Form Experience 2.0)

- **Nút "Lưu & Tiếp tục"** — cần mở rộng tối thiểu API của `createProduct`/`updateProduct` để hỗ trợ điều hướng khác sau khi lưu (ví dụ field `intent`). Xem `DECISION_RECORDS.md` (DR-2026-07-07-02). Chưa triển khai vì đây là thay đổi Business Logic/API, ngoài phạm vi Requirement #4.
- **Section "SEO"** — chưa có field SEO (meta title/description...) nào trong schema/business logic hiện tại của Product, nên section này chưa được render trong form (tránh tạo section rỗng). Nếu tương lai bổ sung field SEO, framework `FormSection` đã sẵn sàng để thêm section này.
- **Section "AI"** — tương tự, hiện không có field/tính năng AI nào gắn với Product form (đúng theo chỉ đạo "Không Refactor AI Framework" — AI Framework không được CMS Product form sử dụng). Chưa render section này vì không có nội dung thật; cân nhắc thêm khi có Requirement liên quan đến AI cho Product.
- **Preview PDF/Video** — Functional Requirement #6 yêu cầu preview đồng nhất cho Image/PDF/Video "nếu có". Hiện Product không có field PDF hay Video nào trong schema, nên chưa có gì để chuẩn hóa preview. `ImageManagerField`/preview pattern đã đủ tổng quát để mở rộng khi có field kiểu này.
- **Chuẩn hóa validation inline cho form Danh mục** — form thêm danh mục nhanh (`/admin/categories`) chỉ có 1 field bắt buộc (tên), đã đủ đơn giản/hợp lệ với validation trình duyệt mặc định; chưa áp dụng `FormSection`/Action Bar vì không có nội dung để chia section (tránh over-engineering một form 1 trường).

## Từ Sprint 8 — Requirement #5 (CMS Dashboard Experience 2.0)

- **Module Blogs / Banners / Sliders** — không tồn tại trong Database Structure/Business Logic hiện tại; Card + Quick Action tương ứng hiển thị ở trạng thái "Chưa triển khai". Xây dựng thật cần Sprint riêng (bảng mới, Server Actions mới, trang quản trị mới). Xem `DECISION_RECORDS.md` (DR-2026-07-07-03).
- **AI Provider / AI Assistant / AI Draft** — chưa có AI Framework nào được cấu hình trong dự án để tích hợp; Card "AI", mục "AI Draft gần nhất", và Quick Action "AI Assistant" hiển thị "Chưa cấu hình". Xem `DECISION_RECORDS.md` (DR-2026-07-07-03).
- **Queue, Storage trong System Status** — không có hệ thống Queue hay Storage backend nào trong dự án (xem thêm DR-2026-07-07-01 ở Requirement #3); System Status hiển thị "Chưa cấu hình" trung thực thay vì số liệu giả.
- **Sidebar admin chưa responsive trên mobile** — `src/app/admin/(protected)/layout.tsx` (thuộc phần chrome chung, không phải phạm vi Requirement #5) dùng sidebar cố định `w-56`, không thu gọn/ẩn trên màn hình nhỏ, khiến vùng nội dung bị hẹp lại trên mobile. Dashboard mới đã tự co về 1 cột để vẫn đọc được trong không gian đó, nhưng cải thiện triệt để cần sửa `layout.tsx` (ví dụ sidebar dạng drawer trên mobile) — nằm ngoài phạm vi Requirement #5 vì đó là chrome dùng chung cho toàn bộ khu vực quản trị, không riêng Dashboard.
- **Phân trang cho `/admin/media`** — trang Thư viện ảnh mới tái sử dụng `getMediaLibrary()` (giới hạn 60 ảnh từ Requirement #3); nếu số ảnh thực tế vượt quá 60, cần bổ sung phân trang/tải thêm.

## Từ Sprint 8 — Requirement #6 (Kiểm thử tổng thể & đóng Sprint)

Phát hiện trong quá trình QA cuối Sprint, chuyển sang Sprint 9 xem xét (không triển khai trong Sprint 8):

- **Không có rate limiting trên đăng nhập admin** (`POST /api/admin/login`) — có thể bị brute-force mật khẩu. Cân nhắc thêm giới hạn số lần thử/IP hoặc khóa tài khoản tạm thời.
- **Timing side-channel nhỏ khi đăng nhập** — `verifyAdminPassword()` (`src/lib/admin-users.ts`) bỏ qua `bcrypt.compare()` khi email không tồn tại, tạo chênh lệch thời gian phản hồi giữa "email không tồn tại" và "sai mật khẩu". Cân nhắc luôn chạy một phép so sánh bcrypt "giả" (dummy hash) khi không tìm thấy user, để thời gian phản hồi đồng nhất.
- **Observability** — hiện chỉ có System Status (Requirement #5) đọc trạng thái Database. Không có logging tập trung, error tracking (vd. Sentry), hay metrics/alerting. Cân nhắc bổ sung nếu lên Production thật.
- **Regression end-to-end với MySQL thật** — chưa chạy được trong Sprint 8 vì môi trường kiểm thử không có DB server sẵn và không kéo được Docker image (chính sách mạng egress chặn domain CDN của Docker Hub). Khuyến nghị chạy trong CI/staging có DB thật trước khi Production release. Xem `docs/SPRINT_8_FINAL_REPORT.md` mục 3.
- **Mô hình quyền single-role** — hiện chỉ có 1 vai trò "admin" (`admin_users`), không có RBAC nhiều cấp. Nếu cần nhiều vai trò quản trị (vd. biên tập viên chỉ sửa sản phẩm, không xóa), đây là quyết định kiến trúc mới cần Decision Record riêng.
