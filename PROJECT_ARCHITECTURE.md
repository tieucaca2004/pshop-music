# Kiến trúc dự án — Pshop Music

## Tổng quan

Next.js App Router storefront + admin CMS cho cửa hàng thiết bị DJ/âm nhạc. MySQL (qua `mysql2`) là nơi lưu trữ dữ liệu duy nhất; không có Firebase, không có AI Framework/Queue/Plugin Manager/Provider Manager riêng trong dự án này.

```
src/
  app/                     Route Segments (App Router)
    admin/(protected)/     Trang quản trị (yêu cầu đăng nhập)
    api/                   Route handlers (auth, contact-orders)
    ...                    Trang storefront công khai
  components/
    admin/                 UI dùng riêng cho khu vực quản trị
    ...                    UI dùng cho storefront
  lib/
    actions/               Server Actions ("use server") — nơi chứa business logic
    admin-data.ts          Read queries phục vụ trang admin
    products.ts            Read queries phục vụ storefront
    auth.ts                Session/JWT cho admin
    db.ts                  MySQL connection pool
  types/                   Kiểu dữ liệu dùng chung
db/schema.sql              Schema MySQL (nguồn sự thật cho Database Structure)
```

## Nguyên tắc phân lớp

- **Data layer**: `db/schema.sql`, `src/lib/db.ts`. Chỉ đổi khi có Decision Record.
- **Business logic layer**: `src/lib/actions/*.ts`. Nhận `FormData`, validate, ghi DB, `revalidatePath`/`redirect`. Không phụ thuộc vào cách dữ liệu được hiển thị.
- **Experience layer**: `src/components/**`, `src/app/**/page.tsx`. Chịu trách nhiệm UX — cách người dùng nhìn thấy và thao tác với dữ liệu, không thay đổi hình dạng dữ liệu gửi lên business logic layer.

Việc tách lớp này là lý do Requirement #3 (CMS Image Experience 2.0) triển khai được **chỉ bằng cách thay `<textarea>` bằng `ImageManagerField`** trong `product-form.tsx`, giữ nguyên field name (`images`) và định dạng dữ liệu (danh sách URL, mỗi dòng một URL) — `src/lib/actions/products.ts` (business logic) không cần đổi một dòng nào.

## Quản lý ảnh (từ Sprint 8, Requirement #3)

- Ảnh sản phẩm vẫn lưu trong bảng `product_images` (`url`, `alt`, `position`, `product_id`) — không đổi schema.
- "Media Library" trong CMS là một lớp Experience đọc lại `product_images.url` (dedup, mới nhất trước) — không phải bảng/service mới. Xem `getMediaLibrary()` trong `src/lib/admin-data.ts` và server action `fetchMediaLibrary()` trong `src/lib/actions/media.ts`.
- `ImageManagerField` (`src/components/admin/image-manager-field.tsx`) là component Experience Layer dùng chung, có thể tái sử dụng cho các entity khác có ảnh trong tương lai (xem `ROADMAP.md`).
- Giao diện mặc định không hiển thị Image URL; URL thô chỉ xuất hiện trong Advanced Panel (đóng mặc định) khi người quản trị thật sự cần dán một URL ảnh mới chưa có trong Media Library.
- Upload file nhị phân thật sự (chọn ảnh từ máy, lưu vào storage) **chưa có backend** trong dự án này — xem `DECISION_RECORDS.md` (DR-2026-07-07-01) trước khi triển khai.

## Chuẩn hóa Form quản trị (từ Sprint 8, Requirement #4)

- `FormSection` (`src/components/admin/form-section.tsx`): khung Section collapsible dùng chung cho mọi form CMS — Collapse/Expand + ghi nhớ trạng thái qua `localStorage`. Taxonomy Section chuẩn theo yêu cầu: Thông tin cơ bản, Hình ảnh, Giá & Kho, SEO, AI, Nâng cao — nhưng **chỉ render Section khi có field thật sự thuộc về nó**; không tạo Section rỗng cho SEO/AI vì Product hiện không có field nào thuộc 2 nhóm này (xem `ROADMAP.md`).
- `FormActionBar` (`src/components/admin/form-action-bar.tsx`): Action Bar chuẩn hóa dùng chung — Lưu / Hủy / Xóa. Không thêm nút nào có chức năng trùng nhau; xem `DECISION_RECORDS.md` (DR-2026-07-07-02) về lý do "Lưu & Tiếp tục" chưa có mặt.
- Trường kỹ thuật (ID, slug) chỉ hiển thị bên trong Section "Nâng cao" (đóng mặc định) — không xuất hiện ở bất kỳ đâu khác trên form.
- Validation là trách nhiệm của Experience layer khi hiển thị (thông báo lỗi tại field, không alert()/trang lỗi hệ thống); quy tắc field nào bắt buộc vẫn do Business logic layer quyết định (không đổi) — Experience layer chỉ phản chiếu lại cùng một quy tắc đó sớm hơn, tại client.
- Pattern này (Section + Action Bar + validation tại field) là chuẩn dùng chung cho mọi Module CMS, không riêng Product — form nào có đủ độ phức tạp (nhiều field, nhiều nhóm) nên áp dụng lại; form 1 field (như thêm danh mục nhanh) không cần vì không có gì để chia.

## Dashboard quản trị (từ Sprint 8, Requirement #5)

- Dashboard (`src/app/admin/(protected)/page.tsx`) hiển thị đủ 8 Card theo taxonomy chuẩn (Products, Categories, Blogs, Banners, Sliders, Orders, AI, Media Library), nhưng chỉ Card có dữ liệu/route thật (Sản phẩm, Danh mục, Yêu cầu liên hệ, Thư viện ảnh) mới có Tổng số thật và Shortcut điều hướng được. Card cho module chưa tồn tại (Blog, Banner, Slider, AI) hiển thị "—"/"Chưa triển khai"/"Chưa cấu hình" — không có số liệu giả, không có shortcut dẫn tới trang không tồn tại. Xem `DECISION_RECORDS.md` (DR-2026-07-07-03).
- "Orders" trong yêu cầu ánh xạ sang tính năng "Yêu cầu liên hệ" (`contact_orders`) đã có từ trước — dự án này không có hệ thống đơn hàng thương mại điện tử riêng.
- "Media Library" có trang quản trị riêng tại `/admin/media`, chỉ đọc lại `product_images.url` (tái sử dụng `getMediaLibrary()` từ Requirement #3) — không có bảng/API mới.
- **System Status là read-only thật**: `checkDatabaseHealth()` thực sự gọi `SELECT 1` để kiểm tra kết nối MySQL; các mục không có backend tương ứng (AI Provider, Queue, Storage) hiển thị "Chưa cấu hình" thay vì số liệu giả — không có mục nào trong panel này ghi/đổi cấu hình.
- **Recent Activity** chỉ hiển thị dữ liệu thật cho loại có backend (sản phẩm vừa sửa, qua cột `products.updated_at` sẵn có trong schema); Blog/Banner/AI Draft hiển thị trạng thái rỗng trung thực vì các module đó chưa tồn tại.
- Toàn bộ dữ liệu Dashboard là các hàm đọc mới trong `admin-data.ts` (`getDashboardOverview`, `getRecentlyUpdatedProducts`, `checkDatabaseHealth`) — không sửa hàm đọc nào đã có (`getAdminStats` giữ nguyên), không có Server Action/API mới, không đổi Database Structure.

## Ranh giới không đụng tới (theo chỉ đạo Sprint)

AI Framework, Queue, Plugin Manager, Provider Manager, Permission Service, AI Task Router, Data Provider, `AI_RULES.md`, Database Structure, Storage Structure — không tồn tại hoặc không được thay đổi bởi các thay đổi Experience Layer mô tả ở trên.

## Kiểm thử & xác minh cuối Sprint 8 (Requirement #6)

Requirement #6 không thay đổi code — chỉ xác minh. Kết quả đầy đủ (Regression, Architecture Verification, Security Verification, UX Verification, Production Readiness, Known Limitations) nằm trong `docs/SPRINT_8_FINAL_REPORT.md`. Điểm kiến trúc đáng chú ý rút ra từ lần xác minh này:

- Toàn bộ quyền truy cập dữ liệu đi qua 2 điểm chặn duy nhất: `requireAdminPage()` (mọi trang trong `admin/(protected)/`) và `requireAdminAction()` (mọi Server Action ghi/đọc dữ liệu nhạy cảm) — cả hai đều nằm trong `src/lib/auth.ts`, không đổi trong Sprint 8. Đây là toàn bộ "Permission Service" của dự án; không có RBAC nhiều cấp (single-role).
- Không có state mutable ở module-level nào ngoài connection pool MySQL singleton (`global.__mysqlPool` trong `src/lib/db.ts`) — không có rủi ro rò rỉ dữ liệu giữa các request/session (context isolation).
- `db/schema.sql` không đổi kể từ đầu Sprint 8 đến hết Requirement #5 (xác nhận bằng `git diff`).
