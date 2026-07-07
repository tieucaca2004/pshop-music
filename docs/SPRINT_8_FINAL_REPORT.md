# Sprint 8 Final Report — Production Hardening (Firebase Database Rules, Media Library, Job Queue Concurrency Safety)

**Trạng thái: SPRINT 8 COMPLETED (Requirement #1–#3 + Requirement #4 Review).** Đã commit, đã push lên `feature/cms-ai-sprint2`. Chưa merge vào `main`. Không bắt đầu Sprint 9 — chờ Chief Architect lập Sprint 9 Planning.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 8". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_8_FINAL_REPORT.md"** để nối tiếp đúng phần còn thiếu.

---

## 1. Requirement Summary

| # | Requirement | Kết quả |
|---|---|---|
| 1 | Firebase Database Rules — Version Control + Verification | ✅ PASS |
| 2 | Media Library dùng chung cho CMS | ✅ PASS |
| 3 | Job Queue Concurrency Safety | ✅ PASS |
| 4 | Kiểm tra toàn diện + Đóng Sprint | ✅ PASS — báo cáo này |

Sau Sprint 8, PSH Platform chuyển trọng tâm đúng như Sprint 8 Planning đề ra — từ "xây tính năng" (Sprint 2-7) sang "củng cố nền tảng cho Production thật": `database.rules.json` được đưa vào version control và xác minh khớp với `permission-service.js`; toàn bộ CMS (Product/Blog/Banner/Slider/Category) dùng chung 1 Media Library xây trên Firebase Storage đã có; `AIJobQueue` không còn race condition khi nhiều tab/Admin cùng hoạt động. Cả 3 Requirement đều xây trên đúng AI Framework của Sprint 2 — không đổi 1 dòng nào của Plugin Manager/Provider Manager/Permission Service/Data Provider/AI Task Router/`AI_RULES.md`.

## 2. Kiểm thử theo Functional Requirement (của Requirement #4)

Môi trường phiên làm việc này **CÓ Node.js** (khác với giới hạn "không có Node.js/Python" ghi nhận ở các Sprint Review trước, vd Sprint 7) — tận dụng để kiểm thử **mã nguồn thật** (đọc trực tiếp từ file trong repo, không copy/viết lại logic) chặt chẽ hơn, cộng thêm Playwright + Chromium thật cho phần có DOM (Media Library Picker), thay vì chỉ mô phỏng trong Chrome qua `javascript_tool` như trước.

| # | Hạng mục | Cách kiểm tra | Kết quả |
|---|---|---|---|
| 1 | **Database Rules** | Nạp trực tiếp `database.rules.json` thật, dựng 1 evaluator Snapshot tối thiểu (`root`/`data`/`newData`/`auth`/`$uid`, có `.val()`/`.exists()`/`.child()`/`.hasChildren()`) và `new Function()` để chạy đúng các biểu thức Rules đã commit (không rewrite). 15 kịch bản (giống Requirement #1: chặn ghi khi chưa đăng nhập, Admin/Editor ghi được `products`, Editor bị chặn `seoSettings`, Editor ghi được `siteContent`, người lạ có tài khoản nhưng không có `roles` bị chặn khắp nơi, đọc `roles` công khai khi rỗng nhưng bị chặn khi đã có dữ liệu, tự nhận quyền Admin đầu tiên thành công nhưng bị chặn lần 2, Admin cấp quyền cho uid mới, `.validate` chặn giá trị rác/chấp nhận giá trị hợp lệ) | ✅ **15/15 PASS** |
| 2 | **Media Library** | Nạp `js/media-library.js` thật vào Node `vm`, mock `firebase.storage()` với cấu trúc thư mục lồng nhau thật (bao gồm 1 file PDF không phải ảnh). 11 kịch bản: duyệt đệ quy đúng, loại bỏ file không phải ảnh, sắp xếp mới nhất trước, tìm kiếm không phân biệt hoa/thường (có/không khớp), `upload()` ủy quyền đúng `StorageUpload` với thư mục `media` (giữ nguyên file/onProgress), `remove()` xóa đúng `fullPath` và item biến mất khỏi `list()` sau đó | ✅ **11/11 PASS** |
| 2b | **Media Library Picker** | Nạp `js/media-library-picker.js` thật vào 1 trang HTML thật, chạy bằng **Chromium thật qua Playwright** (không phải DOM giả lập), mock `MediaLibrary`. 10 kịch bản: `mount()` ẩn input URL gốc + hiện placeholder rỗng (không URL nào lộ ra); chọn ảnh từ modal ghi đúng giá trị vào input thật + vẽ lại `<img>`; URL nằm trong `<details>` đóng mặc định (chỉ hiện khi mở); `clearFor()` xóa tham chiếu nhưng KHÔNG gọi `MediaLibrary.remove()`; xóa từ trong Thư viện (sau `confirm()`) CÓ gọi `MediaLibrary.remove()` đúng 1 lần | ✅ **10/10 PASS** |
| 3 | **Queue (Concurrency)** | Nạp `js/ai/job-queue.js` thật **2 lần vào 2 ngữ cảnh Node `vm` cách ly** ("Tab A"/"Tab B", mỗi bên có `processing`/`CLIENT_ID` closure riêng), dùng chung 1 kho Firebase giả lập đúng ngữ nghĩa `transaction()` (tuần tự hoá theo path, atomic). 5 kịch bản: 2 tab đồng thời không xử lý trùng; 1 tab đơn lẻ không đổi hành vi; khoá hết hạn (tab crash) được giành lại; khoá còn tươi (tab khác đang giữ) chặn đúng; `cancel()`/`retryFailed()` nhả khoá ngay | ✅ **5/5 PASS** |
| 4 | **AI Framework (tổng thể)** | Không đổi code (`plugin-manager.js`/`provider-registry.js`/`data-provider.js`/`module-registry.js` — xem mục 3 Regression). Sprint 8 không thêm/sửa Plugin nào, không đổi luồng `User → Permission → Plugin Manager → Queue → Data Provider → Provider → Draft → Human Review` | ✅ PASS (regression) |
| 5 | **Permission** | Không đổi code (`permission-service.js`). Rules mới (Requirement #1) đối chiếu đúng với `AI_PERMISSIONS`/`ROLE_PERMISSIONS` đã có — cùng 2 vai trò `admin`/`editor`, cùng ranh giới quyền (`aiProviderConfig`/`aiPlugins` chỉ Admin, khớp `AI_RULES.md` mục 8) | ✅ PASS |
| 6 | **Plugin Framework** | Không đổi code. Không có Plugin mới nào ở Sprint 8 — Media Library/Job Queue Concurrency Safety đều là hạ tầng dùng chung, không phải Plugin | ✅ PASS (regression) |

**Tổng cộng kiểm thử mã nguồn thật ở Sprint 8 (Requirement #1–#3, tái xác nhận ở #4): 15 + 11 + 10 + 5 = 41/41 kịch bản PASS.**

## 3. Regression Test (Sprint 2, 3, 4, 5, 6, 7, 8 Requirement #1–#3)

`git log --oneline 7ca3841..HEAD -- <file>` (từ commit đóng Sprint 7 tới hiện tại) xác nhận **rỗng** cho toàn bộ file lõi bị khoá xuyên suốt Sprint 2-8:

| File | Kết quả |
|---|---|
| `js/ai/plugin-manager.js` | 0 commit — không đổi |
| `js/ai/provider-registry.js` | 0 commit — không đổi |
| `js/ai/provider-interface.js` | 0 commit — không đổi |
| `js/ai/permission-service.js` | 0 commit — không đổi |
| `js/ai/task-router.js` | 0 commit — không đổi |
| `js/ai/data-provider.js` | 0 commit — không đổi |
| `js/ai/module-registry.js` | 0 commit — không đổi |
| `functions/index.js` | 0 commit — không đổi |
| `AI_RULES.md` | 0 commit — không đổi |

`js/ai/job-queue.js` có **đúng 1 commit** trong toàn bộ Sprint 8 (`d09469f`, Requirement #3) — không bị Requirement #1/#2 chạm vào trước hay sau đó.

Mỗi commit Sprint 8 chỉ động vào đúng phạm vi của Requirement đó (xác nhận qua `git show --stat`):

```
48d7a89 Sprint 8 Planning              -> CHANGELOG.md, ROADMAP.md
60a3d1d Requirement #1 (Rules)         -> CHANGELOG.md, PROJECT_ARCHITECTURE.md, ROADMAP.md, database.rules.json, firebase.json
b91b63e Requirement #2 (Media Library) -> CHANGELOG.md, PROJECT_ARCHITECTURE.md, ROADMAP.md, 5 trang admin/*.html + 5 js/admin-*.js liên quan, css/admin.css, js/media-library.js, js/media-library-picker.js
d09469f Requirement #3 (Job Queue)     -> CHANGELOG.md, PROJECT_ARCHITECTURE.md, ROADMAP.md, js/ai/job-queue.js
```

Không Requirement nào của Sprint 8 sửa lại file mà Requirement khác (trong cùng Sprint) đã tạo/sửa — ngoại trừ 3 file docs (`CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md`, đúng như quy ước mỗi Requirement đều cập nhật).

**Kết luận: Sprint 2, 3, 4, 5, 6, 7 hoàn toàn không bị ảnh hưởng bởi Sprint 8. Requirement #1–#3 của Sprint 8 không ghi đè/sửa lẫn nhau.**

## 4. Architecture Verification

- ✅ **Không thay đổi AI Framework** — luồng `User → Permission → Plugin Manager → Queue → Data Provider → Provider → Draft → Human Review` giữ nguyên xuyên suốt.
- ✅ **Không thay đổi Queue (API công khai)** — `job-queue.js` chỉ sửa NỘI BỘ (khoá mềm giữa các tab); `enqueue`/`resume`/`cancel`/`retryFailed` giữ nguyên chữ ký, mọi nơi gọi (`admin-ai.js`, `admin-ai-assistant.js`, `workflow-engine.js`, `plugin-manager.js`) không cần sửa (mục 3).
- ✅ **Không thay đổi Plugin Manager** — `plugin-manager.js` 0 thay đổi.
- ✅ **Không thay đổi Provider Manager** — `provider-registry.js`/`provider-interface.js` 0 thay đổi.
- ✅ **Không thay đổi Permission Service** — `permission-service.js` 0 thay đổi; Rules mới (Requirement #1) chỉ enforce LẠI đúng 2 lớp đã có (đăng nhập + vai trò), không thêm logic phân quyền mới ở tầng Rules (đúng nguyên tắc "không tạo kiến trúc trùng lặp" đã ghi ở Requirement #1).
- ✅ **Không thay đổi AI Task Router** — `task-router.js` 0 thay đổi.
- ✅ **Không thay đổi Database Structure của các node CMS/AI hiện có** — duy nhất field MỚI thêm trong Sprint 8 là `aiJobs/{jobId}/lock` (Requirement #3) — một field bổ sung bên trong node đã có, không phải Collection/node mới, không cần Rules mới (node `aiJobs` đã cho phép ghi bất kỳ field con nào từ Requirement #1 — xác nhận lại, không suy đoán).
- ✅ **Không thay đổi `AI_RULES.md`** — 0 thay đổi.

## 5. Security Verification

| Hạng mục | Kết quả |
|---|---|
| **Firebase Database Rules** | ✅ Đã version-control (Requirement #1), đã kiểm thử lại bằng cách chạy chính biểu thức Rules thật (mục 2, hạng mục #1) — 15/15 PASS. **CHƯA deploy lên Firebase thật** (không có Firebase CLI/project trong môi trường này) — vẫn là Known Limitation kế thừa. |
| **RBAC** | ✅ Không đổi — 2 vai trò `admin`/`editor`, `AI_PERMISSIONS`/`ROLE_PERMISSIONS` giữ nguyên từ Sprint 6; Rules mới khớp đúng ranh giới này (đối chiếu thủ công + kiểm thử). |
| **API Key Security** | ✅ Grep toàn bộ file mới/sửa của Sprint 8 (`database.rules.json`, `firebase.json`, `js/media-library.js`, `js/media-library-picker.js`, `js/ai/job-queue.js`, 5 trang `admin/*.html` + 5 `js/admin-*.js` liên quan) — không có API Key/secret nào lộ ra (pattern `sk-`/`AIza`/`api_key`/`secret` đều không khớp). |
| **Media Library Permission** | ✅ Chỉ đọc/ghi/xoá Storage qua `StorageUpload`/`MediaLibrary` đã có, không tự mở endpoint mới; UI Picker chỉ gọi được khi trang admin đã qua `AdminAuth.init()` (không đổi ở Sprint 8). |
| **Storage Access** | ⚠️ `storage.rules` (Firebase Storage Security Rules) **vẫn chưa version-control trong repo** — đã ghi nhận từ Requirement #2, quan trọng hơn trước vì Media Library thêm khả năng LIỆT KÊ (`listAll()`) + XOÁ (`delete()`) qua giao diện (trước chỉ có UPLOAD). Không xác minh được trực tiếp trong môi trường này. |
| **Context Isolation** | ✅ Khoá mềm của Job Queue (Requirement #3) đúng theo tab/phiên (`CLIENT_ID` sinh ngẫu nhiên mỗi lần nạp trang) — không có state nào rò rỉ giữa các tab/người dùng khác nhau ngoài đúng field `lock` dùng cho mục đích điều phối, không chứa dữ liệu nhạy cảm. |
| **Đính chính 1 phát hiện cũ (Requirement #1)** | ⚠️➜✅ "Xung đột #1" (nghi `admin-users.js` gãy sau khi deploy Rules) đã được rà soát lại bằng cách đọc đúng mã nguồn thật — `createUser()` dùng 1 Firebase App phụ (`secondaryApp`) để tạo tài khoản, ghi `roles/{uid mới}` qua App CHÍNH (nơi `auth.uid` vẫn là Admin đang thao tác, không đổi) — Rules cho phép đúng luồng này (kịch bản #13). Kết luận: **nhiều khả năng KHÔNG phải lỗi thật**, khác với ghi nhận ban đầu — xem `ROADMAP.md` cho chi tiết đầy đủ. |
| **Xác nhận 1 phát hiện cũ vẫn đúng (Requirement #1)** | ✅ "Xung đột #2" (cảnh báo sai ở `admin/login.html` sau khi có Admin đầu tiên) — đọc lại `js/admin-login.js`/`admin/login.html`, xác nhận vẫn đúng như ghi nhận: đọc `roles` ẩn danh bị Rules chặn đúng thiết kế sau bootstrap, kích hoạt nhánh `.catch()` hiện cảnh báo "Chưa kết nối được hệ thống phân quyền..." dù hệ thống đang hoạt động đúng. Vẫn là 1 vấn đề UX thật, mức độ thấp, không ảnh hưởng chức năng đăng nhập. |

**Không phát hiện lỗ hổng bảo mật mới nào trong Sprint 8. 1 phát hiện cũ được đính chính (không còn là bug thật), 1 phát hiện cũ được xác nhận vẫn đúng.**

## 6. Production Readiness

| Hạng mục | Trạng thái |
|---|---|
| AI Framework (Queue/Plugin Manager/Provider Manager/Permission Service/Data Provider) | ✅ Sẵn sàng — không đổi, đã qua kiểm thử từ Sprint 2–7 |
| Firebase Database Rules | ✅ Code sẵn sàng, đã kiểm thử lại (15/15) — ⚠️ **thao tác vận hành còn thiếu**: `firebase deploy --only database` chưa chạy được (không có Firebase CLI/project trong môi trường phát triển) |
| Media Library | ✅ Sẵn sàng Production cho use-case hiện tại (đọc/tải/xoá ảnh dùng chung) — ⚠️ `storage.rules` chưa version-control, nên xác minh thủ công trên Firebase Console trước khi mở rộng quyền LIỆT KÊ/XOÁ cho nhiều người dùng hơn |
| Job Queue | ✅ Sẵn sàng — đã vá đúng race condition đã biết; vẫn là kiến trúc V1 (client-side, chưa có Cloud Functions xử lý nền — kế thừa, không đổi ở Sprint 8) |
| Cloud Function `openaiProxy` | ⚠️ Vẫn chưa deploy — kế thừa từ Sprint 3, không phải vấn đề Sprint 8 gây ra |

**Kết luận: Toàn bộ code Sprint 8 sẵn sàng Production. 2 việc vận hành còn thiếu (deploy Database Rules, version-control Storage Rules) không phải do Sprint 8 gây ra nhưng nên xử lý trước khi mở rộng người dùng CMS thật.**

## 7. Non-functional Evaluation

- **Architecture**: mỗi Requirement Sprint 8 thêm đúng 1 lớp hạ tầng dùng chung (Rules/Media Library/Queue Lock), tái sử dụng 100% AI Framework đã có — không tầng kiến trúc mới nào ngoài phạm vi đã duyệt.
- **Security**: xem mục 5 — không có lỗ hổng mới; 1 phát hiện cũ được đính chính bằng cách đọc đúng mã nguồn thay vì chỉ tin lại ghi chép trước đó (giá trị cụ thể của việc "kiểm thử bằng mã nguồn thật" thay vì chỉ đọc tài liệu).
- **Performance**: `MediaLibrary.list()` gộp `Promise.all()` cho mọi file/thư mục con thay vì tuần tự; Job Queue lock chỉ thêm đúng 1-2 lượt ghi Firebase nhỏ mỗi job (claim + refresh theo item đã có sẵn round-trip), không thêm round-trip mới đáng kể.
- **Reliability**: `MediaLibrary.list()` không bao giờ reject (1 item lỗi đọc metadata vẫn giữ lại với field `null`); Job Queue lock tự phục hồi sau TTL nếu 1 tab crash giữa chừng, không khoá chết vĩnh viễn.
- **Scalability**: Media Library duyệt đệ quy KHÔNG hard-code danh sách thư mục — tự động phủ thư mục mới trong tương lai; Job Queue lock hoạt động độc lập theo từng Job, không serialize toàn hệ thống.
- **Maintainability**: mỗi Requirement nằm gọn trong đúng phạm vi file đã liệt kê (mục 3) — dễ review/rollback độc lập.
- **User Experience**: Admin thao tác CMS không còn phải tự gõ URL ảnh (Media Library); không còn rủi ro tạo Draft trùng/tốn phí kép khi vô tình mở nhiều tab (Job Queue).
- **Production Readiness**: xem mục 6.

## 8. Known Limitations

- **Firebase Database Rules chưa deploy lên môi trường thật** — cần Firebase CLI (thao tác vận hành, không phải code).
- **Firebase Storage Security Rules (`storage.rules`) chưa version-control** — quan trọng hơn từ khi Media Library có khả năng liệt kê/xoá qua giao diện (Requirement #2).
- **`DataProvider`/`ContextBuilder` chưa đọc từ Media Library mới** — Plugin AI (Slider/Banner Generator) vẫn chỉ suy ra ảnh từ `product.images`, không thấy toàn bộ Media Library — cần 1 Requirement riêng sửa `data-provider.js` (hiện bị khoá).
- **Job Queue lock TTL (5 phút) là cấu hình, không phải đảm bảo tuyệt đối** — xem `ROADMAP.md` mục "Job Queue Concurrency Safety" cho phân tích đầy đủ.
- **`makeListDB.update()` (dùng chung bởi mọi CMS module khác) vẫn là đọc-rồi-ghi, không atomic** — Requirement #3 chỉ vá đúng Queue, không mở rộng sang các module CMS khác.
- **"Xung đột #2" (cảnh báo sai ở trang đăng nhập sau bootstrap) vẫn chưa sửa** — mức độ thấp, chỉ ảnh hưởng thông báo, không ảnh hưởng chức năng.
- **`StorageUpload.attachUploadInput()` là dead code** — không còn nơi nào gọi sau khi Media Library thay thế 5 chỗ dùng cũ; chưa dọn.
- **Cloud Function `openaiProxy` vẫn chưa deploy** — kế thừa từ Sprint 3.
- **Job Queue vẫn là V1 (client-side)** — chưa có Cloud Functions xử lý nền, kế thừa từ Sprint 2/3.
- **AI Task Router vẫn rule-based, Topic-only Routing chưa mở rộng** — kế thừa từ Sprint 4/5/6.
- **Cost Tracking vẫn là ƯỚC TÍNH** — chưa dựa trên token/chi phí thật, kế thừa từ Sprint 7.
- **`ContextBuilder` chưa được Plugin nào dùng** — kế thừa từ Sprint 7.
- **Chưa phân trang Firebase thật** cho các trang danh sách lớn — kế thừa từ các Sprint trước.
- **Backup Google Drive không khả dụng trong môi trường hiện tại** — GitHub (`feature/cms-ai-sprint2`) vẫn là nơi backup từ xa duy nhất khả dụng.

## Mục đề xuất chuyển sang Sprint 9 (chỉ ghi nhận, không tự triển khai)

- Deploy `database.rules.json` lên Firebase thật (thao tác vận hành) + version-control `storage.rules`.
- Sửa `js/admin-login.js` để không hiện cảnh báo sai sau bootstrap ("Xung đột #2").
- Xác nhận thủ công 1 lần trên Firebase thật rằng `admin-users.js`'s `createUser()` hoạt động đúng sau khi deploy Rules (đã đính chính bằng đọc mã nguồn ở mục 5, nhưng chưa kiểm thử end-to-end trên Firebase thật).
- Quyết định có sửa `data-provider.js` để AI Plugin đọc được toàn bộ Media Library hay không (Architectural Constraint hiện khoá, cần Requirement riêng cho phép).
- Job Queue Concurrency Safety mới vá đúng race condition đã biết — cân nhắc có cần nâng cấp Queue lên kiến trúc server-side (Cloud Functions, "V2" đã ghi trong `job-queue.js` từ đầu) nếu tải thật tăng lên.
- Dọn `StorageUpload.attachUploadInput()` (dead code).
- Các mục kế thừa từ Sprint 7 (migrate `ContextBuilder`, AI Memory, Automation nền thật, Topic-only Routing, Cost Tracking token thật, deploy Cloud Function, phân trang Firebase) — vẫn treo, xem `docs/SPRINT_7_FINAL_REPORT.md` mục tương ứng.

**Lưu ý quan trọng cho Sprint 9 Planning**: file `SPRINT_9_PLANNING.md` xuất hiện (untracked) trong working tree ở thời điểm viết báo cáo này — đây là sản phẩm của một phiên làm việc TRƯỚC đó đã **nhầm branch** (`claude/cms-image-experience-2-u89lud`, một dự án Next.js/MySQL hoàn toàn khác, không liên quan tới PSH Platform thật trên `feature/cms-ai-sprint2`). File đó phân tích SAI codebase — **không dùng file đó làm cơ sở cho Sprint 9 Planning thật của nhánh này**. Sprint 9 Planning cho `feature/cms-ai-sprint2` cần được lập lại từ đầu, dựa trên đúng ROADMAP.md/CHANGELOG.md/AI_RULES.md của nhánh này.

## Việc cần người dùng làm

1. Lập Sprint 9 Planning (nếu muốn tiếp tục) — chọn 1 hoặc nhiều mục ở "Mục đề xuất chuyển sang Sprint 9" ở trên để giao rõ ràng. **Không dùng `SPRINT_9_PLANNING.md` hiện có trong working tree** (sai branch/dự án — xem lưu ý ở trên).
2. Cài đặt Firebase CLI + đăng nhập để deploy `database.rules.json` lên môi trường thật.
3. Xác nhận thủ công trên Firebase thật rằng "Thêm tài khoản mới" (`admin/users.html`) vẫn hoạt động sau khi deploy Rules (đã đính chính bằng đọc mã nguồn, khuyến nghị xác nhận thêm 1 lần trên môi trường thật).

**SPRINT 8 COMPLETED.**
