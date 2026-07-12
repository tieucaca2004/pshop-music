# SPRINT 11 PLANNING

**Trạng thái: DỰ THẢO — chờ Chief Architect phê duyệt.** Không có code, không có Requirement chính thức, không có commit/push nào đi kèm tài liệu này (đúng quy ước đã áp dụng cho `SPRINT_6_PLANNING.md`/`SPRINT_7_PLANNING.md`/`SPRINT_10_PLANNING.md`).

---

## 1. Sprint 10 Verification

Xác minh trên Git thật, không dựa vào hội thoại:

| Kiểm tra | Kết quả |
|---|---|
| Branch hiện tại | `feature/cms-ai-sprint2` |
| `git status --porcelain` | Sạch — chỉ có 3 file DRAFT chưa từng commit theo đúng quy ước (`SPRINT_6_PLANNING.md`, `SPRINT_7_PLANNING.md`, `SPRINT_10_PLANNING.md` — các bản Planning trước, không phải code) |
| Commit mới nhất | `7e5e874` — "Sprint 10.x: Smart CMS Completion — Smart Mode <-> Advanced Mode" |
| Đồng bộ remote | `git fetch origin` + `git rev-list --left-right --count origin/feature/cms-ai-sprint2...HEAD` → `0  0` (local khớp remote tuyệt đối) |
| Sprint 10 Final Report | `docs/SPRINT_10_FINAL_REPORT.md` xác nhận **SPRINT 10 COMPLETED với 1 khoảng hở đã biết** (Requirement #2/Smart CMS chưa từng được giao) |
| Khoảng hở đó | **Đã lấp một phần** ở Sprint 10.x (`7e5e874`, sau Final Report, KHÔNG sửa lại Final Report) — Smart Mode ↔ Advanced Mode cho sidebar. Đây là phần Navigation/Experience Layer của "Smart CMS" — **KHÔNG phải toàn bộ Vision "Smart CMS"** (AI-assist ngay trong form CMS vẫn chưa có, xem mục 7). |

**Kết luận**: Sprint 10 (+ Sprint 10.x) đã hoàn tất đầy đủ, không có Requirement nào dở dang, không có gì phải sửa trước khi lập Sprint 11. **Đủ điều kiện tiếp tục sang Bước 2.**

## 2. Repository Status

- Không có `package.json` ở gốc repo — xác nhận lại (không suy đoán): đây vẫn là site tĩnh HTML/CSS/JS, không build step, không bundler, không TypeScript. `functions/` (Cloud Function) có `package.json` riêng, độc lập.
- Không tồn tại `PRODUCT_CONSTITUTION.md`, `PRODUCT_BACKLOG.md`, `KNOWN_LIMITATIONS.md`, `DECISION_HISTORY.md`, `UX_GUIDELINES.md`, `SPRINT_PLANNING.md`, `SPRINT_FINAL_REPORT.md`, `SPRINT_HANDOVER.md` (tên chung, không đánh số Sprint) — đã tìm bằng `ls *.md`/`ls docs/`, không có file nào trong 8 tên này. Vai trò của các file này hiện được `AI_RULES.md` (= Constitution), `ROADMAP.md` (= Product Backlog + Known Limitations gộp chung), `docs/DECISION_RECORD_*.md` (= Decision History, theo từng chủ đề) đảm nhiệm — không tự tạo file trùng chức năng ở Planning này.
- 3 file `SPRINT_{6,7,10}_PLANNING.md` ở gốc là DỰ THẢO thật của các Sprint tương ứng (đã đọc nội dung xác nhận, không phải rác từ phiên nhầm branch trước đây — khác với `SPRINT_9_PLANNING.md` đã bị thay thế ở Sprint 8 Review) — giữ nguyên, không xoá, đúng quy ước Planning không commit/không xoá.

## 3. Product Audit

Founder Journey hiện tại (Home → Product → Marketing → Review → Generate → Publish), đối chiếu Sprint 10 Final Report + kiểm tra lại thực tế sau Sprint 10.x:

| Bước | Trạng thái | Chi tiết |
|---|---|---|
| Home | ✅ | `admin/home.html` — Current Business, 7 Quick Action, 5 mục Recent + Recent Activities. Sau Sprint 10.x: mặc định vào **Smart Mode**, sidebar chỉ 13 mục thay vì 16 |
| Add Product | ✅ nhưng thuần CRUD | `admin/products.html` — form kỹ thuật thô, KHÔNG có nút AI-assist ngay trong form (Founder phải rời trang sang "AI Content" để viết mô tả bằng AI) |
| Marketing | ✅ Foundation | One Click Marketing Wizard 5 bước — **vẫn chỉ là TEMPLATE**, không gọi AI Provider |
| Review | ✅ | Review Center hiển thị đủ 6 output, nhãn đã khớp thuật ngữ (Requirement #4) |
| Generate | ⚠️ Giả | Nút "GENERATE" không gọi mạng — hiển thị rõ ràng "chưa kết nối AI thật", không tuyên bố sai |
| Publish | ⚠️ Tách rời | Không có Publish tự động cho Gói Marketing; Publish AI Draft thật (nếu có) vẫn phải qua `admin/ai/drafts.html` riêng, không liên kết ngược lại Gói Marketing vừa tạo |

**3 điểm ma sát (friction) xác nhận VẪN CÒN sau Sprint 10.x** (Sprint 10.x chỉ sửa Navigation, không chạm các điểm này):

1. **"AI Content"/"AI Image" dùng chung 1 trang kỹ thuật** (`admin/ai/index.html`, còn hiện tên Plugin như "Blog Writer"). Giờ còn xuất hiện ở CẢ Quick Actions (Home) LẪN sidebar Smart Mode — cùng 1 giới hạn, nhân đôi chỗ nhìn thấy nhưng chưa nhân đôi vấn đề.
2. **Gói Marketing (One Click Marketing) hoàn toàn vô hình trên Founder Home** — chỉ lưu `localStorage`, không bao giờ xuất hiện ở "Recent Marketing Drafts"/"Recent Activities". Founder rời trang One Click Marketing là mất dấu vết.
3. **"Generate" trong Founder Journey chưa từng sinh ra giá trị AI thật** — đây là khoảng cách LỚN NHẤT trong toàn bộ Founder Journey: cả 8 Plugin AI (Sprint 1-6) VÀ One Click Marketing (Sprint 10) đều dừng ở "Draft mẫu"/"Template", vì Cloud Function `openaiProxy` (Sprint 3) **chưa từng được deploy**. Đây không phải lỗi thực thi — là 1 khoảng hở vận hành (operational gap) tồn tại xuyên suốt từ Sprint 3 tới nay.

## 4. Architecture Audit

- **AI Framework nguyên vẹn từ Sprint 2** (`js/ai/data-provider.js`, `plugin-manager.js`, `provider-registry.js`, `provider-interface.js`, `permission-service.js`, `job-queue.js`, `task-router.js`, `workflow-engine.js`, `context-builder.js`) — 0 commit trong Sprint 10 + Sprint 10.x (xác nhận qua `docs/SPRINT_10_FINAL_REPORT.md` mục 2 và `git log` phiên này).
- **Firebase Rules** (`database.rules.json`, `storage.rules`) — viết + kiểm thử Emulator thật từ Sprint 8/9, **chưa deploy Production**, không đổi trong Sprint 10/10.x.
- **`ADMIN_NAV`/`FOUNDER_SMART_NAV`** (`js/admin-auth.js`) — Sprint 10.x thêm nav Smart Mode, không phá cấu trúc Sprint 1.
- **One Click Marketing** (`js/one-click-marketing.js`) vẫn hoàn toàn ĐỘC LẬP với AI Framework (không import `AIModuleRegistry`/`PluginManager`/`AIJobQueue`) — đây chính là điểm cần thiết kế nếu Sprint 11 muốn "Generate thật" (xem Requirement #1 bên dưới): phải quyết định One Click Marketing gọi Plugin Manager NHƯ THẾ NÀO mà không phá tính "hàm thuần" của `buildMarketingPackage()`.
- **3 quyết định kiến trúc Business Manager vẫn treo nguyên** (`docs/DECISION_RECORD_BUSINESS_MANAGER.md`) — chưa có lựa chọn nào từ Chief Architect. Sprint 11 KHÔNG tự chọn thay.

## 5. Security Audit

- Không phát hiện lỗ hổng mới kể từ Sprint 10 Final Report (đã xác nhận lại: Permission Service/Firebase Rules/Auth không đổi trong Sprint 10.x — chỉ thêm dữ liệu tĩnh nav + `localStorage`, không phải logic bảo mật).
- **RBAC nhất quán ở Smart Mode**: đã kiểm thử (Sprint 10.x) rằng điều kiện lọc vai trò áp dụng như nhau ở cả 2 chế độ — không có đường tắt bỏ qua quyền qua việc đổi UI Mode.
- **Rủi ro tồn đọng (kế thừa, không mới)**: `database.rules.json`/`storage.rules` chưa deploy Production — nghĩa là Rules THẬT đang chạy trên Firebase Console vẫn chưa được xác nhận (đã ghi từ Sprint 8/9, chưa từng đổi).

## 6. UX Audit

Benchmark UX pattern (không copy tính năng, chỉ học pattern):

| Sản phẩm | Pattern học được | Áp dụng gợi ý cho PSH |
|---|---|---|
| **Notion** | Progressive disclosure — nút "+" nhỏ gọn xuất hiện đúng ngữ cảnh (inline), không cần rời trang | Nút AI-assist nên nằm NGAY cạnh field trong form CMS, không phải Quick Action riêng ở Home |
| **Cursor / Claude / ChatGPT** | AI luôn hiển thị "đang xử lý" + kết quả xuất hiện tại chỗ, Founder review/accept trước khi áp dụng | Đúng khớp mô hình Draft→Review đã có — chỉ cần đưa điểm khởi động AI vào đúng ngữ cảnh (trong form) thay vì 1 trang riêng |
| **Canva / Predis** | "1 lần nhập → nhiều output cùng lúc" dạng Template Pack, xem trước tất cả trước khi export | Đúng là mô hình One Click Marketing đã có (6 output cùng lúc) — chỉ thiếu bước cuối "output thật" |
| **Buffer / Hootsuite** | Hàng đợi nội dung chờ duyệt (content queue), trạng thái rõ ràng (Draft/Scheduled/Published) | `admin/ai/drafts.html` đã có vai trò này — nhưng Gói Marketing (One Click Marketing) chưa nối vào hàng đợi đó |
| **Shopify** | Onboarding checklist theo dõi tiến độ hoàn thành cửa hàng | Founder Home hiện có Quick Actions nhưng không có "tiến độ" — có thể học sau, KHÔNG đưa vào Sprint 11 (tránh phình phạm vi) |
| **CapCut** | Template gallery trước khi tạo, chọn phong cách trước khi generate | Không áp dụng — PSH chưa có AI Image/Video thật, ghi nhận cho tương lai |

**Kết luận UX**: điểm ma sát lớn nhất không phải "thiếu tính năng" mà là **"đúng tính năng nhưng sai vị trí"** — AI-assist tồn tại (8 Plugin) nhưng sống ở trang riêng, không sống trong ngữ cảnh Founder đang làm việc (trong form CMS). Đây là gợi ý trực tiếp cho Requirement #2.

## 7. Founder Journey Audit

(Gộp từ mục 3, nhấn mạnh số lượt click)

- **Đường đi nhanh nhất hiện tại để "viết mô tả sản phẩm bằng AI"**: Home → Products → mở sản phẩm → (không có nút AI ở đây) → rời trang → AI Content (Home Quick Action) hoặc sidebar → `admin/ai/index.html` → tìm đúng Plugin "Product Description Generator" trong danh sách → chọn sản phẩm (lại) → chạy → quay lại Products để xem mô tả (qua Draft Review) → Publish. **Ước tính ≥ 8 lượt click + 1 lần chọn lại sản phẩm đã chọn trước đó** — đây là "thao tác thừa" thật, đúng tinh thần đã tìm ở Requirement #4 (Sprint 10) nhưng chưa từng áp dụng cho CMS form.
- **One Click Marketing**: 5 bước, ≤ 2 phút (đã đo ở Requirement #4) — nhưng dừng lại ở Review, không có nút nào dẫn tới "Generate thật" hay "Publish thật".

## 8. Technical Debt

Không phát sinh nợ mới trong Sprint 10.x. Danh sách kế thừa (không đổi, xem `ROADMAP.md` để đầy đủ):

- Cloud Function `openaiProxy` chưa deploy — chặn giá trị thật của TOÀN BỘ AI Framework (không riêng gì Sprint 11).
- Firebase Database/Storage Rules chưa deploy Production.
- `escapeHtml()` lặp lại 26 file; `rangeStartMs()` lặp lại 3 file.
- `ContextBuilder` (Sprint 7 #3) chưa Plugin nào dùng.
- Cost Tracking vẫn ước tính, không phải token thật.
- AI Task Router vẫn rule-based (Topic-only Routing chưa mở rộng).
- Job Queue vẫn V1 (chạy phía trình duyệt Admin, không có Cloud backend xử lý nền).
- `StorageUpload.attachUploadInput()` là dead code.

## 9. Known Limitations

- Multi-tenant: single-tenant ở mọi tầng, 3 quyết định kiến trúc đang chờ (`docs/DECISION_RECORD_BUSINESS_MANAGER.md`).
- AI Image/AI Video Generation thật: chưa có ở bất kỳ hình thức nào.
- Facebook auto-publish thật: chưa có, Facebook Post Generator chỉ tạo Draft để copy tay.
- Gói Marketing (One Click Marketing): chỉ `localStorage`, không đa thiết bị, vô hình trên Founder Home.
- "AI Content"/"AI Image" dùng chung 1 trang kỹ thuật.
- "Marketing Drafts" không lọc riêng theo loại nội dung.

---

## 10. Sprint 11 Goal

**Business objective**: Biến "Generate" trong Founder Journey từ MÔ PHỎNG thành THẬT — đóng khoảng cách lớn nhất còn lại giữa "AI Framework đã xây" (Sprint 2-9) và "giá trị Founder thật sự dùng được" (One Click Marketing + CMS), đồng thời đưa AI-assist vào ĐÚNG ngữ cảnh Founder đang làm việc (trong form CMS, không phải trang riêng).

**Founder value**: Founder tạo 1 sản phẩm → bấm "Viết mô tả bằng AI" ngay tại chỗ (không rời trang) → tạo Gói Marketing → bấm "Generate" ra Draft AI THẬT (không phải mẫu tĩnh) → Review → Publish — đúng 1 vòng khép kín, không có "cụt" ở giữa.

**Expected outcome**: Founder Journey không còn điểm nào "trông như hoạt động nhưng thực ra không làm gì" — mọi bước hoặc THẬT SỰ chạy, hoặc ghi rõ ràng "chưa sẵn sàng" (không tuyên bố sai, đúng nguyên tắc xuyên suốt dự án).

**Điều kiện tiên quyết cần Chief Architect xác nhận trước khi bắt đầu Requirement #1** (xem Rủi ro mục 16): Cloud Function `openaiProxy` phải được deploy (thao tác vận hành, không phải code) — nếu không, Requirement #1 sẽ code xong nhưng "Generate" vẫn thất bại ở bước gọi Provider thật, giống tình trạng 8 Plugin hiện tại.

## 11. Sprint 11 Requirements

### Requirement #1 — One Click Marketing: Cầu nối Generate Thật (Critical)

- **Objective**: Nối 5/6 output của `buildMarketingPackage()` (Website Article/Facebook Post/SEO Metadata/Banner Request/AI Image Request) với đúng Plugin AI đã Production tương ứng (Blog Writer/Facebook Post Generator/SEO Generator/Banner Generator/Image Prompt Generator) qua `PluginManager`/`AIJobQueue` HIỆN CÓ — không sửa Plugin Manager/Queue/Provider Registry. "Video Request" giữ nguyên trạng thái "chưa có năng lực" (đúng, không bịa).
- **Business Value**: Biến Hero Feature (One Click Marketing) từ demo thành công cụ Founder thật sự dùng để ra nội dung.
- **Acceptance Criteria**:
  1. Bấm "GENERATE" ở Review Center → với mỗi output có Plugin tương ứng, tạo đúng 1 Job qua `PluginManager.execute()` (không gọi thẳng Queue/Provider).
  2. Review Center hiển thị trạng thái Job THẬT (queued/running/completed/failed) thay vì hiển thị kết quả ngay lập tức.
  3. Kết quả cuối vẫn là Draft trong `aiDrafts` — Publish vẫn qua `admin/ai/drafts.html`, KHÔNG tự Publish.
  4. `js/one-click-marketing.js` (hàm thuần `buildMarketingPackage()`) KHÔNG bị sửa để gọi AI — logic gọi AI nằm ở lớp Experience (`js/admin-one-click-marketing.js`), giữ đúng ranh giới "module thuần vs UI" đã thiết lập từ Requirement #3.
  5. Permission Service vẫn được gọi trước khi tạo Job (không có đường tắt bỏ qua RBAC).
- **Dependencies**: Cloud Function `openaiProxy` nên được deploy trước (vận hành, ngoài phạm vi code) — nếu chưa deploy, Requirement vẫn có thể code + kiểm thử qua mô phỏng Queue (như mọi Requirement AI trước đây), nhưng "Generate" thật vẫn sẽ lỗi ở bước gọi Provider tới khi deploy.
- **Estimated Complexity**: Medium-High (thiết kế lại luồng dữ liệu Wizard → Plugin input, không đổi Plugin/Queue).
- **Risk Level**: Medium (điểm chạm đầu tiên giữa 2 hệ thống trước đây tách biệt hoàn toàn).
- **Testing Strategy**: Node `vm` cho phần map input → Plugin params (hàm thuần, kiểm thử được); browser click-through thật (harness tạm, xoá trước commit) cho toàn bộ luồng Wizard → Job → Draft; xác nhận Permission Service vẫn chặn đúng khi Editor thiếu quyền `ai.generate.*` tương ứng.

### Requirement #2 — AI-Assist Inline trong CMS Forms (High)

- **Objective**: Thêm nút AI-assist (vd "Viết mô tả bằng AI") NGAY TRONG form Product (và Blog nếu còn thời gian) — gọi đúng Plugin tương ứng qua `PluginManager`, không rời trang, kết quả về Draft Review như bình thường.
- **Business Value**: Xoá "thao tác thừa" lớn nhất phát hiện ở mục 7 (≥ 8 lượt click hiện tại) — đúng học được từ pattern Notion/Cursor (AI sống trong ngữ cảnh, không phải trang riêng).
- **Acceptance Criteria**:
  1. Form Product có nút "Viết mô tả bằng AI" cạnh field Description.
  2. Bấm nút → chạy đúng Plugin "Product Description Generator" với `productId` hiện tại đã điền sẵn (không phải chọn lại).
  3. Kết quả VẪN là Draft (không tự ghi đè field Description) — Founder vẫn phải Review & Publish qua luồng đã có.
  4. Không đổi `admin/ai/index.html`/Plugin Dashboard hiện tại — đây là lối vào THỨ 2, không thay thế lối vào cũ.
- **Dependencies**: Không phụ thuộc Requirement #1 (độc lập, có thể làm song song hoặc riêng).
- **Estimated Complexity**: Medium.
- **Risk Level**: Low-Medium.
- **Testing Strategy**: Browser click-through thật trên `admin/products.html`; xác nhận RBAC (Editor có quyền `ai.generate.product` mới thấy nút, đã có sẵn quyền này từ Sprint 6).

### Requirement #3 — Gói Marketing: Decision Record Lưu trữ bền vững (Medium)

- **Objective**: CHỈ audit + Decision Record (theo đúng khuôn mẫu Requirement #1 Sprint 10) — trình bày Option A (giữ `localStorage`, chấp nhận giới hạn đã biết) vs Option B (thêm node Firebase mới `marketingPackages/{id}`, cho phép Founder Home hiển thị "Recent Marketing Drafts" thật). KHÔNG tự chọn, KHÔNG viết code Database Structure.
- **Business Value**: Giải quyết pain point #2 đã xác nhận ở mục 3 (Gói Marketing vô hình trên Home) — nhưng đây là thay đổi Database Structure, phải qua Decision Record đúng nguyên tắc dự án.
- **Acceptance Criteria**: Tạo `docs/DECISION_RECORD_MARKETING_PACKAGE_PERSISTENCE.md` với đủ Option A/B, đánh giá ưu/nhược, đề xuất — Chief Architect chọn ở 1 Requirement sau nếu muốn triển khai.
- **Dependencies**: Không phụ thuộc Requirement #1/#2.
- **Estimated Complexity**: Low (audit/thiết kế, không code).
- **Risk Level**: Low.
- **Testing Strategy**: Không áp dụng (không có code) — chỉ cần xác nhận Decision Record không tự ý chọn phương án.

### Requirement #4 — Sprint 11 Final Review & Close (Critical, bắt buộc)

- **Objective**: Sprint Review đầy đủ theo đúng khuôn mẫu Sprint 8/9/10 — xác minh Git, Regression, Architecture, Security, Product/Founder Journey, tạo `docs/SPRINT_11_FINAL_REPORT.md`.
- **Business Value**: Đảm bảo kỷ luật đã duy trì xuyên suốt 10 Sprint không bị phá vỡ.
- **Acceptance Criteria**: Bảng Verify Requirements đầy đủ #1-#3, Regression 0 trên toàn bộ AI Framework/Queue/Permission/Rules, Sprint Health Score.
- **Dependencies**: Sau khi #1-#3 hoàn tất.
- **Estimated Complexity**: Low (review, không code mới).
- **Risk Level**: Low.
- **Testing Strategy**: `git log`/`git diff` thật, không dựa hội thoại (đúng nguyên tắc dự án).

**Backlog — KHÔNG đưa vào Sprint 11** (ghi nhận, chờ Sprint sau): tách "AI Content"/"AI Image" thành 2 trang riêng; 3 quyết định Business Manager; deploy Cloud Function/Firebase Rules (vận hành); hợp nhất `escapeHtml`/`rangeStartMs`; migrate `ContextBuilder`.

## 12. Requirement Priority

| # | Requirement | Priority |
|---|---|---|
| 1 | One Click Marketing — Cầu nối Generate Thật | **Critical** |
| 2 | AI-Assist Inline trong CMS Forms | **High** |
| 3 | Gói Marketing — Decision Record Lưu trữ bền vững | **Medium** |
| 4 | Sprint 11 Final Review & Close | **Critical** (bắt buộc theo quy trình) |

## 13. Acceptance Criteria

Xem chi tiết từng Requirement ở mục 11 — tổng hợp đầy đủ trong `SPRINT_11_ACCEPTANCE.md` (deliverable riêng).

## 14. Testing Strategy

Giữ nguyên phương pháp đã dùng xuyên suốt dự án (không có CI/build step — site tĩnh):
- Hàm thuần (`buildMarketingPackage()`, hàm map input mới của Requirement #1) → Node `vm`, load thẳng source thật.
- Luồng UI/Wizard/Job → harness trình duyệt tạm thời (`_test-*.html`), luôn xoá trước commit.
- Regression → `git diff`/`git log -- <file>` xác nhận file lõi AI Framework không đổi.
- Security/RBAC → click-through với tài khoản mô phỏng `editor` và `admin`.

## 15. Documentation Updates

Bắt buộc cho mỗi Requirement (đúng quy ước xuyên suốt dự án): `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`. Requirement #1 cần thêm mục kiến trúc mới ("One Click Marketing — Real Generation Bridge"). Requirement #3 tạo `docs/DECISION_RECORD_MARKETING_PACKAGE_PERSISTENCE.md`. Requirement #4 tạo `docs/SPRINT_11_FINAL_REPORT.md`. Không có `PRODUCT_BACKLOG.md`/`DECISION_HISTORY.md`/`UX_GUIDELINES.md` riêng trong repo (xem mục 2) — tiếp tục dùng `ROADMAP.md`/`docs/DECISION_RECORD_*.md` làm nơi lưu tương đương.

## 16. Risk Analysis

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Cloud Function chưa deploy → Requirement #1 code xong vẫn không "Generate thật" được trong môi trường hiện tại | Cao (đã biết từ Sprint 3) | Không chặn việc viết code (đúng cách đã làm cho 8 Plugin trước đây) — ghi rõ trong Final Report, không tuyên bố "AI PASS" nếu chưa deploy |
| One Click Marketing lần đầu chạm AI Framework — rủi ro phá ranh giới "hàm thuần" | Trung bình | Giữ `buildMarketingPackage()` không đổi, logic gọi AI chỉ ở lớp Experience |
| AI-Assist Inline (Requirement #2) làm phình to form CMS, rối UI | Thấp-Trung bình | Chỉ thêm 1 nút, ẩn nếu Plugin bị Disable/không đủ quyền |
| Founder hiểu nhầm "Generate" luôn ra AI thật kể cả khi Cloud Function chưa deploy | Trung bình | Giữ nguyên nguyên tắc "minh bạch tuyệt đối" đã áp dụng ở Requirement #3 Sprint 10 — hiển thị rõ trạng thái Job thay vì giả định thành công |
| Quyết định Business Manager tiếp tục treo, có thể chặn Sprint 12+ nếu không được xử lý | Thấp (không ảnh hưởng Sprint 11) | Nhắc lại trong Final Report, không tự quyết thay |

## 17. Roadmap Updates

Sau khi Sprint 11 hoàn tất, `ROADMAP.md` cần: đóng mục "Kết nối AI Generation thật cho One Click Marketing" (hiện đang mở ở nhiều nơi), cập nhật mục "Founder Daily Workflow" (Gói Marketing hiển thị được nếu Requirement #3 được chọn Option B ở Sprint sau), thêm mục mới "AI-Assist Inline trong CMS Forms" với giới hạn còn lại (nếu chỉ làm Product, chưa làm Blog/Banner/Slider).

## 18. Product Backlog Updates

Không có file `PRODUCT_BACKLOG.md` riêng — cập nhật trong `ROADMAP.md` theo đúng quy ước hiện tại của dự án (xem mục 15/17).

## 19. Sprint Health Score

Không áp dụng ở bước Planning — Sprint chưa bắt đầu, chưa có gì để chấm điểm. Điểm số Sprint 10 gần nhất (~8.5/10, xem `docs/SPRINT_10_FINAL_REPORT.md`) dùng làm baseline so sánh khi đóng Sprint 11.

## 20. Final Recommendation

**Continue** — Sprint 10 đã hoàn tất đầy đủ (kể cả khoảng hở Requirement #2 cũ đã được lấp một phần ở Sprint 10.x), không có Regression/Security Issue nào đang mở, repository sạch và đồng bộ remote. Sprint 11 có mục tiêu rõ ràng (đóng khoảng cách "Generate giả" — điểm yếu lớn nhất còn lại của Founder Journey) mà không cần phá kiến trúc hay vi phạm Constitution. Khuyến nghị Chief Architect xác nhận trạng thái deploy Cloud Function `openaiProxy` trước khi giao Requirement #1, để tránh lặp lại tình huống "code xong nhưng vẫn không chạy thật" đã xảy ra từ Sprint 3.

---

## Deliverables đi kèm (DỰ THẢO, chưa commit)

- `SPRINT_11_TASKS.md`
- `SPRINT_11_CHECKLIST.md`
- `SPRINT_11_ACCEPTANCE.md`
- `SPRINT_11_FINAL_REPORT_TEMPLATE.md`
- `SPRINT_12_HANDOVER_TEMPLATE.md`
