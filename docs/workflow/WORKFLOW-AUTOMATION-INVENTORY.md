# WORKFLOW AUTOMATION — INVENTORY (Phase 0)

> Kiểm kê CHỈ ĐỌC trên HEAD `5ceccf1` (branch `feature/cms-ai-sprint2`, 2026-09-26). Mọi nhận định dưới đây lấy từ mã nguồn thật + git log, không suy đoán. Kết quả chạy thử (runtime) nằm ở `WORKFLOW-AUTOMATION-GAP-REPORT.md`.

## 1. Các module hiện có

| # | Module | Vai trò | Được nạp bởi trang nào | Trạng thái nạp |
|---|---|---|---|---|
| M1 | `WorkflowEngine` — `js/ai/workflow-engine.js` (901 dòng) | Engine phía client: `run()` tuần tự + retry/fallback/approval/condition/policy/wait_event; Decision Engine (WORKFLOW-04): Decision Context, IF/ELSE, SWITCH, LOOP/FOREACH, PARALLEL, WAIT EVENT, POLICY, BRANCH | `admin/ai/workflow.html` (DUY NHẤT) | Có nạp |
| M2 | `AdminAIWorkflow` — `js/admin-ai-workflow.js` | UI "Workflow Automation" (Admin-only): ghép Step = Plugin + input, bấm "CHẠY WORKFLOW" → `WorkflowEngine.run()` | `admin/ai/workflow.html` | Có nạp; vào trang qua link ở `admin/ai/drafts.html` (không có trong sidebar) |
| M3 | `AIJobQueue` — `js/ai/job-queue.js` | Queue thực thi AI DUY NHẤT phía client (`aiJobs`/`aiLogs`/`aiDrafts`), khoá transaction chống xử lý trùng giữa tab | `workflow.html`, `jobs.html`, trang AI khác | FROZEN (13 Sprint) |
| M4 | `PluginManager` / `PermissionService` — `js/ai/plugin-manager.js`, `js/ai/permission-service.js` | Cổng gọi Plugin + kiểm quyền bắt buộc (CLAUDE.md mục 5) | `workflow.html` và các trang AI | FROZEN |
| M5 | `GenerationService` — `js/ai/services/generation-service.js` | Lớp "execution only" (Phase 2.7). `generate()` gọi THẲNG `AIJobQueue.enqueue()` | KHÔNG trang nào nạp | Mã chết (dormant) |
| M6 | `PipelineAdapter`, `VideoService`, `BatchEngine`, `TemplateEngine`, `ProjectManager`, `AssetManager`, `RenderQueue`, `Image/Voice/SubtitleService` — `js/ai/services/*.js` | Tầng "pipeline" gọi `WorkflowEngine.execute()/run()` | KHÔNG trang nào nạp | Mã chết (dormant) |
| M7 | `aiGenerateWorker` — `functions/index.js:1030-1140` | Cloud Function RTDB `onValueCreated` trên `apiAsyncJobs/{jobId}`: xử lý `ai-generate:*` (async) + nhánh `workflow:auto` (WORKFLOW-01/02: chuỗi Step, retry theo Step, skip, pause/cancel, executionLog) | Server | Code có; trạng thái deploy Production: CHƯA XÁC MINH |
| M8 | `asyncJob` — `functions/shared/asyncJob.js` | `createJob/getJob/updateJobStatus/updateWorkflowState/appendExecutionLog/getWorkflowConfig` (node `apiAsyncJobs`, `workflowConfigs`) | Server | Có |
| M9 | `runGeneration` — `functions/shared/aiGenerate.js` | Thực thi 1 module AI phía server → `aiDrafts` + event `ai.generate.completed/failed` | Server | Có |
| M10 | Trigger "Product publish → workflow:auto" — `js/admin-products.js:425-445` (WORKFLOW-01) | Client ghi `apiAsyncJobs.push({type:'workflow:auto'})` khi lưu SP `pubStatus=published` | `admin/products.html` | Bị Rules chặn (`apiAsyncJobs` không có trong `database.rules.json` → `$other` deny) → luôn thất bại im lặng (`.catch(console.error)`) |
| M11 | Event Bus / Webhook — `functions/shared/eventBus.js`, `functions/shared/webhook.js`, `functions/routes/webhooks.js` | Ghi `apiEvents`, gửi webhook HMAC tới `webhookSubs` (https, Admin-only) | Server | Có |
| M12 | Jobs/Logs/Workflows API — `functions/routes/jobsLogs.js` | `GET /v1/jobs[/:id]` (fallback `apiAsyncJobs`), retry/cancel `aiJobs`, `GET /v1/logs`, `GET /v1/workflows` (`founderAgentWorkflows`) | Server | Có |
| M13 | Observability — `js/admin-ai-observability.js` (WORKFLOW-03) | Panel "Workflow Runtime" lắng nghe `apiAsyncJobs` realtime | `admin/ai/observability.html` | Client bị Rules chặn đọc `apiAsyncJobs` → panel không có dữ liệu |
| M14 | Workflow Insights — `js/ai/workflow-insights.js`, `js/admin-ai-workflow-insights.js` | Quan sát CHỈ ĐỌC vòng đời AI Request (`aiJobs/aiLogs/aiDrafts`) | `admin/ai/workflow-insights.html` | Có |
| M15 | One Click Marketing — `functions/routes/founder.js` | Orchestration riêng: 4 module song song `Promise.allSettled` qua `generateForModule()` | Server | FROZEN (không dùng WorkflowEngine) |
| M16 | Founder Agent workflows — `js/admin-agent.js` (`founderAgentWorkflows`) | Kế hoạch nhiều bước của Founder Agent | `admin/ai/agent.html` | FROZEN (không dùng WorkflowEngine) |
| M17 | `scripts/workflow-state.js` | State machine localStorage độc lập (chỉ dùng trong `scripts/test-suite.js`) | Không trang nào | Công cụ nội bộ, bị chặn publish |
| M18 | Automation ngoài web app: `workflows/facebook-*`, `restaurant-workflow/*`, `n8n-facebook-publisher-workflow.json`, `fb-comment-agent/` | Script chạy tay/n8n trên máy Founder | — | Ngoài phạm vi engine; liên quan S-08 (credential) |

## 2. File chính

- Engine & UI: `js/ai/workflow-engine.js`, `js/admin-ai-workflow.js`, `admin/ai/workflow.html`
- Queue & quyền: `js/ai/job-queue.js`, `js/ai/plugin-manager.js`, `js/ai/permission-service.js`, `js/ai/ai-db.js`, `js/ai/plugin-db.js`
- Server: `functions/index.js` (`aiGenerateWorker`), `functions/shared/asyncJob.js`, `functions/shared/aiGenerate.js`, `functions/shared/eventBus.js`, `functions/shared/webhook.js`, `functions/routes/webhooks.js`, `functions/routes/jobsLogs.js`, `functions/routes/aiGenerate.js`
- Trigger client: `js/admin-products.js:425-445`
- Tài liệu: `docs/workflow/WORKFLOW_ENGINE.md`, `WORKFLOW_02_ORCHESTRATION.md`, `WORKFLOW_03_MONITORING.md`, `docs/automation/AUTOMATION_ARCHITECTURE.md`, `CHANGELOG.md` (WORKFLOW-01..04)

## 3. API / Route liên quan

| Route | Quyền | Việc |
|---|---|---|
| `POST /v1/ai/{module}/generate[?async=true]` | admin/editor; agent 3 module; rate limit | Tạo 1 job AI (sync hoặc `apiAsyncJobs` queued) — KHÔNG khởi chạy workflow nhiều bước |
| `GET /v1/jobs`, `GET /v1/jobs/:id` | admin/editor; agent (`jobs.view`) | Đọc `aiJobs`; `:id` fallback đọc `apiAsyncJobs` (kể cả job `workflow:auto`) |
| `POST /v1/jobs/:id/retry|cancel` | admin/editor | Retry/cancel `aiJobs` (queue client) |
| `GET /v1/workflows` | admin/editor | Đọc `founderAgentWorkflows` |
| `GET/POST/DELETE /v1/webhooks`, `GET/POST /v1/events` | admin | Đăng ký webhook https / ghi-đọc event |
| (không có) | — | KHÔNG có route tạo/sửa/chạy/pause/resume/cancel workflow `workflow:auto` |

## 4. Cấu trúc dữ liệu

- **Step (client, dạng Sprint 7 — UI đang gửi)**: `{ pluginId, inputParams }`
- **Step (client, dạng Phase 2.7 — engine hiện đọc)**: `{ type: 'generation'|'approval'|'delay'|'wait_event', moduleId, inputParams, condition?, policy?, eventId?, config?: { retryCount, retryDelayMs, fallbackProvider, requireApproval, delayMs, timeout, eventId, policy } }`
- **StepResult**: `{ stepIndex, pluginId, jobId?, draftId?, status: 'completed'|'failed'|'skipped'|'denied'|'awaiting_approval'|'cancelled'|..., error }`; `run()` trả `{ results, stoppedEarly, reason? }`
- **Decision Context**: `{ workflowId, executionId, currentStep, previousStep, nextStep, workflowState, variables, sharedMemory, retryCount, errorCount, startTime, finishTime, duration }` — chỉ trong bộ nhớ
- **Wait registry**: `waitRegistry[eventId] = { resolvers[], cancelTimers{}, metadata }` — chỉ trong bộ nhớ (mất khi tải lại trang)
- **Server `apiAsyncJobs/{jobId}`** (`workflow:auto`): `{ type, uid, payload:{async, productId, productName, steps, workflowName?}, status, workflowState, currentStep, totalSteps, executionLog/{stepIndex}:{status RUNNING|SUCCESS|FAILED|SKIPPED|PENDING, startedAt, finishedAt, durationMs, error, retry}, createdAt, updatedAt }`
- **`workflowConfigs/{name}`**: `{ id, steps:[{type, moduleId, config}] }` — chỉ Admin SDK đọc/ghi
- **Client queue `aiJobs/{id}`**: `{ moduleId, status, items[{inputParams, resultDraftId, status, error}], progress, lock{lockedBy, lockedAt}, createdBy }`

## 5. Vòng đời thực thi hiện có

**Client (UI Workflow):**
`Admin bấm CHẠY WORKFLOW → WorkflowEngine.run(steps, uid, email, callback) → execute(step) theo step.type → [generation → GenerationService.generate] → StepResult → dừng khi step không completed → UI vẽ bảng kết quả`

**Server (`workflow:auto`):**
`apiAsyncJobs.push (client — bị Rules chặn) → aiGenerateWorker onValueCreated (1 lần) → getWorkflowConfig → bỏ qua step đã SUCCESS/SKIPPED → mỗi step: kiểm CANCELLED/PAUSED → runGeneration (retry theo step) → executionLog → workflowState RUNNING/RETRYING/FAILED/COMPLETED`

## 6. Test hiện có

- `tests/*.test.js` (`npm test`): KHÔNG có test nào cho `workflow-engine.js`, `aiGenerateWorker` hay `admin-ai-workflow.js`.
- `scripts/test-suite.js` TEST 7: chỉ test `scripts/workflow-state.js` (state machine localStorage, không phải engine).
- CHANGELOG WORKFLOW-04 ghi "VERIFY PASS bằng Runtime Evidence (node test thật)" nhưng test đó KHÔNG có trong repo.

## 7. Khả năng đã hiện thực (theo mã nguồn — kết quả chạy thật xem Gap Report)

Decision Context; `evaluateCondition` (eq/ne/gt/gte/lt/lte/in/notin/truthy/falsy/exists/empty/function); `decideBranch`; `runSwitch`; `runLoop` (maxIterations, breakOn); `runForEach` (skip qua `buildIterationContext`); `runParallel` (concurrencyLimit, failFast, timeout, aggregate); `waitForEvent/resumeExecution/cancelWaitEvent/waitOnStep` + `run()` pause; `evaluatePolicy` + tích hợp `run()`; `resolveBranch/mergeBranchResult`; retry theo step + fallback provider trong `run()`; `runBatch`; server: retry theo step, skip step `required:false`, kiểm CANCELLED/PAUSED, executionLog bền.

## 8. Khả năng còn thiếu (theo mã nguồn)

- Không lưu định nghĩa workflow phía client (Sprint 7 cố ý: chỉ trong bộ nhớ phiên).
- Không trigger lịch (cron/schedule), không webhook inbound kích hoạt workflow, không API khởi chạy/điều khiển `workflow:auto`.
- Wait/Resume chỉ trong bộ nhớ trình duyệt — không bền qua tải lại trang.
- Server: PAUSED/restart không có đường resume thật (`onValueCreated` chỉ bắn 1 lần khi tạo job).
- Không có idempotency key cho trigger.

## 9. Lỗi đã biết trước đợt này

- `apiAsyncJobs` bị Rules chặn cho client (S-03, chờ Founder quyết) → trigger WORKFLOW-01 và panel WORKFLOW-03 không hoạt động từ trình duyệt.
- `GenerationService.generate()` đi thẳng `AIJobQueue.enqueue()` — bỏ qua `PermissionService`/`PluginManager` (vi phạm CLAUDE.md mục 5) nhưng không trang nào nạp.
- Tài liệu `WORKFLOW_02_ORCHESTRATION.md` còn ví dụ moduleId cũ (`product-content`, `blog-post`…) không tồn tại.

## 10. Phụ thuộc

`WorkflowEngine` → (`GenerationService` HOẶC `PermissionService` + `PluginManager` + `AIJobQueue`) → `AIModuleRegistry` + `AIProviderRegistry` + `DraftDB/JobDB/LogDB` → Firebase RTDB (`aiJobs`, `aiLogs`, `aiDrafts`, `aiPlugins`, `roles`). Server: `aiGenerateWorker` → `asyncJob` → `runGeneration` → `providerRouter` (OpenAI/DeepSeek secret) → `aiDrafts` + `eventBus` → `webhook`.

## 11. Thành phần FROZEN (không đụng trong đợt này)

`AIJobQueue`, `PluginManager`, `PermissionService`, `DraftDB/JobDB/LogDB`, toàn bộ CMS module, Founder Agent, One Click Marketing, `runGeneration`, Firebase Rules, lớp bảo mật `8869226`/`a950352`/`5ceccf1`.

## 12. Cần Founder quyết định

- Mở `apiAsyncJobs` (trigger WORKFLOW-01 + panel WORKFLOW-03) hay chuyển trigger sang API server — đã nằm trong Deployment Gate (S-03).
- Có cần lưu định nghĩa workflow / wait-state bền (thay đổi Database Structure) hay không.
