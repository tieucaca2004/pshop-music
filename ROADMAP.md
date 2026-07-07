# Roadmap

Danh sách ý tưởng phát sinh trong quá trình triển khai các Requirement, nhưng không thuộc phạm vi hiện tại nên không được triển khai ngay ("Nếu phát hiện ý tưởng mới: Không triển khai. Ghi vào ROADMAP.md.").

## Từ Sprint 8 — Requirement #3 (CMS Image Experience 2.0)

- **Storage backend thật sự cho Upload ảnh** — cần chọn Firebase Storage / S3 / Netlify Blobs (hoặc khác) để hỗ trợ upload file nhị phân trực tiếp thay vì chỉ nhập/chọn URL. Xem `DECISION_RECORDS.md` (DR-2026-07-07-01).
- **Thumbnail preview trong danh sách sản phẩm admin** (`/admin/products`) — hiện bảng danh sách sản phẩm chỉ hiển thị tên/giá/trạng thái, chưa có ảnh đại diện. Có thể cải thiện UX nhưng nằm ngoài phạm vi Requirement #3 (chỉ yêu cầu form nhập liệu).
- **Quản lý ảnh cho Category** — danh mục hiện không có ảnh; nếu tương lai cần, `ImageManagerField` đã được viết dạng tái sử dụng được cho các entity khác.
- **Xóa ảnh không còn được sản phẩm nào tham chiếu khỏi Media Library** — Media Library hiện chỉ đọc URL còn tồn tại trong `product_images`; chưa có cơ chế dọn dẹp/quản lý ảnh mồ côi vì chưa có storage backend thật sự để dọn theo (xem mục đầu tiên).
