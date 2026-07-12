# SPRINT 11 CHECKLIST

**Trạng thái: DỰ THẢO.** Áp dụng cho mỗi Requirement trước khi coi là hoàn thành. Dự án KHÔNG có build step/CI — các mục "Build/Lint/Type Check/Unit Test" bên dưới được diễn giải theo đúng năng lực thật của repo (site tĩnh HTML/CSS/JS), không fabricate 1 pipeline không tồn tại.

- [ ] **Build** — không áp dụng (không có bundler/build step trong repo; chỉ cần xác nhận file `.js`/`.html` mới không có lỗi cú pháp: `node -c <file>.js`).
- [ ] **Lint** — không có ESLint/Prettier cấu hình trong repo (xác nhận qua `ls .eslintrc* .prettierrc* 2>/dev/null` rỗng) — bỏ qua bước này, không tự thêm tooling mới ngoài phạm vi Requirement.
- [ ] **Type Check** — không áp dụng (JavaScript thuần, không TypeScript).
- [ ] **Unit Test** — hàm thuần liên quan (map input Wizard → Plugin params, `buildMarketingPackage()` nếu bị chạm) kiểm thử qua Node `vm`, load thẳng source thật.
- [ ] **Integration Test** — luồng Wizard → PluginManager → Queue → Draft kiểm thử qua harness trình duyệt tạm thời (`_test-*.html`), xoá trước commit.
- [ ] **Manual QA** — click-through thật trên `admin/products.html` (Requirement #2) và `admin/ai/one-click-marketing.html` (Requirement #1) với cả 2 vai trò `editor`/`admin`.
- [ ] **Documentation Review** — `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md` cập nhật đúng Requirement, không sửa lịch sử Sprint trước.
- [ ] **Commit** — theo đúng scope 1 Requirement, không gộp nhiều Requirement vào 1 commit.
- [ ] **Push** — lên `feature/cms-ai-sprint2`, KHÔNG merge `main`.
- [ ] **Regression Review** — `git diff`/`git log -- <file lõi>` xác nhận AI Framework/Queue/Provider Manager/Permission Service/AI Task Router/Firebase Rules/Workflow Engine không bị sửa ngoài phạm vi.
- [ ] **Architecture Review** — xác nhận không phá ranh giới "hàm thuần vs Experience Layer" của `js/one-click-marketing.js`; xác nhận Requirement #1/#2 chỉ THÊM lời gọi tới `PluginManager` (không sửa `plugin-manager.js`).
- [ ] **Security Review** — Permission Service vẫn được gọi trước khi tạo Job ở cả 2 lối vào mới (Wizard + Inline CMS); không lộ API key/secret.
- [ ] **Founder Journey Review** — đo lại số lượt click cho "viết mô tả bằng AI" (mục tiêu ≤ 3, so với ~8 hiện tại).
- [ ] **UX Review** — nút AI-assist inline không làm rối layout form hiện có; trạng thái Job hiển thị rõ ràng, không gây hiểu nhầm "đã xong" khi còn `queued`/`running`.
- [ ] **Performance Review** — không tăng đáng kể số lượt đọc/ghi Firebase ngoài dự kiến (xem `SPRINT_11_PLANNING.md` mục Performance/Architecture Impact).
- [ ] **Scalability Review** — xác nhận Requirement #1 không đổi hành vi tuần tự (sequential) của Queue — nhiều output cùng lúc từ 1 Gói Marketing vẫn xếp hàng đúng thứ tự, không chạy song song.
- [ ] **Competitive Review** — đối chiếu lại với pattern đã học (Notion/Cursor: AI sống trong ngữ cảnh) — xác nhận nút AI-assist thực sự nằm trong form, không phải link mở tab mới.
- [ ] **AI Cost Review** — ước tính số lượt gọi Provider tăng thêm mỗi lần Founder bấm "GENERATE" (tối đa 5 Job/lần, xem Performance Review) — vẫn là ước tính, không phải billing thật (Cloud Function chưa deploy).
- [ ] **Firebase Cost Review** — ước tính số Read/Write mới mỗi luồng (xem `SPRINT_11_PLANNING.md`) — không tăng số node/collection nào ngoài Requirement #3 (nếu được duyệt ở Sprint sau).
