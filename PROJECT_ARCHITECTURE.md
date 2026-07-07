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

## Lịch sử phát triển

Xem `CHANGELOG.md` cho từng đợt (Sprint) và mốc thay đổi cụ thể.
