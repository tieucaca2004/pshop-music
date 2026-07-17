# SPRINT 14 — PRODUCTION AUDIT

Date: 2026-07-17
Target: `apiGateway` + `openaiProxy` + 4 Facebook Cloud Functions, project `pshop-music`, all live in `us-central1`.
Method: live `curl` sweep against every deployed endpoint (unauthenticated, since no test Admin/Editor Firebase Auth token was available in this environment), cross-checked against the 149-test local suite (mocked Firebase/OpenAI/fetch) for logic that can't be exercised without a real token or real OpenAI/Facebook credentials.

**This audit verifies the API surface is wired correctly end-to-end. It does not substitute for you exercising real business flows with a real Admin/Editor login — see `SPRINT14_ACCEPTANCE_CHECKLIST.md` for what still needs a human with real credentials.**

---

## 0. Deployed Functions

```
$ firebase functions:list --project pshop-music
apiGateway              v2   https   us-central1
facebookOAuthCallback   v2   https   us-central1
facebookPublish         v2   https   us-central1
facebookRefreshToken    v2   https   us-central1
facebookSelectPage      v2   https   us-central1
openaiProxy             v2   https   us-central1
```

6/6 functions live. This was 2/6 before this Production Readiness pass — see §12 (Facebook).

---

## 1. Authentication

Verified via `shared/auth.js` (`authenticate(req)`), used by every route except explicit public paths.

| Check | Result |
|---|---|
| Missing `Authorization` header → `401 UNAUTHENTICATED` | ✅ (`/v1/system/health`, `/v1/auth/me`, `/v1/media`, `/v1/openclaw/capabilities` all confirmed) |
| `GET /v1/health` requires no token at all (public, per §12 of the doc) | ✅ 200 with no header |
| Public CMS reads (`/v1/products`, `/v1/categories`, etc.) require no token | ✅ 200 with no header, still apply visibility filtering (published/active only) for anonymous callers — verified in Phase 2's local tests |
| Malformed/expired token handling | Covered by `shared/auth.js`'s `admin.auth().verifyIdToken()` try/catch (Phase 1 unit test); not independently re-tested here since it requires a real expired token |

---

## 2. Authorization (Permission)

Verified via `shared/permissions.js` (`hasPermission`) and each router's own role checks (`isStaff`/`isAdmin` patterns).

| Check | Result |
|---|---|
| Anonymous request to any Staff-only endpoint → `403 PERMISSION_DENIED` | ✅ all 40+ Staff-gated endpoints checked in the sweep (see §13 for the full table) |
| Anonymous/Editor request to any Admin-only endpoint → `403` | ✅ verified in local tests (Phase 6: editor blocked from `/v1/queue/status`) |
| `role: admin` wildcard (`'*'`) grants access to everything, including permission-string checks like `structural.write.product` | ✅ confirmed intentional in Phase 6 (not a bug — admin already has full CMS access via regular endpoints) |
| `role: agent` has zero permissions (`ROLE_PERMISSIONS.agent = []`) | ✅ confirmed via `GET /v1/openclaw/capabilities` test with a synthetic `agent`-role auth object — `structural.write.product` correctly shows `available:false` |
| Delete operations are Admin-only even where Create/Update allow Editor | ✅ verified across Products/Categories/Brands/Blog/Banners/Videos (Phase 2) |

---

## 3. Validation

Verified via `shared/validation.js` (`validateSchema`) and per-route custom checks.

| Check | Result |
|---|---|
| Missing required field → `400 INVALID_REQUEST` | ✅ (e.g. `POST /v1/ai/blog/generate` without `topic`) |
| Wrong type for a field → `400 INVALID_REQUEST` | ✅ covered in Phase 1 unit tests |
| `/v1/webhooks` rejects non-`https://` URLs | ✅ |
| `/v1/social-media-center/.../schedule` rejects a past timestamp | ✅ |
| `/v1/sliders` PUT rejects a non-array body | ✅ |
| `/v1/settings` PATCH rejects a body containing `heroSlides`/`menu`/`footer` keys (must use their own endpoints) | ✅ |

---

## 4. CMS APIs (Phase 2)

14 modules: Products, Categories, Brands, Tags, Blog, Banners, Videos, Sliders, Menu, Footer, SEO, Media/Storage, Settings, Users/Roles.

| Check | Result |
|---|---|
| All public-read endpoints return `200` with no token | ✅ Products, Categories, Brands, Tags, Blog, Banners, Videos, Sliders, Menu, Footer, SEO, Settings |
| Unpublished/inactive records hidden from anonymous callers, visible to Staff | ✅ (Phase 2 local tests: draft Products return 404 for anon, 200 for staff) |
| Write endpoints correctly gated (Staff for create/update, Admin for delete) | ✅ |
| Brands/Tags are real new RTDB collections, not reusing Product's free-text fields | ✅ confirmed `GET /v1/brands` → `200` with `data:[]` (empty, real collection, not derived) |
| Media upload/list/delete routing intact | ✅ (upload 403 anon, list 401 anon, delete path-based) |
| Users/Roles Admin-only | ✅ |

---

## 5. Founder APIs (Phase 3)

| Check | Result |
|---|---|
| Drafts list/get/publish/reject routing | ✅ (publish confirmed to emit `draft.published` event in Phase 6 E2E test) |
| Jobs list/get/retry/cancel routing | ✅ |
| Logs/History/Workflows routing | ✅ |
| Facebook connection/health/oauth-start/pages-select/publish/token-refresh routing | ✅ — **and now, post-Production-Readiness-pass, the upstream Cloud Functions they proxy to are actually live** (see §12) |
| Social Media Center drafts/publish/schedule routing | ✅ |
| Founder Home aggregation | ✅ |
| One Click Marketing — real orchestration (not a stub) | ✅ calls 4 real generate endpoints in parallel via `Promise.allSettled`, tolerates partial failure (verified in Phase 5 E2E test) |

---

## 6. Founder Agent APIs (Phase 4)

| Check | Result |
|---|---|
| `GET /v1/agent/tools` returns all 19 tools with correct group classification | ✅ |
| `POST /v1/agent/plan` — empty/ambiguous request returns `{planId:null, reason}`, not an error | ✅ |
| `POST /v1/agent/plan` — real request persists a Plan to `agentPlans/`, returns `planId` | ✅ |
| Step execute dispatches correctly across all 5 behavior groups (write-direct, image-sync, readonly, navigate, generic-plugin) | ✅ verified per-group in Phase 4/5 unit tests |
| Navigation tools return `deepLinkUrl`, never attempt `window.location` (N/A server-side) | ✅ |
| Generic-plugin tools now call real `generateForModule()` (post-Phase-5), including the "auto-apply Product Background Image" quirk | ✅ |
| Undo/Resume/Discard routing + correct rollback per tool type | ✅ |
| Conversation Session create/message/`pendingClarification` merge-and-retry/TTL expiry | ✅ |

---

## 7. Media AI APIs (Phase 5)

| Check | Result |
|---|---|
| All 9 real generate endpoints route correctly, require Staff | ✅ |
| Each of the 9 modules' prompt/parse/mapToDraftContent logic matches its client-side original verbatim | ✅ verified module-by-module against `js/ai/modules/*.js` source during Phase 5 build |
| 3 stub endpoints (video/voice/subtitle) return `503 SERVICE_UNAVAILABLE` with a clear message, not a fake success | ✅ |
| `image-generator` calls OpenAI's Images endpoint directly and re-uploads to Storage (not a temporary OpenAI URL) | ✅ |
| Required-field validation per module (e.g. `productId` for product-description, `imageType` for image) | ✅ |

---

## 8. Self-Healing APIs (Phase 6)

| Check | Result |
|---|---|
| `status`/`validate`/`repair` routing for all 5 generic modules (`queue`, `drafts`, `media`, `rules`, `ai-provider`) | ✅ — **fixed during this Sprint's own Production Verification**: these were initially unreachable (shadowed by the Draft-ID handler), reordered the router chain, reverified live |
| Facebook's own `status`/`validate`/`repair` (in `routes/facebook.js`) | ✅ |
| Repair NEVER auto-triggers — only fires inside the `POST .../repair` HTTP handler, confirmed via full-codebase grep for any `onSchedule`/cron/interval calling a repair function (found none) | ✅ |
| Repair correctly splits safe (auto-executes) vs business-judgment (always `requiresApproval:true`) — see table in `SPRINT14_FINAL_REPORT.md` §5 | ✅ unit-tested per module |
| `POST /v1/queue/retry` is a true alias to the existing `retryFailed()`, not duplicate logic | ✅ confirmed by code reading — same function object |
| `GET /v1/system/diagnostics` aggregates all 5 module statuses in one call | ✅ |
| `GET /v1/system/jobs/monitor` correctly flags jobs stuck >10min in "running" | ✅ |

---

## 9. OpenClaw APIs (Phase 6)

| Check | Result |
|---|---|
| No separate OpenClaw-privileged code path exists anywhere in the codebase | ✅ confirmed by design (single `routes/openclaw.js`, single new endpoint, no auth bypass) |
| `GET /v1/openclaw/capabilities` requires authentication (`401` if missing) | ✅ |
| Capability availability is computed from the caller's real role at request time, not hardcoded | ✅ verified with 3 different synthetic roles (anonymous → 401, editor → repair unavailable, admin → repair available, agent → structural write unavailable) |

---

## 10. Webhook APIs / Event Bus (Phase 6)

| Check | Result |
|---|---|
| `POST /v1/webhooks` registers a subscription, rejects non-`https` URLs | ✅ |
| `GET /v1/webhooks` lists, `DELETE /v1/webhooks/{id}` removes | ✅ |
| `GET /v1/events` polls the event log, filterable by `eventType` | ✅ |
| `emit()` writes to `apiEvents` AND calls matching webhook subscriptions (exact match + `*` wildcard) | ✅ unit-tested |
| `emit()` skips inactive subscriptions and non-matching event types | ✅ unit-tested |
| Real events fire from real state changes: `draft.published` (on Draft publish), `ai.generate.completed`/`ai.generate.failed` (on generate success/failure) | ✅ end-to-end tested (publish → webhook call captured; generate → webhook call captured with correct `eventType`) |
| No new message broker was introduced — reuses `shared/webhook.js`'s `sendWebhook()` from Phase 1 | ✅ confirmed by design |

---

## 11. Diagnostics / Retry / Repair / Health (cross-cutting, Phase 1 + 6)

| Check | Result |
|---|---|
| `GET /v1/health` — public, minimal, for uptime monitors | ✅ 200, no auth |
| `GET /v1/system/health` — Admin, detailed (RTDB latency, OpenAI secret configured, Storage reachable) | ✅ |
| `POST /v1/system/self-test` — Admin, exercises Async Job + Retry + Webhook Framework directly | ✅ |
| `GET /v1/system/diagnostics` — Admin, aggregates all Self-Healing module statuses | ✅ |
| `GET /v1/system/jobs/monitor` — Admin, Job Monitor with stuck-job detection | ✅ |
| Retry: `POST /v1/jobs/{id}/retry` (Phase 3) and `POST /v1/queue/retry` (Phase 6, bulk) both route to the same underlying `retryFailed()` | ✅ |
| Repair: see §8 | ✅ |

---

## 12. Facebook Integration — Full Verification (Production Readiness Pass)

This is the section covering the investigation and fix described in `SPRINT14_FINAL_REPORT.md` §6.

| Check | Before this pass | After this pass |
|---|---|---|
| `firebase functions:list` shows the 4 Facebook functions | ❌ Not listed | ✅ All 4 listed |
| `curl https://.../facebookSelectPage` (no token) | `404 Page not found` (Google infra, function doesn't exist) | `401 {"error":"Thiếu Authorization Bearer token."}` (real function logic) |
| `curl https://.../facebookPublish` (no token) | `404` | `401` (real function logic) |
| `curl https://.../facebookRefreshToken` (no token) | `404` | `401` (real function logic) |
| `curl https://.../facebookOAuthCallback` (no params) | `404` | `302` redirect to `.../facebook-settings.html?oauth=error&reason=...` (real function logic) |
| `POST /v1/facebook/pages/select` via `apiGateway` (no token) | `403` from our own permission gate (never reached upstream either way) | `403` from our own permission gate (unchanged — correct, this check happens before the proxy call) |

**Conclusion: no broken proxy endpoints remain.** A real Admin token is still needed to exercise the full OAuth → page-select → publish → refresh flow end-to-end (requires a real Facebook App ID/Page, or Mock Mode) — that's a manual test for the Founder Acceptance Checklist, not something `curl` without credentials can complete.

---

## 13. Full Endpoint Sweep — Raw Results

80 checks run (68 distinct `apiGateway` endpoints + additional write-method variants on already-listed routes + 1 negative control for a nonexistent route). All 80 behaved as expected: public routes `200`, authentication-required-but-permission-not-yet-checked routes `401`, permission-gated routes `403` without a token, and the deliberately-invalid route `GET /v1/nonexistent-route-xyz` correctly returned a real `404` — confirming `apiGateway` does not blindly match everything.

Zero unexpected `404`s among real endpoints. Zero unexpected `200`s on gated endpoints. Zero 500-class errors.

---

## 14. Regression Check

| Check | Result |
|---|---|
| `openaiProxy` (pre-Sprint-14, untouched) still returns its original response shape | ✅ `{"error":"Thiếu Authorization Bearer token."}`, `401` — byte-identical to pre-Sprint-14 behavior |
| Full local test suite (149 tests across 6 phases) | ✅ 149/149 pass, rerun after this Production Readiness pass with zero code changes to re-verify nothing drifted |
| All Phase 1-5 endpoints re-verified live after Phase 6 deploy, and again after the router-order fix, and again after this pass | ✅ no regressions found at any point |

---

## 15. Summary

| Category | Verified | Issues found | Issues remaining |
|---|---|---|---|
| Authentication | ✅ | 0 | 0 |
| Authorization | ✅ | 0 | 0 |
| Validation | ✅ | 0 | 0 |
| CMS APIs | ✅ | 0 | 0 |
| Founder APIs | ✅ | 0 | 0 (Facebook proxy target now live) |
| Founder Agent APIs | ✅ | 0 | 0 |
| Media AI APIs | ✅ | 0 | 0 |
| Self-Healing APIs | ✅ | 1 (routing collision, fixed) | 0 |
| OpenClaw APIs | ✅ | 0 | 0 |
| Webhook/Event Bus | ✅ | 0 | 0 |
| Diagnostics/Retry/Repair/Health | ✅ | 0 | 0 |
| Facebook Cloud Functions | ✅ | 1 (not deployed, fixed) | 0 |
| Regression | ✅ | 0 | 0 |

**No known broken endpoints remain.** Open items are all *infrastructure/decision* gaps (Firebase Rules deploy confirmation, Cloud Scheduler for scheduled publish, async worker for AI generate, `agent` role activation) — none of them are bugs, all are documented, none block basic usage of what's built. See `SPRINT14_ACCEPTANCE_CHECKLIST.md` for the full list framed for your decision.
