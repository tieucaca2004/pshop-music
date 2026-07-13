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

## Firebase Database Rules (Sprint 8, Requirement #1)

Từ Sprint 8, `database.rules.json` (version-control trong repo, wiring qua `firebase.json` → `"database": {"rules": "database.rules.json"}`) là lớp kiểm soát truy cập THẬT ở tầng Database, bổ sung cho RBAC phía client (`js/admin-auth.js`/`js/ai/permission-service.js`) — trước Sprint 8, mọi kiểm tra quyền chỉ nằm ở tầng client, không có gì ngăn 1 client gọi thẳng Firebase SDK bỏ qua UI/PermissionService:

```
Site khách (không đăng nhập) → .read: true trên products/categories/banners/blogPosts/videos/siteContent/seoSettings
CMS Admin/Editor (đã đăng nhập, có roles/{uid}) → .write trên các node CMS trên (seoSettings chỉ Admin)
                                                 → .read/.write trên aiDrafts/aiJobs/aiLogs (Admin hoặc Editor)
                                                 → .write trên aiProviderConfig/aiPlugins (CHỈ Admin, khớp AI_RULES.md mục 8)
roles/{uid} → .read công khai CHỈ khi node rỗng (bootstrap tài khoản Admin đầu tiên qua admin/login.html)
            → .write: Admin hiện tại, HOẶC tự ghi uid của chính mình khi roles hoàn toàn rỗng (bootstrap, 1 lần duy nhất)
            → .validate: field "role" chỉ chấp nhận "admin"/"editor"
Mọi node khác không liệt kê ở trên ($other) → .read/.write: false (deny by default, tường minh)
```

- **KHÔNG lặp lại Business Logic của `PermissionService` trong Rules** — Rules chỉ enforce "đã đăng nhập + đúng vai trò `admin`/`editor` ở tầng node", KHÔNG cố tái tạo độ chi tiết "quyền theo từng Plugin" (`PLUGIN_PERMISSIONS`) vì Rules không phải nơi chứa Business Logic (đúng NFR "không tạo kiến trúc trùng lặp") — đây là phòng thủ 2 lớp: Rules chặn truy cập trái phép ở tầng ngoài (Database), `PermissionService` xử lý phân quyền chi tiết ở tầng trong (Application).
- **Không đổi Database Structure** — Rules không thêm Field/Collection nào, chỉ mô tả điều kiện đọc/ghi cho các node ĐÃ CÓ.
- **3 xung đột phát hiện với code hiện có, KHÔNG tự sửa** (xem `CHANGELOG.md`/`ROADMAP.md` để biết chi tiết đầy đủ): (1) `js/admin-users.js` "Thêm tài khoản mới" sẽ thất bại sau khi deploy Rules này (Firebase Auth tự chuyển phiên đăng nhập sang tài khoản mới trước khi ghi `roles`); (2) `admin/login.html` sẽ hiện cảnh báo sai (không ảnh hưởng chức năng) do đọc `roles` công khai bị chặn đúng thiết kế sau khi có Admin đầu tiên; (3) `siteContent` gộp chung tính năng chỉ-Admin và Admin+Editor trong 1 node ghi đè toàn bộ, nên Rules chỉ chặn được ở mức "Admin hoặc Editor", không tách được chính xác theo từng tính năng con.
- **Chưa deploy lên môi trường thật** — cần `firebase deploy --only database` (thao tác vận hành, cần Firebase CLI + đăng nhập, không thực hiện được trong môi trường phát triển hiện tại — giống giới hạn "Cloud Function chưa deploy" từ Sprint 3).

## Media Library (Sprint 8, Requirement #2)

Kho ảnh DÙNG CHUNG cho toàn bộ CMS (Product/Blog/Banner/Slider/Category) — thay thế việc nhập URL ảnh thủ công bằng Preview thumbnail + chọn/tải ảnh từ 1 nơi duy nhất. Xây HOÀN TOÀN trên Firebase Storage đã có (`js/storage-upload.js`, Sprint 1) — KHÔNG thêm Field/Collection Realtime Database nào (đúng "Media Library chỉ là lớp Experience Layer"):

```
Admin (Product/Blog/Banner/Slider/Category form) → MediaLibraryPicker.mount()/mountMulti()/renderSlot()
                                                       (js/media-library-picker.js — Preview + Chọn/Xóa/Advanced URL)
                                                  → bấm "Chọn ảnh" → Modal Thư viện ảnh (tạo động, dùng chung 1 lần)
                                                       → MediaLibrary.list(searchTerm) (js/media-library.js)
                                                            → firebase.storage().ref().listAll() ĐỆ QUY toàn Bucket
                                                              (không hard-code thư mục — phủ cả ảnh cũ + mới)
                                                       → MediaLibrary.upload(file) → StorageUpload.uploadImage()
                                                              (Sprint 1, không viết lại — tải vào thư mục media/)
                                                       → MediaLibrary.remove(fullPath) → CHỈ gọi sau confirm() rõ ràng
                                                  → chọn/tải xong → URL ghi thẳng vào input/textarea đã có của trang
                                                       → save()/saveProduct()/saveAll()/saveTiles() (Sprint 1, không sửa)
```

- **Không cần Decision Record**: không có Database Structure nào thay đổi — "danh sách ảnh có sẵn" đọc trực tiếp từ Storage (không cần 1 node Firebase riêng để biết ảnh nào tồn tại), nên ảnh upload từ trước Requirement này vẫn hiện đầy đủ, không cần migrate. Thư mục `media/` cho ảnh mới là quy ước bổ sung thuần túy, không phải thay đổi Storage Structure cần phê duyệt.
- **Không tạo kiến trúc trùng lặp**: `MediaLibrary.upload()` ủy quyền nguyên vẹn cho `StorageUpload.uploadImage()` (Sprint 1) — không viết lại logic Storage. `MediaLibraryPicker` không chứa Business Logic CMS (không gọi `DB.update`/`BannerDB.update`/...) — chỉ đọc/ghi giá trị URL vào đúng field mà từng trang admin đã có, giữ nguyên toàn bộ hàm `save()` của Product/Blog/Banner/Slider/Category.
- **Ẩn hoàn toàn URL/Storage Path khỏi giao diện chính**: chỉ hiện trong `<details class="medialib-advanced">` đóng sẵn (đúng NFR "ưu tiên Preview thay vì dữ liệu kỹ thuật"). Document ID không áp dụng (không có Database node).
- **Xóa an toàn 2 mức**: "Xóa"/"Bỏ ảnh này" (trên 1 field form) chỉ xóa tham chiếu, KHÔNG đụng Storage. "Xóa khỏi Thư viện" (trong Modal) mới là xóa thật, luôn bắt buộc `confirm()` trước.
- **Tích hợp cả 5 field ảnh CMS**: `bImage` (Banner), `postCover` (Blog), `heroSlides[i].image` (Slider), `categoryTiles[i].image` (Category), `pImages` (Product, nhiều ảnh) — không còn ô nhập URL thủ công nào trên giao diện quản trị.
- **Có thể mở rộng sang Video/PDF trong tương lai** (NFR) — chỉ cần bỏ/đổi điều kiện lọc `contentType` bắt đầu `image/` trong `MediaLibrary.list()`, toàn bộ hạ tầng còn lại (duyệt đệ quy, tìm kiếm, kéo thả, xóa an toàn) dùng lại được nguyên vẹn.
- **2 giới hạn phát hiện, chưa tự sửa** (xem `ROADMAP.md`): Storage Security Rules (`storage.rules`) chưa version-control — quan trọng hơn trước vì Media Library thêm khả năng LIỆT KÊ + XÓA qua giao diện (trước chỉ có UPLOAD); `StorageUpload.attachUploadInput()` hiện không còn nơi nào gọi (dead code, không xóa).

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

### Concurrency Safety (Sprint 8, Requirement #3)

`resume()` giữ nguyên biến `processing` (chặn gọi trùng trong CÙNG 1 tab) nhưng nay mỗi Job còn có thêm 1 "khoá mềm" tại `aiJobs/{jobId}/lock` (`lockedBy`, `lockedAt`) — `runJob()` phải giành được khoá này qua `firebase.database().ref(...).transaction()` (nguyên tử ở tầng Firebase) trước khi xử lý; khoá tự hết hạn sau 5 phút (`LOCK_TTL_MS`) không được làm mới, để 1 tab crash giữa chừng không khoá chết Job mãi mãi. `cancel()`/`retryFailed()` chủ động nhả khoá ngay, không phải chờ hết hạn. Đây là lớp phòng vệ THUẦN TÚY bên trong `job-queue.js` — không có API/hàm public nào của Queue đổi (`enqueue`/`resume`/`cancel`/`retryFailed` giữ nguyên chữ ký), không cần sửa `database.rules.json` (node `aiJobs` đã cho phép admin/editor ghi bất kỳ field con nào từ Requirement #1).

## Logging Layer (Sprint 2, Requirement #7)

`LogDB`/node `aiLogs` (đã có từ Sprint 1, `js/ai/ai-db.js`) là Logging System DUY NHẤT — không tạo Database/Collection mới. **Chỉ `AIJobQueue` (Queue) và `PermissionService` (Requirement #8 — xem mục "Permission & Safety Layer") được ghi Log** — `js/ai/modules/*.js` (Plugin), `js/ai/providers/*.js` (Provider), và `js/ai/plugin-manager.js` (Plugin Manager) không bao giờ gọi `LogDB` trực tiếp; UI (`js/admin-ai.js`) chỉ đọc (`LogDB.getAll()`), không bao giờ tạo/sửa/xóa Log.

Queue ghi 1 dòng Log cho mỗi lượt xử lý item (thành công/thất bại) và mỗi lần hủy Job — không bỏ qua Job nào. Mỗi Log có tối thiểu (không thêm field nào ngoài phạm vi Sprint): `userId`/`userEmail` (User), `moduleId` (Plugin), `provider` (Provider), `timestamp` (Time), `durationMs` (Duration), `status` (Status), `errorMessage` (Error).

**Trạng thái Log**: `completed`, `failed`, `cancelled` — cả 3 đều được Queue ghi chủ động (đổi từ `success`/`failure` cũ ở Sprint 1 sang đúng thuật ngữ Requirement #7, cộng thêm Log khi hủy job); `permission_denied` — ghi bởi `PermissionService`, thêm ở Requirement #8. `pending`/`running` là 2 trạng thái TẠM THỜI của Job/Item — đã hiển thị real-time qua Job Queue Monitor (`admin/ai/jobs.html`), không ghi thêm dòng Log riêng cho 2 trạng thái này để tránh chồng chéo/mở rộng Logging System ngoài phạm vi Sprint.

Log phục vụ theo dõi tiến trình/debug/audit/kiểm tra lỗi qua `admin/ai/logs.html` — chưa xây Dashboard phân tích Log ở sprint này.

## Permission & Safety Layer (Sprint 2, Requirement #8)

`js/ai/permission-service.js` (`PermissionService`) là lớp RBAC (Role-Based Access Control) DUY NHẤT cho AI Assistant — AI Plugin không hard-code quyền, chỉ được kiểm tra qua đây. Đọc vai trò từ đúng node `roles` đã có (cùng node `js/admin-auth.js` dùng cho CMS) — không tạo Database/node mới.

Luồng bắt buộc: **User → Permission → Queue → AI Provider → Draft**. Kiểm tra quyền diễn ra ở lớp UI (`js/admin-ai.js`, hàm `runModule()`) **TRƯỚC khi** gọi `PluginManager.loadPlugin(id).execute()` — cố tình đặt ở đây thay vì sửa `job-queue.js`/`plugin-manager.js`, đúng yêu cầu giữ nguyên 2 module đó trong Requirement #8. Nếu bị từ chối quyền: không gọi `execute()` → không tạo Job → không vào Queue → không gọi AI Provider → không tạo Draft — chỉ ghi 1 dòng Log `permission_denied` (qua `LogDB` có sẵn).

Quyền hỗ trợ (`AI_PERMISSIONS`): `ai.generate.{product,slider,seo,faq,blog,facebook,banner,imagePrompt}` (8 quyền, ứng với 8/8 plugin đã Production — 3 quyền đầu từ Sprint 2, 5 quyền sau thêm dần ở Sprint 5-6 khi từng plugin được kích hoạt), `ai.manage.providers`, `ai.manage.plugins` — 10 quyền tổng cộng *(số liệu cập nhật ở Sprint 9 Requirement #1, trước đó tài liệu ghi thiếu 5 quyền generate thêm từ Sprint 5-6)*. Vai trò `admin` có toàn bộ 10 quyền; vai trò `editor` có 8 quyền `ai.generate.*` — không có `ai.manage.providers`/`ai.manage.plugins`, đúng yêu cầu "chỉ Admin mới được đổi AI Provider và Plugin Settings". Đã bổ sung `requiredRole:'admin'` còn thiếu ở `admin/ai/plugins.html` (đã có sẵn ở `admin/ai/providers.html` từ trước) để khớp đúng quy tắc này ở cấp trang.

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

## Kích hoạt FAQ Generator (Sprint 5, Requirement #3 — COMPLETED)

FAQ Generator (`js/ai/modules/faq-generator.js`, đã có từ Sprint 1) được kích hoạt sang Production theo đúng khuôn mẫu Sprint 3 — sinh 1 bài blog dạng hỏi-đáp mới theo chủ đề tự do (không nhắm 1 Product/Blog Post có sẵn, khác Product/SEO/Slider Generator). Chạy qua **Plugin Manager Dashboard** (`admin/ai/index.html`) — theo đúng phạm vi Requirement #3 (Revised): "FAQ Generator hoạt động thông qua Plugin Manager và Dashboard hiện có — Requirement này KHÔNG tích hợp AI Assistant, KHÔNG mở rộng AI Task Router":

- **Plugin Manager**: `js/ai/plugin-db.js` thêm `'faq-generator'` vào danh sách seed mặc định `enabled:true` — chỉ áp dụng cho môi trường CHƯA có dữ liệu `aiPlugins`; Production đã seed từ trước cần Admin tự bật thủ công.
- **Permission**: `js/ai/permission-service.js` thêm `ai.generate.faq` (Admin + Editor) — đúng khuôn mẫu 3 quyền `ai.generate.*` đã có, không đổi logic RBAC.
- **Draft Workflow**: không cần sửa gì — Draft không có `targetId` (giống Blog Writer) tự động tạo MỚI 1 blog post khi publish (`publishToTarget()` trong `js/admin-ai.js`, không đổi).
- **Plugin Disable**: đã đúng sẵn — Dashboard chỉ hiển thị Plugin đang Enable (`renderModuleCards()`); nếu vô tình gọi khi Disable, `runModule()` đã có `.catch()` hiển thị lỗi rõ ràng (`js/admin-ai.js`, không đổi) — không tạo Job.

### Quyết định kiến trúc: KHÔNG mở rộng AI Task Router ở Sprint 5 (Decision Record — Option B)

`AITaskRouter.route()`/`matchTarget()` (`js/ai/task-router.js`, Sprint 4 Requirement #1) được thiết kế với giả định MỌI Plugin đều nhắm vào 1 thực thể CMS có sẵn (Product hoặc Blog Post) — bắt buộc khớp được `targetId` từ `candidates` mới trả `reason:'ok'`. FAQ Generator (và tương tự: Blog Writer, Facebook Post Generator) không có thực thể mục tiêu nào — chỉ nhận 1 `topic` tự do — nên route thêm cho các Plugin này sẽ luôn trả về `target_not_found`, không bao giờ định tuyến được qua AI Assistant (đã xác nhận bằng thử nghiệm cụ thể ở bản đầu của Requirement #3, không phải suy đoán).

**Chief Architect đã quyết định (Requirement #3 Revised): Option B** — không sửa `task-router.js`, không tích hợp FAQ Generator vào AI Assistant ở Sprint 5. FAQ Generator CHỈ dùng được qua Plugin Manager Dashboard (`admin/ai/index.html`). **Topic-only Routing cho AI Assistant sẽ được xem xét ở một Requirement riêng trong tương lai** (xem `ROADMAP.md`). Đây là giới hạn có chủ đích, không phải bug.

## Usage Visibility (Sprint 5, Requirement #4)

Cho Administrator quan sát mức độ sử dụng AI Framework — CHỈ ĐỌC, không tạo Database/Collection/Field mới, không phải Cost Tracking/Billing:

```
Administrator → admin/ai/usage.html (js/admin-ai-usage.js)
             → UsageStats.compute(rangeKey) (js/ai/usage-stats.js)
                  → LogDB.getAll() (chỉ đọc, KHÔNG add/update) — lọc theo today/7d/30d
             → Report: Tổng số Generate, theo Plugin, theo Provider, theo Trạng thái
```

- **Không có Decision Record** — toàn bộ dữ liệu cần thiết đã có sẵn trong `aiLogs` (`moduleId`, `provider`, `status`, `timestamp`), không cần thêm field/collection nào.
- **Không thêm Business Logic mới** — chỉ đếm/gom nhóm dữ liệu Log đã có, không có quyết định nghiệp vụ nào (không tính token/chi phí — đó là Cost Tracking, ngoài phạm vi).
- **"Tổng số lần Generate"** = tổng số bản ghi Log trong khoảng thời gian đã chọn (mọi trạng thái, kể cả `permission_denied`) — định nghĩa đơn giản, khớp với tổng của 3 bảng breakdown, không cần ước tính riêng.
- **Có thể mở rộng thành Cost Tracking** (NFR) — nếu cần chi phí/token thật, cần thêm field vào `aiLogs` (Database Structure change, cần Decision Record + Chief Architect phê duyệt riêng, đã ghi `ROADMAP.md`).

## Kiểm tra toàn diện + Đóng Sprint (Sprint 5, Requirement #5 — SPRINT 5 COMPLETED)

Requirement cuối cùng của Sprint 5 — tái xác nhận toàn bộ những gì đã xây (Requirement #1, #3, #4), không thêm tính năng. Báo cáo đầy đủ: xem `docs/SPRINT_5_PROGRESS.md`.

- **2 điểm không khớp trong yêu cầu gốc, đã ghi nhận rõ chứ không tự suy diễn**: (1) "Requirement #2" (AI Workflow Engine) chưa từng được triển khai dù Context ghi COMPLETED — không ảnh hưởng vì Requirement #5 không kiểm thử hạng mục nào của Workflow Engine; (2) "Kiểm thử Blog Writer" không thực hiện được vì Blog Writer chưa được kích hoạt sang Production ở Sprint 5 (chỉ FAQ Generator được kích hoạt).
- **Regression Test**: xác nhận qua `git log` từng file — `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`data-provider.js`/`AI_RULES.md` không đổi từ Sprint 2 Requirement #8; `task-router.js` chỉ 1 commit (Sprint 4 Requirement #1); `permission-service.js`/`plugin-db.js` chỉ đúng 2 commit/file (Sprint 2 + bổ sung FAQ Generator ở Sprint 5 Requirement #3, đúng dự kiến).
- **CMS Console check**: cả 9 trang AI (`index/drafts/jobs/logs/plugins/providers/assistant/health/usage`) load 0 lỗi console.
- **Security check**: không có secret nào trong code Sprint 5; Cloud Function vẫn chưa deploy (kế thừa từ Sprint 3, không phải vấn đề Sprint 5).

## Kích hoạt Blog Writer (Sprint 6, Requirement #1)

Blog Writer (`js/ai/modules/blog-writer.js`, đã có từ Sprint 1) được kích hoạt sang Production theo đúng khuôn mẫu Sprint 5 Requirement #3 (FAQ Generator) — sinh 1 bài blog mới theo chủ đề tự do (cùng dạng "topic-only" như FAQ Generator, không nhắm 1 Product/Blog Post có sẵn):

- **Plugin Manager**: `js/ai/plugin-db.js` thêm `'blog-writer'` vào danh sách seed mặc định `enabled:true` — chỉ áp dụng cho môi trường CHƯA có dữ liệu `aiPlugins`; Production đã seed từ trước cần Admin tự bật thủ công.
- **Permission**: `js/ai/permission-service.js` thêm `ai.generate.blog` (Admin + Editor) — đúng khuôn mẫu các quyền `ai.generate.*` đã có.
- **Draft Workflow**: không cần sửa gì — Draft không có `targetId` tự động tạo MỚI 1 blog post khi publish (`publishToTarget()` trong `js/admin-ai.js`, không đổi) — giống hệt FAQ Generator.
- **Không có Decision Record cần thiết**: khác với FAQ Generator, Requirement #1 của Sprint 6 liệt kê rõ "Topic-only Routing" trong Out of Scope và không yêu cầu thêm Route vào AI Task Router — Blog Writer chỉ dùng qua Plugin Manager Dashboard (`admin/ai/index.html`), nhất quán với quyết định đã có cho FAQ Generator (Sprint 5 Requirement #3, Decision Record Option B).

## Kích hoạt Image Prompt Generator (Sprint 6, Requirement #4)

Image Prompt Generator (`js/ai/modules/image-prompt-generator.js`, đã có từ Sprint 1) được kích hoạt sang Production — **plugin cuối cùng** viết từ Sprint 1, sau Requirement này không còn plugin nào ở trạng thái "coming_soon":

- **Plugin Manager**: `js/ai/plugin-db.js` thêm `'image-prompt-generator'` vào danh sách seed mặc định `enabled:true` — chỉ áp dụng cho môi trường CHƯA có dữ liệu `aiPlugins`; Production đã seed từ trước cần Admin tự bật thủ công.
- **Permission**: `js/ai/permission-service.js` thêm `ai.generate.imagePrompt` (Admin + Editor) — đúng khuôn mẫu các quyền `ai.generate.*` đã có.
- **Chỉ sinh văn bản Prompt, không tự tạo ảnh**: `mapToDraftContent()` trả về đúng 1 field `imagePrompt` (chuỗi văn bản tiếng Anh mô tả ảnh, để người dùng tự dán vào công cụ tạo ảnh AI khác) — module không có bất kỳ hàm nào gọi API tạo ảnh, đúng ranh giới "AI Image Generation" vẫn ngoài phạm vi kiến trúc hiện tại (xem `ROADMAP.md`, mục "AI Image Generation").
- **`targetCollection: null` — cùng dạng "chỉ xem/copy" như Facebook Post Generator (Sprint 6, Requirement #2)**: không có nơi publish trực tiếp; `publishDraftById()` chuyển Draft sang `'published'` mà không ghi vào bất kỳ node CMS nào — xác nhận qua mô phỏng, không sửa `publishToTarget()`.
- **Dữ liệu thật, không hardcode**: `buildPrompt()` dùng `subject`/`style` tự do người dùng nhập, không qua `DataProvider` (cùng dạng "chủ đề tự do" như Blog Writer/FAQ Generator/Facebook Post Generator/Banner Generator).
- **Không có Decision Record cần thiết**: không yêu cầu thêm Route vào AI Task Router — chỉ dùng qua Plugin Manager Dashboard (`admin/ai/index.html`), cùng lý do Topic-only Routing (xem `ROADMAP.md`).

## Kích hoạt Banner Generator (Sprint 6, Requirement #3)

Banner Generator (`js/ai/modules/banner-generator.js`, đã có từ Sprint 1) được kích hoạt sang Production theo đúng khuôn mẫu Blog Writer/FAQ Generator/Facebook Post Generator — sinh nội dung 1 banner quảng cáo mới (tiêu đề nội bộ + link) theo chủ đề tự do:

- **Plugin Manager**: `js/ai/plugin-db.js` thêm `'banner-generator'` vào danh sách seed mặc định `enabled:true` — chỉ áp dụng cho môi trường CHƯA có dữ liệu `aiPlugins`; Production đã seed từ trước cần Admin tự bật thủ công.
- **Permission**: `js/ai/permission-service.js` thêm `ai.generate.banner` (Admin + Editor) — đúng khuôn mẫu các quyền `ai.generate.*` đã có.
- **`targetCollection: 'banners'` — publish thật vào CMS, khác Facebook Post Generator (`null`)**: đây là plugin đầu tiên kể từ Slider Generator (Sprint 3) ghi thẳng vào 1 node CMS thật. Đã xác nhận qua mô phỏng chạy `publishToTarget()`/`publishDraftById()` (`js/admin-ai.js`, không sửa) rằng nhánh `target === 'banners'` gọi đúng `BannerDB.add(draft.content)` (đã có sẵn từ khi viết `publishToTarget()`, tái sử dụng nguyên vẹn) — tạo đúng 1 bản ghi Banner mới, không ảnh hưởng `BlogDB`/`DB`.
- **Dữ liệu thật, không hardcode**: `buildPrompt()` dùng `theme` tự do người dùng nhập làm chủ đề banner; `link` cũng do người dùng nhập trực tiếp, không qua `DataProvider` (cùng dạng "chủ đề tự do" như Blog Writer/FAQ Generator, không nhắm 1 Product/Blog Post có sẵn).
- **Không có Decision Record cần thiết**: giống Blog Writer/Facebook Post Generator, Requirement #3 của Sprint 6 không yêu cầu thêm Route vào AI Task Router — Banner Generator chỉ dùng qua Plugin Manager Dashboard (`admin/ai/index.html`), cùng lý do Topic-only Routing (xem `ROADMAP.md`).

## Kích hoạt Facebook Post Generator (Sprint 6, Requirement #2)

Facebook Post Generator (`js/ai/modules/facebook-post-generator.js`, đã có từ Sprint 1) được kích hoạt sang Production theo đúng khuôn mẫu Blog Writer (Sprint 6 Requirement #1)/FAQ Generator (Sprint 5 Requirement #3) — sinh nội dung bài đăng Facebook để copy thủ công, không tự đăng:

- **Plugin Manager**: `js/ai/plugin-db.js` thêm `'facebook-post-generator'` vào danh sách seed mặc định `enabled:true` — chỉ áp dụng cho môi trường CHƯA có dữ liệu `aiPlugins`; Production đã seed từ trước cần Admin tự bật thủ công.
- **Permission**: `js/ai/permission-service.js` thêm `ai.generate.facebook` (Admin + Editor) — đúng khuôn mẫu các quyền `ai.generate.*` đã có.
- **`targetCollection: null` — plugin đầu tiên dạng "chỉ xem/copy, không publish vào CMS"**: khác mọi plugin Production trước đó (Product/SEO/Slider/FAQ/Blog Writer đều có `targetCollection` trỏ vào 1 node CMS thật), Facebook Post Generator không có nơi publish trực tiếp — không có trang/module "Facebook Posts" trong CMS, và tự động đăng lên Facebook thật ngoài phạm vi kiến trúc hiện tại (không có tích hợp Facebook API). Đã xác nhận qua mô phỏng chạy `publishToTarget()`/`publishDraftById()` (`js/admin-ai.js`, không sửa) rằng nhánh `targetCollection === null` đã xử lý đúng từ khi viết (Sprint 1/2): trả `Promise.resolve()`, không ghi vào bất kỳ node CMS nào (`BlogDB`/`DB`/`BannerDB`/`SiteContentDB`), Draft chỉ chuyển trạng thái `'published'` để đánh dấu Admin đã xử lý xong (xem/copy nội dung thủ công trong `admin/ai/drafts.html`).
- **Dữ liệu thật, không hardcode**: `loadContext()` gọi `DataProvider.getProduct(productId)` khi có chọn sản phẩm (trường optional); `buildPrompt()` dùng `message` tự do người dùng nhập, không có chuỗi cố định.
- **Không có Decision Record cần thiết**: giống Blog Writer, Requirement #2 của Sprint 6 không yêu cầu thêm Route vào AI Task Router — Facebook Post Generator chỉ dùng qua Plugin Manager Dashboard (`admin/ai/index.html`), cùng lý do Topic-only Routing (xem `ROADMAP.md`).

## Kiểm tra toàn diện + Đóng Sprint (Sprint 6, Sprint Review — SPRINT 6 COMPLETED)

Sprint Review cuối cùng của Sprint 6 — tái xác nhận toàn bộ 4 Requirement (Blog Writer, Facebook Post Generator, Banner Generator, Image Prompt Generator), không thêm tính năng. Báo cáo đầy đủ: xem `docs/SPRINT_6_PROGRESS.md`.

- **Sau Sprint 6, cả 8/8 plugin viết từ Sprint 1 đều đã Production** — không còn plugin nào ở trạng thái "coming_soon" trong `js/ai/plugin-db.js`.
- **Regression Test**: xác nhận qua `git log` từng file — `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`data-provider.js`/`AI_RULES.md` không đổi từ Sprint 2 Requirement #8; `task-router.js` chỉ 1 commit (Sprint 4 Requirement #1); `permission-service.js`/`plugin-db.js` đúng 6 commit/file (Sprint 2 + FAQ Generator Sprint 5 Requirement #3 + 4 Requirement Sprint 6, đúng dự kiến, không có thay đổi ngoài kế hoạch).
- **Kiểm thử trạng thái cuối cùng**: chạy lại cả 4 file mô phỏng riêng của từng Requirement (`sprint6_req1_sim.js`…`sprint6_req4_sim.js`) — 3/4 file báo lỗi ở đúng 1 assertion phụ ("plugin kế tiếp vẫn phải coming_soon"), đây KHÔNG PHẢI regression mà là giả định đã lỗi thời của chính file đó (viết tại thời điểm plugin kế tiếp chưa được giao kích hoạt) — mọi assertion CHÍNH (Permission/dữ liệu thật/Draft Workflow/publish đúng đích) đều PASS. Đã viết thêm 1 mô phỏng mới cho trạng thái cuối (`sprint6_review_sim.js`) xác nhận cả 8 plugin đều seed đúng, Permission đủ cho cả 8, và 4 plugin Sprint 6 chạy đồng thời qua chung 1 Queue thật không ghi chéo node CMS của nhau.
- **CMS Console check**: cả 9 trang AI (`index/drafts/jobs/logs/plugins/providers/assistant/health/usage`) load 0 lỗi console.
- **Security check**: không có secret nào trong code Sprint 6; Cloud Function vẫn chưa deploy (kế thừa từ Sprint 3, không phải vấn đề Sprint 6).
- **Project Backup**: không khả dụng trong môi trường hiện tại — Auto Mode Safety Classifier chặn cứng việc nén + upload source code lên Google Drive bên ngoài (phân loại "Data Exfiltration"). GitHub (`feature/cms-ai-sprint2`) là nơi backup từ xa duy nhất khả dụng.

## Kiểm tra toàn diện + Đóng Sprint (Sprint 7, Requirement #6 — SPRINT 7 COMPLETED)

Sprint Review cuối cùng của Sprint 7 — tái xác nhận toàn bộ 5 Requirement (Observability Dashboard, Cost Tracking, Context Foundation, Workflow Automation, Workflow Insights), không thêm tính năng. Báo cáo đầy đủ: xem `docs/SPRINT_7_FINAL_REPORT.md`.

- **Kiểm thử lại toàn bộ 5 Requirement bằng mã nguồn thật** (Chrome + `javascript_tool`, không có Node.js/Python trong môi trường hiện tại): `observability.js`/`cost-tracking.js`/`context-builder.js`/`workflow-engine.js` chạy nguyên văn, mock đúng contract các Service/DB liền kề — 3+3+7+6 = **19/19 kịch bản PASS** (kể cả 2 Requirement viết ở phiên trước, xác nhận lại từ đầu chứ không chỉ tin kết quả cũ).
- **Regression Test**: `git log --oneline -- <file>` xác nhận `job-queue.js`/`plugin-manager.js`/`provider-registry.js`/`provider-interface.js`/`task-router.js`/`data-provider.js`/`AI_RULES.md`/`functions/index.js` không có commit nào trong suốt Sprint 7; `git diff 47f450d..HEAD` trên toàn bộ file lõi trả về rỗng. Mỗi file mới Sprint 7 chỉ có đúng 1 commit trong lịch sử (chưa từng bị sửa lại ở Requirement sau). Mỗi commit Sprint 7 chỉ động đúng 7 file (3 docs + 1 dòng liên kết + 3 file mới) — không Requirement nào sửa trang/link của Requirement khác.
- **Architecture Verification**: xác nhận đủ 8 mục (AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Database Structure/`AI_RULES.md`) đều KHÔNG đổi trong suốt Sprint 7.
- **Security Verification**: không có API Key/secret nào trong file Sprint 7; `WorkflowEngine` xác nhận KHÔNG bypass Permission (test thật: từ chối quyền → `PluginManager.loadPlugin` không hề được gọi); `ContextBuilder` xác nhận không rò rỉ dữ liệu (chỉ đọc đúng `id` chỉ định, không lấy toàn bộ danh sách); Cloud Function vẫn chưa deploy, Firebase Rules vẫn không version-control (cả 2 kế thừa Sprint 3) — không phát hiện lỗ hổng mới.
- **Production Readiness**: toàn bộ 11 hạng mục (AI Framework/AI Assistant/Plugin Framework/Provider Framework/Queue/Context Builder/Workflow Engine/Observability/Cost Tracking/Draft Workflow/Human Review) đều ✅ sẵn sàng về code — giới hạn duy nhất là vận hành (deploy Cloud Function), kế thừa từ Sprint 3.
- **Project Backup**: không khả dụng trong môi trường hiện tại — Auto Mode Safety Classifier chặn cứng việc nén + upload source code lên Google Drive bên ngoài (phân loại "Data Exfiltration"). GitHub (`feature/cms-ai-sprint2`) là nơi backup từ xa duy nhất khả dụng.

## AI Workflow Insights (Sprint 7, Requirement #5 — cuối cùng phát triển tính năng Sprint 7)

Cho Administrator quan sát toàn bộ vòng đời 1 AI Request — Context → Queue → Provider → Draft → Human Review → Trạng thái cuối — trên 1 màn hình, công cụ Observability, hoàn toàn CHỈ ĐỌC, không phát sinh Business Logic:

```
Administrator → admin/ai/workflow-insights.html (js/admin-ai-workflow-insights.js)
             → WorkflowInsightsService.compute(rangeKey) (js/ai/workflow-insights.js)
                  ├─ JobDB.getAll() → mỗi Job = 1 "AI Request": Timeline (createdAt/startedAt/finishedAt),
                  │    Provider (job.provider), Plugin (job.moduleId), items[] (status/error/resultDraftId)
                  ├─ LogDB.getAll() → khớp theo jobId → durationMs mỗi item (Context+Provider+Draft gộp chung)
                  ├─ LogDB entries jobId:null, status:'permission_denied' → mỗi entry = 1 "AI Request" riêng
                  └─ DraftDB.getAll() → khớp theo item.resultDraftId → trạng thái Draft/Human Review
             → 1 danh sách AI Request (Timeline + Trạng thái cuối), UI resolve nhãn Plugin/Provider qua
                AIModuleRegistry.get()/AIProviderRegistry.get(), cho xem chi tiết từng Request
```

- **Định nghĩa 1 "AI Request" = 1 `aiJobs` record**, cộng các lượt bị từ chối quyền (`aiLogs` có `jobId:null`, `status:'permission_denied'` — AI_RULES.md mục 8: Queue chưa từng được gọi tới nên không có Job) — mỗi lượt này là 1 Request riêng có trạng thái cuối "Permission Denied".
- **Timeline giới hạn đúng độ chi tiết dữ liệu hiện có**: `createdAt`/`startedAt`/`finishedAt` của Job (không đổi Queue) cho ra "Queue chờ" (`queueWaitMs`) và "Xử lý" (`processingMs`) ở cấp Job; thời gian xử lý mỗi item lấy từ `durationMs` của `aiLogs` khớp `jobId` (khớp theo thứ tự xử lý tuần tự, vì Log không lưu `itemIndex` riêng) — đây là thời gian GỘP CHUNG Context+Provider+tạo Draft, Queue không ghi tách timestamp riêng từng giai đoạn con. Không suy đoán thêm số liệu ngoài dữ liệu đã ghi.
- **Provider/Plugin đã dùng**: Provider lấy trực tiếp từ `job.provider` (Sprint 2 Requirement #6, đã ghi đúng mục đích này); nhãn hiển thị resolve ở tầng UI (không phải Service) qua `AIModuleRegistry.get()`/`AIProviderRegistry.get()` — đúng cách tách Service (tính toán)/UI (trình bày) đã dùng ở `cost-tracking.js`/`admin-ai-cost-tracking.js`.
- **Thiếu dữ liệu → "Unknown", không phải System Error**: mọi field hiển thị có fallback "Unknown" (Draft bị xoá dù Job có `resultDraftId`, Job đang `queued`/`running` chưa có `startedAt`/`finishedAt`...); mỗi nguồn đọc (`JobDB`/`LogDB`/`DraftDB`) tự bắt lỗi riêng trong `compute()` — 1 nguồn lỗi không làm hỏng toàn bộ Insights.
- **Không phát sinh Business Logic mới**: `WorkflowInsightsService` chỉ đọc + ghép nối dữ liệu 3 nguồn đã có, không có quyết định nghiệp vụ nào ngoài đối chiếu theo `id`/`jobId`/`resultDraftId` sẵn có.
- **Không đổi Database Structure**: không thêm Field/Collection nào.
- **Có thể mở rộng thành Distributed Tracing trong tương lai** (NFR) — muốn Timeline tách riêng từng giai đoạn con (Context/Provider/Draft riêng biệt thay vì gộp `durationMs`) cần Queue (`job-queue.js`) ghi thêm timestamp cho từng bước — LÀ 1 thay đổi Queue/Database Structure, chưa triển khai, cần Decision Record + Chief Architect phê duyệt riêng (xem `ROADMAP.md`).

## User-triggered Workflow Automation (Sprint 7, Requirement #4)

Cho phép Administrator ghép nhiều AI Plugin thành 1 chuỗi Bước chạy TUẦN TỰ, CHỈ chạy khi chủ động bấm "Chạy Workflow" — KHÔNG có Trigger tự động/Cron/Webhook nào:

```
Administrator → admin/ai/workflow.html (js/admin-ai-workflow.js): thêm Step (Plugin + input)
             → bấm "Chạy Workflow" → WorkflowEngine.run(steps, userId, userEmail, onStepDone) (js/ai/workflow-engine.js)
                  Với MỖI Step (tuần tự, dừng ngay khi 1 Step không "completed"):
                  ├─ PermissionService.checkPluginExecution(userId, userEmail, pluginId) — không granted → dừng, KHÔNG gọi Plugin Manager
                  ├─ PluginManager.loadPlugin(pluginId).execute([inputParams], userId, userEmail) → AIJobQueue.enqueue() (Job riêng cho Step này)
                  ├─ AIJobQueue.resume(userId, userEmail) → xử lý Queue (tuần tự, Queue DUY NHẤT đã có)
                  └─ JobDB.get(jobId) → đọc trạng thái Job thật ("completed"/"failed") để quyết định chạy tiếp hay dừng
             → Step "completed" → Draft (trạng thái "draft") → Human Review tại admin/ai/drafts.html (không sửa, Workflow KHÔNG tự Publish)
```

- **Không phát sinh Business Logic mới, không bypass Layer nào**: `WorkflowEngine` KHÔNG tự enqueue Job (không gọi `AIJobQueue.enqueue()` trực tiếp — luôn qua `PluginManager.loadPlugin().execute()`), KHÔNG tự chọn Provider/gọi AI (không đụng `AIProviderRegistry`), KHÔNG tự kiểm tra quyền theo cách riêng (luôn qua `PermissionService.checkPluginExecution()`, đúng cách `js/admin-ai.js runModule()` đã làm cho 1 Plugin đơn — `AI_RULES.md` mục 8 đã dự liệu rõ: nơi gọi `PluginManager.execute()` trực tiếp khác phải tự gọi `PermissionService.checkPluginExecution()`).
- **Không lưu định nghĩa Workflow vào Database**: danh sách Step (Plugin + input mỗi Step) chỉ tồn tại trong bộ nhớ trình duyệt (biến JS) ở phiên chạy hiện tại — không có Collection/Field Firebase mới nào. Muốn lưu Workflow để chạy lại nhiều lần cần 1 Collection mới, LÀ 1 thay đổi Database Structure — chưa triển khai, cần Decision Record riêng (xem `ROADMAP.md`).
- **Dừng đúng lúc khi 1 Step thất bại**: `WorkflowEngine.run()` kiểm tra `status` trả về của mỗi Step (`completed`/`failed`/`permission_denied`/`plugin_not_found`) — bất kỳ giá trị nào khác `completed` đều dừng chuỗi Step ngay, các Step còn lại không được gọi tới (không tạo Job cho Step chưa chạy tới).
- **Mỗi Step vẫn là 1 Job riêng qua đúng Queue hiện có**: `plugin.execute([inputParams], userId, userEmail)` gọi hệt như Dashboard chính (`js/admin-ai.js runModule()`) — mỗi Step luôn tạo đúng 1 bản ghi `aiJobs` riêng, xử lý qua `AIJobQueue` (Queue DUY NHẤT, không có Queue thứ 2 cho Workflow).
- **Không Publish tự động**: `workflow-engine.js` không import/gọi `publishToTarget()`/`publishDraftById()` — mọi Draft tạo ra từ Workflow vẫn dừng ở trạng thái `draft`, chờ Admin tự duyệt tại `admin/ai/drafts.html` (Draft Workflow/Human Review Workflow không đổi).
- **Không đổi Database Structure, không Trigger tự động**: không thêm Field/Collection nào; Workflow chỉ chạy khi có hành động bấm nút rõ ràng của Admin — không có polling/cron/webhook nào lắng nghe chạy nền.
- **Có thể mở rộng sang Automation thật trong tương lai** (NFR) — SAU KHI `AI_RULES.md` (Constitution) được sửa để cho phép Trigger tự động (hiện quy tắc 3 "Chỉ chạy khi có hành động rõ ràng của người dùng" cấm điều này) — đây là thay đổi Constitution, cần Decision Record + Chief Architect phê duyệt riêng, chưa triển khai ở Requirement này.

## AI Context Foundation (Sprint 7, Requirement #3)

Lớp Context DÙNG CHUNG cho AI Framework, đứng giữa Data Provider (Sprint 2, Requirement #3) và AI Provider — đóng gói dữ liệu CMS có sẵn thành 1 Context Package chuẩn hoá trước khi ghép vào Prompt, CHỈ ĐỌC, không ghi Memory dài hạn:

```
(Plugin tương lai, opt-in) → ContextBuilder.build(moduleId, inputParams) (js/ai/context-builder.js)
                                  ├─ DataProvider.getProduct()/getMedia() (nếu có productId)
                                  ├─ DataProvider.getBlogPost() (nếu có postId)
                                  └─ DataProvider.getSettings() (luôn thử đọc — ngữ cảnh nền tảng chung)
                             → Context Package { moduleId, builtAt, data, missing }
                             → ContextBuilder.toPromptText(package) → đoạn text sẵn sàng ghép vào `prompt`
                                  (tham số của IAIProvider.generate({prompt}), js/ai/provider-interface.js)

Admin (xem trước) → admin/ai/context-builder.html (js/admin-ai-context-builder.js)
                  → PluginManager.loadPlugins() (chọn Plugin) + DB.getAll()/BlogDB.getAll() (chọn Sản phẩm/Bài viết)
                  → ContextBuilder.build() + toPromptText() → hiển thị Context Package (chỉ xem, không tạo Job/Draft)
```

- **Không phát sinh Business Logic mới, không đổi Sprint 2-6**: mỗi module trong `js/ai/modules/*.js` vẫn tự `loadContext()` riêng như trước — `job-queue.js` KHÔNG gọi tới `context-builder.js`. `ContextBuilder` là nền tảng CHUNG, SẴN SÀNG cho Plugin tương lai dùng (gọi trực tiếp `build()`, giống hệt cách gọi `DataProvider`), không bắt buộc Plugin hiện tại phải đổi theo — đúng Architectural Constraint "Không Refactor Sprint 2-6".
- **Không Memory dài hạn, không RAG**: `build()` là hàm thuần đọc, không cache/ghi vào bất kỳ Database/collection nào — mỗi lần gọi là 1 lượt đọc `DataProvider` mới hoàn toàn; không tìm kiếm ngữ nghĩa/vector, chỉ đọc trực tiếp theo id có sẵn trong `inputParams` (`productId`/`postId`), đúng cách các module Sprint 2-6 đã tự làm.
- **Thiếu Context không phải System Error**: mỗi nguồn dữ liệu tự bắt lỗi/rỗng riêng vào mảng `missing` — kể cả `DataProvider` reject toàn bộ hoặc chưa được nạp script, `build()` vẫn luôn resolve về 1 Context Package hợp lệ (rỗng nếu cần), không bao giờ throw/reject. Đã xác nhận qua kiểm thử thật trên Chrome (7 kịch bản, xem `CHANGELOG.md`).
- **`toPromptText()` — chứng minh tương thích với AI Provider mà không tự gọi Provider**: định dạng Context Package thành 1 đoạn text đúng kiểu tham số `prompt` (string) mà `IAIProvider.generate({prompt})` chấp nhận — không tự gọi `AIProviderRegistry`/`provider.generate()` ở đây; việc chọn Provider và gọi AI thật vẫn CHỈ thuộc về `AIJobQueue` (`AI_RULES.md` mục 6).
- **`admin/ai/context-builder.html` chỉ là công cụ xem trước kiến trúc**: liệt kê cả Plugin đang Disable/Coming Soon (không phải nơi chạy Plugin thật), không tạo Job, không gọi `AIJobQueue`/`AIProviderRegistry`, không tạo Draft. Dropdown Sản phẩm/Bài viết tải qua `DB.getAll()`/`BlogDB.getAll()` trực tiếp — đúng khuôn mẫu `js/admin-ai.js` đã dùng cho `productSelect`/`blogSelect` (quy tắc "chỉ qua DataProvider" ở `AI_RULES.md` mục 2b áp dụng cho `loadContext()` của Plugin, không áp dụng cho UI tải danh sách hiển thị dropdown).
- **Không đổi Database Structure**: không thêm Field/Collection nào — toàn bộ dữ liệu đọc qua `DataProvider` đã có.
- **Có thể mở rộng thành AI Memory trong tương lai** (NFR) — Context Package hiện là dữ liệu tức thời (không lưu), có cấu trúc `{ moduleId, builtAt, data, missing }` rõ ràng, dễ thêm 1 lớp lưu trữ/lấy lại theo thời gian sau này NẾU được giao 1 Requirement riêng (sẽ cần Decision Record vì đó là thay đổi Database Structure) — chưa triển khai ở Requirement này.

## AI Cost Tracking (Sprint 7, Requirement #2)

Cho Administrator theo dõi mức sử dụng AI và chi phí ƯỚC TÍNH theo Provider/Plugin — công cụ thống kê, hoàn toàn CHỈ ĐỌC, không phải Billing/thanh toán:

```
Administrator → admin/ai/cost-tracking.html (js/admin-ai-cost-tracking.js)
             → CostTrackingService.compute(rangeKey) (js/ai/cost-tracking.js)
                  ├─ UsageStats.compute(rangeKey) (Sprint 5 #4, không sửa) → Usage Summary (tổng/theo Provider/theo Plugin/theo Trạng thái)
                  └─ LogDB.getAll() (chỉ đọc, lọc status:'completed') → Cost Estimate theo Provider + theo Plugin
             → 1 báo cáo hợp nhất (Usage + Cost Estimate)
```

- **Quyết định kiến trúc quan trọng — không cần Decision Record**: `aiLogs` hiện không lưu token/chi phí thật (chỉ `moduleId`/`provider`/`status`/`timestamp`/`durationMs`...). Thêm field mới sẽ là thay đổi Database Structure, đúng Architectural Constraint của Requirement #2 thì phải có Decision Record + chờ phê duyệt riêng trước khi làm. Đã chọn **không đổi Database Structure**: chi phí ước tính = (số lượt Generate **thành công**, `status:'completed'`) × (đơn giá tham khảo trung bình mỗi lượt, hằng số tĩnh `ESTIMATED_COST_PER_CALL_USD` theo Provider trong `js/ai/cost-tracking.js` — KHÔNG dựa trên token thực tế). Đây là ước tính tham khảo thô, đúng nghĩa đen "chi phí ước tính" của Requirement — không phải Billing chính xác (Out of Scope).
- **Chỉ tính lượt `completed`**: `failed`/`cancelled`/`permission_denied` không được tính vào chi phí — đây là trạng thái duy nhất chắc chắn đã nhận phản hồi AI thật, tránh ước tính cao hơn thực tế.
- **NFR "Không phụ thuộc Provider cụ thể"**: bảng đơn giá chỉ có `openai` (Provider duy nhất đã tích hợp API thật, Sprint 3 Requirement #1) — Provider nào chưa có đơn giá (Claude/Gemini/DeepSeek, vẫn là stub) tự động trả về `available:false`, hiển thị **"Cost estimation unavailable"** thay vì suy đoán/mặc định 0.
- **Tái sử dụng tuyệt đối**: Usage Summary gọi thẳng `UsageStats.compute()` (Sprint 5 #4, không sửa file đó, không viết lại logic lọc thời gian/tổng hợp) — `CostTrackingService` chỉ thêm phần tính Cost Estimate từ cùng 1 lượt đọc `LogDB.getAll()`.
- **Có thể mở rộng thành Billing thật sau này** (NFR) — nếu cần chi phí chính xác dựa trên token thực tế, cần thêm field vào `aiLogs` (Database Structure change) + đọc field `usage` có sẵn trong response OpenAI qua Cloud Function Proxy — đây LÀ 1 thay đổi cần Decision Record riêng, đã ghi vào `ROADMAP.md`, không tự triển khai ở Requirement này.

## AI Observability Dashboard (Sprint 7, Requirement #1)

Cho Administrator quan sát toàn bộ trạng thái AI Framework từ 1 màn hình duy nhất — công cụ tổng hợp, không phải Workflow thứ 2, hoàn toàn CHỈ ĐỌC:

```
Administrator → admin/ai/observability.html (js/admin-ai-observability.js)
             → ObservabilityService.compute(rangeKey) (js/ai/observability.js)
                  ├─ HealthCheck.run(activeProviderId) (Sprint 5 #1) → Health Status
                  ├─ AIProviderRegistry.getAll() + ProviderConfigDB.get() → Provider Status
                  ├─ JobDB.getAll() (chỉ đọc) → Queue Status (đang bận/rảnh) + Job Summary (tổng theo trạng thái) — dùng CHUNG 1 lượt đọc
                  ├─ PluginManager.loadPlugins() (Sprint 2 #4) → Plugin Status
                  ├─ UsageStats.compute(rangeKey) (Sprint 5 #4) → Usage Summary
                  └─ DraftDB.getAll() (chỉ đọc) → Draft Summary
             → 1 báo cáo hợp nhất + thời điểm cập nhật gần nhất
```

- **Không phát sinh Business Logic mới**: `ObservabilityService` chỉ gọi lại đúng các Service/Manager/DB đã có ở Sprint 2–5 và gộp kết quả — không có quyết định/tính toán nghiệp vụ nào mới ngoài đếm số lượng theo trạng thái (giống cách `UsageStats` đã làm).
- **Plugin Status đi qua đúng Plugin Manager**: `computePlugins()` gọi `PluginManager.loadPlugins()`, không đọc thẳng `PluginDB`/`AIModuleRegistry` — đúng quy tắc "UI luôn qua Plugin Manager" (`AI_RULES.md` mục 5b).
- **Cô lập lỗi từng nhánh**: mỗi nhánh (Health/Provider/Queue/Plugin/Usage/Draft) tự bắt lỗi riêng (`{ error: message }`) trong `Promise.all()` — 1 thành phần lỗi (vd Provider chưa cấu hình, mất kết nối) không làm hỏng các phần còn lại của Dashboard, đúng NFR "Không phụ thuộc AI Provider". Đã xác nhận qua mô phỏng: giả lập lỗi đọc `aiJobs` — Queue Status hiển thị lỗi rõ ràng trong khi Health/Provider/Plugin/Usage/Draft vẫn hiển thị đúng.
- **Empty State thay vì System Error**: Queue/Draft/Usage rỗng trả về `total:0` — UI hiển thị thông báo rõ ràng ("Chưa có Job/Draft/dữ liệu nào..."), không phải lỗi hệ thống.
- **Không đổi Database Structure**: không thêm Field/Collection nào — toàn bộ dữ liệu đọc từ `aiLogs`/`aiJobs`/`aiDrafts`/`aiPlugins`/`aiProviderConfig` đã có.
- **Có thể mở rộng thành Monitoring Dashboard sau này** (NFR) — `compute()` tách biệt hoàn toàn khỏi phần render, dễ thêm auto-refresh/ngưỡng cảnh báo ở Requirement sau mà không đổi cấu trúc hiện tại.

## One Click Marketing Foundation (Sprint 10, Requirement #3)

Hero Feature của PSH — hiện thực hoá đúng Philosophy "1 lần nhập dữ liệu → AI xử lý → Sinh nhiều đầu ra → Review → Publish" thành 1 module cụ thể. **Chỉ là Foundation** — Card Wizard + Review Screen, KHÔNG gọi AI Provider, KHÔNG Generate thật:

```
Founder → admin/ai/one-click-marketing.html (js/admin-one-click-marketing.js)
       → Card Wizard 5 bước:
            Bước 1: Business   (prefill SiteContentDB.settings — KHÔNG chọn nhiều doanh nghiệp)
            Bước 2: Product    (chọn DB.getAll() có sẵn hoặc nhập tay + MediaLibraryPicker cho ảnh)
            Bước 3: Marketing Goal (Khuyến mãi)
            Bước 4: Review     (xem lại input)
            Bước 5: Generate Marketing Package
                 → OneClickMarketing.buildMarketingPackage(input) (js/one-click-marketing.js — hàm THUẦN, không AI)
       → Review Center: Doanh nghiệp/Sản phẩm/Giá/Khuyến mãi + 6 output (Website Draft/
                 Facebook Draft/SEO Metadata/Banner Request/Image Request/Video Request)
       → Edit (quay về Bước 4 "Xem lại", KHÔNG phải Bước 1 — xem Requirement #4) / Generate (hiển thị rõ: CHƯA kết nối AI thật — Foundation only)
```

### Card Wizard Experience & Review Center (Sprint 10, Requirement #4)

Hoàn thiện UX — CHỈ Experience Layer, không đổi số bước/cấu trúc Workflow 5 bước, không mở rộng AI:

- **Progress Indicator có thể bấm trực tiếp**: các bước ĐÃ ĐI QUA (`i <= currentStep`) hiển thị dạng nút bấm được (`.ocmStepBadge`) thay vì nhãn tĩnh — nhảy thẳng tới bước đã qua mà không cần bấm "TRƯỚC" nhiều lần. Bước 5 "Gói Marketing" chỉ bấm được sau khi đã Generate ít nhất 1 lần (`packageResult` tồn tại), tránh nhảy tới màn hình trống.
- **"SỬA LẠI" (Edit) nhảy về Bước 4 "Xem lại"** thay vì Bước 1 — sửa 1 "thao tác thừa" phát hiện qua kiểm thử click-through thật của Requirement #3 (trước đây phải bấm "TIẾP THEO" 3 lần để quay lại Review Center dù chỉ sửa 1 chi tiết nhỏ). Vẫn còn nút "TRƯỚC" từ Bước 4 nếu Founder cần lùi xa hơn.
- **Review Center đổi tên hiển thị khớp đúng thuật ngữ đã giao** ("Website Draft"/"Facebook Draft"/"Image Request"/"Video Request" — chỉ đổi nhãn hiển thị trong `js/admin-one-click-marketing.js`, KHÔNG đổi tên field bên trong `OneClickMarketing.buildMarketingPackage()` đã kiểm thử ở Requirement #3), sắp lại thứ tự tóm tắt Doanh nghiệp → Sản phẩm → Giá → Khuyến mãi.
- **Ước tính thời gian hoàn thành ("≤ 2 phút")**: đường đi nhanh nhất (chọn sản phẩm có sẵn) = 5 lượt bấm + 1 đoạn gõ ngắn, không có bước nào bắt nhập lại dữ liệu đã có — không phát hiện "thao tác thừa" nào khác ngoài 2 điểm đã sửa ở trên.

- **Module hoàn toàn độc lập với AI Framework** — `js/one-click-marketing.js` không import/gọi `AIModuleRegistry`/`PluginManager`/`AIProviderRegistry`/`AIJobQueue`/`AITaskRouter` — không tạo Job, không qua Queue, không gọi OpenAI. Đây là điểm khác biệt cốt lõi với mọi Plugin AI đã có (Sprint 3/5/6): Marketing Package là TEMPLATE ghép trực tiếp từ input người dùng nhập, không phải nội dung AI sinh ra.
- **Không đổi Database Structure**: không thêm Field/Collection Firebase nào — Wizard đọc dữ liệu qua `DB.getAll()`/`CategoryDB.getAll()`/`SiteContentDB.get()` đã có (Sprint 1/2), chọn ảnh qua `MediaLibraryPicker.mount()` đã có (Sprint 8). "Lưu nháp" dùng `localStorage`, không ghi Firebase — cùng nguyên tắc Workflow Automation (Sprint 7 #4) không lưu định nghĩa Workflow vào Firebase.
- **"Business" ở Bước 1 không phải Multi-tenant thật** — Business Manager (Sprint 10 Requirement #1) mới là Foundation (audit + Decision Record, chưa có nhiều doanh nghiệp thật) — Bước 1 chỉ xác nhận/ghi đè thông tin doanh nghiệp hiện có, không phải bộ chọn doanh nghiệp.
- **Minh bạch tuyệt đối về giới hạn Foundation**: nút "GENERATE" trên Review Screen không gọi bất kỳ API/mạng nào — chỉ hiển thị thông báo rõ ràng rằng AI Generation thật chưa được kết nối, đúng Objective "Chưa triển khai AI Generation thật. Chỉ xây dựng Workflow và Experience Layer" và Testing Constraint "Không tuyên bố AI PASS nếu chưa Generate thật".
- **Có thể mở rộng thành Generate thật ở Requirement sau** (kết nối `buildMarketingPackage()`'s 6 output thành input cho Workflow Automation/Plugin thật tương ứng — Banner Generator/Facebook Post Generator/SEO Generator/Blog Writer) — chưa quyết định thiết kế cụ thể, để ngỏ cho Requirement riêng.

## Founder Agent V5 (Sprint 13) — Final Polish

Requirement CUỐI CÙNG của chuỗi Founder Agent trong Sprint 13 (sau V5 KHÔNG tạo V6 — Founder thực hiện 1 Acceptance Test DUY NHẤT gộp V1→V5 + toàn bộ CMS, xem ROADMAP). Mở rộng THÊM vào Execution Plan đã có (`js/admin-agent.js`) — 0 file/collection Firebase mới.

### SMART BACKGROUND — tự động phát hiện + xóa phông trắng

`detectWhiteBackground(imageUrl)` (mới) lấy mẫu màu 6 điểm (4 góc + 2 điểm giữa cạnh) qua Canvas API trình duyệt CÓ SẴN — 100% client-side, KHÔNG gọi Cloud Function/API trả phí nào cho bước PHÁT HIỆN. Chỉ khi phát hiện nền trắng rõ ràng (≥5/6 mẫu RGB > 235) mới gọi bước XÓA PHÔNG thật, tái sử dụng NGUYÊN VẸN Cloud Function `remove_background` đã có qua hàm mới trích xuất `AdminBgRemover.removeBackgroundUrl(imageUrl)` (`js/admin-bg-remover.js` — logic gọi API tách ra khỏi `run()` để dùng chung được cho cả UI panel cũ VÀ bước Founder Agent mới, 0 trùng lặp code gọi API). Bước `smart-background` trong Execution Plan: không có ảnh → bỏ qua; không phải nền trắng → giữ nguyên, báo rõ lý do; xóa phông thất bại (lỗi Provider/Cloud Function) → báo lỗi thật, giữ nguyên ảnh gốc, KHÔNG chặn phần còn lại của Plan. Ảnh gốc luôn được snapshot (`step._previousImages`/`step._previousImage`) để "Hoàn tác bước cuối" khôi phục đúng — không phải AI sinh ra nên phải giữ lại được.

### CẬP NHẬT X / XUẤT BẢN X — 2 lệnh hội thoại mới

Planner `systemPrompt` thêm 2 quy tắc: "Cập nhật X" (Sản phẩm ĐÃ CÓ) → chỉ chạy lại `product-description-writer`+`seo`, KHÔNG chạy lại `check-duplicate`/`create-product`. "Xuất bản X" → KHÔNG BAO GIỜ tự Publish — chỉ điều hướng tới đúng Draft (`open-draft`) hoặc Sản phẩm (`open-product`) để Founder tự bấm Xuất bản/Lưu — giữ đúng nguyên tắc xuyên suốt "Agent operates the existing CMS, never bypasses Founder's final action".

### FINAL REVIEW — Quality Score 11 hạng mục + Internal Links

`quality-score` (V4.1: 9 hạng mục) nay tính ĐÚNG 11 hạng mục Requirement V5 liệt kê: Product/SEO/Categories/**Featured Image**/**Gallery** (tách riêng khỏi "Images" gộp cũ)/**Background** (đạt khi bước `smart-background` ĐÃ CHẠY, dù áp dụng xóa phông hay xác nhận không cần — nghĩa là ảnh ĐÃ được xem xét)/Video/Files/Blog/Facebook/Banner — tổng vẫn 100 điểm (trọng số: 10+12+12+10+6+10+6+4+10+10+10). "Internal Links" là chỉ số THÔNG TIN riêng (`hasInternalLinks` — có ít nhất 1 trong Blog/Facebook/Banner), KHÔNG cộng điểm (tránh tính trùng 2 lần với Blog/Facebook/Banner đã có). `missing-info-report` thêm dòng "Missing Background" khi bước `smart-background` chưa chạy trong Plan.

### CATEGORY DESIGN — style "Technology"

`js/ai/modules/image-generator.js`: thêm `'Technology'` vào `style` field (Dark/Minimal/Studio/Technology/Luxury — đúng danh sách Requirement liệt kê), nối vào `STYLE_DIRECTION` map — không thay 7 `imageType`/6 style gốc.

### FOUNDATION FOR FUTURE — EXTERNAL_PROVIDERS stub

`EXTERNAL_PROVIDERS` (mới, `js/admin-agent.js`) — 4 điểm mở rộng đã chuẩn bị sẵn cho tương lai (Web Search/YouTube/Official Document/Background Provider), MỖI cái `configured:false`. `send()` nhận diện đúng từ khóa (vd "tìm trên internet", "tìm video youtube") TRƯỚC KHI chuyển cho Planner — trả lời trung thực "Provider Not Configured", không lặng lẽ bỏ qua/không để Planner tự bịa — cùng nguyên tắc `internetBackgroundStub()` đã dùng ở Category Cover.

### Không xây dựng (quyết định phạm vi có chủ đích, không phải thiếu sót)

Không xây Live Preview riêng cho Product Background (như Category Cover đã có) — `Product.backgroundImage` hiện chưa có nơi hiển thị công khai nào tiêu thụ field này (Product Detail page không dùng Cover kiểu Category Header), nên thêm Live Preview lúc này sẽ là UI không có tác dụng thật. Google Trend/tồn kho AI dự đoán không nằm trong Requirement V5.

**0 sửa đổi**: Plugin Framework/Queue/Provider Manager/Draft System, `js/ai/job-queue.js`, Category Cover (V4), toàn bộ 9 trang CMS Admin khác.

Kiểm thử: Node `vm` mã nguồn thật, 33 assertions (Smart Background cả 4 nhánh phát hiện-áp dụng/không-phải-nền-trắng/không-có-ảnh/lỗi-Cloud-Function, Hoàn tác Smart Background khôi phục đúng ảnh gốc, Quality Score 11 hạng mục đúng 84/100 cho 1 kịch bản đủ dữ kiện, Missing Background xuất hiện/biến mất đúng điều kiện, "Cập nhật X" không chạy lại check-duplicate/create-product, "Xuất bản X" chỉ điều hướng không tự Publish, EXTERNAL_PROVIDERS chặn đúng 3 từ khóa TRƯỚC Planner, style "Technology" không phá 7 style gốc) + 3 kịch bản V1-V2 chạy lại (open-product/update-product-field/2-bước Blog+Facebook) xác nhận 0 regression. Preview thật (static server nội bộ) xác nhận `admin/ai/agent.html` tải đúng, không lỗi JS mới ngoài `permission_denied` tiêu chuẩn trước đăng nhập.

## Product Image Presentation — Category Cover (Sprint 13)

Requirement độc lập với Founder Agent (Product/Category Management, không phải AI Agent) — triển khai TRƯỚC KHI Founder Agent V4 được xác nhận PASS (Chief Architect chủ động yêu cầu bỏ qua "One Requirement in flight", xem ROADMAP).

### Reuse — không xây lại gì đã có

Trước khi code, đã khảo sát toàn bộ hạ tầng liên quan (không lặp lại business logic):
- **Xóa phông ảnh** — `AdminBgRemover.mount(containerId, opts)` (`js/admin-bg-remover.js`) + Cloud Function `openaiProxy` action `remove_background` (GPT-4o Vision + DALL-E 3) ĐÃ CÓ SẴN, đã gắn vào form Sản phẩm từ trước — Category Cover TÁI SỬ DỤNG y hệt, không viết logic xóa phông mới.
- **Ảnh nền Danh mục** — field `Category.backgroundImage` + `MediaLibraryPicker.renderSlot({wide:true})` + `category.js updateCategoryHeader()` ĐÃ CÓ SẴN từ Sprint 13 trước — Category Cover MỞ RỘNG thêm layer, không thay thế.
- **Chọn/Tải ảnh** — `MediaLibraryPicker` (mount/renderSlot/openModal) dùng NGUYÊN VẸN cho Ảnh sản phẩm đại diện + Logo.

### Category Cover — layer mới chồng lên Ảnh nền đã có

7 field mới ghi thẳng vào record Category có sẵn qua ĐÚNG `CategoryDB.update()` (0 collection Firebase mới): `coverProductImage`, `coverLogo`, `coverPosition` (9 điểm, cùng cơ chế `data-attribute` + CSS attribute selector Hero Slideshow đã dùng cho `data-text-pos`), `coverZoom`, `coverOpacity`, `coverBlur`, `coverOverlay`. Founder KHÔNG bắt buộc dùng — để trống `coverProductImage` = chỉ hiện Ảnh nền như cũ (0 regression cho toàn bộ Danh mục hiện có).

**Admin** (`admin/categories.html` + `js/admin-categories.js`): mỗi Danh mục có thêm khối "CATEGORY COVER" — Live Preview (Desktop/Tablet/Mobile, đổi khung xem tức thời qua `setPreviewViewport()`, không ghi Firebase) cập nhật NGAY khi đổi Ảnh nền/Ảnh sản phẩm/Zoom/Opacity/Blur/Overlay (`updateCoverPreview()`/`setCoverField()` chỉnh DOM trực tiếp, không `render()` lại toàn bộ danh sách — tránh giật/mất focus slider). Nút "✂ Xóa phông ảnh sản phẩm" mount `AdminBgRemover` ngay trong hàng Danh mục. "🌐 Ảnh nền từ Internet" hiện đúng `"Provider Not Configured"` — Requirement tự nêu rõ "Do NOT require external APIs in this Requirement", không giả vờ có provider thật.

**Public** (`category.html` + `js/category.js`): `#categoryHeader` tách thành 3 lớp — `#categoryHeaderBg` (Ảnh nền, nhận `filter:blur()`), `::before` (gradient overlay có sẵn, nhận `opacity` điều chỉnh qua CSS var `--cover-overlay`), `#categoryHeaderProductImg`/`#categoryHeaderLogo` (layer mới, `object-fit:contain`, không bao giờ méo/tràn khung — cùng quy ước `.prod-img-wrap`/`.bg-remover-img-fit` đã có). Đã xác nhận `.category-header` còn dùng chung ở `blog.html`/`blog-post.html`/`videos.html` — cả 3 trang này KHÔNG set ảnh nền qua JS, chỉ dùng `background:#111` mặc định, nên việc tách `background` sang layer con mới KHÔNG ảnh hưởng gì (verify bằng grep + đọc trực tiếp 3 file trước khi sửa CSS).

### AI Generated Background — mở rộng Image AI, không Plugin mới

`js/ai/modules/image-generator.js` thêm 2 `imageType` (`Category Background Image`/`Product Background Image`, cố tình mô tả "negative space reserved for product overlay, no visible product in frame" vì Founder tự chồng ảnh sản phẩm thật lên SAU) + 1 field `style` tùy chọn (Studio/Lifestyle/Dark/Light/Luxury/Minimal, nối thêm vào `direction` gốc trong `buildPrompt()`, không thay thế). Ảnh sinh ra lưu Storage như mọi Draft Image AI khác — vì `MediaLibrary.list()` quét TOÀN BỘ bucket (không giới hạn thư mục `media/`), ảnh AI tự động xuất hiện trong "Chọn ảnh" ở MỌI nơi dùng `MediaLibraryPicker`, KỂ CẢ 2 slot Category Cover mới — 0 code nối dây riêng cần thiết giữa Image AI Studio và Category Cover.

**0 sửa đổi**: `js/admin-bg-remover.js`, Cloud Function `openaiProxy` (`remove_background`/`generate_image` không đổi), `MediaLibraryPicker`, 7 `imageType` gốc của Image AI, Plugin Framework/Queue/Draft System.

Kiểm thử: Node `vm` mã nguồn thật, 47 assertions (Live Preview cập nhật tức thời khi đổi Ảnh nền/Zoom/Opacity/Blur/Overlay/Position, tích hợp Xóa phông vào luồng chọn Ảnh sản phẩm đại diện, `save()` ghi đúng 7 field mới dạng Number không phải String, `resetCover()` trả về đúng mặc định, Internet Background hiện đúng "Provider Not Configured", public rendering ẩn Ảnh sản phẩm/Logo khi Danh mục chưa dùng Cover (0 regression), 2 `imageType` mới + `style` field không phá 7 `imageType` gốc, `buildPrompt()` nối đúng style/không bịa style khi chọn "Mặc định"). Preview thật (static server nội bộ) xác nhận cả `category.html` (public) lẫn `admin/categories.html` tải đúng, không lỗi JS mới ngoài `permission_denied` tiêu chuẩn.

## Founder Agent V4.1 (Sprint 13) — Workflow (Conversation/Self-Check/Undo/Resume/History)

Mở rộng THÊM vào V4 (Complete Product Creation) trong CÙNG Requirement — Founder yêu cầu Agent trở thành 1 "Workflow Executor" thật: hỏi-đáp khi thiếu thông tin (không lập lại từ đầu), tự xác nhận Draft THẬT SỰ đã tạo trước khi báo Hoàn tất, Dashboard tổng hợp cuối Plan, Hoàn tác, Lưu/Tiếp tục Plan dang dở, Lịch sử Workflow.

### Root Cause đã sửa trong lượt này — "Founder Agent finishes but no Draft is created"

Đây chính là quy trình xử lý regression Founder báo trước đó (xem CHANGELOG mục "Fix: Founder Agent user.getIdToken..." — KHÔNG PHẢI bug đó, đây là 1 bug THẬT KHÁC được phát hiện trong lúc điều tra: `AIJobQueue.resume()` (`js/ai/job-queue.js`) không bao giờ `throw` dù `processItem()` bên trong thất bại (Provider chưa cấu hình/lỗi API/rate limit) — job/item tự chuyển `status:'failed'`, ghi `LogDB`, rồi RESOLVE bình thường. `executeStep()` (`js/admin-agent.js`) trước đây coi "không throw" = "đã có Draft" — SAI. **SELF CHECK** mới: `runOnce()` tự xác nhận có 1 Draft THẬT `status:'draft'`, ĐÚNG `moduleId` (tránh nhận nhầm Draft của bước khác), `createdAt >= startedAt` của CHÍNH lượt chạy này — nếu không có, tự động THỬ LẠI đúng 1 lần trước khi báo `'failed'` thật kèm hướng dẫn kiểm tra "Plugin AI (Thủ công) > Nhật ký". **0 sửa đổi** `js/ai/job-queue.js`/`PluginManager`/Provider Framework — sửa đúng 1 chỗ duy nhất ở tầng gọi (Founder Agent), đúng "Do NOT redesign Queue".

### CONVERSATION WORKFLOW — hỏi-đáp không lập lại từ đầu

`pendingClarification` (module-level) giữ yêu cầu GỐC khi Planner trả về `steps:[]` (không đủ thông tin). Tin nhắn TIẾP THEO của Founder được GHÉP với yêu cầu gốc (`originalText + '. ' + reply`) thành 1 yêu cầu ĐẦY ĐỦ gửi lại Planner — không tạo cơ chế "slot-filling" phức tạp mới, tái dùng NGUYÊN VẸN `buildPlan()` đã có. Nếu vẫn thiếu, `pendingClarification` tiếp tục giữ (đã gộp thêm), câu hỏi tự nhiên đổi khác mỗi lần (không hỏi lặp y hệt).

### FOUNDER REVIEW DASHBOARD + PRODUCT COMPLETENESS + MISSING ITEMS

`renderReport()` phân nhánh: Plan có bước `quality-score`/`missing-info-report` (Complete Product Creation) → Dashboard đầy đủ (Completed/Failed/Skipped, Quality Score, Missing, Warnings, nút Mở Sản phẩm/Mở Product AI Draft/Mở Blog Draft/Mở Facebook Draft/Mở Banner Draft/Tiếp tục mục còn thiếu/Hoàn tất) — Plan V1-V3 đơn giản GIỮ NGUYÊN báo cáo gọn cũ, 0 thay đổi hành vi.

`quality-score` nay tính ĐÚNG 9 hạng mục Requirement liệt kê (Product/SEO/Category/Images/Video/Files/Blog/Facebook/Banner, tổng 100 điểm) — Blog/Facebook/Banner tính "đạt" dựa vào chính kết quả SELF CHECK (bước đó Completed VÀ có draftId thật, không suy đoán).

`missing-info-report` tách riêng từng dòng ĐÚNG tên Requirement liệt kê (Missing Images/Missing Gallery/Missing PDF/Missing Firmware/Missing Driver/Missing Video/Missing Warranty) — PDF/Firmware/Driver LUÔN xuất hiện (hệ thống chưa có field/hạ tầng đính kèm file cho Sản phẩm — kiến trúc, không phải lỗi từng sản phẩm).

### UNDO LAST STEP

`undoLastStep(msgId)` tìm bước Hoàn tất GẦN NHẤT theo THỨ TỰ Plan (không phải thời gian bấm) — "Rollback only the previous step":
- Bước tạo Draft (Product/SEO/Blog/Facebook/Banner/Image AI): tái dùng ĐÚNG `AdminAI.rejectDraftById()` đã có (giữ lại để tra cứu, không xoá — cùng hành vi nút "TỪ CHỐI").
- `detect-category` (đã tự gán): `step._previousCategoryIds` (snapshot lưu lúc gán) ghi lại qua ĐÚNG `DB.update()`.
- `create-product`: XOÁ THẬT qua ĐÚNG `DB.remove()` — CHỈ cho phép khi đây là bước hoàn tất DUY NHẤT (chưa bước nào SAU nó hoàn tất), LUÔN `confirm()` trước — hành động phá huỷ duy nhất trong Founder Agent.
- Còn lại (check-duplicate/related-products/quality-score/missing-info-report/điều hướng): không ghi gì thật, chỉ đặt lại Chờ chạy.

Gõ "undo last step"/"hoàn tác bước trước" trong ô chat cũng gọi đúng hàm này (nhắm vào tin nhắn Agent gần nhất có Plan).

### RESUME WORKFLOW / AUTO SAVE (localStorage)

`saveWorkflowSnapshot()` chạy sau MỖI lần `renderMessages()` (= sau mỗi bước thay đổi trạng thái) — lưu tin nhắn Agent GẦN NHẤT còn dang dở (chưa `allDone`, chưa `finished`) vào `localStorage` (key `pshopFounderAgentWorkflowSnapshot`) — cùng cơ chế/giới hạn UI Mode toggle ở `js/admin-auth.js` (KHÔNG ghi Firebase, per-browser, không theo tài khoản). `tryOfferResume()` chạy lúc `init()` — nếu có snapshot, hiện "Tiếp tục kế hoạch trước đó?" kèm nút Tiếp tục (`resumeWorkflow()`, khôi phục NGUYÊN VẸN toàn bộ Plan) / Bỏ qua (`discardWorkflow()`).

### WORKFLOW HISTORY

`WorkflowDB` (`js/ai/ai-db.js`) — `makeListDB('founderAgentWorkflows', [])`, tái dùng ĐÚNG factory CRUD đã có (0 logic mới). **Cần Chief Architect tự deploy** rule `founderAgentWorkflows` mới trong `database.rules.json` (đã thêm vào repo, cùng mẫu quyền `aiJobs`/`aiDrafts` — admin/editor đọc-ghi) — cho tới lúc deploy, `recordWorkflowHistory()`/`showHistory()` tự bắt lỗi `permission_denied` và báo rõ, KHÔNG chặn phần còn lại của Founder Agent. `recordWorkflowHistory()` trả về `Promise<boolean>` — CHỈ khoá `m._historyRecorded = true` khi ghi THÀNH CÔNG THẬT (tránh mất vĩnh viễn cơ hội ghi lại nếu Rules chưa deploy lúc Plan hoàn tất). Ghi tự động khi Plan `allDone`, hoặc khi Founder bấm "Hoàn tất" trên Dashboard. Gõ "lịch sử"/"workflow history" hiện tối đa 10 bản ghi gần nhất kèm link Sản phẩm.

**0 sửa đổi**: Product/Blog/Facebook/Banner/Image AI, Queue/Provider/PermissionService/Publish Pipeline, `js/ai/job-queue.js` (chỉ SELF CHECK ở tầng gọi, không sửa Queue).

Kiểm thử: Node `vm` mã nguồn thật, 53 assertions (SELF CHECK cả 2 nhánh Retry-thành-công/Thất bại-thật-2-lần, Conversation Workflow gộp yêu cầu, Dashboard/Quality Score 70 điểm đúng breakdown/Missing Items đủ 7 dòng literal, Undo 3 mắt xích Draft→Category→create-product kèm chặn xoá khi có bước sau đã hoàn tất, Workflow History cả 2 trạng thái Rules chưa/đã deploy, Resume Workflow qua 1 phiên `vm` MỚI mô phỏng tải lại trang) + 5 kịch bản V1-V3 chạy lại (open-product/update-product-field/open-draft/navigate/2-bước Blog+Facebook) xác nhận 0 regression. Preview thật (static server nội bộ) xác nhận trang tải đúng, không lỗi JS mới ngoài `permission_denied` tiêu chuẩn trước đăng nhập.

## Founder Agent V4 (Sprint 13) — Complete Product Creation

V1-V3 chạy 1 công cụ/nhiều công cụ/vận hành CMS. V4 thêm khả năng tạo 1 Sản phẩm GẦN NHƯ ĐẦY ĐỦ chỉ từ 1 dòng gợi ý ("Tạo sản phẩm Pioneer XDJ-RX3") — nghiên cứu tên/thương hiệu, kiểm tra trùng lặp, tự gán Danh mục, viết nội dung (tái dùng Product AI), gợi ý Sản phẩm liên quan, tính Điểm chất lượng, báo cáo thông tin còn thiếu — cộng khả năng đính kèm ảnh/file/Micro ngay tại ô nhập.

### Quyết định phạm vi — đã xác nhận với Chief Architect TRƯỚC KHI code

Requirement gốc yêu cầu "Internet Research" (nguồn: Official Manufacturer/Official Product Page/Documentation/Spec Sheet/YouTube), tự thu thập Ảnh/Video/Manual/Firmware/Driver CHÍNH HÃNG. Hệ thống này **không có** hạ tầng duyệt Internet thật (không Search API, không scraping, không YouTube Data API) — `openaiProxy` chỉ gọi chat completion thuần, không có tool browsing. Xây dựng các khả năng này cần tích hợp API bên thứ ba MỚI (chi phí thật + tài khoản mới) — đúng loại quyết định "chỉ Chief Architect quyết định được" (tiền lệ: Facebook App ID/Secret, Image AI chi phí DALL-E 3).

Đã hỏi Chief Architect qua `AskUserQuestion` trước khi code — chọn phương án: **"Scope V4 to what's honestly buildable now"**. Kết quả: V4 KHÔNG tự thu thập Ảnh/Video/Manual chính hãng thật (sẽ luôn hiện trong "Báo cáo thiếu thông tin", đúng thực tế, không giả) — thay vào đó triển khai đầy đủ mọi phần KHÔNG cần hạ tầng mới: Category Auto-Detection/Duplicate Detection/Smart Brand Resolution (AI đề xuất, LUÔN gắn nhãn "chưa xác minh")/AI content (tái dùng Product AI)/Quality Score/Related Products/Auto Links (đã có từ V2)/Founder Agent Input upgrades (ảnh/file/Micro — không cần hạ tầng trả phí mới).

### 6 tool mới — `js/admin-agent.js`

- **research-product** — "Smart Brand Detection". CHỈ 1 lượt gọi GPT-4o-mini dựa trên kiến thức đã học (KHÔNG duyệt Internet) để đoán Tên đầy đủ/Thương hiệu/Model từ gợi ý ngắn (vd "RX3"). Kết quả LUÔN hiển thị kèm nhãn "🔎 AI đề xuất (chưa xác minh nguồn chính hãng)" — không bao giờ tự nhận là đã tra cứu nguồn thật. Nghiêm cấm bịa thông số kỹ thuật ở bước này (chỉ Tên/Thương hiệu/Model).
- **check-duplicate** — so khớp Tên/SKU/Model/Slug (chuẩn hoá bỏ dấu/khoảng trắng) với `products[]` đã tải, 0 gọi AI. Tìm thấy trùng → status `duplicate-found`, PAUSE Plan, hiện 3 lựa chọn cho Founder: "📂 Mở Sản phẩm đã có" / "🆕 Tạo bản sao" / "✕ Hủy" (`openDuplicateProduct()`/`createDuplicateCopy()`/`cancelDuplicatePlan()`).
- **detect-category** — gọi GPT-4o-mini với ĐÚNG danh sách mã Danh mục đang Hoạt động (`active !== false`, không bao giờ gửi Danh mục Ẩn/đã xoá) + Tên/Thương hiệu/Model sản phẩm, yêu cầu trả về tối đa 3 gợi ý kèm % tin cậy + lý do. **>=90%**: tự ghi `categoryIds`/`category`/`categoryLabel` TRỰC TIẾP qua `DB.update()` (dữ liệu CẤU TRÚC — mã Danh mục đã tồn tại + validate, KHÔNG PHẢI "nội dung AI sinh ra", cùng logic ngoại lệ đã áp dụng cho `create-product` từ V1). **<90%**: status `category-review`, PAUSE Plan, hiện gợi ý + nút "✓ Xác nhận & Gán" (`confirmCategorySuggestions()`) / "⏭ Tự gán sau" (`skipCategorySuggestions()`). **Không có gợi ý nào**: hiện "Không tìm thấy Danh mục phù hợp." + link "Mở Quản lý Danh mục →" — KHÔNG BAO GIỜ tự tạo Danh mục mới.
- **related-products** — heuristic thuần JS (không gọi AI, tránh chi phí/rủi ro bịa đặt thừa): điểm = (số categoryIds chung × 2) + (1 nếu cùng brand), lấy top 5, loại chính nó.
- **quality-score** — tính điểm 0-100 từ 8 tiêu chí THẬT có trọng số (SEO 20/Thông số 15/Tính năng 10/FAQ 10/Danh mục 15/Hình ảnh 15/Video 10/Tài liệu 5) — đọc Draft thật của `product-description-writer` (`DraftDB.get()`) + field thật trên Product record, KHÔNG suy đoán. "Tài liệu (Manual/Firmware/Driver)" LUÔN 0 điểm — hệ thống chưa có field/hạ tầng đính kèm file cho Sản phẩm, phản ánh đúng thực tế thay vì báo điểm giả cao.
- **missing-info-report** — liệt kê cụ thể: thiếu Ảnh/Video/Manual-Firmware-Driver (LUÔN thiếu, ghi rõ lý do kiến trúc)/Bảo hành/SKU/Danh mục — không chặn Plan (chỉ thông tin, "Founder quyết định có tiếp tục hay không").

### Token `$research.name`/`$research.brand`/`$research.model`

Mở rộng cùng cơ chế `$product` (V2) — `resolveInputParams()` thay token bằng kết quả THẬT của bước `research-product` trong CÙNG Plan, chỉ khi bước đó đã Completed; nếu chưa, chặn chạy (trả `null`, không để lọt chuỗi token theo nghĩa đen vào `create-product`/`check-duplicate`).

### Đính kèm ảnh/file + Micro — `admin/ai/agent.html` + `js/admin-agent.js`

Tái dùng NGUYÊN VẸN hạ tầng Storage đã có — 0 logic Storage mới:
- **Đính kèm ảnh** (`attachImage()`) — mở `MediaLibraryPicker.openModal()` đã có (Sprint 8), ảnh vào chung thư mục `media/` — nếu Plan sau đó có bước `create-product`, ảnh THẬT này được gán làm `images[0]`/`image` (media thật do Founder cung cấp, không phải AI sinh — đúng "AI writes text only, code assembles real media").
- **Đính kèm file** (PDF...) — kéo-thả/dán/nút 📎 đều gọi chung `uploadAttachment()` → `StorageUpload.uploadImage(file, 'agent-files')` (tên hàm lịch sử, không giới hạn kiểu file — xem `js/storage-upload.js`). Hệ thống KHÔNG đọc được nội dung PDF/DOCX/XLSX/ZIP để trích xuất thông số (chưa có thư viện parse) — Agent nói rõ giới hạn này trong phản hồi, không giả vờ đã "đọc" file.
- **Microphone** (`toggleMic()`) — Web Speech API CÓ SẴN trong trình duyệt (`SpeechRecognition`/`webkitSpeechRecognition`), 100% client-side, 0 API key/chi phí mới. Không hỗ trợ → báo rõ, không im lặng.

`admin/ai/agent.html` thêm 3 script (`storage-upload.js`/`media-library.js`/`media-library-picker.js`, cùng thứ tự load `admin/products.html` đã dùng) — không có script Storage nào viết mới.

### "Tạo sản phẩm X đầy đủ" — Plan 13-14 bước (Founder Acceptance Test)

Planner (`buildPlan()`) được dạy thêm quy tắc thứ tự cố định: `research-product` (nếu tên có vẻ viết tắt) → `check-duplicate` → `create-product` → `detect-category` → `product-description-writer` → `seo` → `blog-writer` → `facebook-post-generator` → `banner-generator` → `image-generator` → `related-products` → `quality-score` → `missing-info-report` → `open-product` (bước cuối — Product Review tự động, đúng "Open Product Editor automatically"). 2 ví dụ few-shot mới khớp NGUYÊN VĂN Acceptance Test (tên đầy đủ + tên viết tắt).

**0 sửa đổi**: Product AI/Blog AI/Facebook AI/Banner AI/Image AI (Plugin Framework), Queue/Provider/PermissionService/Publish Pipeline, `js/admin-products.js`/`js/admin-social-center.js` (deep-link V3 giữ nguyên).

Kiểm thử: Node `vm` mã nguồn thật, 33 assertions mới (research-product/check-duplicate cả 2 nhánh Trùng lặp+Tạo bản sao/detect-category cả 3 nhánh Tự động+Chờ xác nhận+Không tìm thấy/never-assign-hidden-category/related-products/quality-score/missing-info-report/toàn bộ pipeline 13 bước/3 kịch bản Founder Agent Input: upload ảnh/upload PDF/Microphone) + 19 assertions test auth-fix chạy lại xác nhận 0 regression + 5 kịch bản V1-V3 chạy lại trong CHÍNH test V4 (Tool Router/Product Edit/Open Draft/Navigate) xác nhận 0 regression. Preview thật (static server nội bộ) xác nhận trang tải đúng, không lỗi JS mới ngoài `permission_denied` tiêu chuẩn trước đăng nhập.

## Founder Agent V3 (Sprint 13) — CMS Operator

V1 tạo Nháp qua Plugin. V2 lập Plan nhiều bước Plugin. V3 thêm 1 LOẠI BƯỚC MỚI hoàn toàn khác về bản chất: thay vì gọi Plugin sinh nội dung, bước "CMS Operator" **điều hướng trình duyệt** sang 1 trang CMS thật, mang theo dữ liệu qua query string, để trang đích tự mở đúng bản ghi/điền sẵn đúng field — tuyệt đối không tự ghi Firebase.

### Vì sao PHẢI điều hướng, không thể "vận hành" từ chính trang Agent

`admin/ai/agent.html` chỉ load các script cần cho Plugin Framework (Product/Blog/Facebook/Banner/Image AI + Queue/Draft) — nó KHÔNG load `js/admin-products.js`/form Sản phẩm thật, KHÔNG load `js/admin-social-center.js`/giao diện Draft thật. Không có cách nào "mở form Sản phẩm" MÀ KHÔNG điều hướng sang `admin/products.html` — đúng ý "Reuse: Existing forms. Existing pages." (không dựng lại form Sản phẩm bên trong trang Agent — sẽ là DUPLICATE Product logic, đúng điều cấm).

### Cơ chế truyền dữ liệu qua điều hướng — query string, đọc 1 lần lúc tải trang

4 tool mới (`open-product`/`update-product-field`/`open-draft`/`navigate`) trong `executeStep()` (`js/admin-agent.js`) đều kết thúc bằng chính xác 1 dòng `window.location.href = '<trang thật>?<param>'` — KHÔNG gọi `PermissionService`/`PluginManager`/`AIJobQueue`/`DraftDB.getAll()`... để tạo Job (không có generation nào xảy ra ở các bước này).

Trang đích đọc query param NGAY LÚC TẢI (không phải lúc nào khác):

```
admin/products.html?edit=<productId>                                    -> mở Sửa đúng sản phẩm
admin/products.html?edit=<productId>&field=<tên>&value=<giá trị mới>    -> mở Sửa + điền sẵn + đánh dấu 1 field
admin/social-media-center.html?highlight=<draftId>                      -> cuộn tới + đánh dấu đúng thẻ Draft
```

`js/admin-products.js` `applyDeepLink()` (gọi trong `.then()` của `loadProducts()`, SAU khi `products[]` đã tải xong — bắt buộc, vì cần list để xác nhận `editId` có thật) — gọi lại ĐÚNG `editProduct(id)` đã có (0 dòng logic mở form mới), sau đó NẾU có `field`/`value` thì set `document.getElementById(<field tương ứng>).value = value` + thêm class `.agent-field-highlight` — dừng lại ở đó, không có dòng nào gọi `DB.update()`/`saveProduct()`. Founder phải tự bấm nút "CẬP NHẬT SẢN PHẨM" thật (form validate/ghi dữ liệu y hệt khi Founder tự gõ tay, 0 đường tắt).

Cờ `deepLinkHandled` (module-level, khởi tạo `false`) đảm bảo chỉ áp dụng ĐÚNG 1 LẦN lúc tải trang — `loadProducts()` còn được gọi lại nhiều lần trong phiên làm việc (sau khi Founder Lưu/Xóa) và KHÔNG được tự mở lại form mỗi lần đó.

`js/admin-social-center.js` `applyDeepLink()` tương tự — gọi trong `.then()` của `Promise.all([loadProducts(), loadDrafts()])` ở `init()`, dùng `document.querySelectorAll('[data-draft-id]')` (thuộc tính đã có sẵn trên mỗi thẻ Draft từ trước, không thêm gì) để tìm đúng thẻ, KHÔNG tự bấm nút "Đăng lên Facebook"/"Publish Now" nào.

### Planner — dạy thêm 4 tool, cấm ghép chuỗi sau điều hướng

Vì điều hướng phá hủy hoàn toàn trạng thái JS của trang Agent hiện tại, `buildPlan()`'s system prompt dạy rõ: 4 tool CMS Operator LUÔN LÀ BƯỚC DUY NHẤT trong 1 Plan — không bao giờ xếp Plugin step nào SAU 1 bước điều hướng (sẽ không chạy được, trang đã đổi). Ví dụ few-shot khớp nguyên văn Requirement: "Mở RX3" → 1 bước `open-product`; "Đổi giá RX3 thành 48 triệu" → 1 bước `update-product-field` (Planner tự parse "48 triệu" thành chuỗi hiển thị "48.000.000 ₫" khớp format Product Editor đang dùng).

### "Viết Blog"/"Tạo Facebook" — không cần đổi gì, đã đúng từ V1/V2

2 ví dụ còn lại của Requirement KHÔNG cần năng lực CMS Operator — "Blog AI opens"/"Facebook Draft opens" nghĩa là 1 Draft mới được tạo xong và SẴN SÀNG MỞ (nút "Mở Nháp →" đã hiển thị) — đúng NGUYÊN VẸN hành vi Plugin/Queue/Draft đã có từ V1/V2, không đổi 1 dòng nào.

## Founder Agent V2 (Sprint 13) — Task Planner

V1 xử lý đúng 1 công cụ mỗi lệnh (Understand intent → Select Tool → Execute → Draft). V2 tổng quát hoá thành Task Planner: 1 lệnh có thể cần NHIỀU công cụ theo thứ tự — Agent xây 1 Execution Plan (mảng bước), Founder tự quyết định chạy. **Kiến trúc THAY THẾ hoàn toàn** luồng "1 công cụ" của V1 trong cùng file `js/admin-agent.js` — 1 lệnh chỉ cần 1 công cụ vẫn hoạt động, chỉ là Plan có ĐÚNG 1 phần tử (trường hợp thoái hoá của kiến trúc chung, không phải 2 đường code song song).

### Planner — GPT sinh MẢNG bước có thứ tự, không side-effect

`buildPlan(userText)` gọi GPT-4o-mini qua ĐÚNG Cloud Function `openaiProxy` đã có (giống hệt V1, không thêm Provider/API Key mới) — khác V1 ở chỗ prompt yêu cầu trả về `{"steps":[...]}` thay vì 1 object đơn. Prompt nhúng NGUYÊN VĂN 3 ví dụ few-shot khớp đúng 3 ví dụ trong Requirement (tạo sản phẩm mới → 7 bước; Blog+Facebook trên sản phẩm có sẵn → 2 bước; Banner+Image → 2 bước) để GPT tái tạo đúng format/thứ tự mong muốn. Planner THUẦN — không gọi Permission/PluginManager/Queue ở đây, đúng "The Agent itself never generates content. It only builds ... a plan" (phần "executes" tách hẳn sang `executeStep()`).

### Token `"$product"` — phụ thuộc giữa các bước trong CÙNG 1 Plan

Khi Plan có bước `create-product`, sản phẩm CHƯA TỒN TẠI tại thời điểm lập kế hoạch — Planner không thể biết ID thật trước. Mọi bước sau nhắm vào ĐÚNG sản phẩm đó dùng `productId:"$product"` (token, không phải ID giả). `resolveInputParams(step, allSteps)` thay token bằng ID thật NGAY TRƯỚC KHI chạy 1 bước — CHỈ khi tìm thấy bước `create-product` trong CÙNG mảng `steps` và `status === 'completed'`; nếu không, trả về `null` và bước đó chuyển `failed` với lý do rõ ràng ("Cần hoàn thành bước Tạo Sản phẩm mới trước"). Không bao giờ để chuỗi `"$product"` lọt xuống `plugin.execute()` theo nghĩa đen.

### Bước "SEO" — mốc hiển thị, không gọi Plugin thật

Ví dụ 7-bước liệt kê "SEO" tách biệt khỏi "Product AI", nhưng `product-description-writer` (Sprint 12 Requirement #1, Product AI V2) ĐÃ sinh đủ `seoTitle`/`metaDescription`/`seoKeywords`/`slug` trong CÙNG 1 lệnh gọi JSON — gọi `seo-generator` (Plugin SEO thật) thêm 1 lần nữa cho CÙNG sản phẩm sẽ tạo Draft trùng lặp và tốn thêm 1 lệnh gọi AI không cần thiết, ngược nguyên tắc "tránh gọi AI 2 lần" đã xác lập từ Sprint 12 Requirement #10 (nút "Generate Description"/"Generate SEO" trên `admin/products.html` CÙNG gọi 1 moduleId `product-description-writer`, chỉ khác Preview nhấn trường nào). `executeStep()` xử lý `tool === 'seo'` như 1 NGOẠI LỆ thứ 2 (cùng `create-product`) — không gọi `PermissionService`/`PluginManager`/Queue nào — chỉ tìm bước `product-description-writer` GẦN NHẤT phía trước trong CÙNG Plan, nếu đã `completed` thì tự đánh dấu `completed` (dùng lại `draftId` của bước đó), nếu chưa thì `failed` với lý do rõ ràng.

**Lưu ý kiến trúc quan trọng**: `seo-generator` (Plugin SEO thật, nhắm Blog Post) KHÔNG bị sửa/xóa — vẫn hoạt động bình thường ở "Trợ lý AI" và mọi nơi khác. Founder Agent V2 chỉ đơn giản KHÔNG gọi nó trong ngữ cảnh "SEO cho sản phẩm vừa tạo" (không có target hợp lệ — Plugin đó cần `postId` của 1 Blog Post ĐÃ PUBLISH, một Blog Draft vừa tạo trong CÙNG Plan chưa published nên không có ID thật để nhắm tới).

### Execution — mỗi bước vẫn đi ĐÚNG pipeline V1, không đổi

```
executeStep(msgId, i):
  create-product  -> DB.add({name, pubStatus:'draft'})              // không phải Plugin thật
  seo             -> tự Completed theo bước Product AI liền trước    // không phải Plugin thật
  <mọi tool khác> -> PermissionService.checkPluginExecution()
                  -> PluginManager.loadPlugin()
                  -> plugin.execute([inputParams])
                  -> AIJobQueue.resume()
                  -> DraftDB.getAll() (tìm Draft mới nhất)
```

`runAll(msgId)` lặp qua `steps[]` theo thứ tự, bỏ qua bước đã `completed`/`skipped`, gọi `executeStep()` cho từng bước còn lại — **DỪNG NGAY** (break loop) nếu 1 bước `failed`, đúng "Pause the plan... Do NOT continue blindly". Hàm idempotent — bấm "CHẠY TẤT CẢ" lần 2 (sau khi Retry 1 bước Failed) tự tiếp tục đúng từ bước còn Pending, không chạy lại bước đã Completed.

### Founder Controls — 5 hành động đúng yêu cầu

`runAll`/`runStep`/`skipStep`/`retryStep`/`cancelStep` (export qua `window.AdminAgent`). `cancelStep()` gọi thẳng `skipStep()` — cùng hiệu ứng cho 1 bước còn Pending (chuyển `skipped`, không chạy) — Queue hiện có (`js/ai/job-queue.js`) KHÔNG có cơ chế hủy 1 lệnh gọi mạng đang chạy giữa chừng, và thêm cơ chế đó là sửa Queue, ngoài phạm vi "Do NOT redesign... Queue" của Requirement.

### Report — tính trực tiếp từ `steps[]`, không lưu cờ riêng

`renderReport(m)` chạy MỖI LẦN render, tự tính Completed/Failed/Skipped count + danh sách link (Draft cho bước Plugin thật, Sản phẩm cho bước `create-product`) — chỉ hiện khi KHÔNG còn bước nào `pending`/`running` (mọi bước đã ở trạng thái cuối). Không thêm field/Database mới — dữ liệu Report hoàn toàn suy ra từ state trong bộ nhớ của trang (mất khi tải lại trang, đúng "Do NOT add Memory" — Founder Agent không lưu lại Plan qua các lần tải trang, chỉ Draft/Sản phẩm đã tạo mới lưu Firebase thật).

## Founder Agent V1 (Sprint 13) — Entry Point AI duy nhất, orchestrator thuần túy

Founder Agent (`admin/ai/agent.html` + `js/admin-agent.js`) là giao diện chat để Founder gõ yêu cầu tự do bằng tiếng Việt, Agent tự hiểu ý định → chọn công cụ → thực thi → hiển thị tiến trình → mở Nháp. Nguyên tắc kiến trúc tuyệt đối: **Agent CHỈ orchestrate, không bao giờ tự sinh nội dung** — mọi generation thật luôn đi qua đúng Plugin đã có, qua đúng Queue, tạo đúng Draft, theo đúng Publish Pipeline đã tồn tại.

### Quan hệ với "Trợ lý AI" (`admin/ai/assistant.html`) — 2 lớp router khác nhau, không trang nào bị sửa

Codebase đã có sẵn `AITaskRouter` (`js/ai/task-router.js`, Sprint 4) — router RULE-BASED khớp từ khóa cố định, cố tình KHÔNG gọi AI thật để phân loại ý định (ràng buộc kiến trúc của Sprint 4 lúc đó: "Requirement #8 cấm gọi OpenAI trực tiếp"). Router này phục vụ "Trợ lý AI" — 1 trang Experience Layer khác, đã có Conversation History/Ambiguous Target Resolution/Progress Tracking đầy đủ.

Founder Agent KHÔNG tái sử dụng `AITaskRouter` cho bước hiểu ý định — lý do: rule-based khớp từ khóa cố định KHÔNG thể phân biệt "Tạo sản phẩm Pioneer RX3" (ý định: tạo MỚI) với "Viết mô tả Pioneer RX3" (ý định: viết nội dung cho sản phẩm ĐÃ CÓ) — cả 2 câu đều chứa "Pioneer RX3" và không có route nào trong `AI_TASK_ROUTES` biểu diễn được ý định "tạo mới". Đây là năng lực MỚI Requirement này đòi hỏi (hiểu ngôn ngữ tự do linh hoạt hơn), không phải sao chép lại thứ đã có — Founder Agent dùng GPT-4o-mini làm Tool Router, gọi qua ĐÚNG Cloud Function `openaiProxy` đã có (action="generate", không thêm Provider/API Key/Cloud Function mới).

**Phần THỰC THI (sau khi đã chọn công cụ) tái sử dụng NGUYÊN VẸN — đây là phần quan trọng nhất của "reuse existing architecture", không có ngoại lệ**:

```
PermissionService.checkPluginExecution(uid, email, moduleId)
  → PluginManager.loadPlugin(moduleId)
  → plugin.execute([inputParams], uid, email)   // tạo Job, enqueue
  → AIJobQueue.resume(uid, email)                // chạy generation thật
  → DraftDB.getAll()                             // tìm Draft mới nhất vừa tạo
```

Đúng 5 bước, đúng thứ tự, đúng API công khai — giống hệt `AITaskRouter.dispatch()` đã làm cho "Trợ lý AI". Không plugin nào bị sửa, không Queue/Provider/Draft System/Publish Pipeline nào bị viết lại.

### "Tạo sản phẩm X" — trường hợp đặc biệt duy nhất, không qua Plugin/Queue

Không có Plugin nào "tạo sản phẩm mới" trong Plugin Framework hiện có (`product-description-writer` CHỈ viết mô tả cho sản phẩm đã tồn tại, nhận `productId` bắt buộc). Vì đây KHÔNG PHẢI hành động sinh nội dung bằng AI (không vi phạm "Never generate content directly" — Agent không viết bất kỳ câu chữ nào), Founder Agent xử lý ý định `create-product` bằng cách gọi thẳng `DB.add({ name, pubStatus: 'draft' })` — ĐÚNG cơ chế `js/admin-products.js` `saveProduct()` đã dùng khi tạo sản phẩm mới thủ công, `pubStatus:'draft'` khớp đúng quy ước "sản phẩm mới mặc định Nháp" đã có từ Sprint 12 Requirement #10. Founder Agent KHÔNG tự điền Mô tả/Giá/Danh mục/Ảnh — chỉ tạo dòng trống rồi trỏ Founder qua Product Editor thật (`/admin/products.html`) để tự điền tiếp, đúng luồng Mission "Tạo sản phẩm X → Open Product Assistant → Fill Product fields → Create Draft".

### Execution Timeline — 4 bước cố định, không ghi đè mất dấu vết

Mỗi tin nhắn phản hồi của Agent theo dõi `stepIndex` (0-3, ứng với `['Hiểu ý định', 'Chọn công cụ AI', 'Đang thực thi', 'Hoàn tất']`) + `stepState` (`'active'|'done'|'error'`) — luôn render ĐỦ 4 bước với dấu ✓/●/✕/○ tương ứng, khác với thiết kế ban đầu (1 chip trạng thái duy nhất bị ghi đè mỗi bước, mất hiển thị các bước trước đó). "Running Status" (chip trạng thái hiện tại) hiển thị TÁCH BIỆT bên dưới Timeline, đúng yêu cầu UI liệt kê cả 2 thành phần riêng.

## Hero Slideshow — Kéo thả di chuyển/xóa tiêu đề (Sprint 13, follow-up)

Nâng cấp trực tiếp mục "Hero Slideshow — Khung ảnh ngang + Vị trí chữ tiêu đề" bên dưới — Founder yêu cầu tương tác THẬT là kéo thả (không chỉ bấm chọn 1 trong 9 nút), và thêm khả năng xóa hẳn tiêu đề khỏi 1 Slide.

### Kéo thả — Pointer Events, snap vào lưới 9 điểm đã có

`js/admin-sliders.js` `startTitleDrag(e, i)` gắn vào `onpointerdown` của `.hero-mini-label` — dùng Pointer Events API (hợp nhất chuột/cảm ứng/bút, không cần thư viện ngoài). Trong lúc kéo (`pointermove`), tính toán ô gần nhất trong lưới 3×3 dựa trên `getBoundingClientRect()` của `.hero-mini-preview`, CHỈ cập nhật `style`/`class` TẠI CHỖ lên chính element đang kéo (`labelEl.setAttribute('style', POS_STYLE[code])` + toggle `.pos-dot-active`) — **không được gọi `setPos()`/`refreshPreview()` giữa chừng**, vì `refreshPreview()` rebuild toàn bộ `innerHTML` của `#preview-{i}`, phá hủy chính element đang được kéo (tham chiếu DOM cũ trở thành node đã tách rời, `getBoundingClientRect()` trả về rect rỗng, kéo tiếp sẽ sai hoàn toàn). Chỉ khi thả chuột (`pointerup`) mới gọi `setPos(i, lastCode)` — ĐÚNG 1 LẦN — để ghi thật vào `slides[]` và rebuild preview.

`POS_STYLE` (constant mới) map mỗi trong 9 mã vị trí sang `top/left/right/bottom` + `transform` tuyệt đối để đặt CHÍNH nhãn tiêu đề trong khung xem trước — khớp trực quan với cách `css/style.css` `.hero[data-text-pos]` định vị trên trang thật (không phải cùng 1 bộ rule CSS, nhưng cùng ý nghĩa hình học 9 điểm).

Lưới 9 nút bấm (`.pos-dot`) VẪN GIỮ NGUYÊN làm lối tắt — kéo thả và bấm dùng chung `setPos()`, không có 2 đường ghi dữ liệu khác nhau.

### Xóa tiêu đề — nút ✕ + sửa lỗi hiển thị trang công khai

Nút ✕ (`.hero-mini-label-del`) trên chính nhãn kéo thả gọi `deleteTitle(i)` — set `slides[i].title = ''`, xóa luôn ô nhập tiêu đề tương ứng (`#slideTitleInput-{i}`). Khung xem trước tự chuyển sang hiện gợi ý trống (`.hero-mini-label-empty`, không kéo được — không có gì để kéo) thay vì nhãn kéo được.

**Sửa lỗi thật phát hiện khi làm tính năng này**: `js/home.js` `updateHeroText()` trước đây `if (titleEl && slide.title) titleEl.textContent = slide.title;` — khi `slide.title` rỗng, dòng này chỉ BỎ QUA (không update), để lại `textContent` của Slide TRƯỚC ĐÓ còn hiển thị trên màn hình dù đã chuyển sang Slide có tiêu đề trống. Sửa thành luôn đồng bộ `titleEl.style.display` theo đúng trạng thái Slide hiện tại (`hasTitle ? '' : 'none'`) — "xóa tiêu đề" giờ thật sự ẩn khỏi trang công khai, không chỉ ẩn khỏi Admin. 0 regression cho mọi Slide có tiêu đề (hành vi giống hệt trước).

## Hero Slideshow — Khung ảnh ngang + Vị trí chữ tiêu đề (Sprint 13)

Trang Quản lý Slider (`admin/sliders.html` + `js/admin-sliders.js`) quản lý node `siteContent.heroSlides` — cùng dữ liệu trang chủ (`index.html`/`js/home.js`) đọc để render Hero Slideshow. Founder báo 2 vấn đề thật: ô chọn ảnh dùng chung khung vuông nhỏ với mọi nơi khác trong CMS (không đúng tỉ lệ banner ngang thật), và không có cách nào di chuyển vị trí chữ tiêu đề.

### Khung ảnh ngang — `opts.wide`, chỉ Slider dùng

`js/media-library-picker.js` `slotHtml()` thêm nhánh `opts.wide` — gắn thêm class `medialib-slot-thumb-wide` (220×124px, tỉ lệ ~16:9) lên khung xem trước ảnh, thay cho khung vuông mặc định `medialib-slot-thumb` (96×96px) dùng chung mọi nơi khác (Product/Blog/Banner/Category). **Opt-in tuyệt đối** — chỉ `js/admin-sliders.js` truyền `{ wide: true }`, mọi lời gọi `renderSlot()`/`mount()`/`mountMulti()` khác không đổi, 0 regression.

### Vị trí chữ tiêu đề — lưới 9 điểm bấm trên ảnh xem trước thật

Mỗi phần tử `heroSlides[]` thêm field `position` (1 trong 9 giá trị: `top-left`/`top-center`/`top-right`/`middle-left`/`middle-center`/`middle-right`/`bottom-left`/`bottom-center`/`bottom-right`; mặc định/không có field = `bottom-left`, khớp đúng vị trí cố định trước đây — Slide cũ không cần migration).

Thay vì 1 `<select>` chọn vị trí bằng chữ, `admin-sliders.js` render 1 khung xem trước mini (`miniPreview()`, class `.hero-mini-preview`, tỉ lệ 16:9, nền = chính ảnh Slide) phủ lưới 9 nút `.pos-dot` — Founder bấm trực tiếp vào điểm muốn đặt chữ trên ẢNH THẬT, trực quan hơn hẳn chọn text trong dropdown. `refreshPreview(i)` patch lại đúng `#preview-{i}` tại chỗ (không rebuild toàn bộ `#slideList`) mỗi khi ảnh/tiêu đề/vị trí đổi — tránh mất focus ô đang gõ dở. Có mặt ở CẢ `addSlide()` (Slide mới, mặc định `position:'bottom-left'`) LẪN sửa Slide có sẵn — dùng chung đúng 1 hàm `miniPreview()`, không có 2 đường code riêng biệt.

### Áp dụng vị trí lên trang công khai — CSS attribute selector, mặc định không có rule

`js/home.js` `updateHeroText(index)` — mỗi khi chuyển Slide (kể cả Slide đầu tiên khi tải trang), ghi `document.getElementById('heroSection').dataset.textPos = slide.position || 'bottom-left'`. `css/style.css` thêm 6 rule dùng CSS attribute selector (`^=`/`$=`) áp `align-items` (dọc)/`text-align`+`margin` (ngang) tương ứng lên `.hero`/`.container`/`h1`/`.hero-sub`/`.hero-btns`:

```css
.hero[data-text-pos^="top-"]{align-items:flex-start}
.hero[data-text-pos^="middle-"]{align-items:center}
.hero[data-text-pos$="-center"] .container{margin-left:auto;margin-right:auto;text-align:center}
.hero[data-text-pos$="-center"] .hero-btns{justify-content:center}
.hero[data-text-pos$="-right"] .container{margin-left:auto;margin-right:0;text-align:right}
.hero[data-text-pos$="-right"] .hero-btns{justify-content:flex-end}
```

`bottom-left` (mặc định) **KHÔNG có rule riêng nào** — CSS gốc của `.hero` (`align-items:flex-end`, `.container` căn trái tự nhiên) đã đúng, đảm bảo mọi Slide chưa từng chạm vào tính năng này (toàn bộ Slide thật hiện có) hiển thị giống hệt trước, 0 regression.

### Kéo thả sắp xếp lại thứ tự Slide

Thêm SortableJS (CDN, `admin/sliders.html`) — tay cầm `.slide-drag-handle` (☰) kéo thả đổi thứ tự, thay 2 nút ↑LÊN/↓XUỐNG cũ. `initSortable()` phải gọi lại sau MỖI `render()` vì `#slideList` bị rebuild hoàn toàn (innerHTML thay mới) mỗi lần — SortableJS instance cũ mất gắn kết với DOM cũ, cần `.destroy()` + tạo lại.

## Product Management V2 — Category Assignment (Sprint 13)

Mỗi Sản phẩm cần thuộc được NHIỀU Danh mục (yêu cầu "Every Product must belong to one or more Categories"), thay vì chỉ 1 Danh mục như trước — thay đổi cả 3 tầng: form Admin, dữ liệu Firebase, và trang công khai, cộng thêm điểm chạm AI Reuse ở 5 Plugin.

### Database — `categoryIds` mới, `category` cũ vẫn giữ

Product thêm field `categoryIds` (mảng mã Danh mục). Field `category`/`categoryLabel` CŨ (1 mã) **không bị xóa** — mỗi lần Lưu, hệ thống tự ghi lại `category`/`categoryLabel` = Danh mục ĐẦU TIÊN trong `categoryIds` vừa chọn, để bất kỳ chỗ nào khác (ngoài phạm vi Requirement này) còn đọc field cũ vẫn nhận giá trị hợp lệ, không vỡ.

### Migration — derive-at-read, không ghi hàng loạt

Sản phẩm cũ (40+ sản phẩm thật) chỉ có `category`, không có `categoryIds`. Thay vì chạy 1 script ghi lại toàn bộ Firebase (rủi ro cao, không cần thiết), mọi nơi ĐỌC categoryIds đều qua cùng 1 hàm nhỏ (lặp lại ở `js/admin-products.js`/`js/category.js`/mỗi AI Plugin — cùng nguyên tắc "Experience Layer riêng, hàm nhỏ được phép lặp" đã áp dụng cho `getYoutubeEmbedUrl()`):

```js
function productCategoryIds(p) {
  if (Array.isArray(p.categoryIds) && p.categoryIds.length) return p.categoryIds;
  return p.category ? [p.category] : [];
}
```

Sản phẩm cũ tự động được coi như `categoryIds = [category]` ngay khi đọc — Firebase chỉ thật sự ghi field `categoryIds` khi Founder mở Sửa + Lưu lại sản phẩm đó (tiến hoá dần dần, cùng cách `pubStatus` đã rollout ở Sprint 12 Requirement #10).

### Product Form — checklist thay cho select 1-lựa-chọn

`admin/products.html`: `#pCategoriesList` render checkbox cho mọi Category `active !== false`, sắp theo field `order` có sẵn (Requirement gọi là "displayOrder" — ánh xạ vào field đã tồn tại, không tạo field trùng lặp), hiện icon Category nếu có field `icon` (chưa có UI ghi field này ở Category Manager — chỉ hiển thị phòng khi tự thêm thẳng trong Firebase, đúng "if available"). Reset Form (sản phẩm MỚI) mặc định KHÔNG check gì — buộc Founder chọn có chủ đích, khớp đúng validate bên dưới.

**Validation**: `saveProduct()` đọc checkbox đã check qua `document.querySelectorAll('#pCategoriesList input[type="checkbox"]:checked')`; 0 lựa chọn → chặn Lưu, hiện nguyên văn `Please select at least one Category.` (giữ tiếng Anh đúng yêu cầu).

### Public site — sản phẩm hiện trong MỌI Danh mục đã gán

`js/category.js` `getFiltered()`: `productCategoryIds(p).includes(state.category)` thay vì so khớp 1-1 — 1 sản phẩm gán 2 Danh mục sẽ hiện đúng ở CẢ 2 tab lọc. Nút "Xem trên Shopee" (gắn với Danh mục `phukien`) cũng đổi sang kiểm tra qua mảng, không còn giả định `phukien` là Danh mục duy nhất.

### Category Management — xóa 1 Danh mục không làm vỡ Sản phẩm

Mọi nơi map `categoryIds` → nhãn hiển thị (bảng Sản phẩm `catLabelsJoined()`, ngữ cảnh AI `productCategoryLabels()`) đều `.filter(Boolean)` bỏ qua mã không còn tồn tại trong `CategoryDB` — Sản phẩm vẫn hợp lệ, vẫn hiển thị đúng dưới "Tất cả" và mọi Danh mục hợp lệ còn lại. Tab lọc công khai (`VALID_CATEGORIES`) chỉ dựng từ Category đang Hoạt động nên 1 mã đã xóa không bao giờ xuất hiện thành tab để bấm vào — không cần xử lý gì thêm ở tầng UI công khai.

### AI Reuse — "must use categoryIds automatically"

Product AI (`product-description-writer.js`)/Facebook AI (`facebook-post-generator.js`)/Banner AI (`banner-generator.js`)/Blog AI (`blog-writer.js`): mỗi Plugin thêm 1 hàm `productCategoryLabels(p, categories)` nhỏ (cùng lặp lại có chủ đích như trên) và ghép câu ngữ cảnh "Thuộc danh mục: X, Y" vào Prompt khi có chọn Sản phẩm — AI dùng làm CĂN CỨ, các Plugin dùng `productId` đều đã sửa `loadContext()` để tải thêm `DataProvider.getCategories()` (Product AI đã tải sẵn từ trước, không cần sửa `loadContext()`, chỉ sửa `buildPrompt()`).

SEO AI (`seo-generator.js`) là ngoại lệ kiến trúc: nhắm Blog Post, không nhắm Product trực tiếp (giới hạn đã ghi nhận từ trước, không đổi ở đây). Reuse categoryIds GIÁN TIẾP: nếu Blog Post có `relatedProductId` (Blog AI tự gán field này khi sinh bài từ 1 Sản phẩm), SEO AI tải thêm Sản phẩm đó + Danh mục để ghép câu "Sản phẩm liên quan thuộc danh mục: ..." vào Prompt. Không có `relatedProductId` (đa số bài cũ/viết tay) → bỏ qua hoàn toàn, 0 regression.

**Không đổi**: Draft System/Publish Pipeline/Queue/Provider của bất kỳ Plugin nào — categoryIds chỉ là 1 dòng ngữ cảnh THÊM VÀO Prompt, không có Plugin nào tự ý ghi `categoryIds` ngược lại Product khi Publish (khác với `category` — Product AI vẫn giữ nguyên cơ chế cũ tự đề xuất 1 mã `category`, đã validate ở `publishToTarget()` từ trước, không đổi).

## Social Media Publishing Center (Sprint 12) — 1 nơi duy nhất quản lý nội dung AI mạng xã hội

Founder cần 1 nơi DUY NHẤT quản lý toàn bộ nội dung AI (Facebook/Banner/Blog/Product) — xem trước, sửa, Publish/Lên lịch, tra cứu Lịch sử — thay vì rải rác ở `admin/ai/drafts.html` + từng trang riêng. Yêu cầu rõ "Reuse everything already built. Do NOT redesign", nên đây là 1 lớp Trải nghiệm (Experience Layer) THUẦN TUÝ phía trên `DraftDB`/`AdminAI` đã có — **không thêm bảng/collection Firebase mới, không viết lại logic Draft hay Publish Pipeline nào**.

### Phạm vi — 4 loại Draft, loại trừ Image AI có chủ đích

`admin/social-media-center.html` + `js/admin-social-center.js` gộp danh sách 4 `moduleId`: `facebook-post-generator`/`banner-generator`/`blog-writer`/`product-description-writer` — đúng 4 mục LIST filter Requirement liệt kê. `image-generator` KHÔNG nằm trong phạm vi này vì đã có Studio riêng (`admin/ai/images.html`, Sprint 12 Requirement #11) — loại trừ có chủ đích, không phải thiếu sót.

### Preview — tái sử dụng nguyên vẹn, không viết lại template

`AdminAI.draftBodyHtml(draft)` được export thêm (trước đây là hàm nội bộ của `js/admin-ai.js`, dùng cho `admin/ai/drafts.html`) — **0 thay đổi hành vi**, chỉ thêm vào danh sách trả về của module. Social Media Center gọi thẳng hàm này để hiển thị Preview Facebook/Banner ĐÚNG như Founder đã quen thấy, không có 1 template HTML thứ hai nào cho cùng loại nội dung.

### Founder Actions — Edit/Duplicate/Delete/Publish/Schedule

- **Sửa**: mỗi loại Draft có 1 form riêng (Facebook: Hook/Caption/CTA/Hashtags theo từng phiên bản + Link YouTube + Ảnh đại diện/Gallery; Banner: Tiêu đề/Phụ đề/CTA/Ảnh; Blog: Tiêu đề/Đoạn trích/Ảnh Cover; Product: Tên/Mô tả ngắn/Tags). Ảnh dùng lại `MediaLibraryPicker.mount()`/`mountMulti()` — mount SAU khi `innerHTML` đã chèn vào DOM, đúng thứ tự mọi trang Product/Blog/Banner khác đã dùng. LƯU ghi qua `DraftDB.update({content: newContent})` — không có đường ghi dữ liệu thứ hai nào ngoài `DraftDB`.
- **Nhân bản**: `DraftDB.add()` với `content` deep-copy (`JSON.parse(JSON.stringify(...))`, đảm bảo Draft mới độc lập hoàn toàn với Draft gốc), `status` luôn về `'draft'` (không kế thừa `published`/`rejected`).
- **Xóa**: `DraftDB.remove()`, có `confirm()` chặn thao tác nhầm.
- **Publish Now**: CHỈ áp dụng Banner/Blog/Product, gọi `AdminAI.publishDraftById()` (đúng `publishToTarget()` có sẵn). Facebook KHÔNG có nút trùng lặp ở đây — nút "Đăng lên Facebook" đã có sẵn NGAY TRONG Preview tái sử dụng (`publishVersionToFacebook()` mỗi phiên bản A/B/C độc lập, đã có từ Facebook Integration V1).

### Lên lịch đăng (Facebook, V1) — giới hạn client-side có chủ đích

Theo đúng khung "For now, implement only Facebook" của Requirement: Founder chọn thời điểm tương lai cho 1 phiên bản Facebook cụ thể → ghi thẳng `scheduledAt` + `publishStatus:'scheduled'` lên chính Draft đó (không bảng mới) → 1 `setInterval` 60 giây chạy khi trang Social Media Center đang MỞ trong trình duyệt, quét mọi Draft Facebook còn Nháp, tự gọi lại `publishVersionToFacebook()` khi tới hạn.

**Giới hạn thật, đã ghi nhận rõ ràng cho Founder trong UI**: chỉ hoạt động khi trang này đang mở — đóng tab/trình duyệt thì lịch đã đặt sẽ KHÔNG tự đăng cho tới khi Founder mở lại trang. Đây là quyết định kiến trúc NHẤT QUÁN với tiền lệ `AIJobQueue` đã có ("V1: xử lý phía trình duyệt Admin... nâng cấp Cloud Functions ở V2 mà không cần đổi hàm enqueue/resume/cancel") — không phải thiếu sót, mà là để tránh tự ý thêm hạ tầng Cloud Scheduler mới ngoài phạm vi "Reuse everything, Do NOT redesign" của Requirement này. Nâng cấp lên Cloud Scheduler thật (đăng đúng giờ dù không mở trình duyệt) để ngỏ cho 1 Requirement riêng sau này.

### Lịch sử đăng bài — không bảng mới, đọc lại field đã có sẵn

`renderHistory()` không tạo collection nào — với Facebook, gộp mọi phần tử `content.versions[]` có `publishStatus === 'published'|'failed'` (đọc `facebookPostId`/`publishedAt`/`selectedPage`/`publishError` đã ghi sẵn bởi `publishVersionToFacebook()`); với Banner/Blog/Product, chỉ lấy Draft có `status === 'published'` (đọc `publishedAt`). Sắp xếp theo `publishedAt` mới nhất trước.

### Kiến trúc mở rộng nền tảng tương lai

`MODULE_LABELS` là điểm mở rộng DUY NHẤT cần sửa khi có Plugin mới muốn xuất hiện ở Social Media Center (thêm 1 dòng `moduleId → nhãn hiển thị`). Kiến trúc Publish (Instagram Business/Threads/TikTok/YouTube Community, theo Requirement liệt kê là "Future destinations") CHƯA được xây — Requirement chỉ yêu cầu "Architecture must support future platforms", không yêu cầu code khung rỗng cho các nền tảng chưa tồn tại; điểm mở rộng thật sự (khi có Requirement riêng) sẽ là thêm 1 hàm `publishVersionTo<Platform>()` mới cạnh `publishVersionToFacebook()` trong `js/admin-ai.js`, tái sử dụng đúng pattern Draft/Version đã có.

### 0 sửa đổi

Facebook Integration/Product AI/Blog AI/Banner AI/Queue/Provider/Workflow/Draft System/Publish Pipeline — đúng "Do NOT redesign" của Requirement. Duy nhất 1 thay đổi ngoài file mới: `js/admin-ai.js` export thêm `draftBodyHtml` (0 đổi hành vi) và `js/admin-auth.js` thêm mục nav "Social Media Center".

## Facebook Integration V1 (Sprint 12) — App ID động + Mock Mode + Token Refresh + Permission Checking

Hoàn thiện kiến trúc production của "Facebook AI V5" (mục bên dưới) theo đúng yêu cầu "Build the REAL production implementation first... Do NOT wait for App ID" — không hardcode App ID (khác quyết định tạm thời ở V5), thêm Mock Mode để tự kiểm thử toàn bộ luồng ngay cả khi Meta App chưa tồn tại, và hoàn thiện 3 hạng mục còn thiếu ở V5: Token Refresh/Permission Checking/Facebook Graph API Wrapper.

### App ID — cấu hình động, không hardcode

```
App ID: Firebase RTDB facebookAppConfig/appId (KHÔNG phải hằng số JS)
  - Client (js/admin-facebook-connect.js) đọc qua getAppId() mỗi khi cần
  - Server (functions/index.js) đọc qua getFacebookAppId() (Admin SDK) mỗi request
  - Founder tự "Enter App ID" tại admin/facebook-settings.html (ô nhập +
    nút LƯU, ghi thẳng facebookAppConfig — KHÔNG cần sửa code/redeploy)
  - App Secret vẫn BẮT BUỘC qua Secret Manager (defineSecret) — không đổi
```

### Mock Mode — tự động, không có công tắc riêng

```
mockMode = !appId  (tính DUY NHẤT 1 lần, tại facebookOAuthCallback)
  → LƯU LẠI thành `isMock` trên MỌI bản ghi phái sinh từ lần OAuth đó:
    facebookPendingPages/{uid}.isMock, facebookPageTokens/{uid}/{pageId}.isMock,
    facebookUserToken.isMock, facebookActiveToken.isMock, facebookConnection.isMock
  → facebookPublish/facebookRefreshToken ĐỌC LẠI `isMock` đã lưu — KHÔNG
    tính lại theo App ID hiện tại. Lý do: nếu Founder điền App ID SAU KHI
    đã kết nối ở Mock Mode, kết nối đó vẫn phải tiếp tục dùng Graph API giả
    lập cho tới khi "Kết nối lại" thật — nếu không sẽ vô tình gọi Facebook
    thật bằng token giả (`mock_page_token_1`) và lỗi khó hiểu. Đã kiểm thử
    riêng đúng kịch bản này (Scenario C trong bộ test Cloud Functions).
```

`proceedOAuth()` ở Mock Mode KHÔNG redirect sang facebook.com (không có App ID để redirect tới) — redirect thẳng tới CHÍNH Cloud Function `facebookOAuthCallback` của mình với `code=mock-code`, cùng `state` nonce ghi trước như luồng thật. `facebookOAuthCallback` tự nhận biết Mock Mode và gọi `functions/facebook-graph-api.js` (wrapper) ở chế độ giả lập — toàn bộ phần còn lại của luồng (đọc/xoá state, ghi `facebookPendingPages`/`facebookPageTokens`, redirect về `?oauth=success`) chạy Y HỆT luồng thật. Founder có thể tự click qua toàn bộ vòng đời (Connect → chọn 1 trong 2 Fanpage giả → Generate Facebook AI → Đăng lên Facebook giả, nhận `facebookPostId` dạng `{pageId}_mockpost_{timestamp}`) để xác nhận kiến trúc đúng, ngay cả khi Meta App chưa tồn tại.

### Facebook Graph API Wrapper (`functions/facebook-graph-api.js`, file mới)

Điểm gọi Graph API DUY NHẤT (`exchangeCodeForToken`/`exchangeForLongLivedToken`/`getManagedPages`/`uploadPhoto`/`publishToFeed`) — không phụ thuộc `firebase-admin`/`firebase-functions`, chỉ nhận tham số qua object argument, nên test được bằng Node thuần không cần giả lập cả Cloud Functions runtime. Mỗi hàm nhận `mockMode`; nếu `true`, trả dữ liệu giả ĐÚNG SHAPE Graph API thật (vd `getManagedPages` mock trả về đúng 2 Page giả có `id`/`name`/`access_token`/`picture.data.url`) mà không gọi mạng. **Xoá Mock Mode sau này chỉ cần xoá đúng 5 nhánh `if (mockMode)` trong file NÀY — `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish`/`facebookRefreshToken` KHÔNG cần sửa gì**, vì chúng luôn gọi wrapper giống hệt nhau bất kể mock hay thật.

### Token Refresh (`facebookRefreshToken`, Cloud Function mới)

```
Node facebookUserToken (server-only, TOÀN CỤC — không theo uid, chỉ 1 kết
nối Facebook cho toàn platform) — LƯU LẠI (KHÔNG xoá ở facebookSelectPage
như facebookPendingPages/facebookPageTokens) để dùng cho Refresh sau này.

facebookRefreshToken:
  1. Đọc facebookUserToken — nếu ĐÃ hết hạn hoàn toàn → lỗi rõ ràng
     "không thể tự làm mới, cần Kết nối lại" (giới hạn thật của Facebook —
     Long-Lived Token hết hạn hẳn thì không có cách "refresh token" nào
     khác ngoài đăng nhập lại, không phải thiếu sót code).
  2. Còn hạn → exchangeForLongLivedToken() lại CHÍNH token đó (Meta cho
     phép "gia hạn" 1 Long-Lived Token còn hạn thành 1 token mới ~60 ngày,
     không cần Founder đăng nhập lại — đây là cơ chế Refresh DUY NHẤT
     Facebook hỗ trợ cho loại token này).
  3. getManagedPages() lại với token mới → tìm đúng Page đang active →
     lấy Page Access Token mới.
  4. Cập nhật facebookUserToken/facebookActiveToken/facebookConnection.tokenExpiresAt.
```

Nút "🔄 Làm mới Token" hiển thị khi đang Connected/Token Expiring (`js/admin-facebook-connect.js`).

### Permission Checking (`js/ai/permission-service.js`)

Lỗ hổng RBAC đã sửa: nút "Đăng lên Facebook" (`admin/ai/drafts.html`) trước đây (Facebook AI V5) CHỈ kiểm tra `facebookConnection.status` — KHÔNG kiểm tra quyền gì, nghĩa là bất kỳ Editor nào xem được Draft Facebook đều bấm Publish được ngay. Thêm `AI_PERMISSIONS.PUBLISH_FACEBOOK` + `PermissionService.checkFacebookPublish(userId, userEmail)` (cùng pattern `checkPluginExecution()` — kiểm tra role, ghi Log khi từ chối — nhưng KHÔNG gắn với 1 Plugin/moduleId thật vì Publish không đi qua PluginManager/Queue; dùng chuỗi cố định `'facebook-publish'` khi ghi Log để phân biệt với Plugin `facebook-post-generator` thật). Editor được cấp quyền này — ngang mức Editor đã có với mọi hành động Publish khác (Blog/Product/Banner qua `publishDraftById()` không có rào riêng nào khắt khe hơn), không tự đặt ra hạn chế mới không được yêu cầu.

- **0 sửa đổi**: Product AI/Blog AI/Banner AI/Image AI/Workflow/Plugin Framework/Queue/Draft System/`js/ai/modules/facebook-post-generator.js`.
- **Kiểm thử**: Node `vm`/Node thuần cho cả 4 lớp (wrapper độc lập, Cloud Functions rewrite gồm cả kịch bản "guard" mock-không-tự-chuyển-thật, client OAuth/App ID field/Mock badge/Refresh, Permission Checking + regression toàn bộ luồng Publish V5) — tổng ~90 assertion, xem `CHANGELOG.md` để biết số lượng chi tiết từng bộ. Preview thật xác nhận trang tải đúng, không lỗi JS mới. **Mock Mode CÓ THỂ kiểm thử toàn bộ luồng ngay hôm nay trên Production thật** — đây là khác biệt cốt lõi so với Facebook AI V5 (chỉ kiểm thử được bằng Node `vm`, không click qua UI thật được vì chưa có gì để OAuth redirect tới).

## Facebook AI V5 — Facebook Configuration & Auto Publish (Sprint 12) — OAuth thật + Publish thật

**[ĐÃ NÂNG CẤP THÊM]** — xem mục "Facebook Integration V1" ở trên (App ID không còn hardcode, có Mock Mode, Token Refresh, Permission Checking). Mục dưới đây giữ nguyên làm lịch sử kiến trúc gốc.

Nâng cấp "Facebook Page Integration — CHỈ khung UI an toàn" (mục bên dưới, Sprint 12 Requirement #9) lên code THẬT — vẫn chưa chạy thử được thật vì chưa có Meta App (Chief Architect xác nhận trước khi code: viết toàn bộ code thật, chờ App ID/Secret sau — không lặp lại lựa chọn "chỉ khung an toàn" của Requirement #9 nữa).

```
Founder → admin/facebook-settings.html (Settings > Facebook Configuration)
       → "Connect Facebook" → đọc dialog xin phép ("Hệ thống SẼ" / "SẼ KHÔNG")
       → "Continue with Facebook"
       → js/admin-facebook-connect.js: ghi state nonce vào facebookOAuthState/{state}
          (CÁCH DUY NHẤT xác định "yêu cầu này của Founder nào" — bước sau là
          browser navigation thật, không phải fetch() có Firebase Auth header)
       → redirect https://www.facebook.com/.../dialog/oauth?client_id=...&state=...
       → Founder đăng nhập Facebook thật, cấp quyền
       → Facebook redirect VỀ functions/index.js facebookOAuthCallback?code&state
          → đọc facebookOAuthState/{state} (Admin SDK) → biết uid → xoá state (dùng 1 lần)
          → đổi code → Short-Lived → Long-Lived User Token (~60 ngày)
          → GET /me/accounts → danh sách Fanpage + Page Access Token riêng từng Page
          → ghi facebookPendingPages/{uid} (metadata, KHÔNG token — client đọc để hiển thị)
          → ghi facebookPageTokens/{uid} (token thật — node server-only .read:false/.write:false)
          → redirect VỀ admin/facebook-settings.html?oauth=success
       → client đọc facebookPendingPages/{uid} → hiển thị Page Selection (tên+ảnh)
       → Founder chọn 1 Page, bấm LƯU
       → fetch facebookSelectPage (Firebase Auth header thật, giống openaiProxy)
          → copy đúng token của Page đã chọn: facebookPageTokens/{uid}/{pageId}
            → facebookActiveToken (server-only, node DUY NHẤT facebookPublish đọc)
          → ghi facebookConnection (CHỈ metadata: status/pageId/pageName/tokenExpiresAt)
          → dọn facebookPendingPages/facebookPageTokens (không cần giữ sau khi đã copy)
       → card chuyển 🟢 Connected

Founder → admin/ai/drafts.html → Facebook AI V3 Draft (KHÔNG đổi Plugin) → bấm
       "Đăng lên Facebook" (versionCardHtml, js/admin-ai.js)
       → publishVersionToFacebook(draftId, versionLabel):
          → kiểm tra facebookConnection.status thật trước (chưa kết nối → báo rõ, dừng)
          → ghi versions[i].publishStatus='publishing' NGAY (phản hồi tức thời)
          → lắp message: Hook+Caption+Highlights+CTA+Hashtags
            + Product Link (absolutizeLink() — Draft chỉ lưu link TƯƠNG ĐỐI)
            + YouTube link THẬT (DB.get(productId) → product.youtubeUrl,
              KHÔNG dùng draft.content.youtubeEmbedUrl — dạng embed không hợp
              để chia sẻ công khai) — cả 2 việc này KHÔNG sửa Plugin, lắp lại
              ở đây (Publish Pipeline) từ dữ liệu draft.content/Product thật
          → fetch facebookPublish (Firebase Auth header thật)
             → Cloud Function đọc facebookActiveToken (server-only) → kiểm tra hết hạn
             → có ảnh: POST từng ảnh /{page-id}/photos (published:false) lấy media_fbid
             → POST /{page-id}/feed (message + attached_media nếu có ảnh)
             → trả {success, facebookPostId} hoặc {success:false, error}
          → ghi versions[i] = {publishStatus, facebookPostId, publishedAt, publishedBy,
             selectedPage} (thành công) HOẶC {publishStatus:'failed', publishError} (lỗi)
             — CHỈ phiên bản vừa bấm bị đổi, 2 phiên bản A/B/C còn lại giữ nguyên
```

- **Token thật KHÔNG BAO GIỜ đi qua client** — `facebookPageTokens`/`facebookActiveToken` có Database Rule `.read:false`/`.write:false` TUYỆT ĐỐI cho MỌI role (kể cả Admin) — chỉ Cloud Function (Admin SDK) bypass được. Client chỉ thấy `facebookConnection` (metadata) và `facebookPendingPages` (tên/ảnh Page, không token).
- **`state` nonce giải quyết đúng 1 vấn đề kỹ thuật cụ thể**: `facebookOAuthCallback` là điểm ĐÍCH của 1 browser navigation thật (Facebook tự redirect trình duyệt tới), không phải 1 lượt `fetch()` có `Authorization` header như `openaiProxy` — nên không thể xác thực bằng Firebase ID token ở đây. `state` (ghi vào Firebase TRƯỚC khi rời trang, đọc lại bằng Admin SDK trong Cloud Function, xoá ngay sau khi dùng) là cách duy nhất nối lại "yêu cầu OAuth này của Founder nào".
- **`js/ai/job-queue.js` không liên quan gì tới luồng này** — Facebook Publish KHÔNG đi qua Plugin Framework/Queue (không có "Generate ảnh"/"Generate văn bản" nào ở bước Publish, chỉ là gọi Graph API thật với nội dung ĐÃ có sẵn trong Draft) — đúng "Reuse... Publish Pipeline" của Requirement, không phải "Reuse Queue" cho hành động này.
- **Không sửa `js/ai/modules/facebook-post-generator.js`** — Plugin vẫn y hệt Facebook AI V3 (Sprint 12 Requirement #7), chỉ sinh `draft.content` như cũ. Việc "URL tuyệt đối" + "YouTube link thật" hoàn toàn nằm ở `js/admin-ai.js` (Publish Pipeline), đọc dữ liệu Product thật độc lập qua `DB.get(draft.inputParams.productId)` khi cần.
- **Theo dõi Publish độc lập theo từng phiên bản** — Facebook AI V3 sinh 3 phiên bản (A/B/C) trong 1 Draft; trạng thái Publishing/Published/Failed lưu trong `content.versions[i]` (không phải cấp Draft) — Founder có thể đăng thử nhiều phiên bản khác nhau mà không mất dấu vết phiên bản nào đã đăng.
- **Sidebar "Facebook Configuration"** thêm mới ở cả `ADMIN_NAV` và `FOUNDER_SMART_NAV` (`js/admin-auth.js`, admin-only — nới lệ "Smart Mode đúng 13 mục" thành 14 có chủ đích, vì Founder phải tự kết nối được từ Smart Mode). Card kết nối dọn khỏi `admin/ai/index.html` sang trang riêng `admin/facebook-settings.html`.

## Image AI (Sprint 12, Requirement #11) — sinh ảnh thật, Plugin thứ 9 trong Framework

Founder muốn sinh ẢNH THẬT (khác `image-prompt-generator`, Sprint 6 Requirement #4, chỉ sinh văn bản prompt) cho 7 loại ảnh marketing, luôn dừng ở Draft, Founder tự chọn nơi dùng — không có đích Publish cố định như các Plugin văn bản.

```
Founder → admin/ai/images.html → chọn 1-trong-4 nguồn (Product/Promotion/Blog/Custom Prompt)
       → chọn Loại ảnh + Kích thước → "TẠO ẢNH"
       → js/admin-image-ai.js: PermissionService.checkPluginExecution('image-generator')
       → PluginManager.loadPlugin('image-generator').execute() → AIJobQueue (KHÔNG đổi Queue)
       → js/ai/job-queue.js: processItem() → AIProviderRegistry.resolveForPlugin() → provider.generate()
       → js/ai/providers/openai.js generate({moduleId,...}):
            moduleId === 'image-generator' ?
              → callOpenAiProxy({action:'generate_image', prompt, size})
              → functions/index.js: gọi OpenAI Images API (dall-e-3)
                 → tải ảnh về, lưu VĨNH VIỄN vào Firebase Storage (Admin SDK)
                 → trả {imageUrl: <URL Storage thật, không hết hạn>}
              : callOpenAiProxy({action:'generate', model, prompt})  (mọi Plugin văn bản khác, KHÔNG đổi)
       → module.mapToDraftContent() → DraftDB.add() (aiDrafts, targetCollection:null)
       → Lưới "ẢNH ĐÃ TẠO" hiển thị Draft mới → Founder Actions (Regenerate/Download/
         Save to Product Gallery/Save as Featured/Save to Blog Cover/Insert into Blog/
         Save as Banner/Delete) → gọi THẲNG DB/BlogDB/BannerDB đã có, LUÔN CỘNG THÊM
```

- **Provider branch theo `moduleId`, không theo hình dạng `params`** — `js/ai/providers/openai.js generate()` kiểm tra `moduleId === 'image-generator'` (tín hiệu ổn định, Queue luôn truyền đúng `moduleId` của Plugin đang chạy) thay vì suy đoán qua sự có mặt của field `size` — tránh nhầm lẫn nếu 1 Plugin văn bản tương lai tình cờ cũng có field tên `size`.
- **0 sửa đổi `js/ai/job-queue.js`** — Queue coi `provider.generate()` là hộp đen, nhận `output` rồi truyền thẳng cho `module.mapToDraftContent(output, ...)`; thêm 1 loại output mới (`imageUrl` thay vì `text`) không đòi hỏi Queue biết/xử lý khác đi.
- **Ảnh OpenAI trả về là TẠM THỜI (hết hạn sau vài giờ)** — `functions/index.js` bắt buộc phải tự tải về + lưu vào Firebase Storage NGAY trong Cloud Function (Admin SDK, bỏ qua Storage Rules vì chạy phía server) trước khi trả kết quả cho client, dùng đúng định dạng Download URL mà Firebase Client SDK tự sinh (`firebaseStorageDownloadTokens` metadata) để hoạt động y hệt ảnh upload thủ công ở mọi nơi khác trong CMS — **0 sửa `storage.rules`** (rule `allow get: if true` đã có sẵn áp dụng cho mọi path).
- **`targetCollection: null` — không có 1 đích Publish cố định**, khác mọi Plugin trước đó (Blog/Product/Banner đều biết trước ghi vào đâu). Founder Actions trong `js/admin-image-ai.js` KHÔNG dùng `AdminAI.publishDraftById()` (chỉ hiểu 1 target cố định) — mỗi hành động ("Save to...") tự gọi thẳng `DB.update()`/`BlogDB.update()`/`BannerDB.add()` đã có, và Draft KHÔNG bị xóa/đánh dấu published sau khi dùng (chỉ ghi thêm vào mảng `content.usedIn` để Founder biết đã dùng ở đâu) — cho phép dùng lại 1 ảnh cho nhiều mục đích khác nhau.
- **Luôn CỘNG THÊM, không ghi đè** (đúng RULES "Do NOT overwrite existing images automatically"): "Vào Gallery Sản phẩm" nối thêm vào mảng `images` hiện có; "Đặt làm Ảnh đại diện" đưa ảnh mới lên đầu mảng (giữ nguyên các ảnh cũ, chỉ đổi `image`/thứ tự); "Chèn vào bài Blog" nối thêm `<img>` vào cuối `contentHtml` hiện có; "Dùng làm Banner" luôn tạo 1 Banner MỚI (không có Banner nào sẵn để ghi đè).
- **Ảnh chưa có nguồn Sản phẩm/Blog rõ ràng** (sinh từ Khuyến mãi/Prompt tự do) hiện thêm 1 `<select>` inline trong card để Founder tự chọn đích trước khi lưu — không tự đoán/tự chọn thay.
- **Kích thước "4:5" là xấp xỉ, không phải tỉ lệ thật** — `dall-e-3` chỉ hỗ trợ đúng 3 kích thước cố định (`1024x1024`/`1024x1792`/`1792x1024`), không có tỉ lệ 4:5 thật — UI ghi rõ đây là kích thước dọc gần nhất, không giả vờ là crop chính xác.
- **Sidebar "AI Image" đã có trang riêng thật** — trước đây (Sprint 10 Requirement #5) cả "AI Content" và "AI Image" đều trỏ chung `admin/ai/index.html` (Plugin Dashboard kỹ thuật); nay "AI Image" trỏ đúng `admin/ai/images.html` ở cả `ADMIN_NAV` (Advanced Mode, mục mới thêm) và `FOUNDER_SMART_NAV` (Smart Mode, sửa href) — "AI Content" (văn bản) vẫn chưa có trang riêng, giữ nguyên giới hạn cũ.

## Product Management (Sprint 12, Requirement #10) — tổng quát hóa AI Assist Inline CMS Forms thành 5 nút

Founder First Roadmap (`ROADMAP.md`) xếp "Complete Product Management" ưu tiên #1. Requirement này (1) bổ sung field còn thiếu cho Product, (2) thêm khái niệm hiển thị/ẩn (`pubStatus`) riêng biệt khỏi `status` (tình trạng Mới/Qua sử dụng), (3) nâng cấp Editor, và (4) tổng quát hóa `ProductAIAssist` (Sprint 11 Requirement #2, xem mục bên dưới) từ 1 nút (chỉ Mô tả) thành 5 nút — tái sử dụng đúng 4 Plugin đã production-ready (Product AI V2/Facebook AI V3/Blog AI V2/Banner AI V2), không tạo Plugin/Provider/Queue/Workflow mới.

```
Founder → admin/products.html → lưu 1 sản phẩm (có #pId)
       → bấm 1 trong 5 nút [data-ai-btn]: description/seo/facebook/blog/banner
       → js/admin-products-ai-assist.js: BUTTONS[id].buildParams(product) → inputParams
            - description/seo  → { productId, tone } → Plugin 'product-description-writer'
            - facebook         → { productId, topic:'', promotion:'' } → Plugin 'facebook-post-generator'
            - blog             → { productId, topic:'Giới thiệu '+tên sp, tone, keywords:'' } → Plugin 'blog-writer'
            - banner           → { productId, promotion:'', event:'', link:'' } → Plugin 'banner-generator'
       → PermissionService.checkPluginExecution → PluginManager.loadPlugin(moduleId).execute() → AIJobQueue
       → Hoàn tất → BUTTONS[id].renderPreview(draft.content) hiển thị NGAY TRONG form
            → applyMode 'product' (description/seo) → "ÁP DỤNG VÀO SẢN PHẨM"
                 → AdminAI.publishDraftById(draftId) (ghi vào ĐÚNG sản phẩm đang sửa, targetId có sẵn)
                 → syncProductForm() đồng bộ lại hiển thị: tên/mô tả/thông số/tính năng/tags
            → applyMode 'publish' (facebook/blog/banner) → "DUYỆT & PUBLISH"
                 → AdminAI.publishDraftById(draftId) (tạo bản ghi MỚI: blogPosts/banners, hoặc chỉ đánh dấu đã duyệt cho Facebook — không target)
       → "TỪ CHỐI" → AdminAI.rejectDraftById(draftId) ở bất kỳ nút nào
```

- **"Generate Description" và "Generate SEO" gọi CÙNG 1 Plugin** (`product-description-writer` — đã sinh đủ 13 trường kể cả SEO trong 1 lần gọi, xem Sprint 12 Requirement #4) — chỉ khác `renderPreview` nhấn mạnh trường nào (Mô tả/Thông số/Tính năng/FAQ so với SEO Title/Meta Description/Keywords/Slug/ALT Text) — tránh gọi AI 2 lần cho cùng nội dung, và tránh dùng `seo-generator` (Sprint 3) vì Plugin đó CHỈ hỗ trợ `targetType: 'blogPost'`, không hỗ trợ Product.
- **`buildParams` tự động điền field bắt buộc** mà form 5-nút không hỏi lại Founder: Blog AI yêu cầu `topic` bắt buộc — tự điền "Giới thiệu {tên sản phẩm}" đọc từ `#pName` hiện tại; Facebook/Banner có `productId` optional (1-trong-3 nguồn) — tự điền `productId`, để `topic`/`promotion`/`event` rỗng (đúng "chọn Sản phẩm" trong 3 lựa chọn).
- **`pubStatus` (Draft/Published/Hidden)** — field MỚI, **không phải** field `status` cũ (Mới/Qua sử dụng — tình trạng sản phẩm). Sản phẩm mới mặc định `pubStatus: 'draft'`; sản phẩm cũ không có field (`undefined`) khi Sửa hiển thị mặc định "Đã xuất bản" (không đổi trạng thái hiển thị công khai cho tới khi Founder chủ động Lưu lại). `js/category.js` lọc **CHỈ ẩn** `pubStatus === 'draft'`/`'hidden'` — KHÔNG BAO GIỜ yêu cầu `=== 'published'` (sẽ làm biến mất toàn bộ 42 sản phẩm thật hiện có, vốn chưa có field này).
- **`MediaLibraryPicker.mountMulti()` mở rộng reorder/set-featured** — `slotHtml()` nhận thêm `opts.onMoveUp`/`onMoveDown`/`onSetFeatured`/`isFeatured` (CHỈ `mountMulti()` truyền — cần biết vị trí trong mảng ảnh); "Đặt làm ảnh đại diện" = đưa ảnh về đầu mảng (đúng quy ước có sẵn `data.image = images[0]`, xem `js/admin-products.js saveProduct()`). `mount()`/`renderSlot()` (Blog/Banner/Slider/Category) không truyền các `opts` này nên không hiển thị nút mới — xác nhận 0 regression qua test trực tiếp (so sánh HTML output trước/sau).
- **`syncProductForm()` chỉ đồng bộ field CÓ giá trị** trong `draft.content`, không ghi đè bằng rỗng — publishDraftById() đã ghi thật vào Firebase; đây chỉ là đồng bộ hiển thị Form, không phải ghi dữ liệu (field nào Draft không trả về vẫn giữ nguyên giá trị Founder đang gõ dở trên form).
- **0 sửa đổi**: 4 Plugin AI Modules (`product-description-writer`/`facebook-post-generator`/`blog-writer`/`banner-generator`), `js/admin-ai.js` (Publish pipeline tái sử dụng nguyên vẹn), Queue/Provider/Workflow/Plugin Framework.
- **Kiểm thử**: Node `vm` load mã nguồn thật (mock PermissionService/PluginManager/AIJobQueue/JobDB/DraftDB/AdminAI/AdminAuth) — cả 5 nút gọi đúng `moduleId` + `inputParams` (kể cả topic tự động cho Blog); Preview hiển thị đúng nội dung theo Plugin; Apply đồng bộ đúng field vào form (chỉ field có giá trị); Publish gọi đúng `publishDraftById` với đúng `draftId`; guard "cần lưu sản phẩm trước" hoạt động đúng. `MediaLibraryPicker` reorder/set-featured test trực tiếp trên hàm thật (không mock DOM giả lập hành vi). Preview thật (dev server local + Firebase thật): `category.html` vẫn hiển thị đủ "42 sản phẩm" sau khi thêm filter `pubStatus`, 0 lỗi console. **Chưa kiểm thử form Sản phẩm qua UI thật có đăng nhập** (cần tài khoản Founder thật).

## Facebook AI V3 (Sprint 12, Requirement #7)

Nâng Facebook AI V2 (Requirement #6) lên mức dùng được cho marketing thật: 3 nguồn input thay vì chỉ Sản phẩm, và 3 phiên bản để so sánh thay vì 1 bản duy nhất.

```
inputFields: productId/topic/promotion — CẢ 3 đều optional, Founder điền
đúng 1 trong 3. buildPrompt() chọn grounding theo thứ tự ưu tiên: có Sản
phẩm > có Khuyến mãi > có Chủ đề > fallback "giới thiệu chung" nếu không
điền gì (không bao giờ để Prompt trống/vô nghĩa).

Yêu cầu AI trả về {"versions": [{hook,caption,cta,hashtags} x3]} — 3 góc
tiếp cận khác nhau. mapToDraftContent() lắp postText riêng cho MỖI phiên
bản, nhưng media (featuredImage/galleryImages/youtubeEmbedUrl/productLink/
productHighlights) DÙNG CHUNG ở cấp content (không lặp theo từng bản, vì
cùng 1 Sản phẩm) — chỉ gắn khi có productId, đúng "If no Product selected:
Generate text only."
```

- **"Draft preview should support: Facebook Preview, Copy Caption, Download Images, Copy Hashtags"**: `js/admin-ai.js`'s `draftBodyHtml()` render 3 khối mô phỏng giao diện bài đăng Facebook thật (avatar/tên trang/hook/caption/hashtags xanh/CTA), mỗi khối có nút Copy Caption (copy `postText` đầy đủ) + Copy Hashtags (Clipboard API + fallback `execCommand`), ảnh Featured/Gallery bọc trong link `download`. **Giới hạn đã biết**: "Download Images" chỉ ép tải thật khi ảnh cùng origin — ảnh lưu ngoài (Cloudinary...) trình duyệt có thể chỉ mở tab mới do giới hạn bảo mật cross-origin, cần proxy server để khắc phục triệt để (ngoài phạm vi Requirement này — không thêm hạ tầng mới).
- **Hồi quy đảm bảo**: `draftBodyHtml()` phân biệt `content.versions` (V3, mới) với cấu trúc phẳng cũ (V2, `content.hook`/`content.mainContent` trực tiếp) — Draft V2 đã tạo trước đó (Requirement #6) vẫn hiển thị đúng y hệt cách cũ, không bị vỡ khi nâng cấp lên V3. Mọi Plugin khác vẫn giữ nguyên `<pre>JSON</pre>` như từ đầu.
- **0 sửa đổi**: Queue/Provider/Workflow/Plugin Framework. Không có tích hợp Facebook API (chưa từng tồn tại, không thêm mới — "No Facebook API yet"/"Publish manually" giữ nguyên bằng cách không đổi `targetCollection: null`).
- **Kiểm thử**: Node `vm` load mã nguồn thật — cả 3 nguồn input đều ground đúng, kể cả không điền gì; đúng 3 phiên bản + đầy đủ media khi có Sản phẩm; đúng "text only" khi không có Sản phẩm; fallback an toàn khi JSON hỏng/thiếu field (không bao giờ Draft rỗng); xác nhận media hiển thị đúng 1 lần qua đếm số thẻ `<img>`/`<iframe>` thật (không suy đoán); Draft V2 cũ vẫn hiển thị đúng cách cũ.

## Media AI V2 — Requirement 3: Facebook AI V2 (Sprint 12, Requirement #6)

Founder muốn Facebook AI sinh bài đăng publish-ready CHỈ từ 1 Sản phẩm có sẵn — Founder chỉ chọn Sản phẩm, Caption/Hook/CTA/Hashtags do AI viết, Featured Image/Gallery/Video/Product Link đều tự động lấy từ dữ liệu Product thật (cùng kiến trúc "AI chỉ viết văn bản, code tự chèn media thật" đã dùng ở Blog AI V2, Requirement #5).

```
facebook-post-generator.js — inputFields chỉ còn productId (BẮT BUỘC, trước
đây tuỳ chọn + có thêm field "message" nhập tay — đã bỏ, đúng "Founder only
selects: Product").

buildPrompt() → JSON {hook, mainContent, cta, hashtags} — CHỈ văn bản,
cấm AI tự chèn ảnh/link.

mapToDraftContent() tự lắp:
  featuredImage    = images[0] (Product thật)
  galleryImages    = images[1:] (Product thật)
  youtubeEmbedUrl  = getYoutubeEmbedUrl(product.youtubeUrl) — rỗng nếu không có
  productLink      = category.html?product={id} (route đã thêm ở Requirement #5)
  productHighlights = product.features thật (Product AI V2) hoặc product.specs
                       — KHÔNG để AI tự nghĩ thêm ("Use ONLY existing Product data")
  postText         = bản text thuần lắp đúng POST FORMAT, để Founder copy tay
                       — targetCollection vẫn null, "Publish" chỉ đánh dấu Draft
                       đã duyệt, KHÔNG tự động đăng lên Facebook thật.
```

- **"Content displays correctly inside the CMS"** (Founder Acceptance Test): `js/admin-ai.js`'s `renderDrafts()` (`admin/ai/drafts.html`) thêm `draftBodyHtml(d)` — CHỈ đổi cách hiển thị cho `moduleId === 'facebook-post-generator'` (ảnh/gallery/video/highlights/hashtags/link hiển thị trực quan) — mọi Plugin khác vẫn giữ NGUYÊN VẸN `<pre>JSON</pre>` như cũ (0 regression, xác nhận qua test trực tiếp trên hàm thật).
- **0 sửa đổi**: Product AI/Blog AI/Queue/Provider/Workflow/Plugin Framework/tích hợp Facebook API (chưa từng tồn tại, không thêm mới — "Do NOT auto-post to Facebook" giữ nguyên đúng bằng cách không đổi gì ở `targetCollection: null`).
- **Kiểm thử**: Node `vm` load mã nguồn thật — lắp media đúng thứ tự khi đủ dữ liệu; bỏ qua đúng từng phần khi thiếu ảnh/video/features (fallback specs, rồi rỗng); JSON hỏng có fallback an toàn; `draftBodyHtml()` hiển thị đẹp cho Facebook, giữ nguyên JSON thô cho Plugin khác. **Chưa kiểm thử qua UI thật có đăng nhập** (cần tài khoản Founder thật) — đã thử qua Preview nhưng bị chặn ở màn đăng nhập, như mọi lần trước trong Sprint này.

## Facebook Page Integration — CHỈ khung UI an toàn (Sprint 12, Requirement #9)

**[ĐÃ NÂNG CẤP LÊN CODE THẬT]** — xem mục "Facebook AI V5 — Facebook Configuration & Auto Publish" ở trên. Mục này giữ nguyên làm lịch sử kiến trúc (giải thích lý do/phạm vi ban đầu chỉ xây khung UI) — `js/admin-facebook-connect.js`/`admin/ai/index.html` mô tả bên dưới đã thay đổi (card dọn sang `admin/facebook-settings.html`, OAuth đã thật) kể từ Facebook AI V5.

Founder muốn Facebook AI đăng bài trực tiếp lên Fanpage thật từ CMS. Đây là Requirement ĐẦU TIÊN trong Sprint 12 cần hạ tầng bên ngoài thật (Facebook App + App Review từ Meta) — không thể triển khai đầy đủ chỉ bằng code, giống hệt bài học Sprint 11 Requirement #3 (AI Provider Runtime Activation). Đã hỏi rõ Chief Architect trước khi viết code (AskUserQuestion) — được xác nhận: chỉ xây phần UI/khung an toàn hoạt động thật hôm nay + 1 runbook đầy đủ, KHÔNG giả vờ có OAuth/Publish thật.

```
js/admin-facebook-connect.js — card "📘 Đăng tự động lên Facebook"
(admin/ai/index.html) đọc node Firebase facebookConnection (MỚI, chỉ lưu
metadata — status/pageId/pageName/connectedAt/tokenExpiresAt/connectedBy,
KHÔNG BAO GIỜ lưu Access Token thật, đúng "Never expose tokens in the UI").
Đọc lỗi/chưa có dữ liệu → mặc định an toàn 'not_connected', không vỡ UI.

4 trạng thái đúng yêu cầu: 🟢 Connected / ⚪ Not Connected /
🟠 Token Expiring Soon / 🔴 Token Expired — mỗi trạng thái hiện đúng bộ nút
(Connect/Change Page/Disconnect/Reconnect).

Dialog xin phép — hiện khi bấm "Kết nối Facebook", NGUYÊN VĂN nội dung đã
yêu cầu — chỉ khi bấm "Đồng ý và đăng nhập Facebook" mới thử tiến hành
(hiện tại: hiển thị rõ Facebook App chưa cấu hình + trỏ runbook, KHÔNG giả
vờ đăng nhập thành công).

"Ngắt kết nối" — hành động DUY NHẤT thật sự ghi Firebase (set
status:'not_connected') — an toàn để triển khai ngay vì không phụ thuộc
OAuth thật.
```

- **Nút "📤 Đăng lên Facebook"** trên mỗi phiên bản Draft Facebook AI V3 (`js/admin-ai.js`, `admin/ai/drafts.html`) — kiểm tra `facebookConnection` thật trước khi phản hồi, luôn báo đúng trạng thái thật (chưa kết nối / đã kết nối nhưng publish thật chưa triển khai) — không bao giờ giả vờ đăng thành công.
- **`database.rules.json`**: rule cho `facebookConnection` đã có trong code — **CHƯA deploy** (thao tác vận hành, Assistant không tự deploy Database Rules — cùng nguyên tắc xuyên suốt dự án từ Sprint 8).
- **`docs/FACEBOOK_INTEGRATION_SETUP.md`** (mới) — runbook đầy đủ: tạo Facebook App/Meta for Developers, xin quyền, App Review, OAuth Redirect URI, App Secret → Secret Manager (không bao giờ client-side), Cloud Function `facebookOAuthCallback`/`facebookPublish` (chưa viết — cần Requirement riêng SAU KHI có App ID/Secret thật để viết và test được), deploy Database Rules, checklist xác minh trước khi PASS thật.
- **Kiến trúc sẵn sàng mở rộng** ("Future-ready architecture" theo yêu cầu): `docs/FACEBOOK_INTEGRATION_SETUP.md` ghi rõ hướng thiết kế cho Cloud Function tương lai — node kết nối nên dùng field `destinationType` chung chung (vd `'facebook_page'`) thay vì hardcode riêng cho Facebook, để sau này thêm Instagram Business/Facebook Groups/Threads không cần đổi lại luồng UI hiện có. Đây là ĐỊNH HƯỚNG cho phần viết sau (Cloud Function OAuth/Publish), CHƯA phải code đã triển khai — phần UI hôm nay chỉ có 1 loại kết nối (Facebook Page).
- **0 sửa đổi**: Product AI/Blog AI/Banner AI/Queue/Provider/Workflow/Plugin Framework. Không thêm Cloud Function/OAuth/Graph API thật nào.
- **Kiểm thử**: Node `vm` load mã nguồn thật — cả 4 trạng thái kết nối hiển thị đúng nút/label; đọc lỗi (rules chưa deploy) tự fallback an toàn; nút "Đăng lên Facebook" hiển thị đúng thông báo trung thực. **Chưa kiểm thử qua UI thật có đăng nhập.**

## Banner AI V2 (Sprint 12, Requirement #8)

Nâng Banner Generator (sinh 1 dòng tiêu đề nội bộ, ảnh luôn để trống) lên sinh banner publish-ready: Title/Subtitle/CTA do AI viết, Featured Product Image tự động gắn nếu Founder chọn Sản phẩm — cùng kiến trúc "AI chỉ viết văn bản, code tự chèn media thật" đã dùng xuyên suốt Media AI V2 (Requirement #4-#7).

```
inputFields: productId/promotion/event — CẢ 3 optional, Founder chọn đúng
1 (cùng pattern Facebook AI V3). buildPrompt() ground theo thứ tự: có Sản
phẩm > có Khuyến mãi > có Sự kiện > fallback chung nếu không điền gì.

Yêu cầu AI trả {"title","subtitle","cta"} — CHỈ văn bản, cấm tự bịa ảnh.

mapToDraftContent(): có productId → image = ảnh đầu Product thật,
galleryImages = ảnh còn lại (DataProvider.getProduct(), không tự bịa URL);
KHÔNG có productId → cả 2 rỗng, đúng "If no Product is selected, generate
text only." link/zone/order/active giữ nguyên hành vi cũ (link vẫn do
Founder tự nhập — Requirement này không yêu cầu Product Link cho Banner,
khác Facebook AI V3).
```

- **"Banner Draft Preview should display: Banner Image, Banner Title, Subtitle, CTA"**: `js/admin-ai.js`'s `draftBodyHtml()` thêm `bannerDraftHtml()` — hiển thị trực quan riêng cho `moduleId === 'banner-generator'`, mọi Plugin khác (Facebook AI V3, Product AI V2...) không đổi.
- **Không sửa `js/home.js`/`BannerDB`**: trang chủ thật vẫn đọc đúng `image`/`title`/`link`/`zone`/`active` như từ đầu — `subtitle`/`cta`/`galleryImages` là field MỚI, cộng thêm, chưa được trang chủ tiêu thụ (tương tự SEO Title/Meta Description ở Product AI V2 — lưu sẵn cho khi cần, không tự ý mở rộng giao diện trang chủ ngoài phạm vi Requirement).
- **0 sửa đổi**: Product AI/Blog AI/Facebook AI/Queue/Provider/Workflow/Plugin Framework.
- **Kiểm thử**: Node `vm` load mã nguồn thật — cả 3 nguồn input đều ground đúng (kể cả không điền gì); có Sản phẩm → `image`/`galleryImages` đúng; không có → cả 2 rỗng; fallback an toàn khi JSON hỏng (tới tận trường hợp hoàn toàn không có gì); `bannerDraftHtml()` hiển thị đúng, xác nhận không ảnh hưởng Facebook AI V3/Plugin khác qua test trực tiếp trên hàm thật.

## Media AI V2 — Requirement 2: Product & Blog Media (Sprint 12, Requirement #5)

Founder muốn Product/Blog do AI sinh ra trông giống 1 website công nghệ bình thường — có ảnh, có video, có link liên kết — nhưng KHÔNG sinh ảnh/video bằng AI (chưa tới giai đoạn Image AI/Video AI), chỉ tự động dùng đúng media THẬT đã có sẵn trong Firebase.

```
Product: youtubeUrl (Admin tự nhập, admin/products.html) → getYoutubeEmbedUrl()
         (js/category.js) → hiển thị player dưới gallery ảnh, tự ẩn nếu
         không có link. Gallery ảnh (Featured Image + ảnh phụ) đã có sẵn từ
         trước Sprint 12 — không cần sửa.

Blog: blog-writer.js thêm field productId (tuỳ chọn). buildPrompt() yêu cầu
      AI trả JSON {title, intro, sections:[{heading,paragraph}], conclusion}
      — CHỈ VĂN BẢN, cấm AI tự chèn <img>/<iframe> hay tự bịa URL.
      mapToDraftContent() tự lắp cấu trúc:

        Title → Featured Image (ảnh đầu của Product) → Intro →
        (H2 → Paragraph → Image xen kẽ các ảnh còn lại) × N →
        YouTube Video (nếu Product có youtubeUrl) → Conclusion →
        "Sản phẩm liên quan" (link category.html?product={id} thật)

      Ảnh/video CHỈ lấy từ DataProvider.getProduct() (dữ liệu Firebase
      thật) — không có productId → Blog Writer hoạt động y hệt trước (0
      regression); có productId nhưng thiếu ảnh/video → tự bỏ qua đúng
      phần đó, không lỗi/không để trống (đúng "skip that section
      gracefully").
```

- **`category.html`/`js/category.js`**: `#modalVideo` đặt trong `modal-img-side` (cần `flex-direction:column` để xếp đúng dưới gallery, không xếp ngang). Thêm hỗ trợ `?product={id}` — tự mở đúng modal khi tải trang (đọc thêm 1 query param có sẵn trên CÙNG URL `category.html`, không thêm route/trang mới) — để "Sản phẩm liên quan" cuối bài Blog có link THẬT dẫn đúng sản phẩm, không chỉ trỏ về trang danh mục chung chung (Product chưa có URL riêng từng sản phẩm, xem Requirement #4).
- **`js/ai/modules/blog-writer.js`**: cùng pattern JSON + `parseJsonResponse()` khoan dung/an toàn tuyệt đối đã dùng ở Product AI V2 (Requirement #4) — học từ đúng lỗi đã sửa ở Requirement #3 (tách theo dòng cố định dễ vỡ khi AI không theo đúng định dạng).
- **"Never invent image URLs. Never invent YouTube links."**: thực thi bằng kiến trúc, không chỉ bằng Prompt — mọi `<img>`/`<iframe>` trong `contentHtml` được CODE tự chèn từ dữ liệu Product thật đọc qua DataProvider, AI không có cách nào tự ý thêm URL media vào bài (Prompt chỉ yêu cầu văn bản thuần, không có chỗ nào cho AI trả về URL).
- **0 sửa đổi**: Queue/Provider/Plugin Framework/`js/ai/task-router.js` (AI routing)/Workflow/Image AI.
- **Kiểm thử**: Node `vm` load mã nguồn thật — lắp ráp media đúng thứ tự khi đủ ảnh/video; bỏ qua đúng từng phần khi thiếu (không lỗi); hồi quy đầy đủ luồng Blog Writer không chọn sản phẩm; JSON bọc fence/parse thất bại có fallback đúng; `getYoutubeEmbedUrl()` đúng 8/8 test case (kể cả URL không hợp lệ). Xác nhận qua Preview (dev server local, dữ liệu Firebase thật, thao tác click thật) — `?product=id` tự mở đúng modal, không ảnh hưởng field Requirement #4.

## Media AI V2 — Requirement 1: Product AI V2 (Sprint 12, Requirement #4)

Mục tiêu Sprint: Founder vận hành platform với nội dung AI THẬT, publish-ready — không chỉ 1 trường Mô tả. Nâng cấp `product-description-writer` (giữ nguyên `id`, không tạo Plugin mới) để sinh đầy đủ: Tên/Mô tả ngắn/Mô tả dài/Thông số chi tiết/Tính năng/FAQ/SEO Title/Meta Description/SEO Keywords/Slug/Tags/Danh mục/ALT Text — tái sử dụng NGUYÊN VẸN Plugin Framework/Queue/Provider/Draft System/Publish Pipeline (0 sửa `plugin-manager.js`/`job-queue.js`/`provider-registry.js`/`permission-service.js`).

```
buildPrompt() (js/ai/modules/product-description-writer.js) — yêu cầu AI
trả về ĐÚNG 1 khối JSON (khác hẳn cách tách theo dòng cố định của bản cũ —
chính cách tách dòng đó đã gây lỗi title/slug ở Blog AI, xem Requirement
#3) kèm danh sách mã category HỢP LỆ THẬT (DataProvider.getCategories())
để AI không tự bịa mã category không tồn tại.

parseJsonResponse() — tự loại code fence AI có thể tự thêm dù Prompt đã
yêu cầu không dùng (cùng nguyên nhân đã sửa ở Requirement #3), fallback
khoan dung (tìm khối {...} đầu tiên nếu AI chèn thêm câu giải thích), và
fallback AN TOÀN TUYỆT ĐỐI: JSON không parse được vẫn giữ nguyên toàn văn
làm Mô tả dài — không bao giờ để Draft rỗng ("Empty content after
Publish" không thể xảy ra dù AI trả lời sai định dạng thế nào).
```

- **Category validation khi Publish** (`js/admin-ai.js`, `publishToTarget()` nhánh `products`): chỉ chấp nhận mã category AI đề xuất nếu tồn tại VÀ đang `active` trong `CategoryDB` thật — cùng điều kiện `active !== false` mà `category.html` công khai đang dùng (`loadCategories()`). Nếu AI trả về mã không hợp lệ/đã tắt, bỏ field đó (giữ nguyên category hiện tại của sản phẩm) — không được để AI tự ý làm sai điều hướng category.html thật.
- **Rendering** (`js/category.js`/`category.html`/`css/style.css`): modal chi tiết sản phẩm thêm khối Mô tả ngắn/Thông số chi tiết/Tính năng (danh sách)/FAQ — TỰ ẨN hoàn toàn nếu sản phẩm chưa từng chạy Product AI V2 (0 sửa đổi trải nghiệm của toàn bộ sản phẩm cũ chưa generate lại). ALT Text dùng cho thuộc tính `alt` của ảnh (cả card lưới lẫn ảnh trong modal), fallback về tên sản phẩm nếu trống.
- **Giới hạn có chủ đích, không phải thiếu sót**: SEO Title/Meta Description/SEO Keywords/Slug được sinh và lưu đúng vào Product (đúng yêu cầu "Save all fields into Product") nhưng KHÔNG áp động vào `<title>`/`<meta>` — Product hiện chỉ có 1 modal dùng chung trên `category.html`, không có URL/trang riêng từng sản phẩm để 2 field này phát huy giá trị SEO thật (crawler không tương tác với modal JS) — lưu lại sẵn cho khi Product có trang chi tiết riêng, cố tình KHÔNG tự thêm route/trang mới (ngoài phạm vi "Do NOT redesign the architecture").
- **Kiểm thử**: Node `vm` load mã nguồn thật — JSON sạch/JSON bọc fence/JSON kèm câu giải thích thừa đều parse đúng; phản hồi hoàn toàn không phải JSON vẫn có fallback không rỗng; category không tồn tại hoặc đã tắt đều bị loại đúng, category hợp lệ giữ nguyên. Xác nhận qua Preview (dev server local, dữ liệu Firebase thật, thao tác click thật — không suy đoán): sản phẩm CŨ (chưa chạy Product AI V2) hiển thị đúng y hệt trước, không lộ khối trống nào.

## Media Content Rendering (Sprint 12, Requirement #3) — Blog List/Detail, Product Detail, Draft → Publish → Frontend

Founder báo Blog hiển thị `title:"```html"` (do OpenAI tự bọc cả phản hồi trong 1 khối code markdown và đặt tiêu đề trong thẻ `<h1>` ở dòng 2 thay vì dòng 1 dạng chữ thường như Prompt yêu cầu — `mapToDraftContent()` tách theo dòng cố định của `blog-writer.js`/`faq-generator.js` tách nhầm dòng fence thành title, tiêu đề thật lọt vào "excerpt"), `slug:"html"` (dễ đụng nhau giữa nhiều bài lỗi cùng kiểu), thân bài dính `` ``` `` thừa; Product mô tả cũng dính `` ```html ``/`` ``` `` ở đầu/cuối.

- **`js/admin-ai.js` (`publishToTarget`, "before saving")**: strip code fence khỏi `contentHtml`/`description`; khôi phục tiêu đề thật từ thẻ `<h1>` lộ trong excerpt/nội dung nếu `title` là fence rác; dọn excerpt; tái tạo slug từ tiêu đề ĐÃ SỬA. Chỉ áp dụng cho bản ghi sắp ghi vào `products`/`blogPosts` — không sửa `aiDrafts` gốc (không đổi Draft System).
- **`js/blog-list.js`/`js/blog-post.js`/`js/category.js` ("before rendering")**: cùng logic strip fence/khôi phục title áp dụng phòng thủ tại thời điểm hiển thị — bản ghi ĐÃ publish trước khi sửa (dữ liệu cũ đã hỏng) cũng hiển thị đúng ngay, không cần publish lại.
- **0 sửa đổi** AI generation/Queue/Provider/Plugin Framework.
- **Kiểm thử**: Node `vm` load mã nguồn thật + dữ liệu Firebase thật (bản ghi hỏng thật đã publish trước đó) — khôi phục đúng tiêu đề thật từ thẻ `<h1>` lộ trong dữ liệu thật, nội dung sạch đi qua không đổi (0 hồi quy trên toàn bộ sản phẩm/bài viết thật). Xác nhận qua Preview (dev server local, dữ liệu Firebase thật, thao tác click thật).

## Sửa lỗi thật phát hiện qua điều tra Production (Sprint 12, Requirement #2) — Entity Near-Miss, 2 Route còn thiếu, Nhầm lẫn tên Sidebar

Founder Acceptance Test của Requirement #3.2 (Sprint 11) ban đầu báo PASS, sau đó Founder tự phát hiện + báo lại THẤT BẠI thật trên `pshopmusic.com` với đúng câu gốc "Viết mô tả cho AlphaTheta XDJ AN". Điều tra bắt buộc dùng dữ liệu Firebase THẬT (đọc trực tiếp `products.json` qua REST công khai, KHÔNG dùng mock) theo đúng yêu cầu — xác nhận Root Cause: sản phẩm thật tên `"PIONEER XDJ-RX3 ALL-IN-ONE DJ SYSTEM"` (brand `"AlphaTheta"`), KHÔNG hề có sản phẩm "XDJ-AN" trong 42 sản phẩm thật. Ví dụ Validation "XDJ AN→AlphaTheta XDJ-AN" ở Requirement #3.2 trước đó chỉ là dữ liệu MOCK để test — chưa từng khớp với dữ liệu thật. Token "an" trong câu gõ không khớp bất kỳ token nào trong `name`/`brand`/`specs` thật của sản phẩm → cả 4 tầng thất bại đúng thiết kế (2/3 token "alphatheta"+"xdj" khớp qua tầng ALIAS, thiếu 1/3 nên không đủ `MIN_TOKEN_OVERLAP_RATIO = 1`). Không phải lỗi thuật toán, nhưng trải nghiệm "báo thẳng không tìm thấy" khi đã khớp đa số từ chưa tối ưu — bổ sung near-miss fallback bên dưới.

```
scoreItem() (js/ai/task-router.js) — bổ sung field weakRatio bên cạnh
{tier, ratio} đã có:
  weakRatio = max(nameRatio, aliasRatio)   // CHỈ tính khớp ĐÚNG 1 token
                                            // trọn vẹn — KHÔNG tính
                                            // partialRatio (chuỗi con) vì
                                            // dễ trùng giả (vd "an" là
                                            // chuỗi con của "sandisk").

matchTarget() — thêm NEAR_MISS_THRESHOLD = 0.5:
  Không ứng viên nào đạt đủ 100% ở tầng nào (scored rỗng)
    NHƯNG có ứng viên weakRatio >= 0.5
      → trả reason: 'target_ambiguous' với ứng viên đó (dù chỉ 1)
      → tái dùng NGUYÊN VẸN showAmbiguousPicker() đã có (Sprint 4 #3)
      → Founder bấm "Chọn" để xác nhận — KHÔNG BAO GIỜ tự chọn/tự chạy.
```

- **Near-Miss Fallback**: xem khối trên. Founder gõ tên viết tắt/nhớ nhầm 1 phần (như "XDJ AN" cho "XDJ-RX3") giờ nhận được 1 đề xuất xác nhận thay vì báo thẳng thất bại, vẫn giữ nguyên tắc "không đoán mò" (yêu cầu xác nhận qua UI, không tự thực thi).
- **2 route còn thiếu — `faq-generator`/`image-prompt-generator`**: cả 2 Plugin đã tồn tại từ Sprint 5/6 (đã có trên `admin/ai/index.html`, đã có Permission `ai.generate.faq`/`ai.generate.imagePrompt` từ trước) nhưng CHƯA TỪNG được đăng ký trong `AI_TASK_ROUTES` — AI Assistant hội thoại luôn trả `plugin_not_found` cho MỌI câu về ảnh/FAQ, không liên quan gì đến entity matching. Thêm 2 route mới, `targetType:'freeText'` (giống Blog Writer/Banner Generator — không nhắm thực thể CMS có sẵn). Lưu ý: `image-prompt-generator` CHỈ sinh văn bản prompt mô tả ảnh (để dùng ở công cụ tạo ảnh AI khác) — KHÔNG sinh ảnh thật, đúng thiết kế gốc từ Sprint 6, không đổi ở đây.
- **Nhầm lẫn tên Sidebar**: `ADMIN_NAV` (`js/admin-auth.js`) có 2 mục gần trùng tên trỏ 2 trang hoàn toàn khác nhau — `"Trợ lý AI"` (ô chat hội thoại thật) và `"AI Assistant"` (Plugin Dashboard thủ công) — Founder xác nhận đã bấm nhầm mục thứ 2. Đổi label thành `"Plugin AI (Thủ công)"`; đồng bộ đổi `title` hiển thị trên cả cụm 13 trang Plugin/Engineering Framework (`index/drafts/jobs/logs/providers/plugins/cost-tracking/context-builder/observability/health/workflow-insights/usage/workflow.html`) từ tiền tố `"AI ASSISTANT — ..."` sang `"PLUGIN AI — ..."` (cùng nguyên nhân gốc: share tiêu đề với đúng trang Trợ lý AI hội thoại, `js/admin-ai-assistant.js` không đổi); đổi thêm 1 quick-link tương tự ở `admin/index.html`. **`FOUNDER_SMART_NAV`'s "AI Content"/"AI Image" cùng trỏ `index.html` là giới hạn ĐÃ GHI NHẬN từ Sprint 10 Requirement #5 — KHÔNG thuộc phạm vi sửa lần này.**
- **0 sửa đổi**: Firebase, Cloud Functions, `provider-registry.js`, `provider-interface.js`, `plugin-manager.js`, `job-queue.js`, `permission-service.js`, mọi file Plugin (`js/ai/modules/*.js`), `js/admin-ai-assistant.js` (near-miss tái dùng nguyên cơ chế `target_ambiguous` đã có, không cần sửa Experience Layer).
- **Kiểm thử**: Node `vm` load thẳng mã nguồn thật + dữ liệu Firebase THẬT (42 sản phẩm thật qua REST công khai, không mock) — 0/42 hồi quy khi gõ đúng tên đầy đủ; câu gốc bug report nay trả `target_ambiguous` với ĐÚNG 1 đề xuất; câu hoàn toàn không liên quan vẫn đúng `target_not_found`; phát hiện + sửa 1 false-positive khi test với TOÀN BỘ 42 sản phẩm thật (near-miss ban đầu đề xuất nhầm thêm "SANDISK EXTREME PRO CZ880" vì "an" là chuỗi con của "sandisk" — sửa bằng cách loại `partialRatio` khỏi `weakRatio`); "RX3" viết tắt (hồi quy Requirement #3.2) vẫn đúng; 2 route mới trả `reason:'ok'` cho nhiều cách diễn đạt. Kiểm tra qua Preview (dev server local) xác nhận 0 lỗi console khi tải `admin/index.html`/`admin/ai/assistant.html` với toàn bộ script đã sửa — **chưa kiểm thử được qua UI thật có đăng nhập** (cần tài khoản Founder thật).

## Founder AI Assistant First (Sprint 12, Requirement #1) — mở rộng `AITaskRouter` sang 3 Plugin mới + targeting tuỳ chọn

Tiếp tục tinh thần "Founder không cần hiểu Provider/Plugin/Queue/Workflow" — AI Assistant hội thoại (`admin/ai/assistant.html`) trước đây chỉ định tuyến được 3/8 Plugin (Product Description/SEO/Slider, mọi route đều BẮT BUỘC xác định 1 thực thể CMS có sẵn). Sprint 12 mở rộng sang Facebook Post Generator/Blog Writer/Banner Generator — 3 Plugin có bản chất khác: Blog Writer/Banner Generator viết nội dung MỚI theo chủ đề tự do (không nhắm thực thể có sẵn), Facebook Post Generator có `productId` TUỲ CHỌN (xem `js/ai/modules/*.js` — không sửa các file Plugin này).

```
AI_TASK_ROUTES (js/ai/task-router.js) — mỗi route khai báo thêm 2 thuộc
tính TUỲ CHỌN (route cũ không khai báo = giữ nguyên hành vi bắt buộc):

  targetType: 'freeText'   → route() bỏ qua matchTarget() hoàn toàn,
                              dùng nguyên văn phần câu còn lại (sau khi
                              loại từ khóa ý định của MỌI route +
                              extractFreeText()) làm input tự do —
                              dùng cho blog-writer/banner-generator.
  targetRequired: false    → route() vẫn thử matchTarget() bình thường;
                              nếu KHÔNG có ứng viên nào (không phải mơ
                              hồ) vẫn tiếp tục với nội dung tự do còn
                              lại; nếu MƠ HỒ (nhiều ứng viên cùng khớp)
                              vẫn dừng lại hỏi Founder như route bắt
                              buộc — KHÔNG BAO GIỜ đoán mò dù target là
                              tuỳ chọn — dùng cho facebook-post-generator.
```

- **`dispatch()` đổi điều kiện chặn** từ `!routeResult.targetId` sang `routeResult.reason !== 'ok'` — vì `targetId: null` giờ có thể là kết quả HỢP LỆ (route freeText/optional đã đủ `inputParams` để chạy), không còn đồng nghĩa với "chưa xác định được đối tượng" như trước. Không đổi cách gọi `PermissionService.checkPluginExecution()` → `PluginManager.loadPlugin().execute()` (đúng thứ tự, đúng tham số, 0 sửa 2 file đó).
- **`js/admin-ai-assistant.js` sửa đúng 1 điều kiện tương tự** ở `handleSend()` (cùng lý do) — nếu không sửa, UI sẽ tự chặn nhầm các route mới ngay cả khi Router đã xử lý đúng và trả `reason:'ok'`.
- **Requirement #2 (danh sách xác nhận khi mơ hồ)/#3 (báo rõ khi không tìm thấy) đã có sẵn từ Sprint 4 Requirement #3** (`showAmbiguousPicker()`, `reasonMessage()`) — hoạt động đúng ngay với 3 route mới mà không cần sửa thêm, vì cả 2 hàm đều đọc `routeResult.ambiguous`/`routeResult.reason` một cách tổng quát, không hardcode theo route cụ thể.
- **Từ khóa ý định mở rộng** (Requirement #6): `product-description-writer` thêm `'product description'`; `seo-generator` thêm `'meta title'`/`'meta description'`; 3 route mới nhận `'facebook'`/`'blog'`/`'website'`/`'banner'`. **Cố tình KHÔNG thêm** `'rewrite'`/`'translate'` — chưa có Plugin dịch thuật/viết-lại thật sự, gán những từ này vào 1 Plugin gần giống sẽ là tự nhận có khả năng chưa tồn tại (vi phạm AI_RULES.md mục 2 "AI không được tự bịa") — ghi vào `ROADMAP.md`.
- **Giới hạn kiến trúc xác nhận lại (không phải lỗi mới)**: "SEO [tên sản phẩm]" không tự hoạt động — `seo-generator` chỉ nhắm Blog Post (`targetType:'blogPost'`), không nhắm Product, đúng thiết kế từ Sprint 3 (Product chưa có trang riêng để gắn Meta/OG/Schema). Route vẫn chọn đúng Plugin SEO nhưng `matchTarget()` tìm trong danh sách Blog Post nên không thấy sản phẩm — trả `target_not_found` đúng, KHÔNG ép sai entity type.
- **0 sửa đổi**: Firebase, Cloud Functions, `js/ai/provider-registry.js`, `js/ai/provider-interface.js`, `js/ai/plugin-manager.js`, `js/ai/job-queue.js`, `js/ai/permission-service.js`, mọi file Plugin (`js/ai/modules/*.js`) — đúng phạm vi "Improve ONLY the conversational AI Assistant".
- **Kiểm thử**: Node `vm` load thẳng `js/ai/task-router.js` thật — 18/18 kịch bản PASS (4 Validation chính thức + 6 Goal examples + ambiguity cho cả 2 kiểu targeting + "không tìm thấy" + toàn bộ hồi quy Sprint 11 #3.2 + xác nhận `dispatch()` vẫn gọi đúng `PermissionService`→`PluginManager` cho route freeText mới).

## Natural Language Entity Resolution (Sprint 11, Requirement #3.2) — nâng cấp `AITaskRouter.matchTarget()`

Đóng khoảng hở phát hiện qua Founder Acceptance Test thật: AI Assistant hội thoại (`admin/ai/assistant.html`) báo "không xác định được đúng sản phẩm" ngay cả khi ý định đã hiểu đúng, vì `matchTarget()` (Sprint 4) bắt buộc câu gõ chứa NGUYÊN VĂN tên đầy đủ — không tới lượt `PermissionService`/`PluginManager`/`Queue`/`Provider` được gọi tới.

```
matchTarget(text, route, candidates) — so khớp 4 tầng, ưu tiên rõ ràng,
KHÔNG BAO GIỜ đoán mò (nhiều ứng viên cùng tầng/độ khớp cao nhất → trả về
danh sách mơ hồ, giữ nguyên cơ chế Sprint 4 Requirement #3):

  Tầng 4 EXACT          — câu gõ (chuẩn hoá dấu câu/gạch nối → khoảng
                           trắng) chứa nguyên tên (chuẩn hoá tương tự)
  Tầng 3 TOKEN OVERLAP   — mọi từ có nghĩa trong câu gõ khớp ĐÚNG 1 từ
                           trong tên (loại từ thuộc "từ khóa ý định" của
                           MỌI route + từ nối chung trước khi so khớp)
  Tầng 2 ALIAS           — giống Token Overlap, so thêm brand/specs ĐÃ
                           CÓ SẴN trên Product (không thêm field mới)
  Tầng 1 PARTIAL         — từ trong câu gõ là chuỗi con của 1 từ trong
                           tên/brand/specs (vd "8050" khớp "8050B")
```

- **Vẫn HOÀN TOÀN rule-based** — không AI/LLM, không gọi OpenAI, không embedding/vector search, đúng ràng buộc Sprint 4 Requirement #8 ("Router không thể dùng AI thật để phân loại ý định"). Chỉ nâng cấp thuật toán so khớp CHUỖI/TỪ xác định (deterministic).
- **`ROUTE_KEYWORD_WORDS`** — tự tính từ TOÀN BỘ `keywords` của mọi route trong `AI_TASK_ROUTES` (không phải danh sách stopword tay cố định) — tránh các từ mô tả Ý ĐỊNH ("mô", "tả", "sản", "phẩm", "seo"...) bị hiểu nhầm là 1 phần TÊN thực thể cần tìm. Tự cập nhật khi có route/từ khóa mới, không cần sửa tay.
- **0 sửa đổi** `matchRoute()`/`route()`/`dispatch()`/`AI_TASK_ROUTES` (chữ ký + hành vi chọn Plugin theo từ khóa giữ nguyên hoàn toàn) và 0 sửa đổi bất kỳ file nào khác trong AI Framework (`plugin-manager.js`/`job-queue.js`/`provider-registry.js`/`permission-service.js`/`functions/index.js`) — đúng phạm vi "Improve ONLY the entity matching algorithm".
- **Kiểm thử**: Node `vm` load thẳng `js/ai/task-router.js` thật — 11/11 kịch bản PASS, gồm 4 ví dụ Validation chính thức + hồi quy đầy đủ (khớp tên đầy đủ cũ vẫn đúng cho cả 3 route Product/SEO/Slider; câu không khớp từ khóa nào vẫn `plugin_not_found`; nhiều ứng viên cùng khớp vẫn trả `target_ambiguous` thay vì tự chọn; tầng EXACT luôn thắng đúng, không lẫn giữa các sản phẩm có tên gần giống nhau).
- **Giới hạn còn lại, ngoài phạm vi Requirement này**: `matchRoute()` (nhận diện Ý ĐỊNH qua `keywords`) chưa cải thiện — từ đồng nghĩa ngoài danh sách (vd "content" thay "mô tả") vẫn không nhận diện được Ý ĐỊNH. SEO Generator vẫn chỉ nhắm Blog Post, không nhắm Product — giới hạn kiến trúc kế thừa từ Sprint 3, không đổi ở đây.

## Deployment thật của `pshopmusic.com` (Sprint 11, Requirement #3.2) — GHI NHỚ cho mọi Sprint sau

**Quan trọng — đọc mục này TRƯỚC khi cho rằng "đã push lên `feature/cms-ai-sprint2` là site Production sẽ tự cập nhật".** Không đúng: `pshopmusic.com` KHÔNG kết nối Git Continuous Deployment trên Netlify.

```
Netlify account tieucaca2004@gmail.com có 4 site:
  beautiful-pixie-427b63  → pshopmusic.com          ← site THẬT đang public, KHÔNG git-linked
  pshop-music             → pshop-music.netlify.app ← 1 project Next.js/MySQL KHÁC hoàn toàn (Sprint 10 Planning nhầm branch?), không liên quan CMS Firebase này
  elaborate-sunburst-...  → *.netlify.app            (chưa xác định mục đích)
  kaleidoscopic-figolla-. → atieu.com                 (không liên quan)
```

- `pshopmusic.com` = site `beautiful-pixie-427b63`, deploy qua **Netlify CLI thủ công** (`netlify deploy`), KHÔNG có Repository/Production Branch/Build Configuration trong Netlify Dashboard — xác nhận qua `netlify api listSiteDeploys`: `deploy_source:"cli"`, `commit_ref:null`, `build_id:null` cho mọi bản deploy trước đó.
- Vì vậy: **mọi lần `git push` lên `feature/cms-ai-sprint2` từ Sprint 2 (nửa sau) tới Sprint 11 KHÔNG hề tự động lên Production** — site đứng yên ở 1 bản build cũ (~giữa Sprint 2) suốt gần 9 Sprint, cho tới khi phát hiện + deploy thật ở Requirement #3.2.
- **Quy trình deploy đúng (cho tới khi có Decision Record đổi sang Git-linked deploy)**:
  ```bash
  # 1. Export ĐÚNG nội dung đã commit (không lẫn file chưa commit/draft):
  git archive HEAD | tar -x -C <thư mục tạm>
  # 2. Loại bỏ phần KHÔNG phải nội dung web (Cloud Function Firebase deploy
  #    riêng qua `firebase deploy`, không phải Netlify Function; docs/tài
  #    liệu nội bộ; file cấu hình CLI; di sản wordpress-theme/data/scripts
  #    không trang nào tham chiếu):
  rm -rf functions docs scripts wordpress-theme data
  rm -f *.md firebase.json .firebaserc database.rules.json storage.rules .gitignore
  # 3. Draft deploy trước để kiểm tra (KHÔNG --prod):
  netlify deploy --dir=<thư mục tạm> --no-build
  # 4. Sau khi xác nhận đúng nội dung → promote lên Production:
  netlify deploy --dir=<thư mục tạm> --no-build --prod
  ```
  Project đã sẵn `netlify link` (file `.netlify/state.json`, gitignored, KHÔNG commit) trỏ đúng `beautiful-pixie-427b63` — không cần `netlify link` lại.
- **Site `pshop-music` (`pshop-music.netlify.app`) là 1 project HOÀN TOÀN KHÁC** — Next.js + MySQL (Aiven), có `admin/` riêng, không liên quan gì tới CMS Firebase/AI Framework của dự án này. Nằm trên nhánh `main`/`master` của CÙNG repo GitHub (khác hẳn nội dung `feature/cms-ai-sprint2`) — **KHÔNG merge `feature/cms-ai-sprint2` vào `main`**, không động vào `main` — đúng nguyên tắc xuyên suốt dự án.
- **Đề xuất cho tương lai (chỉ ghi nhận, chưa quyết định)**: cân nhắc kết nối `pshopmusic.com` với Git Continuous Deployment thật (trỏ đúng `feature/cms-ai-sprint2`, hoặc 1 nhánh Production riêng), để không phải deploy tay mỗi lần — cần Chief Architect quyết định (ảnh hưởng vận hành, không phải quyết định kỹ thuật đơn thuần).

## AI Provider Initial Setup (Sprint 11, Requirement #3.1)

Đóng khoảng cách cuối cùng giữa "hạ tầng đã kích hoạt thật" (Requirement #3) và "Founder Generate được ngay, không cần tự cấu hình Provider" (Product Constitution: Founder không cần hiểu Provider/Plugin/Queue/Workflow):

```
ProviderConfigDB.get() (js/ai/ai-db.js)
   → đọc aiProviderConfig thật từ Firebase
   → NẾU chưa từng cấu hình (node rỗng HOẶC activeProvider:'none'
      HOẶC activeProvider:'openai' nhưng enabled:false — trạng thái
      không nhất quán)
        → tự khởi tạo activeProvider:'openai', providers.openai:
           {enabled:true, model:'gpt-4o-mini'}, LƯU THẬT vào Firebase
           (không chỉ trả về mặc định tạm như trước) — chỉ 1 lần, điều
           kiện tự triệt tiêu sau khi đã khởi tạo
   → NẾU Founder đã chủ động chọn Provider khác (Claude/Gemini/DeepSeek)
      HOẶC đã tự chỉnh model OpenAI khác mặc định → giữ NGUYÊN, không đụng
   → trả về config cho AIProviderRegistry.getActive()/resolveForPlugin()
      (js/ai/provider-registry.js, KHÔNG sửa) như cũ
```

- **Root Cause đã xác nhận (Requirement #3, đợt trước)**: hạ tầng (Cloud Function `openaiProxy`, Secret `OPENAI_API_KEY`, Billing) đã hoạt động thật — nhưng `aiProviderConfig` chưa từng được ghi vào Firebase, vì `ProviderConfigDB.get()` (bản cũ) chỉ TRẢ VỀ 1 object mặc định `activeProvider:'none'` ở bộ nhớ khi node rỗng, không bao giờ tự lưu — nên `AIProviderRegistry.getActive()` luôn reject "Chưa chọn nhà cung cấp AI nào" cho tới khi Founder tự tay vào `admin/ai/providers.html` bật OpenAI + bấm Lưu.
- **Cùng pattern `ensureSeeded()` đã có** (`CategoryDB`/`PluginDB` trong `js/cms-db.js`/`js/ai/plugin-db.js`) — ghi thật vào Firebase khi node rỗng, không phải kỹ thuật mới, không tạo Database node mới (vẫn đúng `aiProviderConfig`).
- **An toàn tuyệt đối với lựa chọn thật của Founder**: điều kiện tự khởi tạo CHỈ kích hoạt khi chưa có cấu hình ý nghĩa nào — Founder tự đổi Provider active hoặc tự chỉnh model OpenAI đều được tôn trọng nguyên vẹn, không bao giờ bị ghi đè.
- **0 sửa đổi** `js/ai/provider-registry.js`, `js/ai/provider-interface.js`, `js/ai/plugin-manager.js`, `js/ai/job-queue.js`, `js/ai/permission-service.js`, `js/ai/providers/*.js`, `functions/index.js` — chỉ đúng 1 file `js/ai/ai-db.js` (data layer, không phải Framework core) thay đổi.
- **Kiểm thử**: 11/11 assertion PASS qua harness tạm thời (đã xoá) — node rỗng tự khởi tạo + ghi thật; ổn định qua nhiều lần gọi; `activeProvider:'none'` tường minh vẫn tự khởi tạo; lựa chọn Claude/model OpenAI tuỳ chỉnh của Founder được giữ nguyên; trạng thái không nhất quán (`openai` active nhưng `enabled:false`) tự "chữa lành" đúng.
- **Chưa xác minh Generate thật end-to-end trên Production** — cần Chief Architect tự thử trên CMS thật (môi trường này không có đăng nhập CMS Production). Đã xác nhận riêng, đọc-only: cả URL cũ lẫn URL Cloud Run thật của `openaiProxy` đều phản hồi đúng (HTTP 405 cho GET) — không cần sửa `OPENAI_PROXY_URL`.

## AI Provider Runtime Activation — Audit (Sprint 11, Requirement #3)

**Không có thay đổi runtime nào ở Requirement này** — chỉ audit trạng thái sẵn sàng deploy + tạo tài liệu vận hành. Xem `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md` cho đầy đủ.

- **Code đã sẵn sàng, chưa từng được kích hoạt**: Cloud Function `openaiProxy` (`functions/index.js`, Sprint 3) đúng kiến trúc Proxy (Secret Manager qua `defineSecret('OPENAI_API_KEY')`, xác thực Firebase Auth ID token + `roles/{uid}` có sẵn — không tạo hệ thống Auth mới), `firebase.json`/`.firebaserc` wiring đúng, `js/ai/providers/openai.js` gọi đúng qua Proxy (không lộ Key phía client). Xác nhận syntactically hợp lệ (`node -c` PASS) và dependencies đã cài (`firebase-admin`/`firebase-functions` trong `node_modules`).
- **Chưa deploy được từ môi trường này** — không có Firebase CLI (`command -v firebase` không tìm thấy), không có phiên đăng nhập, không có API Key OpenAI thật. Deploy Cloud Function + thiết lập Secret Manager là hành động vận hành đòi hỏi quyền Owner/Editor thật trên project `pshop-music` + gói Blaze — không thể tự động hoá hay giả lập từ môi trường phát triển.
- **`OPENAI_PROXY_URL`** (hằng số trong `js/ai/providers/openai.js`) hiện là URL suy ra theo đúng quy ước Cloud Functions v2 (`https://us-central1-pshop-music.cloudfunctions.net/openaiProxy`) — **chưa xác nhận là URL thật**, cần đối chiếu với URL Firebase CLI in ra sau khi deploy (đúng TODO comment đã có sẵn trong file từ Sprint 3).
- **Claude/Gemini/DeepSeek (`js/ai/providers/{claude,gemini,deepseek}.js`) vẫn là stub CỐ Ý** — `validate()`/`health()` đúng khuôn `IAIProvider`, nhưng `generate()` luôn reject rõ ràng, không bịa nội dung. Đây là quyết định kinh doanh còn treo từ Sprint 8 (Architecture Challenge #5) — KHÔNG tự viết tích hợp thật ở Requirement này (cần API Key thật của Anthropic/Google + quyết định kinh doanh riêng, ngoài phạm vi "kích hoạt Runtime đã có").
- **0 sửa đổi**: `js/ai/plugin-manager.js`, `js/ai/job-queue.js`, `js/ai/provider-interface.js`, `js/ai/provider-registry.js`, `js/ai/permission-service.js`, `js/ai/workflow-engine.js`, `functions/index.js`, toàn bộ `js/ai/providers/*.js` — đúng Architecture Rule của Requirement, không cần Decision Record vì không đề xuất thay đổi kiến trúc nào (chỉ audit + runbook).
- **Tạo mới `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md`** — cùng cấu trúc `docs/FIREBASE_RULES_DEPLOYMENT.md`/`docs/FIREBASE_STORAGE_RULES_DEPLOYMENT.md` (Sprint 9): tình trạng hiện tại (không suy đoán), điều kiện tiên quyết, lệnh deploy + thiết lập Secret, kích hoạt qua `admin/ai/providers.html`, checklist xác minh 8 mục, rollback (`firebase functions:delete`).
- **Chưa xác minh được** (Honesty Rule — không tuyên bố nếu chưa kiểm chứng): Provider OpenAI hoạt động thật; Product AI Generation end-to-end thật; One Click Marketing sinh Draft AI thật. Cả 3 đòi hỏi người vận hành tự thực hiện `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md` trước.

## AI Assist Inline CMS Forms (Sprint 11, Requirement #2)

Đưa AI vào thẳng form Sản phẩm (`admin/products.html`) — Founder không rời trang, không mở AI Center (`admin/ai/index.html`). CHỈ là Experience Layer — file mới `js/admin-products-ai-assist.js` (`ProductAIAssist`), KHÔNG sửa `js/admin-products.js` (Product Manager gốc, Sprint 1), KHÔNG sửa AI Framework:

```
Founder → admin/products.html → mở/lưu 1 sản phẩm (co #pId)
       → bấm "✨ VIẾT MÔ TẢ BẰNG AI" (js/admin-products-ai-assist.js)
       → PermissionService.checkPluginExecution(uid, email, 'product-description-writer')
       → PluginManager.loadPlugins() (đảm bảo aiPlugins đã seed — cùng phát hiện Requirement #1)
       → PluginManager.loadPlugin('product-description-writer').execute([{productId, tone}], uid, email)
       → AIJobQueue.resume(uid, email)  (đúng luồng js/admin-ai.js đã dùng)
       → Trạng thái Job hiển thị NGAY DƯỚI nút (poll 3 giây, tự dừng khi xong)
       → Hoàn tất → xem trước nội dung Draft NGAY TRONG form
            → "ÁP DỤNG VÀO MÔ TẢ" → AdminAI.publishDraftById(draftId)
                 (tái sử dụng NGUYÊN VẸN Publish flow đã có — DB.update() qua publishToTarget())
                 → đồng bộ lại #pDescriptionEditor .ql-editor
            → "TỪ CHỐI" → AdminAI.rejectDraftById(draftId) (không đổi sản phẩm)
       → Thất bại → hiển thị ĐÚNG lỗi thật từ Queue + nút "THỬ LẠI" (AIJobQueue.retryFailed())
```

- **Không tham chiếu biến nội bộ của `AdminApp`** (IIFE riêng trong `js/admin-products.js`, không export biến `editingId`/`quill`) — `ProductAIAssist` đọc `productId` hiện tại qua DOM (`document.getElementById('pId').value`, do `editProduct()`/`resetForm()` đã tự set/clear) và ghi kết quả Áp dụng trực tiếp vào `#pDescriptionEditor .ql-editor` (đúng kỹ thuật `editProduct()` đã dùng cho `quill.root.innerHTML`) — **0 sửa đổi `js/admin-products.js`**, giảm tối đa rủi ro regression cho Product Manager gốc.
- **Tái sử dụng `AdminAI.publishDraftById()`/`rejectDraftById()`** (đã có từ Sprint 4 Requirement #2, xem `js/admin-ai.js`) — 2 hàm này vốn được thiết kế để publish/reject 1 Draft biết trước id mà KHÔNG cần gọi `AdminAI.initDashboard()`/`initDrafts()` (đúng docstring gốc: "cho phép AI Assistant... publish/reject 1 Draft... không cần gọi initDrafts()"), cùng pattern `admin/ai/assistant.html` (Sprint 4) đã dùng — `admin/products.html` nạp `js/admin-ai.js` nhưng chỉ gọi 2 hàm này, không gọi `initDashboard()`/`initDrafts()`/`initJobs()`/`initLogs()` nên không có tác dụng phụ (không tự chạy `AdminAuth.init()` thừa).
- **Chỉ hỗ trợ Mô tả sản phẩm** (`product-description-writer`) ở Requirement này. Kiến trúc đủ mở rộng cho Tên sản phẩm/Mô tả ngắn/SEO Title/SEO Description/Keywords (chỉ cần thêm 1 entry `moduleId` + field DOM tương ứng trong `ProductAIAssist`, không đổi `generate()`/`pollJob()`) — KHÔNG tự làm thêm, chưa được giao/phê duyệt.
- **Nút chỉ hoạt động với sản phẩm đã lưu** (`#pId` có giá trị) — `product-description-writer` bắt buộc `productId` thật (đọc qua `DataProvider.getProduct()`), sản phẩm mới chưa lưu hiển thị hướng dẫn rõ ràng thay vì lỗi khó hiểu.
- **Không có đường tắt bỏ qua RBAC/Draft Review**: `PermissionService.checkPluginExecution()` gọi trước MỌI Job (giống hệt `admin-ai.js`); kết quả AI luôn dừng ở Draft, Founder phải chủ động bấm "ÁP DỤNG" — không tự động ghi đè mô tả.
- **Không bịa nội dung khi lỗi**: nếu Provider chưa cấu hình/chưa deploy Cloud Function `openaiProxy`, hiển thị đúng nguyên văn lỗi từ `AIJobQueue`, không dùng placeholder text.
- Nạp thêm bộ script AI Framework + `js/admin-ai.js` vào `admin/products.html` (đúng bộ 5 trang `admin/ai/*.html` đã dùng).
- **Kiểm thử xác nhận**: harness trình duyệt tạm thời (mock Firebase, đã xoá) chạy Product Manager thật (42 sản phẩm seed) — Job tạo đúng `inputParams`, thất bại đúng lý do "Chưa chọn nhà cung cấp AI" khi chưa cấu hình Provider; đăng ký tạm 1 Provider giả lập (chỉ để kiểm thử, không phải code Production) → "THỬ LẠI" → Job hoàn tất, Draft tạo thật → "ÁP DỤNG" ghi đúng `description` vào `products/{id}` + đồng bộ Quill editor; "TỪ CHỐI" ở sản phẩm khác không đổi `description`. 0 lỗi console. `git diff` xác nhận 0 thay đổi `js/admin-products.js`/`js/admin-ai.js`/`admin/ai/*.html`/mọi file gated — AI Center không bị regression.

## One Click Marketing — Cầu nối Generate Thật (Sprint 11, Requirement #1)

Lấp khoảng hở "Generate giả" đã ghi nhận ở `docs/SPRINT_10_FINAL_REPORT.md` — nối 4/6 output của Gói Marketing với đúng Plugin AI đã Production, tái sử dụng NGUYÊN VẸN `PluginManager`/`AIJobQueue`/`PermissionService`/`AIProviderRegistry` (0 sửa đổi các file này). `js/one-click-marketing.js` (hàm thuần `buildMarketingPackage()`) cũng giữ nguyên — toàn bộ logic gọi AI mới nằm ở lớp Experience (`js/admin-one-click-marketing.js`):

```
Founder → Review Center (Bước 5) → bấm "GENERATE"
       → PluginManager.loadPlugins() (đảm bảo aiPlugins đã seed — xem "Phát hiện khi triển khai" bên dưới)
       → với từng output có Plugin tương ứng (song song, KHÔNG batch chung 1 Job):
            PermissionService.checkPluginExecution(uid, email, moduleId)
                 → PluginManager.loadPlugin(moduleId).execute([inputParams], uid, email)
                 → AIJobQueue.resume(uid, email)  (đúng luồng js/admin-ai.js đã dùng)
       → Trạng thái Job (queued/running/completed/failed) hiển thị ngay dưới mỗi output,
            poll 3 giây (cùng chu kỳ admin/ai/jobs.html), dừng khi mọi Job đã kết thúc
       → Draft that (neu Provider da cau hinh/deploy) van chi vao aiDrafts — Publish
            van qua admin/ai/drafts.html, KHONG tu Publish o day
```

- **Ánh xạ 4 output → Plugin** (`buildAIJobPlan()`, hàm thuần trong `js/admin-one-click-marketing.js`): Website Draft → `blog-writer` (`topic`=Tên sản phẩm+Khuyến mãi, `tone`='Chuyên nghiệp' mặc định, `keywords`=Danh mục hoặc Tên sản phẩm); Facebook Draft → `facebook-post-generator` (`productId` tuỳ chọn, `message`=Khuyến mãi); Banner Request → `banner-generator` (`theme`=Khuyến mãi/Tên sản phẩm, `link`=trang danh mục hoặc trang chủ); Image Request → `image-prompt-generator` (`subject`=Tên sản phẩm+Khuyến mãi, `style`='Ảnh sản phẩm studio' mặc định). Chỉ tạo kế hoạch khi đã có Tên sản phẩm (Bước 2) — thiếu thì không đủ nội dung có nghĩa để Generate.
- **"SEO Metadata" KHÔNG nối được** — `js/ai/modules/seo-generator.js` bắt buộc 1 `postId` của Blog Post ĐÃ TỒN TẠI THẬT (đọc qua `DataProvider.getBlogPost()`), trong khi One Click Marketing chưa từng tạo Blog Post nào. Giữ nguyên dạng mẫu/Foundation, có ghi chú rõ trong Review Center — không ép nối sai chỗ, không redesign `seo-generator.js`.
- **"Video Request" vẫn chưa có Plugin AI Video** — không đổi so với Requirement #3.
- **Mỗi output là 1 Job riêng** (không gộp `items` batch) — 1 output lỗi (vd thiếu quyền) không chặn các output còn lại tạo Job.
- **Không đổi Permission**: gọi đúng `PermissionService.checkPluginExecution()` (cùng hàm `admin-ai.js` dùng) trước MỖI Job — không có đường tắt bỏ qua RBAC dù gọi từ Wizard thay vì Dashboard.
- **Phát hiện khi triển khai — seeding `aiPlugins`**: `PluginDB.get(id)` (dùng trong `PluginManager.loadPlugin()`) KHÔNG tự seed — seeding mặc định chỉ chạy trong `PluginDB.getAll()`. Vì One Click Marketing có thể là trang AI đầu tiên 1 Founder mở (chưa từng qua `admin/ai/index.html`), Requirement này gọi thêm `PluginManager.loadPlugins()` (method công khai có sẵn) 1 lần trước khi generate để đảm bảo `aiPlugins` đã seed — không sửa `plugin-manager.js`/`plugin-db.js`.
- **Nút GENERATE tự vô hiệu hoá sau khi gửi** (đổi nhãn "ĐÃ GỬI YÊU CẦU AI") — tránh tạo trùng Job nếu Founder bấm nhiều lần.
- **Trạng thái Job lưu kèm bản nháp `localStorage`** (`state.generatedJobs`) — tải lại trang giữa chừng vẫn tiếp tục poll đúng, không mất dấu vết đã Generate. Không đổi Database Structure (chỉ thêm field vào object đã lưu `localStorage`, không phải Firebase).
- **Kiểm thử xác nhận**: harness trình duyệt tạm thời (mock Firebase, đã xoá) — 4 Job tạo đúng `inputParams`, `aiLogs` ghi đúng qua Queue (không đổi nguyên tắc "chỉ Queue ghi Log"), Job kết thúc `failed` với lý do "Chưa chọn nhà cung cấp AI nào" (đúng — chưa cấu hình Provider/chưa deploy Cloud Function `openaiProxy`, không phải lỗi code, không có cuộc gọi mạng nào xảy ra vì `resolveForPlugin()` reject sớm), 0 Draft tạo sai, 0 lỗi console mới.

## Smart CMS — Smart Mode ↔ Advanced Mode (Sprint 10.x, Smart CMS Completion)

Hoàn thành hạng mục Smart CMS còn thiếu từ Sprint 10 (đã ghi nhận rõ ở `docs/SPRINT_10_FINAL_REPORT.md`, không sửa lại báo cáo đó). Chỉ Experience Layer — nav sidebar, không đổi Permission/RBAC:

```
Founder/Editor/Admin → js/admin-auth.js renderShell()
       → getUiMode() (localStorage 'pshopAdminUiMode', mặc định 'smart')
       → navSource = mode === 'advanced' ? ADMIN_NAV : FOUNDER_SMART_NAV
       → items = navSource.filter(i => !i.role || currentRole === 'admin')
              (CÙNG 1 điều kiện lọc vai trò cho CẢ HAI chế độ — không đổi Security)
       → render sidebar + nút "Smart Mode ↔ Advanced Mode" (topbar)
       → bấm nút → toggleUiMode() → setUiMode() (localStorage) → renderShell() lại (không tải lại trang)
```

- **`FOUNDER_SMART_NAV` là danh sách RIÊNG, không phải bản lọc từ `ADMIN_NAV`** — Smart Mode cố tình đưa lên sidebar các lối tắt AI (One Click Marketing/AI Content/AI Image/Marketing Drafts) mà Advanced Mode xưa nay chỉ có dạng liên kết chéo bên trong `admin/ai/*.html`, chưa từng có trong `ADMIN_NAV`. Đúng 13 mục đã giao: Trang chủ, Dashboard, Sản phẩm, Danh mục, Blog, Banner, Thư viện ảnh, One Click Marketing, AI Content, AI Image, AI Video, Marketing Drafts, Cài đặt (Admin-only, giữ đúng `role:'admin'` như Advanced Mode).
- **`ADMIN_NAV` (Advanced Mode) giữ nguyên vẹn** — xác nhận qua `git diff`, không dòng nào trong 16 mục bị sửa/xoá. "Advanced Mode hiển thị toàn bộ chức năng hiện có, không loại bỏ" — đúng nghĩa đen.
- **"AI Content"/"AI Image" cùng trỏ `admin/ai/index.html`** — cùng giới hạn đã ghi nhận ở Founder Home (Sprint 10 Requirement #5), chưa có 2 trang Founder-friendly riêng biệt. **"AI Video" không có `href`** — hiển thị `<span>` vô hiệu hoá rõ ràng, không phải liên kết giả (hệ thống chưa có năng lực AI Video nào).
- **Không đổi Permission/Security**: `renderShell()` áp dụng đúng 1 điều kiện lọc vai trò `!i.role || currentRole === 'admin'` cho CẢ `ADMIN_NAV` lẫn `FOUNDER_SMART_NAV` — Editor không bao giờ thấy "Cài đặt" ở bất kỳ chế độ nào. `init()`'s kiểm tra `requiredRole` (bảo vệ TỪNG TRANG khi truy cập trực tiếp bằng URL, độc lập hoàn toàn với sidebar) không bị chạm tới — ẩn 1 mục khỏi sidebar không làm mất bảo vệ của trang đó.
- **Lựa chọn Smart/Advanced lưu `localStorage`** (không ghi Firebase, không đổi Database Structure, không cần Decision Record) — cùng nguyên tắc "Lưu nháp" của One Click Marketing (Sprint 10 Requirement #3). Giới hạn đã biết: gắn theo trình duyệt, không theo tài khoản.

## Kiểm tra toàn diện + Đóng Sprint (Sprint 10, Final Review & Close — SPRINT 10 COMPLETED với 1 khoảng hở đã biết)

Sprint Review cuối cùng của Sprint 10 — xác minh trên Git thật (không dựa vào hội thoại), không thêm tính năng. Báo cáo đầy đủ: xem `docs/SPRINT_10_FINAL_REPORT.md`.

- **Verify Requirements**: Requirement #1/#3/#4/#5 xác nhận tồn tại qua `git log` (`d40bf4c`/`c72637f`/`a203ddb`/`5f73ac0`). **Requirement #2 (Smart CMS) KHÔNG TỒN TẠI** — không commit, không file nào — ghi rõ, không tự đánh dấu hoàn thành.
- **Regression Review**: `git log a360a6c..5f73ac0 -- <file>` xác nhận 0 commit cho toàn bộ file lõi (Plugin Manager/Queue/Provider Manager/Permission Service/AI Task Router/Data Provider/Firebase Database+Storage Rules/Workflow Engine/`AI_RULES.md`) trong suốt Sprint 10.
- **Architecture Review**: không phá kiến trúc, Decision Record đúng chỗ cần (Requirement #1) và đúng chỗ không cần (Requirement #3/#4/#5).
- **Security Review**: 0 lỗ hổng mới, 0 secret lộ, Auth gate đầy đủ ở cả 3 trang mới, RBAC nhất quán với Sprint 8.
- **Product Review — phát hiện MỚI**: Gói Marketing từ One Click Marketing hoàn toàn vô hình trên Founder Home (chỉ lưu `localStorage`, không bao giờ xuất hiện ở "Recent Marketing Drafts"/"Recent Activities") — xem `ROADMAP.md` mục "Founder Daily Workflow", không sửa ở Requirement này.
- **Sprint Health Score ~8.5/10** — kỷ luật kiến trúc/bảo mật rất tốt (10/10 cả hai), điểm trừ chính đến từ khoảng hở sản phẩm (Requirement #2 chưa từng được giao) chứ không phải chất lượng thực thi.

## Founder Daily Workflow (Sprint 10, Requirement #5)

Experience Layer CAO NHẤT của PSH — Founder mở PSH để hoàn thành công việc (Thêm sản phẩm/Tạo Marketing Package/Review/Generate), KHÔNG để quản trị AI. Trang này không hiển thị thuật ngữ Queue/Plugin/Provider/Prompt/Workflow/Cost:

```
Founder → admin/home.html (js/admin-home.js)
       → Current Business (SiteContentDB.settings — KHÔNG chọn nhiều doanh nghiệp)
       → Quick Actions (7 mục, không Queue/Plugin/Provider/Prompt/Cost/Debug):
            Thêm sản phẩm → products.html
            One Click Marketing → ai/one-click-marketing.html
            Media Library → media-library.html (trang MỚI)
            AI Content → ai/index.html
            AI Image → ai/index.html
            AI Video → "Sắp có" (disabled, không href — chưa có năng lực)
            Marketing Drafts → ai/drafts.html
       → Recent Products/Marketing Drafts/AI Jobs/Media (mỗi mục 5-6 bản ghi mới nhất,
            nhãn Plugin/Trạng thái thân thiện qua AIModuleRegistry — không lộ moduleId/status code)
       → Recent Activities (gộp CẢ 4 nguồn trên thành 1 dòng thời gian, không đọc thêm nguồn nào mới)
```

- **Không phát sinh Business Logic/Database Structure mới** — `js/admin-home.js` chỉ gọi lại đúng các hàm đọc đã có (`DB.getAll()`/`DraftDB.getAll()`/`JobDB.getAll()`/`MediaLibrary.list()`/`SiteContentDB.get()`), không ghi bất kỳ đâu — cùng nguyên tắc tổng hợp nhiều nguồn đã dùng ở Observability Dashboard (Sprint 7 #1).
- **Recent Activities không đọc thêm dữ liệu** — chỉ tái sắp xếp (theo `createdAt`/`timeCreated`) kết quả CÙNG 1 lượt gọi `Promise.all()` đã tải cho 4 mục Recent phía trên, giữ số lượng round-trip Firebase/Storage tối thiểu.
- **Media Library có trang duyệt độc lập lần đầu tiên** (`admin/media-library.html` + `js/admin-media-library.js`) — trước đây (Sprint 8) `MediaLibrary`/`MediaLibraryPicker` chỉ tồn tại dạng Modal gắn vào 1 field cụ thể trên form CMS, không có nơi duyệt/quản lý độc lập. Trang mới gọi lại nguyên vẹn `MediaLibrary.list()/upload()/remove()` (Sprint 8, không sửa).
- **`ADMIN_NAV`** (`js/admin-auth.js`) thêm 2 mục mới ("Trang chủ" đầu danh sách, "Thư viện ảnh") — chỉ thêm, không sửa/xoá mục nào khác.
- **Product Experience — 2 giới hạn đã biết, không tự mở rộng sửa** (xem `ROADMAP.md` mục "Founder Daily Workflow"): "AI Content"/"AI Image" cùng trỏ `admin/ai/index.html` (còn hiện tên Plugin kỹ thuật); "Marketing Drafts" hiển thị TẤT CẢ `aiDrafts` (hệ thống hiện không phân biệt Draft nào là "marketing" — cần field phân loại mới nếu muốn tách riêng, là Database Structure change, chưa làm).
- **"Ready To Publish" không phải màn hình mới** — chính là Review Center đã có từ Requirement #3/#4 (nút "GENERATE" đã hiển thị rõ "chưa kết nối AI thật"). Không tuyên bố Publish tự động ở bất kỳ đâu trong Founder Home.

## Business Manager Foundation (Sprint 10, Requirement #1)

**Chỉ là nền tảng phân tích + thiết kế — KHÔNG có code Multi-tenant nào được triển khai ở Requirement này.** Đúng Architectural Constraint: mọi thay đổi Database Structure/Data Provider/Authentication Model cần thiết cho Multi-tenant đều bị khoá lại, chờ Decision Record được phê duyệt (xem `docs/DECISION_RECORD_BUSINESS_MANAGER.md`).

### Audit — PSH Platform hiện tại là single-tenant ở MỌI tầng, không chỉ Database

| Tầng | Bằng chứng cụ thể | Ảnh hưởng Multi-tenant |
|---|---|---|
| **Deployment** | `js/firebase-config.js` trỏ đúng 1 project Firebase (`pshop-music`) — 1 Realtime Database, 1 Storage bucket, 1 Auth instance cho TOÀN BỘ app; `netlify.toml` là cấu hình 1 site tĩnh = 1 domain | Toàn bộ app boot cứng vào 1 backend — thêm doanh nghiệp mới hiện đòi hỏi deploy 1 bộ code + Firebase project MỚI HOÀN TOÀN, không phải "tạo trong app" |
| **Database Structure** | Toàn bộ 13 node CMS/AI (`products`/`categories`/`banners`/`blogPosts`/`videos`/`siteContent`/`seoSettings`/`aiDrafts`/`aiJobs`/`aiLogs`/`aiProviderConfig`/`aiPlugins`) đều là node TOÀN CỤC, không có field/namespace phân biệt doanh nghiệp | Không thể lưu dữ liệu 2 doanh nghiệp mà không trộn lẫn |
| **Authentication Model** | `roles/{uid}` là 1 node toàn cục duy nhất — 1 user có ĐÚNG 1 vai trò cho TOÀN BỘ hệ thống, không có khái niệm "vai trò theo từng doanh nghiệp". Xác nhận cả `js/admin-auth.js`, `js/admin-login.js`, `js/ai/permission-service.js`, VÀ `functions/index.js` (Cloud Function, dòng 38: `admin.database().ref('roles/' + decoded.uid)`) đều đọc đúng node toàn cục này | Không thể cho 1 người có quyền khác nhau ở 2 doanh nghiệp |
| **Firebase Rules** | `database.rules.json`/`storage.rules` viết cứng theo đúng danh sách node cố định ở trên | Cần viết lại hoàn toàn nếu đổi cấu trúc Database (xem Quyết định #1 trong Decision Record) |
| **Static Site / Branding** | `index.html`/`category.html`/`blog.html`/`videos.html` có `<title>`/meta/OG/JSON-LD/footer hard-code text "Pshop Music" (48 file trong repo chứa chuỗi "Pshop Music", phần lớn là các trang admin/AI dùng chung tiêu đề `<title>...- Pshop Music Admin</title>`) | Đây là vấn đề KHÁC với Database — cần templating Site Shell theo từng doanh nghiệp, không chỉ đổi nguồn dữ liệu |
| **Seed/Fallback Data** | `js/products-seed.js` (42 sản phẩm gốc Pshop Music), `js/site-content-seed.js` (địa chỉ/giới thiệu/copyright Pshop Music) — chỉ là fallback khi Firebase rỗng, dữ liệu thật vẫn ở Firebase | Rủi ro thấp (đã editable qua CMS), nhưng vẫn là 1 bộ seed giả định 1 doanh nghiệp |
| **AI Framework** | `aiProviderConfig`/`aiPlugins` là cấu hình TOÀN CỤC (1 Provider/Plugin setting cho cả hệ thống); `DataProvider`/`ContextBuilder` không có khái niệm "đang phục vụ doanh nghiệp nào" | Cả AI Context lẫn cấu hình Provider/Plugin đều cần biết doanh nghiệp hiện tại nếu muốn tách biệt |

### Business Abstraction — thiết kế khái niệm (chưa triển khai)

```
Business (thực thể hạng nhất — CHƯA tồn tại trong Database hiện tại)
 ├─ id, name, domain, branding (logo/màu/liên hệ)
 ├─ Website   — Site Shell (title/meta/branding) → hiện hard-code trong HTML, cần templating hoá
 ├─ CMS       — products/categories/banners/blogPosts/videos/siteContent/seoSettings → hiện node toàn cục
 ├─ Media     — Media Library (Storage) → hiện đọc toàn bộ 1 Bucket, cần phân vùng theo doanh nghiệp
 ├─ AI        — aiDrafts/aiJobs/aiLogs/aiProviderConfig/aiPlugins + DataProvider/ContextBuilder → hiện node toàn cục
 ├─ Workflow  — Định nghĩa Workflow (Sprint 7 #4, hiện không lưu trữ) → nếu lưu lại sau này cũng cần scope theo doanh nghiệp
 └─ Settings  — SiteContentDB.settings (liên hệ/địa chỉ) → hiện 1 node duy nhất, cần 1-per-business
```

### Business Manager Layer — đề xuất (chỉ là đề xuất, KHÔNG triển khai)

Nếu được phê duyệt, `BusinessManager` sẽ đóng vai trò tương tự `PluginManager` (Sprint 2 #4) — 1 lớp trung gian DUY NHẤT giữa UI và toàn bộ Data Layer, chịu trách nhiệm biết "đang thao tác cho doanh nghiệp nào" và inject đúng ngữ cảnh đó vào mọi lời gọi `DB`/`CategoryDB`/`DataProvider`/... — **không phá kiến trúc hiện tại** (Plugin Manager/Provider Manager/Permission Service/Queue/AI Task Router giữ nguyên hoàn toàn, chỉ thêm 1 tầng resolve "current business" phía trước Data Layer). Thiết kế cụ thể (Option A/B cho từng phần) nằm trong `docs/DECISION_RECORD_BUSINESS_MANAGER.md` — CHƯA chọn phương án nào.

### Founder Experience — xác nhận rõ: CHƯA đủ điều kiện triển khai

Theo đúng yêu cầu "Nếu chưa đủ điều kiện triển khai. Phải ghi rõ.": **"Tạo Business mới"/"Đổi Business"/"Xem danh sách Business" đều CHƯA thể triển khai** ở Requirement này. Cả 3 tính năng này đòi hỏi tối thiểu 1 node Firebase mới để lưu danh sách doanh nghiệp — bản thân việc "tạo 1 node mới" đã là thay đổi Database Structure, đúng loại thay đổi bị khoá bởi Architectural Constraint của Requirement này. Không có cách nào triển khai 3 tính năng này mà không vi phạm ràng buộc "Không tự triển khai Database Structure — Tạo Decision Record — Chờ phê duyệt". Xem `docs/DECISION_RECORD_BUSINESS_MANAGER.md` để biết chính xác quyết định nào cần Chief Architect chọn trước khi các tính năng này có thể bắt đầu code.

### Không migrate dữ liệu

Đúng yêu cầu — Requirement này KHÔNG chạm vào bất kỳ dữ liệu Pshop Music nào, không tạo doanh nghiệp "A Tiểu" nào (kể cả dưới dạng thử nghiệm), không thêm field/node mới vào Database thật. Toàn bộ nội dung ở đây là phân tích + thiết kế + Decision Record.

## Giới hạn kiến trúc đã biết (không tự ý "vá" bằng cách thêm hạ tầng mới)

- **Job Queue vẫn không có backend riêng (V1)** — `AIJobQueue` xử lý tuần tự phía trình duyệt Admin, không đổi ở Sprint 3. Cloud Function duy nhất hiện có (`openaiProxy`, xem mục "Cloud Function Proxy Layer") chỉ là proxy gọi OpenAI API, KHÔNG phải backend xử lý Queue — nâng Job Queue lên Cloud Functions (Job Queue V2, xem `ROADMAP.md`) vẫn là quyết định kiến trúc cần người phụ trách xác nhận trước, chưa triển khai. Từ Sprint 8 Requirement #3, Queue có thêm khoá mềm chống xử lý trùng giữa nhiều tab (xem mục "Concurrency Safety" ở "Queue Layer") — vẫn KHÔNG phải backend riêng, chỉ là 1 lớp phòng vệ bổ sung phía client.
- ~~Không có Media Library CMS module~~ — **đã có từ Sprint 8 Requirement #2** (`js/media-library.js`/`js/media-library-picker.js`, xem mục "Media Library" bên dưới) — ảnh giờ dùng chung 1 kho trung tâm (Firebase Storage) cho Product/Blog/Banner/Slider/Category, có thể duyệt/tìm/chọn lại.
- **Sản phẩm không có trang riêng** — chỉ hiển thị dạng lưới + modal trên `category.html`, không có URL/route riêng từng sản phẩm để đặt thẻ Meta/OG/Schema riêng.

## Sprint 8 Review (Requirement #4)

Sprint Review cuối Sprint 8 — không thêm kiến trúc mới, chỉ tái xác nhận 3 Requirement (#1-#3) bằng cách chạy lại **mã nguồn thật** (không phải mô tả lại) — 41/41 kịch bản kiểm thử PASS (15 Database Rules + 11 Media Library core + 10 Media Library Picker qua Chromium thật + 5 Job Queue Concurrency). Chi tiết đầy đủ: `docs/SPRINT_8_FINAL_REPORT.md`.

Phát hiện đáng chú ý nhất của Requirement #4: **1 kết luận bảo mật của Requirement #1 bị đính chính**. Ghi nhận ban đầu cho rằng `js/admin-users.js` sẽ gãy sau khi deploy `database.rules.json` (vì `createUserWithEmailAndPassword()` được cho là hijack phiên đăng nhập Admin đang thao tác). Đọc lại đúng mã nguồn thật cho thấy hàm `createUser()` đã dùng 1 Firebase App phụ (`secondaryApp`, có sẵn từ Sprint 1, đúng mục đích tránh hijack phiên) — phiên đăng nhập CHÍNH (nơi ghi `roles/{uid mới}` thật sự chạy) không hề bị ảnh hưởng. Đây là minh chứng cụ thể cho lý do "kiểm thử bằng mã nguồn thật" là một bước bắt buộc của Sprint Review, không phải chỉ tái khẳng định tài liệu cũ. Xem `ROADMAP.md` mục "Firebase Database Rules" cho phân tích đầy đủ.

## Sprint 9 — Documentation Integrity Restoration (Requirement #1)

Requirement thuần tài liệu — không đổi kiến trúc/mã nguồn/Database/Firebase Rules. Rà soát lại `README.md`/`AI_RULES.md` cho khớp trạng thái thực tế, phát hiện đáng chú ý nhất:

- **`README.md`** hướng dẫn cấu hình Firebase Realtime Database Rules thủ công (copy tay vào Console) bằng 1 bản Rules **khác và kém an toàn hơn** `database.rules.json` đã review ở Sprint 8 Requirement #1 (không phân biệt Admin/Editor; để `roles` đọc công khai vĩnh viễn). Vì Rules thật chưa từng được `firebase deploy`, có khả năng hệ thống đang chạy đúng bản kém an toàn này. Đã sửa README trỏ về `database.rules.json` + `firebase deploy --only database` làm nguồn sự thật duy nhất, kèm cảnh báo cần đối chiếu thủ công trước khi giả định Rules đã đúng.
- **`AI_RULES.md`** có 2 mục bị đánh trùng số ("§7"/"§8" xuất hiện 2 lần, bản cũ mâu thuẫn bản mới) và bảng `AI_PERMISSIONS` chỉ liệt kê 3/8 quyền `ai.generate.*` thật sự có trong `js/ai/permission-service.js` (5 quyền thêm ở Sprint 5-6 khi kích hoạt FAQ/Blog/Facebook/Banner/Image Prompt Generator chưa từng được ghi vào Constitution). Đã gộp mục trùng số, cập nhật đủ 10 quyền — không đổi bất kỳ quy tắc/ràng buộc nào, chỉ cập nhật phần mô tả trạng thái cho khớp code đã có sẵn.

Chi tiết đầy đủ: `CHANGELOG.md` mục "Sprint 9 — Documentation Integrity Restoration".

## Sprint 9 — Firebase Database Rules Production Alignment (Requirement #2)

Chỉ liên quan tới Firebase Database Rules — không đổi AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Database Structure/`AI_RULES.md`. Mục tiêu: đối chiếu `database.rules.json`/`firebase.json`/`README.md`/tài liệu triển khai, xác nhận không còn mâu thuẫn, và chuẩn bị deploy an toàn — KHÔNG tự deploy/giả lập đã deploy.

- **Kiểm thử `database.rules.json` bằng Firebase Realtime Database Emulator thật** (`firebase-tools` + `@firebase/rules-unit-testing`, cài tạm cho việc kiểm thử, không phải dependency của dự án) — nạp đúng file Rules đã commit vào 1 Emulator RTDB thật, chạy 19 kịch bản RBAC/bootstrap/`.validate` qua `authenticatedContext()`/`unauthenticatedContext()` chính thức của Firebase. **19/19 PASS.** Đây là bằng chứng mạnh hơn hẳn so với Sprint 8 (khi đó chỉ mô phỏng lại logic biểu thức Rules bằng tay, không chạy trên engine Rules thật) — nhưng vẫn KHÔNG thay thế được việc xác minh Rules đang chạy thật trên Production Firebase Console, vì môi trường này không có quyền truy cập project thật (đã xác nhận bằng `firebase projects:list`, không suy đoán).
- **Tạo `docs/FIREBASE_RULES_DEPLOYMENT.md`** — quy trình đầy đủ để người vận hành: (1) đối chiếu Rules đang chạy thật với `database.rules.json` trước khi deploy (tránh deploy đè không biết đang đổi gì); (2) chạy đúng 1 lệnh `firebase deploy --only database`; (3) checklist xác minh sau deploy, bao gồm xác nhận thật lần đầu "Thêm tài khoản mới" (`admin/users.html`) hoạt động đúng — điểm này mới chỉ được đính chính bằng đọc mã nguồn ở Sprint 8 Requirement #4, chưa từng kiểm tra trên Firebase thật; (4) rollback qua Firebase Console History.
- **Không tuyên bố "Production đã khớp Rules"** — `database.rules.json` vẫn chưa từng được deploy lên môi trường thật, đúng tình trạng đã ghi nhận từ Sprint 8 Requirement #1, không đổi ở Requirement này.

## Sprint 9 — Firebase Storage Security Rules (Requirement #3)

Chỉ liên quan tới Firebase Storage Security Rules — không đổi Business Logic/AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Database Structure/`AI_RULES.md`/Media Library. Mục tiêu: đưa Firebase Storage vào trạng thái có Security Rules version-controlled — trước Requirement này, `storage.rules` **không tồn tại trong repo**, Rules chỉ tồn tại thủ công trên Firebase Console.

- **Tạo mới `storage.rules`** — tách 3 quyền theo Firebase Storage Rules v2: `get` (đọc 1 file, công khai — giữ nguyên hành vi hotlink ảnh của trang khách), `list` (liệt kê thư mục/bucket, chỉ người đã đăng nhập — THẮT CHẶT so với ruleset thủ công cũ, vốn có thể đang ngầm cho `list` công khai qua `allow read: if true` gộp chung kiểu v1), `write` (create+update+delete, người đã đăng nhập, không phân biệt vai trò — đúng hành vi Media Library thật: Editor cũng xoá được ảnh).
- **Giới hạn kỹ thuật xác nhận được**: Firebase Storage Security Rules không có cách nào cross-reference node `roles/{uid}` của Realtime Database (chỉ hỗ trợ `firestore.get()`/`firestore.exists()` cho Cloud Firestore, dự án dùng Realtime Database) — nên không thể siết `write` theo đúng vai trò Admin/Editor như `database.rules.json` đã làm cho Database. Muốn có, cần Firebase Auth Custom Claims (Admin SDK/Cloud Function mới ở `admin/users.html`) — ngoài phạm vi Requirement này, ghi vào `ROADMAP.md`.
- **Kiểm thử bằng Firebase Storage Emulator thật** (cùng bộ `firebase-tools`/`@firebase/rules-unit-testing` đã dùng ở Requirement #2) — nạp đúng `storage.rules` đã commit, chạy `get`/`list`/`write`/`delete` có xác thực qua `authenticatedContext()`/`unauthenticatedContext()`. **9/9 PASS.**
- **Tạo `docs/FIREBASE_STORAGE_RULES_DEPLOYMENT.md`** — cùng cấu trúc với `docs/FIREBASE_RULES_DEPLOYMENT.md` (Requirement #2): đối chiếu Rules đang chạy thật trước khi deploy, lệnh `firebase deploy --only storage`, checklist xác minh sau deploy, rollback.
- **Không tuyên bố "Production đã khớp Rules"** — `storage.rules` chưa từng được deploy lên môi trường thật, cùng giới hạn môi trường đã ghi nhận ở Requirement #2 (không có Firebase CLI đã đăng nhập/quyền truy cập project thật).
- **Không đổi Media Library** (`js/media-library.js`/`js/media-library-picker.js`) — xác nhận qua `git diff`, không cần thay đổi gì ở tầng gọi API để Rules mới hoạt động đúng.

Chi tiết đầy đủ: `CHANGELOG.md` mục "Sprint 9 — Firebase Storage Security Rules".

## Lịch sử phát triển

Xem `CHANGELOG.md` cho từng đợt (Sprint) và mốc thay đổi cụ thể.
