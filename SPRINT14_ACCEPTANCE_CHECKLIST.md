# SPRINT 14 — FOUNDER ACCEPTANCE CHECKLIST

**Sprint 14 is code-complete and production-deployed. It is NOT marked PASS. This checklist is what's left before you can call it done.**

Companion documents: `SPRINT14_FINAL_REPORT.md` (narrative summary), `SPRINT14_PRODUCTION_AUDIT.md` (full endpoint-by-endpoint verification), `SPRINT14_API_ARCHITECTURE_FINAL.md` (the original approved design).

---

## 1. Completed Features

- [x] **Phase 1 — Core API Foundation**: API Gateway, Auth, Permission, Validation, Rate Limit, Audit Log, Standard Response/Error, Versioning, Health API, Retry/Async Job/Webhook Framework.
- [x] **Phase 2 — Core CMS APIs**: Products, Categories, Brands (new), Tags (new), Blog, Banner, Slider, Video, Menu, Footer, SEO, Media/Storage, Settings, Users/Roles — 14 modules, full CRUD where applicable.
- [x] **Phase 3 — Founder APIs**: Draft/Publish, Queue/Jobs, Facebook Integration, Social Media Center, Logs/History/Workflows, Founder Home, One Click Marketing.
- [x] **Phase 4 — Agent APIs**: Founder Agent Plan/Execute across all 5 behavior groups, Undo/Resume/Discard, Conversation Session with server-side `pendingClarification`.
- [x] **Phase 5 — Media AI APIs**: all 9 real content-generation modules ported and exposed as REST endpoints; 3 Video/Voice/Subtitle endpoints scaffolded (honest 503, not fake success).
- [x] **Phase 6 — Self-Healing + OpenClaw Integration**: status/validate/repair for 6 modules (5 generic + Facebook), Event Bus + real Webhook Events, OpenClaw capability discovery.
- [x] **Production Readiness pass**: investigated and deployed the 4 Facebook Cloud Functions that were missing from production; ran a full 80-check endpoint audit; fixed 1 routing bug found along the way.

**68 REST endpoints under `apiGateway`, plus 4 standalone Facebook Cloud Functions and the pre-existing `openaiProxy` — 73 total, all verified live.**

---

## 2. Remaining Risks

Ranked by what would hurt most if it went wrong.

1. **`database.rules.json`/`storage.rules` production-deploy status is unconfirmed.** Last positive confirmation was Sprint 9, via Emulator testing only — nobody has verified what's actually live on the Realtime Database/Storage security rules today. This matters more now than it did before Sprint 14, because there's a much larger write-capable API surface, and it will matter even more if OpenClaw is connected. **Recommended: verify this before doing anything else on this list.**
2. **Facebook Integration is technically live end-to-end but untested with real credentials.** The 4 Cloud Functions respond correctly, but nobody has run a real OAuth connect → page select → publish → token refresh cycle since they went live. If Mock Mode is still active (no `facebookAppConfig/appId` set), this is low-risk; if a real Facebook App is configured, a real publish could go out to a real Page.
3. **Self-Healing's Repair for Facebook can refresh a real token automatically** the moment someone with an Admin token calls `POST /v1/facebook/repair` — this was deliberately scoped as "safe" (matches your explicit approval), but it's still an action that touches a live external credential.
4. **`agent` role is empty but the discovery/scaffolding for OpenClaw is fully live.** Nothing bad happens until someone actively grants an `agent`-role account and a Decision Record activates specific permissions — but the surface is there and reachable right now by anyone with the right role.

---

## 3. Infrastructure Decisions Needed From You

None of these are bugs — they're genuine build-vs-defer calls that need your sign-off, not mine, because they involve new GCP infrastructure and ongoing cost:

1. **Cloud Scheduler / Cloud Tasks for Social Media Center's scheduled publish.** Right now, `POST /v1/social-media-center/{id}/schedule` only stores the intent — nothing fires it automatically. It behaves exactly like the old client-side `setInterval` (only runs if a browser tab happens to be open), just now reachable via API too.
2. **Background worker for AI Generate.** All 9 generate endpoints run synchronously inside the HTTP request (up to 120s). This works today, but doesn't match the "return a jobId immediately, notify via webhook later" pattern the architecture doc recommends for OpenClaw's use case specifically. Webhook Events are real now (Phase 6), but they fire *after* the synchronous call already finished — genuinely async execution needs a new trigger mechanism (an RTDB-triggered Cloud Function, Cloud Tasks, or Pub/Sub).
3. **Scheduled cleanup for expired records.** `agentConversations`/`agentPlans` (30-min soft TTL) and any stale `webhookSubs` have no automatic pruning — they just accumulate in the database until someone builds a cleanup job.
4. **`role: agent` activation.** This needs its own Decision Record per the architecture doc §6.4 — a deliberate choice about what an `agent`-scoped caller (i.e., OpenClaw specifically, as opposed to a human using an admin/editor account) should be allowed to do, especially around `structural.write.*` (direct product creation/category assignment, bypassing Draft review).

---

## 4. Known Limitations

- `seo-generator`'s Draft content has no `title`/`contentHtml` — publishing an SEO-only Draft directly (now easier via the API than it was via the old UI) could blank out a real blog post's title/content if that Draft's `targetId` points at an existing post. Pre-existing behavior, not introduced this Sprint, not yet fixed.
- Rate limits are the Phase 1 defaults (60/min public, 120/min authenticated, 10/min + 100/day for AI generate) — untested under real production load.
- Media upload (`POST /v1/media/upload`) accepts base64-encoded JSON, not multipart form-data — any future client integration needs to encode files client-side first; there's no direct binary upload path through this API.
- No OpenAPI/Swagger spec has been generated yet (architecture doc §16 anticipates this for OpenClaw's benefit — not built this Sprint, wasn't in the "Implement ONLY" list for any phase so far).

---

## 5. Manual Tests Already Performed (by Claude, this session)

- Full unauthenticated `curl` sweep of all 68 `apiGateway` endpoints + 4 direct Facebook function URLs + `openaiProxy` — confirmed correct routing, auth gates, and permission gates (see `SPRINT14_PRODUCTION_AUDIT.md` §13).
- 149 local automated tests (unit + integration + end-to-end) across all 6 phases, using mocked Firebase/OpenAI/fetch — rerun after every phase and after this Production Readiness pass, zero regressions.
- Verified Self-Healing's Repair never auto-triggers: grepped the entire Cloud Functions codebase for `onSchedule`/cron/interval patterns tied to any repair function — found none.
- Verified the Facebook Cloud Function proxy chain end-to-end up to the point where a real Firebase Auth token would be needed.
- Verified `GET /v1/openclaw/capabilities` reports different, correct results for `admin`/`editor`/`agent`-role callers.

**What was NOT tested** (requires a real login, real data, or real external credentials — none of which exist in this environment):
- Any endpoint's behavior with a valid Admin or Editor Firebase Auth token.
- A real AI content-generation call actually reaching OpenAI and producing a usable Draft.
- A real Facebook OAuth connect → publish cycle.
- Real concurrent load / rate-limit behavior.

---

## 6. Recommended Founder Tests

In rough priority order:

1. **Log in to the CMS as Admin, get your Firebase ID token, and hit `GET /v1/system/diagnostics`.** Confirm it reports `overallStatus: "ok"` (or investigate if not).
2. **Create a test Product via `POST /v1/products`** with your Admin token, confirm it appears in `admin/products.html`, then delete it via the API. Confirms the CMS write path works end-to-end for real.
3. **Publish one real Draft** (any type) via `POST /v1/drafts/{id}/publish` and confirm the content actually lands where expected (e.g. a Blog post appears on the live site).
4. **Call one real AI generate endpoint** (e.g. `POST /v1/ai/faq/generate`) and confirm a usable Draft comes back with real OpenAI-generated content, not an error.
5. **If you have a Facebook App configured (not Mock Mode)**: run through `POST /v1/facebook/oauth/start` → complete the OAuth flow → `POST /v1/facebook/pages/select` → a **test** `POST /v1/facebook/publish` to confirm the full chain works with the now-deployed functions. If still in Mock Mode, skip this — nothing to test yet.
6. **Register a real webhook** (`POST /v1/webhooks` with a URL you control, e.g. a `webhook.site` test endpoint) and confirm you receive a callback when you publish a Draft or run an AI generate call.
7. **Decide on the 4 Infrastructure Decisions in §3** and the risk in §2.1 (Firebase Rules deploy status) before considering any external system (OpenClaw or otherwise) production-ready to connect.

---

**When you're satisfied, tell me explicitly to mark Sprint 14 PASS — I will not do it on my own.**
