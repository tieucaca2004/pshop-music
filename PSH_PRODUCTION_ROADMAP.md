# PSH PRODUCTION ROADMAP

**Scope:** Pshop Music only, single-tenant. Reuses existing architecture (AI Plugin Framework, API Gateway, RBAC, Draft-Before-Publish pipeline) — no duplicated logic, no redesign of what already works.
**Source:** Gaps identified in `PSH_PRODUCTION_GAP_ANALYSIS.md`. Full task/risk/dependency breakdown per phase is in `PSH_IMPLEMENTATION_PHASES.md`.
**This is a plan only.** No code, no deploy, no commit. Founder Approval required before any tier below starts.

---

## Ordering principle

Per this repo's own Constitution (#1 Business First, #10 Think Ahead. Build Later): finish and reconcile what's already half-built before starting new modules; treat net-new business-model decisions (Orders/Inventory) as a Founder decision point, not an assumed priority; keep OpenClaw activation on the phased plan it already has (`OPENCLAW_WORKFLOW.md`) rather than inventing a new one; keep multi-business strictly at "Architecture Ready" (Level 2), never "Build Now" (Level 1 in this context means Roadmap-only), per Founder's explicit instruction.

---

## Tier 0 — Consistency & Hygiene (small, unblocks everything else)

No new features. Fixes inconsistencies found during the audit that would otherwise cause confusion or real operational risk later.

1. Reconcile RBAC framework — decide whether the remaining ~25 hardcoded role-check endpoint groups migrate to `canAccess()`, or whether the framework is documented as intentionally partial.
2. Fix Facebook Page ID documentation cross-contamination in `workflows/facebook-auto-post/README.md` (currently shows A Tiểu's Page ID as the example for a Pshop Music workflow).
3. Reconcile `openapi.yaml`'s "68 endpoints" claim against the literal 63-operation count.
4. Decide disposition of untracked `fb-comment-agent/` and `restaurant-workflow/` folders (A Tiểu material sitting inside the Pshop Music repo) — move out, `.gitignore`, or explicitly accept as-is.
5. Reconcile `OPENCLAW_SETUP.md` (agent permissions documented as empty) against `AGENT_RBAC_IMPLEMENTATION_REPORT.md` (agent permissions implemented, tested, not yet deployed).

## Tier 1 — Finish What's Already Half-Built (medium value, reuses existing architecture)

1. **Job Queue V2 cutover** — `apiAsyncJobs` + `aiGenerateWorker` are code-complete but undeployed; the old browser-driven `aiJobs`/`AIJobQueue` is still what's actually running. Deploying the new worker and retiring the old path removes a real reliability gap (jobs currently depend on an open Admin browser tab).
2. **Per-Product SEO** — extend `seo-generator.js` to Product once Product has real per-item detail pages (currently grid/modal only on `category.html`). Directly continues the two manually-built product pages already in the repo instead of leaving them as one-offs.
3. **Agent role activation in User & RBAC UI** — once Tier 0 item 5 is reconciled, add `agent` as a selectable role in `admin/users.html` and allow `users.js` to provision one. This is the actual prerequisite for OpenClaw Stage B (below), not a parallel track.
4. **Telegram draft-approval notifications** — reuse the existing `notify-telegram.ps1` pattern to ping Founder when a new AI Draft is awaiting approval. Small, high day-to-day value, no new infrastructure class needed.

## Tier 2 — OpenClaw Activation (per its own existing phased plan)

`OPENCLAW_WORKFLOW.md` already defines Stages A–F with Founder sign-off gates at each step. This roadmap does not replace that plan — it sequences it after Tier 1 item 3 (agent role must be provisionable before Stage B can start):

- Stage A (infra prerequisites) — mostly satisfied already (API Gateway, OpenAPI spec, async pattern); close remaining Tier 0/1 items first.
- Stage B (first read-only connection) — trivial, reversible, Founder reviews full transcript before proceeding.
- Stage C (real usage — Marketing Agent / Draft generation via OpenClaw) — can run indefinitely on its own; Founder may choose to stop here.
- Stages D–F (dispatched code work, deployment) — explicitly **not recommended to route through OpenClaw** per the plan's own Stage F; out of scope unless Founder revisits that decision separately.

## Tier 3 — New Business-Facing Modules (larger, net-new, needs Founder decision on scope first)

These are the areas with no existing code to reuse — each needs an explicit Founder decision on whether/how before implementation planning goes further:

1. **Business Analytics** — real sales/traffic/conversion dashboard, separate from the existing AI-ops observability dashboard (which stays as-is).
2. **Landing Pages module** — net-new; no existing pattern to extend.
3. **Orders / Cart / Checkout** — **the single largest gap found.** Currently the business model is "contact to order" (phone/Messenger). Building a real order pipeline is a business-model decision, not just an engineering task — see open question in `PSH_FOUNDER_RECOMMENDATIONS.md`.
4. **Inventory (numeric stock)** — only worth building once Orders exists to consume it; on its own it's a smaller, standalone upgrade to the existing `stockStatus` flag.
5. **Media Center enhancements** (video/PDF support, duplicate detection) — smallest item in this tier, already scoped as deferred work in `ROADMAP.md`.

## Tier 4 — Multi-Business Architecture-Readiness (design only, never implementation)

Per Founder's explicit instruction: A Tiểu is not part of this phase. The only work that belongs here now:

1. When designing any Tier 3 module (Orders, Analytics, Landing Pages), write it so a `businessId`-scoping layer could be inserted later without a rewrite — e.g., don't hardcode single-tenant assumptions into new DB access functions where avoidable, mirroring the existing Decision Record's Option B direction.
2. Do not implement Option A or B from `docs/DECISION_RECORD_BUSINESS_MANAGER.md`. Leave that decision open until Founder brings A Tiểu's actual requirements.

---

## What this roadmap deliberately does NOT include

- No multi-tenant database migration.
- No implementation of A Tiểu.
- No redesign of the AI Plugin Framework, Draft-Before-Publish pipeline, or Permission Service — all reused as-is.
- No assumption that Orders/Checkout is wanted — flagged as a decision point, not scheduled as a committed phase.

---

## Addendum (Sprint 18) — Production Validation Tier

Added per Founder's Sprint 18 request for a "Production Validation" phase covering platform-scale operation, not just feature completeness.

### Tier 5 — Production Validation (runs alongside/after Tiers 0-3, not a one-time gate)

1. **Reconciliation audit** — confirm every Tier 0 item actually got fixed (not just planned) before calling any later tier "done" — matches this repo's own Definition of Done discipline (`CLAUDE.md` §9).
2. **RBAC completeness check** — re-run the endpoint-by-endpoint audit style used in `AGENT_RBAC_AUDIT.md` once Tier 0 item 1 (RBAC migration decision) is acted on, to confirm no route was missed.
3. **Deployment verification** — this repo's existing draft→verify→prod byte-diff process (`CLAUDE.md` §8) already covers per-change validation; Production Validation here means confirming that process still holds once async job processing moves server-side (Tier 1) and OpenClaw starts writing Drafts (Tier 2) — i.e., verify the *pipeline*, not just individual deploys.
4. **Security re-audit** — `SECURITY_AUDIT_REPORT.md` has 2 confirmed-not-fixed findings (permission-denial events not logged, `structuralWrite` limit unwired); revisit both once an external caller (OpenClaw) is actually live, since the original audit's risk calculus assumed no external agent existed yet.

This tier has no fixed sequencing of its own — each item runs as a checkpoint at the end of the tier it validates, not as a separate phase at the very end.
