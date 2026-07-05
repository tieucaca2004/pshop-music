# Sprint 2 Progress — AI Assistant Plugin Manager

## ✅ Requirement #1–#8: HOÀN TẤT — đã commit, đã push lên `feature/cms-ai-sprint2`

**Sprint 3 / Requirement #9 trở đi: CHƯA bắt đầu.** Không triển khai thêm bất kỳ mục nào trong "Việc còn lại"/`ROADMAP.md` cho tới khi được giao rõ ràng ở sprint/requirement kế tiếp. Chưa merge `feature/cms-ai-sprint2` vào `main`.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 2". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_2_PROGRESS.md"** để nối tiếp đúng phần còn thiếu.

## Trạng thái theo Requirement

- ✅ **#1–2** AI Module + Plugin Manager nền tảng (đã có từ Sprint 1 — 8 module, Provider Interface stub, không đổi)
- ✅ **#3** Data Provider Layer (`js/ai/data-provider.js`, `IDataProvider`) — cổng đọc CMS duy nhất cho Plugin
- ✅ **#4** Plugin Manager là điểm gọi Plugin duy nhất (`js/ai/plugin-manager.js`, `IAIPlugin`)
- ✅ **#5** IAIProvider chính thức (`generate/validate/health`) + Provider Manager chọn provider theo plugin (`resolveForPlugin`)
- ✅ **#6** Queue phân biệt Completed/Failed ở cấp Job + field `provider` trên Job
- ✅ **#7** Log đúng thuật ngữ Completed/Failed/Cancelled, ghi Log cả khi hủy Job
- ✅ **#8** Permission & Safety Layer (RBAC) — `js/ai/permission-service.js`, luồng `User → Permission → Queue → AI Provider → Draft`, sửa lỗ hổng `admin/ai/plugins.html` thiếu `requiredRole:'admin'`
- ✅ Tài liệu: `PROJECT_ARCHITECTURE.md`, `AI_RULES.md`, `CHANGELOG.md`, `ROADMAP.md`, file này — cập nhật sau mỗi Requirement

## Việc còn lại (chưa làm, KHÔNG nằm trong phạm vi Sprint 2)

- ⬜ Kích hoạt 5 plugin "Coming Soon" (Blog Writer, Facebook Post, Banner, FAQ, Image Prompt) — chờ giao ở sprint sau, xem `ROADMAP.md`.
- ⬜ Job Queue V2 (Cloud Functions) — chờ giao, xem `ROADMAP.md`.
- ⬜ Media Library CMS module — chờ giao, xem `ROADMAP.md`.
- ⬜ Tích hợp AI Provider thật (OpenAI/Claude/Gemini/DeepSeek) — vẫn là stub theo đúng yêu cầu "chưa tích hợp API AI thật".
- ⬜ Gán quyền `ai.generate.*` cho 5 plugin "Coming Soon" trong `PermissionService` — chỉ làm khi các plugin đó được kích hoạt.
- ⬜ Merge `feature/cms-ai-sprint2` vào `main` — chưa được yêu cầu, KHÔNG tự ý merge.

## Việc cần người dùng làm (không tự động được)

- Dán Database Rules mới cho `aiPlugins` vào Firebase Console (xem `README.md` mục "Thiết lập Firebase") — nếu chưa dán, Plugin Manager sẽ báo lỗi kết nối rõ ràng, không vỡ giao diện.
- Netlify deploy đang bị lỗi `403 Forbidden` từ Requirement #6 — cần kiểm tra tài khoản/gói Netlify (không phải lỗi code); code vẫn được push đầy đủ lên GitHub mỗi Requirement.
