# Decision Records

Ghi lại các quyết định kiến trúc cần con người phê duyệt trước khi triển khai, theo quy trình mô tả trong yêu cầu Sprint ("Nếu cần thay đổi Database Structure hoặc Storage Structure. Không tự triển khai. Lập Decision Record.").

## DR-2026-07-07-01: Backend lưu trữ file cho tính năng "Upload ảnh mới"

**Bối cảnh (Sprint 8, Requirement #3 — CMS Image Experience 2.0)**

Yêu cầu mô tả CMS phải cho phép "Upload ảnh mới" và "Chọn ảnh từ Media Library", đồng thời ẩn Image URL / Firebase Storage Path / Document ID khỏi giao diện mặc định.

Kiểm tra codebase hiện tại (`pshop-music`) cho thấy:
- Không có Firebase, không có bất kỳ storage backend nào (S3, Netlify Blobs, filesystem upload...).
- Ảnh sản phẩm chỉ được lưu dưới dạng URL trong cột `product_images.url VARCHAR(500)` (MySQL — `db/schema.sql`).
- Không có API route nào nhận file nhị phân và trả về URL.

**Vấn đề**

Muốn "Upload ảnh mới" theo đúng nghĩa (chọn file từ máy, lưu file, nhận về URL) cần một trong các thay đổi sau, đều nằm ngoài phạm vi "chỉ thay đổi Experience Layer":
1. Thêm storage backend mới (Firebase Storage / S3 / Netlify Blobs / filesystem) — thay đổi Storage Structure.
2. Hoặc nhúng ảnh dạng base64 trực tiếp vào cột `url` — không khả thi vì cột hiện là `VARCHAR(500)`, không đủ chứa dữ liệu ảnh; mở rộng cột (vd. sang `TEXT`) là thay đổi Database Structure, và việc lưu blob lớn trong cột URL cũng không đúng vai trò thiết kế của bảng.

**Quyết định**

Không tự triển khai storage backend mới. Trong phạm vi Requirement #3, đã triển khai phần Experience Layer khả thi mà không đổi Database/Storage Structure:
- Preview, Gallery, kéo thả đổi thứ tự, placeholder khi ảnh lỗi.
- "Media Library" tái sử dụng dữ liệu URL đã có trong `product_images` (không bảng mới).
- URL ảnh (khi thật sự cần thêm ảnh mới chưa có trong thư viện) được đưa vào Advanced Panel, đóng mặc định — theo đúng Functional Requirement #6.

**Cần quyết định tiếp theo (việc của Chief Architect / stakeholder, không tự triển khai)**
- Chọn storage backend cho upload file thật sự (Firebase Storage, S3, Netlify Blobs, hay filesystem cục bộ — lưu ý filesystem không phù hợp với môi trường serverless/Netlify hiện tại của dự án).
- Nếu chọn phương án, cần Sprint riêng để: thêm API route upload, cấu hình credentials, và (nếu cần) mở rộng Database Structure để lưu metadata file (kích thước, mime type...).

**Trạng thái:** Chờ quyết định. Đã ghi vào `ROADMAP.md`.
