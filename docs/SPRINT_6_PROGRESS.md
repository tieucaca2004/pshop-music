# Sprint 6 Progress — Kích hoạt 4 Plugin còn lại (Blog Writer, Facebook Post Generator, Banner Generator, Image Prompt Generator)

**Trạng thái: SPRINT 6 COMPLETED.** Đã commit, đã push lên `feature/cms-ai-sprint2`. Chưa merge vào `main`. Không bắt đầu Sprint 7 — chờ Sprint 7 Planning.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 6". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_6_PROGRESS.md"** để nối tiếp đúng phần còn thiếu.

---

## 1. Requirement Summary

| # | Requirement | Kết quả |
|---|---|---|
| 1 | Kích hoạt Blog Writer | ✅ PASS |
| 2 | Kích hoạt Facebook Post Generator | ✅ PASS |
| 3 | Kích hoạt Banner Generator | ✅ PASS |
| 4 | Kích hoạt Image Prompt Generator | ✅ PASS |
| Review | Kiểm tra toàn diện + Đóng Sprint | ✅ PASS — báo cáo này |

Sau Sprint 6, **cả 8/8 plugin viết từ Sprint 1 đều đã Production** — không còn plugin nào ở trạng thái "coming_soon" trong `js/ai/plugin-db.js`.

## 2. Kiểm thử — Trạng thái cuối cùng (chạy lại toàn bộ, không dùng lại kết quả cũ theo Requirement riêng lẻ)

Mỗi Requirement Sprint 6 đều có 1 file mô phỏng riêng (`sprint6_req1_sim.js`…`sprint6_req4_sim.js`, Node `vm`, chạy mã nguồn thật). Khi chạy lại TOÀN BỘ 4 file này ở bước Review, 3/4 file báo lỗi ở đúng 1 assertion phụ (không phải assertion chính) — **đây KHÔNG PHẢI regression**: mỗi file được viết tại thời điểm Requirement của nó, tự khẳng định "plugin X (chưa được giao kích hoạt) vẫn phải là coming_soon" — X ở đây là đúng plugin được kích hoạt ở Requirement kế tiếp. Vì Sprint 6 đã hoàn tất cả 4 Requirement, giả định đó của các file cũ không còn đúng với trạng thái HIỆN TẠI của `plugin-db.js` (đúng như thiết kế — SEED list đã tích lũy đúng qua từng Requirement). Toàn bộ assertion CHÍNH (Permission, đọc dữ liệu thật, Draft Workflow, publish đúng đích) của cả 4 file đều PASS, không đổi.

Để xác nhận đúng TRẠNG THÁI CUỐI CÙNG (không phải ảnh chụp từng Requirement), đã viết 1 file mô phỏng mới cho Review: `sprint6_review_sim.js` — chạy thật `permission-service.js`/`plugin-db.js`/4 module Sprint 6/`job-queue.js`/`admin-ai.js` qua Node `vm`:

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Plugin Manager — cả 8/8 plugin seed `enabled:true`/`status:ok` | ✅ PASS — không còn plugin nào "coming_soon" |
| 2 | Permission — Editor/Admin đều được phép chạy đủ cả 8 plugin, `PLUGIN_PERMISSIONS` đủ 8 entry | ✅ PASS |
| 3 | Draft Workflow — 4 plugin Sprint 6 chạy ĐỒNG THỜI qua CHUNG 1 Queue thật | ✅ PASS — Blog Writer tạo đúng 1 blog post mới, Banner Generator tạo đúng 1 Banner mới (qua `BannerDB.add()`), Facebook Post Generator/Image Prompt Generator không ghi vào node nào (`targetCollection: null`), không plugin nào ghi chéo sang node của plugin khác |

## 3. Kiểm tra Plugin Framework (theo đúng yêu cầu Sprint Review)

| Plugin | Trạng thái | Xác nhận |
|---|---|---|
| Blog Writer | ✅ Hoạt động | `targetCollection: 'blogPosts'`, tạo blog post mới khi publish, `topic`/`tone`/`keywords` tự do không hardcode |
| Facebook Post Generator | ✅ Hoạt động | `targetCollection: null`, chỉ xem/copy — không tự đăng Facebook, `productId` optional qua `DataProvider` + `message` tự do |
| Banner Generator | ✅ Hoạt động | `targetCollection: 'banners'`, publish thật qua `BannerDB.add()`, `theme`/`link` tự do |
| Image Prompt Generator | ✅ Hoạt động | `targetCollection: null`, chỉ sinh văn bản Prompt — xác nhận không có hàm nào gọi API tạo ảnh thật, `subject`/`style` tự do |

## 4. Kiểm tra kiến trúc (Architectural Constraints)

- ✅ **AI Framework không Refactor** — Queue/Plugin Manager/Provider Manager/Data Provider/Draft Workflow/Human Review Workflow không đổi 1 dòng code nào trong suốt Sprint 6.
- ✅ **Queue không đổi** — `git log --oneline -- js/ai/job-queue.js` dừng đúng ở Sprint 2 Requirement #7, không có commit nào trong Sprint 6.
- ✅ **Provider Manager không đổi** — `git log --oneline -- js/ai/provider-registry.js` dừng đúng ở Sprint 2 Requirement #5.
- ✅ **Plugin Manager không đổi** — `git log --oneline -- js/ai/plugin-manager.js` dừng đúng ở Sprint 2 Requirement #7.
- ✅ **AI Task Router không đổi** — `git log --oneline -- js/ai/task-router.js` chỉ đúng 1 commit (Sprint 4 Requirement #1), không sửa lại lần nào trong Sprint 5/6 (đúng quyết định "Topic-only Routing để 1 Requirement riêng tương lai").
- ✅ **Database Structure không đổi** — Sprint 6 chỉ thêm dữ liệu vào cấu trúc đã có (`SPRINT2_ENABLED_MODULES`/`PLUGIN_PERMISSIONS`/`ROLE_PERMISSIONS` — đều là hằng số trong code, không phải Collection/Field Firebase mới).
- ✅ **`AI_RULES.md` (Constitution) không đổi** — `git log --oneline -3 -- AI_RULES.md` vẫn dừng ở Sprint 2 Requirement #8.
- ✅ **`data-provider.js` không đổi** — chỉ đúng 1 commit (Sprint 2 Requirement #3).

## 5. Regression Test (Git Review)

`git log --oneline -- <file>` xác nhận từng file:

- `js/ai/job-queue.js`, `js/ai/plugin-manager.js`, `js/ai/provider-registry.js`, `js/ai/data-provider.js`, `AI_RULES.md` — dừng đúng ở commit Sprint 2, không đổi qua toàn bộ Sprint 3/4/5/6.
- `js/ai/task-router.js` — chỉ đúng 1 commit (Sprint 4 Requirement #1).
- `js/admin-ai.js` — dừng ở Sprint 4 Requirement #2 (chưa từng sửa `publishToTarget()` dù Sprint 6 dùng tới cả 3 nhánh `null`/`'banners'`/`'blogPosts'` — toàn bộ nhánh này đã có sẵn từ trước).
- `js/admin-ai-assistant.js` — dừng ở Sprint 4 Requirement #5.
- `functions/index.js` — không đổi từ Sprint 3.
- `js/ai/permission-service.js`, `js/ai/plugin-db.js` — **đúng 6 commit/file** (tạo ở Sprint 2, bổ sung FAQ Generator ở Sprint 5 Requirement #3, cộng 4 commit Sprint 6 Requirement #1–#4) — đúng dự kiến, không có thay đổi ngoài kế hoạch.

**Kết luận: Sprint 2, Sprint 3, Sprint 4 và Sprint 5 hoàn toàn không bị ảnh hưởng bởi Sprint 6. Mọi thay đổi Sprint 6 chỉ giới hạn đúng trong 5 file: `CHANGELOG.md`, `PROJECT_ARCHITECTURE.md`, `ROADMAP.md`, `js/ai/permission-service.js`, `js/ai/plugin-db.js` (mỗi Requirement).**

## 6. CMS Console Check

Cả 9 trang `admin/ai/*.html` (assistant/drafts/health/index/jobs/logs/plugins/providers/usage) load qua static server nội bộ — **0 lỗi console** trên mọi trang.

## 7. Security Check

| Hạng mục | Kết quả |
|---|---|
| API Key/secret trong file Sprint 6 | ✅ Không có (đã grep xác nhận `permission-service.js`/`plugin-db.js`/4 module mới) |
| Permission | ✅ 4 quyền `ai.generate.*` mới thêm đúng khuôn mẫu, không tạo lối tắt RBAC |
| RBAC | ✅ Không đổi logic `PermissionService`, chỉ thêm dữ liệu (`AI_PERMISSIONS`/`PLUGIN_PERMISSIONS`/`ROLE_PERMISSIONS`) |
| Cloud Function `openaiProxy` | ⚠️ Vẫn CHƯA deploy — kế thừa từ Sprint 3, không phải vấn đề Sprint 6 |

## 8. Production Readiness

| Hạng mục | Trạng thái |
|---|---|
| Cloud Function | ❌ Chưa deploy (kế thừa Sprint 3) |
| Plugin Framework | ✅ Sẵn sàng — cả 8/8 plugin đều Production (Product/SEO/Slider/FAQ/Blog Writer/Facebook Post Generator/Banner Generator/Image Prompt Generator) |
| Queue/Draft Workflow/Human Review | ✅ Sẵn sàng, không đổi |
| AI Assistant | ✅ Sẵn sàng (Sprint 4) — nhưng 5/8 plugin (FAQ/Blog Writer/Facebook Post Generator/Banner Generator/Image Prompt Generator) vẫn chỉ dùng được qua Plugin Manager Dashboard, chưa qua AI Assistant (Topic-only Routing) |

## 9. Non-functional Evaluation

- **Architecture**: mỗi Requirement chỉ thêm đúng 2 dòng dữ liệu (seed + permission) vào 2 file đã có — không phát sinh file mới, không phát sinh tầng kiến trúc mới, đúng tinh thần "tái sử dụng hoàn toàn AI Framework hiện có".
- **Security**: không phát sinh lỗ hổng mới; RBAC nhất quán qua cả 8 plugin.
- **Performance**: không ảnh hưởng — kích hoạt Plugin chỉ đổi 1 giá trị `enabled` trong `aiPlugins/{id}`, không thêm truy vấn Firebase nào.
- **Scalability**: Plugin Framework (Sprint 2) đã chứng minh mở rộng tốt — thêm 1 plugin mới chỉ cần đăng ký qua `AIModuleRegistry.register()` (đã có từ Sprint 1) + 2 dòng cấu hình, không cần sửa Queue/Permission Service.
- **Maintainability**: cấu trúc `SPRINT2_ENABLED_MODULES`/`PLUGIN_PERMISSIONS` dạng danh sách/map đơn giản, dễ audit qua `git log`.
- **Business Value**: Administrator/Editor giờ có đủ 8 công cụ AI Content Studio (Product/SEO/Slider/FAQ/Blog/Facebook/Banner/Image Prompt) để hỗ trợ vận hành nội dung, tất cả đều qua Human Review trước khi công khai.

## 10. Known Limitations (không đổi so với Sprint 5, trừ khi ghi chú khác)

- **Cloud Function `openaiProxy` vẫn chưa deploy** — chặn xác nhận "Generate thành công" với response OpenAI thật (kế thừa Sprint 3).
- **AI Workflow Engine ("Requirement #2" cũ ở Sprint 5) vẫn chưa từng được triển khai** — cần quyết định rõ ràng có tiếp tục làm hay không.
- **5/8 plugin (FAQ Generator/Blog Writer/Facebook Post Generator/Banner Generator/Image Prompt Generator) chưa dùng được qua AI Assistant** — chỉ qua Plugin Manager Dashboard (Decision Record Option B, Sprint 5 Requirement #3) — "Topic-only Routing" để dành 1 Requirement riêng sau này.
- **AI Image Generation thật vẫn chưa triển khai** — Image Prompt Generator (Sprint 6 Requirement #4) chỉ sinh văn bản Prompt tham khảo, không tự gọi API tạo ảnh.
- **Usage Visibility chưa phải Cost Tracking** — không có dữ liệu token/chi phí thật.
- **Chưa phân trang Firebase thật** cho Usage Visibility/Job Queue/Nhật ký/Conversation History (giới hạn đã biết từ Sprint 4).
- **Firebase Database Rules chưa version-control trong repo** (kế thừa Sprint 3).
- **Backup Google Drive không khả dụng trong môi trường hiện tại** — Auto Mode Safety Classifier của Claude Code chặn cứng hành động nén + upload toàn bộ source code lên Google Drive bên ngoài (phân loại "Data Exfiltration"), không thể gỡ bằng yêu cầu người dùng trong phiên làm việc. GitHub (`feature/cms-ai-sprint2`) vẫn là nơi backup từ xa duy nhất khả dụng.

## Mục đề xuất chuyển sang Sprint 7 (chỉ ghi nhận, không tự triển khai)

- Quyết định số phận "AI Workflow Engine" (còn treo từ Sprint 5).
- Quyết định Topic-only Routing cho AI Task Router (nếu muốn 5 plugin dạng "chủ đề tự do" dùng được qua AI Assistant).
- AI Image Generation thật (dùng `imagePrompt` làm input cho 1 API tạo ảnh thật).
- Cost Tracking thật (token/chi phí) — cần Decision Record đổi Database Structure.
- Phân trang Firebase thật cho các trang danh sách lớn.
- Deploy Cloud Function (thao tác vận hành, không phải code).
- Version-control Firebase Database Rules trong repo.

**SPRINT 6 COMPLETED.**
