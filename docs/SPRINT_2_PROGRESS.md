# Sprint 2 Progress — AI Assistant Plugin Manager

## ✅ SPRINT 2: HOÀN TẤT — đã commit và push lên GitHub

**Sprint 3: CHƯA bắt đầu.** Không triển khai thêm bất kỳ mục nào trong "Việc còn lại"/`ROADMAP.md` cho tới khi được giao rõ ràng ở sprint kế tiếp.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 2". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_2_PROGRESS.md"** để nối tiếp đúng phần còn thiếu.

## Trạng thái

- ✅ AI Module (đã có từ Sprint 1 — 8 module, không đổi)
- ✅ Provider Interface (đã có từ Sprint 1 — 4 provider stub, không đổi)
- ✅ Queue (đã có từ Sprint 1, Sprint 2 bổ sung Retry + fix idempotent resume)
- ✅ Logs (đã có từ Sprint 1, Sprint 2 bổ sung lọc theo `?module=`)
- ✅ Plugin Manager (`admin/ai/plugins.html`, node `aiPlugins`) — MỚI trong Sprint 2
- ✅ Product Description Generator — nhấn mạnh SEO trong prompt, giữ target `products`
- ✅ Slider Generator — đổi sang chọn Product, đọc `product.images`, thêm `ctaText`/`imagePrompt`
- ✅ SEO Generator — mở rộng output (keywords/OG/schema), giữ target Blog Post
- ✅ Tài liệu: `PROJECT_ARCHITECTURE.md`, `AI_RULES.md`, `CHANGELOG.md`, `ROADMAP.md`, file này

## Việc còn lại (chưa làm, KHÔNG nằm trong phạm vi Sprint 2)

- ⬜ Kích hoạt 5 plugin "Coming Soon" (Blog Writer, Facebook Post, Banner, FAQ, Image Prompt) — chờ giao ở sprint sau, xem `ROADMAP.md`.
- ⬜ Job Queue V2 (Cloud Functions) — chờ giao, xem `ROADMAP.md`.
- ⬜ Media Library CMS module — chờ giao, xem `ROADMAP.md`.
- ⬜ Tích hợp AI Provider thật (OpenAI/Claude/Gemini/DeepSeek) — vẫn là stub theo đúng yêu cầu "chưa tích hợp API AI thật" của Sprint 1 & 2.

## Việc cần người dùng làm (không tự động được)

- Dán Database Rules mới cho `aiPlugins` vào Firebase Console (xem `README.md` mục "Thiết lập Firebase") — nếu chưa dán, Plugin Manager sẽ báo lỗi kết nối rõ ràng, không vỡ giao diện.
