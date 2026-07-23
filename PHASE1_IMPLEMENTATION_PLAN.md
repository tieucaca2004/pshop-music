# PHASE 1 IMPLEMENTATION PLAN — Agent RBAC Completion + OpenClaw Stage B

**This is a plan only. No code has been changed, no account created, nothing deployed to produce this document.** Presenting for approval per the explicit instruction to stop before writing any code.

**Naming note:** the last 3 messages layered "Phase 1" and "Sprint 19" framings with overlapping priorities and two different deliverable-file lists. Treating them as one effort (same 5 priorities appear in both) to avoid the file-duplication problem flagged in Sprint 18. This single plan document covers what Sprint 19's message asked to see before implementation; if approved, execution will produce `OPENCLAW_CONNECTION_REPORT.md`, `AGENT_RBAC_VERIFICATION.md`, and `SECURITY_VERIFICATION.md` as that message named — no separate "Sprint 19 Master Plan" duplicate of this file.

**Explicitly out of scope, confirmed:** Orders/Cart/Checkout, any architecture redesign, A Tiểu implementation, any write operation beyond what's listed in Test Plan, any deploy without a separate go-ahead.

---

## New finding that changes this plan's risk picture

Firebase CLI in this environment is **now authenticated** (`tieucaca2012@gmail.com`, matches this workspace's known user) with access to 3 projects, including `pshop-music` (current). This is a real change from the state recorded throughout `CHANGELOG.md`, where every deploy was blocked on missing CLI login. **Deployment is now technically possible from this session** — which raises the stakes on the deploy steps below; none will run without your separate approval, per your explicit instruction.

Also visible in that same project list: a separate Firebase project named **`atieu-order`** already exists under this account. Not investigated, not touched — flagging only because it means real A Tiểu backend infrastructure exists somewhere already, which may be relevant when A Tiểu's requirements arrive in a future phase. Out of scope here.

---

## Objectives

1. Confirm and finish the RBAC groundwork a real `agent` account needs (most of this is already committed — see Task A).
2. Provision one real `agent`-role account and verify it can authenticate.
3. Verify the live API Gateway matches the repository and responds correctly to that account, read-only.
4. Verify the Async Job system's actual live state (two systems exist in the repo — confirm which one is real in production).
5. Confirm nothing done here creates new single-tenant lock-in (design check, not a deliverable).
6. Produce a full connection transcript, then stop — no write operation runs unless separately approved after this phase.

---

## Task A — Agent RBAC (mostly already done; one real gap found)

**A1. Already complete, verified at HEAD (`a4be41c`) — no action needed:**
`functions/shared/permissions.js` already defines `agent: ['drafts.manage','ai.generate.blog','ai.generate.image','ai.generate.imagePrompt','jobs.view']`, and `functions/routes/drafts.js`, `aiGenerate.js`, `jobsLogs.js` already call `canAccess()` for it. This resolves the discrepancy flagged in `OPENCLAW_INTEGRATION_REPORT.md` between `OPENCLAW_SETUP.md` (said empty) and `AGENT_RBAC_IMPLEMENTATION_REPORT.md` (said implemented, not yet committed) — **git history confirms it's committed** (Sprint 15, `1b2a59c`). Whether it's *deployed* is a separate question — see Task C.

**A2. The one real gap — account creation blocks `agent`:**
`functions/routes/users.js:41` — `if (role !== 'admin' && role !== 'editor') return sendError(...)`. This is the single line preventing any `agent` account from being created through the API today. `admin/users.html`'s role `<select>` also has no `agent` option.

**Files to modify:**
- `functions/routes/users.js` — line 41, add `'agent'` to the allowed role check.
- `admin/users.html` — add `agent` as a role option in the create-user form.

**Risk:** Low. Additive change to a validation allow-list; doesn't touch existing admin/editor creation paths. One thing to verify during implementation: whether any other validation layer (client-side JS, Firebase Rules on `roles/{uid}`) also rejects `agent` and needs the same update — `database.rules.json` should be checked for a role-enum validation rule before considering this task complete.

---

## Task B — Provision Agent Account, Enable Authentication (Stage B)

**B1.** Create one Firebase Auth account dedicated to the agent role, using the same creation path as any other account (once Task A2 is deployed).
**B2.** Confirm `roles/{uid}` is correctly set to `role: 'agent'`.
**B3.** Document the exact auth flow OpenClaw (or whoever operates it) will use — Firebase sign-in → ID token → `Authorization: Bearer <token>` header on Gateway calls. No new mechanism; reuses existing auth exactly as-is.
**B4. Important boundary:** I can prepare the account and verify the Gateway accepts it. **I cannot myself "connect OpenClaw"** — per `OPENCLAW_WORKFLOW.md` §0, OpenClaw is a separate external runtime you (or whoever operates it) control. My deliverable is a verified, ready-to-use connection path, not a live OpenClaw session I initiate on your behalf.

**Files to modify:** none beyond Task A, unless a one-off account-provisioning helper script is wanted — will ask before adding new tooling rather than assume.

**Risk:** Medium — this creates a real credential with real API access, even if scoped read-only for now. The token will never be printed or logged in any output I produce, per this workspace's absolute rule on credentials; once created, safekeeping the credential is yours. The `agent` role's permission set technically includes write capability (`ai.generate.blog/image/imagePrompt`, `drafts.manage` covers publish/reject) — this phase's test plan (below) deliberately avoids exercising those, even though RBAC would allow it, per "no write operations unless explicitly approved."

---

## Task C — Verify API Gateway

**C1.** Confirm the live deployed Cloud Function actually reflects repo HEAD (not a stale earlier version) — check via `firebase functions:list` / a version/timestamp check, or by calling a known endpoint and comparing response shape against `openapi.yaml`.
**C2.** Call `GET /v1/health` (no auth, baseline) and `GET /v1/openclaw/capabilities` (with the new agent token) against the **live** endpoint — confirm the capabilities response correctly reflects agent-accessible routes, matching `AGENT_RBAC_AUDIT.md`'s corrected matrix.

**Files to modify:** none expected — this is verification. If a real discrepancy between deployed and repo-HEAD code is found, that becomes its own separate, smaller decision (redeploy vs. investigate why they diverged) rather than something silently folded into this task.

**Risk:** Low — read-only calls only.

---

## Task D — Verify Async Jobs

**D1.** Determine which system is actually live: the older browser-driven `AIJobQueue` (`aiJobs` node), or the newer `apiAsyncJobs` + `aiGenerateWorker` Cloud Function trigger — the latter's own code comment says "not yet deployed" as of repo HEAD; confirm whether that's still true.
**D2.** If the new worker is genuinely not deployed, "Monitor Async Jobs" as an OpenClaw capability will only ever show jobs from whichever system actually processes them — flagging this now rather than letting a passing test silently validate the wrong system.

**Files to modify:** none for verification. Deploying `aiGenerateWorker` itself is a bigger, separate decision — **recommend treating it as its own approval item**, not bundled silently into this phase, since it changes production job-processing behavior beyond RBAC/OpenClaw scope.

**Risk:** None for the verification step itself.

---

## Task E — Future Multi-Business Readiness (design check only)

**E1.** During Task A/B implementation, confirm neither change hardcodes a single-tenant assumption where a parameter would cost nothing extra (per Sprint 18's Phase 6 design-discipline principle — no multi-tenant code written, just avoid making it harder later).
**E2.** No deliverable beyond this being confirmed true in the implementation review.

---

## Files to Be Modified (complete list)

| File | Change |
|---|---|
| `functions/routes/users.js` | Line 41 — allow `role === 'agent'` on account creation |
| `admin/users.html` | Add `agent` option to the role `<select>` |
| `database.rules.json` | Check only — update if a role-enum Rule also blocks `agent` (to be confirmed during implementation, not assumed) |

No other files are expected to need code changes — Task A1, C, D, and E are verification/documentation, not code.

---

## What Requires Deployment (none run without separate approval)

1. Redeploying `apiGateway` Cloud Function (for the `users.js` change) — required before an agent account can be created via the API.
2. Optionally deploying `aiGenerateWorker` (Task D) — recommend as its own separate approval, not bundled here.
3. **No Firebase Rules deploy is needed** for this phase's scope (unless Task A2's `database.rules.json` check finds a real blocker — if so, that becomes its own explicit ask, since Rules deploys are Founder-only per `CLAUDE.md` §8 regardless of current CLI access).

---

## Risks

1. **CLI now has real deploy access** (new finding) — raises the real-world stakes of the deploy step versus the historical "blocked" assumption baked into a lot of this repo's older docs; treat the deploy step with the same care as any other production Functions deploy.
2. **Real credential creation** — token must never appear in any output; handoff/storage is your responsibility once created.
3. **Agent permissions technically allow writes** even though this phase tests read-only only — the boundary is enforced by test-plan discipline, not by the RBAC model itself (RBAC already allows more than this phase will use).
4. **Two async-job systems** — verification could give a false-positive "it works" reading from the wrong system if not scoped carefully (Task D1).
5. **Stale docs** — `OPENCLAW_SETUP.md` should be updated once this phase confirms current reality, so it stops contradicting `AGENT_RBAC_IMPLEMENTATION_REPORT.md`.

---

## Test Plan

| # | Test | Type |
|---|---|---|
| T1 | Confirm no local emulator config exists (`firebase.json` has none currently) — decide whether to test against a staging path or go straight to a verified-safe production deploy with immediate rollback readiness | Setup |
| T2 | Regression: existing admin/editor account creation still works after Task A2's change | Regression |
| T3 | Create one real agent test account; confirm `roles/{uid}` set correctly | Functional |
| T4 | `GET /v1/health` (no auth) — baseline | Read-only |
| T5 | `GET /v1/openclaw/capabilities` with agent token — confirm matches `AGENT_RBAC_AUDIT.md`'s matrix | Read-only |
| T6 | `GET /v1/jobs` with agent token — confirm read works; confirm retry/cancel correctly return 403 | Read-only + negative test |
| T7 | `GET /v1/drafts` with agent token — confirm read works | Read-only |
| T8 | Any write-capable call (e.g., generate a Draft) — **skipped by design this phase** unless separately approved as an explicit exception | Write (deferred) |
| T9 | Full regression: existing admin/editor behavior across drafts/aiGenerate/jobsLogs unchanged | Regression |
| T10 | Compile T4-T7's full request/response log into `OPENCLAW_CONNECTION_REPORT.md` | Documentation |

---

## Acceptance Criteria

- `agent` accounts can be created through the Admin UI without breaking admin/editor creation (T2, T3).
- Live Gateway confirmed to match repo HEAD for the routes this phase touches (Task C1).
- Agent token successfully completes all 4 read-only capabilities — Discover, Call Gateway, Read Drafts, Monitor Jobs — against the **live** endpoint, with a full transcript (T4-T7, T10).
- Zero write operations performed by the agent account this phase, unless you separately approve T8 as an exception.
- No Orders/Cart/Checkout, no architecture redesign, no Firebase Rules deploy.
- Existing admin/editor functionality verified unchanged (T2, T9).
- `OPENCLAW_SETUP.md` reconciled with actual verified state.
- Deliverables produced: `OPENCLAW_CONNECTION_REPORT.md`, `AGENT_RBAC_VERIFICATION.md`, `SECURITY_VERIFICATION.md`.

---

**Stopping here — waiting for Founder Approval before touching any file listed above.**
