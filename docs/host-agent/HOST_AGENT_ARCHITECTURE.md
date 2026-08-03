# HOST AGENT — Architecture & Implementation Design

> Thiết kế kiến trúc **Host Agent** cho PSH Platform (Pshop Music).
> Vai trò: OpenClaw (container) = Orchestrator; Ubuntu Host = Executor (deploy, git push, netlify, npm, systemctl).
> Trạng thái: **DESIGN — APPROVED 2026-08-03 (directive 14:28)**. Chưa triển khai code.
> Credentials (GitHub/SSH/Netlify/Docker) chỉ nằm trên Host, không vào Container.

---

## 1. System Architecture

```
┌─────────────┐  Telegram   ┌──────────────────────┐  HTTP REST  ┌──────────────────────────────┐
│  Founder     │◄──────────►│      OpenClaw         │◄───────────►│        HOST AGENT (Ubuntu)    │
│  (Telegram)  │  (chat)    │   Container           │  + Callback │  Node.js service             │
└─────────────┘            │   = ORCHESTRATOR      │            │  = EXECUTOR                  │
                           │   - nhận lệnh Founder  │            │  git · netlify · npm · systemctl
                           │   - tạo Job            │            └───────────────┬──────────────┘
                           │   - gọi Host Agent     │                            │ credentials on host
                           │   - verify production  │                            ▼
                           │   - ghi Knowledge      │              ┌─────────────────────────────┐
                           └──────────────────────┘              │ GitHub (SSH) · Netlify (token)│
                                                                 └─────────────────────────────┘
```

## 2. Network Diagram

- **Founder ↔ OpenClaw:** Telegram (chat) — đã có.
- **OpenClaw ↔ Host Agent:** HTTP REST (private network / mTLS hoặc bearer token). Container gọi `POST https://<host-agent>/jobs`; gửi `type`, `ref`, `commands[]`.
- **Host Agent ↔ GitHub:** SSH (port 22) — key trên host.
- **Host Agent ↔ Netlify:** HTTPS — token trên host (`NETLIFY_AUTH_TOKEN`).
- Host Agent reachable từ container qua URL/private network cấu hình trong OpenClaw env `HOST_AGENT_URL`.

## 3. Deployment Diagram

| Node | Vai trò | Runtime |
|---|---|---|
| Founder device | Người dùng (Telegram) | Telegram app |
| OpenClaw container | Orchestrator | Docker container (phát triển) |
| Ubuntu Host | Executor | systemd service `host-agent` + Node.js |
| GitHub | Single Source of Truth (repo) | SaaS |
| Netlify | Hosting production | SaaS |

## 4. Component Diagram

```
Host Agent (Node.js)
├── HTTP Server (Express/Fastify)
├── Job Queue (SQLite)
│     ├── enqueue(type, payload)
│     ├── worker (FIFO, 1 worker)
│     └── state: queued→running→completed|failed|cancelled
├── Executor
│     ├── runGit(command)
│     ├── runNetlify(command)
│     ├── runNpm(command)
│     └── runSystemctl(service)
├── Security
│     ├── allowlist commands
│     └── bearer token auth
└── Evidence Collector
      ├── stdout/stderr
      ├── exit code
      └── runtime log → payload
```

## 5. Sequence Diagram

```
Founder    OpenClaw         HostAgent        GitHub/Netlify
   │  "Deploy"   │              │                 │
   │───────────► │ POST /jobs   │                 │
   │             │─────────────►│  git pull       │
   │             │              │───────────────► │
   │             │              │  git push       │
   │             │              │───────────────► │
   │             │              │  netlify deploy │
   │             │              │────────────────►│
   │             │  {jobId,     │                 │
   │             │ evidence}    │                 │
   │             │◄─────────────│                 │
   │             │ verify production (HTTP/Google)│
   │             │──────────────────────────────► │
   │  result     │                               │
   │◄────────────│                               │
```

## 6. Job Queue State Machine

```
        enqueue
   ┌──────────► queued
   │              │ worker picks
   │              ▼
   │           running
   │           /      \
   │      success    failure (retryable? yes→back to queued; no→)
   │          │            │
   │          ▼            ▼
   │      completed    failed
   │          │
   │      [cancel] ──► cancelled (từ queued/running)
```

## 7. Host Agent API Specification

```
POST /jobs                     → 201 {jobId, status:"queued"}
  body: { type, ref?, commands?: string[], timeout? }
GET  /jobs/{id}                → {jobId, type, status, payload, evidence, error, createdAt, updatedAt}
GET  /jobss?status=            → [{jobId, type, status}]
POST /jobs/{id}/cancel         → {status:"cancelled"}
GET  /health                   → {ok:true, version, git:"available", netlify:"available", queueDepth}
```

Job `type` hợp lệ: `git-pull`, `git-push`, `deploy` (git pull + push + netlify), `netlify`, `npm-install`, `npm-test`, `npm-build`, `systemctl-restart`.

## 8. OpenClaw ↔ Host Agent Protocol

- OpenClaw = client; Host Agent = server.
- **Transport:** HTTP REST (HTTPS/private network).
- **Delivery:** OpenClaw `POST /jobs` (fire-and-forget) → callback (Host Agent `POST <openclaw-callback>` khi xong) HOẶC OpenClaw poll `GET /jobs/{id}`.
- **Payload:** `evidence` (stdout/stderr/exit), `error` (message nếu failed).
- **Idempotency:** mỗi job có `jobId` duy nhất; OpenClaw dùng `jobId` để match callback/poll.

## 9. Authentication Flow

1. OpenClaw giữ `HOST_AGENT_TOKEN` (shared secret, env container).
2. Mỗi request Header: `Authorization: Bearer <HOST_AGENT_TOKEN>`.
3. Host Agent verify token trước khi nhận job.
4. Truy cập GitHub/Netlify: credentials (SSH key, Netlify token) **chỉ trên host**, do Executor dùng, không qua wire.
5. Không credential nào đi từ container tới Host Agent ngoài token auth của OpenClaw.

## 10. Runtime Evidence Flow

```
Host Agent Executor chạy lệnh
   → capture stdout + stderr + exit code
   → đóng gói evidence {stdout, stderr, exitCode, durationMs, startedAt, finishedAt}
   → lưu vào job.evidence (SQLite)
   → gửi về OpenClaw (callback hoặc qua GET /jobs/{id})
   → OpenClaw verify production (HTTP fetch + Google) + ghi Knowledge/CHANGELOG
```

## 11. Logging Architecture

- Host Agent log ra `stdout` (systemd journal) — `journalctl -u host-agent`.
- Job log lưu SQLite: `jobs(id, type, status, payload, evidence, error, created, updated)`.
- OpenClaw log job vào `docs/host-agent/LOG.md` (timestamp, type, ref, status).
- Không log credential.

## 12. Error Classification

| Loại | Ví dụ | Xử lý |
|---|---|---|
| Network transient | connect timeout, TLS reset | Retry |
| Auth/Permission | HTTP 403, Permission denied, GitHub denied | **Không retry** — failed, báo nguyên văn |
| Command fail (build/test) | npm test exit≠0 | Retry 1 lần sau khi sửa |
| Platform | netlify CLI thiếu | failed, báo lỗi thiếu dependency |

## 13. Retry Matrix

| Lỗi | Retry | Backoff |
|---|---|---|
| Network transient | 2 | 5s → 15s |
| 403 / Permission denied | 0 | — |
| npm build/test fail | 1 (sau fix) | — |
| git push conflict (non-fast-forward) | 0 (cần pull trước) | — |

## 14. Security Model

- Credentials chỉ trên host (user `host-agent`): GitHub SSH key, Netlify token, Docker.
- **Allowlist commands:** chỉ chạy lệnh trong danh sách cho phép; không chạy lệnh tùy ý từ request.
- **Auth:** bearer token (shared secret) giữa OpenClaw ↔ Host Agent.
- **Least privilege:** process user `host-agent` (không root); systemd `ProtectSystem=strict`.
- **Input validation:** `ref`/`type` phải khớp pattern; chống path traversal/injection.

## 15. Rollback Strategy

- Trước git push: lưu `before = git rev-parse --short HEAD`.
- Deploy xấu: `git revert <commit>` → push → `netlify deploy --prod` (rollback code).
- Netlify: idempotent deploy từ working tree; deploy lại bản trước để rollback.
- Docker (nếu có): giữ image tag cũ → `docker run` lại.

## 16. Disaster Recovery

- SQLite job queue có thể dựng lại từ log.
- Repo trên host là bản clone; lấy lại từ GitHub khi mất.
- Host Agent restart (systemd `Restart=on-failure`); job running sẽ retry/đánh dấu failed khi recover.
- GitHub = nguồn phục hồi chính (Single Source of Truth).

## 17. Monitoring

- systemd service health: `systemctl status host-agent`.
- Endpoint `GET /health` (git/netlify/queue depth).
- OpenClaw heartbeat: check job queue depth + gần nhất (log `docs/host-agent/LOG.md`).
- Netlify deploy status (Deploy ID) trong evidence.

## 18. Health Check

`GET /health` trả:
```
{ ok: true, version: "1.0.0",
  git: { remote: "…", head: "<sha>", clean: true },
  netlify: "available", queueDepth: 0 }
```
OpenClaw gọi định kỳ; nếu không ok → ghi nhận, không gửi job.

## 19. Folder Structure

```
/opt/host-agent/
├── package.json
├── src/
│   ├── server.js        # HTTP + routing + auth
│   ├── queue.js         # SQLite job queue + FIFO worker
│   ├── executor.js      # run git/netlify/npm/systemctl (allowlist)
│   ├── security.js      # token verify + allowlist + input validation
│   ├── evidence.js      # capture stdout/stderr/exit
│   └── config.js        # env vars
├── jobs/                # workspace clone (pull/push)
├── db/                  # host-agent.sqlite
├── deploy.sh            # git pull+push + netlify deploy (gọi bởi executor)
└── tests/
```

## 20. Implementation Roadmap

1. Host: user `host-agent`, cài Node 20+, npm.
2. Cấu hình GitHub SSH key + Netlify token cho user host-agent.
3. Code Host Agent (server + queue + executor + security).
4. systemd unit `host-agent.service` (env `HOST_AGENT_TOKEN`, Restart=on-failure).
5. OpenClaw side: Host Agent Client (gửi job + poll + verify + ghi Knowledge).
6. Test: `deploy` job → git push + netlify → evidence.
7. Tích hợp Telegram: "Deploy" → OpenClaw tự giao việc.

## 21. ADR

### ADR-009 — Host Agent (OpenClaw Orchestrator ↔ Ubuntu Executor)
- **Trạng thái:** ACCEPTED (directive 14:28)
- **Quyết định:** Deploy Production/Git Push/Netlify chuyển sang Host Agent trên Ubuntu Host; OpenClaw container chỉ phát triển + điều phối.
- **Lý do:** Container không có ssh/netlify/GitHub/Netlify credentials; push GitHub 403.
- **Hệ quả:** Host Agent quản lý toàn bộ credentials; OpenClaw gọi qua HTTP REST + callback; GitHub = Single Source of Truth; deploy tự động hoàn toàn.

## 22. Definition of Done

- [ ] Telegram Founder nhắn "Deploy" → OpenClaw tự giao việc cho Host Agent.
- [ ] Host Agent tự `git pull` + `git push`.
- [ ] Host Agent tự `netlify deploy --prod`.
- [ ] Host Agent trả Runtime Evidence.
- [ ] GitHub = Single Source of Truth.
- [ ] Deploy Production hoàn toàn tự động.

## 23. Knowledge Update Plan

- Ghi `docs/host-agent/OPERATIONS.md` + `docs/host-agent/LOG.md` sau mỗi job.
- ADR-009 trong `docs/decision-records/ADRs.md`.
- CHANGELOG ghi triển khai Host Agent.
- Tài liệu này + sub-files giữ làm thiết kế chuẩn.

---

## Liên quan

- `PRODUCT_RUNTIME_MIGRATION_PLAN.md` (vì deploy qua Host Agent)
- `docs/decision-records/ADRs.md`
- `CONSTITUTION.md` / `FOUNDER_DIRECTIVES.md`
