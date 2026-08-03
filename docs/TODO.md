# TODO / BACKLOG — Pshop Music / PSH Platform

Ưu tiên hiện tại theo Founder directive. Chỉ triển khai khi Founder duyệt.

## CURRENT (P0) — Product SEO + Runtime Migration

- [ ] `PENDING-1` — Product Runtime Migration (Website Product Detail đọc từ Database qua API thay vì `products-seed.js` + HTML hardcode). Trạng thái: PLAN đã lập (`docs/product-runtime/PRODUCT_RUNTIME_MIGRATION_PLAN.md`), chờ Founder phê duyệt. Gồm: render `<title>`, meta description, canonical, og:title, og:image, display fields từ `GET /v1/products/{id}`.
- [ ] `PENDING-2` — Đạt RELEASE VERIFICATION STEP 10 (Database ↔ Website Runtime HTML khớp cho Product 41).
- [ ] `PENDING-3` — RELEASE VERIFICATION STEP 11 (Google SEO nhìn thấy title/meta/canonical/og mới).

## SPRINT/RELEASE chưa hoàn tất

- [ ] Push commits local `40b0166` (product SEO code) + `1804651` (docs) lên remote — remote HEAD `48ceaa7`, code SEO chưa trên GitHub (chờ deploy host / token).
- [ ] Deploy Netlify (Netlify credit đã sẵn sàng) → production.
- [ ] `aiGenerateWorker` chưa deploy (index.js `aiGenerateWorker` CHƯA deploy theo PROJECT_STATUS).

## Kiến trúc / Debt (không triển khai khi chưa duyệt)

- [ ] `docs/cms/` module riêng (CMS Architecture) — gộp từ `docs/ARCHITECTURE.md`.
- [ ] `docs/workflow/` module riêng (Workflow Engine) — gộp từ `AI_RULES.md` + `js/ai/workflow-engine.js`.
- [ ] `docs/automation/` module riêng (Automation Architecture).
- [ ] File Constitution tổng + Founder Directives tổng.
- [ ] Review dead/orphan modules (js/ai/services, content-engine, kimi.js, coding-router, video-generator — theo PROJECT_STATUS).
