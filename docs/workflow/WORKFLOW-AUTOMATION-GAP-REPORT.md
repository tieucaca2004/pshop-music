# WORKFLOW AUTOMATION — GAP REPORT (Phase 1–12)

> HEAD `5ceccf1`, 2026-09-26. Mọi kết luận có bằng chứng chạy thật:
> - Engine client: chạy MÃ NGUỒN THẬT `js/ai/workflow-engine.js` trong Node (chỉ truyền `overrideExecute` — hook engine có sẵn — để giả lập kết quả step).
> - UI: Chromium + Firebase Emulator (Auth/Database), đăng nhập admin thật, bấm nút thật trên `admin/ai/workflow.html`.
> - Server: gọi handler THẬT `aiGenerateWorker` (`functions/index.js`) trên Database Emulator; CHỈ thay `runGeneration` (lời gọi AI trả phí) bằng stub điều khiển được thành công/thất bại.
> - Không có mạng tới Production/AI Provider → mọi lượt sinh nội dung AI thật: BLOCKED.
>
> **Cập nhật sau sửa (xem mục 8):** 7 lỗi D đã sửa trên branch `feature/cms-ai-sprint2`, CHƯA deploy, CHƯA Founder Acceptance.

Phân loại: **A** PASS · **B** có nhưng thiếu test · **C** hiện thực một phần · **D** HỎNG · **E** THIẾU · **F** cần Founder quyết.

## 1. Tổng hợp

| ID | Hạng mục | Loại | Mức | Xử lý đợt này |
|---|---|---|---|---|
| WF-D1 | Trang Workflow Automation không chạy được bất kỳ workflow nào | D | **CRITICAL** (tính năng Founder dùng) | ĐÃ SỬA `82bc2a2` |
| WF-D2 | `run()` bị reject thô khi executor lỗi → nút "CHẠY WORKFLOW" kẹt | D | MEDIUM | ĐÃ SỬA `9ec0e2f` |
| WF-D3 | `cancelWaitEvent()` không giải phóng workflow đang chờ → treo vĩnh viễn; registry cũ sau timeout | D | MEDIUM | ĐÃ SỬA `1554390` |
| WF-D4 | Fallback provider ghi đè `step._fallbackAttempted` vào định nghĩa step → chỉ chạy được 1 lần | D | MEDIUM | ĐÃ SỬA `953fa42` |
| WF-D5 | `runLoop`/`runForEach` không dừng khi 1 vòng lỗi (comment code ghi "break toàn chuỗi") | D | MEDIUM | ĐÃ SỬA `03763dc` |
| WF-D6 | Decision: toán tử lạ → `true` (fail-open); `op` không phải chuỗi → throw; `resolveBranch` chọn nhánh có điều kiện SAI khi không nhánh nào khớp | D | MEDIUM/LOW | ĐÃ SỬA `33fc3bc` |
| WF-D7 | Server `workflow:auto`: Cancel/Pause bị chính worker ghi đè `workflowState:'RUNNING'` sau mỗi step | D | MEDIUM (chưa có đường kích hoạt) | ĐÃ SỬA `b62bb1f` (cần deploy Functions) |
| WF-C1 | `run()` bỏ qua `config.timeout` của step (docstring có ghi) | C | LOW | Báo cáo — cần quyết semantics |
| WF-C2 | `runForEach` xử lý 0 item nếu không truyền `buildIterationContext`; item không được đưa vào context | C | LOW | Báo cáo |
| WF-C3 | Server: `status` của job `workflow:auto` luôn `queued`; log step `required:false` mất lỗi gốc; log không ghi draftId | C | LOW | Báo cáo |
| WF-E1 | Không giới hạn số vòng `runLoop` (2.000.000 vòng khoá luồng 3,6 giây; `Infinity` treo) | E | MEDIUM | Báo cáo trước (theo chỉ thị) |
| WF-E2 | Event phát TRƯỚC khi workflow chờ bị mất (không buffer) | E | LOW | Báo cáo |
| WF-E3 | Wait-state/Decision Context chỉ trong bộ nhớ — tải lại trang là mất | E/F | — | Founder quyết (thay đổi Database Structure) |
| WF-E4 | Server: không có đường resume sau PAUSED/restart (`onValueCreated` chỉ bắn 1 lần) | E/F | — | Founder quyết |
| WF-E5 | Không idempotency key cho trigger `workflow:auto` | E | LOW | Báo cáo |
| WF-F1 | Trigger WORKFLOW-01 + panel WORKFLOW-03 cần client đọc/ghi `apiAsyncJobs` — Rules đang chặn | F | — | Đã có trong Deployment Gate (S-03) |
| WF-S1 | `GenerationService.generate()` bỏ qua PermissionService/PluginManager | Security (dormant) | MEDIUM nếu được nạp | Báo cáo — KHÔNG được nạp ở trang nào |
| WF-S2 | `GET /v1/jobs/:id` cho role `agent` (`jobs.view`) đọc mọi job `apiAsyncJobs` theo id | Security | LOW | Báo cáo — Founder quyết |

## 2. PASS (A) — đã chạy thật

| Khả năng | Ca đã chạy |
|---|---|
| Decision Context | tạo/đọc/ghi biến + shared + default; không alias biến đầu vào; finish ghi duration |
| IF/ELSE | 13 toán tử đúng; biến thiếu → false; `exists/empty`; điều kiện dạng hàm/`test()`; `decideBranch(onlyFirst)`; `run()` bỏ qua step có điều kiện sai rồi chạy step sau |
| SWITCH | khớp `value`, khớp `when()`, `default`, không khớp + không default |
| PARALLEL | tất cả thành công; 1 lỗi + 1 throw (failFast=false); `concurrencyLimit=2` (đỉnh đồng thời = 2); `failFast=true` reject sau 10 ms; timeout từng task; danh sách rỗng |
| WAIT EVENT (đường chính) | START → WAIT → sai event không resume → đúng event resume → step kế → COMPLETE; payload truyền đúng; event trùng = no-op; timeout → `event_timeout`; thiếu `eventId` → failed |
| POLICY | deny chặn trước execute; requireApproval; providerPolicy; retryPolicy ghi đè |
| run() | retry tới khi thành công; step lỗi dừng chuỗi; approval dừng; delay; step type lạ → failed |
| runBatch | tổng hợp success/failed |
| Server `workflow:auto` | 4 step thành công → COMPLETED; step bắt buộc lỗi → FAILED + dừng; gọi lại handler → resume từ step lỗi (không chạy lại step SUCCESS); retry theo step; step `required:false` lỗi → SKIPPED + chạy tiếp |

## 3. Chi tiết lỗi (D)

### WF-D1 — CRITICAL — Trang Workflow Automation hỏng hoàn toàn
- **Hiện tại:** Admin mở `admin/ai/workflow.html`, chọn Plugin, bấm "CHẠY WORKFLOW" → bảng kết quả "Bước 1 — Lỗi — Unknown step type: undefined". Không tạo `aiJobs`, không ghi `aiLogs` (Emulator: `aiJobs 0→0`, `aiLogs 0→0`). Không có tiến trình real-time.
- **Kỳ vọng (hợp đồng Sprint 7, `ec34848`):** mỗi Step = `{pluginId, inputParams}` đi đúng `PermissionService.checkPluginExecution()` → `PluginManager.loadPlugin(id).execute()` → `AIJobQueue` → Draft; `run(steps, uid, email, onStepDone)` gọi `onStepDone` sau mỗi Step.
- **Nguyên nhân gốc:** commit `f2d8e75` (2026-07-20, Phase 2.7) viết lại `run()`/`execute()` theo `step.type` + `GenerationService` nhưng KHÔNG sửa `js/admin-ai-workflow.js` (từ đó chỉ có commit bump cache). UI vẫn gửi step không có `type` và truyền callback ở tham số thứ 4 — engine coi là `options`.
- **Vì sao không chỉ sửa UI:** nếu UI gửi `type:'generation'` thì engine gọi `GenerationService` — file này không được nạp trên trang, và `GenerationService.generate()` gọi thẳng `AIJobQueue.enqueue()`, bỏ qua PermissionService/PluginManager (vi phạm CLAUDE.md mục 5).
- **File/hàm:** `js/ai/workflow-engine.js` `execute()`, `run()`.
- **Sửa tối thiểu:** khôi phục hợp đồng Sprint 7 trong engine — step có `pluginId` và không có `type` đi đúng đường PermissionService → PluginManager → AIJobQueue (khôi phục `runStep` gốc); `run()` nhận hàm ở tham số thứ 4 làm `onStepDone` và gọi sau kết quả cuối của mỗi step. Không đổi nhánh `generation`/`GenerationService`.

### WF-D2 — MEDIUM — `run()` reject thô khi executor lỗi
- **Hiện tại:** executor reject/throw (vd mất mạng khi kiểm quyền) → `run()` reject, kết quả các step trước mất; UI `onRunWorkflow()` chỉ có `.then()` → nút "CHẠY WORKFLOW" bị `disabled` mãi + unhandled rejection. Tái hiện: `run([{type:'generation'}], …, {overrideExecute: () => Promise.reject(new Error('network down'))})` → rejected.
- **Kỳ vọng (Sprint 7):** "không bao giờ reject — mọi lỗi trả qua StepResult.status".
- **Sửa tối thiểu:** trong `run()`, lỗi của executor (kể cả throw đồng bộ) → StepResult `status:'failed'` → áp dụng retry/fallback/dừng như mọi step lỗi.

### WF-D3 — MEDIUM — `cancelWaitEvent()` làm workflow treo vĩnh viễn
- **Hiện tại:** `cancelWaitEvent('evt')` trả `true` nhưng Promise của `waitForEvent` không bao giờ settle (comment trong code thừa nhận); timer timeout bị xoá nên cũng không bao giờ timeout → `run()` treo, nhánh `event_cancelled` không bao giờ tới. Sau timeout, entry rỗng còn trong registry → `resumeExecution` báo `{emitted:true, listeners:0}` sai.
- **Kỳ vọng (code + CHANGELOG WORKFLOW-04):** cancel → reject `WAIT_CANCELLED` → step `cancelled` → `run()` dừng với `reason:'event_cancelled'`.
- **Sửa tối thiểu:** lưu `reject` vào handle; `cancelWaitEvent` reject từng waiter với `code:'WAIT_CANCELLED'`; xoá entry rỗng sau timeout.

### WF-D4 — MEDIUM — Fallback provider chỉ chạy 1 lần cho mỗi định nghĩa step
- **Hiện tại:** `run()` ghi `step._fallbackAttempted = true` vào CHÍNH object step của caller → lần `run()` sau (hoặc vòng sau của `runLoop`/`runForEach`/`runBatch` dùng lại step) bỏ qua fallback. Tái hiện: chạy cùng định nghĩa 2 lần → lần 1 `primary,p2`, lần 2 chỉ `primary`.
- **Sửa tối thiểu:** cờ fallback là biến cục bộ của từng lượt xử lý step, không ghi vào input.

### WF-D5 — MEDIUM — LOOP/FOREACH không dừng khi 1 vòng lỗi
- **Hiện tại:** `runLoop` maxIterations=5 với step luôn lỗi → chạy đủ 5 lần; `runForEach` 3 item, item 1 lỗi → vẫn chạy item 2, 3. Code `if (out.stoppedEarly) return; // break toàn chuỗi` không có tác dụng (chỉ return trong 1 `.then`).
- **Kỳ vọng:** đúng comment code "break toàn chuỗi" và đúng hành vi `run()` (dừng ngay khi 1 step không completed) — tránh lặp lại lời gọi AI lỗi/bị từ chối quyền N lần.
- **Sửa tối thiểu:** cờ `stopped` trong `runLoop`/`runForEach`, bỏ qua các vòng sau khi 1 vòng `stoppedEarly`.

### WF-D6 — MEDIUM/LOW — Decision Engine: điều kiện lỗi cấu hình
- `evaluateCondition({key:'x', op:'bogus', value:999})` với x=5 → `true` (nhánh `default: return !!value`) — gõ sai toán tử làm step có điều kiện vẫn chạy (fail-open).
- `op` không phải chuỗi (vd số) → `TypeError` (trong `run()` bị nuốt thành skip; trong `decideBranch` ném ra ngoài).
- `resolveBranch([{a: x==1}, {b: x==2}], x=3)` không có default → chọn **b** (nhánh có điều kiện SAI) do dòng fallback `sorted[sorted.length - 1]`.
- **Kỳ vọng:** cấu hình điều kiện sai → không khớp (fail-closed); không nhánh nào khớp và không có default/nhánh không điều kiện → không chọn nhánh nào.
- **Sửa tối thiểu:** toán tử lạ → `false`; chuẩn hoá `op` bằng `String()`; bỏ dòng fallback chọn nhánh cuối.

### WF-D7 — MEDIUM — Server: Cancel/Pause của `workflow:auto` không có tác dụng
- **Hiện tại:** đặt `workflowState='CANCELLED'` (hoặc `PAUSED`) trong lúc 1 step đang chạy → worker xong step ghi lại `workflowState:'RUNNING'` → lần kiểm tra đầu step sau không thấy → chạy hết 4 step, kết thúc `COMPLETED`. Tái hiện trên Emulator bằng handler thật.
- **Kỳ vọng (WORKFLOW-02 ghi ✅):** Cancel/Pause dừng ở ranh giới step kế tiếp.
- **Sửa tối thiểu:** các lần worker tự chuyển `workflowState` sang RUNNING/RETRYING dùng transaction, KHÔNG ghi đè `CANCELLED`/`PAUSED`.
- **Ghi chú:** hiện chưa có đường kích hoạt `workflow:auto` từ client (Rules chặn `apiAsyncJobs`, WF-F1) và chưa có API điều khiển cancel/pause — sửa để khi Founder mở trigger thì Cancel/Pause đúng như tài liệu. Cần deploy Functions.

## 4. Hiện thực một phần (C) — báo cáo, chưa sửa

- **WF-C1 `run()` timeout:** `config.timeout` chỉ `runParallel` dùng; `run()` bỏ qua (step chậm 300 ms với timeout 30 ms vẫn chờ 301 ms). Hết giờ mà Job AI vẫn chạy tiếp ở nền và tạo Draft sau → cần quyết semantics (huỷ Job hay chỉ bỏ chờ).
- **WF-C2 FOREACH mặc định:** không truyền `buildIterationContext` → mọi item bị bỏ qua (`itemsProcessed=0`); item không được đưa vào context/inputParams. Đề xuất (chưa làm): context mặc định `{variables:{item, index}}`.
- **WF-C2b `runLoop` `buildIterationContext(iter, i)`:** tham số thứ 2 luôn = maxIterations (closure).
- **WF-C3 Server:** `status` job `workflow:auto` luôn `queued` (chỉ `workflowState` đổi) — `GET /v1/jobs/:id` trả `status:'queued'` cho workflow đã COMPLETED; entry log FAILED của step `required:false` bị entry SKIPPED ghi đè (mất lỗi gốc); log SUCCESS không ghi `draftId` dù comment nói có "output"; enum `WAITING` không bao giờ được ghi.
- **Kết quả retry trong `run()`:** mỗi lần thử được push vào `results` → 1 step có thể chiếm nhiều phần tử (UI hiện không bật retry nên chưa lệch).
- **`wait_event` thiếu `eventId`:** `reason` trả `event_timeout` (sai tên lý do).

## 5. Thiếu (E) / cần quyết định (F)

- **WF-E1 Không giới hạn vòng lặp:** chưa có trần an toàn cho `maxIterations` → cần Founder/kiến trúc chọn trần (đề xuất 1.000) trước khi hiện thực.
- **WF-E2 Không buffer event:** `resumeExecution` trước `waitForEvent` → event mất.
- **WF-E3 Không bền:** wait-state, Decision Context, định nghĩa workflow chỉ trong bộ nhớ trình duyệt (Sprint 7 cố ý không lưu Firebase). Lưu bền = đổi Database Structure → Founder quyết.
- **WF-E4 Server resume:** PAUSED → đặt lại RUNNING không có gì chạy tiếp; worker crash giữa chừng không tự chạy lại (`onValueCreated` 1 lần, retry mặc định tắt). Cần trigger `onValueUpdated` hoặc API resume → Founder quyết.
- **WF-E5 Idempotency:** mỗi lần lưu SP published đẩy 1 job mới; worker không chống trùng theo productId. Nút UI "CHẠY WORKFLOW" có khoá `disabled` trong lúc chạy (đủ cho trigger thủ công). Resume event trùng = no-op (chỉ trong bộ nhớ).
- **Trigger:** thủ công (UI Admin) có; product-publish (client → `apiAsyncJobs`) bị Rules chặn; API `/v1/ai/{module}/generate?async=true` chỉ 1 module, không khởi chạy workflow; KHÔNG có schedule/cron, webhook inbound, data trigger, gọi workflow theo id — đúng thiết kế "không Trigger tự động/Cron/Webhook" (Sprint 7). Không thêm.

## 6. Ranh giới bảo mật (Phase 12)

| Câu hỏi | Kết quả |
|---|---|
| Ai tạo/sửa workflow? | Client: không lưu định nghĩa (chỉ trong phiên). Server: `workflowConfigs` chỉ Admin SDK (Rules `$other` deny). |
| Ai chạy workflow? | Trang Workflow: `AdminAuth requiredRole:'admin'` (client). Sau khi sửa WF-D1, MỖI step còn qua `PermissionService.checkPluginExecution()` + PluginManager (plugin tắt bị chặn) + Rules `aiJobs` (admin/editor). |
| Workflow gọi workflow khác? | Chỉ trong code (`runLoop/runForEach/runBatch` → `run()`); không có định nghĩa tham chiếu workflow theo id. |
| HTTP tuỳ ý? | Không có action HTTP. Webhook: đăng ký Admin-only, bắt buộc `https://`, ký HMAC. |
| Thực thi mã tuỳ ý? | Điều kiện dạng hàm chỉ tạo được từ mã nguồn; định nghĩa từ Firebase (`workflowConfigs`) chỉ là dữ liệu, không `eval`. |
| Lộ secret qua log? | `executionLog.error`/`aiLogs.errorMessage` chỉ ghi message lỗi; không ghi key. |
| Đường tắt quyền | WF-S1: `GenerationService.generate()` bỏ qua PermissionService (dormant — không nạp ở đâu; bản sửa WF-D1 KHÔNG dùng nó). WF-S2: agent `jobs.view` đọc mọi `apiAsyncJobs` theo id (LOW). |

## 7. Không thuộc phạm vi / FROZEN

AIJobQueue, PluginManager, PermissionService, Firebase Rules, lớp bảo mật `8869226`/`a950352`/`5ceccf1`, One Click Marketing, Founder Agent, CMS modules — không sửa.

## 8. Kết quả sau sửa (2026-09-26)

| Commit | Nội dung | Test |
|---|---|---|
| `982794e` | Inventory + gap report (chưa sửa code) | — |
| `82bc2a2` | WF-D1: step `{pluginId}` → PermissionService → PluginManager → AIJobQueue; `run()` nhận `onStepDone` | `tests/workflow-engine.test.js` 9 ca; `tests/e2e/t_wf_ui.js` |
| `9ec0e2f` | WF-D2: `run()` không reject thô | 5 ca |
| `1554390` | WF-D3: `cancelWaitEvent` reject `WAIT_CANCELLED`; dọn registry sau timeout | 4 ca |
| `953fa42` | WF-D4: cờ fallback cục bộ | 2 ca |
| `03763dc` | WF-D5: `runLoop`/`runForEach` dừng khi vòng/item `stoppedEarly` | 3 ca + 3 baseline |
| `33fc3bc` | WF-D6: Decision fail-closed; `resolveBranch` không chọn nhánh sai | 3 ca + 1 baseline |
| `b62bb1f` | WF-D7: worker không ghi đè CANCELLED/PAUSED | `tests/workflow-worker.test.js` 8 ca (Emulator) |
| `8c9572b` | Bump cache-bust `?v=33fc3bc` (71 file HTML) — bắt buộc vì `/js/*` immutable | `cache-bust.test.js` |

**Bằng chứng sau sửa (Emulator + Chromium):** trang Workflow chạy 2 step → Step 1 tạo `aiJobs` (createdBy admin, input đúng) + `aiLogs`, lỗi DỪNG ở Provider (`Failed to fetch` — không có mạng AI), Step 2 "Chưa chạy (dừng do bước trước lỗi)", bảng tiến trình vẽ real-time; 0 lỗi JS. Sinh nội dung AI thành công end-to-end: BLOCKED (mạng).

**Regression:** `npm test` 11/11 nhóm (gồm `workflow-engine` 47/47); Emulator: database-rules, storage-rules, registration-security, custom-claims-security, workflow-worker 8/8 — tất cả OK; quét 64 trang: y hệt baseline (7 trang `permission_denied` do Rules, 10 trang workspace rỗng, 3 trang workspace về login); CMS: login/logout, sửa Banner/Video/Slider/Menu/Footer, Blog/Footer lên 5 trang public, trang bảo vệ khi chưa đăng nhập → login: PASS. Module FROZEN bị sửa: 0.

**Còn mở (không sửa trong đợt này):** WF-C1..C3, WF-E1..E5, WF-F1, WF-S1, WF-S2 — xem mục 4–6.
