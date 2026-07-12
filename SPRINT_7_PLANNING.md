# SPRINT 7 PLANNING

**Trạng thái: DỰ THẢO — chờ Chief Architect phê duyệt.** Không có code, không có Requirement, không có commit/push nào đi kèm tài liệu này. Đây là bản duy nhất được xuất ra theo Stop Condition.

---

## 1. Rà soát Knowledge Base

Đã đọc: `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`, `AI_RULES.md`, `README.md`, `docs/SPRINT_6_PROGRESS.md`.

**Không có file nào bị thiếu trong danh sách trên** — khác với các lần rà soát trước (Sprint 6 Planning), lần này không phát sinh file "được nhắc tới nhưng không tồn tại". Đã kiểm tra lại và xác nhận `PROJECT_CONTEXT.md`, `PSH_CONSTITUTION.md`, `DECISIONS.md`, `LESSONS_LEARNED.md` **vẫn không tồn tại** trong repo (đã dùng `README.md`/`AI_RULES.md` làm thay thế xuyên suốt từ Sprint 6 Planning, tiếp tục quy ước này).

### Ghi nhận — không tự sửa (ngoài phạm vi Planning, chỉ ghi nhận)

- **`README.md` mục "AI Assistant" đã lỗi thời đáng kể**: vẫn ghi "Chưa tích hợp API AI thật — mọi provider hiện là stub" (sai từ Sprint 3), liệt kê 8 module như nhau mà không phân biệt module nào đã Production, không nhắc tới Permission Service/Plugin Manager Dashboard/AI Task Router/AI Assistant Experience Layer/Health Check/Usage Visibility (đều đã có từ Sprint 2–5). Đây là tài liệu tham khảo cho người mới, không phải tài liệu vận hành — không ảnh hưởng đến Sprint 6 vì không Requirement nào yêu cầu cập nhật `README.md`.
- **`AI_RULES.md` mục 8 ("Giới hạn phạm vi hiện tại — Sprint 2") mô tả trạng thái ĐÃ CŨ** ("chỉ 3 plugin Enable, 5 plugin Coming Soon") — đây là văn bản lịch sử cố định tại thời điểm viết Constitution, không phải trạng thái sống (trạng thái sống nằm ở `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md`). Theo đúng ràng buộc "Không thay đổi AI_RULES.md" đã áp dụng xuyên suốt mọi Sprint, không tự sửa mục này — chỉ ghi nhận để Chief Architect biết, vì đây có thể gây hiểu lầm cho người đọc mới.
- **Phát hiện lỗi định dạng có sẵn trong `AI_RULES.md`**: có 2 mục cùng đánh số "## 7. Log bắt buộc cho mọi lượt chạy" (dòng 119 và dòng 157) — mục thứ 2 là bản nháp cũ, nội dung sơ lược hơn và dùng thuật ngữ cũ (`success`/`failure` thay vì `completed`/`failed`/`cancelled` đã chuẩn hóa ở mục đầu). Đây là lỗi có sẵn từ khi soạn Constitution ban đầu (Sprint 1/2), chưa từng được dọn — không tự sửa vì vẫn thuộc `AI_RULES.md`. Nếu Chief Architect muốn dọn dẹp, đây sẽ là 1 Requirement riêng ("Constitution Cleanup"), không lẫn vào Sprint 7 tự động.

## 2. Tóm tắt Sprint 6 (đã COMPLETED)

- Cả 8/8 plugin viết từ Sprint 1 đã Production (Product/SEO/Slider từ Sprint 3, FAQ từ Sprint 5, Blog Writer/Facebook Post Generator/Banner Generator/Image Prompt Generator từ Sprint 6).
- Không Regression Sprint 2–5, không đổi Database Structure, không đổi Queue/Plugin Manager/Provider Manager/AI Task Router.
- **Còn treo, chưa giải quyết** (kế thừa nguyên trạng sang Sprint 7):
  - **"AI Workflow Engine"** ("Requirement #2" cũ, Sprint 5) — chưa từng triển khai, chưa có quyết định tiếp tục hay bỏ.
  - **Topic-only Routing cho AI Task Router** — 5/8 plugin (FAQ/Blog Writer/Facebook Post Generator/Banner Generator/Image Prompt Generator) vẫn chỉ dùng được qua Plugin Manager Dashboard, chưa qua AI Assistant (Decision Record Option B, Sprint 5 Requirement #3).
  - **Cloud Function `openaiProxy` chưa deploy** — cần `firebase login` (thao tác vận hành, không phải code).
  - **Google Drive Backup không khả dụng** trong môi trường hiện tại (Auto Mode Safety Classifier chặn cứng).
  - **Firebase Database Rules chưa version-control trong repo.**
  - **Usage Visibility chưa phải Cost Tracking thật** (không có token/chi phí).

## 3. Mục tiêu Sprint 7

> Đưa PSH từ **"AI Content Platform"** (sinh nội dung qua Plugin, Human Review, publish thủ công) sang **"AI Automation Platform"** (hệ thống có khả năng quan sát chính nó, kiểm soát chi phí, tái sử dụng tri thức, và thực hiện các chuỗi hành động nhiều bước — vẫn trong khuôn khổ an toàn hiện có).

**Ràng buộc nền tảng cần lưu ý trước khi chọn Requirement**: `AI_RULES.md` mục 3 quy định "Không có trigger tự động/cron/webhook nào khởi chạy AI. Mọi job đều bắt đầu từ việc người dùng bấm 'Chạy'". Đây là điều khoản Constitution, không phải giới hạn kỹ thuật tạm thời. **Bất kỳ Epic nào có nghĩa "tự động hoá" theo nghĩa "AI tự khởi chạy không cần người bấm" đều xung đột trực tiếp với điều khoản này** — không thể triển khai mà không có quyết định sửa đổi Constitution trước (giống mô hình Decision Record đã dùng cho AI Task Router ở Sprint 5). Việc phân tích ưu tiên bên dưới phản ánh đúng ràng buộc này: các Epic đòi hỏi tự-khởi-chạy được xếp hạng thấp/khoanh vùng rủi ro cao cho tới khi có quyết định đó.

## 4. Phân tích ưu tiên 9 Epic (chỉ phân tích, không tự quyết)

| Epic | Điểm tựa kiến trúc hiện có | Xung đột Constitution? | Business Value (ước tính) | Rủi ro | Đề xuất thứ tự |
|---|---|---|---|---|---|
| **AI Observability** | Có sẵn — mở rộng Health Check (Sprint 5 #1) + Usage Visibility (Sprint 5 #4), đều read-only | Không | Cao — cần "nhìn thấy" hệ thống trước khi tự động hoá bất cứ gì | Thấp | **1** |
| **Cost Tracking** | Có sẵn nền — `aiLogs` đã có, ROADMAP đã ghi nhận cần thêm field | Không (nhưng cần Decision Record đổi Database Structure) | Cao — kiểm soát chi phí là điều kiện tiên quyết trước khi mở rộng automation | Thấp–Trung bình | **2** |
| **AI Memory / Knowledge** | Một phần — Conversation History (Sprint 4 #4) đã có khái niệm "phiên làm việc", nhưng chưa có tái sử dụng ngữ cảnh | Không trực tiếp, nhưng cần Decision Record nếu thêm field mới | Trung bình — giảm trùng lặp, cải thiện chất lượng sinh nội dung | Trung bình | **3** |
| **Workflow Automation** | Một phần — Plugin Manager/Queue đã hỗ trợ chạy nhiều Job, nhưng chưa có khái niệm "chuỗi nhiều Plugin nối tiếp" | Không, **nếu** mỗi bước vẫn cần người dùng xác nhận (không tự động nối bước) | Cao — đúng tinh thần "Automation Platform", nhưng phải thiết kế đúng để không phạm mục 3 | Trung bình | **4** |
| **Self-Healing System** | Một phần — `retryFailed()`/`resume()` đã có nhưng là hành động thủ công của Admin | **Biên giới mơ hồ** — "tự sửa lỗi" cho 1 Job NGƯỜI DÙNG ĐÃ khởi chạy có thể chấp nhận được, nhưng "tự phát hiện + tự khởi chạy sửa lỗi" thì vi phạm mục 3 | Trung bình | Trung bình–Cao (do ranh giới không rõ) | **5** |
| **Business Automation** | Không — chưa có khái niệm gì tương đương | **Có, trực tiếp** — bản chất Epic này là "AI tự chạy theo lịch/sự kiện kinh doanh", đối lập thẳng với mục 3 | Cao về lý thuyết, nhưng không thể hiện thực hoá nếu không sửa Constitution trước | Cao | Hoãn — cần Decision Record riêng trước |
| **AI Image Generation** | Một phần — 2 plugin (Slider/Image Prompt Generator) đã sinh `imagePrompt` làm input tiềm năng | Không xung đột Constitution, nhưng là kiến trúc mới thật sự (Provider tạo ảnh, lưu trữ Storage, Draft chứa binary/URL) | Trung bình — giá trị rõ nhưng không phải "Automation" | Trung bình–Cao (kiến trúc mới, chi phí Provider) | Hoãn |
| **Multi-Agent AI Collaboration** | Không — kiến trúc hiện tại là "1 Plugin = 1 tác vụ độc lập, Queue tuần tự", không có khái niệm nhiều Agent phối hợp | Không trực tiếp xung đột mục 3, nhưng vi phạm tinh thần "Plugin độc lập" (mục 5) nếu các Agent gọi lẫn nhau | Chưa rõ — cần use case cụ thể mới đánh giá được | Rất cao (thiết kế kiến trúc hoàn toàn mới) | Hoãn dài hạn |
| **AI Video Generation** | Không có nền tảng nào | Không xung đột Constitution | Thấp trong ngắn hạn (nhu cầu thực tế của Pshop Music cho video AI chưa rõ) | Rất cao (chi phí Provider, kiến trúc mới, chưa có bước đệm như Image) | Hoãn dài hạn |

## 5. Đánh giá (Architecture / Security / Performance / Scalability / Maintainability / Business Value / Production Readiness)

| Epic | Architecture | Security | Performance | Scalability | Maintainability | Business Value | Production Readiness |
|---|---|---|---|---|---|---|---|
| AI Observability | Tái sử dụng 100% (mở rộng Sprint 5) | Không thêm bề mặt tấn công (read-only) | Nhẹ — chỉ đọc `aiLogs`/`aiJobs` | Cần tính đến khi log lớn (đã ghi nhận ở Sprint 5) | Cao — gộp 2 trang đã có | Cao | Gần sẵn sàng ngay khi triển khai |
| Cost Tracking | Thêm field vào `aiLogs` (Database Structure change — cần Decision Record) | Không ảnh hưởng | Không đáng kể | Tốt | Cao nếu field đơn giản | Cao | Cần OpenAI thật (chờ deploy Cloud Function) để có số liệu ý nghĩa |
| AI Memory / Knowledge | Có thể cần field mới đánh dấu "reference" trên Draft/BlogPost — cần Decision Record nếu vậy | Không ảnh hưởng nếu chỉ đọc dữ liệu đã publish | Nhẹ | Tốt trong ngắn hạn, cần cân nhắc khi số lượng Draft lớn | Trung bình — logic "chọn ngữ cảnh nào" cần thiết kế rõ | Trung bình | Cần thử nghiệm A/B trước khi coi là "sẵn sàng" |
| Workflow Automation (human-triggered, không auto-trigger) | Có thể xây ở tầng UI (giống AI Assistant Sprint 4 — 1 caller mới của PluginManager), không đổi Queue/Permission/Router | Phải đảm bảo mỗi bước vẫn qua Permission Service riêng | Không đáng kể | Tốt | Trung bình — thêm 1 tầng điều phối UI | Cao | Cần thiết kế chi tiết trước, chưa sẵn sàng ngay |
| Self-Healing System (retry có giới hạn cho Job đã được user khởi chạy) | Có thể tận dụng `retryFailed()` có sẵn, thêm điều kiện tự động hoá retry — ranh giới với mục 3 cần làm rõ trước | Cần giới hạn số lần retry để tránh lặp vô hạn/tốn chi phí | Trung bình — retry tự động có thể tăng tải Provider | Cần giới hạn rõ | Trung bình | Trung bình | Cần Decision Record trước khi code |
| Business Automation | Kiến trúc mới hoàn toàn (trigger theo sự kiện/lịch) | Rủi ro cao — AI hành động không có người xác nhận trực tiếp | Chưa đánh giá được (chưa có thiết kế) | Chưa đánh giá được | Thấp trong ngắn hạn (thay đổi Constitution) | Cao về lý thuyết | Rất xa — cần Constitution Amendment trước |
| AI Image Generation | Kiến trúc mới (Provider tạo ảnh, Storage, Draft chứa ảnh) | Cần kiểm soát chi phí Provider tạo ảnh (thường đắt hơn text) | Có thể chậm hơn (tạo ảnh tốn thời gian hơn generate text) | Cần hàng đợi ảnh riêng nếu số lượng lớn | Trung bình | Trung bình | Chưa sẵn sàng — cần thiết kế Provider mới |
| Multi-Agent AI Collaboration | Kiến trúc mới hoàn toàn, vi phạm tinh thần "Plugin độc lập" | Chưa đánh giá được | Chưa đánh giá được | Chưa đánh giá được | Thấp (phức tạp hoá đáng kể) | Chưa rõ | Rất xa |
| AI Video Generation | Kiến trúc mới hoàn toàn | Chưa đánh giá được | Chậm, tốn kém | Chưa đánh giá được | Thấp | Thấp trong ngắn hạn | Rất xa |

## 6. 5 Requirement đề xuất cho Sprint 7 (tối đa 5 — CHƯA viết Requirement thật, chỉ đề xuất để chờ phê duyệt)

### Đề xuất #1 — AI Observability Dashboard

- **Objective**: Gộp Production Health Check (Sprint 5 #1) và Usage Visibility (Sprint 5 #4) thành 1 màn hình quan sát hợp nhất, thêm chỉ báo trực quan khi tỷ lệ lỗi vượt ngưỡng (vd tỷ lệ `failed` trong 24h > X%) — vẫn hoàn toàn read-only.
- **Business Value**: Nền tảng bắt buộc trước khi cân nhắc bất kỳ hình thức tự động hoá nào — không thể tự động hoá thứ không quan sát được.
- **Architectural Impact**: Không đổi Database Structure, không đổi Queue/Permission/Provider Manager — chỉ đọc thêm từ `aiLogs`/`aiJobs` đã có (giống `HealthCheck`/`UsageStats`).
- **Dependencies**: `js/ai/health-check.js`, `js/ai/usage-stats.js` (Sprint 5) — tái sử dụng nguyên vẹn.
- **Risk Assessment**: Thấp — không ghi dữ liệu, không ảnh hưởng Workflow.
- **Out of Scope**: Cảnh báo qua email/Slack (cần tích hợp bên thứ 3 — không có trong phạm vi này); Cost Tracking thật (Đề xuất #2 riêng).

### Đề xuất #2 — Cost Tracking (token/chi phí thật)

- **Objective**: Ghi nhận số token và chi phí ước tính mỗi lượt `generate()` thành công vào `aiLogs`, hiển thị tổng hợp trong Usage Visibility/Observability.
- **Business Value**: Kiểm soát chi phí vận hành AI trước khi mở rộng quy mô sử dụng hoặc tự động hoá — rủi ro tài chính nếu bỏ qua.
- **Architectural Impact**: **Cần Decision Record** — thêm field `tokensUsed`/`estimatedCost` vào `aiLogs` là thay đổi Database Structure (dù chỉ thêm field, không đổi field cũ). Ghi vẫn chỉ qua `AIJobQueue` (không mở thêm nơi ghi Log).
- **Dependencies**: Cloud Function `openaiProxy` phải trả về số liệu usage (OpenAI response có sẵn field `usage`) — cần Cloud Function được deploy để có số liệu ý nghĩa, dù code có thể viết trước.
- **Risk Assessment**: Thấp–Trung bình — rủi ro chính là ước tính chi phí sai nếu áp giá không cập nhật theo bảng giá Provider.
- **Out of Scope**: Giới hạn ngân sách tự động (auto-dừng khi vượt quota) — đây thuộc "Business Automation"/"Self-Healing", không nằm trong đề xuất này.

### Đề xuất #3 — AI Memory Foundation (tái sử dụng nội dung đã duyệt làm ngữ cảnh tham khảo)

- **Objective**: Khi sinh nội dung mới (vd Blog Writer), cho phép nạp thêm 1–3 bài đã publish trước đó (do người dùng tự chọn) làm ngữ cảnh tham khảo phong cách — KHÔNG tự động chọn, KHÔNG lưu trữ "trí nhớ" ẩn.
- **Business Value**: Cải thiện chất lượng/nhất quán nội dung AI sinh ra, giảm nhu cầu chỉnh sửa thủ công.
- **Architectural Impact**: Tái sử dụng `DataProvider.getBlogPosts()` đã có; có thể cần Decision Record nếu muốn đánh dấu "bài nào phù hợp làm tham khảo" bằng 1 field mới trên `blogPosts` — nếu chỉ để người dùng tự chọn thủ công từ danh sách có sẵn thì KHÔNG cần đổi Database Structure.
- **Dependencies**: `js/ai/data-provider.js`, `js/ai/modules/blog-writer.js` (và tương tự cho plugin khác nếu mở rộng).
- **Risk Assessment**: Trung bình — cần tránh để AI "chép" gần như nguyên văn bài tham khảo (rủi ro trùng lặp nội dung/SEO).
- **Out of Scope**: Tự động chọn ngữ cảnh (AI tự quyết định bài nào liên quan) — đây là bước "thông minh hơn" để dành tương lai; Requirement này chỉ dừng ở việc người dùng tự chọn thủ công.

### Đề xuất #4 — Workflow Automation: Chuỗi Plugin do người dùng khởi tạo (Human-Triggered Multi-Step)

- **Objective**: Cho phép người dùng chọn sẵn 1 chuỗi tối đa 2–3 Plugin chạy nối tiếp (vd Blog Writer → SEO Generator trên chính Draft vừa tạo) — nhưng **mỗi bước vẫn phải có Human Review/xác nhận riêng trước khi sang bước kế tiếp** — không tự động nối bước.
- **Business Value**: Bước tiến đầu tiên, an toàn, hướng tới "AI Automation Platform" mà không phá vỡ nguyên tắc Human-in-the-loop.
- **Architectural Impact**: Xây ở tầng UI mới (giống vai trò AI Assistant ở Sprint 4 — 1 caller mới của `PluginManager`), không sửa Queue/Permission Service/Plugin Manager/AI Task Router. Mỗi bước trong chuỗi vẫn phải gọi `PermissionService.checkPluginExecution()` riêng.
- **Dependencies**: `js/ai/plugin-manager.js`, `js/admin-ai.js` (`publishDraftById()`), cấu trúc `AITaskRouter.ROUTES` (tham khảo, không sửa).
- **Risk Assessment**: Trung bình — cần thiết kế rõ ràng ranh giới "chuỗi do người dùng định nghĩa trước" khác với "AI tự quyết định bước tiếp theo" (để không trôi dần thành Business Automation trái Constitution).
- **Out of Scope**: AI tự đề xuất/tự quyết định chuỗi bước tiếp theo; tự động chạy chuỗi theo lịch/sự kiện.

### Đề xuất #5 — Decision Record: Lộ trình sửa đổi Constitution cho Automation có kiểm soát

- **Objective**: KHÔNG viết code — chỉ chuẩn bị 1 phân tích Decision Record chính thức (giống mô hình Router Sprint 5) về việc có nên sửa `AI_RULES.md` mục 3 ("không trigger tự động") để cho phép 1 số automation có kiểm soát (vd retry tự động giới hạn, hoặc trigger theo lịch nhưng vẫn dừng ở Draft chờ duyệt chứ không tự Publish) — trình bày Option A (giữ nguyên, không cho automation nào tự khởi chạy) vs Option B (sửa Constitution có kiểm soát chặt, vd chỉ cho phép tự tạo Draft, tuyệt đối cấm tự Publish).
- **Business Value**: Đây là quyết định gốc rễ quyết định toàn bộ khả năng "Automation Platform" có thể đi xa tới đâu — làm rõ trước khi đầu tư vào Business Automation/Self-Healing/Workflow Automation nâng cao ở các Sprint sau.
- **Architectural Impact**: Không có (Requirement này chỉ tạo ra 1 tài liệu quyết định, giống `SPRINT_7_PLANNING.md` này) — trừ khi Decision được chọn là "sửa Constitution", lúc đó việc sửa `AI_RULES.md` sẽ là 1 Requirement thực thi riêng ở Sprint sau.
- **Dependencies**: Không phụ thuộc kỹ thuật — phụ thuộc hoàn toàn vào phán quyết của Chief Architect.
- **Risk Assessment**: Thấp (bản thân Requirement này không có rủi ro kỹ thuật) — nhưng quyết định ĐƯA RA có thể mở khoá rủi ro cao cho các Sprint sau nếu chọn nới lỏng Constitution.
- **Out of Scope**: Thực thi bất kỳ thay đổi Constitution nào ngay trong Requirement này — chỉ phân tích và trình bày lựa chọn.

## 7. Khuyến nghị thứ tự (chỉ đề xuất, Chief Architect quyết định)

1. Đề xuất #1 (AI Observability) — rủi ro thấp nhất, nền tảng cho mọi thứ sau.
2. Đề xuất #2 (Cost Tracking) — rủi ro thấp, cần thiết trước khi mở rộng quy mô.
3. Đề xuất #5 (Decision Record Automation) — nên làm SỚM (không cần chờ #1/#2 xong về mặt kỹ thuật) vì đây là quyết định gốc rễ, càng để trễ càng khó thay đổi hướng đi giữa chừng.
4. Đề xuất #3 (AI Memory Foundation) — giá trị vừa phải, rủi ro vừa phải.
5. Đề xuất #4 (Workflow Automation - Human-Triggered) — nên làm SAU khi có Đề xuất #5 (Decision Record) để đảm bảo thiết kế chuỗi bước không vô tình trôi dần thành automation trái Constitution.

## 8. Không tạo Epic mới

Toàn bộ 5 đề xuất trên đều nằm trong 9 Epic đã được đặt tên sẵn (AI Observability, Cost Tracking, AI Memory/Knowledge, Workflow Automation, và 1 Decision Record chuẩn bị cho ranh giới giữa Workflow/Business/Self-Healing Automation) — không đề xuất Epic nào ngoài danh sách đã cho.

---

**Chờ Chief Architect phê duyệt trước khi viết Sprint 7 Requirement #1.**
