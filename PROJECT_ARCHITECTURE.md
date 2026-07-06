# PSH Platform — Kiến trúc tổng thể

## Tổng quan

PSH Platform (Pshop Music) là site tĩnh 100%: vanilla HTML/CSS/JS, không build step, deploy thẳng lên Netlify. Không có server ứng dụng riêng — toàn bộ dữ liệu động (sản phẩm, danh mục, blog, banner, slider, cài đặt, người dùng, AI Assistant) chạy qua Firebase (Realtime Database + Authentication + Storage) gọi thẳng từ trình duyệt. Từ Sprint 3, có thêm **1 Cloud Function duy nhất** (`openaiProxy`) làm proxy gọi OpenAI thật — xem mục "Cloud Function Proxy Layer" bên dưới; đây KHÔNG phải một backend ứng dụng tổng quát, chỉ là 1 hàm proxy hẹp phạm vi.

```
Trình duyệt (khách + admin)
   ├─ Site khách (index/category/blog/videos.html) — đọc dữ liệu công khai
   └─ CMS Admin (/admin/*.html) — Firebase Auth, đọc + ghi dữ liệu
          │                                    │
          ▼                                    ▼ (chỉ khi gọi OpenAI)
   Firebase (Realtime Database +      Cloud Function (openaiProxy)
             Authentication + Storage)         │
                                                ▼
                                          OpenAI API
```

Không có máy chủ ứng dụng tổng quát — mọi logic CMS/AI Assistant (Plugin, Queue, Permission, Draft...) vẫn chạy phía client, bảo vệ bằng Firebase Auth + Database Rules. Cloud Function duy nhất chỉ tồn tại để giữ bí mật API Key OpenAI ngoài tầm với của trình duyệt — không chứa Business Logic của platform.

## Các lớp trong hệ thống

1. **Site khách** — `index.html`, `category.html`, `blog.html`, `blog-post.html`, `videos.html`. Render từ dữ liệu Firebase qua `js/db.js`/`js/cms-db.js`, có fallback seed (`js/*-seed.js`) để không "trắng trang" khi Firebase chậm/lỗi.
2. **CMS Admin** (`admin/*.html`) — 13 trang quản lý (Dashboard, Product/Category/Banner/Slider/Blog/Video/Menu/Footer/SEO/Settings/Users Manager), bảo vệ bằng `js/admin-auth.js` (Firebase Auth guard, 2 vai trò Admin/Editor).
3. **AI Assistant** (`admin/ai/*.html`, `js/ai/*`) — module con của CMS Admin, kiến trúc Plugin-Based Workflow (xem `AI_RULES.md`). Không phải 1 lớp độc lập — dùng chung Firebase, chung Auth, chung data layer với 2 lớp trên.

## Data layer (không đổi khi mở rộng tính năng)

- `js/db.js` — `DB` (sản phẩm), `SiteContentDB` (hero slider/category tiles/menu/footer/settings/dịch vụ).
- `js/cms-db.js` — `CategoryDB`, `BannerDB`, `BlogDB`, `VideoDB`, `SeoDB`, factory `makeListDB()` dùng chung cho mọi node dạng danh sách.
- `js/ai/ai-db.js` — `DraftDB`, `JobDB`, `LogDB` (tái dùng `makeListDB()`), `ProviderConfigDB`.
- `js/ai/plugin-db.js` — `PluginDB` (node `aiPlugins`, key = moduleId — không dùng `makeListDB()` vì cần key tùy chỉnh).
- `js/ai/data-provider.js` — `DataProvider` (`IDataProvider`): cổng đọc CMS DUY NHẤT cho AI Plugin (`getProduct/getProducts/getCategories/getBrands/getMedia/getBlogPost/getBlogPosts/getSEO/getSettings`) — bọc quanh `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB` ở trên, không thêm node Firebase mới. Xem mục "Data Provider Layer" bên dưới.

Mọi tính năng mới (kể cả AI) đều phải tái sử dụng các hàm data layer đã có (`DB.get/update`, `BlogDB.add/update`, `SiteContentDB.get/save`...) thay vì viết logic ghi Firebase mới — nguyên tắc xuyên suốt từ CMS ban đầu tới AI Assistant.

## Vị trí AI Assistant trong tổng thể

AI Assistant KHÔNG phải chatbot, KHÔNG có quyền ghi trực tiếp vào dữ liệu gốc. Nó là 1 tập Plugin chạy qua Job Queue phía trình duyệt Admin, đọc CMS thật, sinh **Draft**, chờ Admin duyệt mới ghi vào dữ liệu thật (qua đúng hàm data layer ở trên). Chi tiết đầy đủ: xem `AI_RULES.md`.

## Data Provider Layer (Sprint 2, Requirement #3)

AI Plugin **không bao giờ** gọi thẳng `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB`. Mọi truy vấn CMS của plugin đi qua đúng 1 cổng trung gian:

```
AI Plugin → DataProvider (IDataProvider) → CMS Database (Firebase) → Context → AI Provider → Draft
```

`DataProvider` (`js/ai/data-provider.js`) chỉ có hàm đọc (`get*`), không có hàm ghi — đúng nguyên tắc "AI không được tự sửa dữ liệu gốc". Đổi nguồn dữ liệu trong tương lai (nếu có) chỉ cần viết lại nội dung file này theo đúng interface `IDataProvider`, không phải sửa từng plugin trong `js/ai/modules/*.js`.

`getBrands()` và `getMedia(productId)` hiện suy ra từ dữ liệu Product có sẵn (field `brand`, `images`) vì CMS chưa có module Brand/Media Library riêng — xem `AI_RULES.md`/`ROADMAP.md`.

## Plugin Manager Layer (Sprint 2, Requirement #4)

`js/ai/plugin-manager.js` (`PluginManager`) là điểm gọi Plugin AI **duy nhất** — UI (`js/admin-ai.js`, `js/admin-ai-plugins.js`) không được gọi thẳng `AIModuleRegistry`/`PluginDB`/`AIJobQueue` để load/enable/disable/chạy/hủy 1 plugin.

```
UI (Dashboard/Plugin Manager) → PluginManager → { AIModuleRegistry (metadata) + PluginDB (trạng thái) + AIJobQueue (thực thi) }
```

`PluginManager.loadPlugin(id)`/`loadPlugins()` trả về đối tượng theo interface **`IAIPlugin`** (không có phương thức nào khác ngoài 4 thứ này):
- `metadata` — `{ id, name, description, version, provider, enabled, status }`
- `validate(inputParams)` — kiểm tra field bắt buộc theo `inputFields` của module
- `execute(items, userId, userEmail)` — **chỉ gửi job vào `AIJobQueue`**, không tự chạy AI; `AIJobQueue` chịu trách nhiệm thực thi tuần tự (đúng Queue hiện có, không xây thêm)
- `cancel(jobId)` — ủy quyền cho `AIJobQueue.cancel()`

`PluginManager` **không chứa** Business Logic, Prompt, hay AI Provider — những thứ đó nằm trong `js/ai/modules/*.js` (Plugin tự implement) và `js/ai/provider-registry.js`. Đổi provider (OpenAI/Claude/Gemini/DeepSeek) không bao giờ cần sửa `plugin-manager.js`. Log vẫn ghi qua `LogDB`/`aiLogs` có sẵn (bên trong `AIJobQueue`), không xây cơ chế log mới ở tầng Plugin Manager.

## Provider Manager Layer (Sprint 2, Requirement #5)

`js/ai/provider-registry.js` (`AIProviderRegistry`) là **Provider Manager** — nơi DUY NHẤT chịu trách nhiệm Đăng ký Provider (`register()`), Chọn Provider, và Trả về Provider đang hoạt động (`getActive()` cho toàn cục, `resolveForPlugin(moduleId)` cho override riêng từng plugin gán qua Plugin Manager). AI Plugin không tự chọn Provider và không biết Provider nào đang chạy — chỉ `AIJobQueue` mới được hỏi qua registry này.

Mỗi Provider (`js/ai/providers/{openai,claude,gemini,deepseek}.js`) implement đúng interface **`IAIProvider`** (chỉ 3 phương thức, không thêm gì khác):
- `generate({ moduleId, prompt, params, config })` — gọi AI thật. **OpenAI (Sprint 3, Requirement #1): đã tích hợp thật**, gọi qua Cloud Function Proxy (xem mục "Cloud Function Proxy Layer" bên dưới) thay vì gọi thẳng OpenAI. Claude/Gemini/DeepSeek: vẫn là stub, luôn reject vì chưa tích hợp API.
- `validate(config)` — trả `{ valid, reason }`, kiểm tra provider đã đủ điều kiện dùng chưa TRƯỚC khi gọi `generate()`. OpenAI: kiểm tra `enabled` + đã đăng nhập CMS (cần ID token để gọi Cloud Function).
- `health()` — trả `Promise<{ healthy, message }>`, kiểm tra tình trạng kết nối provider. OpenAI: gọi Cloud Function Proxy (`action:'health'`) để kiểm tra thật; Claude/Gemini/DeepSeek: vẫn luôn `healthy:false` vì chưa tích hợp API thật.

Đổi Provider (OpenAI ↔ Claude ↔ Gemini ↔ DeepSeek) chỉ đổi cấu hình trong `admin/ai/providers.html`/`admin/ai/plugins.html` — **không đổi** UI, Workflow, Plugin (`js/ai/modules/*.js`), hay Queue (`js/ai/job-queue.js`). `AIJobQueue` gọi `AIProviderRegistry.resolveForPlugin()` rồi `provider.validate()` trước `provider.generate()`, log vẫn qua `LogDB`/`aiLogs` có sẵn — không xây Logging mới. Plugin và Queue không bao giờ biết OpenAI gọi qua Cloud Function trong khi 3 provider kia còn là stub — chi tiết đó nằm hoàn toàn trong `js/ai/providers/openai.js`, đúng nguyên tắc Provider Manager che giấu provider cụ thể.

## Cloud Function Proxy Layer (Sprint 3, Requirement #1)

Phát hiện khi triển khai Requirement #1 theo đúng nghĩa đen (nhập API Key OpenAI vào form CMS, lưu qua `ProviderConfigDB`/node `aiProviderConfig`): node này đọc được bởi **bất kỳ tài khoản nào có entry trong `roles`** (mọi Editor/Admin, không chỉ Admin) — lưu 1 secret có thể phát sinh chi phí thật (OpenAI tính phí theo usage) vào đó là lỗ hổng rò rỉ thật, không phải rủi ro lý thuyết. Chi tiết đầy đủ: xem `ARCHITECTURE_REVIEW_SPRINT3.md` (phân loại A — bắt buộc sửa ngay, đã xử lý trong sprint này).

Quyết định kiến trúc (Chief Architect): thêm đúng **1 Cloud Function** (`functions/index.js`, export `exports.openaiProxy`, Firebase Cloud Functions 2nd gen/Node 20) làm điểm trung gian DUY NHẤT giữa Browser và OpenAI thật:

```
Browser (CMS, đã đăng nhập Firebase Auth)
   → gửi ID token + { action: 'generate'|'health', prompt, model }
   → Cloud Function (openaiProxy)
         - verifyIdToken() + kiểm tra roles/{uid} (chặn user không có role)
         - gọi OpenAI API thật (API Key đọc từ Secret Manager qua defineSecret('OPENAI_API_KEY'))
         - KHÔNG chứa Business Logic (không biết Plugin/Queue/Draft là gì)
   → trả { text, raw } hoặc { error } về browser
```

Nguyên tắc bắt buộc (đã tuân thủ đầy đủ):
- API Key OpenAI **chỉ tồn tại** trong Environment Variable/Secret Manager phía Cloud Function — không bao giờ trong Firebase Realtime Database, không bao giờ gửi xuống browser.
- Cloud Function chỉ làm 3 việc: Nhận request → Validate (xác thực Firebase ID token + role) → Gọi OpenAI → Trả kết quả. Không chứa logic Plugin/Queue/Permission/Draft — toàn bộ Business Logic đó vẫn nằm nguyên trong PSH Platform (client), không di chuyển sang Cloud Function.
- **Không đổi** `IAIProvider`, Plugin (`js/ai/modules/*.js`), Queue (`js/ai/job-queue.js`), Plugin Manager, Database Structure/Collection hiện có — chỉ đổi điểm kết nối bên trong `js/ai/providers/openai.js` (từ "gọi thẳng OpenAI" sang "gọi Cloud Function Proxy"). Workflow vẫn đúng: `User → Permission → Queue → AI Provider → Draft → Completed`.
- `admin/ai/providers.html` **không có ô nhập API Key** — chỉ có bật/tắt provider, chọn model, và nút "Kiểm tra kết nối" (gọi `provider.health()` có sẵn, không thêm phương thức mới).

Triển khai (`firebase deploy --only functions`) yêu cầu `firebase login` (OAuth tương tác) và `firebase functions:secrets:set OPENAI_API_KEY` — cả 2 thao tác này chỉ người phụ trách hạ tầng được thực hiện trực tiếp qua CLI, không qua chat/agent. Sau khi deploy lần đầu, cần thay đúng URL thật (Firebase CLI in ra) vào hằng số `OPENAI_PROXY_URL` trong `js/ai/providers/openai.js` (hiện là giá trị placeholder chờ deploy).

Mẫu này (`functions/index.js`) sẽ được tái sử dụng nguyên khuôn khi tích hợp thật Claude/Gemini/DeepSeek ở sprint sau — xem `ROADMAP.md`.

## Queue Layer (Sprint 2, Requirement #6)

`js/ai/job-queue.js` (`AIJobQueue`) là Queue **duy nhất** trong hệ thống — mọi AI Plugin thực thi qua đây, không có Queue thứ 2 nào khác. Luồng xử lý bắt buộc:

```
User → AI Plugin (PluginManager.execute) → Queue (AIJobQueue) → DataProvider → Context → AI Provider → Draft → Completed
```

- **UI chỉ được tạo Job** — `admin-ai.js` gọi `plugin.execute()` (PluginManager), không bao giờ gọi `AIProviderRegistry`/provider `.generate()` hay chạy Plugin logic trực tiếp.
- **PluginManager chỉ gửi Job vào Queue** — `execute()` chỉ gọi `AIJobQueue.enqueue()`, không tự chạy AI (đã có từ Requirement #4, xác nhận lại ở đây).
- **Queue chịu trách nhiệm**: Tạo Job (`enqueue`), Chạy Job (`runJob`/`processSequentially`), Retry Job (`retryFailed`), Resume Job (`resume`), Cập nhật Status (`JobDB.update` xuyên suốt), Trả kết quả (ghi `DraftDB`/`LogDB`).
- **Độc lập với UI/Plugin/Provider**: `job-queue.js` không import/tham chiếu bất kỳ file UI nào; `js/ai/modules/*.js` và `js/ai/providers/*.js` không tham chiếu ngược lại `AIJobQueue` — không có phụ thuộc vòng giữa các module.

**Mỗi Job có tối thiểu** các trường sau (tên field giữ nguyên từ Sprint 1 để không đổi Database Structure — xem bảng ánh xạ khái niệm trong `AI_RULES.md`): `id`, `moduleId` (= plugin), `provider` (mới thêm ở Requirement #6 — provider thực tế đã dùng), `createdBy`/`createdByEmail` (= user), `status`, `createdAt`, `startedAt`, `finishedAt` (= completedAt).

**Trạng thái Job**: `queued` (hiển thị "Pending"), `running`, `completed`, `failed` (mới — khi TẤT CẢ item trong job đều lỗi; trước đây luôn là `completed` bất kể item lỗi hay không), `cancelled` (đã có từ trước Requirement #6, giữ nguyên). "Retry" và "Resume" là 2 hành động Queue hỗ trợ (`retryFailed()`, `resume()`), không phải giá trị `status` riêng.

## Logging Layer (Sprint 2, Requirement #7)

`LogDB`/node `aiLogs` (đã có từ Sprint 1, `js/ai/ai-db.js`) là Logging System DUY NHẤT — không tạo Database/Collection mới. **Chỉ `AIJobQueue` (Queue) và `PermissionService` (Requirement #8 — xem mục "Permission & Safety Layer") được ghi Log** — `js/ai/modules/*.js` (Plugin), `js/ai/providers/*.js` (Provider), và `js/ai/plugin-manager.js` (Plugin Manager) không bao giờ gọi `LogDB` trực tiếp; UI (`js/admin-ai.js`) chỉ đọc (`LogDB.getAll()`), không bao giờ tạo/sửa/xóa Log.

Queue ghi 1 dòng Log cho mỗi lượt xử lý item (thành công/thất bại) và mỗi lần hủy Job — không bỏ qua Job nào. Mỗi Log có tối thiểu (không thêm field nào ngoài phạm vi Sprint): `userId`/`userEmail` (User), `moduleId` (Plugin), `provider` (Provider), `timestamp` (Time), `durationMs` (Duration), `status` (Status), `errorMessage` (Error).

**Trạng thái Log**: `completed`, `failed`, `cancelled` — cả 3 đều được Queue ghi chủ động (đổi từ `success`/`failure` cũ ở Sprint 1 sang đúng thuật ngữ Requirement #7, cộng thêm Log khi hủy job); `permission_denied` — ghi bởi `PermissionService`, thêm ở Requirement #8. `pending`/`running` là 2 trạng thái TẠM THỜI của Job/Item — đã hiển thị real-time qua Job Queue Monitor (`admin/ai/jobs.html`), không ghi thêm dòng Log riêng cho 2 trạng thái này để tránh chồng chéo/mở rộng Logging System ngoài phạm vi Sprint.

Log phục vụ theo dõi tiến trình/debug/audit/kiểm tra lỗi qua `admin/ai/logs.html` — chưa xây Dashboard phân tích Log ở sprint này.

## Permission & Safety Layer (Sprint 2, Requirement #8)

`js/ai/permission-service.js` (`PermissionService`) là lớp RBAC (Role-Based Access Control) DUY NHẤT cho AI Assistant — AI Plugin không hard-code quyền, chỉ được kiểm tra qua đây. Đọc vai trò từ đúng node `roles` đã có (cùng node `js/admin-auth.js` dùng cho CMS) — không tạo Database/node mới.

Luồng bắt buộc: **User → Permission → Queue → AI Provider → Draft**. Kiểm tra quyền diễn ra ở lớp UI (`js/admin-ai.js`, hàm `runModule()`) **TRƯỚC khi** gọi `PluginManager.loadPlugin(id).execute()` — cố tình đặt ở đây thay vì sửa `job-queue.js`/`plugin-manager.js`, đúng yêu cầu giữ nguyên 2 module đó trong Requirement #8. Nếu bị từ chối quyền: không gọi `execute()` → không tạo Job → không vào Queue → không gọi AI Provider → không tạo Draft — chỉ ghi 1 dòng Log `permission_denied` (qua `LogDB` có sẵn).

Quyền hỗ trợ (`AI_PERMISSIONS`): `ai.generate.product`, `ai.generate.slider`, `ai.generate.seo` (ứng với 3 plugin đang Enable), `ai.manage.providers`, `ai.manage.plugins`. Vai trò `admin` có toàn bộ quyền; vai trò `editor` chỉ có 3 quyền `ai.generate.*` — không có `ai.manage.providers`/`ai.manage.plugins`, đúng yêu cầu "chỉ Admin mới được đổi AI Provider và Plugin Settings". Đã bổ sung `requiredRole:'admin'` còn thiếu ở `admin/ai/plugins.html` (đã có sẵn ở `admin/ai/providers.html` từ trước) để khớp đúng quy tắc này ở cấp trang.

⚠️ **Giới hạn đã biết**: kiểm tra quyền hiện chỉ áp dụng tại điểm gọi duy nhất hiện có (`admin-ai.js` → `PluginManager.execute()`). Nếu sau này có thêm nơi khác gọi thẳng `PluginManager.execute()`, nơi đó cũng phải tự gọi `PermissionService.checkPluginExecution()` trước — không có tầng chặn tự động bên trong `plugin-manager.js`/`job-queue.js` (cố tình, theo đúng yêu cầu không sửa 2 module này ở Requirement #8).

## Product AI Plugin — Framework → Production (Sprint 3, Requirement #2)

`js/ai/modules/product-description-writer.js` (Product Description Generator) là plugin ĐẦU TIÊN được xác nhận chạy Production với OpenAI thật — không tạo plugin mới, không đổi `IAIPlugin`/`IAIProvider`, không đổi Prompt template đã có từ Sprint 2 (Requirement #3). Toàn bộ yêu cầu Requirement #2 đã được thỏa mãn bởi hạ tầng có sẵn, không cần thêm dòng code nào:

```
User → Permission (PermissionService) → Queue (AIJobQueue) → Product AI Plugin
  → DataProvider (dữ liệu Product thật) → OpenAI Provider (Cloud Function Proxy)
  → Draft (DraftDB) → Completed
```

- **Dữ liệu thật, không hardcode**: `loadContext()` gọi `DataProvider.getProduct(productId)`; `buildPrompt()` chỉ dùng field thật của sản phẩm (`name`, `brand`, `specs`, `categoryLabel`) — không có "Model" riêng trong Product schema hiện tại (đang gộp trong `specs`), xem `ROADMAP.md`.
- **Provider ẩn danh với Plugin**: Queue tự chọn provider qua `AIProviderRegistry.resolveForPlugin('product-description-writer')` (Requirement #5) — Admin gán "OpenAI" cho plugin này qua dropdown có sẵn ở `admin/ai/plugins.html`; plugin không hề biết provider cụ thể.
- **Draft-only, Human Review giữ nguyên**: `mapToDraftContent()` → `DraftDB.add({status:'draft', ...})`; `admin/ai/drafts.html` yêu cầu bấm "Duyệt & Publish" mới ghi vào Product thật — không publish tự động, không đổi gì ở tầng này.
- **Retry/Failed/Log khi OpenAI lỗi**: dùng nguyên cơ chế `job-queue.js` đã có (Requirement #6/#7) — item lỗi được đánh dấu `failed`, ghi `LogDB` kèm `errorMessage`, Job không mất (vẫn trong `JobDB`, `retryFailed()`/`resume()` xử lý lại đúng phần lỗi).
- **Không đổi**: Database Structure/Collection, Queue, Provider Manager, Plugin Architecture — Requirement #2 chỉ là "kích hoạt sang Production" (chọn OpenAI làm provider cho plugin đã có), không phải tính năng mới.
- Việc còn phụ thuộc bên ngoài: xác nhận "OpenAI Generate thành công" với response thật cần Cloud Function `openaiProxy` đã deploy (xem mục "Cloud Function Proxy Layer") — vẫn đang chờ `firebase login`/`firebase deploy` do người phụ trách hạ tầng tự thực hiện.

## SEO AI Plugin — Framework → Production (Sprint 3, Requirement #3)

`js/ai/modules/seo-generator.js` (SEO Generator) là plugin THỨ HAI được xác nhận chạy Production với OpenAI thật, theo đúng khuôn mẫu Requirement #2 — không tạo plugin mới, không đổi `IAIPlugin`/`IAIProvider`, không đổi Prompt template đã có từ Sprint 2 (Requirement #3 gốc):

```
User → Permission (PermissionService) → Queue (AIJobQueue) → SEO AI Plugin
  → DataProvider (dữ liệu Blog Post thật) → OpenAI Provider (Cloud Function Proxy)
  → Draft (DraftDB) → Completed
```

- **Dữ liệu thật, không hardcode**: `loadContext()` gọi `DataProvider.getBlogPost(postId)`; `buildPrompt()` dùng `title`/`excerpt` thật của bài viết.
- **Trường SEO tạo ra**: `seoTitle`, `seoDescription`, `keywords` (mảng), `ogTitle`, `ogDescription`, `ogImage`, `schemaSuggestion` — publish gộp thêm các field này vào bản ghi `blogPosts` (không phá field cũ).
- **Provider ẩn danh với Plugin**: giống Product AI Plugin — Queue chọn qua `AIProviderRegistry.resolveForPlugin('seo-generator')`, Admin gán "OpenAI" qua `admin/ai/plugins.html`.
- **Draft-only, Human Review giữ nguyên**: publish thật (`BlogDB.update`) chỉ chạy khi bấm "DUYỆT & PUBLISH" ở `admin/ai/drafts.html`.
- **Retry/Failed/Log khi OpenAI lỗi**: dùng nguyên `job-queue.js` (Requirement #6/#7), không mất Job.
- **Không đổi**: Database, Queue, Provider, Workflow, Plugin Architecture, Permission (`ai.generate.seo` có sẵn từ Requirement #8).
- **Lưu ý kiến trúc quan trọng**: SEO AI Plugin nhắm vào **Blog Post**, KHÔNG nhắm **Product** — Product chưa có trang chi tiết riêng để gắn Meta/OG/Schema (giới hạn đã biết từ Sprint 1/2, xem mục "Giới hạn kiến trúc đã biết" bên dưới và `ROADMAP.md`). Không tự mở rộng plugin sang Product ở Requirement #3.
- Việc còn phụ thuộc bên ngoài: xác nhận "Generate thành công" với response thật vẫn chờ Cloud Function `openaiProxy` deploy (giống Requirement #2).

## Slider AI Plugin — Framework → Production (Sprint 3, Requirement #4)

`js/ai/modules/slider-generator.js` (Slider Generator) là plugin THỨ BA được xác nhận chạy Production với OpenAI thật, theo đúng khuôn mẫu Requirement #2/#3 — không tạo plugin mới, không đổi `IAIPlugin`/`IAIProvider`, không đổi Prompt template đã có từ Sprint 2:

```
User → Permission (PermissionService) → Queue (AIJobQueue) → Slider AI Plugin
  → DataProvider (dữ liệu Product + Media thật) → OpenAI Provider (Cloud Function Proxy)
  → Draft (DraftDB) → Completed
```

- **Dữ liệu thật, không hardcode**: `loadContext()` gọi `DataProvider.getProduct(productId)` + `DataProvider.getMedia(productId)`; `buildPrompt()` dùng `name`/`brand`/`specs` thật làm chủ đề slide.
- **Trường Slider tạo ra**: `title` (Headline, AI sinh), `subtitle` (Subheadline/Banner Description, AI sinh), `link` (CTA URL — suy từ `product.category`, thật, hệ thống có đọc qua `heroCta.dataset.link` ở `js/home.js`), `image` (ảnh có sẵn của sản phẩm), `imagePrompt` (gợi ý prompt tạo ảnh, không tự sinh ảnh).
- **Ghi nhận (không sửa)**: `ctaText` trong Draft content KHÔNG do AI sinh — chỉ copy nguyên lựa chọn dropdown `ctaStyle` của Admin, và KHÔNG được `js/home.js` đọc/hiển thị (nút CTA dùng text cố định trong HTML). Hiện trạng có từ Sprint 2, không sửa ở Requirement #4 vì sẽ là Refactor ngoài phạm vi — xem `ROADMAP.md`.
- **Provider ẩn danh với Plugin**: Queue chọn qua `AIProviderRegistry.resolveForPlugin('slider-generator')`, giống 2 plugin trước.
- **Draft-only, Human Review giữ nguyên**: `targetCollection:'siteContent.heroSlides'` — publish thật (nối slide vào `SiteContentDB`) chỉ chạy khi bấm "DUYỆT & PUBLISH" ở `admin/ai/drafts.html`.
- **Retry/Failed/Log khi OpenAI lỗi**: dùng nguyên `job-queue.js` (Requirement #6/#7), không mất Job.
- **Không đổi**: Database, Queue, Provider, Workflow, Plugin Architecture, Permission (`ai.generate.slider` có sẵn từ Requirement #8).
- Việc còn phụ thuộc bên ngoài: xác nhận "Generate thành công" với response thật vẫn chờ Cloud Function `openaiProxy` deploy (giống Requirement #2/#3).

## End-to-End Integration Test + Regression Test (Sprint 3, Requirement #5 — cuối Sprint 3)

Xác nhận toàn bộ AI Framework hoạt động đúng từ đầu đến cuối trước khi coi Sprint 3 hoàn tất. Báo cáo đầy đủ (Requirement Checklist, Bug Summary, Architecture/Security Verification, Integration Test Result, Production Readiness): xem `docs/SPRINT_3_PROGRESS.md`.

- **Cách kiểm tra**: do Cloud Function `openaiProxy` chưa deploy (chưa thể gọi OpenAI thật), đã chạy mô phỏng thực thi MÃ NGUỒN SẢN XUẤT THẬT (Node `vm`, không viết lại logic) cho `job-queue.js`, `permission-service.js`, `providers/openai.js`, và 3 plugin Production — mock Firebase/Cloud Function/OpenAI có kiểm soát.
- **Kết quả**: Permission (chặn đúng, ghi Log `permission_denied`, không tạo Job) / Queue (Pending→Running→Completed/Failed, Retry, Cancel đều đúng, không mất Job) / Provider (`validate/health/generate` xử lý đúng cả thành công/lỗi/lỗi mạng, không lộ OpenAI key) / 3 Plugin (đọc dữ liệu thật, không hardcode) / Draft (chỉ tạo cho item thành công) / Logging (đủ 4 trạng thái `completed/failed/cancelled/permission_denied`) — tất cả đúng thiết kế.
- **Bug tìm thấy và đã sửa** (chỉ sửa text/comment, không đổi logic): `js/admin-ai.js` và `admin/ai/index.html` có thông báo lỗi thời khẳng định "chưa có provider thật" (sai từ Requirement #1); comment trong `js/ai/provider-interface.js` mô tả stub cũng đã lỗi thời cho OpenAI.
- **Regression Test**: `git log` xác nhận `job-queue.js`/`plugin-manager.js`/`data-provider.js`/`provider-registry.js`/`permission-service.js` không bị sửa code kể từ Sprint 2 Requirement #8 — không Requirement nào của Sprint 2 bị phá.
- **Chưa kiểm tra được** (phụ thuộc triển khai, không phải lỗi code): Generate/Test Connection thật với response OpenAI thật qua Cloud Function đã deploy.

## Xác nhận sẵn sàng Pilot Production (Sprint 3, Requirement #6 — SPRINT 3 COMPLETED)

Requirement cuối cùng của Sprint 3 — tái xác nhận toàn bộ AI Framework trước khi đóng Sprint. Báo cáo tổng kết đầy đủ (Requirement Summary, Architecture/Security/Production Verification, Known Limitations, Future Roadmap): xem `docs/SPRINT_3_FINAL_REPORT.md`.

- **Architecture Verification (4 điều kiện bất biến)**: (1) `AI_RULES.md` (Constitution) không bị sửa trong suốt Sprint 3 (`git log`); (2) `IAIPlugin`/`IAIProvider`/Workflow không đổi shape; (3) `job-queue.js`/`plugin-manager.js`/`data-provider.js`/`provider-registry.js`/`permission-service.js` (Plugin/Queue/Provider/Permission) không bị sửa code kể từ Sprint 2 Requirement #8, vẫn độc lập, không phụ thuộc vòng; (4) mọi mục kiến trúc Sprint 2 trong file này chỉ được BỔ SUNG, không mục nào bị đổi mô tả.
- **CMS Console check**: cả 6 trang `admin/ai/{index,drafts,jobs,logs,plugins,providers}.html` load 0 lỗi console qua static server nội bộ.
- **Production Deployment check**: `firebase functions:list` xác nhận Cloud Function `openaiProxy` **vẫn CHƯA deploy** — không đổi so với Requirement #1, đây là điều kiện DUY NHẤT còn chặn Pilot Production thật (ngoài phạm vi code, cần người phụ trách hạ tầng tự thực hiện).
- **Security Verification**: xác nhận lại Permission/RBAC/Queue/Draft/API Key đều đúng; riêng Firebase Database Rules KHÔNG version-control trong repo nên không thể xác minh trực tiếp từ môi trường này (ghi Known Limitations).
- **Kết luận**: Code 100% sẵn sàng Pilot Production. Kích hoạt Pilot Production thật (traffic thật, response OpenAI thật) chờ deploy Cloud Function.

## AI Assistant — Experience Layer + AI Task Router (Sprint 4, Requirement #1–#6 — SPRINT 4 COMPLETED)

Sprint 4 thêm 1 lớp MỚI nằm **bên trên** toàn bộ kiến trúc Sprint 2/3 — không sửa `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`permission-service.js`/`data-provider.js`/`AI_RULES.md`. Về vai trò kiến trúc, lớp này tương đương `js/admin-ai.js` (1 caller mới của `PluginManager`), chỉ khác ở chỗ người dùng gõ yêu cầu tự do thay vì chọn Plugin từ danh sách:

```
User → AI Assistant (admin/ai/assistant.html, js/admin-ai-assistant.js)
     → AI Task Router (js/ai/task-router.js)
     → PermissionService → PluginManager.execute() → Queue → AI Provider
     → Draft → Human Review → Completed
```

- **AI Assistant** (`admin/ai/assistant.html` + `js/admin-ai-assistant.js`) — Entry Point DUY NHẤT theo yêu cầu Requirement #1: 1 ô nhập yêu cầu tự do, không có danh sách Plugin để chọn. Tự tải `candidates` (`{products, posts}`) qua đúng `DB.getAll()`/`BlogDB.getAll()` có sẵn — giống hệt cách `js/admin-ai.js` đã tải cho `productSelect`/`blogSelect`, không phải cơ chế đọc dữ liệu mới. Không bao giờ hiển thị tên/id Plugin kỹ thuật cho người dùng — chỉ hiển thị `outcomeLabel` ("Mô tả sản phẩm", "Gói SEO cho bài viết", "Nội dung slide quảng cáo").
- **AI Task Router** (`js/ai/task-router.js`, `AITaskRouter`) — lớp DUY NHẤT "hiểu yêu cầu + chọn Plugin phù hợp". **Là logic rule-based** (khớp từ khóa cố định + khớp tên thực thể theo substring), **KHÔNG phải mô hình AI/ML thật** — vì Requirement #1 (Sprint 4) cấm rõ Router "gọi OpenAI trực tiếp"/"thêm AI Provider mới"/Multi-Agent, nên không có cách nào dùng AI thật để phân loại ý định mà vẫn đúng ràng buộc này. Ghi rõ ở đây để tránh hiểu lầm tên gọi "AI Task Router".
  - `route(text, candidates)` — hàm THUẦN, không side-effect, không đọc Firebase, không gọi OpenAI. Trả về `{pluginId, outcomeLabel, confidence, targetId, targetLabel, ambiguous, inputParams, reason}`.
  - `dispatch(routeResult, userId, userEmail)` — CHỈ được gọi theo đúng thứ tự `PermissionService.checkPluginExecution()` → `PluginManager.loadPlugin(id).execute()` (đã xác nhận qua mô phỏng: không gọi Queue/Provider/Firebase/OpenAI trực tiếp ở bất kỳ nhánh nào).
  - **Confidence Score** (0–100) = 50% điểm khớp Plugin (tối đa khi ≥2 từ khóa khớp) + 50% điểm khớp đối tượng (100 = khớp đúng 1 mục, 50 = khớp nhiều mục/ambiguous, 0 = không khớp). Ngưỡng tự thực thi **≥95%**; dưới ngưỡng → AI Assistant hiển thị xác nhận "Tôi hiểu yêu cầu như sau..." (Safety Checkpoint, Requirement #5) trước khi gọi `dispatch()`.
  - **Không tạo Job** khi: không xác định được Plugin, không xác định được đối tượng (kể cả trường hợp khớp nhiều — ambiguous), hoặc Permission bị từ chối — cả 3 trường hợp `dispatch()` dừng lại TRƯỚC khi gọi `PluginManager`.
- **Quyết định kiến trúc quan trọng — ranh giới Logging**: `AI_RULES.md` mục 7 (Constitution) quy định CHỈ `AIJobQueue` và `PermissionService` (khi từ chối quyền) được ghi vào `LogDB`/`aiLogs`. Trường hợp `permission_denied` tự động có Log nhờ `PermissionService` sẵn có (không cần code mới). Nhưng khi Router không xác định được Plugin/đối tượng, sự việc xảy ra TRƯỚC khi có Plugin nào được xác định — Router **không** tự ghi Log ở đây, vì (1) sẽ vi phạm Constitution "chỉ Queue/PermissionService ghi Log", và (2) sẽ vi phạm Requirement #3 (Router chỉ được gọi `PermissionService`/`PluginManager.execute()`, không liệt kê `LogDB`). Các trường hợp này chỉ hiển thị thông báo ở UI, không ghi vào `aiLogs`. Ý tưởng "mở rộng Constitution cho Router ghi Log" đã đưa vào `ROADMAP.md`, không tự ý quyết định ở Requirement này.
- **Điều hướng**: thêm 1 mục MỚI trong `ADMIN_NAV` (`js/admin-auth.js`): `{key:'ai-assistant', label:'Trợ lý AI', href:'/admin/ai/assistant.html'}` — thêm thêm, không đổi/xóa mục "AI Assistant" cũ (`admin/ai/index.html`, Plugin Dashboard) — trang cũ vẫn dùng được nguyên vẹn làm nơi chọn Plugin thủ công (fallback khi AI Assistant không hiểu yêu cầu).
- **Không đổi**: `IAIPlugin`/`IAIProvider`, Queue, Plugin Manager, Provider Manager, Permission Service, Data Provider, Draft Workflow, Human Review, Database Structure/Collection. 3 Plugin Production (Product/SEO/Slider) không có dòng code nào bị sửa.

### Theo dõi tiến trình + Draft Preview tại chỗ (Requirement #2)

AI Assistant hoàn thiện thành 1 Experience Layer trọn vẹn — không chỉ gửi yêu cầu mà còn theo dõi kết quả và xử lý Human Review ngay tại `admin/ai/assistant.html`:

```
... → PluginManager.execute() → Queue (enqueue)
    → AI Assistant gọi AIJobQueue.resume() (API công khai có sẵn, không bypass Queue)
    → AI Assistant theo dõi đúng 1 Job (JobDB.get(jobId), không polling toàn bộ JobDB)
    → Completed: đọc job.items[0].resultDraftId → DraftDB.get() → Preview
    → Duyệt & Publish / Từ chối (AdminAI.publishDraftById()/rejectDraftById())
```

- **Khoảng trống phát hiện + sửa**: sau `dispatch()` (Requirement #1), Job chỉ được `enqueue()` — không có gì gọi `AIJobQueue.resume()` nên Job không bao giờ thực sự chạy cho tới khi ai mở `admin/ai/jobs.html`. `js/admin-ai-assistant.js` nay tự gọi `AIJobQueue.resume(userId, userEmail)` sau khi `dispatch()` thành công — dùng đúng API công khai của Queue, giống hệt cách `js/admin-ai.js` `runModule()` đã làm cho Dashboard cũ, không phải cơ chế mới.
- **`publishDraftById(id)`/`rejectDraftById(id)`** (mới thêm vào `js/admin-ai.js`) — tái sử dụng đúng hàm `publishToTarget()` private đã có (không sao chép Publish Logic), không phụ thuộc mảng `drafts` cục bộ của trang Duyệt nội dung. Xem Decision Record trong `CHANGELOG.md` mục Sprint 4 Requirement #2 về lý do chọn cách này thay vì gọi lại `publishDraft(id)`/`rejectDraft(id)` cũ trực tiếp.
- **Theo dõi tiến trình**: chỉ đọc đúng 1 Job (`JobDB.get(jobId)`, ngắt khi kết thúc, giới hạn ~60s) — không tăng tải Firebase so với việc mở `admin/ai/jobs.html` (NFR Performance của Requirement #2).
- **Failed hiển thị đúng nguyên nhân**: đọc `job.items[0].error` (message thật từ Provider/Cloud Function Proxy khi lỗi) — không hiển thị "Unknown Error" chung chung.
- `admin/ai/jobs.html`/`admin/ai/drafts.html` không đổi, vẫn hoạt động độc lập.

### Ambiguous Target Resolution (Requirement #3)

Khi `AITaskRouter.route()` trả `reason:'target_ambiguous'` (yêu cầu khớp nhiều đối tượng, vd "Loa JBL" khớp cả "Loa JBL" và "Loa JBL PartyBox 310"), AI Assistant cho người dùng chọn đúng đối tượng thay vì bắt gõ lại yêu cầu:

```
route() trả target_ambiguous + danh sách {id,label}
    → AI Assistant đối chiếu lại với candidates ĐÃ tải sẵn (làm giàu: Danh mục, Ngày tạo — không gọi thêm Firebase)
    → Hiển thị bảng cho người dùng chọn
    → Chọn: dựng lại 1 routeResult đã giải quyết bằng AITaskRouter.ROUTES[].buildInputParams(chosenId) (đọc dữ liệu Router đã công khai, không viết Business Logic mới)
    → dispatchAndShow() (Requirement #2) — tiếp tục ĐÚNG Workflow (Permission → Plugin Manager → Queue → Provider → Draft → Human Review)
    → Hủy: chỉ hiển thị thông báo, KHÔNG gọi dispatch() — không tạo Job, không ghi Draft
```

- **Không sửa `js/ai/task-router.js`** — chỉ tiêu thụ nhiều hơn dữ liệu nó đã công khai sẵn (`ROUTES`, `routeResult.ambiguous`). Về mặt lý thuyết có thể mở rộng API của Router để tự trả routeResult đã giải quyết, nhưng phương án đó bị loại ngay vì vi phạm trực tiếp ràng buộc "không sửa AI Task Router" của Requirement #3 — không phải 1 lựa chọn kiến trúc cần cân nhắc thêm.
- Dữ liệu hiển thị (Tên/Danh mục/ID/Ngày tạo) lấy từ `candidates` đã tải ở bước đầu (`DB.getAll()`/`BlogDB.getAll()`), không phát sinh lời gọi Firebase mới khi hiển thị danh sách chọn.
- Không tạo đường xử lý mới ngoài Workflow hiện tại — sau khi chọn, luồng tiếp tục qua đúng `dispatchAndShow()` đã có từ Requirement #2 (Permission → Plugin Manager → Queue → Provider → Draft → Human Review), không có nhánh gọi Plugin/Queue nào khác.

### AI Conversation History (Requirement #4)

AI Assistant cho xem lại các phiên làm việc trước đây, giúp trở thành trung tâm làm việc thay vì chỉ là nơi nhập Prompt — **không tạo Database/Collection/field mới**, tổng hợp hoàn toàn từ dữ liệu đã có:

```
"Phiên làm việc" = 1 bản ghi trong aiJobs (JobDB.getAll())
    → làm giàu bằng AITaskRouter.ROUTES (outcomeLabel, đã công khai, không sửa Router)
      + DB.getAll()/BlogDB.getAll() (tên Product/Blog Post that, đã tải sẵn)
    → hiển thị danh sách + tìm kiếm/lọc (Request/Plugin/Thời gian) — lọc trên dữ liệu đã tải, không gọi thêm Firebase
    → Mở 1 phiên: CHỈ ĐỌC (JobDB đã tải + DraftDB.get()) — KHÔNG gọi AIJobQueue.resume()/AITaskRouter.dispatch()
    → Draft còn 'draft': tái sử dụng renderDraftPreview() (Requirement #2) cho Preview + Duyệt/Từ chối
    → Draft 'published'/'rejected': chỉ hiển thị trạng thái + nội dung đã lưu
```

- **Database Policy đã tuân thủ**: không có Decision Record "Database mới" vì chứng minh được dữ liệu hiện có (`aiJobs`/`aiDrafts`/`products`/`blogPosts`) đã đủ — không phát sinh Database/Collection/field mới nào.
- **Giới hạn có chủ đích (không phải bug)**: "User Request" hiển thị là **mô tả suy ra** (`outcomeLabel` + tên đối tượng, vd `Mô tả sản phẩm — "Loa JBL PartyBox 310"`), KHÔNG phải nguyên văn câu người dùng gõ — vì hệ thống hiện tại không lưu chuỗi tự do đó ở bất kỳ đâu (`aiJobs.items[].inputParams` chỉ lưu dữ liệu đã được `AITaskRouter` phân giải, vd `{productId, tone}`). Đây là lựa chọn có chủ đích để tránh thêm field mới vào `aiJobs`, đúng ưu tiên cao nhất của Database Policy — nếu sau này cần lưu nguyên văn câu gõ, đó sẽ là 1 thay đổi Database Structure cần Decision Record riêng (đã ghi ý tưởng vào `ROADMAP.md`).
- **Conversation History hiển thị TẤT CẢ `aiJobs`**, không chỉ Job tạo từ AI Assistant — vì hiện không có field nào phân biệt "Job tạo từ AI Assistant" với "Job tạo từ Plugin Manager cũ" (`admin/ai/index.html`), và thêm field đó sẽ vi phạm Database Policy. `outcomeLabelForModule()` fallback về nhãn Plugin thật (`AIModuleRegistry`) cho các Job không khớp route nào trong `AITaskRouter.ROUTES`.
- Giới hạn hiển thị 50 phiên gần nhất (cùng cách `admin/ai/logs.html` giới hạn 200) — không phải phân trang thật (Firebase query pagination), chỉ là cắt bớt phía client, cùng mức độ "mở rộng được" như các trang Job Queue/Nhật ký hiện có.
- Mở lại 1 phiên **không** bao giờ gọi `AIJobQueue.resume()`/`AITaskRouter.dispatch()` — đảm bảo tuyệt đối không tự chạy lại Job/Generate lại (Functional Requirement #4).

### AI Assistant — Primary Experience Layer (Requirement #5 — COMPLETED)

✅ **Decision Record đã được Chief Architect phê duyệt: Option A.** `admin/ai/index.html` (Dashboard cũ, chọn Plugin thủ công) **vẫn giữ nguyên** mục điều hướng riêng trong `ADMIN_NAV`, song song với "Trợ lý AI" (`assistant.html`) — không gỡ, không chuyển hướng, không ẩn chức năng hiện có. Quyết định này điều chỉnh lại đúng khung của Functional Requirement #1: AI Assistant là **Primary Experience Layer** (cách tương tác chính, được khuyến khích sử dụng) — **không phải Unique Entry Point** (không phải cách DUY NHẤT, không loại bỏ Workflow cũ).

**Architectural Rule** (áp dụng cho mọi Requirement sau này liên quan AI Assistant): Workflow mới (AI Assistant) **không được thay thế** Workflow cũ (Dashboard/Plugin Manager thủ công) cho đến khi: (1) đã được kiểm chứng trên Production, (2) đã có người dùng thực tế sử dụng, (3) đã chứng minh ổn định. Cho tới lúc đó, cả 2 lối vào cùng tồn tại — không tự ý gỡ Dashboard cũ ở bất kỳ Requirement nào chưa được giao rõ.

Toàn bộ phần còn lại của Requirement #5 đã hoàn tất từ trước, không đổi:

- **Hiển thị "Plugin đã chọn" (Functional Requirement #3)**: `dispatchAndShow()` (`js/admin-ai-assistant.js`) hiển thị `routeResult.outcomeLabel` ngay khi Routing xong, trước khi gọi Permission/Plugin Manager — vẫn đúng nguyên tắc "người dùng không biết Plugin kỹ thuật nào đang chạy" vì `outcomeLabel` là mô tả theo Kết quả, không phải id/tên Plugin.
- **Hiển thị đủ tiến trình (Functional Requirement #4)**: `Request` (`simplePanel`, ngay khi gửi) → `Routing` (`simplePanel`, trong lúc tải candidates + Router phân tích) → `Processing` (Requirement #2) → `Draft Ready` (Requirement #2) → Review (chính là panel Preview + nút Duyệt/Từ chối) → Publish (trạng thái cuối sau khi bấm Duyệt).
- **Xử lý Plugin không khả dụng (Functional Requirement #6) — sửa 1 bug thật**: `PluginManager.execute()` (gọi bên trong `AITaskRouter.dispatch()`, không sửa) tự reject Promise khi Plugin đang Disable hoặc thiếu dữ liệu bắt buộc — hành vi này có từ Sprint 2, không đổi. Trước Requirement #5, `dispatchAndShow()` không có `.catch()` cho nhánh này → màn hình treo vô thời hạn ở "Đang xử lý", không thông báo. Đã thêm `.catch()` ở Experience Layer để hiển thị thông báo rõ ràng, không tạo Job.
- **NFR "mở rộng khi bổ sung Plugin mới"**: đã thỏa mãn sẵn — `AITaskRouter.ROUTES` (Requirement #1) là cấu hình dạng mảng, thêm 1 Plugin mới chỉ cần thêm 1 phần tử route, không cần sửa `admin-ai-assistant.js`.

### Kiểm tra toàn diện + Đóng Sprint (Requirement #6 — SPRINT 4 COMPLETED)

Requirement cuối cùng của Sprint 4 — tái xác nhận toàn bộ AI Experience Layer (Requirement #1–#5), không thêm tính năng. Báo cáo đầy đủ: xem `docs/SPRINT_4_FINAL_REPORT.md`.

- **Cách kiểm tra**: chạy lại toàn bộ mô phỏng đã viết ở Requirement #1–#5 (chạy mã nguồn thật `task-router.js`/`admin-ai.js`/`admin-ai-assistant.js` qua Node `vm`, không viết lại) + mô phỏng Sprint 3 (`job-queue.js`/`providers/openai.js`/3 Plugin) — tất cả PASS, không đổi kết quả.
- **Regression Test**: `git log` xác nhận `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`permission-service.js`/`data-provider.js`/`AI_RULES.md` không bị sửa lần nào kể từ Sprint 2 Requirement #8 — kể cả trong suốt Sprint 4; `task-router.js` chỉ có đúng 1 commit (Requirement #1), chưa từng sửa lại; `functions/index.js` không đổi từ Sprint 3.
- **CMS Console check**: cả 7 trang `admin/ai/*.html` (index/drafts/jobs/logs/plugins/providers/assistant) load 0 lỗi console.
- **Security check**: không có API Key/secret nào trong code Sprint 4; Cloud Function vẫn chưa deploy (không đổi so với Sprint 3, không phải vấn đề do Sprint 4 gây ra).
- **Decision Record Requirement #5**: vẫn treo, mặc định Option A — không chặn đóng Sprint.

## Production Health Check (Sprint 5, Requirement #1)

Cho Administrator xác nhận nhanh toàn bộ chuỗi AI Provider → Cloud Function → OpenAI API → Queue → Draft Workflow đang hoạt động, KHÔNG tạo Job/Draft/Publish nào — công cụ chẩn đoán, không phải Workflow thứ 2:

```
Administrator → admin/ai/health.html (js/admin-ai-health.js)
             → HealthCheck.run('openai') (js/ai/health-check.js)
                  ├─ AIProviderRegistry.get('openai').health() (đã có, Sprint 3 Req #1) → Provider + Cloud Function + OpenAI trong 1 lượt
                  ├─ JobDB.getAll() (chỉ đọc, KHÔNG enqueue/resume/cancel)
                  └─ DraftDB.getAll() (chỉ đọc, KHÔNG add/update)
             → Health Report (3 dòng trạng thái riêng biệt, không gộp "System Error")
```

- **Không thêm Business Logic** — `health-check.js` chỉ gọi lại đúng 3 hàm đọc/kiểm tra đã có sẵn (`provider.health()`, `JobDB.getAll()`, `DraftDB.getAll()`), không viết logic nghiệp vụ mới.
- **Không bypass gì vì không đi qua Workflow chính** — Health Check KHÔNG gọi `PermissionService`/`PluginManager`/`AITaskRouter`/`AIJobQueue.enqueue()` — đây là 1 nhánh chẩn đoán riêng, tách biệt hoàn toàn khỏi luồng `User → AI Assistant → ... → Draft → Human Review`. Trang được bảo vệ bằng page-level guard có sẵn (`AdminAuth.init({requiredRole:'admin'})`), không phải cơ chế Permission mới.
- **An toàn tuyệt đối**: cả 3 nhánh kiểm tra đều CHỈ ĐỌC (`.health()`, `.getAll()` x2) — không có nhánh nào gọi hàm ghi (`add`/`update`/`enqueue`/`resume`/`cancel`) — đã xác nhận qua mô phỏng chạy mã nguồn thật (không phát hiện lời gọi ghi nào trong mọi kịch bản, kể cả khi có lỗi).
- **Vị trí**: trang riêng `admin/ai/health.html` (Admin-only), liên kết từ `admin/ai/providers.html` — không thêm mục điều hướng cấp cao mới (tránh rối menu cho 1 công cụ chẩn đoán ít dùng).

## Giới hạn kiến trúc đã biết (không tự ý "vá" bằng cách thêm hạ tầng mới)

- **Job Queue vẫn không có backend riêng (V1)** — `AIJobQueue` xử lý tuần tự phía trình duyệt Admin, không đổi ở Sprint 3. Cloud Function duy nhất hiện có (`openaiProxy`, xem mục "Cloud Function Proxy Layer") chỉ là proxy gọi OpenAI API, KHÔNG phải backend xử lý Queue — nâng Job Queue lên Cloud Functions (Job Queue V2, xem `ROADMAP.md`) vẫn là quyết định kiến trúc cần người phụ trách xác nhận trước, chưa triển khai.
- **Không có Media Library CMS module** — ảnh hiện quản lý rời rạc theo từng field (product/banner/slider/blog cover) qua Firebase Storage, không có kho ảnh trung tâm để duyệt/chọn lại.
- **Sản phẩm không có trang riêng** — chỉ hiển thị dạng lưới + modal trên `category.html`, không có URL/route riêng từng sản phẩm để đặt thẻ Meta/OG/Schema riêng.

## Lịch sử phát triển

Xem `CHANGELOG.md` cho từng đợt (Sprint) và mốc thay đổi cụ thể.
