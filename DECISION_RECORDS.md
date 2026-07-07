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

## DR-2026-07-07-02: Nút "Lưu & Tiếp tục" cần thay đổi hành vi Server Action

**Bối cảnh (Sprint 8, Requirement #4 — CMS Form Experience 2.0)**

Functional Requirement #4 yêu cầu Action Bar chuẩn hóa với 4 nút: Lưu, Lưu & Tiếp tục, Hủy, Xóa — và "Không có nút trùng chức năng."

**Vấn đề**

`createProduct` / `updateProduct` (`src/lib/actions/products.ts`) luôn gọi `redirect("/admin/products")` sau khi lưu — đây là hành vi cố định trong Business Logic/API hiện tại, không đọc thêm bất kỳ input nào để quyết định điểm đến khác.

"Lưu & Tiếp tục" (lưu xong, ở lại trang chỉnh sửa thay vì quay về danh sách) chỉ có thể triển khai thật sự nếu action biết được nút nào được bấm và điều hướng khác đi — nghĩa là phải:
1. Đổi API của action (nhận thêm field, ví dụ `intent`/`redirectTo`), và
2. Đổi nhánh `redirect(...)` bên trong — tức đổi Business Logic/API, dù nhỏ.

Không có cách nào ở Experience Layer thuần túy để "chặn" hoặc "ghi đè" `redirect()` được gọi bên trong Server Action — Next.js xử lý tín hiệu redirect này ở tầng framework bất kể action được gọi qua `<form action>` hay gọi thủ công từ client.

Nếu triển khai nút "Lưu & Tiếp tục" mà chỉ lặp lại đúng hành vi của "Lưu" (cùng quay về danh sách) thì vi phạm "Không có nút trùng chức năng."

**Quyết định**

Không tự thay đổi API của `createProduct`/`updateProduct`. Trong phạm vi Requirement #4, Action Bar (`src/components/admin/form-action-bar.tsx`) chỉ triển khai 3 nút có hành vi thật sự khác nhau, không cần đổi Business Logic/API:
- **Lưu** — submit form (giữ nguyên hành vi sẵn có).
- **Hủy** — điều hướng thuần Experience Layer về danh sách, không submit.
- **Xóa** — chỉ hiện khi sửa sản phẩm, gọi lại `deleteProduct` sẵn có (không đổi), sau đó điều hướng về danh sách ở phía client.

"Lưu & Tiếp tục" chưa được thêm vào Action Bar để tránh vi phạm quy tắc "không nút trùng chức năng".

**Cần quyết định tiếp theo (việc của Chief Architect / stakeholder, không tự triển khai)**
- Phê duyệt việc mở rộng tối thiểu `createProduct`/`updateProduct` để nhận một field điều hướng (ví dụ `intent: "list" | "continue"`) và redirect theo đó, hoặc
- Chấp nhận không có "Lưu & Tiếp tục" cho tới khi có Sprint riêng cho thay đổi API này.

**Trạng thái:** Chờ quyết định. Đã ghi vào `ROADMAP.md`.
