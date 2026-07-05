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

## Giới hạn kiến trúc đã biết (không tự ý "vá" bằng cách thêm hạ tầng mới)

- **Job Queue vẫn không có backend riêng (V1)** — `AIJobQueue` xử lý tuần tự phía trình duyệt Admin, không đổi ở Sprint 3. Cloud Function duy nhất hiện có (`openaiProxy`, xem mục "Cloud Function Proxy Layer") chỉ là proxy gọi OpenAI API, KHÔNG phải backend xử lý Queue — nâng Job Queue lên Cloud Functions (Job Queue V2, xem `ROADMAP.md`) vẫn là quyết định kiến trúc cần người phụ trách xác nhận trước, chưa triển khai.
- **Không có Media Library CMS module** — ảnh hiện quản lý rời rạc theo từng field (product/banner/slider/blog cover) qua Firebase Storage, không có kho ảnh trung tâm để duyệt/chọn lại.
- **Sản phẩm không có trang riêng** — chỉ hiển thị dạng lưới + modal trên `category.html`, không có URL/route riêng từng sản phẩm để đặt thẻ Meta/OG/Schema riêng.

## Lịch sử phát triển

Xem `CHANGELOG.md` cho từng đợt (Sprint) và mốc thay đổi cụ thể.
