# HOST AGENT — Operations & Log

Quy trình vận hành + nhật ký job của Host Agent. Log ghi theo timestamp (mới nhất ở trên).

## Operations (quy trình)

### Kích hoạt từ Telegram
1. Founder nhắn `Deploy` (hoặc `Push`, `Deploy production`) qua Telegram.
2. OpenClaw (Orchestrator) nhận lệnh → tạo Job spec `{ type: "deploy", ref: "feature/cms-ai-sprint2" }`.
3. OpenClaw gọi `POST /jobs` → Host Agent nhận, `status: queued`.
4. Host Agent (FIFO worker) thực thi: `git pull --ff-only` → `git push origin feature/cms-ai-sprint2` → `netlify deploy --prod --dir=.`.
5. Host Agent thu evidence (stdout/stderr/exit/Deploy URL) → `status: completed|failed`.
6. OpenClaw nhận evidence (callback/poll) → verify production (`GET product page` → Database đối chiếu → Google) → báo Founder + ghi log này.

### Yêu cầu
- GitHub SSH key + Netlify token chỉ trên host (user `host-agent`).
- Host Agent service chạy `systemctl start host-agent`.

## Job Log

| Timestamp | Type | Ref | Status | Evidence (tóm tắt) |
|---|---|---|---|---|
| *(chưa có job)* | — | — | — | — |

## Lỗi đã biết

| Lỗi | Phân loại | Retry |
|---|---|---|
| HTTP 403 GitHub (container) | Auth/Permission | Không (deploy qua Host Agent thay thế) |
| `netlify: not found` (container) | Platform | Không trong container |
