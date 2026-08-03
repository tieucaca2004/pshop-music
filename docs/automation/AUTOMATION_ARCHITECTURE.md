# AUTOMATION ARCHITECTURE

Kiến trúc Automation của PSH Platform — chỉ mục tổng hợp.

## 1. AI Generation (Async)

```
queueGeneration() → apiAsyncJobs (job queued)
  → aiGenerateWorker (RTDB trigger onValueCreated)
  → runGeneration() (loadContext → buildPrompt → OpenAI → mapToDraftContent → DraftDB.add)
  → job: queued → running → completed
```

- `aiGenerateWorker` (asia-southeast1) + `apiGateway` (us-central1).
- Trạng thái: theo PROJECT_STATUS, `aiGenerateWorker` CHƯA deploy đầy đủ (index.js `aiGenerateWorker`).

## 2. Workflow Automation (Sprint 7)

- `js/ai/workflow-engine.js` — ghép nhiều Plugin chạy tuần tự thủ công (Admin tự bấm "Chạy Workflow").
- Chưa có trigger tự động nối các Plugin thành chuỗi (theo ROADMAP mục Workflow).

## 3. Deploy / Release

- **Netlify static deploy as-is**: `netlify.toml` `[build] command=""`, `publish="."` → KHÔNG có build step, deploy nguyên bản.
- **Cloud Functions**: `firebase deploy --only functions` (`apiGateway` + `aiGenerateWorker`).
- **Database/Storage rules**: `firebase deploy --only database` / `--only storage`.

## 4. Nguồn sự thật

- GitHub = Single Source of Truth. Runtime Evidence thắng suy luận.

## Liên quan

- `docs/workflow/WORKFLOW_ENGINE.md` · `ROADMAP.md` · `docs/ARCHITECTURE.md`
