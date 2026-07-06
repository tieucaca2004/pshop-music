# Changelog

Định dạng: mỗi mục là 1 Sprint/đợt thay đổi, mới nhất ở trên.

## Sprint 7 — AI Observability Dashboard (Requirement #1)

Triển khai `admin/ai/observability.html` — 1 màn hình duy nhất tổng hợp toàn bộ trạng thái AI Framework (Health/Provider/Queue/Plugin/Usage/Job/Draft), hoàn toàn CHỈ ĐỌC, tái sử dụng 100% Service/Manager/DB đã có từ Sprint 2–5. Không sửa Sprint 2/3/4/5/6, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record** — không thêm Field/Collection Firebase nào; toàn bộ dữ liệu hiển thị đọc từ `aiLogs`/`aiJobs`/`aiDrafts`/`aiPlugins`/`aiProviderConfig` đã có.
- **Thêm** `js/ai/observability.js` (`ObservabilityService.compute(rangeKey)`) — gộp kết quả từ `HealthCheck.run()` (Sprint 5 #1), `UsageStats.compute()` (Sprint 5 #4), `PluginManager.loadPlugins()` (Sprint 2 #4 — đúng quy tắc "UI luôn qua Plugin Manager", `AI_RULES.md` mục 5b, không đọc thẳng `PluginDB`/`AIModuleRegistry`), `AIProviderRegistry.getAll()` + `ProviderConfigDB.get()` (Provider Status), `JobDB.getAll()` (Queue Status + Job Summary, dùng chung 1 lượt đọc), `DraftDB.getAll()` (Draft Summary). Mỗi nhánh tự bắt lỗi riêng (`{ error }`) để 1 thành phần lỗi không làm hỏng toàn bộ Dashboard — đúng NFR "Không phụ thuộc AI Provider".
- **Thêm** `admin/ai/observability.html` + `js/admin-ai-observability.js` — trang Admin-only mới, bộ lọc khoảng thời gian cho Usage Summary (Hôm nay/7 ngày/30 ngày), nút "Làm mới", hiển thị thời điểm cập nhật gần nhất. Khi không có dữ liệu ở bất kỳ mục nào (Job/Draft/Usage rỗng), hiển thị thông báo rõ ràng ("Chưa có Job/Draft/dữ liệu sử dụng nào...") — không phải "System Error", đúng Functional Requirement #9.
- **Thêm** 1 dòng liên kết trong `admin/ai/index.html` trỏ sang `observability.html`.
- **Xác nhận không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `task-router.js`, `data-provider.js`, `AI_RULES.md`, Database Structure — `observability.js` không import/gọi bất kỳ hàm ghi nào (`add`/`update`/`set`/`save`) của các module/DB này.
- **Kiểm thử**: chạy thật `health-check.js`/`usage-stats.js`/`observability.js` qua Node `vm` (4 kịch bản: hệ thống khỏe mạnh — xác nhận 0 lời gọi ghi trong suốt quá trình; chưa cấu hình Provider mặc định — Health trả về `skipped` rõ ràng, không throw; 1 nhánh đọc lỗi giả lập (Queue) được cô lập đúng, các nhánh khác vẫn hiển thị bình thường; Queue/Draft rỗng — trả về `total:0` để UI hiện Empty State) — tất cả PASS. Kiểm tra `admin/ai/observability.html`/`admin/ai/index.html` qua static server — cả 20 script tag trả về 200, 0 lỗi console, đúng luồng redirect sang đăng nhập khi chưa xác thực (đúng `requiredRole:'admin'`).
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- Chưa triển khai Requirement #2.

## Sprint 6 — Kiểm tra toàn diện + Đóng Sprint (Sprint Review) — SPRINT 6 COMPLETED

Sprint Review cuối cùng của Sprint 6 — không thêm tính năng, chỉ kiểm thử/xác minh/đánh giá toàn bộ 4 Requirement trước khi đóng Sprint.

- **Requirement Summary**: #1 Blog Writer ✅, #2 Facebook Post Generator ✅, #3 Banner Generator ✅, #4 Image Prompt Generator ✅ — cả 8/8 plugin viết từ Sprint 1 nay đều Production, không còn plugin nào "coming_soon".
- **Chạy lại toàn bộ mô phỏng đã viết qua Sprint 6** (4 file kịch bản riêng từng Requirement) — 3/4 file báo lỗi ở đúng 1 assertion phụ mang tính "ảnh chụp thời điểm" (khẳng định plugin kế tiếp vẫn phải "coming_soon", đúng tại thời điểm viết nhưng đã lỗi thời sau khi Requirement kế tiếp hợp lệ kích hoạt plugin đó) — **không phải regression**, mọi assertion chính (Permission/dữ liệu thật/Draft Workflow/publish đúng đích) đều PASS không đổi. Viết thêm 1 mô phỏng mới cho Review (`sprint6_review_sim.js`) xác nhận đúng TRẠNG THÁI CUỐI CÙNG: cả 8/8 plugin seed đúng, Permission đủ cho cả 8, 4 plugin Sprint 6 chạy đồng thời qua chung 1 Queue thật, publish đúng đích (Blog Writer → blog post mới, Banner Generator → `BannerDB`, Facebook Post Generator/Image Prompt Generator → không ghi node nào), không ghi chéo sang node của plugin khác.
- **Regression Test**: `git log` xác nhận từng file — `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`data-provider.js`/`AI_RULES.md`/`task-router.js` không đổi trong suốt Sprint 6 (giữ nguyên từ Sprint 2/4); `permission-service.js`/`plugin-db.js` đúng 6 commit/file (Sprint 2 + FAQ Generator Sprint 5 + 4 Requirement Sprint 6), không có thay đổi ngoài kế hoạch; `functions/index.js` không đổi từ Sprint 3. Mọi thay đổi Sprint 6 chỉ giới hạn đúng trong 5 file mỗi Requirement: `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md`/`js/ai/permission-service.js`/`js/ai/plugin-db.js`.
- **CMS Console check**: cả 9 trang `admin/ai/*.html` (assistant/drafts/health/index/jobs/logs/plugins/providers/usage) load 0 lỗi console, 0 request thất bại.
- **Security check**: grep xác nhận không có API Key/secret nào trong toàn bộ file Sprint 6; Cloud Function vẫn CHƯA deploy (không đổi so với Sprint 3/4/5, không phải vấn đề do Sprint 6 gây ra).
- **Project Backup**: không khả dụng — môi trường hiện tại bị Auto Mode Safety Classifier chặn cứng hành động nén + upload toàn bộ source code lên Google Drive bên ngoài (phân loại "Data Exfiltration", không thể gỡ bằng yêu cầu người dùng). Không tự tạo giải pháp thay thế, theo đúng chỉ dẫn. GitHub (`feature/cms-ai-sprint2`) là nơi backup từ xa duy nhất khả dụng.
- Lập `docs/SPRINT_6_PROGRESS.md` (Requirement Summary, Kiểm thử trạng thái cuối, Architecture/Security Verification, Production Readiness, Non-functional Evaluation, Known Limitations, mục chuyển sang Sprint 7).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- **SPRINT 6 COMPLETED (Requirement #1, #2, #3, #4 — tất cả đã giao và triển khai đầy đủ). Không bắt đầu Sprint 7. Không tự viết Sprint 7 Planning.**

## Sprint 6 — Kích hoạt Image Prompt Generator (Requirement #4)

Kích hoạt Image Prompt Generator (`js/ai/modules/image-prompt-generator.js`, đã có từ Sprint 1) từ "Coming Soon" sang Production, tái sử dụng hoàn toàn AI Framework hiện có. Đây là **plugin cuối cùng** viết từ Sprint 1 được kích hoạt — sau Requirement này, không còn plugin nào ở trạng thái "coming_soon". Không sửa Sprint 2/3/4/5, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record** — giống Blog Writer/Facebook Post Generator/Banner Generator, Requirement này không yêu cầu thêm Route vào AI Task Router, không có xung đột giữa Functional Requirement và Architectural Constraint.
- **Kích hoạt Plugin (Functional Req #1/#2)**: thêm `'image-prompt-generator'` vào `SPRINT2_ENABLED_MODULES` (`js/ai/plugin-db.js`) — chỉ ảnh hưởng giá trị SEED MẶC ĐỊNH cho môi trường CHƯA có dữ liệu; môi trường Production đã seed từ trước vẫn cần Admin tự bật "Enable" trong `admin/ai/plugins.html`.
- **Permission (Functional Req #3)**: thêm `GENERATE_IMAGE_PROMPT: 'ai.generate.imagePrompt'` vào `AI_PERMISSIONS`, gán `'image-prompt-generator'` trong `PLUGIN_PERMISSIONS`, thêm vào `ROLE_PERMISSIONS.editor` (`js/ai/permission-service.js`) — đúng khuôn mẫu đã dùng cho các plugin trước, không đổi logic RBAC.
- **Dữ liệu thật, không hardcode Prompt (Functional Req #4)**: xác nhận `buildPrompt()` dùng đúng `subject`/`style` tự do người dùng nhập — không có chuỗi cố định nào.
- **Không Generate Image, chỉ sinh văn bản Prompt (Functional Req #5)**: xác nhận qua mô phỏng — `mapToDraftContent()` chỉ trả về `{ imagePrompt: <văn bản> }` (đúng 1 field, không có URL ảnh/binary nào), module không có bất kỳ hàm nào gọi API tạo ảnh — đúng thiết kế "chỉ sinh Prompt tham khảo để dán vào công cụ tạo ảnh AI khác", không tự động tạo ảnh (đúng Out of Scope "AI Image Generation").
- **`targetCollection: null` — cùng dạng "chỉ xem/copy" như Facebook Post Generator**: không có nơi publish trực tiếp trong CMS. Xác nhận qua mô phỏng: nhánh `targetCollection === null` trong `publishToTarget()` (`js/admin-ai.js`, không sửa) hoạt động đúng — `publishDraftById()` chuyển Draft sang `'published'` mà KHÔNG ghi vào bất kỳ node CMS nào.
- **Plugin Disable (Functional Req #6)**: đã đúng sẵn — Dashboard chỉ hiển thị Plugin đang Enable; `runModule()` đã có `.catch()` hiển thị lỗi rõ ràng nếu vô tình gọi khi Disable — không tạo Job.
- **Không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md`, `js/ai/task-router.js` (Topic-only Routing, cùng lý do như các plugin trước).
- **Kiểm thử**: chạy thật `permission-service.js`/`plugin-db.js`/`image-prompt-generator.js`/`job-queue.js`/`admin-ai.js` qua Node `vm` (4 kịch bản) — Editor/Admin được phép chạy `image-prompt-generator` với quyền `ai.generate.imagePrompt` mới thêm; seed mặc định đúng (plugin cuối cùng, không còn module nào "coming_soon"); module đọc đúng dữ liệu thật (`subject`/`style` tự do), không hardcode Prompt, xác nhận Draft content chỉ có văn bản Prompt, không có hàm nào gọi API tạo ảnh; toàn bộ luồng enqueue→Queue xử lý→Draft→`publishDraftById()` với `targetCollection: null` đều đúng. Kiểm tra `admin/ai/plugins.html`/`admin/ai/index.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #5.

## Sprint 6 — Kích hoạt Banner Generator (Requirement #3)

Kích hoạt Banner Generator (`js/ai/modules/banner-generator.js`, đã có từ Sprint 1) từ "Coming Soon" sang Production, tái sử dụng hoàn toàn AI Framework hiện có, theo đúng khuôn mẫu Blog Writer/FAQ Generator/Facebook Post Generator. Không sửa Sprint 2/3/4/5, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record** — giống Blog Writer/Facebook Post Generator, Requirement này không yêu cầu thêm Route vào AI Task Router, không có xung đột giữa Functional Requirement và Architectural Constraint.
- **Kích hoạt Plugin (Functional Req #1/#2)**: thêm `'banner-generator'` vào `SPRINT2_ENABLED_MODULES` (`js/ai/plugin-db.js`) — chỉ ảnh hưởng giá trị SEED MẶC ĐỊNH cho môi trường CHƯA có dữ liệu; môi trường Production đã seed từ trước vẫn cần Admin tự bật "Enable" trong `admin/ai/plugins.html`.
- **Permission (Functional Req #3)**: thêm `GENERATE_BANNER: 'ai.generate.banner'` vào `AI_PERMISSIONS`, gán `'banner-generator'` trong `PLUGIN_PERMISSIONS`, thêm vào `ROLE_PERMISSIONS.editor` (`js/ai/permission-service.js`) — đúng khuôn mẫu đã dùng cho Product/SEO/Slider/FAQ/Blog/Facebook, không đổi logic RBAC.
- **Dữ liệu thật, không hardcode Prompt (Functional Req #4)**: xác nhận `buildPrompt()` dùng đúng `theme` tự do người dùng nhập làm chủ đề banner — không có chuỗi cố định nào; `link` cũng do người dùng nhập, không suy diễn.
- **`targetCollection: 'banners'` — publish thật, khác Facebook Post Generator**: đây là plugin đầu tiên kể từ Slider Generator (Sprint 3) publish thẳng vào 1 node CMS thật thay vì "chỉ xem/copy". Xác nhận qua mô phỏng: nhánh `target === 'banners'` trong `publishToTarget()` (`js/admin-ai.js`, không sửa) gọi đúng `BannerDB.add(draft.content)` — publish tạo đúng 1 bản ghi Banner mới, không đụng `BlogDB`/`DB`.
- **Draft Workflow/Human Review (Functional Req #5)**: xác nhận qua mô phỏng — không cần sửa gì, Draft luôn dừng ở trạng thái `draft`, chỉ ghi Banner thật khi Admin bấm "Duyệt & Publish" (`publishDraftById()`).
- **Plugin Disable (Functional Req #6)**: đã đúng sẵn — Dashboard chỉ hiển thị Plugin đang Enable; `runModule()` đã có `.catch()` hiển thị lỗi rõ ràng nếu vô tình gọi khi Disable — không tạo Job.
- **Không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md`, `js/ai/task-router.js` (Banner Generator không dùng qua AI Assistant, cùng lý do Topic-only Routing như Blog Writer/FAQ Generator/Facebook Post Generator).
- **Kiểm thử**: chạy thật `permission-service.js`/`plugin-db.js`/`banner-generator.js`/`job-queue.js`/`admin-ai.js` qua Node `vm` (4 kịch bản) — Editor/Admin được phép chạy `banner-generator` với quyền `ai.generate.banner` mới thêm; seed mặc định đúng (không ảnh hưởng `image-prompt-generator` còn "coming_soon"); module đọc đúng dữ liệu thật (`theme`/`link` tự do), không hardcode Prompt; toàn bộ luồng enqueue→Queue xử lý→Draft→`publishDraftById()` đều đúng — publish tạo đúng 1 Banner thật qua `BannerDB.add()`, không ghi nhầm vào `BlogDB`/`DB`. Kiểm tra `admin/ai/plugins.html`/`admin/ai/index.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #4.

## Sprint 6 — Kích hoạt Facebook Post Generator (Requirement #2)

Kích hoạt Facebook Post Generator (`js/ai/modules/facebook-post-generator.js`, đã có từ Sprint 1) từ "Coming Soon" sang Production, tái sử dụng hoàn toàn AI Framework hiện có, theo đúng khuôn mẫu đã kiểm chứng ở Blog Writer (Sprint 6 Requirement #1)/FAQ Generator (Sprint 5 Requirement #3). Không sửa Sprint 2/3/4/5, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record** — giống Blog Writer, Requirement này không yêu cầu thêm Route vào AI Task Router và liệt kê rõ việc đó ngoài phạm vi — không có xung đột giữa Functional Requirement và Architectural Constraint.
- **Kích hoạt Plugin (Functional Req)**: thêm `'facebook-post-generator'` vào `SPRINT2_ENABLED_MODULES` (`js/ai/plugin-db.js`) — chỉ ảnh hưởng giá trị SEED MẶC ĐỊNH cho môi trường CHƯA có dữ liệu; môi trường Production đã seed từ trước vẫn cần Admin tự bật "Enable" trong `admin/ai/plugins.html`.
- **Permission (Functional Req "thêm Permission nếu cần")**: thêm `GENERATE_FACEBOOK: 'ai.generate.facebook'` vào `AI_PERMISSIONS`, gán `'facebook-post-generator'` trong `PLUGIN_PERMISSIONS`, thêm vào `ROLE_PERMISSIONS.editor` (`js/ai/permission-service.js`) — đúng khuôn mẫu đã dùng cho Product/SEO/Slider/FAQ/Blog, không đổi logic RBAC.
- **Dữ liệu thật, không hardcode Prompt**: xác nhận `buildPrompt()` dùng đúng `message` tự do người dùng nhập, kèm `product` thật qua `DataProvider.getProduct()` khi có chọn sản phẩm (trường `productId` optional) — không có chuỗi cố định nào; xử lý đúng cả 2 trường hợp có/không chọn sản phẩm.
- **Draft Workflow, `targetCollection: null` — lần đầu kích hoạt dạng plugin "chỉ xem/copy"**: khác Blog Writer/FAQ Generator/SEO/Product/Slider (đều có `targetCollection` ghi vào 1 node CMS thật), Facebook Post Generator có `targetCollection: null` vì không có nơi publish trực tiếp trong CMS — Draft chỉ để xem/copy thủ công trong `admin/ai/drafts.html`. Xác nhận qua mô phỏng: nhánh `targetCollection === null` trong `publishToTarget()` (`js/admin-ai.js`) đã xử lý đúng từ trước (`Promise.resolve()`, không ghi gì) — `publishDraftById()` chuyển Draft sang trạng thái `'published'` mà KHÔNG ghi vào bất kỳ node CMS nào (`BlogDB`/`DB`/`BannerDB`/`SiteContentDB` đều không bị gọi) — đúng thiết kế "chỉ xem/copy, không tự đăng Facebook".
- **Plugin Disable (Functional Req)**: đã đúng sẵn — Dashboard chỉ hiển thị Plugin đang Enable; `runModule()` đã có `.catch()` hiển thị lỗi rõ ràng nếu vô tình gọi khi Disable — không tạo Job.
- **Không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md`, `js/ai/task-router.js` (Facebook Post Generator không dùng qua AI Assistant, cùng lý do Topic-only Routing như Blog Writer/FAQ Generator).
- **Kiểm thử**: chạy thật `permission-service.js`/`plugin-db.js`/`facebook-post-generator.js`/`job-queue.js`/`admin-ai.js` qua Node `vm` (4 kịch bản) — Editor/Admin được phép chạy `facebook-post-generator` với quyền `ai.generate.facebook` mới thêm; seed mặc định đúng (không ảnh hưởng `banner-generator` còn "coming_soon"); module đọc đúng dữ liệu thật (product optional qua DataProvider + message tự do), không hardcode Prompt; toàn bộ luồng enqueue→Queue xử lý→Draft→`publishDraftById()` với `targetCollection: null` đều đúng — Draft chuyển "published" nhưng KHÔNG ghi vào bất kỳ node CMS nào. Kiểm tra `admin/ai/plugins.html`/`admin/ai/index.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #3 (Banner Generator).

## Sprint 6 — Kích hoạt Blog Writer (Requirement #1)

Kích hoạt Blog Writer (`js/ai/modules/blog-writer.js`, đã có từ Sprint 1) từ "Coming Soon" sang Production, theo đúng khuôn mẫu đã kiểm chứng ở Sprint 5 Requirement #3 (FAQ Generator). Không sửa Sprint 2/3/4/5, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record** — khác với FAQ Generator (Sprint 5 Requirement #3), Requirement này liệt kê rõ "Topic-only Routing" trong Out of Scope và không có Functional Requirement nào yêu cầu thêm Route vào AI Task Router — không có xung đột giữa Functional Requirement và Architectural Constraint như trước.
- **Kích hoạt Plugin (Functional Req #1/#2)**: thêm `'blog-writer'` vào `SPRINT2_ENABLED_MODULES` (`js/ai/plugin-db.js`) — chỉ ảnh hưởng giá trị SEED MẶC ĐỊNH cho môi trường CHƯA có dữ liệu; môi trường Production đã seed từ trước vẫn cần Admin tự bật "Enable" trong `admin/ai/plugins.html`.
- **Permission (Functional Req #3)**: thêm `GENERATE_BLOG: 'ai.generate.blog'` vào `AI_PERMISSIONS`, gán `'blog-writer'` trong `PLUGIN_PERMISSIONS`, thêm vào `ROLE_PERMISSIONS.editor` (`js/ai/permission-service.js`) — đúng khuôn mẫu đã dùng cho Product/SEO/Slider/FAQ, không đổi logic RBAC.
- **Dữ liệu thật, không hardcode Prompt (Functional Req #4)**: xác nhận `buildPrompt()` dùng đúng `topic`/`tone`/`keywords` do người dùng nhập — không có chuỗi cố định nào. Cùng dạng "chủ đề tự do" như FAQ Generator (không có trường chọn 1 Product/Blog Post cụ thể, không gọi `DataProvider`).
- **Draft Workflow/Human Review (Functional Req #5)**: xác nhận qua mô phỏng — không cần sửa gì, `job-queue.js`/`admin-ai.js` (`publishToTarget()`/`publishDraftById()`) đã xử lý đúng trường hợp Draft không có `targetId` (tạo MỚI 1 blog post, tự sinh slug).
- **Plugin Disable (Functional Req #6)**: đã đúng sẵn — Dashboard chỉ hiển thị Plugin đang Enable; `runModule()` đã có `.catch()` hiển thị lỗi rõ ràng nếu vô tình gọi khi Disable — không tạo Job.
- **Không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md`, `js/ai/task-router.js` (Blog Writer không dùng qua AI Assistant, giống FAQ Generator).
- **Kiểm thử**: chạy thật `permission-service.js`/`plugin-db.js`/`blog-writer.js`/`job-queue.js`/`admin-ai.js` qua Node `vm` — Editor/Admin được phép chạy `blog-writer`; seed mặc định đúng cho môi trường mới (không ảnh hưởng `faq-generator`/`facebook-post-generator`); prompt dùng đúng dữ liệu người dùng nhập; toàn bộ luồng enqueue→Queue xử lý→Draft→`publishDraftById()`→tạo blog post mới đều đúng, Draft luôn dừng ở "draft" trước khi publish. Kiểm tra `admin/ai/plugins.html`/`admin/ai/index.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #2.

## Sprint 5 — Kiểm tra toàn diện + Đóng Sprint (Requirement #5) — SPRINT 5 COMPLETED

Requirement cuối cùng của Sprint 5 — không thêm tính năng, chỉ kiểm thử/xác minh/đánh giá toàn bộ Sprint 5 trước khi đóng.

- **2 điểm không khớp thực tế trong Context/Functional Requirements — ghi nhận rõ, không tự suy diễn**:
  - Context ghi "Requirement #2 COMPLETED" — thực tế **"Requirement #2" (AI Workflow Engine) chưa từng được triển khai** (bị hủy giữa chừng từ nhiều lượt trước, đã nhắc lại ở Requirement #3 và #4). Không chặn việc kiểm thử Requirement #5 vì bản thân Functional Requirements #1–10 của Requirement #5 không liệt kê hạng mục nào thuộc Workflow Engine.
  - Functional Requirement #2 yêu cầu "Kiểm thử Blog Writer" — thực tế **Blog Writer chưa được kích hoạt sang Production ở Sprint 5** (chỉ FAQ Generator được kích hoạt, ở Requirement #3). Blog Writer vẫn ở trạng thái "Coming Soon" — không có gì để kiểm thử ở phạm vi Production. Đã bỏ qua mục này, ghi rõ trong `docs/SPRINT_5_PROGRESS.md`.
- **Chạy lại toàn bộ mô phỏng đã viết qua Sprint 3/4/5** (12 file kịch bản, chạy mã nguồn thật qua Node `vm`, không viết lại) — **tất cả PASS, không đổi kết quả**: Queue/Permission/Draft/Log (Sprint 3), AI Task Router/Conversation History/Ambiguous Resolution/Plugin Unavailable (Sprint 4), Production Health Check/FAQ Generator/Usage Visibility (Sprint 5).
- **Regression Test (Functional Requirement #10)**: `git log` xác nhận từng file một — `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md` dừng đúng ở commit Sprint 2 Requirement #8 (không đổi qua Sprint 3/4/5); `task-router.js` chỉ có đúng 1 commit (Sprint 4 Requirement #1); `admin-ai.js` dừng ở Sprint 4 Requirement #2; `admin-ai-assistant.js` dừng ở Sprint 4 Requirement #5; `permission-service.js`/`plugin-db.js` chỉ có đúng 2 commit mỗi file (tạo ở Sprint 2 + bổ sung `ai.generate.faq`/seed FAQ Generator ở Sprint 5 Requirement #3, đúng như đã ghi nhận, không có thay đổi nào khác ngoài dự kiến); `functions/index.js` không đổi từ Sprint 3.
- **CMS Console check**: cả 9 trang `admin/ai/*.html` (index/drafts/jobs/logs/plugins/providers/assistant/health/usage) load 0 lỗi console, 0 request thất bại.
- **Security check**: grep xác nhận không có API Key/secret nào trong toàn bộ file Sprint 5 (`health-check.js`, `admin-ai-health.js`, `usage-stats.js`, `admin-ai-usage.js`, `health.html`, `usage.html`); Cloud Function vẫn CHƯA deploy (không đổi so với Sprint 3/4, không phải vấn đề do Sprint 5 gây ra).
- Lập `docs/SPRINT_5_PROGRESS.md` (Requirement Summary, Architecture/Security Verification, Production Readiness, Non-functional Evaluation, Known Limitations, mục chuyển sang Sprint 6).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- **SPRINT 5 COMPLETED (Requirement #1, #3, #4, #5 — theo đúng những gì thực sự được giao và triển khai). Không bắt đầu Sprint 6. Không làm Requirement #6.**

## Sprint 5 — Usage Visibility (Requirement #4)

**Lưu ý về trình tự (nhắc lại)**: Requirement ghi "Requirement #2 và #3 đã hoàn thành" — Requirement #3 đúng là đã COMPLETED, nhưng "Requirement #2" (AI Workflow Engine) **vẫn chưa từng được triển khai** (bị hủy giữa chừng từ nhiều lượt trước). Đã tiếp tục Requirement #4 vì Usage Visibility không phụ thuộc Workflow Engine.

Xây `Usage Visibility` — cho Administrator quan sát mức độ sử dụng AI Framework, hoàn toàn từ dữ liệu `aiLogs` đã có, KHÔNG phải Cost Tracking/Billing. Không sửa Sprint 2/3/4, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Không cần Decision Record**: mọi dữ liệu cần thiết (tổng số Generate, theo Plugin, theo Provider, theo trạng thái Completed/Failed/Cancelled) đã có sẵn trong `aiLogs` hiện tại (`moduleId`, `provider`, `status`, `timestamp`) — không cần thêm Field/Collection nào, không đụng tới Token Usage/Cost Tracking (đúng Out of Scope).
- **Thêm** `js/ai/usage-stats.js` (`UsageStats.compute(rangeKey)`) — CHỈ ĐỌC `LogDB.getAll()` (`js/ai/ai-db.js`), không gọi bất kỳ hàm ghi nào (`add`/`update`). Lọc theo `rangeKey` (`today`/`7d`/`30d`), tổng hợp đếm theo Plugin (`moduleId`), theo Provider (`provider`), theo Trạng thái (`completed`/`failed`/`cancelled`/`permission_denied` — hiển thị đủ cả 4 vì đều là dữ liệu thật có sẵn trong `aiLogs`, không chỉ 3 mục yêu cầu tối thiểu). "Tổng số lần Generate" = tổng số bản ghi Log trong khoảng thời gian đã chọn (mọi trạng thái) — định nghĩa đơn giản, nhất quán với các breakdown, không ước tính token/chi phí.
- **Thêm** `admin/ai/usage.html` + `js/admin-ai-usage.js` — trang Admin-only mới, bộ lọc Hôm nay/7 ngày/30 ngày, 3 bảng (Plugin/Provider/Trạng thái). Khi không có dữ liệu trong khoảng đã chọn, hiển thị thông báo rõ ràng ("Chưa có dữ liệu...") — không phải "System Error".
- **Thêm** 1 dòng liên kết trong `admin/ai/logs.html` trỏ sang `usage.html`.
- **Xác nhận không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `task-router.js`, `data-provider.js`, `AI_RULES.md`, Database Structure — `usage-stats.js` không import/gọi bất kỳ hàm ghi nào của các module này.
- **Kiểm thử**: chạy thật `js/ai/usage-stats.js` qua Node `vm` (4 kịch bản: tổng hợp 7 ngày, mở rộng 30 ngày, lọc "hôm nay", dữ liệu rỗng) — tất cả PASS, xác nhận `LogDB.getAll()` là lời gọi DUY NHẤT (0 lần gọi `add`/`update`), tổng hợp đúng theo cả 3 chiều, an toàn khi không có dữ liệu. Kiểm tra `admin/ai/usage.html` + `admin/ai/logs.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- **Có khả năng mở rộng thành Cost Tracking sau này** (NFR) — nếu cần token/chi phí thật, sẽ cần thêm field vào `aiLogs` (đã ghi `ROADMAP.md` từ trước, cần Decision Record riêng khi được giao).
- Chưa triển khai Requirement #5.

## Sprint 5 — Requirement #3 (Revised): Decision Record Resolution — REQUIREMENT #3 COMPLETED

Chief Architect đã phê duyệt Decision Record còn treo từ Requirement #3 (xem mục ngay bên dưới): **chọn Option B**.

- **Quyết định**: KHÔNG mở rộng `js/ai/task-router.js` ở Sprint 5. FAQ Generator chỉ hoạt động qua Plugin Manager/Dashboard (`admin/ai/index.html`) — đúng phạm vi Requirement #3 (Revised): "Requirement này KHÔNG tích hợp AI Assistant, KHÔNG mở rộng AI Task Router". Không có thay đổi code nào so với bản trước — toàn bộ phần code (Plugin Manager seed, Permission `ai.generate.faq`, Draft Workflow) đã hoàn tất đúng ở lượt trước, `task-router.js` vẫn chưa từng bị đụng tới.
- **Xác nhận Acceptance Criteria (Revised) — đều đạt**: FAQ Generator hoạt động qua Dashboard; Plugin đăng ký đúng (`AIModuleRegistry`/`PluginDB` seed); Permission hoạt động đúng (`ai.generate.faq`); Queue hoạt động đúng (tái sử dụng nguyên `job-queue.js`); Draft được tạo (tạo mới blog post khi publish); Human Review hoạt động (Draft luôn dừng ở trạng thái `draft` trước khi Admin duyệt); không sửa `AI Task Router`; không Refactor Sprint 2/3/4 — tất cả đã xác nhận qua mô phỏng chạy mã nguồn thật ở lượt trước, không cần chạy lại vì không có code nào thay đổi.
- Cập nhật `ROADMAP.md`: ghi rõ nguyên văn theo yêu cầu — *"Topic-only Routing cho AI Assistant sẽ được xem xét ở một Requirement riêng trong tương lai."*
- Cập nhật `PROJECT_ARCHITECTURE.md` (đổi trạng thái mục "Kích hoạt FAQ Generator" thành COMPLETED, ghi rõ quyết định Option B).
- **Requirement #3: COMPLETED.**
- Không mở rộng Sprint. Không làm Requirement #4.

## Sprint 5 — Kích hoạt FAQ Generator (Requirement #3) — HOÀN TẤT MỘT PHẦN, CHỜ 1 QUYẾT ĐỊNH

**Lưu ý về trình tự**: Requirement này ghi "Requirement #1 và Requirement #2 đã hoàn thành", nhưng thực tế **chỉ Requirement #1 (Production Health Check) đã hoàn tất**. "Requirement #2" theo đúng nghĩa (AI Workflow Engine — nhiều bước liên tiếp) đã được gửi ở 1 lượt trước nhưng bị hủy giữa chừng ("[Request interrupted by user]") trước khi triển khai — chưa có dòng code nào cho Workflow Engine. Đã tiếp tục thực hiện Requirement #3 vì FAQ Generator không phụ thuộc Workflow Engine (đây là 1 plugin đơn, không phải chuỗi nhiều bước) — không có rủi ro kỹ thuật khi bỏ qua thứ tự. Cần Chief Architect xác nhận có muốn quay lại làm Workflow Engine sau không.

- **Đã hoàn tất** (không cần Decision Record — có sẵn điều khoản cho phép trong chính Requirement #3):
  - **Kích hoạt Plugin (Functional Req #1/#2)**: thêm `'faq-generator'` vào `SPRINT2_ENABLED_MODULES` (`js/ai/plugin-db.js`) — chỉ ảnh hưởng giá trị SEED MẶC ĐỊNH cho môi trường CHƯA có dữ liệu; môi trường Production đã seed từ trước vẫn cần Admin tự bật "Enable" trong `admin/ai/plugins.html` (thao tác vận hành, không phải code).
  - **Permission (Functional Req #4)**: thêm `GENERATE_FAQ: 'ai.generate.faq'` vào `AI_PERMISSIONS`, gán `'faq-generator'` trong `PLUGIN_PERMISSIONS`, thêm vào `ROLE_PERMISSIONS.editor` (`js/ai/permission-service.js`) — Requirement #3 tự cho phép việc này qua điều khoản "Thêm Permission phù hợp NẾU kiến trúc hiện tại yêu cầu" (có điều kiện, khác với Router — xem bên dưới); đúng khuôn mẫu Sprint 2 Requirement #8, không đổi logic RBAC.
  - **Draft Workflow/Human Review (Functional Req #5)**: xác nhận qua mô phỏng — không cần sửa gì, `job-queue.js`/`admin-ai.js` (`publishToTarget()`/`publishDraftById()`) đã xử lý đúng trường hợp Draft không có `targetId` (tạo MỚI 1 blog post, tự sinh slug), giống hệt cách Blog Writer hoạt động.
  - **Dữ liệu thật, không hardcode Prompt (Functional Req #6)**: xác nhận `buildPrompt()` dùng đúng `topic`/`questionCount` do người dùng nhập — không có chuỗi cố định nào. **Ghi nhận (không phải bug)**: FAQ Generator là plugin dạng "chủ đề tự do" (giống Blog Writer) — không có trường chọn 1 Product/Blog Post cụ thể như Product/SEO/Slider Generator, nên không gọi `DataProvider` để tra cứu thực thể — "dữ liệu thật" ở đây là chính nội dung người dùng gõ, không phải suy diễn/bịa đặt.
- **⚠️ CHƯA hoàn tất — Decision Record thật sự (khác Permission, không có điều khoản cho phép sẵn)**: Functional Requirement #3 ("Thêm Route phù hợp vào AI Task Router") xung đột trực tiếp với chính Architectural Constraint của Requirement này ("Không thay đổi AI Task Router", liệt kê không kèm điều kiện). Đã xác minh cụ thể bằng mô phỏng: `AITaskRouter.matchTarget()` hiện BẮT BUỘC khớp 1 thực thể thật (Product/Blog Post) từ `candidates` mới trả `reason:'ok'` — FAQ Generator không có trường chọn thực thể (chỉ có `topic` tự do), nên **bất kỳ route nào thêm vào cũng sẽ luôn trả về `target_not_found`, không bao giờ định tuyến được** (đã thử nghiệm xác nhận, không suy đoán). Đây không phải lỗi code — là giới hạn thiết kế có chủ đích của Router (chỉ hỗ trợ plugin nhắm vào 1 thực thể CMS có sẵn), chưa từng gặp phải cho tới FAQ Generator (Product/SEO/Slider đều nhắm thực thể thật).
  - **Option A**: Mở rộng `task-router.js` để hỗ trợ route "không cần thực thể" (topic-only) — vd thêm `targetType:'freeText'`, khi đó `matchTarget()` không tìm trong `candidates` mà lấy phần văn bản sau từ khóa làm `topic`. *Ưu điểm*: FAQ Generator dùng được qua AI Assistant tự nhiên như 3 plugin kia. *Nhược điểm*: vi phạm trực tiếp "Không thay đổi AI Task Router" của chính Requirement #3 — dù nhỏ, vẫn là sửa logic `route()`/`matchTarget()`. *Ảnh hưởng kiến trúc*: cục bộ 1 file, không đụng Queue/Plugin Manager/Provider/Permission.
  - **Option B**: KHÔNG thêm FAQ Generator vào AI Task Router ở Requirement này — chỉ dùng được qua Plugin Manager Dashboard cũ (`admin/ai/index.html`, đã hỗ trợ sẵn input dạng text tự do, không cần entity). AI Assistant (free-text) tạm thời không nhận diện được yêu cầu FAQ cho tới khi Router được thiết kế lại (1 Requirement riêng). *Ưu điểm*: tuân thủ tuyệt đối "Không thay đổi AI Task Router". *Nhược điểm*: không thỏa Functional Requirement #3 theo đúng nghĩa đen.
  - **Khuyến nghị**: Option B cho Requirement này (an toàn tuyệt đối, đúng tinh thần "chỉ tái sử dụng kiến trúc hiện có, không thiết kế kiến trúc mới" của chính Objective) — đưa Option A vào `ROADMAP.md` làm 1 Requirement riêng sau này ("Router hỗ trợ Plugin không cần thực thể — Blog Writer/FAQ Generator/Facebook Post Generator đều cùng dạng này").
- **Không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `data-provider.js`, `AI_RULES.md`, `js/ai/task-router.js` (chưa đụng tới, chờ quyết định).
- **Kiểm thử**: chạy thật `permission-service.js`/`plugin-db.js`/`faq-generator.js`/`job-queue.js`/`admin-ai.js` qua Node `vm` — Editor/Admin được phép chạy `faq-generator`; seed mặc định đúng cho môi trường mới; prompt dùng đúng dữ liệu người dùng nhập; toàn bộ luồng enqueue→Queue xử lý→Draft→`publishDraftById()`→tạo blog post mới đều đúng, Draft luôn dừng ở "draft" trước khi publish. Đã DEMO xác nhận (không phải suy đoán) rằng Router hiện tại không thể định tuyến FAQ Generator dù có thêm route. Kiểm tra `admin/ai/plugins.html`/`admin/ai/index.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- **Chưa đóng Requirement #3** cho tới khi Chief Architect quyết định Option A/B cho AI Task Router. Chưa triển khai Requirement #4.

## Sprint 5 — Production Health Check (Requirement #1)

Xây `Production Health Check` — cho Administrator xác nhận nhanh toàn bộ chuỗi AI Provider → Cloud Function → OpenAI API → Queue → Draft Workflow, KHÔNG tạo Job, KHÔNG tạo Draft, KHÔNG Publish. Không sửa Sprint 2/3/4, không Refactor AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Draft Workflow/Human Review Workflow, không đổi Database Structure.

- **Decision Record (tự xử lý, không phải fork thật cần chờ duyệt)**: cân nhắc 2 cách đặt Health Check — *Option A (đã chọn)*: trang mới riêng `admin/ai/health.html`, Admin-only; *Option B*: nhét thêm vào `admin/ai/providers.html` (đã có nút "Kiểm tra kết nối" per-provider). Chọn A vì Requirement định nghĩa đây là 1 "Health Report" tổng thể của cả hệ thống (Provider + Queue + Draft Workflow), không chỉ riêng Provider như trang cấu hình hiện có — nhét chung sẽ làm lẫn lộn "cấu hình provider" với "báo cáo sức khỏe hệ thống". Có thêm 1 dòng liên kết từ `providers.html` sang trang mới, không tạo mục nav cấp cao (tránh rối menu cho 1 công cụ chẩn đoán).
- **Thêm** `js/ai/health-check.js` (`HealthCheck.run(providerId)`) — tái sử dụng đúng API đã có, không phát sinh Business Logic mới:
  - **AI Provider + Cloud Function + OpenAI API**: gọi `AIProviderRegistry.get(id).health()` (đã có từ Sprint 3 Requirement #1) — 1 lời gọi này tự nhiên xác minh đủ cả 3 lớp trong 1 lượt (health() của OpenAI gọi Cloud Function → Cloud Function gọi `GET /v1/models` của OpenAI, không tốn token completion nào).
  - **Queue**: CHỈ ĐỌC `JobDB.getAll()` (`js/ai/ai-db.js`) — không gọi bất kỳ hàm ghi nào của `AIJobQueue` (`enqueue`/`resume`/`cancel`), không tạo/chạy Job nào. "Sẵn sàng" = node Firebase `aiJobs` đọc được.
  - **Draft Workflow**: CHỈ ĐỌC `DraftDB.getAll()` — không tạo/publish Draft nào.
  - Chạy đồng thời cả 3 nhánh (`Promise.all`, đều chỉ đọc, an toàn song song), trả về báo cáo với trạng thái riêng biệt từng thành phần — không gộp thành 1 "System Error" chung chung.
- **Thêm** `admin/ai/health.html` + `js/admin-ai-health.js` — trang Admin-only (`requiredRole:'admin'`), 1 nút "Chạy Health Check" + bảng kết quả 3 dòng (Provider→Cloud Function→OpenAI / Queue / Draft Workflow), mỗi dòng hiển thị đúng thông báo lỗi thật nếu có.
- **Thêm** 1 dòng liên kết trong `admin/ai/providers.html` trỏ sang `health.html`.
- **Xác nhận không đổi**: `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `task-router.js`, `data-provider.js`, `AI_RULES.md`, Database Structure — `health-check.js` không import/gọi bất kỳ hàm ghi nào của các module này.
- **Kiểm thử**: chạy thật `js/ai/health-check.js` qua Node `vm` (4 kịch bản: tất cả OK, Provider/Cloud Function lỗi, Queue lỗi, gọi với providerId khác không hardcode) — tất cả PASS, xác nhận không có lời gọi hàm ghi nào (`add`/`update`) trong bất kỳ kịch bản nào, kể cả khi có lỗi. Kiểm tra `admin/ai/health.html` + `admin/ai/providers.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- Chưa triển khai Requirement #2.

## Sprint 4 — Requirement #5: Decision Record Resolution — REQUIREMENT #5 COMPLETED

Chief Architect đã phê duyệt Decision Record còn treo từ Requirement #5 (xem mục "Sprint 4 — AI Assistant: điểm tương tác duy nhất" bên dưới): **chọn Option A**.

- **Quyết định**: `admin/ai/index.html` (Dashboard cũ) tiếp tục giữ mục điều hướng riêng trong `ADMIN_NAV`, song song với "Trợ lý AI" — không gỡ, không chuyển hướng, không ẩn chức năng hiện có. Không có thay đổi code nào (đúng trạng thái Option A đã được triển khai mặc định từ Requirement #6, nay được chính thức phê duyệt).
- **Điều chỉnh khung Functional Requirement #1**: AI Assistant là **Primary Experience Layer** (cách tương tác chính) — **không phải Unique Entry Point** (không phải cách duy nhất). Đây là điều chỉnh về ngôn ngữ/kỳ vọng của Requirement, không phải thay đổi kiến trúc hay code.
- **Architectural Rule mới, áp dụng cho các Requirement sau này**: Workflow AI Assistant không được thay thế Workflow Dashboard/Plugin Manager thủ công cho đến khi (1) đã kiểm chứng trên Production, (2) đã có người dùng thực tế, (3) đã chứng minh ổn định. Ghi nhận làm nguyên tắc lâu dài, không chỉ áp dụng 1 lần.
- **Không thay đổi**: Queue, Plugin Manager, Provider Manager, Permission Service, Database Structure, Workflow (`User → AI Assistant → AI Task Router → Permission Service → Plugin Manager → Queue → AI Provider → Draft → Human Review → Publish`) — quyết định này thuần về điều hướng/khung ngôn ngữ, không đụng bất kỳ lớp kiến trúc nào.
- **Acceptance Criteria của Requirement #5 kiểm tra lại — đều đạt** (không đổi so với xác nhận ở Requirement #6): người dùng làm việc được qua AI Assistant mà không cần biết Plugin nào chạy; AI Task Router chọn đúng Plugin; toàn bộ Workflow hiển thị đầy đủ trong AI Assistant; không bypass Permission/Plugin Manager/Queue/Human Review; không Refactor Sprint 2/3.
- Cập nhật `PROJECT_ARCHITECTURE.md` (đổi tên mục thành "Primary Experience Layer", thêm Architectural Rule).
- **Requirement #5: COMPLETED.**
- Lưu ý: Sprint 4 Requirement #6 (kiểm tra toàn diện + đóng Sprint) đã hoàn tất ở lượt trước — Sprint 4 đã ở trạng thái COMPLETED, mang theo đúng 1 Decision Record treo (mặc định Option A, không chặn đóng Sprint). Mục này chính thức phê duyệt Decision Record đó — không mở lại hay lặp lại Requirement #6.

## Sprint 4 — Kiểm tra toàn diện + Đóng Sprint (Requirement #6) — SPRINT 4 COMPLETED

Requirement cuối cùng của Sprint 4 — không thêm tính năng, chỉ tái xác nhận toàn bộ AI Experience Layer (Requirement #1–#5) và đóng Sprint. Không sửa Sprint 2/3, không Refactor ngoài phạm vi.

- **Chạy lại toàn bộ mô phỏng đã viết qua Requirement #1–#5** (`task-router.js`, `admin-ai.js`, `admin-ai-assistant.js` — chạy mã nguồn thật qua Node `vm`, không viết lại) — **tất cả PASS, không đổi kết quả**: AI Task Router (chọn đúng Plugin/Confidence Score/không tạo Job khi thiếu điều kiện), Publish/Reject tái sử dụng đúng `publishToTarget()`, Ambiguous Target Resolution (tiếp tục Workflow đúng sau khi chọn), Conversation History (tổng hợp đúng từ dữ liệu có sẵn), AI Assistant Requirement #5 (Plugin không khả dụng → thông báo rõ, không tạo Job; tiến trình Request/Routing hiển thị đúng).
- **Chạy lại mô phỏng Sprint 3** (`job-queue.js`, `providers/openai.js`, 3 Plugin) — tất cả PASS, xác nhận Sprint 3 không bị ảnh hưởng bởi bất kỳ thay đổi nào của Sprint 4.
- **Regression Test (Functional Requirement #7)**: `git log` xác nhận `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`permission-service.js`/`data-provider.js`/`AI_RULES.md` không bị sửa lần nào kể từ Sprint 2 Requirement #8 — kể cả trong suốt Sprint 4; `js/ai/task-router.js` chỉ có đúng 1 commit (tạo ở Requirement #1), chưa từng bị sửa lại ở Requirement #2–#5; `functions/index.js` không đổi từ Sprint 3.
- **CMS Console check**: cả 7 trang `admin/ai/{index,drafts,jobs,logs,plugins,providers,assistant}.html` load 0 lỗi console qua static server nội bộ.
- **Security check**: grep xác nhận không có API Key/secret nào xuất hiện trong `task-router.js`/`admin-ai-assistant.js`/`assistant.html`; `firebase functions:list` xác nhận Cloud Function vẫn CHƯA deploy — không đổi so với Sprint 3 (không phải vấn đề phát sinh từ Sprint 4).
- **Decision Record Requirement #5 vẫn chưa được quyết định** — mặc định giữ theo Option A (giữ nguyên Dashboard cũ trong `ADMIN_NAV`, không cần code gì thêm) cho tới khi Chief Architect quyết định khác. Không chặn việc đóng Sprint 4 vì đây là 1 lựa chọn chính sách/UX còn treo, không phải lỗi hay thiếu chức năng.
- Lập `docs/SPRINT_4_FINAL_REPORT.md` (Requirement Summary, Architecture Verification, Security Verification, Production Readiness, Non-functional Evaluation, Known Limitations).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- **SPRINT 4 COMPLETED (Requirement #1–#6). Không bắt đầu Sprint 5. Chờ Sprint 5 Planning.**

## Sprint 4 — AI Assistant: điểm tương tác duy nhất (Requirement #5) — CHỜ 1 QUYẾT ĐỊNH

**Trạng thái: hoàn tất Functional Requirement #2–#6 + toàn bộ NFR. Functional Requirement #1 ("điểm vào duy nhất") có 1 Decision Record đang CHỜ Chief Architect quyết định — xem bên dưới, chưa tự ý đóng mục này.**

- **Decision Record — Dashboard cũ (`admin/ai/index.html`) có còn là 1 điểm vào song song không?**
  - **Option A — Giữ nguyên như hiện tại**: `admin/ai/index.html` (chọn Plugin thủ công) vẫn còn trong `ADMIN_NAV` như 1 mục điều hướng riêng, song song với "Trợ lý AI" (`assistant.html`).
    - *Ưu điểm*: giữ lối thoát thủ công khi AI Task Router không hiểu được yêu cầu (dù đã có Ambiguous Picker + thông báo lỗi rõ ràng ở Requirement #1/#3); không rủi ro, không cần đổi gì.
    - *Nhược điểm*: không thỏa mãn đúng nghĩa đen "điểm vào duy nhất" của Functional Requirement #1/Acceptance Criteria ("Người dùng chỉ làm việc thông qua AI Assistant") — vẫn có 2 cách để chạy AI.
  - **Option B — `admin/ai/index.html` không còn là điểm vào song song**: gỡ mục nav riêng cho Dashboard cũ (hoặc chuyển hướng `index.html` sang `assistant.html`), chỉ còn đúng 1 mục nav "AI" trỏ tới `assistant.html`. Các trang cấu hình/giám sát khác (Plugin Manager, Nhà cung cấp AI, Job Queue, Nhật ký, Duyệt nội dung) không đổi, vẫn truy cập được (không phải "điểm vào để chạy AI", mà là trang cấu hình/giám sát).
    - *Ưu điểm*: đúng nghĩa đen Functional Requirement #1 — chỉ 1 cách để bắt đầu 1 tác vụ AI.
    - *Nhược điểm*: mất hẳn lối "chọn Plugin thủ công" nếu AI Task Router hiểu sai nhiều lần liên tục; là thay đổi điều hướng có thể ảnh hưởng thói quen người dùng đã quen với Dashboard cũ.
  - **Ảnh hưởng kiến trúc**: cả 2 phương án đều KHÔNG đụng tới Queue/Plugin Manager/Provider Manager/Permission Service/Data Provider/AI Task Router/Database — chỉ là thay đổi 1 dòng trong `ADMIN_NAV` (`js/admin-auth.js`) và/hoặc nội dung `admin/ai/index.html`. Rủi ro kỹ thuật thấp, dễ đảo ngược ở cả 2 hướng.
  - **Khuyến nghị**: Option A tạm thời (giữ nguyên), vì Ambiguous Picker (Requirement #3) + thông báo lỗi rõ ràng (Requirement #1) + xử lý "Plugin không khả dụng" (Requirement #5, xem bên dưới) đã đủ để AI Assistant tự xử lý phần lớn trường hợp mà không cần lối thoát thủ công — nhưng việc **gỡ bỏ hẳn** 1 điểm vào đang tồn tại là thay đổi trải nghiệm người dùng trực tiếp, nên cần Chief Architect xác nhận rõ trước khi thực hiện, không tự quyết.
- **Đã hoàn tất (không phụ thuộc Decision Record trên)**:
  - **Functional Requirement #3** ("hiển thị Plugin đã được chọn sau khi Router định tuyến xong"): `dispatchAndShow()` hiển thị `routeResult.outcomeLabel` (mô tả theo Kết quả — "Mô tả sản phẩm"/"Gói SEO cho bài viết"/"Nội dung slide quảng cáo", KHÔNG phải id/tên Plugin kỹ thuật) ngay khi Routing xong, trước khi gọi Permission/Plugin Manager — vẫn đúng "người dùng không cần biết Plugin nào đang chạy" (Objective).
  - **Functional Requirement #4** (hiển thị đủ tiến trình Request/Routing/Processing/Draft Ready/Review/Publish): thêm 2 giai đoạn hiển thị mới — "Request" (ngay khi bấm gửi) và "Routing" (trong lúc tải dữ liệu + Router phân tích) — nối tiếp đúng các giai đoạn đã có từ Requirement #2 (Processing/Draft Ready) và cơ chế Publish/Reject.
  - **Functional Requirement #6 — sửa 1 bug thực sự phát hiện được**: `AITaskRouter.dispatch()` gọi `PluginManager.execute()` bên trong — nếu Plugin đang **Disable** trong Plugin Manager (hoặc thiếu dữ liệu bắt buộc), `execute()` **reject Promise** thay vì trả `{dispatched:false}` (hành vi có sẵn của `plugin-manager.js`, không sửa). Trước Requirement #5, `dispatchAndShow()` KHÔNG có `.catch()` cho trường hợp này — nếu gặp phải, màn hình sẽ treo ở "Đang xử lý" vĩnh viễn, không có thông báo, không rõ ràng. Đã thêm `.catch()` ở đúng Experience Layer (`js/admin-ai-assistant.js`) để hiển thị thông báo rõ ràng — không tạo Job (vì lỗi xảy ra trước khi Job được enqueue thành công).
  - **NFR "mở rộng khi bổ sung Plugin mới"**: đã thỏa mãn sẵn từ kiến trúc Requirement #1 (`AITaskRouter.ROUTES` là cấu hình dạng mảng, `outcomeLabelForModule()` có fallback `AIModuleRegistry` cho Plugin chưa có route) — không cần thêm gì.
- **Xác nhận không đổi**: `js/ai/task-router.js`, `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `data-provider.js`, `AI_RULES.md`, Database Structure.
- **Kiểm thử**: chạy thật `js/admin-ai-assistant.js` qua Node `vm` với DOM giả lập — xác nhận: (1) khi `dispatch()` reject vì Plugin không khả dụng, hiển thị thông báo rõ ràng và **không gọi** `AIJobQueue.resume()` (không tạo/chạy Job); (2) giai đoạn "Request"/"Routing" hiển thị đúng thứ tự trước khi hiện "Plugin đã chọn". Kiểm tra `admin/ai/assistant.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- **Chưa đóng Requirement #5** cho tới khi Chief Architect quyết định Decision Record ở trên. Chưa triển khai Requirement #6.

## Sprint 4 — AI Conversation History (Requirement #4)

Bổ sung khả năng xem lại các phiên làm việc trước đây của AI Assistant, giúp AI Assistant trở thành trung tâm làm việc thay vì chỉ là nơi nhập Prompt. Không sửa Sprint 2/3, không sửa Requirement #1/#2/#3 (`task-router.js`, Queue, Plugin Manager, Provider Manager, Permission Service, Data Provider, Draft/Human Review Workflow).

- **Database Policy — không tạo Database/Collection/field mới**: Conversation History tổng hợp hoàn toàn từ `aiJobs` (`JobDB.getAll()`) + `aiDrafts` (`DraftDB.get()`) + `products`/`blogPosts` (`DB.getAll()`/`BlogDB.getAll()`) đã có — không cần Decision Record "Database mới" vì chứng minh được reuse là đủ, không phát sinh Database mới ở Requirement này.
- **Ghi chú quan trọng cần biết (không phải bug — giới hạn có chủ đích)**: "User Request" hiển thị trong Lịch sử là **mô tả suy ra** (`outcomeLabel` + tên đối tượng, vd `Mô tả sản phẩm — "Loa JBL PartyBox 310"`), **KHÔNG phải nguyên văn câu người dùng đã gõ**. Lý do: `aiJobs`/`aiDrafts`/`aiLogs` hiện tại (Requirement #1–#3) không lưu lại chuỗi tự do người dùng gõ ở bất kỳ đâu — chỉ lưu `inputParams` đã được `AITaskRouter` phân giải (vd `{productId, tone}`). Vì Database Policy ưu tiên cao nhất "không thêm Database/field mới", đã chọn cách suy luận lại mô tả từ dữ liệu đã có thay vì thêm 1 field mới vào `aiJobs` để lưu nguyên văn câu gõ — thỏa mãn đầy đủ Functional Requirement #2/#8 (hiển thị + tìm kiếm theo "Request") mà không cần bất kỳ thay đổi Database Structure nào.
- **Thêm** vào `js/admin-ai-assistant.js`:
  - `loadHistory()` — tải `JobDB.getAll()` + `DB.getAll()`/`BlogDB.getAll()` (danh sách Product/Blog Post để tra tên), giới hạn hiển thị 50 phiên gần nhất (cùng cách `admin/ai/logs.html` giới hạn 200 — NFR "mở rộng khi Conversation tăng").
  - `outcomeLabelForModule(moduleId)` — suy nhãn hiển thị từ `AITaskRouter.ROUTES` đã công khai (không sửa Router); fallback về nhãn Plugin thật (`AIModuleRegistry`) cho Job tạo từ Plugin Manager cũ (`admin/ai/index.html`) — Conversation History hiển thị TẤT CẢ `aiJobs` bất kể tạo từ đâu, không chỉ job từ AI Assistant, vì không có field nào phân biệt nguồn gốc Job và không muốn thêm field mới chỉ để lọc.
  - `renderHistoryList()` — tìm kiếm/lọc theo Request (text), Plugin (dropdown), Thời gian (ngày) — lọc hoàn toàn trên dữ liệu đã tải, không gọi thêm Firebase mỗi lần gõ tìm kiếm (Functional Requirement #8).
  - `openHistorySession(entry)` — mở lại 1 phiên: **chỉ đọc** (`DraftDB.get()`), **KHÔNG gọi** `AIJobQueue.resume()`/`AITaskRouter.dispatch()` — tuyệt đối không tự chạy lại Job/Generate lại (Functional Requirement #4). Hiển thị đúng trạng thái Draft thật: còn `draft` → tái sử dụng `renderDraftPreview()` (Requirement #2, không viết lại) cho Preview + Duyệt/Từ chối; `published` → hiển thị Published kèm thời gian; `rejected` → hiển thị Rejected.
  - Sau khi 1 Job mới kết thúc (thành công/thất bại/hủy) hoặc sau khi Publish/Reject (kể cả từ trong Lịch sử), gọi lại `loadHistory()` để danh sách luôn khớp dữ liệu thật.
- **Thêm** khung "Lịch sử làm việc" (bảng + ô tìm kiếm/lọc) vào `admin/ai/assistant.html` — không có trang mới, vẫn cùng 1 trang AI Assistant.
- **Xác nhận không đổi**: `js/ai/task-router.js`, `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `data-provider.js`, `AI_RULES.md`, `js/admin-ai.js` (không thêm hàm mới lần này — `publishDraftById`/`rejectDraftById` từ Requirement #2 đã đủ dùng).
- **Kiểm thử**: chạy thật `js/admin-ai-assistant.js` qua Node `vm` với DOM giả lập tối thiểu (khác các Requirement trước — file này là Experience Layer thuần UI, không có logic nghiệp vụ mới để mô phỏng tách biệt) — xác nhận `loadHistory()`/`renderHistoryList()` tổng hợp đúng dữ liệu Job/Product/Blog Post thật thành mô tả đúng định dạng, lọc theo Plugin và tìm theo Request đều hoạt động đúng trên dữ liệu đã tải. Kiểm tra `admin/ai/assistant.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- Chưa triển khai Requirement #5.

## Sprint 4 — Ambiguous Target Resolution (Requirement #3)

Cho phép AI Assistant xử lý đúng trường hợp yêu cầu khớp nhiều đối tượng (vd "Loa JBL" khớp cả "Loa JBL" và "Loa JBL PartyBox 310") — người dùng chọn đúng đối tượng từ danh sách, **không cần gõ lại yêu cầu**. Không sửa `js/ai/task-router.js` (Requirement #1), không sửa cơ chế theo dõi tiến trình/Draft (Requirement #2), không sửa Sprint 2/3.

- **Không có Decision Record chính thức** — về lý thuyết có 2 hướng triển khai (A: Assistant tự đọc thêm dữ liệu Router đã công khai để dựng lại 1 routeResult đã giải quyết; B: mở rộng API `task-router.js` để tự trả về routeResult đã giải quyết sau khi nhận thêm 1 tham số lựa chọn), nhưng Phương án B bị loại ngay từ đầu vì vi phạm trực tiếp ràng buộc "Không thay đổi AI Task Router" — chỉ còn đúng 1 hướng hợp lệ (A), không phải 1 lựa chọn kiến trúc thật sự cần Chief Architect quyết định.
- **Sửa** `js/admin-ai-assistant.js` — thêm nhánh xử lý khi `AITaskRouter.route()` trả `reason:'target_ambiguous'`:
  - `showAmbiguousPicker(routeResult, candidates)` — hiển thị bảng các mục khớp (Tên, Danh mục, ID, Ngày tạo) để người dùng chọn. Dữ liệu làm giàu (`categoryLabel`/`createdAt`) lấy từ `candidates` **đã tải sẵn** ở `loadCandidates()` (không gọi thêm Firebase nào) — Router chỉ trả `{id,label}` tối thiểu, Assistant tự đối chiếu lại để hiển thị đủ thông tin phân biệt.
  - Khi người dùng bấm "Chọn": Assistant tự dựng lại 1 `routeResult` đã giải quyết, dùng `AITaskRouter.ROUTES.find(...).buildInputParams(chosenId)` — **đọc thêm dữ liệu Router đã công khai sẵn (`ROUTES`)**, không viết logic tính `inputParams` mới — rồi gọi thẳng `dispatchAndShow()` (Requirement #2) để tiếp tục đúng Workflow (`Permission Service → Plugin Manager → Queue → AI Provider → Draft → Human Review`), không cần người dùng nhập lại Prompt.
  - Khi người dùng bấm "Hủy": chỉ hiển thị thông báo, không gọi `dispatch()` — không tạo Job, không ghi Draft (Functional Requirement #5).
  - Trường hợp "không tìm thấy đối tượng phù hợp" (0 khớp, không phải ambiguous) giữ nguyên hành vi cũ từ Requirement #1 — chỉ báo lỗi, không tạo Job, không gọi Plugin.
- **Xác nhận không đổi**: `js/ai/task-router.js`, `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `data-provider.js`, `AI_RULES.md`, `js/admin-ai.js` (các hàm `publishDraftById`/`rejectDraftById` từ Requirement #2 không đổi).
- **Kiểm thử**: mô phỏng chạy `task-router.js` thật (không sửa) qua Node `vm` — xác nhận `route()` vẫn trả đúng `target_ambiguous` + danh sách như trước; `AITaskRouter.ROUTES[].buildInputParams()` tái sử dụng đúng để dựng `inputParams` sau khi chọn; sau khi "chọn" (routeResult tự dựng lại), `dispatch()` vẫn gọi đúng thứ tự `PermissionService → PluginManager.execute()` với đúng đối tượng người dùng chọn (không phải đối tượng suy đoán sai); xác nhận khi Hủy không có Permission/PluginManager nào được gọi. Kiểm tra `admin/ai/assistant.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`.
- Chưa triển khai Requirement #4.

## Sprint 4 — AI Assistant: Experience Layer hoàn chỉnh (Requirement #2)

Hoàn thiện vòng lặp tương tác của AI Assistant (Requirement #1): sau khi gửi yêu cầu, người dùng theo dõi toàn bộ tiến trình và xem/Duyệt/Từ chối Draft **ngay tại `admin/ai/assistant.html`** — không cần rời sang `admin/ai/jobs.html`/`admin/ai/drafts.html`. Không sửa Sprint 2/3, không sửa `js/ai/task-router.js` (Requirement #1), không đổi Constitution.

- **Decision Record đã xử lý (ghi lại quyết định)**: có 2 phương án để "tái sử dụng đúng cơ chế Publish/Reject có sẵn" trong `js/admin-ai.js`:
  - *Phương án A (đã chọn)*: thêm 2 hàm MỚI `publishDraftById(id)`/`rejectDraftById(id)` vào `js/admin-ai.js`, tái sử dụng nguyên hàm `publishToTarget()` private đã có — không phụ thuộc mảng `drafts` cục bộ của trang Duyệt nội dung, không cần gọi `AdminAuth.init()` lần 2.
  - *Phương án B (không chọn)*: gọi thẳng `AdminAI.publishDraft(id)`/`rejectDraft(id)` cũ, nhưng phải gọi thêm `AdminAI.initDrafts()` để nạp mảng `drafts` nội bộ trước — phát sinh `AdminAuth.init()`/`onAuthStateChanged` lần 2 trên cùng 1 trang, và có nguy cơ "im lặng không làm gì" nếu gọi `publishDraft(id)` trước khi mảng `drafts` kịp nạp (lỗi tiềm ẩn, khó phát hiện).
  - **Khuyến nghị/Lý do chọn A**: giảm Coupling đúng theo NFR của Requirement #2 (không phụ thuộc trạng thái nội bộ của 1 trang khác), không có nguy cơ "im lặng thất bại", không đổi `publishDraft()`/`rejectDraft()`/`initDrafts()` cũ (0 rủi ro hồi quy cho `admin/ai/drafts.html`).
- **Thêm** `publishDraftById(id)`/`rejectDraftById(id)` trong `js/admin-ai.js` — tái sử dụng đúng `publishToTarget()`/`DraftDB` có sẵn, **không sao chép Publish Logic**. `publishDraft()`, `rejectDraft()`, `initDrafts()`, `loadDrafts()`, `renderDrafts()` giữ nguyên 100%.
- **Sửa** `js/admin-ai-assistant.js`:
  - Sau khi `AITaskRouter.dispatch()` tạo Job thành công, gọi `AIJobQueue.resume(userId, userEmail)` — đây là API công khai có sẵn của Queue (giống hệt `js/admin-ai.js` `runModule()` đã làm cho Dashboard cũ), không bypass Queue. **Đây là 1 khoảng trống thực sự phát hiện được từ Requirement #1**: trước đây `dispatch()` chỉ enqueue Job (status `queued`) mà không có gì gọi `resume()`, nên Job tạo từ AI Assistant sẽ không bao giờ chạy cho tới khi ai đó mở `admin/ai/jobs.html`. Đã sửa trong Requirement #2 vì đây là điều kiện tiên quyết để "theo dõi tiến trình" có ý nghĩa.
  - Thêm theo dõi tiến trình: `trackJob(jobId, routeResult)` chỉ đọc đúng 1 Job vừa tạo (`JobDB.get(jobId)`, polling ngắt khi Job kết thúc, giới hạn tối đa ~60s) — không polling toàn bộ `JobDB` như `admin/ai/jobs.html` (đúng NFR Performance).
  - Trạng thái hiển thị: Request Received → Processing → Completed/Draft Ready hoặc Failed (kèm nguyên nhân thật từ `item.error`, không hiển thị "Unknown Error" chung chung).
  - Khi Completed, đọc `job.items[0].resultDraftId` → `DraftDB.get()` → hiển thị Preview (JSON, cùng kiểu với `admin/ai/drafts.html`) + nút "DUYỆT & PUBLISH"/"TỪ CHỐI" gọi `AdminAI.publishDraftById()`/`rejectDraftById()`.
- **Xác nhận không đổi**: `js/ai/task-router.js` (Requirement #1), `job-queue.js`, `plugin-manager.js`, `provider-registry.js`, `permission-service.js`, `data-provider.js`, `AI_RULES.md`. `admin/ai/jobs.html`/`admin/ai/drafts.html` hoạt động độc lập, không bị thay thế.
- **Kiểm thử**: mô phỏng chạy `js/admin-ai.js` thật qua Node `vm` (không DOM) — `publishDraftById()` tái sử dụng đúng `publishToTarget()` cho cả 3 `targetCollection` (`products`/`blogPosts`/`siteContent.heroSlides`), báo lỗi rõ ràng khi Draft không tồn tại (khác hành vi "im lặng" của `publishDraft()` cũ), các hàm cũ không đổi. Mô phỏng lại `job-queue.js` thật xác nhận hình dạng dữ liệu Job/Draft (`item.resultDraftId` khi thành công, `item.error` thật khi thất bại) khớp đúng những gì `admin-ai-assistant.js` đọc. Kiểm tra `admin/ai/assistant.html` qua static server — 0 lỗi console.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md` (đánh dấu hoàn tất mục đã ghi ở Requirement #1).
- Chưa triển khai Requirement #3.

## Sprint 4 — AI Assistant Entry Point + AI Task Router (Requirement #1)

Sprint 4 chuyển trọng tâm từ "xây AI Framework" (Sprint 2/3) sang "AI là lớp trải nghiệm chính" (Experience Layer) — theo đúng Sprint 4 Planning (Revision) đã được Chief Architect phê duyệt. Không sửa Sprint 2/3, không đổi Constitution (`AI_RULES.md`), không refactor `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`permission-service.js`/`data-provider.js`.

- **Thêm** `js/ai/task-router.js` (`AITaskRouter`) — lớp DUY NHẤT hiểu yêu cầu tự do (free text) và chọn đúng Plugin phù hợp trong 3 plugin đã Production (Product/SEO/Slider). Đây là logic **rule-based** (khớp từ khóa + khớp tên thực thể) — KHÔNG phải mô hình AI/ML thật, vì Requirement #1 cấm rõ "gọi OpenAI trực tiếp"/"thêm AI Provider mới"/"Multi-Agent" cho chính lớp Router này.
  - `route(text, candidates)` — hàm THUẦN (không side-effect): trả về `{pluginId, outcomeLabel, confidence, targetId, targetLabel, ambiguous, inputParams, reason}`. `candidates` (`{products, posts}`) do AI Assistant (UI) tự tải qua đúng `DB.getAll()`/`BlogDB.getAll()` có sẵn — Router không tự đọc Firebase.
  - `dispatch(routeResult, userId, userEmail)` — điểm DUY NHẤT Router gây side-effect, đúng thứ tự bắt buộc: `PermissionService.checkPluginExecution()` → `PluginManager.loadPlugin(id).execute()`. Không gọi Queue/Provider/OpenAI/Firebase trực tiếp ở bất kỳ đâu.
  - **Confidence Score** (0–100): 50% điểm khớp Plugin (dựa số từ khóa khớp, tối đa khi ≥2 từ khóa) + 50% điểm khớp đối tượng (100 nếu khớp đúng 1 sản phẩm/bài viết, 50 nếu khớp nhiều — ambiguous, 0 nếu không khớp). Ngưỡng tự thực thi: **≥95%**; dưới ngưỡng → hiển thị "Tôi hiểu yêu cầu như sau..." chờ xác nhận (Safety Checkpoint theo đúng Requirement #5).
  - **Không tạo Job** nếu: không xác định được Plugin (`plugin_not_found`), không xác định được đối tượng (`target_not_found`/`target_ambiguous`), hoặc Permission không đạt (`permission_denied`) — cả 3 trường hợp `dispatch()` dừng lại trước khi gọi `PluginManager`, xác nhận qua mô phỏng chạy code thật (không có mock nào bị gọi thừa).
  - **Quyết định kiến trúc quan trọng (ghi lại vì đụng ranh giới Constitution)**: `AI_RULES.md` mục 7 quy định CHỈ `AIJobQueue` và `PermissionService` (khi từ chối quyền) được ghi Log. Trường hợp `permission_denied` đã tự động có Log nhờ `PermissionService.checkPluginExecution()` sẵn có — không cần code mới. Nhưng 2 trường hợp `plugin_not_found`/`target_not_found`/`target_ambiguous` xảy ra TRƯỚC khi có Plugin nào được xác định — nếu Router tự ghi `LogDB` ở đây sẽ vi phạm cả "chỉ Queue/PermissionService ghi Log" (Constitution) LẪN "Router chỉ được gọi PermissionService → PluginManager.execute()" (Requirement #3, không liệt kê LogDB). Quyết định: KHÔNG thêm Router làm bên ghi Log thứ 3 — các trường hợp này chỉ hiển thị thông báo ở UI (`js/admin-ai-assistant.js`), không ghi vào `aiLogs`. Đã ghi ý tưởng "mở rộng Constitution cho phép Router ghi Log" vào `ROADMAP.md` để Chief Architect quyết định riêng, không tự ý mở rộng ở Requirement này.
- **Thêm** `admin/ai/assistant.html` + `js/admin-ai-assistant.js` — trang AI Assistant mới (Entry Point duy nhất theo Requirement #1): 1 ô nhập yêu cầu tự do + nút gửi. Tải `candidates` (sản phẩm/bài viết) qua đúng `DB.getAll()`/`BlogDB.getAll()` — giống hệt cách `js/admin-ai.js` đã tải cho `productSelect`/`blogSelect` trên Dashboard cũ, không phải cách đọc dữ liệu mới. Gọi `AITaskRouter.route()` rồi tùy Confidence: ≥95% tự gọi `AITaskRouter.dispatch()` ngay; <95% hiển thị xác nhận trước. **Không bao giờ hiển thị tên/id Plugin kỹ thuật cho người dùng** (Requirement #4) — chỉ hiển thị `outcomeLabel` ("Mô tả sản phẩm", "Gói SEO cho bài viết", "Nội dung slide quảng cáo").
- **Thêm** 1 mục điều hướng mới trong `js/admin-auth.js` (`ADMIN_NAV`): `{key:'ai-assistant', label:'Trợ lý AI', href:'/admin/ai/assistant.html'}` — thêm MỚI, không đổi/xóa mục "AI Assistant" cũ (vẫn trỏ `admin/ai/index.html`, vẫn dùng được như Dashboard chọn Plugin thủ công/fallback khi AI Assistant không hiểu yêu cầu).
- **Xác nhận không đổi**: `js/ai/job-queue.js`, `js/ai/plugin-manager.js`, `js/ai/provider-registry.js`, `js/ai/permission-service.js`, `js/ai/data-provider.js`, `AI_RULES.md` — không file nào trong số này bị sửa. Draft Workflow/Human Review giữ nguyên (dispatch cuối cùng vẫn đi qua `PluginManager.execute()` → `AIJobQueue` → `DraftDB`, publish vẫn chỉ qua `admin/ai/drafts.html`).
- **Kiểm thử**: mô phỏng chạy `js/ai/task-router.js` thật qua Node `vm` (9 kịch bản: chọn đúng cả 3 Plugin, Confidence cao/thấp, chặn đúng khi Plugin/đối tượng/Permission không xác định được, xác nhận Router chỉ gọi đúng thứ tự `PermissionService → PluginManager.execute()`) — tất cả PASS. Kiểm tra `admin/ai/assistant.html` qua static server — 0 lỗi console, toàn bộ script load đúng.
- **Không triển khai** (đúng yêu cầu Requirement #8 của Sprint 4): Multi-Agent, RAG, Prompt Versioning, AI Memory, AI Image, AI Voice, AI Provider mới, Database mới.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #2.

## Sprint 3 — Xác nhận sẵn sàng Pilot Production (Requirement #6) — SPRINT 3 COMPLETED

- **Không thêm code/feature** — Requirement #6 chỉ tái xác nhận (re-verify) toàn bộ AI Framework trước khi coi Sprint 3 hoàn tất, dùng lại đúng bộ mô phỏng đã viết ở Requirement #5 (chạy lại `job-queue.js`/`permission-service.js`/`providers/openai.js`/3 plugin qua Node `vm` — tất cả PASS, không đổi kết quả so với Requirement #5) cộng thêm các kiểm tra mới:
  - **CMS Console check**: mở lại cả 6 trang `admin/ai/{index,drafts,jobs,logs,plugins,providers}.html` qua static server — 0 lỗi console, 0 script 404, mỗi trang chuyển hướng đúng sang `admin/login` (đúng hành vi khi chưa đăng nhập).
  - **Production Deployment check**: `firebase functions:list` xác nhận Cloud Function `openaiProxy` **vẫn CHƯA deploy** (`Failed to authenticate, have you run firebase login?`) — không đổi so với Requirement #1, vẫn cần người phụ trách hạ tầng tự `firebase login`/set secret/deploy.
  - **Architecture Verification**: `git log -- AI_RULES.md` xác nhận Constitution của AI Framework không bị sửa lần nào trong suốt Sprint 3 (Requirement #1–#6); `git log` xác nhận Plugin/Queue/Provider/Permission (5 file lõi Sprint 2) vẫn độc lập, không bị sửa code.
  - **Security Verification**: xác nhận lại đầy đủ theo yêu cầu (Permission/RBAC/Queue/Draft/API Key) — riêng "Firebase Rules" **không thể xác minh trực tiếp** từ môi trường này vì Rules chỉ tồn tại trên Firebase Console, không version-control trong repo (ghi vào Known Limitations, đã có đề xuất version-control trong `ROADMAP.md` từ Requirement #5).
- Lập `docs/SPRINT_3_FINAL_REPORT.md` (Requirement Summary, Architecture Verification, Security Verification, Production Verification, Known Limitations, Future Roadmap).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`, `docs/SPRINT_3_PROGRESS.md`.
- **SPRINT 3 COMPLETED (Requirement #1–#6). Code sẵn sàng Pilot Production; kích hoạt thật vẫn chờ deploy Cloud Function (điều kiện ngoài phạm vi code, xem `docs/SPRINT_3_FINAL_REPORT.md`). Không bắt đầu Sprint 4.**

## Sprint 3 — End-to-End Integration Test + Completion Report (Requirement #5, cuối Sprint 3)

- **End-to-End Integration Test**: chạy mô phỏng thực thi mã nguồn sản xuất thật (Node `vm`, không viết lại logic) cho `job-queue.js`, `permission-service.js`, `providers/openai.js` và 3 plugin (Product/SEO/Slider) với Firebase/Cloud Function/OpenAI được thay bằng mock có kiểm soát — do Cloud Function `openaiProxy` chưa deploy nên không thể gọi OpenAI thật. Toàn bộ chi tiết ở `docs/SPRINT_3_PROGRESS.md`. Kết quả: Permission/Queue (Pending/Running/Completed/Failed/Retry/Cancel)/Provider (validate/health/generate)/3 Plugin/Draft/Logging (completed/failed/cancelled/permission_denied) đều đúng hành vi thiết kế.
- **Bug tìm thấy và đã sửa (chỉ sửa Bug, không refactor, không thêm feature)**:
  - `js/admin-ai.js` (`runModule`): xóa thông báo lỗi thời khẳng định "chưa có nhà cung cấp AI thật nên mọi job sẽ báo lỗi" — sai kể từ Requirement #1.
  - `admin/ai/index.html`: sửa dòng giới thiệu Dashboard có cùng khẳng định sai.
  - `js/ai/provider-interface.js`: sửa comment mô tả `generate()`/`health()` là "luôn stub" — nay ghi rõ OpenAI đã thật, 3 provider còn lại vẫn stub.
- **Regression Test**: xác nhận qua `git log` — `job-queue.js`, `plugin-manager.js`, `data-provider.js`, `provider-registry.js`, `permission-service.js` không bị sửa code kể từ commit Sprint 2 Requirement #8; không Requirement nào của Sprint 2 bị phá.
- **Security Verification**: xác nhận lại API Key OpenAI không nằm trong Browser/Firebase Database, chỉ tồn tại trong Cloud Function Environment (Secret Manager) — xem `docs/SPRINT_3_PROGRESS.md` mục 4.
- **Production Readiness**: code sẵn sàng Production cho cả 3 plugin; còn chặn bởi việc deploy Cloud Function (`firebase login` → set secret → `firebase deploy` → cập nhật `OPENAI_PROXY_URL` thật) — thao tác CLI người phụ trách hạ tầng tự làm.
- **Ý tưởng phát sinh (không triển khai)**: version-control Firebase Database Rules trong repo; test tự động (CI) cho Queue/Permission/Plugin — đã ghi `ROADMAP.md`.
- Lập `docs/SPRINT_3_PROGRESS.md` (Sprint 3 Completion Report: Requirement Checklist, Bug Summary, Architecture Verification, Security Verification, Integration Test Result, Production Readiness).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- **Sprint 3 hoàn tất (Requirement #1–#5). Không bắt đầu Sprint 4.**

## Sprint 3 — Slider AI Plugin: Framework → Production (Requirement #4)

- **Không sửa code** — rà soát chuỗi `User → Permission → Queue → Slider AI Plugin → DataProvider → OpenAI Provider → Draft → Completed` cho plugin **Slider Generator** (`js/ai/modules/slider-generator.js`) và xác nhận đã đúng yêu cầu Requirement #4 nhờ hạ tầng có sẵn từ Sprint 2 + Requirement #1/#2/#3, không cần thêm/đổi dòng code nào:
  - **Dữ liệu thật**: `loadContext()` gọi `DataProvider.getProduct(productId)` + `DataProvider.getMedia(productId)` (không gọi thẳng `DB`); `buildPrompt()` dùng `name`/`brand`/`specs` thật của sản phẩm làm chủ đề slide.
  - **Trường Slider được tạo**: `title` (Headline AI sinh), `subtitle` (Subheadline AI sinh — đóng vai trò Banner Description), `link` (CTA URL — suy ra thật từ `product.category`, hệ thống có hỗ trợ qua `heroCta.dataset.link` ở `js/home.js`), `image` (ảnh có sẵn của sản phẩm, không tự sinh ảnh), `imagePrompt` (gợi ý prompt tiếng Anh để dùng với công cụ tạo ảnh AI khác — không tự động sinh ảnh).
  - **Provider ẩn danh với Plugin**: Queue chọn qua `AIProviderRegistry.resolveForPlugin('slider-generator')` — giống Requirement #2/#3.
  - **Draft-only, Human Review giữ nguyên**: `targetCollection:'siteContent.heroSlides'` — publish thật chỉ chạy khi bấm "DUYỆT & PUBLISH" ở `admin/ai/drafts.html` (nối thêm slide vào `SiteContentDB`, không tự động).
  - **Retry/Failed/Log khi OpenAI lỗi**: dùng nguyên `job-queue.js` đã có, không mất Job.
  - **Không đổi**: Database, Queue, Provider, Workflow, Plugin Architecture, Permission (`ai.generate.slider` có sẵn từ Requirement #8).
- **Phát hiện cần ghi nhận rõ (không sửa vì sẽ là Refactor ngoài phạm vi)**: field `ctaText` trong Draft content **không phải do AI sinh** — nó chỉ copy nguyên giá trị Admin đã chọn ở dropdown `ctaStyle` (input có sẵn, không gọi OpenAI). Field này cũng **không được hiển thị ở đâu trên site** — `js/home.js` chỉ đọc `slide.title`/`slide.subtitle`/`slide.link`, nút CTA (`#heroCta`) dùng text cố định trong HTML, không đọc `slide.ctaText`. Đây là hiện trạng có từ Sprint 2 (không phát sinh ở Requirement #4), không sửa vì ngoài phạm vi "chỉ kích hoạt sang Production".
- **Ý tưởng phát sinh (không triển khai)** — ghi vào `ROADMAP.md`:
  - Làm `ctaText` có tác dụng thật (đọc trong `js/home.js` để đổi text nút CTA theo từng slide) hoặc bỏ hẳn field này nếu không cần — quyết định nằm ngoài phạm vi Requirement #4.
  - Cho AI gợi ý luôn nội dung nút CTA (hiện đang là lựa chọn cố định từ dropdown `ctaStyle`, không phải AI-generated).
  - AI Image Generation thật (dùng `imagePrompt` đã có làm input) — đã ghi từ trước ở `ROADMAP.md`, xác nhận lại khi rà soát Requirement #4.
  - Prompt Optimization, Prompt Versioning, Cost Tracking — cùng nhóm Future Ideas đã ghi ở Requirement #3, áp dụng chung cho mọi plugin Production.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #5.

## Sprint 3 — SEO AI Plugin: Framework → Production (Requirement #3)

- **Không sửa code** — rà soát chuỗi `User → Permission → Queue → SEO AI Plugin → DataProvider → OpenAI Provider → Draft → Completed` cho plugin **SEO Generator** (`js/ai/modules/seo-generator.js`) và xác nhận đã đúng yêu cầu Requirement #3 nhờ hạ tầng có sẵn từ Sprint 2 + Requirement #1/#2, không cần thêm/đổi dòng code nào:
  - **Dữ liệu thật**: `loadContext()` gọi `DataProvider.getBlogPost(postId)` (không gọi thẳng `BlogDB`); `buildPrompt()` dùng đúng nội dung bài viết thật (`title`, `excerpt`) — không hardcode, không nhập tay.
  - **Trường SEO được tạo**: `mapToDraftContent()` sinh `seoTitle` (SEO Title), `seoDescription` (Meta Description), `keywords` (mảng từ khóa — tương đương Focus Keyword mở rộng), `ogTitle`/`ogDescription`/`ogImage` (Open Graph), `schemaSuggestion` (gợi ý Schema.org).
  - **Provider**: giống Requirement #2, Queue chọn provider qua `AIProviderRegistry.resolveForPlugin('seo-generator')` — Admin gán "OpenAI" cho plugin này qua dropdown có sẵn ở `admin/ai/plugins.html`; plugin không biết provider cụ thể.
  - **Draft-only, Human Review giữ nguyên**: `DraftDB.add({status:'draft', targetCollection:'blogPosts', ...})`; publish thật (`BlogDB.update(targetId, draft.content)`) chỉ chạy khi Admin/Editor bấm "DUYỆT & PUBLISH" ở `admin/ai/drafts.html` — không đổi gì ở đây.
  - **Retry/Failed/Log khi OpenAI lỗi**: dùng nguyên `job-queue.js` đã có (Requirement #6/#7) — không mất Job.
  - **Không đổi**: Database, Queue, Provider, Workflow, Plugin Architecture, Permission (`ai.generate.seo` đã có sẵn từ Requirement #8, áp dụng đúng cho `seo-generator`).
- **Phát hiện quan trọng cần ghi nhận rõ (không sửa)**: SEO AI Plugin hiện có nhắm vào **Blog Post** (`targetCollection:'blogPosts'`), KHÔNG nhắm vào **Product** như các trường ví dụ trong yêu cầu (Product Name/Brand/Category) gợi ý — đây là giới hạn kiến trúc đã biết từ Sprint 1/2 (Product chưa có trang chi tiết riêng để gắn Meta/OG/Schema — xem `AI_RULES.md`, `ROADMAP.md` mục "SEO cho trang sản phẩm riêng"), không phải lỗi phát sinh ở Requirement #3. Không tự mở rộng plugin sang Product ở sprint này (đúng yêu cầu "không tạo Plugin mới, không đổi Interface").
- **Ý tưởng phát sinh (không triển khai)** — ghi vào `ROADMAP.md`:
  - Tách riêng 1 field "Focus Keyword" (hiện đang gộp trong mảng `keywords`).
  - AI gợi ý "URL Slug" — CHƯA làm: đổi slug của bài đã publish có rủi ro phá link cũ, cần thiết kế riêng (vd chỉ áp dụng cho bài chưa publish), không tự quyết định ở sprint này.
  - Prompt Optimization cho SEO Generator (hiện là 1 prompt cố định từ Requirement #3 Sprint 2).
  - Prompt Versioning (theo dõi lịch sử thay đổi prompt theo thời gian).
  - Cost Tracking theo provider/plugin (chi phí OpenAI usage).
  - SEO AI Plugin cho Product — cần Product có trang chi tiết riêng trước (đã ghi từ trước).
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #4.

## Sprint 3 — Product AI Plugin: Framework → Production (Requirement #2)

- **Không sửa code** — rà soát toàn bộ chuỗi `User → Permission → Queue → Product AI Plugin → DataProvider → OpenAI Provider → Draft → Completed` cho plugin **Product Description Generator** (`js/ai/modules/product-description-writer.js`) và xác nhận toàn bộ đã đúng yêu cầu Requirement #2 nhờ hạ tầng có sẵn từ Sprint 2 + Requirement #1, không cần thêm/đổi dòng code nào:
  - **Dữ liệu Product thật**: `loadContext()` gọi `DataProvider.getProduct(productId)` (không gọi thẳng `DB`), `buildPrompt()` dùng đúng field thật (`name`, `brand`, `specs`, `categoryLabel`) — không hardcode, không nhập tay (đã đúng từ Requirement #3).
  - **Provider**: Queue chọn provider qua `AIProviderRegistry.resolveForPlugin('product-description-writer')` — Admin gán "OpenAI" cho plugin này qua dropdown có sẵn ở `admin/ai/plugins.html` (Requirement #4/#5), tự động dùng đúng `openai.js` (Requirement #1 — gọi qua Cloud Function Proxy). Plugin không biết provider cụ thể là OpenAI.
  - **Draft-only, Human Review giữ nguyên**: `mapToDraftContent()` → `DraftDB.add(status:'draft')`, không publish tự động — `admin/ai/drafts.html` yêu cầu bấm "Duyệt & Publish" mới ghi vào Product thật (chưa đổi gì ở đây).
  - **Retry/Failed/Log khi lỗi**: `job-queue.js` `processItem()` bắt lỗi từ `provider.generate()` (kể cả lỗi từ Cloud Function Proxy), đánh dấu item `failed`, ghi `LogDB` (`status:'failed'`, `errorMessage`), không mất Job — `retryFailed()`/`resume()` có sẵn từ Requirement #6 xử lý đúng retry mà không tạo trùng Draft cho item đã thành công.
  - **Không đổi**: `IAIProvider`, `IAIPlugin`, Queue, Plugin Manager, Database Structure/Collection — đúng yêu cầu chỉ "kích hoạt" plugin đã có sang Production, không refactor/không mở rộng Sprint.
- **Kiểm thử**: xác nhận qua đọc code + luồng đã kiểm chứng ở Requirement #1/#6/#7 (Queue, Retry/Failed/Log, Draft, Human Review). Riêng mục "OpenAI Generate thành công" với response thật cần Cloud Function `openaiProxy` đã deploy — **vẫn đang chặn** ở bước `firebase login`/`firebase deploy` (thao tác CLI người phụ trách hạ tầng tự thực hiện, xem Requirement #1); sau khi deploy, chạy lại đúng plugin Product Description Generator để xác nhận Generate thật + Draft + Log.
- **Ý tưởng phát sinh (không triển khai)**: đưa vào `ROADMAP.md` — (1) thêm field "Model" riêng cho Product (hiện gộp trong `specs`), (2) cho phép AI dùng `description` hiện có làm ngữ cảnh viết lại/mở rộng thay vì luôn viết mới hoàn toàn.
- Cập nhật `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`.
- Chưa triển khai Requirement #3.

## Sprint 3 — Tích hợp OpenAI API thật (Requirement #1)

- **Phát hiện lỗ hổng kiến trúc** khi triển khai theo đúng nghĩa đen (lưu API Key trong `aiProviderConfig` phía client) — bị hệ thống an toàn tự động chặn vì node này đọc được bởi mọi tài khoản Editor/Admin CMS. Đã lập `ARCHITECTURE_REVIEW_SPRINT3.md`, phân loại **A — bắt buộc sửa ngay** (không phải rủi ro lý thuyết, có thể gây thiệt hại tài chính thật qua OpenAI billing).
- **Quyết định kiến trúc** (Chief Architect): chuyển sang **Cloud Function Proxy** — `Browser (CMS) → Cloud Function (openaiProxy) → OpenAI API`. API Key chỉ tồn tại trong Secret Manager phía server (Firebase Functions v2 `defineSecret`), không bao giờ xuất hiện ở Firebase Realtime Database hay bất kỳ đâu phía trình duyệt.
- **Thêm** `functions/index.js` (`openaiProxy`, Cloud Function 2nd gen) + `functions/package.json` + `firebase.json` + `.firebaserc` (mới, project lần đầu có Cloud Functions). Function chỉ có 3 nhiệm vụ: nhận request, validate request (xác thực Firebase Auth ID token + kiểm tra `roles/{uid}` — tái dùng đúng cơ chế phân quyền CMS đã có, không xây auth mới), gọi OpenAI, trả kết quả — không chứa Business Logic.
- **Đổi** `js/ai/providers/openai.js`: `generate()`/`health()` gọi qua Cloud Function Proxy thay vì gọi thẳng OpenAI — **`IAIProvider` không đổi** (vẫn đúng 3 phương thức `generate/validate/health`), chỉ đổi điểm kết nối bên trong 1 provider.
- **Đổi** `admin/ai/providers.html`/`js/admin-ai-providers.js`: bỏ hẳn ý định thêm ô nhập API Key (không cần nữa vì key không còn ở client); thêm nút "Kiểm tra kết nối" cho OpenAI — gọi đúng `provider.health()` có sẵn, không thêm phương thức mới vào `IAIProvider`.
- **Xác nhận không đổi**: Plugin (`js/ai/modules/*.js`) vẫn không biết OpenAI/Claude/Gemini/DeepSeek, chỉ gọi qua `IAIProvider`; Queue (`js/ai/job-queue.js`) và Plugin Manager (`js/ai/plugin-manager.js`) không sửa; Workflow `User → Permission → Queue → AI Provider → Draft → Completed` giữ nguyên; không đổi Database Structure/Collection nào (chỉ thêm 1 Cloud Function mới, không thêm node Firebase).
- Claude/Gemini/DeepSeek **không đổi** — vẫn là stub, ngoài phạm vi Requirement #1.
- Cập nhật `ROADMAP.md` (đánh dấu hoàn tất mục bảo mật API key cho OpenAI, thêm 3 mục Future Roadmap mới từ Architecture Review Report), `PROJECT_ARCHITECTURE.md`.
- Chưa triển khai Requirement #2.

## Sprint 2 — AI Assistant: Plugin Manager, Retry, mở rộng 3 plugin chính thức

### Requirement #8 — Permission & Safety Layer (RBAC) (bổ sung sau Requirement #7)

- **Thêm** `js/ai/permission-service.js` (`PermissionService`) — lớp RBAC mới, đọc vai trò từ node `roles` đã có (không tạo Database/node mới). Định nghĩa quyền `ai.generate.product`, `ai.generate.slider`, `ai.generate.seo`, `ai.manage.providers`, `ai.manage.plugins`; ánh xạ role `admin` (đủ 5 quyền) và `editor` (chỉ 3 quyền `ai.generate.*`).
- **Đổi** `js/admin-ai.js` `runModule()`: gọi `PermissionService.checkPluginExecution()` TRƯỚC khi gọi `PluginManager.loadPlugin().execute()` — đúng luồng `User → Permission → Queue → AI Provider → Draft`. Từ chối quyền thì dừng ngay, không tạo Job/không vào Queue/không gọi Provider/không tạo Draft.
- **Cố tình không sửa** `js/ai/job-queue.js` và `js/ai/plugin-manager.js` — đúng yêu cầu giữ nguyên Queue và Plugin Manager ở Requirement #8; permission check đặt ở lớp UI thay vì bên trong 2 module đó.
- **Sửa lỗ hổng thực sự**: `admin/ai/plugins.html` trước đây thiếu `requiredRole:'admin'` (khác với `admin/ai/providers.html` đã có sẵn từ Sprint 1) — nay bổ sung, đúng yêu cầu "chỉ Admin mới được thay đổi AI Provider và Plugin Settings".
- **Thêm** trạng thái Log mới `permission_denied` — ghi trực tiếp bởi `PermissionService` (ngoại lệ hợp lý của quy tắc "chỉ Queue ghi Log" ở Requirement #7, vì tại thời điểm từ chối quyền, Queue chưa từng được gọi nên không có Job để tự ghi log).
- **Đổi** `admin-ai.js` `LOG_STATUS_LABELS`: thêm nhãn hiển thị "Permission Denied".
- Không đổi Database (tái dùng node `roles` có sẵn), không đổi Workflow/Queue/AI Provider Interface/Plugin Manager, không refactor.
- Đã test: permission check chặn đúng luồng trước khi chạm Queue, không lỗi console ở Dashboard/Plugin Manager.
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Permission & Safety Layer"), `AI_RULES.md` (mục 8 mới), `docs/SPRINT_2_PROGRESS.md`.

### Requirement #7 — Log đúng thuật ngữ Completed/Failed/Cancelled, ghi cả khi hủy Job (bổ sung sau Requirement #6)

- **Xác nhận** (không cần đổi code): chỉ `AIJobQueue` ghi vào `LogDB`/`aiLogs`; `js/ai/modules/*.js`, `js/ai/providers/*.js`, `js/ai/plugin-manager.js` không tham chiếu `LogDB`; `js/admin-ai.js` chỉ đọc (`LogDB.getAll()`) — đã đúng kiến trúc từ Sprint 1/Requirement #4, không có gì phải sửa cho các điểm này.
- **Đổi** giá trị `status` trong log entry: `success` → `completed`, `failure` → `failed` (đúng thuật ngữ Requirement #7, không đổi field/schema).
- **Thêm** ghi Log khi hủy Job: `AIJobQueue.cancel(jobId, userId, userEmail)` giờ ghi thêm 1 dòng `aiLogs` với `status: 'cancelled'` — trước đây hủy job không tạo log nào, không đúng yêu cầu "không được bỏ qua bất kỳ Job nào".
- **Đổi** `PluginManager.cancel(jobId, userId, userEmail)` và `AdminAI.cancelJob()` để truyền user hiện tại xuống Queue, phục vụ đúng field "User" bắt buộc trong Log khi hủy.
- **Đổi** `admin-ai.js` `renderLogs()`: hiển thị đúng 3 nhãn Completed/Failed/Cancelled thay vì "Thành công"/"Thất bại" cũ.
- Không ghi Log riêng cho trạng thái `pending`/`running` — đã hiển thị real-time qua Job Queue Monitor, tránh mở rộng Logging System ngoài phạm vi.
- Không tạo Database/Collection mới, không thêm field nào ngoài `status` đổi giá trị.
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Logging Layer"), `AI_RULES.md` (mục 7 mới).
- Chưa triển khai Requirement #8, chưa xây Dashboard phân tích Log.

### Requirement #6 — Queue là điểm thực thi duy nhất, phân biệt Completed/Failed ở cấp Job (bổ sung sau Requirement #5)

- **Xác nhận** (không cần đổi code): UI (`admin-ai.js`) chỉ tạo Job qua `PluginManager.execute()`, không gọi `AIProviderRegistry`/Plugin trực tiếp; `PluginManager.execute()` chỉ gọi `AIJobQueue.enqueue()`, không tự chạy AI; `job-queue.js` không phụ thuộc UI, `js/ai/modules/*.js`/`js/ai/providers/*.js` không phụ thuộc ngược `AIJobQueue` — đã đúng kiến trúc từ Requirement #4/#5, không có gì phải sửa cho các điểm này.
- **Thêm** field `job.provider` (trong `js/ai/job-queue.js`, `processItem()`) — Job trước đây chưa lưu provider đã dùng ở cấp Job (chỉ có ở `aiLogs`/`aiDrafts.providerUsed`), nay lưu thêm để đủ field tối thiểu theo yêu cầu.
- **Sửa** `processSequentially()`: Job chuyển trạng thái **`failed`** (thay vì luôn `completed`) khi TẤT CẢ item trong job đều lỗi — trước đây job luôn thành `completed` dù 100% item thất bại, không đúng yêu cầu Queue phải phân biệt rõ Completed/Failed ở cấp Job. Job có ít nhất 1 item thành công vẫn là `completed` (kèm `progress.failed`).
- **Sửa** `runJob()`: không chạy lại job đã ở trạng thái `failed` (trạng thái kết thúc, giống `completed`/`cancelled`).
- **Sửa** `admin-ai.js`: nút "Thử lại" (`canRetry`) hiện thêm cho job ở trạng thái `failed`, giữ nguyên các điều kiện cũ.
- Không đổi tên field hiện có (`moduleId`, `createdBy`/`createdByEmail`, `finishedAt`) dù yêu cầu dùng tên `plugin`/`user`/`completedAt` — đã lập bảng ánh xạ khái niệm trong `AI_RULES.md`/`PROJECT_ARCHITECTURE.md` thay vì đổi Database Structure của dữ liệu đã tồn tại trên Firebase.
- Không xây Queue mới, không bổ sung trạng thái `status` nào khác ngoài `failed` ở cấp Job (vốn đã tồn tại ở cấp item từ Sprint 1).
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Queue Layer"), `AI_RULES.md` (mục 6 viết lại hoàn chỉnh).
- Chưa triển khai Requirement #7, chưa xây Queue mới.

### Requirement #5 — IAIProvider chính thức + Provider Manager chọn provider theo plugin (bổ sung sau Requirement #4)

- **Đổi** `js/ai/provider-interface.js`: formal hóa hợp đồng `IAIProvider` — chỉ 3 phương thức `generate()`, `validate(config)`, `health()` (bỏ `isConfigured()` cũ, vốn chưa từng được gọi ở đâu trong code).
- **Đổi** cả 4 file provider (`openai.js`, `claude.js`, `gemini.js`, `deepseek.js`): thay `isConfigured()` bằng `validate(config)` (trả `{valid, reason}`), thêm `health()` (stub, luôn `healthy:false` vì chưa tích hợp API thật).
- **Thêm** `AIProviderRegistry.resolveForPlugin(moduleId)` trong `js/ai/provider-registry.js` — chuyển logic "ưu tiên provider riêng của plugin, rơi về provider mặc định toàn cục" từ `job-queue.js` vào đúng 1 nơi (Provider Manager), tập trung trách nhiệm "Chọn Provider".
- **Đổi** `js/ai/job-queue.js`: xóa hàm `resolveProvider()` cục bộ (logic trùng lặp), gọi `AIProviderRegistry.resolveForPlugin()` thay thế; thêm bước gọi `provider.validate(config)` trước `provider.generate()` để báo lỗi rõ ràng hơn khi provider chưa sẵn sàng — lỗi vẫn ghi log qua `LogDB` như cũ.
- Luồng xử lý chuẩn hóa đúng yêu cầu: `AI Plugin → DataProvider → Context → AI Provider → Draft`.
- Không đổi Database, không đổi CMS Module khác, không đổi giao diện hiển thị, không đổi Plugin Manager hay Queue ngoài 1 điểm gọi hàm.
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Provider Manager Layer"), `AI_RULES.md` (mục 4 viết lại hoàn chỉnh).
- Chưa triển khai Requirement #6, chưa tích hợp thêm AI Provider nào ngoài 4 cái đã có.

### Requirement #4 — Plugin Manager là điểm gọi Plugin duy nhất (bổ sung sau Requirement #3)

- **Thêm** `js/ai/plugin-manager.js` (`PluginManager`): `loadPlugins()`, `loadPlugin(id)`, `isEnabled(id)`, `enablePlugin(id)`, `disablePlugin(id)`, `setProvider(id, providerId)`. Mỗi plugin trả về qua `loadPlugin()` theo interface `IAIPlugin`: `metadata` (`id/name/description/version/provider/enabled/status`), `validate(inputParams)`, `execute(items, userId, userEmail)` (chỉ gửi job vào `AIJobQueue`, không tự chạy AI), `cancel(jobId)` (ủy quyền `AIJobQueue.cancel()`).
- **Đổi** `js/admin-ai.js`: `renderModuleCards()` dùng `PluginManager.loadPlugins()` thay vì đọc thẳng `PluginDB`; `runModule()` gọi `PluginManager.loadPlugin(id).execute()` thay vì tự kiểm tra `PluginDB` rồi gọi thẳng `AIJobQueue.enqueue()`; `cancelJob()` gọi `plugin.cancel()` thay vì `AIJobQueue.cancel()` trực tiếp.
- **Đổi** `js/admin-ai-plugins.js` (trang Plugin Manager): Enable/Disable/gán Provider gọi qua `PluginManager.enablePlugin()`/`disablePlugin()`/`setProvider()` thay vì ghi thẳng `PluginDB.update()`.
- `PluginManager` không chứa Business Logic/Prompt/AI Provider — chỉ điều phối `AIModuleRegistry` (metadata) + `PluginDB` (trạng thái) + `AIJobQueue` (thực thi, đúng Queue hiện có, không xây mới). Log vẫn qua `LogDB`/`aiLogs` có sẵn, không xây cơ chế log mới.
- Không đổi Database Structure, không đổi CMS Module khác, không đổi giao diện hiển thị (`admin/ai/*.html` chỉ thêm 1 dòng script mỗi trang).
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Plugin Manager Layer"), `AI_RULES.md` (mục 5 mở rộng + mục 5b mới).
- Chưa triển khai Requirement #5, chưa thêm plugin mới nào ngoài phạm vi.

### Requirement #3 — Data Provider Layer (bổ sung sau khi Sprint 2 đã push lên GitHub)

- **Thêm** `js/ai/data-provider.js` (`DataProvider`, implement `IDataProvider`): `getProduct/getProducts/getCategories/getBrands/getMedia/getBlogPost/getBlogPosts/getSEO/getSettings` — cổng đọc CMS DUY NHẤT cho AI Plugin, chỉ có hàm đọc, không có hàm ghi.
- **Đổi cách 4 module đọc dữ liệu** (hành vi/prompt/output giữ nguyên, chỉ đổi đường truy vấn): `product-description-writer.js`, `seo-generator.js`, `slider-generator.js`, `facebook-post-generator.js` — từ gọi thẳng `DB.get()`/`BlogDB.get()` sang gọi qua `DataProvider.getProduct()`/`getBlogPost()`/`getMedia()`. 4 module còn lại (Blog Writer, FAQ, Image Prompt, Banner Generator) vốn không đọc CMS nên đã tuân thủ sẵn, không cần đổi.
- **Thêm** script `js/ai/data-provider.js` vào cả 5 trang `admin/ai/*.html` (trước `module-registry.js`).
- Pipeline chuẩn hóa: `AI Plugin → DataProvider → CMS Database → Context → AI Provider` — plugin không bao giờ tự query Database, chỉ nhận Context do `DataProvider` trả về.
- Không đổi Database, không đổi Workflow Draft → Review → Publish, không refactor `js/admin-ai.js`/`job-queue.js`/12 trang CMS gốc.
- Cập nhật `PROJECT_ARCHITECTURE.md` (mục "Data Provider Layer"), `AI_RULES.md` (mục 2 mở rộng + mục 2b mới).
- Chưa triển khai Requirement #4 (chờ giao ở lượt sau).

### Các hạng mục trước đó trong Sprint 2

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
