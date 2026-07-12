# SPRINT 10 PLANNING

**Trạng thái: DỰ THẢO — chờ Chief Architect phê duyệt.** Không có code, không có Requirement, không có commit/push nào đi kèm tài liệu này. Đây là bản duy nhất được xuất ra theo Stop Condition.

---

## 1. Rà soát Knowledge Base

Đã đọc: `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`, `AI_RULES.md`, `docs/SPRINT_8_FINAL_REPORT.md`, `README.md` (bổ sung để nắm đúng CMS Admin/AI Assistant hiện có).

**Ghi rõ file bị thiếu — không suy diễn nội dung:**

- **`docs/SPRINT_9_FINAL_REPORT.md` KHÔNG TỒN TẠI.** Context của Requirement này giả định file đã có, nhưng Sprint 9 mới chỉ hoàn thành Requirement #1-#3 (Documentation Integrity Restoration, Firebase Database Rules Production Alignment, Firebase Storage Security Rules) — theo đúng `ROADMAP.md` dòng cuối: "CHƯA làm Requirement #4, chờ Chief Architect giao". Sprint 9 **chưa có Sprint Review/Đóng Sprint chính thức**, nên chưa có Final Report. Phân tích Sprint 10 Planning này dùng `CHANGELOG.md`/`ROADMAP.md` (đã có mục ghi đầy đủ cho cả 3 Requirement Sprint 9) làm nguồn thay thế — không suy đoán nội dung Sprint 9 Requirement #4 vì Requirement đó chưa xảy ra.
- **Phát hiện phụ**: `README.md` (mục "AI Assistant") vẫn tham chiếu `SPRINT_9_PLANNING.md` như "kế hoạch Sprint đang chờ phê duyệt" — file này **không tồn tại** trong repo (chỉ có `SPRINT_6_PLANNING.md`/`SPRINT_7_PLANNING.md` ở root, không có `SPRINT_8_PLANNING.md`/`SPRINT_9_PLANNING.md`). Đây là tham chiếu lỗi thời còn sót lại (có thể do file nháp sai-branch bị bỏ ở Sprint 8 Review nhưng câu trong README chưa được cập nhật lại). Không tự sửa `README.md` ở Planning này (Out of Scope: không viết code/tài liệu sản phẩm) — chỉ ghi nhận, đề xuất xử lý trong Sprint 10 Requirement #1 (xem "Product Experience Rules"/"Founder Daily Workflow" bên dưới, hoặc gộp vào phần dọn dẹp tài liệu nếu Chief Architect thấy cần).

## 2. Vision & Philosophy — diễn giải lại theo đúng kiến trúc hiện có

> "Một lần nhập dữ liệu → AI xử lý → Sinh nhiều đầu ra → Review → Publish"

Đối chiếu với kiến trúc thật: pipeline này **đã tồn tại về mặt kỹ thuật** từ Sprint 7 Requirement #4 (`WorkflowEngine`, chạy tuần tự nhiều Plugin qua đúng Permission Service/Plugin Manager/Queue) — nhưng hiện là 1 công cụ **kỹ thuật cho Engineer/Admin** (`admin/ai/workflow.html`: tự ghép Step, tự chọn Plugin theo id, tự điền input từng Step tay), không phải trải nghiệm "1 lần nhập dữ liệu" cho Founder. Đây chính là khoảng cách cốt lõi giữa "AI Framework" (đã xong) và "Business Operating System" (Sprint 10 phải xây) — **không cần kiến trúc mới**, cần 1 lớp Experience Layer Founder-facing bọc quanh những gì đã có.

**Ràng buộc nền tảng vẫn còn hiệu lực** (đã xác nhận qua nhiều Sprint, không đổi ở Planning này): `AI_RULES.md` mục 3 — không trigger tự động/cron/webhook, mọi hành động vẫn phải do Founder chủ động bấm. "Một lần nhập dữ liệu → AI xử lý → Sinh nhiều đầu ra" vẫn là Founder chủ động bấm 1 nút để khởi chạy — không vi phạm Constitution, chỉ cần thiết kế đúng.

## 3. Đánh giá hệ thống hiện tại — đâu đã Production, đâu còn thiếu

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| CMS lõi (Product/Category/Banner/Slider/Blog/Video Manager) | ✅ Production, đã có Media Library (Sprint 8) | Vẫn là form kỹ thuật (field thô), chưa "Smart" |
| 8/8 AI Plugin (content generation) | ✅ Code Production | **Chưa từng chạy Generate thật** — xem mục 4 |
| Draft Workflow / Human Review | ✅ Production | Đúng thiết kế, không đổi |
| Firebase Database Rules + Storage Rules | ✅ Code + kiểm thử Emulator thật, **CHƯA deploy** | Thao tác vận hành còn thiếu (Sprint 8/9) |
| Cloud Function `openaiProxy` | ✅ Code từ Sprint 3, **CHƯA deploy** | **Chặn TOÀN BỘ giá trị thật của AI Framework** — xem mục 4 |
| Media Library | ✅ Production (Sprint 8) | AI Plugin (`DataProvider.getMedia()`) chưa đọc từ đây |
| AI Assistant hội thoại (`assistant.html`) | ✅ Production nhưng hạn chế | Chỉ định tuyến được Plugin nhắm 1 Product/Blog Post cụ thể (Topic-only Routing vẫn chưa mở rộng) |
| Workflow Automation / Context Builder / Workflow Insights / Cost Tracking / Observability | ✅ Production nhưng **Engineer-facing**, không phải Founder-facing | Xem mục 4 |
| AI Image Generation thật | ❌ Chưa có — chỉ sinh văn bản Prompt | Cần cho "AI Image" trong One Click Marketing |
| AI Video | ❌ Chưa có gì | Cần Architecture Proposal trước |
| Facebook auto-publish thật | ❌ Chưa có — Facebook Post Generator chỉ tạo Draft để copy tay | Cần tích hợp Facebook Graph API (ngoài phạm vi hiện có) |
| Multi-tenant / Business Manager | ❌ Chưa có — 1 business duy nhất (Pshop Music) hard-code trong seed data | Xem đánh giá candidate #1 |

## 4. Phần phải hoàn thành TRƯỚC KHI Founder dùng mỗi ngày (không thương lượng được)

**Phát hiện quan trọng nhất của Planning này**: sau 9 Sprint, **Cloud Function `openaiProxy` chưa từng được deploy lên môi trường thật** (xác nhận lặp lại ở Sprint 3/8/9: `firebase projects:list`/`firebase functions:list` báo lỗi xác thực trong môi trường phát triển này). Hệ quả: **chưa có 1 lượt AI Generate thật nào từng chạy thành công trong Production** — toàn bộ 8 Plugin, Workflow Automation, và bất kỳ tính năng "One Click Marketing" nào Sprint 10 xây thêm đều sẽ **KHÔNG có giá trị thật với Founder** cho tới khi việc deploy này xảy ra. Đây không phải lỗi kiến trúc — code đã sẵn sàng 100% — nhưng là **gate bắt buộc**, đứng trước mọi cải tiến UX khác về mặt giá trị thực tế mang lại. Xem candidate #10 "PSH Cloud Foundation" bên dưới cho đề xuất xử lý cụ thể.

## 5. Founder Daily Workflow — đánh giá UX cho từng thao tác hằng ngày

| Thao tác | Đường đi hiện tại | Đánh giá | Đề xuất cải thiện |
|---|---|---|---|
| **Đăng sản phẩm** | `admin/products.html` (CRUD + Media Library) → muốn có mô tả AI phải sang `admin/ai/index.html` (Plugin Dashboard) chạy riêng → `admin/ai/drafts.html` duyệt riêng | ⚠️ Rườm rà — 3 trang, 3 lần điều hướng cho 1 tác vụ | Smart CMS: nút "Viết mô tả bằng AI" ngay trên form Product, review tại chỗ |
| **Thay Banner** | `admin/banners.html` (CRUD + Media Library) | ✅ Đã mượt — không cần AI cho tác vụ này | Không cần thay đổi lớn |
| **Viết Content** (Blog/Facebook) | Plugin Dashboard → chọn Blog Writer/Facebook Post Generator riêng lẻ → Drafts duyệt riêng lẻ | ⚠️ Rườm rà tương tự — không có luồng "viết cả 2 cùng lúc từ 1 chủ đề" | One Click Marketing / Workflow Automation Founder-facing |
| **Tạo Ảnh** | Image Prompt Generator chỉ sinh VĂN BẢN Prompt — Founder phải tự dán sang công cụ ngoài (Midjourney/DALL-E...) rồi tự tải ảnh lên qua Media Library | ❌ Thiếu năng lực thật — chưa tích hợp AI Image Generation thật | Cần Requirement riêng "AI Image Generation" (đề xuất Sprint 12, xem mục 7) |
| **Chuẩn bị Video** | Không có gì | ❌ Chưa có năng lực nào | AI Video Studio — chỉ nên làm Architecture Proposal ở Sprint 10-11, thực thi sau |
| **Đăng Website** | Duyệt & Publish từng Draft (Product/Blog/Banner/Slider) qua `admin/ai/drafts.html` | ✅ Hoạt động đúng, nhưng rời rạc nếu có nhiều Draft cùng lúc | Review Screen — duyệt gộp 1 màn hình |
| **Đăng Facebook** | Facebook Post Generator → Draft `targetCollection:null` → Founder tự copy văn bản, tự dán vào Facebook thật | ⚠️ Không phải "đăng" thật — chỉ soạn nội dung để copy tay | Ghi nhận đúng giới hạn thật (không tự nhận là "đăng Facebook" tự động) — tích hợp Facebook Graph API là 1 Epic riêng, rủi ro/độ phức tạp cao (App Review, Page Access Token), KHÔNG đề xuất cho Sprint 10 |

**Kết luận Founder First**: hệ thống hiện có 2 "tầng" UI hoàn toàn tách biệt — tầng **Engineer/Ops** (Observability, Cost Tracking, Context Builder Preview, Workflow kỹ thuật, Job Queue, Logs, Providers) phục vụ vận hành/debug hệ thống, và tầng **CMS thao tác** (Product/Banner/Blog/Slider Manager) — nhưng **chưa có tầng thứ 3: Founder Daily Workflow**, nơi 1 Founder không cần biết "Plugin"/"Queue"/"Job"/"Provider" là gì vẫn hoàn thành được việc hằng ngày. Sprint 10 phải xây đúng tầng thứ 3 này TRÊN NỀN 2 tầng đã có, không thay thế chúng.

## 6. Đánh giá + Ưu tiên 12 Candidate

| # | Candidate | Business Value | Rủi ro kiến trúc | Sẵn sàng ngay? | Đề xuất thứ tự |
|---|---|---|---|---|---|
| 10 | PSH Cloud Foundation | Rất cao (gate mọi giá trị AI thật) | Thấp (code đã xong, chỉ thiếu vận hành) | ✅ | **1** |
| 12 | Product Experience Rules | Cao (chiến lược, ngăn UX trôi dạt) | Rất thấp (chỉ tài liệu) | ✅ | **2** |
| 6 | Founder Daily Workflow | Rất cao | Thấp | ✅ | **3** |
| 2 | Smart CMS | Cao | Thấp–Trung bình | ✅ | **4** |
| 4 | Card UI Wizard | Cao (nền tảng cho #3 Epic) | Thấp | ✅ | **5** |
| 5 | Review Screen | Cao | Trung bình (cần quyết định cách gộp batch) | ✅ | **6** |
| 3 | One Click Marketing | Rất cao (đúng Philosophy nhất) | Trung bình (phụ thuộc #4/#5) | Sau khi có #4/#5 | **7** |
| 7 | Voice Input Foundation | Trung bình | Thấp–Trung bình (hỗ trợ trình duyệt không đều) | ✅ | **8** |
| 8 | AI Video Studio Architecture | Thấp–Trung bình (chỉ Proposal) | Thấp (không code) | ✅ (chỉ tài liệu) | **9** |
| 1 | Business Manager (Multi-tenant Phase 1) | Thấp hiện tại / Cao dài hạn | **Rất cao** (đổi gần như mọi Database node) | Chưa — chờ có business thứ 2 thật | Hoãn (Sprint 13+) |
| 9 | BYOK Foundation | Thấp hiện tại (phụ thuộc #1) | Trung bình–Cao (quản lý secret) | Chưa — phụ thuộc Business Manager | Hoãn (Sprint 13+) |
| 11 | Free Trial Foundation | Thấp hiện tại (phụ thuộc #1 + Billing) | N/A (chưa nên bắt đầu) | Chưa | Hoãn (Sprint 13+) |

## 7. Chi tiết đầy đủ từng Candidate (Objective / Business Value / Architectural Impact / Dependencies / Risk Assessment / Out of Scope)

### 1. Business Manager (Multi-tenant Phase 1)

- **Objective**: Đưa khái niệm "Business" thành 1 entity hạng nhất để PSH có thể phục vụ nhiều hơn 1 doanh nghiệp trong tương lai, bắt đầu từ đúng 1 doanh nghiệp hiện có (Pshop Music).
- **Business Value**: Thấp trong ngắn hạn (Founder hiện chỉ có 1 doanh nghiệp) — giá trị chiến lược dài hạn cao (mở khoá mô hình SaaS), nhưng chỉ hiện thực hoá khi có doanh nghiệp thứ 2 thật.
- **Architectural Impact**: **Cao nhất trong toàn bộ 12 candidate** — cần thêm `businessId` vào gần như mọi node Firebase (`products/categories/banners/blogPosts/videos/siteContent/aiDrafts/aiJobs/aiLogs/aiPlugins/aiProviderConfig/roles`), viết lại `database.rules.json` để scope theo `businessId`, sửa MỌI hàm data layer (`DB`/`CategoryDB`/`BannerDB`/`BlogDB`/`VideoDB`/`SeoDB`/`SiteContentDB`/`DraftDB`/`JobDB`/`LogDB`/`PluginDB`/`ProviderConfigDB`) để lọc theo `businessId`.
- **Dependencies**: Bắt buộc Decision Record (thay đổi Database Structure lớn nhất từng có trong dự án) + phê duyệt riêng của Chief Architect trước khi viết bất kỳ dòng code nào; kéo theo phải viết lại Firebase Rules (Sprint 8/9).
- **Risk Assessment**: Rất cao — chạm vào toàn bộ hệ thống cùng lúc, rủi ro regression cao nhất trong 12 candidate; xây multi-tenant khi chưa có tenant thứ 2 thật là rủi ro Over-Engineering (đi ngược nguyên tắc "Không tạo Epic mới nếu chưa thật sự cần" đã áp dụng xuyên suốt dự án).
- **Out of Scope (đề xuất cho Sprint 10)**: Toàn bộ — không triển khai. Nếu Chief Architect muốn chuẩn bị trước, chỉ nên dừng ở 1 Decision Record phác thảo schema, chưa viết code.

### 2. Smart CMS (Smart Mode / Advanced Mode)

- **Objective**: Thêm chế độ "Smart Mode" đơn giản hoá lên trên các trang CMS đã có (Product/Banner/Blog/Slider) — ẩn field kỹ thuật theo mặc định, chèn nút "Tạo bằng AI" ngay trong form; giữ "Advanced Mode" (hành vi hiện tại) cho Editor/power-user.
- **Business Value**: Cao — cải thiện UX hằng ngày lớn nhất mà không cần hạ tầng mới; đưa AI Generate vào đúng luồng CMS tự nhiên thay vì phải rời sang Plugin Dashboard riêng.
- **Architectural Impact**: Thấp–Trung bình — chỉ là Experience Layer trên các trang admin đã có, tái sử dụng nguyên `PluginManager.execute()` → Queue → Draft (đúng luồng `admin/ai/index.html` đã dùng, chỉ đổi điểm khởi chạy). Không đổi Database Structure.
- **Dependencies**: Media Library (Sprint 8), Plugin Manager/Queue/Draft Workflow (Sprint 2), 8 Plugin đã Production (Sprint 3/5/6).
- **Risk Assessment**: Thấp–Trung bình — rủi ro chính là phình phạm vi nếu cố làm "Smart Mode" cho MỌI field/MỌI trang cùng lúc thay vì bắt đầu từ 1-2 trang giá trị cao nhất (Product).
- **Out of Scope**: Redesign giao diện admin toàn diện; đa ngôn ngữ; AI-assist cho mọi field cùng lúc (nên bắt đầu Product description + SEO trước).

### 3. One Click Marketing

- **Objective**: 1 luồng dẫn dắt duy nhất — Founder nhập tối thiểu 1 lần (ảnh, giá, khuyến mãi, địa chỉ, thông tin doanh nghiệp), hệ thống tự sinh nhiều đầu ra sẵn sàng Review (xem mục 8 cho Workflow đề xuất chi tiết).
- **Business Value**: Rất cao — đây chính là hiện thực hoá Philosophy của Sprint 10 ("1 lần nhập → AI xử lý → Nhiều đầu ra → Review → Publish") thành sản phẩm cụ thể.
- **Architectural Impact**: Trung bình — xây HOÀN TOÀN trên nền có sẵn: Workflow Automation (Sprint 7 #4, chạy tuần tự nhiều Plugin qua Permission/Plugin Manager/Queue) + Draft Workflow + Media Library + Plugin hiện có (Banner/Facebook Post/SEO/Slider Generator). Phần MỚI thực sự cần: (a) 1 tầng "adapter" ánh xạ 1 bộ input chung sang đúng `inputParams` riêng của từng Plugin (Plugin interface không đổi), (b) Card UI Wizard (#4) thu input, (c) Review Screen (#5) gộp kết quả.
- **Dependencies**: Card UI Wizard, Review Screen, Workflow Automation, Media Library, Banner/Facebook Post/SEO/Slider Generator, dữ liệu Product/Settings hiện có.
- **Risk Assessment**: Trung bình — thách thức chính là ánh xạ 1 bộ input chung vào các Plugin có input shape khác nhau (SEO Generator cần `postId` đã tồn tại — có thể cần Blog Writer tạo bài trước rồi mới chạy SEO Generator, 1 chuỗi 2 bước tự nhiên qua Workflow Automation).
- **Out of Scope**: Đăng Facebook thật (không có Graph API); tạo Ảnh/Video thật (chưa tích hợp Provider tương ứng) — chỉ giao Draft/Prompt để Founder tự xử lý phần này cho tới khi có Requirement riêng.

### 4. Card UI Wizard

- **Objective**: Xây 1 component wizard dạng card, từng bước, tái sử dụng được — cơ chế UI nền cho One Click Marketing (và các luồng dẫn dắt tương lai).
- **Business Value**: Cao — là phương tiện UX biến "1 lần nhập" từ Philosophy thành trải nghiệm thật, dễ dùng.
- **Architectural Impact**: Thấp — thuần Front-end (HTML/CSS/JS), không đổi Database/Permission/Queue. Nên mô phỏng đúng pattern đã chứng minh hiệu quả của `MediaLibraryPicker` (Sprint 8) — 1 component `mount()`-style, dùng lại được ở nhiều trang.
- **Dependencies**: Không phụ thuộc kiến trúc nào bắt buộc; là input cho One Click Marketing.
- **Risk Assessment**: Thấp — component cô lập, dễ kiểm thử độc lập.
- **Out of Scope**: Không tự chứa Business Logic về "gọi Plugin nào" — việc điều phối thuộc về Workflow Automation/One Click Marketing, giữ Wizard là 1 vỏ thu thập input thuần túy (tách biệt trách nhiệm).

### 5. Review Screen

- **Objective**: 1 màn hình duy nhất để Founder duyệt TẤT CẢ đầu ra từ 1 lượt "One Click Marketing" (hoặc bất kỳ batch nào) cùng lúc — duyệt từng cái hoặc duyệt hàng loạt — thay vì phải vào `admin/ai/drafts.html` nhiều lần.
- **Business Value**: Cao — hiện thực hoá bước "Review → Publish" thành 1 bước duy nhất thay vì N lượt; Human Review vẫn bắt buộc (`AI_RULES.md` mục 1) — làm cho việc bắt buộc này BỚT phiền, không phải làm YẾU đi.
- **Architectural Impact**: Trung bình — tái sử dụng hoàn toàn `DraftDB`/`publishDraftById()`/`rejectDraftById()` (Sprint 4 #2). Câu hỏi thiết kế mở: làm sao biết Draft nào thuộc "cùng 1 batch"? 2 lựa chọn:
  - **(a) Theo phiên trình duyệt (session-based)** — theo dõi các `resultDraftId` từ các Job vừa tạo trong CÙNG phiên, giống cách `admin/ai/workflow.html`/`admin/ai/assistant.html` đã theo dõi 1 `jobId` cụ thể. **KHÔNG cần đổi Database Structure.** **Đề xuất chọn phương án này cho Sprint 10.**
  - **(b) Field `batchId`/`workflowRunId` lưu vào `aiDrafts`/`aiJobs`** — cho phép xem lại batch cũ sau khi đóng trình duyệt, nhưng LÀ 1 thay đổi Database Structure, cần Decision Record riêng.
- **Dependencies**: `DraftDB`, `publishDraftById()`/`rejectDraftById()`, Workflow Automation (nguồn tạo ra batch Job).
- **Risk Assessment**: Thấp–Trung bình — rủi ro chính nếu Founder rời trang giữa chừng (mất nhóm theo dõi phiên, nhưng từng Draft riêng lẻ vẫn an toàn trong `drafts.html` như phương án dự phòng).
- **Out of Scope**: Xem lại batch cũ sau khi đóng phiên (phụ thuộc quyết định (b) ở trên, để dành sau).

### 6. Founder Daily Workflow

- **Objective**: Xây 1 trang chủ Founder-facing MỚI — khác `admin/index.html` (Dashboard kỹ thuật, số liệu) và khác `admin/ai/observability.html` (Engineer-facing) — tập trung vào 7 tác vụ hằng ngày (Đăng sản phẩm/Thay Banner/Viết Content/Tạo Ảnh/Chuẩn bị Video/Đăng Website/Đăng Facebook) làm điểm vào trực tiếp, ẩn hoàn toàn thuật ngữ Plugin/Queue/Provider.
- **Business Value**: Rất cao — hiện thực hoá trực tiếp yêu cầu "Founder phải dùng được PSH mỗi ngày"; đòn bẩy cao nhất/rủi ro thấp nhất trong toàn bộ 12 candidate.
- **Architectural Impact**: Thấp — 1 trang điều hướng/tổng hợp MỚI, liên kết sâu (deep-link) vào các trang/luồng ĐÃ CÓ (Product Manager, Banner Manager, One Click Marketing Wizard khi có, Review Screen khi có) — không Database/Business Logic mới, cùng vai trò kiến trúc như Observability Dashboard (Sprint 7) nhưng hướng tới Founder thay vì Engineer.
- **Dependencies**: Lý tưởng nên làm SAU khi Smart CMS/One Click Marketing/Card UI Wizard/Review Screen đã có (để có nơi liên kết tốt) — nhưng có thể ra mắt bản MVP sớm, liên kết tới các trang hiện có trước, rồi nâng cấp link dần trong Sprint.
- **Risk Assessment**: Thấp.
- **Out of Scope**: Redesign toàn bộ điều hướng Admin (`ADMIN_NAV`) — đây là 1 trang chủ Founder-facing BỔ SUNG, không thay thế sidebar Editor/Engineer hiện có.

### 7. Voice Input Foundation

- **Objective**: Thêm nhập liệu bằng giọng nói (Web Speech API, chuẩn trình duyệt) làm phương án thay thế bàn phím ở những nơi Founder đang gõ tay (mô tả sản phẩm, field trong Wizard).
- **Business Value**: Trung bình — tiện lợi cho việc dùng hằng ngày/di động/tay bận (chủ shop DJ/âm thanh có thể đọc trong lúc di chuyển) nhưng không chặn nghẽn gì nếu chưa có.
- **Architectural Impact**: Thấp — thuần Front-end (`SpeechRecognition` Web API), chỉ đổ văn bản đã nhận dạng vào field input ĐÃ CÓ — không đổi Provider/Queue/Database.
- **Dependencies**: Không bắt buộc kiến trúc nào; hợp lý nhất khi ghép cùng Card UI Wizard/Smart CMS field.
- **Risk Assessment**: Thấp–Trung bình — hỗ trợ trình duyệt không đồng đều (Web Speech API yếu hơn ngoài Chrome) — nên coi là tính năng tăng cường (progressive enhancement), không phải đường đi bắt buộc.
- **Out of Scope**: Lệnh thoại điều khiển hành động (vd "publish ngay" bằng giọng nói) — sẽ lấn sang vùng Automation/trigger (liên quan `AI_RULES.md` mục 3) — Requirement này CHỈ chuyển giọng nói thành văn bản, không điều khiển hành động.

### 8. AI Video Studio Architecture

- **Objective**: Chỉ viết 1 đề xuất KIẾN TRÚC (dạng Decision Record, không code) cho việc tích hợp AI Video Generation thật trong tương lai — lựa chọn Provider, ảnh hưởng chi phí, ảnh hưởng Draft Workflow (file video là nội dung nhị phân lớn, khác Draft văn bản hiện tại).
- **Business Value**: Thấp–Trung bình trong ngắn hạn (chưa có năng lực AI Video nào, "Chuẩn bị Video" hiện có 0 hỗ trợ AI) — nhưng được nêu tên rõ trong danh sách tác vụ hằng ngày của Founder nên đáng có 1 bước phân tích/định phạm vi dù triển khai thật còn chờ.
- **Architectural Impact**: Chỉ là đề xuất kiến trúc cho Sprint 10 (đúng tên "Architecture", không phải "Implementation") — triển khai thật sau này sẽ cần: 1 Provider hỗ trợ video (implement `IAIProvider` khác hình dạng lời gọi `generate()` hiện tại — thường bất đồng bộ/polling, không đồng bộ như text), tích hợp Storage cho file video lớn (Media Library đã sẵn sàng mở rộng — chỉ cần đổi điều kiện lọc `contentType`, xem Sprint 8 Requirement #2), và thay đổi mô hình nội dung Draft (URL/trạng thái video thay vì văn bản) — đây là khác biệt lớn về pattern tương tác Queue.
- **Dependencies**: Về logic nên làm AI Image Generation thật TRƯỚC (đơn giản hơn, có tiền lệ hơn, và đã được nêu tên riêng là 1 đầu ra của One Click Marketing) — đề xuất Video Architecture là tài liệu ở Sprint 10, triển khai thật để dành Sprint 12/13 sau khi Image Generation đã được chứng minh.
- **Risk Assessment**: Thấp cho phần đề xuất (không code); Cao cho triển khai thật sau này (chi phí, độ phức tạp bất đồng bộ, pattern Provider mới) — ghi rõ khoảng cách này để tránh đánh giá thấp về sau.
- **Out of Scope**: Bất kỳ code/tích hợp Video nào ở Sprint 10.

### 9. BYOK Foundation (Bring Your Own Key)

- **Objective**: Cho phép 1 doanh nghiệp (khái niệm, dù hiện chỉ có 1) tự cung cấp API Key AI Provider riêng thay vì chỉ dùng chung `openaiProxy` + key trong Secret Manager của PSH.
- **Business Value**: Trung bình–Thấp cho Sprint 10 (Founder là người dùng duy nhất, dùng chung key PSH cấp sẵn là đủ) — trở nên Cao khi bắt đầu giai đoạn Multi-tenant (tách biệt chi phí, tránh rủi ro billing chung giữa nhiều doanh nghiệp).
- **Architectural Impact**: Trung bình — cần cơ chế lưu trữ Key an toàn theo từng doanh nghiệp (**KHÔNG được lưu trong Realtime Database** — đúng bài học đã trả giá thật ở Sprint 3 Requirement #1/`ARCHITECTURE_REVIEW_SPRINT3.md`, node client-đọc-được không an toàn cho secret) — cần Cloud Function/Secret Manager riêng theo doanh nghiệp, hoặc Firebase Auth Custom Claims + kho khoá backed bởi Admin SDK.
- **Dependencies**: Business Manager (Multi-tenant) — BYOK gần như vô nghĩa khi chỉ có 1 doanh nghiệp; mẫu Cloud Function Proxy (Sprint 3) làm nền mở rộng.
- **Risk Assessment**: Cao nếu làm vội — xử lý API Key chính là loại sai lầm dự án đã từng gặp thật (Sprint 3), không được lặp lại "lưu secret vào node client đọc được".
- **Out of Scope cho Sprint 10**: Toàn bộ triển khai — chỉ ghi nhận ROADMAP, chờ tới khi Business Manager thật sự bắt đầu.

### 10. PSH Cloud Foundation

- **Objective**: Đưa hạ tầng ĐÃ CÓ SẴN NHƯNG CHƯA DEPLOY vào vận hành thật — deploy `functions/openaiProxy` (sẵn sàng từ Sprint 3), `database.rules.json` (sẵn sàng từ Sprint 8), `storage.rules` (sẵn sàng từ Sprint 9) — biến "code hoàn chỉnh" thành "chạy thật cho người dùng thật".
- **Business Value**: **Cao nhất trong toàn bộ 12 candidate.** Không có bước này, KHÔNG có tính năng AI nào từng tạo ra kết quả thật; Founder không thể dùng bất kỳ năng lực AI nào hằng ngày cho dù lớp UX (One Click Marketing/Smart CMS/Wizard) có tốt tới đâu, vì lời gọi `generate()` chưa từng thành công với OpenAI thật trong môi trường này. Đây là khoảng hở duy nhất, quan trọng nhất, chặn toàn bộ giá trị thật của mọi cải tiến Founder-facing khác.
- **Architectural Impact**: KHÔNG có về mặt code (cả 3 phần đều đã viết, review, kiểm thử xong) — đây thuần là việc VẬN HÀNH: `firebase login`, `firebase deploy --only functions,database,storage`, `firebase functions:secrets:set OPENAI_API_KEY`, sau đó thay hằng số `OPENAI_PROXY_URL` (placeholder) trong `js/ai/providers/openai.js` bằng URL thật do Firebase CLI in ra.
- **Dependencies**: Cần Founder/người vận hành tự đăng nhập Firebase CLI + có tài khoản Google Cloud Billing (gói Blaze cho Cloud Functions) — đây là hành động **Claude Code không thể tự thực hiện** (đã xác nhận lặp lại ở Sprint 3/8/9: `firebase projects:list` báo lỗi xác thực trong môi trường này).
- **Risk Assessment**: Thấp về kỹ thuật (đã có runbook cho Database/Storage Rules: `docs/FIREBASE_RULES_DEPLOYMENT.md`, `docs/FIREBASE_STORAGE_RULES_DEPLOYMENT.md` — còn thiếu runbook tương đương cho Cloud Function) — rủi ro thật sự là: nếu KHÔNG làm, mọi Requirement Sprint 10 khác chỉ mang tính trình diễn, không tạo giá trị thật.
- **Out of Scope**: Bất kỳ thay đổi code nào (mọi thứ đã viết xong) — công việc của Sprint 10 ở đây, nếu được giao, chỉ là: (a) viết `docs/CLOUD_FUNCTION_DEPLOYMENT.md` còn thiếu (theo đúng khuôn 2 tài liệu deploy Rules đã có), (b) bàn giao checklist `firebase login`/deploy rõ ràng cho Founder/người vận hành tự thực hiện.

### 11. Free Trial Foundation

- **Objective**: Chuẩn bị nền tảng cho luồng đăng ký dùng thử miễn phí (giới hạn thời gian, gợi ý nâng cấp).
- **Business Value**: Thấp cho Sprint 10 — khái niệm "dùng thử" chỉ có ý nghĩa khi có doanh nghiệp KHÁC ngoài Pshop Music tham gia, tức phụ thuộc hoàn toàn vào Business Manager tồn tại trước.
- **Architectural Impact**: Cần Business Manager (Multi-tenant, candidate #1) tồn tại trước, cộng thêm hạ tầng Billing/Subscription (chưa hề có ở bất kỳ đâu trong hệ thống) — sớm hơn 2 tầng phụ thuộc so với hiện tại.
- **Dependencies**: Business Manager (Multi-tenant Phase 1), tích hợp Billing/Payment (chưa tồn tại).
- **Risk Assessment**: Không áp dụng cho Sprint 10 (đề xuất KHÔNG bắt đầu) — xây logic dùng thử trước khi có multi-tenant là lãng phí thuần túy (chưa có gì để "thử").
- **Out of Scope**: Toàn bộ, cho Sprint 10 — chỉ ghi nhận ROADMAP, xem lại sau khi Business Manager Phase 1 thật sự tồn tại và đã xác thực với 1 doanh nghiệp thứ 2.

### 12. Product Experience Rules

- **Objective**: Viết 1 tài liệu "Product Experience Constitution" đồng hành cùng `AI_RULES.md` (nhưng cho nguyên tắc UX người dùng cuối) — vd: "màn hình Founder-facing không bao giờ hiện thuật ngữ Plugin/Queue/Provider/Job", "mọi luồng nhiều đầu ra luôn phải có 1 màn hình Review hợp nhất trước Publish", "1 input ánh xạ ra N output, không bao giờ bắt nhập lại cùng 1 dữ kiện 2 lần trong 1 luồng", "chi tiết Advanced/kỹ thuật luôn ẩn sau 1 toggle rõ ràng, không bao giờ hiện mặc định với vai trò Founder" — hệ thống hoá Philosophy thành quy tắc kiểm tra được, áp dụng cho MỌI Requirement Founder-facing từ Sprint 10 trở đi.
- **Business Value**: Cao về chiến lược (ngăn UX trôi dạt/không nhất quán qua nhiều Requirement sau này, đúng vai trò `AI_RULES.md` đã giữ kỷ luật cho AI Framework suốt 9 Sprint) — nhưng không tạo giá trị trực tiếp cho người dùng cuối ngay lập tức.
- **Architectural Impact**: Không có (thuần tài liệu, không code) — sẽ là 1 file mới ở root (vd `PRODUCT_EXPERIENCE_RULES.md`), tương tự vai trò `AI_RULES.md`.
- **Dependencies**: Không phụ thuộc gì — có thể là Requirement ĐẦU TIÊN của Sprint 10 (1 Constitution viết trước khi có bất kỳ code UX nào, đúng cách `AI_RULES.md` ra đời ở Sprint 1/2 trước khi AI Framework được xây).
- **Risk Assessment**: Thấp — nhưng rủi ro nếu KHÔNG làm: mọi Requirement Founder-facing sau này (Smart CMS/One Click Marketing/Wizard/Review Screen/Daily Workflow) có nguy cơ dùng thuật ngữ/pattern không nhất quán, đúng kiểu lỗi mà `AI_RULES.md` từng được tạo ra để ngăn cho AI Framework.
- **Out of Scope**: Bất kỳ code/mockup thiết kế nào — chỉ là tài liệu nguyên tắc bằng văn bản.

## 8. Đánh giá riêng: One Click Marketing — Workflow đề xuất

**Đầu vào tối thiểu** (đối chiếu với dữ liệu CMS thật):

| Đầu vào yêu cầu | Nguồn dữ liệu thật tương ứng |
|---|---|
| Ảnh | Media Library (Sprint 8) — chọn/tải qua `MediaLibraryPicker` |
| Giá | Field giá đã có trên Product (`admin/products.html`) |
| Khuyến mãi | Cần xác nhận field cụ thể khi viết Requirement thật — hiện gần nhất là field `theme` tự do của Banner Generator (vd "Giảm giá tai nghe DJ tháng 7"); chưa có field "khuyến mãi" chuẩn hoá riêng trên Product — **không suy đoán đã có sẵn, cần xác nhận khi scoping Requirement** |
| Địa chỉ / Thông tin doanh nghiệp | `admin/settings.html` (`SiteContentDB.settings`) — đã tồn tại làm Context dùng chung (đã hỗ trợ qua `DataProvider.getSettings()`/`ContextBuilder`) |

**Đầu ra** (đối chiếu năng lực thật hiện có — quan trọng: phân biệt rõ đầu ra nào THẬT SỰ hoàn chỉnh và đầu ra nào chỉ là Draft/Prompt cần thao tác thêm):

| Đầu ra | Năng lực thật hiện có | Trạng thái |
|---|---|---|
| Website (Product/Blog/Banner/Slider) | Draft Workflow → Publish thật qua đúng hàm ghi dữ liệu có sẵn | ✅ Hoàn chỉnh thật |
| SEO | SEO Generator (nhắm Blog Post) → publish gộp field SEO vào `blogPosts` | ✅ Hoàn chỉnh thật (cần có Blog Post trước — xem Workflow đề xuất) |
| Banner | Banner Generator → `BannerDB.add()` thật | ✅ Hoàn chỉnh thật |
| Facebook Content | Facebook Post Generator → Draft `targetCollection:null` | ⚠️ Chỉ soạn nội dung — Founder tự copy/dán, KHÔNG tự đăng |
| AI Image | Image Prompt Generator → chỉ sinh VĂN BẢN Prompt | ⚠️ Chỉ gợi ý Prompt — Founder tự dùng công cụ ngoài, tự tải ảnh qua Media Library |
| AI Video | Không có | ❌ Chưa có năng lực nào |
| Review | Cần Review Screen (candidate #5) — hiện phải duyệt rời rạc từng Draft | Cần xây thêm |
| Publish | `publishDraftById()` (Sprint 4 #2) | ✅ Đã có, tái sử dụng |

**Workflow đề xuất** (tận dụng tối đa kiến trúc có sẵn, không thiết kế mới):

```
Founder → Card UI Wizard (chọn/tạo Product, ảnh, giá, khuyến mãi — địa chỉ/thông tin DN tự lấy từ Settings)
       → [Lớp Adapter MỚI, Experience Layer]: ánh xạ 1 bộ input chung
              → thành inputParams riêng của từng Plugin đích
       → Workflow Automation (đã có, Sprint 7 #4): chạy tuần tự qua đúng
              Permission Service → Plugin Manager → Queue
              Step 1: Blog Writer (tạo bài viết ngắn/thông báo — cần TRƯỚC SEO Generator)
              Step 2: SEO Generator (nhắm đúng Blog Post vừa tạo ở Step 1)
              Step 3: Banner Generator (chủ đề = khuyến mãi)
              Step 4: Facebook Post Generator (nội dung = giá + khuyến mãi)
              Step 5 (tuỳ chọn): Image Prompt Generator (mô tả ảnh sản phẩm)
       → Review Screen (MỚI, candidate #5): gộp mọi Draft vừa tạo trong phiên này
       → Founder duyệt (từng cái hoặc "Duyệt tất cả")
       → Publish: Website/SEO/Banner qua publishDraftById() (thật)
                  Facebook Content: hiển thị rõ "Sao chép nội dung này để đăng tay lên Facebook"
                  AI Image: hiển thị rõ "Sao chép Prompt này để dùng ở công cụ tạo ảnh AI khác"
```

**Lưu ý minh bạch bắt buộc với Founder**: giao diện phải nói rõ ràng "Facebook Content" và "AI Image" hiện là **Draft/Prompt để copy tay**, KHÔNG phải "đã đăng"/"đã có ảnh" — tránh Founder hiểu lầm hệ thống tự động hoàn toàn khi thực tế 2/6 đầu ra vẫn cần thao tác thủ công tiếp theo.

## 9. Đề xuất phân chia Sprint 10 → 13 (chỉ ghi ý tưởng, KHÔNG triển khai)

> Toàn bộ nội dung mục này CHỈ là đề xuất trình tự — không tạo Requirement, không quyết định thay Chief Architect.

**Sprint 10 — Nền tảng Founder-First (đề xuất)**
1. PSH Cloud Foundation (runbook + checklist deploy — gate mọi giá trị AI thật)
2. Product Experience Rules (Constitution UX)
3. Founder Daily Workflow (trang chủ Founder-facing, bản MVP)
4. Smart CMS (bắt đầu từ Product Manager — trang tần suất dùng cao nhất)
5. Card UI Wizard (component nền, nếu còn dư sức Sprint — nếu không, dời sang đầu Sprint 11)
6. Sprint Review

**Sprint 11 — One Click Marketing (Epic chủ lực)**
- Card UI Wizard (nếu chưa xong ở Sprint 10)
- Review Screen
- One Click Marketing (lắp ráp Wizard + Workflow Automation + Review Screen theo Workflow đề xuất ở mục 8)
- Smart CMS mở rộng sang Banner/Blog/Slider
- Sprint Review

**Sprint 12 — Mở rộng năng lực Media + dọn nợ kỹ thuật**
- Voice Input Foundation
- AI Video Studio Architecture (chỉ đề xuất)
- AI Image Generation thật (ý tưởng MỚI phát sinh khi phân tích One Click Marketing — chưa có Epic tên riêng trong 12 candidate ban đầu, cần Chief Architect xác nhận có muốn thêm hay không trước khi đưa vào Requirement)
- `DataProvider`/`ContextBuilder` đọc từ Media Library (đóng khoảng hở đã biết từ Sprint 8)
- Sprint Review

**Sprint 13 — Chỉ nếu mô hình kinh doanh xác nhận cần mở rộng (có điều kiện)**
- Business Manager (Multi-tenant Phase 1) — CHỈ nếu có doanh nghiệp thứ 2 thật sự chuẩn bị onboard
- BYOK Foundation
- Free Trial Foundation
- Sprint Review

## 10. Không tạo Epic mới ngoài phạm vi đã cho

Toàn bộ đề xuất ở mục 7-9 nằm trong đúng 12 candidate Chief Architect đã đặt tên, ngoại trừ 1 ý tưởng phát sinh trong lúc phân tích (mục 9, Sprint 12): "AI Image Generation thật" — được ghi nhận rõ là ý tưởng MỚI, KHÔNG tự thêm vào bất kỳ Requirement nào, chờ Chief Architect xác nhận trước khi đưa vào kế hoạch chính thức.

---

**Chờ Chief Architect phê duyệt trước khi viết Sprint 10 Requirement #1.**
