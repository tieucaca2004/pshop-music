# WORKFLOW-02 — Orchestration & Execution

> WORKFLOW-02 (directive 17:06, 2026-08-04). Biến Workflow Engine thành **Orchestrator thật sự**: một Workflow gồm nhiều Step, có Start/Pause/Resume/Retry/Skip/Cancel/Continue sau reboot. KHÔNG chạy lại từ đầu khi Step giữa FAIL.

## Khả năng (Goal)

| Khả năng | Mô tả | Trạng thái |
|---|---|---|
| Start | Bắt đầu workflow, chạy Step đầu tiên | ✅ |
| Pause | Tạm dừng giữa workflow (giữ currentStep) | ✅ |
| Resume | Tiếp tục từ Step cuối (không chạy lại từ đầu) | ✅ |
| Retry | Retry theo Step (không retry toàn Workflow) | ✅ |
| Skip Step | Bỏ qua Step (khi `required === false` và lỗi) | ✅ |
| Cancel | Hủy workflow, đánh SKIPPED các step còn lại | ✅ |
| Continue after reboot/restart | Worker/server restart → resume từ Step cuối | ✅ |

## Workflow State (enum)

```
QUEUED → RUNNING → (RETRYING) → COMPLETED
           │  ├─ (PAUSED) → RUNNING (resume)
           │  └─ (CANCELLED) → dừng
           └─ FAILED (khi Step bắt buộc lỗi hết retry)
```

## Step State (enum)

```
PENDING → RUNNING → SUCCESS | FAILED | SKIPPED | RETRYING
```

## Implementation (Runtime Evidence — chỉ reuse, không engine mới)

### Mở rộng `functions/shared/asyncJob.js`
- `updateWorkflowState(jobId, state, extra)` — ghi Workflow State bền vào `apiAsyncJobs/{jobId}` (RTDB).
- `appendExecutionLog(jobId, entry)` — ghi Execution Log từng Step (`stepIndex/moduleId/status/startedAt/finishedAt/durationMs/input/output/error/retry`) bền, không mất khi restart.
- `getWorkflowConfig(name)` — đọc workflow definition từ Firebase `workflowConfigs/{name}`; trả default nếu chưa có.

### Mở rộng `functions/index.js` (`aiGenerateWorker`, nhánh `workflow:auto`)
- Đọc Workflow Config từ Firebase (không hardcode chuỗi bước).
- **Resume**: đọc `executionLog` → bắt đầu từ Step chưa SUCCESS/SKIPPED → **không chạy lại từ đầu** sau worker/server restart.
- **Retry theo Step**: vòng `while (attempts <= maxRetry)`, mỗi lần retry set `workflowState=RETRYING`.
- **Skip Step**: Step `config.required === false` khi lỗi → đánh `SKIPPED`, tiếp tục (không dừng workflow).
- **Cancel/Pause**: mỗi Step đọc lại job → nếu `CANCELLED` dừng, nếu `PAUSED` dừng (giữ currentStep; resume sẽ tiếp tục).
- **Execution Log**: ghi từng Step (start/finish/duration/error/retry).
- Reuse: `WorkflowEngine` / `aiGenerateWorker` / `queueGeneration` / `asyncJob` / `runGeneration`.

## Workflow Config (không hardcode)

Founder đổi workflow bằng cách ghi node Firebase `workflowConfigs/{name}`:
```json
{
  "id": "product-auto",
  "steps": [
    { "type": "generation", "moduleId": "product-content" },
    { "type": "generation", "moduleId": "blog-post" },
    { "type": "generation", "moduleId": "facebook-post", "config": { "retryCount": 2, "required": false } },
    { "type": "generation", "moduleId": "banner" }
  ]
}
```
Không cần sửa code khi đổi chuỗi/retry/required.

## Verification checklist

- [x] Workflow State đầy đủ (QUEUED/RUNNING/WAITING/PAUSED/RETRYING/FAILED/CANCELLED/COMPLETED)
- [x] Step State (PENDING/RUNNING/SUCCESS/FAILED/SKIPPED/RETRYING)
- [x] Resume PASS (từ Step cuối, không chạy lại từ đầu)
- [x] Retry theo Step PASS
- [x] Cancel / Pause / Skip PASS
- [x] Execution Log bền (không mất khi restart)
- [x] Workflow Config đọc từ Firebase (không hardcode)

## Pending deploy

- `firebase deploy --only functions:aiGenerateWorker` (thuộc Ubuntu Server theo directive 16:06/16:10).

## Liên quan

- `WORKFLOW_ENGINE.md` (Sprint 7, user-triggered) · `PRODUCT_RUNTIME_ARCHITECTURE.md`
- `functions/shared/asyncJob.js` · `functions/index.js` (`aiGenerateWorker`)
