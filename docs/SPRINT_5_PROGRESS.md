# Sprint 5 Progress — Production Health Check, FAQ Generator, Usage Visibility

**Trạng thái: SPRINT 5 COMPLETED.** Đã commit, đã push lên `feature/cms-ai-sprint2`. Chưa merge vào `main`. Không bắt đầu Sprint 6 — chờ Sprint 6 Planning.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 5". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_5_PROGRESS.md"** để nối tiếp đúng phần còn thiếu.

---

## 1. Ghi nhận 2 điểm không khớp trong yêu cầu Requirement #5 (không tự suy diễn)

- **"Requirement #2" (AI Workflow Engine) chưa từng được triển khai** — dù Context của nhiều Requirement (bao gồm cả #5) ghi là COMPLETED. Đã nhắc lại nhiều lần (Requirement #3, #4, #5). Không ảnh hưởng tới việc kiểm thử Requirement #5 vì Functional Requirements #1–10 của chính Requirement này không kiểm thử hạng mục nào thuộc Workflow Engine.
- **"Kiểm thử Blog Writer" (Functional Requirement #2) không thực hiện được** — Blog Writer chưa được kích hoạt sang Production ở Sprint 5 (chỉ FAQ Generator được kích hoạt, ở Requirement #3). Blog Writer vẫn ở trạng thái "Coming Soon" trong Plugin Manager — không có gì ở phạm vi Production để kiểm thử. Đã bỏ qua mục này một cách tường minh thay vì giả vờ đã kiểm thử.

## 2. Requirement Summary

| # | Requirement | Kết quả |
|---|---|---|
| 1 | Production Health Check | ✅ PASS |
| 2 | AI Workflow Engine | ❌ Chưa triển khai (không phải lỗi Requirement #5 — đã ghi nhận ở trên) |
| 3 | Kích hoạt FAQ Generator (qua Plugin Manager/Dashboard, không qua AI Assistant — Decision Record Option B) | ✅ PASS |
| 4 | Usage Visibility | ✅ PASS |
| 5 | Kiểm tra toàn diện + Đóng Sprint | ✅ PASS — báo cáo này |

## 3. Kiểm thử theo Functional Requirement #1–10 (của Requirement #5)

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Production Health Check | ✅ Chạy lại mô phỏng `sprint5_req1_sim.js` (4 kịch bản) qua Node `vm` — PASS, xác nhận không có lời gọi ghi nào |
| 2 | Blog Writer | ⚠️ Không kiểm thử được — chưa kích hoạt (xem mục 1) |
| 3 | FAQ Generator | ✅ Chạy lại `sprint5_req3_sim.js` — Permission/Seed/Draft Workflow/dữ liệu thật đều PASS |
| 4 | Usage Visibility | ✅ Chạy lại `sprint5_req4_sim.js` (4 kịch bản) — PASS |
| 5 | Queue | ✅ Chạy lại `sprint3_e2e_sim.js`/`sprint4_router_sim.js` — Pending/Running/Completed/Failed/Retry/Cancel đều đúng |
| 6 | Permission | ✅ Chạy lại toàn bộ mô phỏng liên quan Permission (Sprint 3/4/5) — Editor/Admin đúng quyền, `permission_denied` ghi Log đúng |
| 7 | Draft Workflow | ✅ Xác nhận qua `sprint5_req3_sim.js`/`sprint4_req2_sim.js` — Draft luôn dừng ở `draft` trước khi publish |
| 8 | Human Review | ✅ `publishDraftById()`/`rejectDraftById()` (Sprint 4 Requirement #2) không đổi, vẫn hoạt động đúng qua FAQ Generator |
| 9 | AI Assistant | ✅ Chạy lại toàn bộ mô phỏng Sprint 4 (Router/Conversation History/Ambiguous Resolution/Plugin Unavailable) — PASS, không hồi quy |
| 10 | Regression Sprint 2/3/4/5 | ✅ Xem mục 4 |

## 4. Regression Test

`git log --oneline -- <file>` xác nhận từng file:

- `js/ai/job-queue.js`, `js/ai/plugin-manager.js`, `js/ai/provider-registry.js`, `js/ai/data-provider.js`, `AI_RULES.md` — dừng đúng ở commit Sprint 2 Requirement #8, không đổi qua toàn bộ Sprint 3/4/5.
- `js/ai/task-router.js` — chỉ đúng 1 commit (Sprint 4 Requirement #1), chưa từng sửa lại.
- `js/admin-ai.js` — dừng ở Sprint 4 Requirement #2.
- `js/admin-ai-assistant.js` — dừng ở Sprint 4 Requirement #5.
- `js/ai/permission-service.js`, `js/ai/plugin-db.js` — chỉ đúng 2 commit/file (tạo ở Sprint 2, bổ sung `ai.generate.faq`/seed FAQ Generator ở Sprint 5 Requirement #3) — đúng dự kiến, không có thay đổi ngoài kế hoạch.
- `functions/index.js` (Cloud Function) — không đổi từ Sprint 3.

Đã chạy lại toàn bộ 12 file mô phỏng đã viết qua Sprint 3/4/5 (Node `vm`, chạy mã nguồn thật) trước khi viết báo cáo này — **tất cả PASS, không đổi kết quả** (xem lịch sử hội thoại — không chạy lại lần nữa trong bước này theo đúng chỉ dẫn).

**Kết luận: Sprint 2, Sprint 3 và Sprint 4 hoàn toàn không bị ảnh hưởng bởi Sprint 5.**

## 5. Architecture Verification

- ✅ Không thay đổi AI Framework (Queue/Plugin Manager/Provider Manager/Permission Service/AI Task Router/Data Provider/Draft Workflow/Human Review Workflow đều xác nhận qua `git log`).
- ✅ Không thay đổi Database Structure — Sprint 5 không thêm Collection/Field nào (Health Check, Usage Visibility chỉ đọc; FAQ Generator chỉ thêm dữ liệu vào cấu trúc `PLUGIN_PERMISSIONS`/`SPRINT2_ENABLED_MODULES` đã có, không phải Database Structure).
- ✅ `AI_RULES.md` (Constitution) không đổi trong suốt Sprint 5.

## 6. Security Verification

| Hạng mục | Kết quả |
|---|---|
| API Key | ✅ Không có trong bất kỳ file Sprint 5 nào (đã grep xác nhận) |
| Permission | ✅ `ai.generate.faq` thêm đúng khuôn mẫu, không tạo lối tắt RBAC |
| RBAC | ✅ Không đổi logic, chỉ thêm 1 entry dữ liệu |
| Cloud Function | ⚠️ Vẫn CHƯA deploy — kế thừa từ Sprint 3, không phải vấn đề Sprint 5 |
| Read-only tools (Health Check, Usage Visibility) | ✅ Xác nhận qua mô phỏng: 0 lời gọi `add`/`update`/`enqueue` trong mọi kịch bản |

## 7. Production Readiness

| Hạng mục | Trạng thái |
|---|---|
| Cloud Function | ❌ Chưa deploy (kế thừa Sprint 3) |
| OpenAI Provider | ✅ Code sẵn sàng, chờ deploy để chạy thật |
| AI Assistant | ✅ Sẵn sàng (Sprint 4) |
| Plugin Framework | ✅ Sẵn sàng — Product/SEO/Slider/FAQ Generator đều Production |
| Queue | ✅ Sẵn sàng |
| Draft Workflow | ✅ Sẵn sàng |
| Human Review | ✅ Sẵn sàng |
| Usage Visibility | ✅ Sẵn sàng — hoạt động ngay cả khi chưa có traffic OpenAI thật (đọc `aiLogs` hiện có) |

## 8. Non-functional Evaluation

- **Performance**: Health Check/Usage Visibility đều chỉ đọc, không polling liên tục; Usage Visibility tải toàn bộ `aiLogs` rồi lọc phía client (chưa phải Firebase query pagination — giới hạn đã biết, xem mục 9).
- **Security**: không phát hiện lỗ hổng mới; mọi công cụ chẩn đoán/quan sát mới đều read-only.
- **Reliability**: Health Check giúp phát hiện sớm sự cố (Provider/Queue/Draft Workflow) trước khi ảnh hưởng người dùng thật.
- **Maintainability**: mỗi tính năng mới (`health-check.js`, `usage-stats.js`, cập nhật FAQ Generator) nằm gọn trong 1-2 file, không rải rác.
- **Scalability**: Usage Visibility/Health Check không giới hạn số lượng — nhưng tải toàn bộ `aiLogs` mỗi lần tính, cần cân nhắc khi log tăng lớn (xem Known Limitations).
- **User Experience**: Administrator có thêm 2 công cụ quan sát hệ thống (Health Check, Usage Visibility) ngay trong CMS, không cần công cụ ngoài.

## 9. Known Limitations

- **Cloud Function `openaiProxy` vẫn chưa deploy** — chặn xác nhận "Generate thành công" với response OpenAI thật (kế thừa Sprint 3).
- **AI Workflow Engine ("Requirement #2") chưa được triển khai** — cần quyết định có tiếp tục làm ở Sprint 6 hay không.
- **FAQ Generator chưa dùng được qua AI Assistant** — chỉ qua Plugin Manager Dashboard (Decision Record Option B, Sprint 5 Requirement #3) — "Topic-only Routing" để dành 1 Requirement riêng sau này.
- **Blog Writer, Facebook Post Generator, Banner Generator, Image Prompt Generator** vẫn "Coming Soon" — chưa kích hoạt.
- **Usage Visibility chưa phải Cost Tracking** — không có dữ liệu token/chi phí thật (cần Decision Record + đổi Database Structure nếu triển khai sau).
- **Usage Visibility/Job Queue/Nhật ký/Conversation History chưa phân trang Firebase thật** — tải toàn bộ node rồi lọc/cắt phía client (giới hạn đã biết từ Sprint 4).
- **Firebase Database Rules chưa version-control trong repo** (kế thừa Sprint 3).

## Mục đề xuất chuyển sang Sprint 6 (chỉ ghi nhận, không tự triển khai)

- Quyết định số phận "AI Workflow Engine" (Requirement #2 còn treo) — tiếp tục hay bỏ.
- Kích hoạt các Plugin "Coming Soon" còn lại (Blog Writer, Facebook Post Generator, Banner Generator, Image Prompt Generator).
- Quyết định Topic-only Routing cho AI Task Router (nếu muốn FAQ Generator/Blog Writer dùng được qua AI Assistant).
- Cost Tracking thật (token/chi phí) — cần Decision Record đổi Database Structure.
- Phân trang Firebase thật cho các trang danh sách lớn.
- Deploy Cloud Function (thao tác vận hành, không phải code).

**SPRINT 5 COMPLETED.**
