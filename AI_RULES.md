# AI Assistant — Quy tắc bắt buộc (AI_RULES)

AI Assistant trong PSH Platform là **Workflow Engine dạng Plugin**, KHÔNG phải chatbot. Mọi plugin mới thêm vào sau này (kể cả không do sprint này viết) đều phải tuân thủ các quy tắc dưới đây — vi phạm bất kỳ điều nào là lỗi thiết kế cần sửa trước khi merge.

## 1. Workflow bắt buộc

```
CMS → AI Plugin → Draft → Admin Review → Publish
```

AI không được tự Publish trong bất kỳ trường hợp nào. Mọi kết quả sinh ra dừng lại ở **Draft** (node `aiDrafts`), chỉ chuyển thành dữ liệu thật khi Admin/Editor bấm **Duyệt & Publish** trong `admin/ai/drafts.html`.

## 2. Chỉ đọc, không bịa, không sửa dữ liệu gốc

AI KHÔNG ĐƯỢC:
- Tự tạo Product/Brand/Category không có trong Database.
- Tự suy diễn/bịa số liệu không có trong dữ liệu đọc được.
- Tự sửa dữ liệu gốc, tự ghi đè dữ liệu CMS, hay tự Publish.

AI chỉ được phép đọc dữ liệu từ: **Products, Categories, Brands, Media Library, Blog, SEO, Settings** — và CHỈ qua `DataProvider` (xem mục 2b), không bao giờ gọi thẳng `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB` từ trong 1 module/plugin.

Các hàm ghi dữ liệu thật (`DB.update`, `BlogDB.update`, `BannerDB.add`, `SiteContentDB.save`...) chỉ được gọi ở **đúng 1 nơi**: `publishToTarget()` trong `js/admin-ai.js`, và chỉ chạy khi Admin bấm Publish.

## 2b. Data Provider — cổng đọc CMS duy nhất (Sprint 2, Requirement #3)

Pipeline bắt buộc cho mọi plugin:

```
AI Plugin → DataProvider (IDataProvider) → CMS Database → Context → AI Provider
```

`js/ai/data-provider.js` export `DataProvider`, implement đúng interface `IDataProvider`:

| Hàm | Nguồn dữ liệu thật |
|---|---|
| `getProduct(id)` / `getProducts()` | `DB` (Products) |
| `getCategories()` | `CategoryDB` (Categories) |
| `getBrands()` | Suy ra từ field `brand` trên Products — chưa có CMS module Brand riêng |
| `getMedia(productId)` | Ảnh có sẵn của chính Product (`images`) — CHƯA đọc từ Media Library dùng chung đã có từ Sprint 8 Requirement #2 (xem mục "Giới hạn kiến trúc đã biết" cuối file) |
| `getBlogPost(id)` / `getBlogPosts()` | `BlogDB` (Blog) |
| `getSEO()` | `SeoDB` (SEO) |
| `getSettings()` | `SiteContentDB.settings` (Settings) |

`DataProvider` **chỉ có hàm đọc** (`get*`), không có hàm ghi — plugin không bao giờ tự query Database, chỉ nhận Context do `DataProvider` trả về. Đổi nguồn dữ liệu sau này chỉ cần sửa `js/ai/data-provider.js`, không phải sửa từng plugin trong `js/ai/modules/*.js`.

## 3. Chỉ chạy khi có hành động rõ ràng của người dùng

Không có trigger tự động/cron/webhook nào khởi chạy AI. Mọi job đều bắt đầu từ việc người dùng bấm "Chạy" trên `admin/ai/index.html`.

## 4. Provider độc lập (IAIProvider + Provider Manager) (Sprint 2, Requirement #5)

Hợp đồng chung **`IAIProvider`** (`js/ai/provider-interface.js`) — chỉ đúng 3 phương thức, không thêm gì khác:
- `generate({ moduleId, prompt, params, config })` — gọi AI thật (hiện là stub, luôn reject vì chưa tích hợp API)
- `validate(config)` — trả `{ valid, reason }`, kiểm tra provider đã đủ điều kiện dùng chưa TRƯỚC khi gọi `generate()`
- `health()` — trả `Promise<{ healthy, message }>`, kiểm tra tình trạng kết nối provider hiện tại

`js/ai/provider-registry.js` (`AIProviderRegistry`) là **Provider Manager** — chịu trách nhiệm Đăng ký Provider (`register()`), Chọn Provider, và Trả về Provider đang hoạt động (`getActive()` toàn cục, `resolveForPlugin(moduleId)` theo từng plugin). AI Plugin **không được tự chọn Provider** và không biết Provider nào đang chạy — chỉ `AIJobQueue` mới gọi qua registry này (`resolveForPlugin()` → `provider.validate()` → `provider.generate()`).

Đổi nhà cung cấp AI (OpenAI/Claude/Gemini/DeepSeek/khác) chỉ cần:
- Đổi `activeProvider` toàn cục trong `admin/ai/providers.html`, HOẶC
- Gán provider riêng cho 1 plugin cụ thể trong `admin/ai/plugins.html` (Plugin Manager, `aiPlugins/{id}.providerId`, đọc qua `AIProviderRegistry.resolveForPlugin()`).

Không việc nào trong 2 việc trên yêu cầu sửa UI, Workflow, Plugin (`js/ai/modules/*.js`), hay Queue (`js/ai/job-queue.js`). Provider mới = thêm 1 file trong `js/ai/providers/*.js` tự gọi `AIProviderRegistry.register()`, implement đúng `IAIProvider` — không sửa `provider-registry.js`.

Luồng xử lý chuẩn (đúng Requirement #5): **AI Plugin → DataProvider → Context → AI Provider → Draft**. Log của mọi lượt `generate()` (kể cả thất bại vì chưa cấu hình) vẫn ghi qua `LogDB`/`aiLogs` có sẵn bên trong `AIJobQueue` — không xây Logging mới ở tầng Provider.

## 5. Plugin độc lập (Module/Plugin Registry)

Mỗi AI Action là 1 file riêng trong `js/ai/modules/*.js`, tự gọi `AIModuleRegistry.register()`. Thêm/gỡ 1 plugin không được phép ảnh hưởng plugin khác hay phần còn lại của hệ thống. Trạng thái Enable/Disable/Version/Provider của từng plugin quản lý qua **Plugin Manager** (`admin/ai/plugins.html`, node `aiPlugins`) — plugin bị Disable phải:
- Không hiển thị trên Dashboard (`admin/ai/index.html`).
- Không thể thực thi kể cả khi bị gọi trực tiếp (guard nằm trong `plugin.execute()` của `PluginManager`, xem mục 5b).

## 5b. Plugin Manager — điểm gọi Plugin duy nhất (Sprint 2, Requirement #4)

UI (`js/admin-ai.js`, `js/admin-ai-plugins.js`) **không được** gọi thẳng `AIModuleRegistry`/`PluginDB`/`AIJobQueue` để load/enable/disable/chạy/hủy 1 plugin — bắt buộc đi qua `PluginManager` (`js/ai/plugin-manager.js`):

```
UI → PluginManager → { AIModuleRegistry (metadata) + PluginDB (trạng thái) + AIJobQueue (thực thi) }
```

`PluginManager` cung cấp: `loadPlugins()`, `loadPlugin(id)`, `isEnabled(id)`, `enablePlugin(id)`, `disablePlugin(id)`, `setProvider(id, providerId)`. Mỗi plugin trả về qua `loadPlugin()` tuân theo interface **`IAIPlugin`** — chỉ đúng 4 thứ, không thêm phương thức nào khác:
- `metadata` — `{ id, name, description, version, provider, enabled, status }`
- `validate(inputParams)` — trả về `{ valid, missingFields }`
- `execute(items, userId, userEmail)` — **chỉ gửi job vào `AIJobQueue.enqueue()`**, không tự chạy AI; tự chặn nếu plugin đang Disable hoặc thiếu field bắt buộc
- `cancel(jobId)` — ủy quyền cho `AIJobQueue.cancel()`

`PluginManager` **chỉ quản lý Plugin** — KHÔNG chứa Business Logic (nằm trong từng file `js/ai/modules/*.js`), KHÔNG chứa Prompt, KHÔNG chứa AI Provider (nằm trong `js/ai/provider-registry.js`). Đổi provider (OpenAI/Claude/Gemini/DeepSeek) không bao giờ cần sửa `plugin-manager.js`. Log của mọi lượt `execute()` vẫn ghi qua `LogDB`/`aiLogs` có sẵn bên trong `AIJobQueue` — không xây cơ chế log riêng ở tầng Plugin Manager.

## 6. Job Queue tuần tự — Queue duy nhất, mọi Plugin bắt buộc đi qua (Sprint 2, Requirement #6)

Mọi plugin chạy qua `js/ai/job-queue.js` (`AIJobQueue`), xử lý **tuần tự từng item**, không chạy song song, không có Queue thứ 2. Luồng xử lý bắt buộc:

```
User → AI Plugin (PluginManager.execute) → Queue (AIJobQueue) → DataProvider → Context → AI Provider → Draft → Completed
```

- **UI chỉ được tạo Job** — không bao giờ gọi `AIProviderRegistry`/provider `.generate()` hay chạy Plugin logic trực tiếp.
- **PluginManager chỉ gửi Job vào Queue** (`execute()` → `AIJobQueue.enqueue()`), không tự chạy AI.
- **Queue chịu trách nhiệm**: Tạo Job (`enqueue`), Chạy Job (`runJob`), Retry Job (`retryFailed`), Resume Job (`resume`), Cập nhật Status (`JobDB.update`), Trả kết quả (`DraftDB`/`LogDB`).
- **Queue độc lập với UI/Plugin/Provider** — không phụ thuộc vòng: `job-queue.js` không tham chiếu file UI nào; `js/ai/modules/*.js` và `js/ai/providers/*.js` không tham chiếu ngược `AIJobQueue`.

**Field tối thiểu của 1 Job** (giữ nguyên tên field hiện có — không đổi Database Structure nếu không thật sự cần) và ánh xạ sang khái niệm yêu cầu:

| Khái niệm yêu cầu | Field thật trong `aiJobs/{id}` |
|---|---|
| `id` | `id` |
| `plugin` | `moduleId` |
| `provider` | `provider` (mới thêm — provider thực tế đã dùng khi xử lý job) |
| `user` | `createdBy` (uid) + `createdByEmail` |
| `status` | `status` |
| `createdAt` | `createdAt` |
| `startedAt` | `startedAt` |
| `completedAt` | `finishedAt` |

**Trạng thái**: `queued` (hiển thị "Pending"), `running`, `completed`, `failed` (Job — MỚI: khi TẤT CẢ item trong job đều lỗi; trước Requirement #6, job luôn thành `completed` bất kể item lỗi hay không, nay đã sửa), `failed` (item, đã có từ trước), `cancelled` (đã có từ trước Requirement #6, giữ nguyên vì là trạng thái đang dùng thật, không phải bổ sung mới). "Retry"/"Resume" là 2 **hành động** Queue hỗ trợ (`retryFailed()`/`resume()`), không phải giá trị `status` riêng biệt.

⚠️ **Giới hạn kiến trúc đã biết**: Job Queue hiện chạy phía trình duyệt Admin (V1) — PSH Platform không có backend/Cloud Functions. Nếu đóng tab `admin/ai/jobs.html` giữa chừng, job dở tiếp tục khi mở lại trang đó. Xem `ROADMAP.md` cho hướng nâng cấp — **không tự ý thêm Cloud Functions để "sửa" giới hạn này** nếu chưa được yêu cầu rõ ràng.

## 7. Log bắt buộc cho mọi lượt chạy — chỉ Queue được ghi (Sprint 2, Requirement #7)

**Chỉ `AIJobQueue` (Queue) và `PermissionService` (Requirement #8, khi từ chối quyền) được ghi Log** vào `LogDB`/`aiLogs` (Logging System đã có từ Sprint 1 — không tạo Database/Collection mới):
- Plugin (`js/ai/modules/*.js`) **không ghi Log trực tiếp** — chỉ thực hiện nhiệm vụ của mình (`loadContext`/`buildPrompt`/`mapToDraftContent`).
- AI Provider (`js/ai/providers/*.js`) **không ghi Log trực tiếp** — chỉ trả kết quả cho Queue qua `generate()`.
- `PluginManager` **không ghi Log trực tiếp** — Queue chịu trách nhiệm ghi Log trong quá trình thực thi Job.
- UI (`js/admin-ai.js`) **chỉ được đọc Log** (`LogDB.getAll()`) — không tạo/sửa/xóa Log.

Không được bỏ qua bất kỳ Job nào: Queue ghi 1 dòng Log cho **mỗi item xử lý** (thành công/thất bại) và **mỗi lần hủy Job** (`cancel()`, mới thêm ở Requirement #7 — trước đây hủy job không ghi log).

**Mỗi Log có tối thiểu** (không thêm field ngoài phạm vi Sprint): `userId`/`userEmail` (User), `moduleId` (Plugin), `provider` (Provider), `timestamp` (Time), `durationMs` (Duration), `status` (Status), `errorMessage` (Error).

**Trạng thái Log**: `completed`, `failed`, `cancelled` (Queue chủ động ghi cả 3 — đổi từ `success`/`failure` cũ sang đúng thuật ngữ này). `pending`/`running` là trạng thái tạm thời của Job/Item, đã hiển thị real-time qua Job Queue Monitor (`admin/ai/jobs.html`) — **không ghi Log riêng cho 2 trạng thái này**, tránh mở rộng Logging System ngoài phạm vi Sprint.

Log phục vụ: theo dõi tiến trình, debug, audit, kiểm tra lỗi — qua `admin/ai/logs.html`. **Chưa xây Dashboard phân tích Log** ở sprint này.

## 8. Permission & Safety Layer — RBAC bắt buộc trước khi thực thi (Sprint 2, Requirement #8)

Mọi AI Plugin **phải kiểm tra quyền trước khi thực thi**. AI Plugin **không hard-code quyền** — chỉ gọi qua `PermissionService` (`js/ai/permission-service.js`), lớp RBAC (Role-Based Access Control) DUY NHẤT, đọc vai trò từ đúng node `roles` đã có (không tạo Database/node mới).

**Quyền hỗ trợ** (`AI_PERMISSIONS`, không thêm quyền nào ngoài danh sách này):
- `ai.generate.product` — chạy Product Description Generator
- `ai.generate.slider` — chạy Slider Generator
- `ai.generate.seo` — chạy SEO Generator
- `ai.generate.faq` — chạy FAQ Generator *(thêm ở Sprint 5, Requirement #3)*
- `ai.generate.blog` — chạy Blog Writer *(thêm ở Sprint 6, Requirement #1)*
- `ai.generate.facebook` — chạy Facebook Post Generator *(thêm ở Sprint 6, Requirement #2)*
- `ai.generate.banner` — chạy Banner Generator *(thêm ở Sprint 6, Requirement #3)*
- `ai.generate.imagePrompt` — chạy Image Prompt Generator *(thêm ở Sprint 6, Requirement #4)*
- `ai.manage.providers` — đổi AI Provider (`admin/ai/providers.html`)
- `ai.manage.plugins` — đổi Plugin Settings (`admin/ai/plugins.html`)

*(Danh sách 5 quyền `ai.generate.*` được cập nhật đầy đủ ở Sprint 9 Requirement #1 — Documentation Integrity Restoration; trước đó chỉ ghi 3 quyền đầu tiên từ Sprint 2, dù mã nguồn `js/ai/permission-service.js` đã có đủ cả 8 từ Sprint 6. Đây là cập nhật tài liệu cho khớp code đã có sẵn, KHÔNG phải thêm quyền mới.)*

**Vai trò → quyền** (`ROLE_PERMISSIONS`): `admin` có toàn bộ 10 quyền; `editor` có 8 quyền `ai.generate.*` (toàn bộ plugin generate, kể cả 5 plugin kích hoạt ở Sprint 5-6) — **không có** `ai.manage.providers`/`ai.manage.plugins`, đúng yêu cầu "chỉ Admin mới được thay đổi AI Provider và Plugin Settings". Thực thi ở cấp trang qua `AdminAuth.init({requiredRole:'admin'})` — đã có sẵn ở `admin/ai/providers.html` từ trước, bổ sung thêm ở `admin/ai/plugins.html` (trước đây thiếu, là 1 lỗ hổng thực sự so với yêu cầu này).

**Luồng bắt buộc**: `User → Permission → Queue → AI Provider → Draft`. Kiểm tra quyền diễn ra ở lớp UI (`js/admin-ai.js`, hàm `runModule()`) **TRƯỚC KHI** gọi `PluginManager.loadPlugin(id).execute()` — cố tình đặt tại đây thay vì sửa `js/ai/job-queue.js` hay `js/ai/plugin-manager.js`, đúng yêu cầu **giữ nguyên Queue và Plugin Manager** ở Requirement #8. Nếu bị từ chối quyền:
- **Không tạo Job** — `execute()` (dẫn tới `AIJobQueue.enqueue()`) không bao giờ được gọi.
- **Không đưa vào Queue.**
- **Không gọi AI Provider.**
- **Không tạo Draft.**
- **Ghi Log** `permission_denied` — do `PermissionService` ghi trực tiếp (ngoại lệ hợp lý của quy tắc mục 7 "chỉ Queue ghi Log", vì tại thời điểm từ chối, Queue chưa từng được gọi tới nên không có Job nào để Queue tự ghi log; UI/Plugin/Provider/PluginManager vẫn không ghi log gì).

⚠️ **Giới hạn đã biết**: việc kiểm tra quyền hiện chỉ nằm ở điểm gọi duy nhất (`admin-ai.js`). Nếu sau này có thêm nơi khác gọi `PluginManager.execute()` trực tiếp, nơi đó cũng phải tự gọi `PermissionService.checkPluginExecution()` — không có tầng chặn tự động bên trong `plugin-manager.js`/`job-queue.js` (cố tình, vì Requirement #8 yêu cầu không sửa 2 module đó).

## 9. Giới hạn phạm vi hiện tại

*(Cập nhật ở Sprint 9 Requirement #1 — Documentation Integrity Restoration. Mục này trước đây đánh trùng số "## 8" với mục 8 "Permission & Safety Layer" ở trên và có 1 bản nháp Sprint 2 cũ (thuật ngữ `success`/`failure` đã lỗi thời, xem mục 7 mới ở trên dùng đúng `completed`/`failed`/`cancelled`) — đã gộp lại thành đúng 1 mục duy nhất, cập nhật đúng thực tế hiện tại, KHÔNG đổi bất kỳ quy tắc/ràng buộc nào ở mục 1-8.)*

Cả 8/8 plugin viết từ Sprint 1 (Blog Writer, Product Description Generator, SEO Generator, FAQ Generator, Facebook Post Generator, Image Prompt Generator, Slider Generator, Banner Generator) đã **Production** từ Sprint 6 — không còn plugin nào ở trạng thái Disabled/Coming Soon (xem `CHANGELOG.md` Sprint 5/6, `ROADMAP.md` mục "AI Assistant").

Chưa tích hợp AI Image Generation / AI Video ở bất kỳ hình thức nào (kể cả gọi thử) — các module liên quan (`image-prompt-generator`) chỉ sinh **văn bản prompt** để người dùng tự dùng ở công cụ khác. Vẫn đúng tính đến Sprint 9.

## Giới hạn kiến trúc đã biết (cập nhật liên tục qua các Sprint)

*(Mục này trước đây tên "Giới hạn kiến trúc phát hiện khi triển khai Sprint 2" — đổi tên cho đúng bản chất là 1 danh sách cập nhật liên tục, không chỉ riêng Sprint 2.)*

- ~~Media Library chưa tồn tại~~ — **đã xây từ Sprint 8 Requirement #2** (`js/media-library.js`/`js/media-library-picker.js`, kho ảnh dùng chung cho Product/Blog/Banner/Slider/Category). Tuy nhiên `DataProvider.getMedia()` (mục 2b ở trên) **CHƯA đọc từ Media Library này** — vẫn suy ra ảnh từ `product.images` của chính sản phẩm đang xử lý, đúng Architectural Constraint "Không đổi Data Provider" của Requirement #2 (xem `ROADMAP.md` mục "Media Library").
- **Sản phẩm không có trang riêng**: SEO Generator chỉ nhắm **Blog Post** (nơi `blog-post.html` đã có cơ chế set Meta/OG động sẵn) — chưa áp dụng cho Product. Vẫn đúng tính đến Sprint 9.

Cả 2 điểm trên đã ghi vào `ROADMAP.md` — không tự ý xây thêm (sửa `DataProvider.getMedia()`, hay trang sản phẩm riêng) nếu chưa được yêu cầu rõ ràng ở 1 Requirement riêng.
