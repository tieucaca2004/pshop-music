# SPRINT PROGRESS LOG

Nhật ký tiến độ Sprint gần nhất. Mới nhất ở trên. Xem thêm `CHANGELOG.md`.

## 2026-08-05 — Sprint WORKFLOW: WORKFLOW-04 DECISION ENGINE (đã hoàn thành)

| Công việc | Trạng thái |
|---|---|
| Mở rộng `js/ai/workflow-engine.js` thành Decision Engine (REUSE FIRST, không Engine/Queue/Worker/DB mới) | ✅ |
| Capability 1: Decision Context | ✅ VERIFY PASS |
| Capability 2: IF/ELSE (evaluateCondition/decideBranch + integrate run) | ✅ VERIFY PASS |
| Capability 3: SWITCH (runSwitch CASE/default) | ✅ VERIFY PASS |
| Capability 4: LOOP/FOREACH (runLoop/runForEach, maxIterations/break/skip) | ✅ VERIFY PASS |
| Capability 5: PARALLEL (runParallel: allSettled/concurrencyLimit/failFast/timeout/aggregate) | ✅ VERIFY PASS |
| Capability 6: WAIT EVENT (waitForEvent/resumeExecution/cancel/waitOnStep + execute/run integrate) | ✅ VERIFY PASS |
| Capability 7: POLICY EVALUATION (allow/deny/requireApproval/retryPolicy/providerPolicy) | ✅ VERIFY PASS |
| Capability 8: BRANCH RESOLUTION (resolveBranch simple/nested/default/priority/inheritance + merge) | ✅ VERIFY PASS |
| Export WorkflowEngine thêm 11 method mới | ✅ |
| Knowledge (CHANGELOG/SPRINT_PROGRESS) + commit + push | ⏳ Đang hoàn tất |
| Deploy worker (`firebase deploy --only functions:aiGenerateWorker`) | ⏳ Chờ (thuộc Ubuntu Server) |

## 2026-08-04 — Sprint WORKFLOW: WORKFLOW-03 Monitoring & Observability (đã hoàn thành)

- WORKFLOW-03 PASS: Observability dashboard trở thành trung tâm, mở rộng Workflow Runtime (`apiAsyncJobs`) — push `6b43422`. Xem `docs/workflow/WORKFLOW_03_MONITORING.md`.

## 2026-08-04 — Sprint WORKFLOW: WORKFLOW-02 Orchestration & Execution (đã hoàn thành)

- WORKFLOW-02 PASS: Workflow Engine thành Orchestrator (Start/Pause/Resume/Retry theo Step/Skip/Cancel/Continue sau restart; Execution Log + Workflow Config từ Firebase) → push `1cce503`. Xem `docs/workflow/WORKFLOW_02_ORCHESTRATION.md`.

## 2026-08-03 — Sprint WORKFLOW: WORKFLOW-01 Auto Trigger (đã hoàn thành + cleanup)

- WORKFLOW-01 PASS + cleanup (inline trigger vào `admin-products.js`, xóa module `psh-workflow-auto.js`) → push `475c4bc`, git CLEAN.

## 2026-08-03 — PRODUCT-SEO-01 / RELEASE (đã hoàn thành)

- FINAL RELEASE COMPLETE: Product SEO Runtime Migration + knowledge sync lên GitHub (`d1dd20d`).


## 2026-08-03 — PRODUCT-SEO-01 / RELEASE (đang chạy)

**Trạng thái:** RELEASE + Knowledge Sync.

| Công việc | Trạng thái |
|---|---|
| Product SEO 6 field (seoTitle/metaDescription/seoKeywords/canonical/ogImage/slug) trong admin | ✅ Code xong (commit local `40b0166`) |
| Renderer Product 41 đọc DB | ✅ Code xong |
| Build recovery `admin-products.js` về `40b0166` (giữ SEO) | ✅ Xong |
| Xác minh Release Pipeline (Netlify static, không node --check) | ✅ Xong |
| RELEASE VERIFICATION STEP 1-9 | ✅ PASS |
| RELEASE VERIFICATION STEP 10 (DB ↔ Website HTML) | ❌ FAIL (nguồn render = `products-seed.js`/hardcode, không đọc DB) |
| Runtime Trace / Root Cause / Migration Plan | ✅ Xong (đã ghi docs) |
| Product Runtime Migration (sửa renderer sang API) | ⏳ Chờ Founder phê duyệt |
| Push commits + Deploy Netlify | ⏳ Chờ (remote HEAD `48ceaa7`, code SEO chưa push) |
| Knowledge Sync lên GitHub | ✅ Tài liệu đã viết — đang commit/push |

## 2026-08-01 — Audit toàn dự án

- Đọc toàn bộ dự án, sinh `PROJECT_STATUS.md` + `PROJECT_STATUS_TOP20.md` (chưa commit).
- Git kết nối GitHub thành công (HTTPS + PAT token, credential helper store, remote origin HTTPS).

## Trước đó

- Sprint 15: Async AI Generation + Agent RBAC. Sprint 14: Founder Acceptance PASS. (chi tiết `CHANGELOG.md`)

## Liên quan

- `CHANGELOG.md` · `docs/TODO.md` · `docs/product-runtime/*` · `ROADMAP.md`
