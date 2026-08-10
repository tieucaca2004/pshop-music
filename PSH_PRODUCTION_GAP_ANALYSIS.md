> ⚠️ **STALE — lệch pha code hiện tại.** Tài liệu này snapshot trạng thái ~20/07 (single-tenant). Kiến trúc hiện tại đã multi-tenant (Sprint A.1–18). **Nguồn sự thật mới: `PROJECT_STATUS.md`** (cập nhật 2026-08-10). Xem code trước khi tái dùng nội dung doc này.

# PSH PRODUCTION GAP ANALYSIS

**Scope:** Pshop Music only. Single-tenant. No multi-business implementation in this document.
**Method:** Read-only repository audit (git log, source files, existing `.md` docs) as of 2026-07-20, HEAD `a4be41c` on `feature/cms-ai-sprint2`. No code changed to produce this document.
**Companion docs:** `PSH_PRODUCTION_ROADMAP.md`, `PSH_IMPLEMENTATION_PHASES.md`, `PSH_FOUNDER_RECOMMENDATIONS.md`.

---

## Status legend

- **EXISTS** — built, wired in, in production use.
- **PARTIAL** — built but incomplete, or built twice (old + new) with the old path still live.
- **PLANNING-ONLY** — design docs exist, zero runtime code active.
- **MISSING** — no evidence found anywhere in the repository.

---

## 1. Business Management — **MISSING** (by design, not oversight)

`docs/DECISION_RECORD_BUSINESS_MANAGER.md` proposes two options (flat `businessId` field vs. `businesses/{businessId}/...` namespace) but is explicitly marked **"CHỜ PHÊ DUYỆT" (awaiting approval)** — no code implements either. `CHANGELOG.md:565` confirms no "A Tiểu" business record was ever created, not even as placeholder. This matches Founder's instruction: multi-business is out of scope for this phase. Listed here only so the gap is on record.

## 2. Product Management — **EXISTS**, no variants, no numeric stock

`js/db.js` (RTDB CRUD on `products`) + `admin/products.html` + `js/admin-products.js`. Fields: `sku`, `name`, `price`, `oldPrice`, `stockStatus` (binary in/out-of-stock dropdown), `warranty`, `specs` (free-text), `images[]`, `category`/`categoryIds[]`. No variant model (size/color/SKU combinations). `specs` is an unstructured string, not queryable fields.

## 3. Category Management — **EXISTS**, flat only

`admin/categories.html` + `CategoryDB` (`js/cms-db.js:68`). Cover image, manual drag-reorder. No subcategory/hierarchy nesting.

## 4. Inventory — **MISSING**

Only `stockStatus` (binary flag) exists. No numeric quantity, no decrement-on-sale logic, no low-stock threshold/alerting, no warehouse/location concept. Moot without Orders (§5) — nothing currently decrements stock anyway.

## 5. Orders — **MISSING** (catalog-only site today)

No `OrderDB`, no cart, no checkout flow anywhere in the codebase. Current model: `category.html` shows product grid/modal with a "Liên hệ đặt hàng" (contact to order) CTA linking to phone/Messenger — customers call or message to buy. **This is a business-model question, not just an engineering gap** — see `PSH_FOUNDER_RECOMMENDATIONS.md` §Orders before scoping any build.

## 6. Customers — **MISSING**

No `CustomerDB` or customer entity anywhere. "Khách hàng" appears only as narrative text in docs, never as data.

## 7. Media Center — **EXISTS** (Sprint 8), image-only

`js/media-library.js` (Storage-backed, no separate DB node) + `admin/media-library.html` + reusable `js/media-library-picker.js` wired into Product/Blog/Banner/Slider/Category forms. Documented-as-deferred gaps (`ROADMAP.md:230-231`): no video/PDF support, no duplicate detection.

## 8. AI Content — **EXISTS**, solid, Draft-only

9 plugins (`js/ai/modules/*.js`: blog-writer, product-description-writer, seo-generator, facebook-post-generator, banner-generator, image-generator, image-prompt-generator, faq-generator, slider-generator), all delegating to shared `modules-core.js`, all gated to Draft — none auto-publish, matching the Constitution's Draft-Before-Publish rule. No gaps found in this area beyond SEO scope (§9).

## 9. AI SEO — **PARTIAL** (Blog only, not Product)

`seo-generator.js:10` explicitly targets Blog Post only — comment states Product has no dedicated detail page to attach SEO to. `category.html` still shows products only in grid/modal, not individual URLs. Two real per-product SEO pages exist (`product-lexar-p30-128gb.html`, `product-sol-republic-v10.html`) with matching manual audit docs — these are **one-off hand-built pages**, not output of a repeatable system. **Note:** the real Sprint 16 ("SEO Foundation") addressed site-wide meta/sitemap/schema — it did not close this specific per-product SEO gap, which remains open.

## 10. Blog — **EXISTS**, complete

`admin/blog.html` + `js/admin-blog.js`, Quill rich text, Media Library picker, slug management, draft/published gating; public `blog.html`/`blog-post.html` render published-only.

## 11. Landing Pages — **MISSING**

Zero references anywhere in the repository. No builder, no module, no concept.

## 12. Analytics — **PARTIAL** (AI-ops telemetry only, zero business analytics)

`admin/ai/observability.html` (AI provider/queue/job/draft health) and `js/ai/cost-tracking.js` (estimated AI spend from a hardcoded per-call price constant, explicitly documented as an estimate, not real billing). No revenue, conversion, traffic, or sales metrics exist anywhere — a search for these terms returns nothing.

## 13. User & RBAC — **PARTIAL**, framework and UI out of sync

Backend: `functions/shared/permissions.js` defines 3 roles (`admin: ['*']`, `editor: [...]`, `agent: [drafts.manage, ai.generate.blog, ai.generate.image, ai.generate.imagePrompt, jobs.view]`), enforced via `canAccess()`. **But `canAccess()` is only actually wired into 3 of ~15 route files** — the remaining ~25 endpoint groups still use hardcoded `role === 'admin'/'editor'` string checks, bypassing the framework. `admin/users.html`'s role dropdown only offers `editor`/`admin` — no `agent` option — and `functions/routes/users.js` rejects `role:'agent'` on account creation outright, so no agent account can be provisioned through the UI today even though the permission model for one exists.

## 14. API Gateway — **EXISTS**, one open documentation discrepancy

Single `apiGateway` Cloud Function, 14-15 route modules under `functions/routes/`, `openapi.yaml` spec. The spec's own text cites "all 68 apiGateway endpoints" (from `SPRINT15_TASK_BREAKDOWN.md`) but a literal count of `get/post/put/patch/delete` operations in the spec is 63 across ~40 path entries (2 of which are parameterized templates covering 7 CMS resource types). The 63 vs. 68 gap was not reconciled during this audit — **flagged as a documentation-accuracy item**, not a functional gap.

## 15. OpenClaw Integration — **PLANNING-ONLY**

Every `OPENCLAW_*.md` document carries an explicit banner: *"PLANNING/DOCUMENTATION ONLY... not an active one... no OpenClaw connection exists yet."* Real, live groundwork: the `agent` role and `/v1/openclaw/capabilities` discovery endpoint exist in the API Gateway (Sprint 14/15). But:
- `OPENCLAW_SETUP.md` states the `agent` role's permission list is currently empty in the documented baseline, while `AGENT_RBAC_IMPLEMENTATION_REPORT.md` describes drafts/blog/image/jobs.view as implemented with 280/280 tests passing but **not yet committed or deployed** as of that report — these two documents haven't been reconciled with each other or with current `main`.
- No live OpenClaw runtime session has ever connected to this Gateway (`OPENCLAW_CONNECTION_TEST_PLAN.md` frames this as not-yet-attempted).
- The latest commit, "Add Facebook Auto Post - native OpenClaw workflow," is in fact a manually-triggered Node.js CLI script (`node publish.js --message "..."`) calling the Graph API directly — **not executed by any OpenClaw runtime**. The "OpenClaw" naming here is aspirational/branding, not functional.

## 16. Telegram Operations — **MISSING** for business ops, exists only for infra alerting

`health-center/notify-telegram.ps1` sends health-monitor alerts via the Telegram Bot API — this is the only real Telegram code in the repo. Founder's personal Telegram/OpenClaw interface is explicitly documented (`OPENCLAW_CONNECTION_TEST_PLAN.md:58`) as **external to this repository**. No customer-facing bot, no order/draft-approval notifications, no business workflow uses Telegram today. (A separate Make.com Messenger/Telegram chatbot scenario exists entirely outside this repo — different system, not audited here.)

## 17. Future Multi-Business Readiness — **PLANNING-ONLY**, plus a hygiene finding

Decision Record recommends Option B (`businesses/{businessId}/...` namespace) as the long-term-correct choice but is unapproved and unimplemented — consistent with Founder's instruction to leave this alone for now.

**Hygiene finding, not a gap:** two **untracked** folders already sit inside this repo — `fb-comment-agent/` and `restaurant-workflow/` — built for a real second business, *"Hủ Tiếu Xào A. Tiểu"* (a noodle restaurant, confirmed via `restaurant-workflow/menu.json` and `fb-comment-agent/knowledge/restaurant-info.json`, Facebook Page ID `109215528208008`). Separately, `workflows/facebook-auto-post/publish.js` (tracked, meant for Pshop Music) hardcodes Page ID `232999590676675`, but its own `README.md` documents Page ID `109215528208008` — **A Tiểu's page ID** — as the example, suggesting doc cross-contamination between the two businesses. Since Founder confirmed A Tiểu is not part of this phase, see `PSH_FOUNDER_RECOMMENDATIONS.md` for a proposed cleanup (not executed here — no files were moved or deleted).

---

## Summary Table

| Area | Status |
|---|---|
| Business Management | MISSING (by design) |
| Product Management | EXISTS — no variants/numeric stock |
| Category Management | EXISTS — flat only |
| Inventory | MISSING |
| Orders | MISSING |
| Customers | MISSING |
| Media Center | EXISTS — image-only |
| AI Content | EXISTS |
| AI SEO | PARTIAL — Blog only |
| Blog | EXISTS |
| Landing Pages | MISSING |
| Analytics | PARTIAL — AI-ops only |
| User & RBAC | PARTIAL — framework/UI out of sync |
| API Gateway | EXISTS — 1 doc discrepancy |
| OpenClaw Integration | PLANNING-ONLY |
| Telegram Operations | MISSING (business) / EXISTS (infra alerts) |
| Future Multi-Business | PLANNING-ONLY + hygiene finding |

---

## Addendum (Sprint 18) — Platform-Wide / Shared-Services Lens

Added per Founder's Sprint 18 request to view the same gaps through a "what's reusable for future businesses" lens, on top of the Pshop-Music-only analysis above. No new gaps found beyond what's listed already — this section re-groups existing findings by reusability, it does not introduce new findings.

| Shared Service | Status | Reusable as-is for a future business? |
|---|---|---|
| API Gateway (`apiGateway` Cloud Function, `openapi.yaml`) | EXISTS | Yes, structurally — but every route currently assumes single-tenant data (no `businessId` scoping anywhere). Routing/auth/validation layer is reusable; data-access calls inside each route are not, until Tier 4 design discipline (see Roadmap) is applied when new routes are added. |
| AI Plugin Framework (Queue → Provider → Draft) | EXISTS | Yes — `PluginManager`/`AIJobQueue`/Provider interface have no Pshop-Music-specific assumptions baked in; each plugin's *prompt content* is business-specific, the *framework* is not. |
| Media System | EXISTS | Yes — Storage-backed, no schema coupling to a specific business beyond the Storage bucket path itself. |
| Authentication | EXISTS | Partially — Firebase Auth itself is reusable; `roles/{uid}` is global per-user, not scoped per business, which is exactly the gap `DECISION_RECORD_BUSINESS_MANAGER.md` already identifies (a user with a role today has that role platform-wide, not "role at Pshop Music only"). |
| RBAC / Permission Service | PARTIAL | The 3-role model (`admin`/`editor`/`agent`) is reusable in shape, but same caveat as Auth — no business dimension yet, and only partially enforced (§13 above). |
| Async Jobs / Webhook Framework | PARTIAL/EXISTS | Reusable in shape; both currently write to global RTDB nodes (`apiAsyncJobs`, `webhookSubs`, `apiEvents`) with no business-scoping field. |
| OpenClaw Integration | PLANNING-ONLY | Deferred until this exists — see `OPENCLAW_INTEGRATION_REPORT.md`. |
| CMS data layer (Product/Category/Blog/Banner/Slider DBs) | EXISTS | **Not reusable as-is** — this is the one layer that's genuinely Pshop-Music-specific today (flat RTDB nodes, no `businessId`), matching exactly what `DECISION_RECORD_BUSINESS_MANAGER.md` already flagged. This is the real work multi-business would require, not the services above it. |

**Conclusion:** the platform's *service* layer (Gateway, AI, Media, Auth shape, RBAC shape, Jobs, Webhooks) is already close to reusable. The *data* layer is the one place true multi-tenant work is needed, and that work is deliberately not being done in this phase per Founder's instruction.
