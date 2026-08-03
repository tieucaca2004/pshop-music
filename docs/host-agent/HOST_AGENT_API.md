# HOST AGENT — API Specification

Chi tiết API REST giữa OpenClaw (Orchestrator) và Host Agent (Executor). Xem tổng quan tại `HOST_AGENT_ARCHITECTURE.md`.

## Base URL

`https://<host-agent-host>:<port>/` (private network). Auth: `Authorization: Bearer <HOST_AGENT_TOKEN>`.

## Endpoints

### POST /jobs — tạo job
```json
Request:
{
  "type": "deploy",                        // bắt buộc: git-pull|git-push|deploy|netlify|npm-install|npm-test|npm-build|systemctl-restart
  "ref": "feature/cms-ai-sprint2",         // tùy chọn (git)
  "commands": ["git pull", "git push"],    // tùy chọn nếu type=custom (allowlist chỉ kiểm)
  "timeout": 300                           // giây, tùy chọn
}
Response 201:
{ "jobId": "abc-123", "status": "queued", "createdAt": "..." }
```

### GET /jobs/{id} — query job
```
Response 200:
{
  "jobId": "abc-123", "type": "deploy", "status": "completed",
  "evidence": { "stdout": "...", "stderr": "...", "exitCode": 0, "durationMs": 4520, "deployUrl": "https://…", "headSha": "…" },
  "error": null, "createdAt": "...", "updatedAt": "..."
}
```

### GET /jobs?status=queued|running|completed|failed|cancelled
```
Response 200: [ { "jobId": "…", "type": "…", "status": "…" }, ... ]
```

### POST /jobs/{id}/cancel
```
Response 200: { "status": "cancelled" }
```

### GET /health
```
Response 200:
{ "ok": true, "version": "1.0.0",
  "git": { "remote": "git@github.com:…", "head": "<sha>", "clean": true },
  "netlify": "available", "queueDepth": 0 }
```

## Job types & commands (allowlist)

| type | lệnh Host Agent chạy |
|---|---|
| git-pull | `git pull --ff-only` |
| git-push | `git push origin <ref>` |
| deploy | `git pull --ff-only` + `git push origin <ref>` + `netlify deploy --prod --dir=.` |
| netlify | `netlify deploy --prod --dir=.` |
| npm-install | `npm install` |
| npm-test | `npm test` |
| npm-build | `npm run build` |
| systemctl-restart | `systemctl restart <service>` (allowlist service) |

## Callback

- Host Agent sau khi xong: `POST <openclaw-callback-url>` body `{ jobId, status, evidence, error }`.
- OpenClaw chọn poll `GET /jobs/{id}` (fallback nếu callback không đến).

## Error response

- `401` — token sai.
- `400` — payload không hợp lệ / type ngoài allowlist.
- `409` — job đang chạy (worker bận).
- `422` — git conflict / không fast-forward.
