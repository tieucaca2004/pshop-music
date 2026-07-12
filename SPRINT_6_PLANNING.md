# SPRINT 6 PLANNING

**Trạng thái: DỰ THẢO — chờ Chief Architect phê duyệt.** Chưa viết code, chưa tạo Requirement chính thức, chưa commit, chưa push.

---

## 0. Knowledge Base đã đọc / còn thiếu

Đã đọc và rà soát: `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`, `AI_RULES.md`, `README.md`, `docs/SPRINT_5_PROGRESS.md`.

**Thiếu 1 file được yêu cầu**: `docs/SPRINT_5_FINAL_REPORT.md` **không tồn tại** trong repo. Báo cáo đóng Sprint 5 thực tế mang tên `docs/SPRINT_5_PROGRESS.md` (đúng tên đã được chỉ định tường minh trong chính Sprint 5 Requirement #5 lúc tạo ra nó). Không tự tạo file mới hay bịa nội dung cho `SPRINT_5_FINAL_REPORT.md` — dùng `docs/SPRINT_5_PROGRESS.md` làm nguồn thay thế cho phần này.

## 1. Rà soát kết quả Sprint 5 + đầu Sprint 6 (bối cảnh, không phải Requirement)

- **Sprint 5 COMPLETED**: Production Health Check, Usage Visibility, kích hoạt FAQ Generator (qua Plugin Manager/Dashboard, không qua AI Assistant — Decision Record Option B).
- **Sprint 6 Requirement #1 COMPLETED**: kích hoạt Blog Writer, cùng khuôn mẫu FAQ Generator.
- **1 câu hỏi đang treo, chưa được trả lời**: Sprint 6 Requirement #2 yêu cầu kích hoạt "SEO Writer" — đã phát hiện đây trùng với **SEO Generator** (`seo-generator.js`) đã Production từ Sprint 3 Requirement #3 (cùng sinh SEO Title/Meta Description/Keywords từ dữ liệu Blog Post thật). Đã hỏi Chief Architect 3 hướng xử lý, **chưa nhận được câu trả lời** trước khi chuyển sang Planning này. Đề xuất: Chief Architect xác nhận hướng xử lý (khuyến nghị: xác nhận đã đủ, không tạo Plugin trùng) khi phê duyệt Sprint 6 Planning, để không phải hỏi lại riêng.
- **Vẫn còn treo từ nhiều Sprint trước, chưa có quyết định**: "AI Workflow Engine" (từng được gọi "Requirement #2" ở Sprint 5) — chưa từng được triển khai dù nhiều Context ghi COMPLETED. Cần Chief Architect xác nhận rõ: tiếp tục làm, hay chính thức loại khỏi phạm vi.
- **Production thật vẫn chưa được kiểm chứng**: Cloud Function `openaiProxy` **vẫn chưa deploy** (`firebase functions:list` vẫn báo lỗi xác thực, kiểm tra lại ngay trước khi viết Planning này) — chưa có 1 lượt Generate thật nào với OpenAI kể từ Sprint 3.

## 2. Sprint Goal (đề xuất)

> Hoàn thiện việc kích hoạt toàn bộ Plugin Framework đã viết từ Sprint 1 sang Production (tiếp nối đúng khuôn mẫu đã kiểm chứng 5 lần: Product/SEO/Slider/FAQ/Blog Writer), đồng thời xử lý dứt điểm các câu hỏi còn treo (AI Workflow Engine, SEO Writer/SEO Generator) trước khi cân nhắc bất kỳ năng lực AI mới nào (Image/Video/Multi-Agent/Automation).

## 3. Epic đề xuất

**Epic: "AI Content Studio — hoàn thiện Plugin Framework"**

- **Business Value**: 3 Plugin cuối cùng (Facebook Post Generator, Banner Generator, Image Prompt Generator) đã viết từ Sprint 1 nhưng chưa dùng được — kích hoạt xong sẽ khai thác trọn vẹn năng lực đã đầu tư, không cần code mới, rủi ro thấp (đã lặp lại thành công 5 lần).
- **Kiến trúc liên quan**: Plugin Manager (`PluginDB`/`SPRINT2_ENABLED_MODULES`), Permission Service (`PLUGIN_PERMISSIONS`), Draft Workflow (`publishToTarget()` — đã hỗ trợ sẵn cả 3 trường hợp `targetCollection: null` (chỉ xem/copy) và `'banners'`). Không đổi AI Framework/Queue/Provider Manager/AI Task Router/Database Structure.

## 4. Danh sách Requirement đề xuất (tối đa 5 — chỉ mô tả, chưa code)

### R1 — Kích hoạt Facebook Post Generator
- **Objective**: đưa Facebook Post Generator (`targetCollection: null`, chỉ xem/copy) sang Production, đúng khuôn mẫu Blog Writer/FAQ Generator.
- **Business Value**: hỗ trợ marketing mạng xã hội — sinh nội dung bài đăng Facebook (có thể gắn 1 sản phẩm cụ thể, tùy chọn) để Admin copy thủ công.
- **Architectural Impact**: thêm `'facebook-post-generator'` vào seed mặc định (`plugin-db.js`) + 1 quyền mới `ai.generate.facebook` (`permission-service.js`) — đúng khuôn mẫu đã dùng 2 lần trước. Không publish trực tiếp (không có `BlogDB`/`BannerDB` nào được gọi — Draft chỉ để xem/copy).
- **Dependencies**: độc lập, không phụ thuộc Requirement khác.
- **Risk**: Thấp — plugin có field `productId` optional dùng `DataProvider` (đã kiểm chứng qua Product Description Generator).

### R2 — Kích hoạt Banner Generator
- **Objective**: đưa Banner Generator (`targetCollection: 'banners'`) sang Production.
- **Business Value**: sinh nội dung banner quảng cáo mới (chủ đề + link) — publish qua `BannerDB.add()` đã có sẵn trong `publishToTarget()`.
- **Architectural Impact**: thêm `'banner-generator'` vào seed mặc định + quyền `ai.generate.banner` — cùng khuôn mẫu.
- **Dependencies**: độc lập.
- **Risk**: Thấp — publish path (`banners`) đã tồn tại từ Sprint 1, chưa từng có plugin nào dùng qua Draft Workflow cho tới nay nhưng logic ghi đã có sẵn, không cần code mới.

### R3 — Kích hoạt Image Prompt Generator
- **Objective**: đưa Image Prompt Generator (`targetCollection: null`, chỉ sinh văn bản prompt) sang Production.
- **Business Value**: hỗ trợ Admin có sẵn 1 prompt mô tả ảnh chi tiết để tự dùng ở công cụ tạo ảnh AI khác (Midjourney/DALL-E/...) — KHÔNG tự sinh ảnh, KHÔNG gọi AI Image Generation.
- **Architectural Impact**: thêm seed + quyền `ai.generate.imageprompt` — cùng khuôn mẫu. Không đụng tới AI Image Generation (Out of Scope, xem mục 7).
- **Dependencies**: độc lập.
- **Risk**: Thấp nhất trong 3 Plugin còn lại — chỉ sinh văn bản, không đụng bất kỳ tích hợp ảnh thật nào.

### R4 — Quyết định số phận "AI Workflow Engine"
- **Objective**: buộc phải có 1 quyết định rõ ràng — tiếp tục xây "AI Workflow Engine" (nhiều bước liên tiếp qua Queue, đã được Objective hóa nhưng chưa triển khai từ nhiều Sprint trước), hay chính thức gỡ khỏi ROADMAP.
- **Business Value**: dừng tình trạng "vừa COMPLETED vừa chưa triển khai" lặp lại qua nhiều Context — giảm rủi ro nhầm lẫn cho các Requirement sau.
- **Architectural Impact**: nếu tiếp tục — đây sẽ là 1 Epic riêng, không phải Requirement đơn (đã có Architectural Constraints riêng từ lần đề xuất trước: Workflow Engine chỉ điều phối, không chứa Business Logic, không bypass Layer nào). Nếu gỡ — chỉ là thay đổi tài liệu (`ROADMAP.md`), không code.
- **Dependencies**: Không phụ thuộc R1–R3.
- **Risk**: Thấp (đây là Requirement "ra quyết định", không phải code) — nhưng nếu chọn "tiếp tục", Requirement thật sự triển khai sau đó sẽ có rủi ro kiến trúc cao hơn hẳn 3 Requirement kia (đụng tới cách nhiều Job phối hợp qua Queue).

### R5 — Version-control Firebase Database Rules
- **Objective**: đưa `database.rules.json` vào repo (đọc từ Firebase Console hiện tại, không đổi nội dung Rules) thay vì chỉ quản lý trên Console.
- **Business Value**: review/rollback Rules được qua Git, đặc biệt quan trọng vì Cloud Function `openaiProxy` đọc node `roles` để xác thực — nếu Rules bị sửa sai trên Console, hiện không có lịch sử để đối chiếu.
- **Architectural Impact**: KHÔNG đổi Database Structure, KHÔNG đổi Rules — chỉ thêm 1 file cấu hình vào repo, thuần túy DevOps/hygiene, không đụng AI Framework/Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router nào.
- **Dependencies**: độc lập hoàn toàn — có thể làm bất kỳ lúc nào, kể cả trước R1–R4.
- **Risk**: Thấp nhất trong 5 Requirement — không phải code ứng dụng, chỉ là file cấu hình tham chiếu.

## 5. Đánh giá (Architecture / Security / Performance / Scalability / Maintainability / Business Value)

| Khía cạnh | Đánh giá cho Epic đề xuất (R1–R5) |
|---|---|
| **Architecture** | 🟢 Rủi ro thấp — R1–R3 lặp lại đúng khuôn mẫu đã kiểm chứng 5 lần (Product/SEO/Slider/FAQ/Blog Writer), không đổi AI Framework. R4 là quyết định, không phải code. R5 là file cấu hình, không đụng ứng dụng. |
| **Security** | 🟡 Trung bình — R1–R3 mỗi cái thêm đúng 1 quyền mới vào `PLUGIN_PERMISSIONS`, cần soi kỹ không tạo lối tắt RBAC (giống Blog Writer/FAQ Generator đã làm đúng). R5 tăng cường bảo mật (version-control Rules giúp phát hiện Rules bị nới lỏng ngoài ý muốn). |
| **Performance** | 🟢 Không ảnh hưởng — cùng Queue tuần tự đã có, không tăng tải. |
| **Scalability** | 🟢 Không đổi — Plugin Manager/Permission Service đã thiết kế sẵn để mở rộng (đã chứng minh qua 5 lần kích hoạt liên tiếp không cần sửa kiến trúc). |
| **Maintainability** | 🟢 Cao — mỗi Requirement chỉ thêm dữ liệu vào 2 file đã có (`plugin-db.js`, `permission-service.js`), không rải rác code mới. R4 giúp dọn sạch 1 mục nhầm lẫn kéo dài nhiều Sprint. |
| **Business Value** | 🟢 Cao cho R1–R3 (khai thác trọn năng lực đã đầu tư từ Sprint 1); Trung bình cho R4 (giá trị là sự rõ ràng, không phải tính năng); Thấp nhưng vẫn có giá trị phòng ngừa cho R5 (bảo mật/audit). |

## 6. Cân nhắc các Epic lớn hơn (theo yêu cầu rà soát ROADMAP — chỉ đề xuất, không tự quyết)

| Epic được yêu cầu xem xét | Đánh giá | Khuyến nghị |
|---|---|---|
| **AI Content Studio** | Epic này CHÍNH LÀ đề xuất ở mục 3 — hoàn thiện kích hoạt 3 Plugin cuối cùng. Rủi ro thấp, đã kiểm chứng nhiều lần. | ✅ Đưa vào Sprint 6 (R1–R3). |
| **AI Image Generation** | Đã bị liệt kê "Out of Scope" trong MỌI Requirement từ Sprint 3 tới nay. Đòi hỏi: 1 AI Provider mới (API tạo ảnh thật), khả năng thêm 1 Cloud Function endpoint mới, lưu trữ ảnh (Firebase Storage), và Draft Workflow xử lý loại nội dung mới (ảnh, không phải text/HTML). Đây là mở rộng kiến trúc thật sự, không phải "kích hoạt Plugin có sẵn". | ⛔ CHƯA đưa vào Sprint 6 — cần 1 Architecture Review Report riêng trước khi Planning, không phù hợp làm 1 Requirement đơn lẻ. |
| **AI Video Generation** | Rủi ro/chi phí/độ phức tạp còn cao hơn AI Image Generation; ROADMAP hiện ghi "chưa có kế hoạch cụ thể". | ⛔ Chưa sẵn sàng — để sau AI Image Generation (nếu được duyệt) đã ổn định. |
| **Multi-Agent AI** | Đã bị liệt kê "Out of Scope" trong MỌI Requirement liên quan AI Assistant/Router từ Sprint 4 tới nay — kể cả lần đề xuất "AI Workflow Engine" (Sprint 5) cũng ghi rõ "Đây là Workflow Orchestration. Không phải Multi-Agent." Đây là thay đổi triết lý kiến trúc lớn, xung đột trực tiếp với nguyên tắc "AI Task Router rule-based, không phải nhiều Agent tự quyết định" đã áp dụng xuyên suốt. | ⛔ KHÔNG phù hợp cho Sprint 6 — nếu muốn theo đuổi, cần quyết định lại toàn bộ triết lý AI Framework ở tầng Chief Architect, không phải 1 Requirement. |
| **Business Automation** | Xung đột trực tiếp với `AI_RULES.md` mục 3 (Constitution): *"Không có trigger tự động/cron/webhook nào khởi chạy AI... Mọi job đều bắt đầu từ việc người dùng bấm 'Chạy'."* Bất kỳ hình thức "tự động hóa" nào kích hoạt AI mà không qua hành động người dùng trực tiếp đều vi phạm Constitution hiện tại. | ⛔ KHÔNG đưa vào Sprint 6 trừ khi Chief Architect chính thức duyệt sửa `AI_RULES.md` (thay đổi Constitution) — đây là quyết định vượt phạm vi 1 Requirement thông thường. |

## 7. Out of Scope (Sprint 6, nếu Planning này được duyệt)

- AI Image Generation, AI Video Generation, Multi-Agent AI, Business Automation (đều lý do ở mục 6).
- Topic-only Routing cho AI Task Router (vẫn để dành 1 Requirement riêng, theo đúng quyết định Sprint 5).
- Cost Tracking bằng token/chi phí thật (cần Decision Record đổi Database Structure).
- SEO Writer như 1 Plugin mới, riêng biệt (trùng SEO Generator — chờ Chief Architect xác nhận ở mục 1).
- Refactor Sprint 2–5, thay đổi `AI_RULES.md`.
- Deploy Cloud Function (thao tác vận hành, ngoài phạm vi code).

---

**Dừng tại đây. Chưa viết code. Chưa tạo Requirement chính thức. Chưa commit. Chưa push. Chờ Chief Architect phê duyệt Sprint 6 Planning trước khi bắt đầu Requirement #1 (của bản Planning này — lưu ý đây là Requirement #1 MỚI theo Epic "AI Content Studio", khác với Sprint 6 Requirement #1 "Blog Writer" đã hoàn tất trước đó).**
