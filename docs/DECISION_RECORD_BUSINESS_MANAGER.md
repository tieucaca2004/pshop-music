# Decision Record — Business Manager Foundation (Multi-Tenant Phase 1)

**Trạng thái: CHỜ PHÊ DUYỆT.** Không có code nào được triển khai cho 3 quyết định dưới đây — đúng Architectural Constraint của Sprint 10 Requirement #1: "Nếu cần thay đổi Database Structure / Data Provider / Authentication Model → Không tự triển khai. Tạo Decision Record. Chờ phê duyệt."

Tài liệu này trình bày 3 quyết định kiến trúc độc lập nhưng liên quan chặt chẽ, cần Chief Architect chọn trước khi bất kỳ Requirement Business Manager nào có thể viết code thật.

---

## Bối cảnh — vì sao cả 3 quyết định đều bị khoá

Audit toàn bộ codebase (xem `PROJECT_ARCHITECTURE.md` mục "Business Manager Foundation") xác nhận: **PSH Platform hiện tại là hệ thống single-tenant ở mọi tầng** — không chỉ ở tầng Database, mà cả tầng Deployment (1 project Firebase, 1 site Netlify), tầng Auth (`roles/{uid}` toàn cục), và tầng Static Site (branding cứng trong HTML). Không có tầng nào trong 3 tầng này độc lập với 2 tầng còn lại — quyết định 1 tầng ảnh hưởng trực tiếp cách thiết kế 2 tầng kia. Vì vậy tài liệu này trình bày cả 3 cùng lúc thay vì tách rời.

---

## Quyết định #1 — Database Structure: cách phân vùng dữ liệu nhiều doanh nghiệp

### Option A — Field `businessId` trên từng bản ghi (giữ nguyên cấu trúc node phẳng hiện có)

```
products/{productId}         { ..., businessId: "pshop-music" }
categories/{categoryId}      { ..., businessId: "pshop-music" }
aiLogs/{logId}                { ..., businessId: "pshop-music" }
...
```

Mọi truy vấn đọc/ghi sẽ dùng thêm điều kiện lọc `orderByChild('businessId').equalTo(currentBusinessId)`.

- **Ưu điểm**: Thay đổi cấu trúc node tối thiểu — vẫn giữ nguyên toàn bộ tên node hiện có (`products`, `categories`, `aiJobs`...); `.validate` trong `database.rules.json` có thể kiểm tra field `businessId` khớp doanh nghiệp người dùng thuộc về.
- **Nhược điểm**: TOÀN BỘ bản ghi hiện có (sản phẩm, danh mục, Draft, Job, Log...) cần field `businessId` mới — dữ liệu Pshop Music hiện tại (không có field này) sẽ cần backfill nếu muốn hoạt động đúng với logic lọc mới (dù Requirement này không migrate, nhưng thiết kế phải tính tới việc TƯƠNG LAI sẽ cần làm việc đó). Firebase Realtime Database không hỗ trợ tốt truy vấn kết hợp nhiều điều kiện — lọc theo `businessId` cộng thêm lọc khác (vd theo Category) sẽ cần tải nhiều hơn cần thiết rồi lọc phía client, giống hạn chế phân trang đã ghi nhận từ trước.

### Option B — Namespace theo `businesses/{businessId}/...` (lồng toàn bộ schema hiện có dưới 1 gốc mới)

```
businesses/
  pshop-music/
    products/{productId}
    categories/{categoryId}
    aiJobs/{jobId}
    ...
  a-tieu/
    products/{productId}
    ...
```

- **Ưu điểm**: Cô lập dữ liệu triệt để giữa các doanh nghiệp (không có rủi ro rò rỉ chéo qua truy vấn thiếu điều kiện lọc); `database.rules.json` đơn giản hơn (chỉ cần kiểm tra `businesses/$businessId/...` với điều kiện "user là thành viên của `$businessId`"); đúng khuyến nghị chính thức của Firebase cho multi-tenant trên Realtime Database (cây dữ liệu nông, phân vùng theo tenant ở gốc).
- **Nhược điểm**: Thay đổi cấu trúc lớn hơn — mọi hàm trong `js/db.js`/`js/cms-db.js`/`js/ai/ai-db.js`/`js/ai/plugin-db.js` (`ref('products')` → `ref('businesses/'+businessId+'/products')`) cần biết `businessId` hiện tại TRƯỚC khi gọi — phát sinh vấn đề "bootstrap": làm sao biết `businessId` khi chưa đọc được dữ liệu nào thuộc business đó?

### Khuyến nghị

**Option B** phù hợp hơn về lâu dài (đúng tinh thần Vision "tạo doanh nghiệp tiếp theo mà không sửa mã nguồn" — Option A vẫn để lại nợ kỹ thuật vĩnh viễn ở tầng truy vấn). Option A rẻ hơn trước mắt nhưng là giải pháp tạm, không giải quyết triệt để.

---

## Quyết định #2 — Data Provider: cách hệ thống biết "đang thao tác cho doanh nghiệp nào"

### Option A — Business Context toàn cục phía client (module-level state)

Một module mới (vd `js/business-context.js`) giữ `currentBusinessId` dạng biến module-level (đúng pattern `AdminAuth` đã dùng cho `currentUser`/`currentRole` trong `js/admin-auth.js`) — mọi hàm `DB`/`CategoryDB`/`DataProvider`/... đọc ngầm biến này, không cần đổi chữ ký hàm public.

- **Ưu điểm**: Thay đổi chữ ký hàm tối thiểu — hầu hết code gọi `DB.getAll()`/`DataProvider.getProduct(id)` không cần sửa lời gọi.
- **Nhược điểm**: State ẩn (implicit) — rủi ro quên reset khi đổi doanh nghiệp, khó theo dõi hơn khi debug; 2 tab mở 2 doanh nghiệp khác nhau cùng lúc sẽ khó xử lý đúng nếu state là module-level thay vì gắn theo tab/phiên.

### Option B — Tham số `businessId` tường minh xuyên suốt mọi hàm

`DB.getAll(businessId)`, `DataProvider.getProduct(businessId, id)`, ... — mọi lời gọi trong TOÀN BỘ codebase (`js/db.js`, `js/cms-db.js`, `js/ai/*`, mọi `admin/*.html` + `js/admin-*.js` tương ứng) đều cần cập nhật để truyền `businessId`.

- **Ưu điểm**: Tường minh, không có state ẩn, dễ kiểm thử (input/output rõ ràng).
- **Nhược điểm**: Phạm vi thay đổi code LỚN NHẤT trong toàn bộ 3 quyết định — chạm vào gần như mọi file gọi Data Layer trong dự án.

### Khuyến nghị

**Option A** phù hợp hơn với quy mô thay đổi hợp lý và nhất quán với pattern đã có sẵn trong codebase (`AdminAuth`) — nhưng cần thiết kế kỹ cơ chế "đổi doanh nghiệp" để đảm bảo buộc tải lại toàn bộ dữ liệu đang hiển thị (tránh hiển thị lẫn dữ liệu 2 doanh nghiệp).

---

## Quyết định #3 — Authentication Model: quan hệ giữa 1 người dùng và nhiều doanh nghiệp

### Option A — Mở rộng `roles/{uid}` thành `roles/{uid}/businesses/{businessId}/role`

Một người dùng có thể có vai trò KHÁC NHAU ở từng doanh nghiệp (vd Admin ở Pshop Music, không có quyền ở A Tiểu).

- **Ưu điểm**: Đúng mô hình lâu dài, hỗ trợ đúng nhu cầu "1 người quản lý nhiều doanh nghiệp với quyền khác nhau".
- **Nhược điểm**: MỌI nơi đọc `roles/{uid}` hiện có (`js/admin-auth.js`, `js/admin-login.js`, `js/ai/permission-service.js`, `functions/index.js`, `database.rules.json`) đều cần sửa để biết "đang kiểm tra quyền cho doanh nghiệp nào" — rủi ro cao nhất cho tài khoản Pshop Music đang hoạt động thật nếu làm sai.

### Option B — Node mới `businessMembers/{businessId}/{uid}`, giữ nguyên `roles/{uid}` làm fallback cho doanh nghiệp hiện tại

Doanh nghiệp MỚI dùng node mới; Pshop Music (doanh nghiệp đang chạy thật) tiếp tục dùng `roles/{uid}` y nguyên như hiện tại, không đổi gì.

- **Ưu điểm**: Zero rủi ro cho người dùng/tài khoản Pshop Music đang hoạt động — không đụng tới cơ chế đang chạy thật; doanh nghiệp mới có thể thử nghiệm mô hình mới độc lập.
- **Nhược điểm**: 2 mô hình phân quyền song song — phức tạp hơn về lâu dài, cần hợp nhất sau này (nợ kỹ thuật có kế hoạch).

### Khuyến nghị

**Option B** an toàn hơn làm bước ĐẦU TIÊN (đúng tinh thần "Không migrate dữ liệu, không chuyển Pshop Music" của Requirement này) — Option A là đích đến đúng đắn hơn nhưng nên làm sau khi mô hình mới đã được kiểm chứng với ít nhất 1 doanh nghiệp mới qua Option B.

---

## Việc cần Chief Architect quyết định trước khi viết Requirement kế tiếp về Business Manager

1. Chọn Option A hoặc B cho Quyết định #1 (Database Structure).
2. Chọn Option A hoặc B cho Quyết định #2 (Data Provider).
3. Chọn Option A hoặc B cho Quyết định #3 (Authentication Model).
4. Xác nhận có nên tiếp tục đầu tư vào Business Manager ngay bây giờ, hay chờ tới khi có doanh nghiệp thứ 2 thật sự chuẩn bị onboard (khuyến nghị của `SPRINT_10_PLANNING.md` mục 6/7: hoãn tới Sprint 13+, tránh Over-Engineering khi chưa có nhu cầu thật).

Không có quyết định nào ở trên được tự động chọn — tài liệu này chỉ trình bày lựa chọn, không quyết định thay Chief Architect.
