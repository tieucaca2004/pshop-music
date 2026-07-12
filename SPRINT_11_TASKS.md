# SPRINT 11 TASKS

**Trạng thái: DỰ THẢO** — phân rã kỹ thuật của `SPRINT_11_PLANNING.md`, chỉ dùng làm tham khảo khi Chief Architect giao từng Requirement chính thức. Không phải danh sách việc đã được duyệt để code ngay.

## Requirement #1 — One Click Marketing: Cầu nối Generate Thật

1. Thiết kế hàm map input Wizard (Business/Product/Marketing Goal) → tham số `execute(items, userId, userEmail)` cho từng Plugin đích (Blog Writer/Facebook Post Generator/SEO Generator/Banner Generator/Image Prompt Generator) — viết dưới dạng hàm thuần, kiểm thử được qua Node `vm`.
2. Sửa `js/admin-one-click-marketing.js`: nút "GENERATE" gọi `PluginManager.loadPlugin(id).execute(...)` cho từng output có Plugin tương ứng, thay vì gọi thẳng `OneClickMarketing.buildMarketingPackage()` để hiển thị ngay.
3. Review Center: đổi hiển thị 5 output có Plugin sang trạng thái Job thật (queued/running/completed/failed), giữ nguyên hiển thị tĩnh cho "Video Request" (chưa có Plugin).
4. Gọi `PermissionService` trước khi tạo Job (đúng luồng `admin-ai.js` đã làm) — không tạo đường tắt bỏ qua RBAC.
5. Không sửa `js/one-click-marketing.js`, `js/ai/plugin-manager.js`, `js/ai/job-queue.js`, `js/ai/provider-registry.js`, `js/ai/permission-service.js`.
6. Cập nhật `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md`.
7. Kiểm thử (Node `vm` cho hàm map input, browser click-through cho toàn luồng) + commit + push.

## Requirement #2 — AI-Assist Inline trong CMS Forms

1. Thêm nút "Viết mô tả bằng AI" trong `admin/products.html` cạnh field Description, ẩn nếu Editor không có quyền `ai.generate.product` hoặc Plugin bị Disable.
2. Bấm nút → gọi `PluginManager.loadPlugin('product-description').execute([{productId}], userId, userEmail)` — dùng đúng `productId` đang mở, không yêu cầu chọn lại.
3. Hiển thị trạng thái Job ngay trong form (mini status, không cần rời trang) — kết quả cuối vẫn là Draft, không tự ghi field Description.
4. Không đổi `admin/ai/index.html` — đây là lối vào bổ sung.
5. (Nếu còn thời gian) lặp lại cho Blog form + Blog Writer Plugin — nếu không đủ thời gian, ghi rõ "chỉ làm Product" vào Final Report, không tuyên bố đã làm Blog.
6. Cập nhật tài liệu + kiểm thử + commit + push.

## Requirement #3 — Gói Marketing: Decision Record Lưu trữ bền vững

1. Audit hiện trạng `localStorage` (`js/admin-one-click-marketing.js`) — xác nhận lại giới hạn (không đa thiết bị, vô hình trên Home).
2. Viết `docs/DECISION_RECORD_MARKETING_PACKAGE_PERSISTENCE.md`: Option A (giữ nguyên) vs Option B (node Firebase `marketingPackages/{id}` mới, ai đọc/ghi, ảnh hưởng `database.rules.json`).
3. Không viết code. Không tự chọn phương án.
4. Cập nhật `ROADMAP.md` (xoá dòng "vô hình trên Home" thành "đang chờ Decision Record").

## Requirement #4 — Sprint 11 Final Review & Close

1. `git log --oneline --all | grep -i "sprint 11"` xác nhận từng Requirement tồn tại thật.
2. `git log <commit đóng Sprint 10.x>..HEAD -- <file lõi>` xác nhận 0 Regression trên AI Framework/Queue/Permission/Rules.
3. Security Review: xác nhận Requirement #1/#2 không bỏ qua Permission Service.
4. Product Review: đo lại số lượt click "viết mô tả bằng AI" (mục tiêu: giảm từ ~8 xuống ≤ 3).
5. Viết `docs/SPRINT_11_FINAL_REPORT.md` theo khuôn mẫu `docs/SPRINT_10_FINAL_REPORT.md`.
6. Cập nhật `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md`, commit, push, dừng — không tự bắt đầu Sprint 12.
