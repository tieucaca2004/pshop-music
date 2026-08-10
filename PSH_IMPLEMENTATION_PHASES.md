> ⚠️ **STALE — lệch pha code hiện tại.** Tài liệu này snapshot trạng thái ~20/07 (single-tenant). Kiến trúc hiện tại đã multi-tenant (Sprint A.1–18). **Nguồn sự thật mới: `PROJECT_STATUS.md`** (cập nhật 2026-08-10). Xem code trước khi tái dùng nội dung doc này.

# PSH IMPLEMENTATION PHASES

Detailed breakdown of `PSH_PRODUCTION_ROADMAP.md`'s tiers into phases with Objectives / Tasks / Risks / Dependencies / Acceptance Criteria — same format this repo already uses for its own sprints (see `SPRINT14_API_ARCHITECTURE_FINAL.md`, `SPRINT15_MASTER_PLAN.md`). **Planning only — no phase below is authorized to start without separate Founder Approval per phase**, consistent with this repo's own Requirement Lifecycle (`CLAUDE.md` §3).

---

## Phase 0 — Consistency & Hygiene

**Objectives:** Remove documentation/reality mismatches found during the audit before building anything new on top of them.

**Tasks:**
- Audit and document (or migrate) the ~25 endpoint groups still using hardcoded role checks instead of `canAccess()`.
- Correct `workflows/facebook-auto-post/README.md`'s Page ID example.
- Reconcile `openapi.yaml` endpoint count claim.
- Decide and act on disposition of untracked A Tiểu folders (`fb-comment-agent/`, `restaurant-workflow/`).
- Reconcile the `agent` role permission discrepancy between `OPENCLAW_SETUP.md` and `AGENT_RBAC_IMPLEMENTATION_REPORT.md`.

**Risks:** Low technical risk. The Page ID mix-up (item 2) is the one item with real operational consequence if left unfixed — a copy-paste of the wrong ID into a live posting script would post Pshop Music content to A Tiểu's page or vice versa.

**Dependencies:** None — can start independently of everything else.

**Acceptance Criteria:** No open contradictions between code and its own documentation for the 5 items above; untracked A Tiểu files have an explicit, Founder-confirmed disposition (not just left as-is by default).

---

## Phase 1 — Finish What's Already Half-Built

**Objectives:** Close out work that is code-complete but not yet live, and small extensions of existing, working modules — no new architecture.

**Tasks:**
- Deploy `aiGenerateWorker` (Cloud-Function-triggered async job processing); retire client-driven `AIJobQueue` once verified equivalent.
- Add per-product detail pages (extending the pattern already used for the 2 manually-built product pages) and wire `seo-generator.js` to support Product.
- Reconcile agent role in RBAC (depends on Phase 0), then expose `agent` as a selectable role in `admin/users.html` and allow provisioning via `users.js`.
- Add Telegram notification on new AI Draft awaiting approval, reusing the existing `notify-telegram.ps1` integration pattern.

**Risks:** Job Queue cutover touches a live async path — needs regression testing against in-flight jobs during the switch (draft-before-publish gate must still hold). Per-product SEO/detail-page work needs to confirm it doesn't disturb the existing `category.html` grid/modal experience for products that don't get a dedicated page yet (partial rollout must degrade safely, per Constitution §5 "Không Redesign Khi Chưa Cần").

**Dependencies:** Job Queue cutover and Telegram notifications are independent of each other. Agent-role UI work depends on Phase 0's RBAC reconciliation. Per-product SEO depends on a decision about whether *all* products get individual pages or only select ones (Founder decision needed before task sizing is final).

**Acceptance Criteria:** New async worker processes real jobs in production without requiring an open Admin browser tab; existing site behavior for products without a dedicated page is unchanged; `agent` accounts can be created and used through the UI; Founder receives a Telegram ping on new Drafts.

---

## Phase 2 — OpenClaw Activation (Stages A–C only)

**Objectives:** Activate OpenClaw exactly as already planned in `OPENCLAW_WORKFLOW.md`, no new plan invented. Stop at Stage C (Marketing Agent / real Draft generation) — Stages D–F (dispatched code work, deployment) are out of scope for this roadmap.

**Tasks:**
- Confirm Stage A prerequisites are fully met (API Gateway, OpenAPI spec, async pattern — all should already be true after Phase 0/1).
- Stage B: connect one real OpenClaw session with an `agent`-role account; first task is read-only (`GET /v1/openclaw/capabilities`, `GET /v1/system/diagnostics`); Founder reviews full transcript.
- Stage C: enable Marketing Agent-category tasks (AI Content generation via OpenClaw) — still bounded by the existing Draft-before-Publish gate.

**Risks:** Primarily governance risk, not technical — the existing plan already assigns explicit checkpoints per `OPENCLAW_WORKFLOW.md` §2 (Tier 1/2/3 approval gates); the main risk is skipping a checkpoint under time pressure. No new technical risk beyond what Sprint 14/15 already introduced (API Gateway, RBAC) since OpenClaw only gets the same `agent`-role CMS API client any other agent account would get.

**Dependencies:** Phase 1's agent-role UI/provisioning work (an `agent` account must exist before Stage B can start).

**Acceptance Criteria:** A real OpenClaw session has completed Stage B's read-only task with a Founder-reviewed transcript; Founder has explicitly signed off before Stage C begins; every Draft OpenClaw generates in Stage C still requires manual Founder publish, with zero exceptions.

---

## Phase 3 — New Business-Facing Modules

**Objectives:** Build net-new modules where no existing pattern can be reused. Each sub-item below needs independent Founder scoping before implementation planning proceeds — this phase is presented as options, not a committed batch.

**3a. Business Analytics**
- Tasks: define which business metrics matter (revenue estimate, contact-CTA click-through, traffic by source/page — exact metric set needs Founder input), build a dashboard separate from the existing AI-ops observability page.
- Risks: no revenue/order data exists yet (§5 in Gap Analysis) — analytics scope is capped by what data actually exists until Orders (3c) is resolved.
- Dependencies: none for traffic/CTA-level analytics; meaningful revenue analytics depends on 3c.
- Acceptance Criteria: dashboard reflects real site data (no fabricated/estimated numbers presented as real, per Constitution §6 "Không Fake Success").

**3b. Landing Pages Module**
- Tasks: define builder scope (reuse Media Library picker + existing CMS DB patterns for consistency), admin UI, public rendering path.
- Risks: genuinely new surface area — no existing module to extend, so higher build cost than Phase 1 items.
- Dependencies: none.
- Acceptance Criteria: Founder can create/edit/publish a landing page through Admin without engineering involvement, matching the "no code required" principle already used elsewhere in the CMS.

**3c. Orders / Cart / Checkout**
- Tasks: **first requires a Founder decision** — is "contact to order" (current model) intentional, or is a real checkout wanted? Only after that: cart state, `OrderDB`, checkout flow, payment method (if any).
- Risks: highest-risk item in this entire roadmap — touches real money/real customers directly, unlike every other item here. Needs its own Decision Record before implementation, matching how this repo already handles Database Structure changes (Constitution §8).
- Dependencies: Customers (needed for order-to-buyer association), optionally Inventory (3d) for stock-aware checkout.
- Acceptance Criteria: not defined here — depends entirely on the Founder decision above.

**3d. Inventory (numeric stock)**
- Tasks: replace/extend `stockStatus` with a numeric quantity field, decide default-safe migration for existing 42+ products (must not break current in/out-of-stock display for records without the new field, per Constitution §5).
- Risks: low in isolation; only delivers real value once something (Orders, or at minimum a manual "adjust stock" admin action) actually changes the number.
- Dependencies: best sequenced with or after 3c.
- Acceptance Criteria: existing product records display exactly as before until an admin explicitly sets a quantity.

**3e. Media Center Enhancements**
- Tasks: video/PDF support, duplicate detection — already scoped as deferred items in `ROADMAP.md`.
- Risks: lowest risk item in Phase 3 — smallest, most isolated change.
- Dependencies: none.
- Acceptance Criteria: existing image-upload flows unaffected; new file types usable through the same picker UI.

---

## Phase 4 — Multi-Business Architecture-Readiness (design discipline, not a build phase)

**Objectives:** Ensure Phase 3 work doesn't accidentally make future multi-business support harder — without building multi-business now.

**Tasks:** When implementing Phase 3 modules, avoid hardcoding single-tenant assumptions into new DB access functions where it costs nothing extra today (e.g., don't bake `pshop-music` literals into new query functions if a parameter achieves the same result equally simply).

**Risks:** The real risk here is scope creep in the other direction — over-engineering Phase 3 modules "just in case" violates this repo's own Constitution §10 (Level 3, "Code Trước," explicitly rejected). This phase is a design-discipline reminder, not a task list with its own deliverables.

**Dependencies:** Phase 3.

**Acceptance Criteria:** No multi-business code exists after this phase — only easier-to-extend single-tenant code. `docs/DECISION_RECORD_BUSINESS_MANAGER.md` remains unimplemented and unapproved.

---

## Addendum (Sprint 18) — Phase Naming Map, Complexity, and Recommended Order

Sprint 18 asked for 7 named phases with explicit Scope/Estimated Complexity/Recommended Order. Rather than duplicate the Phase 0-4 breakdown above under new names, here is the mapping plus the fields Sprint 18 asked for that weren't already explicit above.

| Sprint 18 Phase Name | Maps to | Scope | Complexity | Recommended Order |
|---|---|---|---|---|
| Phase 1 — Architecture Validation | Phase 0 (Consistency & Hygiene) above | Reconcile doc/code mismatches found in this audit; no new features | S | 1st |
| Phase 2 — Production Platform Foundation | Phase 1 (Finish What's Already Half-Built) above | Deploy async worker, per-product SEO groundwork, agent-role UI, Telegram notifications | M | 2nd |
| Phase 3 — Pshop Music Production Integration | Phase 1 items specifically applied to Pshop Music's live data (per-product pages, SEO) | Same tasks as Phase 2 above, scoped to real Pshop Music catalog data | M | Runs alongside Phase 2 |
| Phase 4 — Operational Automation | Roadmap Tier 1 item 4 (Telegram) + Tier 5 addendum (validation checkpoints) | Notification/monitoring automation, not new business features | S/M | Alongside Phase 2-3 |
| Phase 5 — OpenClaw Operations | Phase 2 (OpenClaw Activation, Stages A-C) above | Connect real OpenClaw session, Marketing Agent usage | M | After Phase 2 (this doc)/agent-role work lands |
| Phase 6 — Future Multi-Business Preparation | Phase 4 (Multi-Business Architecture-Readiness) above | Design discipline only, zero multi-tenant code | XS (discipline, not a build) | Ongoing, not scheduled as a discrete milestone |
| Phase 7 — Production Validation | Roadmap Tier 5 addendum | Reconciliation/RBAC/deployment/security checkpoints | S per checkpoint | Runs at the end of each phase it validates, not once at the very end |

**Complexity scale used throughout both documents:** XS = doc/config only, no logic change · S = small, isolated, reuses existing pattern · M = real feature work, single module, existing architecture · L = new module, no existing pattern to extend · XL = touches money/real customers directly and needs its own Decision Record before sizing (Orders is the only XL item identified in this audit).
