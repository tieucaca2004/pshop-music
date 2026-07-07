# Changelog

Định dạng dựa theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/).

## Sprint 8 - Requirement #5: CMS Dashboard Experience 2.0 — 2026-07-07

### Added
- Dashboard quản trị (`src/app/admin/(protected)/page.tsx`) được thiết kế lại dạng Card, hiển thị đủ 8 nhóm theo yêu cầu: Sản phẩm, Danh mục, Blog, Banner, Slider, Yêu cầu liên hệ (Orders), AI, Thư viện ảnh. Mỗi Card gồm Tổng số, Trạng thái và Shortcut khi module đã tồn tại thật; các module chưa xây dựng (Blog, Banner, Slider, AI) hiển thị rõ nhãn "Chưa triển khai"/"Chưa cấu hình" thay vì số liệu giả hoặc shortcut chết.
- **Quick Actions**: Thêm sản phẩm, Mở Media Library hoạt động thật (điều hướng tới trang tương ứng); Thêm Blog, Thêm Banner, AI Assistant hiển thị ở trạng thái vô hiệu hóa rõ ràng vì module chưa tồn tại.
- **Recent Activity**: "Sản phẩm vừa sửa" lấy dữ liệu thật từ `products.updated_at` (query mới `getRecentlyUpdatedProducts`); "Blog vừa tạo", "Banner vừa cập nhật", "AI Draft gần nhất" hiển thị trạng thái rỗng trung thực vì các module này chưa tồn tại.
- **System Status** (chỉ đọc dữ liệu): Database kiểm tra kết nối thật (`checkDatabaseHealth()` — `SELECT 1`); Health suy ra từ tình trạng Database; AI Provider/Queue/Storage hiển thị "Chưa cấu hình" vì dự án chưa tích hợp các hệ thống này.
- Trang mới `/admin/media` (Thư viện ảnh) — nâng Media Library (từ Requirement #3) thành một trang quản trị thật, chỉ đọc lại `product_images.url` qua `MediaLibraryGrid`, không có API/bảng mới. Thêm mục điều hướng "Thư viện ảnh" vào sidebar admin.
- `getDashboardOverview()`, `getRecentlyUpdatedProducts()`, `checkDatabaseHealth()` (`src/lib/admin-data.ts`) và `formatRelativeTime()` (`src/lib/format.ts`) — toàn bộ là hàm đọc dữ liệu mới, không đổi hàm/schema hiện có.

### Changed
- `src/app/admin/(protected)/layout.tsx`: thêm 1 mục nav "Thư viện ảnh" (không đổi cấu trúc/route khác).
- Dashboard chia layout responsive: Card grid 1 cột (mobile) → 3 cột (tablet) → 4 cột (desktop); Recent Activity/System Status xếp chồng trên mobile, 2 cột trên desktop.

### Not implemented (xem Decision Record)
- Module Blogs/Banners/Sliders thật (cần Database Structure + Business Logic mới) và AI Provider/AI Assistant thật (cần tích hợp AI Framework) — xem `DECISION_RECORDS.md` (DR-2026-07-07-03) và `ROADMAP.md`.
- Sidebar admin responsive trên mobile — vấn đề thuộc `layout.tsx` (chrome dùng chung), ngoài phạm vi Requirement #5; xem `ROADMAP.md`.

### Unchanged (theo đúng phạm vi Requirement)
- Sprint 2, 3, 4, 5, 6, 7.
- Sprint 8 Requirement #1, #2, #3, #4.
- AI Framework, Queue, Plugin Manager, Provider Manager, Permission Service, AI Task Router, Data Provider, `AI_RULES.md`, Database Structure.
- API và Business Logic hiện có (`src/lib/actions/*.ts` không đổi); các hàm mới trong `admin-data.ts` chỉ đọc dữ liệu (SELECT), không có INSERT/UPDATE/DELETE mới.

## Sprint 8 - Requirement #4: CMS Form Experience 2.0 — 2026-07-07

### Added
- `FormSection` (`src/components/admin/form-section.tsx`): section collapsible dùng chung cho form quản trị — hỗ trợ Collapse/Expand và ghi nhớ trạng thái đóng/mở theo `localStorage` (mỗi section một key riêng, còn nguyên sau khi tải lại trang).
- `FormActionBar` (`src/components/admin/form-action-bar.tsx`): Action Bar chuẩn hóa dùng chung — **Lưu** (submit), **Hủy** (điều hướng về danh sách, không submit), **Xóa** (chỉ hiện khi sửa, gọi lại `deleteProduct` sẵn có rồi điều hướng về danh sách). Không có 2 nút cùng chức năng.
- Form sản phẩm admin (`product-form.tsx`) được chia thành các Section: **Thông tin cơ bản**, **Hình ảnh**, **Giá & Kho**, **Nâng cao**. Section "Nâng cao" (đóng mặc định) hiển thị ID sản phẩm và slug — các trường kỹ thuật trước đây không hiển thị ở đâu cả, nay hiển thị đúng nơi quy định (Advanced Panel) thay vì ẩn hoàn toàn không lối vào.
- Validation hiển thị ngay tại field: submit được chặn phía client (`noValidate` + kiểm tra thủ công) khi thiếu Tên sản phẩm / Danh mục / Giá bán hợp lệ, thông báo lỗi hiển thị ngay dưới field tương ứng — không dùng `alert()`, không để lộ trang lỗi hệ thống của Next.js.

### Changed
- `product-form.tsx` chuyển thành Client Component để hỗ trợ validation tại field, ghi nhớ trạng thái Section và Action Bar. `action` (Server Action) được truyền vào như cũ, không đổi cách gọi.
- `src/app/admin/(protected)/products/[id]/page.tsx`: truyền thêm `deleteAction={deleteProduct.bind(null, productId)}` cho `ProductForm` để nút Xóa trong Action Bar tái sử dụng đúng server action `deleteProduct` sẵn có.

### Not implemented (xem Decision Record)
- Nút **"Lưu & Tiếp tục"**: cần đổi hành vi `redirect()` bên trong `createProduct`/`updateProduct` (Business Logic/API) để thực sự khác "Lưu" — nằm ngoài phạm vi Experience Layer. Xem `DECISION_RECORDS.md` (DR-2026-07-07-02).
- Section **"SEO"** và **"AI"**: không có field SEO/AI nào trong schema hoặc business logic của Product hiện tại — không render section rỗng. Xem `ROADMAP.md`.
- Preview PDF/Video: không có field PDF/Video trong schema Product hiện tại ("nếu có" theo đúng Functional Requirement #6) — chỉ Image preview (đã có từ Requirement #3) áp dụng.

### Unchanged (theo đúng phạm vi Requirement)
- Sprint 2, 3, 4, 5, 6, 7.
- Sprint 8 Requirement #1, #2, #3.
- AI Framework, Queue, Plugin Manager, Provider Manager, Permission Service, AI Task Router, Database Structure, Data Provider, `AI_RULES.md`.
- API và Business Logic của `createProduct` / `updateProduct` / `deleteProduct` (`src/lib/actions/products.ts` không đổi).
- Form thêm danh mục nhanh (`/admin/categories`) — đã đủ đơn giản (1 field), không cần chia section.

## Sprint 8 - Requirement #3: CMS Image Experience 2.0 — 2026-07-07

### Added
- `ImageManagerField` (`src/components/admin/image-manager-field.tsx`): thay ô nhập Image URL thô trong form sản phẩm admin bằng trải nghiệm dựa trên Preview:
  - Gallery thumbnail preview cho từng ảnh.
  - Kéo thả (drag & drop) để đổi thứ tự ảnh.
  - Thêm ảnh bằng cách chọn từ Media Library, hoặc xóa ảnh khỏi form.
  - Ảnh lỗi (URL hỏng) hiển thị placeholder, không hiển thị broken image icon.
  - Advanced Panel (đóng mặc định) chứa danh sách URL ảnh thô, chỉ dùng khi thật sự cần dán một URL ảnh mới.
- `getMediaLibrary()` (`src/lib/admin-data.ts`): truy vấn danh sách URL ảnh duy nhất đã từng dùng, tái sử dụng bảng `product_images` hiện có làm Media Library — không tạo bảng mới.
- `fetchMediaLibrary()` server action (`src/lib/actions/media.ts`): expose Media Library cho client component, yêu cầu quyền admin như các action khác.

### Changed
- `product-form.tsx`: field "Ảnh sản phẩm" chuyển từ `<textarea>` nhập URL thô sang `ImageManagerField`. Tên field (`images`) và định dạng dữ liệu submit (danh sách URL, mỗi dòng một URL) giữ nguyên như cũ.

### Unchanged (theo đúng phạm vi Requirement)
- Sprint 2, 3, 4, 5, 6, 7.
- Sprint 8 Requirement #1 và #2.
- AI Framework, Queue, Plugin Manager, Provider Manager, Permission Service, AI Task Router, Data Provider, `AI_RULES.md`.
- Database structure (`db/schema.sql` không đổi).
- Storage structure.
- Business logic của `createProduct` / `updateProduct` (`src/lib/actions/products.ts` không đổi).

### Notes
- Xem `DECISION_RECORDS.md` cho hạng mục cần quyết định thêm trước khi triển khai (upload file nhị phân thật sự).
- Xem `ROADMAP.md` cho ý tưởng phát sinh nằm ngoài phạm vi Requirement #3.
