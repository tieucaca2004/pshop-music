# Changelog

Định dạng: mỗi mục là 1 Sprint/đợt thay đổi, mới nhất ở trên.

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
