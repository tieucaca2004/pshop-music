# Changelog

Định dạng dựa theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/).

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
