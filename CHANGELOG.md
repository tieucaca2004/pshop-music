# Changelog

Định dạng: mỗi mục là 1 Sprint/đợt thay đổi, mới nhất ở trên.

## Sprint 2 — AI Assistant: Plugin Manager, Retry, mở rộng 3 plugin chính thức

- **Thêm** Plugin Manager (`admin/ai/plugins.html`, `js/admin-ai-plugins.js`, node `aiPlugins` qua `js/ai/plugin-db.js`): bật/tắt, version, gán AI Provider riêng theo từng plugin, xem trạng thái, link nhanh sang Nhật ký lọc theo plugin.
- **Thêm** cơ chế Enable/Disable thực thi 2 lớp: Dashboard (`admin/ai/index.html`) chỉ hiển thị plugin đang bật; `AdminAI.runModule()` kiểm tra lại trước khi tạo job.
- **Xác định phạm vi chính thức Sprint 2**: chỉ 3 plugin hoạt động — Product Description Generator, Slider Generator, SEO Generator. 5 plugin còn lại từ Sprint 1 (Blog Writer, Facebook Post Generator, Banner Generator, FAQ Generator, Image Prompt Generator) giữ nguyên code, chuyển trạng thái "Coming Soon" trong Plugin Manager.
- **Thêm** `AIJobQueue.retryFailed(jobId)` — đặt lại các item lỗi về hàng chờ mà không chạy lại các item đã thành công (kèm sửa lỗi tiềm ẩn: `processSequentially()` trước đây có thể xử lý lại item đã `completed` khi resume — nay bỏ qua đúng các item đã xong).
- **Thêm** Provider theo từng plugin: `job-queue.js` ưu tiên `aiPlugins/{id}.providerId` trước khi rơi về provider mặc định toàn cục — đổi provider của 1 plugin không ảnh hưởng Workflow/UI.
- **Mở rộng nội dung** (không đổi cấu trúc): `product-description-writer.js` nhấn mạnh yêu cầu SEO trong prompt; `slider-generator.js` đổi input chính sang chọn Product (thay vì gõ chủ đề tự do), đọc `product.images` làm ảnh gợi ý, output thêm `ctaText` + `imagePrompt`; `seo-generator.js` mở rộng output: `keywords`, `ogTitle`, `ogDescription`, `ogImage`, `schemaSuggestion` (field mới, cộng thêm vào bản ghi `blogPosts` khi Publish, không phá field cũ).
- **Mở rộng** `js/blog-post.js` thêm thẻ `<meta name="keywords">` và ưu tiên `ogTitle`/`ogDescription`/`ogImage` nếu SEO Generator đã sinh — chỉ thêm thẻ trong `<head>`, không đổi giao diện hiển thị.
- **Thêm tài liệu**: `PROJECT_ARCHITECTURE.md`, `AI_RULES.md`, `ROADMAP.md`, `docs/SPRINT_2_PROGRESS.md`, `CHANGELOG.md` (file này).
- Không sửa/refactor: 12 trang CMS gốc, `js/db.js`, `js/cms-db.js`, 5 module Sprint 1 ngoài phạm vi (chỉ đổi trạng thái Enable qua Plugin Manager, không đổi code file).
- **Sprint 2 hoàn tất** — commit và push lên GitHub. Sprint 3 chưa bắt đầu (xem `ROADMAP.md`).

## Sprint 1 — Nền tảng AI Assistant (Workflow Engine)

- Xây `js/ai/provider-interface.js` + `js/ai/provider-registry.js` + 4 provider stub (`openai.js`, `claude.js`, `gemini.js`, `deepseek.js`) — luôn báo lỗi "chưa cấu hình", chưa gọi API AI thật.
- Xây `js/ai/module-registry.js` + 8 module: Blog Writer, Product Description Writer, SEO Generator, FAQ Generator, Facebook Post Generator, Image Prompt Generator, Slider Generator, Banner Generator.
- Xây `js/ai/ai-db.js` (`DraftDB`, `JobDB`, `LogDB`, `ProviderConfigDB`) và `js/ai/job-queue.js` (`AIJobQueue`, xử lý tuần tự phía trình duyệt Admin).
- Xây 5 trang `admin/ai/{index,drafts,jobs,logs,providers}.html` + `js/admin-ai.js`/`js/admin-ai-providers.js`.
- Sửa `js/admin-auth.js`: chuyển toàn bộ href trong `ADMIN_NAV` + link "Xem website"/logout sang đường dẫn tuyệt đối (`/admin/...`) để sidebar dùng lại được từ `admin/ai/*.html` (lồng sâu hơn 1 cấp thư mục so với 12 trang CMS gốc).
- Cập nhật `README.md` với mục "AI Assistant (Workflow Engine)" + Database Rules mới cho `aiDrafts`/`aiJobs`/`aiLogs`/`aiProviderConfig`.

## Trước Sprint AI — CMS nền tảng

Xem chi tiết trong `README.md` (mục Structure, CMS Admin, Thiết lập Firebase) — bao gồm Product/Category/Banner/Slider/Blog/Video/Menu/Footer/SEO/Settings/Users Manager, chuyển từ mật khẩu tĩnh sang Firebase Authentication + phân quyền Admin/Editor.
