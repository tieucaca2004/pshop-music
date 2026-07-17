# SPRINT 14 — FINAL REPORT

**Status: AWAITING FOUNDER ACCEPTANCE TEST — NOT YET MARKED PASS.**

Date: 2026-07-17
Branch: `feature/cms-ai-sprint2` (all commits pushed, none merged to `main`)
Scope covered: Phase 1 → Phase 6, per `SPRINT14_API_ARCHITECTURE_FINAL.md`

---

## 1. Executive Summary

Sprint 14 built a complete REST API layer (`apiGateway`, one Cloud Function, `/v1/...`) in front of the existing PSH Platform CMS — 68 endpoints across CMS content, Founder workflows, the Founder Agent, AI content generation, Self-Healing diagnostics, and an OpenClaw discovery surface. All 6 phases are code-complete, tested, committed, pushed, and deployed to production.

**One finding requires your decision before this is truly done end-to-end**: the 4 pre-existing Facebook Cloud Functions (`facebookOAuthCallback`, `facebookSelectPage`, `facebookPublish`, `facebookRefreshToken`) that Phase 3/6's Facebook routes proxy to are **not currently deployed to production** — only `apiGateway` and `openaiProxy` exist live (confirmed via `firebase functions:list`). See §5, Critical Finding #1.

Two other things worth knowing before you test:
- Phase 6 (OpenClaw Integration) was built in the same Sprint the API was written, ahead of the architecture doc's own recommended "run stably 1 full Sprint first" migration guidance. This was your explicit, deliberate instruction — flagged for the record in §7, not a mistake.
- No live OpenClaw agent has been connected to anything. Everything below was verified with `curl` and Node-based mocked tests, not a real OpenClaw session.

---

## 2. What Was Built, By Phase

| Phase | Scope | Status |
|---|---|---|
| 1 | Core API Foundation — Gateway, Auth, Permission, Validation, Rate Limit, Audit Log, Standard Response/Error, Versioning, Health, Retry/Async Job/Webhook Framework | ✅ Done |
| 2 | Core CMS APIs — Products, Categories, Brands (new), Tags (new), Blog, Banner, Slider, Video, Menu, Footer, SEO, Media/Storage, Settings, Users/Roles | ✅ Done |
| 3 | Founder APIs — Draft/Publish, Queue/Jobs, Facebook Integration (proxy), Social Media Center, Logs/History/Workflows, Founder Home, One Click Marketing | ✅ Done (Facebook proxy target not deployed — see §5) |
| 4 | Agent APIs — Founder Agent Plan/Execute (5 behavior groups), Undo/Resume/Discard, Conversation Session | ✅ Done |
| 5 | Media AI APIs — 9 real generate endpoints, 3 Video/Voice/Subtitle stubs, wired the Phase 3/4 stubs for real | ✅ Done |
| 6 | Self-Healing API + OpenClaw Integration — status/validate/repair, Event Bus/Webhooks, `/v1/openclaw/capabilities` | ✅ Done |

Everything in the doc's own module-20 phase plan is now built. There is no Phase 7 queued — this report is the end-of-Sprint checkpoint.

---

## 3. Complete API Inventory (68 endpoints, all verified live)

Verified by an unauthenticated `curl` sweep against every endpoint immediately after the final deploy — confirms each route resolves to its handler (no `404`s) and enforces the correct auth/permission gate. Endpoints that legitimately allow public reads return `200`; everything else correctly returns `401`/`403` without a token.

### Phase 1 — Foundation
| Endpoint | Auth |
|---|---|
| `GET /v1/health` | Public |
| `GET /v1/system/health` | Admin |
| `POST /v1/system/self-test` | Admin |
| `GET /v1/auth/me` | Authenticated |

### Phase 2 — Core CMS
| Endpoint | Auth |
|---|---|
| `GET/POST /v1/products`, `PATCH/DELETE /v1/products/{id}` | Public read / Staff write / Admin delete |
| `GET/POST /v1/categories`, `PATCH/DELETE /v1/categories/{id}` | same pattern |
| `GET/POST /v1/brands`, `PATCH/DELETE /v1/brands/{id}` | same pattern |
| `GET/POST /v1/tags`, `DELETE /v1/tags/{id}` (no PATCH) | same pattern |
| `GET/POST /v1/blog`, `PATCH/DELETE /v1/blog/{id}` | same pattern |
| `GET/POST /v1/banners`, `PATCH/DELETE /v1/banners/{id}` | same pattern |
| `GET/POST /v1/videos`, `PATCH/DELETE /v1/videos/{id}` | same pattern |
| `GET/PUT /v1/sliders` | Public read / Staff write |
| `GET/PATCH /v1/menu`, `/v1/footer` | Public read / Admin write |
| `GET/PATCH /v1/seo`, `/v1/settings` | Public read / Admin write |
| `POST /v1/media/upload`, `GET /v1/media`, `DELETE /v1/media/{path}` | Staff / Authenticated / Admin |
| `GET/POST /v1/users`, `DELETE /v1/users/{uid}`, `GET/PATCH /v1/roles/{uid}` | Admin |

### Phase 3 — Founder APIs
| Endpoint | Auth |
|---|---|
| `GET /v1/drafts`, `GET /v1/drafts/{id}`, `POST /v1/drafts/{id}/publish`\|`/reject` | Staff |
| `GET /v1/jobs`, `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/retry`\|`/cancel` | Staff |
| `GET /v1/logs`, `GET /v1/history/conversations`, `GET /v1/workflows` | Staff |
| `GET /v1/facebook/connection`\|`/health`, `POST /v1/facebook/oauth/start`\|`/pages/select`\|`/publish`\|`/token/refresh` | Admin (publish: Staff) |
| `GET /v1/social-media-center/drafts`, `POST .../{id}/publish`\|`/schedule` | Staff |
| `GET /v1/founder/home` | Staff |
| `POST /v1/ai/one-click-marketing` | Staff |

### Phase 4 — Agent APIs
| Endpoint | Auth |
|---|---|
| `GET /v1/agent/tools` | Staff |
| `POST /v1/agent/plan`, `GET /v1/agent/plan/{id}`, `POST .../steps/{i}/execute`\|`/undo`\|`/resume`\|`/discard` | Staff |
| `POST /v1/agent/conversations`, `GET /v1/agent/conversations/{id}`, `POST .../messages` | Staff |

### Phase 5 — Media AI
| Endpoint | Auth |
|---|---|
| `POST /v1/ai/{blog\|product-description\|seo\|facebook-post\|banner\|image\|image-prompt\|slider\|faq}/generate` (9) | Staff |
| `POST /v1/ai/{video\|voice\|subtitle}/generate` (3, stub → 503) | Staff |

### Phase 6 — Self-Healing + OpenClaw
| Endpoint | Auth |
|---|---|
| `GET /v1/{queue\|drafts\|media\|rules\|ai-provider}/status` (5) | Admin |
| `POST /v1/{same 5}/validate` | Admin |
| `POST /v1/{same 5}/repair` | Admin |
| `GET/POST/DELETE /v1/facebook/status`\|`/validate`\|`/repair` | Admin |
| `POST /v1/queue/retry` | Admin |
| `GET /v1/system/diagnostics`, `GET /v1/system/jobs/monitor` | Admin |
| `GET/POST /v1/webhooks`, `DELETE /v1/webhooks/{id}`, `GET /v1/events` | Admin |
| `GET /v1/openclaw/capabilities` | Any authenticated caller (reports their own real permissions) |

**Result: 68/68 endpoints route correctly.** One routing bug was found and fixed during this audit (see §6).

---

## 4. OpenClaw Integration — Verification

Per the architecture doc §19's own principle, **there is no separate "OpenClaw API."** OpenClaw authenticates and calls through the exact same `apiGateway`, the same Auth/Permission/Rate-Limit pipeline, as any human-driven CMS session. Verified:

- `GET /v1/openclaw/capabilities` returns a real, role-computed capability manifest — not a static list. Confirmed by test: querying as `role:"admin"` shows Repair as available; querying as `role:"agent"` shows it unavailable, and shows `structural.write.product` (direct-write via Founder Agent) as unavailable for `agent` too.
- **`role: "agent"` is still empty** (`ROLE_PERMISSIONS.agent = []`, unchanged since Phase 1) — no Decision Record has activated it. This means: if OpenClaw is given an `agent`-role account today, it can do essentially nothing privileged. To actually operate (create/update products, run Founder Agent tools, generate AI content), OpenClaw would need to authenticate as `admin` or `editor` — a real human-equivalent account — until a separate Decision Record activates and scopes the `agent` role.
- **No special Firebase access exists anywhere in the OpenClaw path.** Every OpenClaw capability goes through the identical `apiGateway` HTTP surface used by the Founder's own CMS pages.
- **`create-product`/`detect-category` (direct-write Founder Agent tools) remain closed by default** — gated behind `structural.write.*`, which no role currently holds.

**No live OpenClaw agent was connected during this Sprint.** This section verifies the *integration surface is correct*, not that a real OpenClaw session has been exercised end-to-end against production.

---

## 5. Self-Healing — Verification

**Principle confirmed before writing any code** (asked directly, since your Phase 6 instruction's "automatic Self-Healing" phrasing could have been read two ways): Repair still requires **one explicit API call every time** — no scheduled job, no background trigger, ever calls repair on its own. This matches `SPRINT14_API_ARCHITECTURE_FINAL.md` §13's "No Self-Auto-Fix" principle, inherited from the Cowork Constitution.

**Verified split between auto-executing (safe) and approval-required (business-judgment) repairs:**

| Module | Auto-executes on call | Always requires approval |
|---|---|---|
| Queue | Release stale Job locks (>5min TTL); reset Jobs stuck "running" >10min back to "queued" | — |
| Media | Delete expired Facebook OAuth state nonces (>15min unused) | — |
| Facebook | Refresh a token expiring within 3 days (via the existing `facebookRefreshToken` proxy) | Connecting for the first time (never connected) |
| Drafts | — | Any Draft with an invalid `targetCollection` — never auto-modified |
| Rules | — | Always — Claude never deploys `database.rules.json`/`storage.rules` |
| AI Provider | — | Always — Claude never sets `OPENAI_API_KEY` |

Verified with real unit tests (not just permission checks) that each repair path does exactly what the table says — e.g., the Draft repair test asserts a corrupted Draft is left completely untouched and a proposal is returned instead.

**Not built** (outside this Sprint's "Implement ONLY" list, flagged in ROADMAP): a real background worker that watches for problems continuously. Detection today happens when someone calls `GET /v1/system/diagnostics` or `/status`/`/validate` — not via polling or triggers.

---

## 6. Critical Finding — Facebook Cloud Functions Not Deployed

**Discovered during this audit, not previously known.** Running `firebase functions:list --project pshop-music` shows only 2 functions live in production:

```
apiGateway   v2   https   us-central1
openaiProxy  v2   https   us-central1
```

`facebookOAuthCallback`, `facebookSelectPage`, `facebookPublish`, and `facebookRefreshToken` all exist correctly in `functions/index.js` (confirmed via source `grep`) but **are not deployed** — direct `curl` requests to their URLs return HTTP 404 from Google's infrastructure, not from our code.

**Practical impact**: `routes/facebook.js`'s proxy endpoints (`POST /v1/facebook/pages/select`, `/publish`, `/token/refresh`) and Phase 6's `POST /v1/facebook/repair` (which calls the refresh-token proxy when a token is expiring) will all correctly pass the Auth/Permission gate, then fail with `UPSTREAM_ERROR` once they actually try to reach the upstream function — because it isn't there. This was not caught earlier because every prior Production Verification pass tested these routes *without* a valid token, which fails at the permission check before ever reaching the proxy call.

**This gap predates Sprint 14** — it isn't something Phase 3 or Phase 6 broke; the underlying functions were apparently never deployed (or were removed at some point) independent of this session's work.

**I have not deployed these functions.** Deploying 4 new live Cloud Functions that handle real Facebook OAuth and can publish to a real Facebook Page is a more consequential action than what you asked me to deploy this turn (`apiGateway` updates for what I built). If you'd like me to deploy them, say so and I will — it's a one-line `firebase deploy --only functions:facebookOAuthCallback,functions:facebookSelectPage,functions:facebookPublish,functions:facebookRefreshToken`.

---

## 7. Deliberate Deviation From the Architecture Doc — For the Record

`SPRINT14_API_ARCHITECTURE_FINAL.md` §22 (Migration Plan) recommends: *"OpenClaw tích hợp SAU CÙNG... sau khi Founder Web CMS đã chạy ổn định 100% qua API mới ÍT NHẤT 1 SPRINT ĐẦY ĐỦ, không cho OpenClaw làm 'người dùng đầu tiên' của bất kỳ API nào."* (OpenClaw integrates last, only after the Founder's own CMS usage has proven the API stable for at least one full Sprint — OpenClaw should never be the first real user of any endpoint.)

Phase 6 (which includes OpenClaw Integration) was built in the *same* Sprint the API itself was written — no intervening stability period. This was your explicit, deliberate instruction, with your own compensating safeguards spelled out in the mission text itself (no direct Firebase access, safe-operations-only self-healing, approval-gated business decisions). Recorded here for the audit trail, not raised as an objection — but worth knowing that **building the API surface is not the same as it having survived real-world usage.** No actual production traffic (from the Founder's own CMS pages or otherwise) has exercised most of these 68 endpoints yet outside of my own test/verification calls.

---

## 8. Testing Summary

| Layer | Count | Result |
|---|---|---|
| Unit tests (pure logic, mocked Firebase) | ~90 across 6 phases | All pass |
| Integration tests (routing + permission dispatch) | ~45 across 6 phases | All pass |
| End-to-end tests (multi-step: e.g. publish→webhook, generate→event) | 3 (Phase 6) + several implicit in earlier phases | All pass |
| **Total local test suite** | **149** | **149/149 pass** |
| Regression (all prior phases rerun after each new phase) | Cumulative | No unresolved regressions |
| Production Verification (live `curl` sweep, post-deploy) | 68 endpoints | 68/68 route correctly |

One real bug was caught and fixed **during this Phase's Production Verification** (not by the local test suite, which can't catch this class of issue): the Self-Healing routes for the `drafts` module (`/v1/drafts/status`\|`/validate`\|`/repair`) were being silently intercepted by the pre-existing Phase 3 `/v1/drafts/{id}` handler, since it was checked earlier in the router chain and matches any path under `/v1/drafts/`. Fixed by reordering the router chain; verified live post-fix that both the Self-Healing routes and real Draft-ID lookups now work correctly side by side.

---

## 9. All Open Items (Consolidated From Every Phase's ROADMAP Notes)

1. **`database.rules.json`/`storage.rules` deployment status to Production is still unconfirmed** (flagged since Sprint 9) — matters more now that Phase 6 has opened a path toward external (OpenClaw) API usage.
2. **Facebook Cloud Functions not deployed** — see §6, new finding this Phase.
3. **Social Media Center's `schedule` only stores intent** — no Cloud Scheduler/Cloud Tasks trigger exists to fire it automatically.
4. **Founder Agent Conversation Session TTL is soft** — checked only when an API call happens, no scheduled cleanup of expired `agentConversations`/`agentPlans` records.
5. **AI Generate runs synchronously** (up to the 120s Cloud Function timeout) — no true background worker (Cloud Tasks/Pub-Sub) exists yet, despite Webhook Events now being real for other event types.
6. **`seo-generator`'s Draft content lacks `title`/`contentHtml`** — publishing an SEO-only Draft directly could blank out a real blog post's title/content (pre-existing behavior, not introduced this Sprint).
7. **Role `agent` remains empty** — no Decision Record has activated any `structural.write.*` permission for it. This is the actual gate limiting what OpenClaw can do today, by design.

Items 3, 4, and 5 share a common theme: each would benefit from real background/scheduled execution, which needs new GCP infrastructure (Cloud Tasks, Cloud Scheduler, or Pub/Sub) — a cost/complexity decision I've deliberately not made unilaterally in any phase.

---

## 10. Founder Acceptance Test — Suggested Checklist

- [ ] Read §6 (Facebook functions not deployed) and decide whether to deploy them now.
- [ ] Confirm `database.rules.json`/`storage.rules` deployment status (§9.1) before any real external API consumer (OpenClaw or otherwise) is pointed at write endpoints.
- [ ] Spot-check a few endpoints yourself with a real Admin/Editor token (Products CRUD, a Draft publish, one AI generate call, `GET /v1/system/diagnostics`).
- [ ] Decide whether `role: agent` should be activated now, later, or not without a dedicated Decision Record (§9.7) — this determines what OpenClaw can actually do if connected.
- [ ] Confirm you're comfortable with Phase 6 having been built without the doc's recommended 1-Sprint stability gap (§7) before actually connecting a live OpenClaw agent.

---

**Stopping here, as instructed. Sprint 14 is not marked PASS. Waiting for your Acceptance Test.**
