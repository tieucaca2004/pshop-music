# ARCHITECTURE DECISION RECORDS (ADR)

> Lưu trữ các quyết định kiến trúc quan trọng của dự án PSH (Pshop Music).
> Định dạng ADR tập trung ghi quyết định + lý do + hệ quả. Chỉ thêm mới, không sửa ghi đè lịch sử (đi kèm `docs/ADRs/` nếu cần).

## ADR-001 — PSH là Static SPA (Vanilla HTML/CSS/JS)

- **Trạng thái:** ACCEPTED
- **Ngày:** 2025
- **Quyết định:** Frontend là static HTML/CSS/JS thuần, không framework, không build step, deploy as-is lên Netlify.
- **Lý do:** Không cần build, cùng kiến trúc với site hiện có, `netlify.toml` `command=""` + `publish="."`.
- **Hệ quả:** `node --check` KHÔNG thuộc Release Pipeline. Mọi file admin JS được browser/server static phục vụ nguyên bản.

## ADR-002 — Firebase Backend (RTDB + Auth + Storage + Cloud Functions)

- **Trạng thái:** ACCEPTED
- **Ngày:** 2025
- **Quyết định:** Backend = Firebase Realtime Database + Auth + Storage + Cloud Functions (API Gateway).
- **Hệ quả:** API Gateway `https://us-central1-pshop-music.cloudfunctions.net/apiGateway`; RTDB `pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app`.

## ADR-003 — Business Context qua businessMembers/{uid}, không dùng custom claims khi đăng ký

- **Trạng thái:** ACCEPTED
- **Quyết định:** Tenant isolation dùng query `businessMembers/{uid}` thay vì Firebase custom claims.
- **Lý do:** Custom claims không được set khi đăng ký.

## ADR-004 — Trial Subscription khi đăng ký

- **Trạng thái:** ACCEPTED
- **Quyết định:** Gói mặc định `plan:trial` (14 ngày hết hạn) thay vì `plan:starter`.

## ADR-005 — Auth Redirect về /psh/

- **Trạng thái:** ACCEPTED
- **Quyết định:** Không đưa user vào trang admin trực tiếp; redirect về `/psh/` SPA shell.

## ADR-006 — Product SEO render phải từ Database (Runtime Migration)

- **Trạng thái:** PROPOSED (chờ Founder phê duyệt — migration chưa thực thi)
- **Ngày:** 2026-08-03
- **Quyết định:** Website Product Detail lấy dữ liệu (gồm SEO) từ API Gateway `GET /v1/products/{id}` (Database) thay vì `products-seed.js` + HTML hardcode.
- **Lý do (Runtime Evidence):** Website hiện render SEO từ HTML hardcode/`products-seed.js` không đọc Database → Database SEO không phản ánh lên Website (RELEASE VERIFICATION STEP 10 FAIL). `products-seed.js` không chứa field SEO.
- **Hệ quả:** Sau khi migration, `<title>`, meta description, canonical, og:title, og:image render từ Database. Xem `docs/product-runtime/PRODUCT_RUNTIME_MIGRATION_PLAN.md`.

## ADR-007 — Git workflow: feature/cms-ai-sprint2, commit sạch

- **Trạng thái:** ACCEPTED
- **Quyết định:** Phát triển trên nhánh `feature/cms-ai-sprint2`. Một commit sạch mỗi Sprint. Không force push, không rewrite history.
- **Hệ quả:** Remote HEAD hiện `48ceaa7`; commit local product-SEO `40b0166` + docs `1804651` chưa push (chờ deploy host).

## ADR-008 — Release Verification = State Machine chỉ Runtime

- **Trạng thái:** ACCEPTED
- **Ngày:** 2026-08-03
- **Quyết định:** Release Verification chạy như State Machine Atomic Transaction, chỉ xác minh Runtime — không retry/recover/audit/build/refactor.
- **Hệ quả:** Chỉ ghi PASS/FAIL dựa trên Runtime Evidence, dừng đúng bước FAIL.

## ADR-009 — Host Agent (OpenClaw Orchestrator ↔ Ubuntu Executor)

- **Trạng thái:** ACCEPTED (directive 14:28, 2026-08-03)
- **Quyết định:** Deploy Production / Git Push / Netlify Deploy chuyển sang **Host Agent** chạy trên Ubuntu Host; OpenClaw container chỉ phát triển + **Orchestrator** (gửi Job qua HTTP REST + callback).
- **Lý do (Runtime Evidence):** Container OpenClaw không có ssh (`exit 127`), không có Netlify CLI (`netlify: not found`), không `NETLIFY_AUTH_TOKEN`/`~/.netlify`, không `~/.ssh` key, không docker.sock; push GitHub qua PAT (HTTP) bị 403 `Permission denied to tieucaca2004`. → Không thể deploy/push trong container.
- **Thiết kế:** Node.js Host Agent service (systemd) — Job Queue (SQLite, FIFO 1 worker) — Executor allowlist (git pull/push, netlify deploy --prod, npm install/test/build, systemctl restart). Credentials (GitHub SSH, Netlify token, Docker) CHỈ nằm trên Host, không copy vào container. Chi tiết: `docs/host-agent/HOST_AGENT_ARCHITECTURE.md`, `docs/host-agent/HOST_AGENT_API.md`, `docs/host-agent/OPERATIONS.md`.
- **Hệ quả:** Deploy Production hoàn toàn tự động; GitHub = Single Source of Truth; Telegraph chỉ nói chuyện với OpenClaw (điều phối), Host Agent thực thi.

## Liên quan

- `PROJECT_ARCHITECTURE.md` / `docs/ARCHITECTURE.md`
- `docs/decision-records/` (nếu tách riêng)
- `PRODUCT_RUNTIME_MIGRATION_PLAN.md`
