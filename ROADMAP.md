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
