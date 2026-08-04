# WORKFLOW-03 — Monitoring & Observability

> WORKFLOW-03 (directive 17.07 + Architecture Decision REUSE FIRST, 2026-08-04).
> Lớp quan sát (Monitoring & Observability) cho Workflow Runtime — KHÔNG phải Engine/Executor/Queue/Worker mới.

## Kiến trúc (REUSE FIRST — quyết định cuối)

- **Không tạo** `workflow-dashboard.html`/`.js` mới.
- **Mở rộng** `admin/ai/observability.html` + `js/admin-ai-observability.js` (dashboard trung tâm) — thêm panel **Workflow Runtime**.
- Reuse: `WorkflowEngine` / `aiGenerateWorker` / `asyncJob` / `apiAsyncJobs` / Workflow State / Execution Log / Workflow Config / Firebase RTDB listener.
- Chỉ đọc Runtime hiện có — không DB/node/queue/worker/scheduler/cron/polling/namespace mới.

## Dashboard (3 tầng, trong Observability)

### LEVEL 1 — Overview
- Counting: Running / Waiting / Retrying / Failed / Completed / Cancelled
- Metrics: Queue Size, Success Rate, Failure Rate

### LEVEL 2 — Workflow Detail (`openWf`)
- Workflow ID, Workflow Name, Workflow State (QUEUED/RUNNING/WAITING/PAUSED/RETRYING/FAILED/CANCELLED/COMPLETED)
- Current Step / Previous Step / Next Step
- Started / Updated / Finished / Duration / Retry Count

### LEVEL 3 — Step Detail (`wfStepsHtml`)
- Plugin, Status (PENDING/RUNNING/SUCCESS/FAILED/SKIPPED/RETRYING), Duration, Retry, Error
- Input/Output (từ executionLog).

### Execution Timeline (`wfTimelineHtml`)
- Start → Step 1 → Step 2 → … → Finish (dọc, màu theo status).

## Realtime
- `startWfListener()` — Firebase `apiAsyncJobs` `limitToLast(200)`, `.on('value')`, không polling, cập nhật node thay đổi, history giữ **30 ngày / 1000 workflow** (reuse runtime).

## Debug (1 click)
- Click 1 Workflow trong list → mở Detail + Step + Error + Retry + Duration — không cần SSH Server.

## Verification
- [x] node --check `js/admin-ai-observability.js` PASS
- [x] Không conflict marker
- [x] Overview / Workflow Detail / Step Detail / Timeline / Realtime / History present

## Pending deploy
- Static HTML/JS → deploy Netlify (thuộc Ubuntu Server theo directive 16:06/16:10).

## Liên quan
- `WORKFLOW_02_ORCHESTRATION.md` · `WORKFLOW_ENGINE.md` · `admin/ai/observability.html`
