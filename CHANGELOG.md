# Changelog

Định dạng: mỗi mục là 1 Sprint/đợt thay đổi, mới nhất ở trên.

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
