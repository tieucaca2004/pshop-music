# PSH PRODUCTION ARCHITECTURE

> **Architecture Decisions — FOUNDER APPROVED (2026-07-26):**
> - Database Structure: **businesses/{businessId}/...** namespace
> - Data Provider: **Explicit businessId** parameter everywhere
> - Authentication: **businessMembers/{businessId}/{uid}**, roles/{uid} legacy


Target-state architecture for PSH Platform as a Business Operating Platform — current business (Pshop Music) live, future businesses (A Tiểu, others) accommodated by design without being implemented. This is a design document; nothing here is built by writing this file.

---

## 1. Current Architecture (as verified, not aspirational)

```
Client (Admin Browser / Public Site)
        │
        ▼
Netlify (static site: pshopmusic.com + /admin)
        │  (Admin calls out to)
        ▼
Firebase
 ├── apiGateway (Cloud Function) ── functions/routes/*.js (14-15 modules)
 │        │
 │        ├── Auth (Firebase Auth + roles/{uid}, global per-user)
 │        ├── RBAC (permissions.js — admin/editor/agent, partially enforced)
 │        ├── AI Plugin Framework (Queue → Provider → Draft, Draft-gated publish)
 │        ├── Async Jobs (2 coexisting systems — see Discovery Report)
 │        └── Webhook Framework (admin-registered subscriptions, HMAC delivery)
 │
 ├── Realtime Database (flat nodes: products, categories, blogPosts, aiJobs,
 │        apiAsyncJobs, aiDrafts, roles, webhookSubs, apiEvents, ...)
 │        — no business-scoping field anywhere
 │
 ├── Storage (media, no separate DB node — recursive listAll())
 │
 └── openaiProxy + 4 Facebook Cloud Functions (standalone, outside apiGateway)
```

This is a **single-tenant** system at every layer — Database, Deployment (1 Firebase project, 1 Netlify site), Auth (`roles/{uid}` global), and Static Site (branding hardcoded in HTML). This matches exactly what `docs/DECISION_RECORD_BUSINESS_MANAGER.md` already found during its own audit — nothing new here, restated for this document's completeness.

---

## 2. What Makes a Service "Shared-Ready" vs. "Business-Specific" (the real distinction this platform needs)

Not every component needs the same treatment. The gap analysis addendum already scored each service; this section explains *why* each score is what it is, since that reasoning is what should guide every future build decision, not just a table.

**Shared-ready (reusable across businesses with no redesign):**
- **API Gateway routing/auth/validation layer** — the *mechanism* of "verify a token, check a permission, validate a body, return a standard envelope" has zero Pshop-Music-specific assumptions. What's business-specific is the *data* each route touches, not the route-handling machinery itself.
- **AI Plugin Framework** — `PluginManager.loadPlugin(id).execute()` → `AIJobQueue` → Provider → Draft doesn't know or care what business a plugin's output is for. A plugin's *prompt template* is business-specific; the *framework executing it* is not.
- **Media System** — a Storage bucket with a picker UI has no inherent business coupling.
- **Draft-Before-Publish gate** — a universal safety mechanism, not a Pshop-Music policy.

**Shared in shape, not yet in practice (needs a scoping dimension added, not a rewrite):**
- **Auth/RBAC** — the 3-role *model* is reusable, but `roles/{uid}` today means "this user's role, period" — there's no way to express "editor at Pshop Music, no access at A Tiểu." This is a real gap, but it's additive (add a scoping dimension), not a redesign of the role model itself.
- **Async Jobs / Webhooks** — same shape argument: the *mechanism* generalizes, the *storage nodes* (`apiAsyncJobs`, `webhookSubs`) don't currently carry a business identifier.

**Business-specific today (the layer that would actually need new work for a second business):**
- **CMS data layer** — `products`, `categories`, `blogPosts` etc. are flat RTDB nodes with zero tenant isolation. This is the layer `DECISION_RECORD_BUSINESS_MANAGER.md` already designed two options for (flat `businessId` field vs. `businesses/{businessId}/...` namespace), and it's the one piece of real engineering multi-business would require. Everything above it (AI, Gateway, Media) rides on top of this layer without itself needing to change much.

**Conclusion:** the platform is closer to "configuration, not redesign" for a future business than the current single-tenant framing suggests — *if* the CMS data layer question gets resolved first. Every other shared service either already generalizes or needs a small scoping addition, not a rewrite.

---

## 3. Target Architecture — Business Operating Platform (design only, not implemented)

```
                         ┌─────────────────────────────┐
                         │   Shared PSH Platform Core    │
                         │  (unchanged from Section 1,   │
                         │   minus the CMS data layer)   │
                         │                                │
                         │  API Gateway · Auth · RBAC     │
                         │  AI Plugin Framework · Media   │
                         │  Async Jobs · Webhooks         │
                         │  OpenClaw (agent-role client)  │
                         └───────────────┬────────────────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     ▼                                       ▼
        ┌─────────────────────────┐              ┌─────────────────────────┐
        │   Business: Pshop Music  │              │   Business: A Tiểu       │
        │   (live today)           │              │   (future, deferred)     │
        │                          │              │                          │
        │  businesses/pshop-music/ │              │  businesses/a-tieu/      │
        │    products/             │              │    products/ (or menu/) │
        │    categories/           │              │    categories/           │
        │    blogPosts/            │              │    blogPosts/            │
        │    ...                   │              │    ...                   │
        └─────────────────────────┘              └─────────────────────────┘
```

This mirrors `DECISION_RECORD_BUSINESS_MANAGER.md`'s **Option B** (namespace isolation), which that document already recommends over Option A (flat `businessId` field) for exactly the isolation-safety reason repeated here: Option B removes the entire class of bug where a missing/wrong filter leaks one business's data into another's query. This report does not re-decide that choice — it's still Founder's to make, and still unimplemented.

**What "configuration, not architectural redesign" means concretely, per this design:**
- Adding a business = adding a new `businesses/{businessId}/` subtree + a Business Context value the client/Gateway resolves per-request (per `DECISION_RECORD_BUSINESS_MANAGER.md`'s Decision #2 options) + role records gaining a business dimension.
- It does **not** mean touching `PluginManager`, `AIJobQueue`, the Draft pipeline, or route-handling logic in `apiGateway` — those stay exactly as they are, per Founder's explicit "reuse existing architecture" rule.

---

## 4. Extension Points (where future work plugs in without redesign, if Section 3's direction is later approved)

| Extension Point | What it enables | Where it plugs in |
|---|---|---|
| Business Context resolution | Knowing "which business" for any given request | A new, small layer between Auth and every DB call — does not touch the DB call sites themselves if done as a wrapper |
| `businesses/{businessId}/...` namespace | Data isolation | Replaces flat node names in `js/db.js`/`js/cms-db.js` — the only place with real touch-count |
| Role-per-business | "Editor at Pshop Music, none at A Tiểu" | Extends `roles/{uid}` shape, does not change the 3-role permission *model* |
| OpenClaw agent scope | An agent account already carries a role; extending it to carry a business scope is additive | `functions/shared/permissions.js` gains a business dimension, `canAccess()` signature grows one parameter |

None of these are implemented by this document. They are documented as the seams this architecture already has, should Founder approve Section 3 in a future sprint with A Tiểu's real requirements in hand.

---

## 5. What this document deliberately does not do

- Does not choose Option A vs. B from the Decision Record.
- Does not add a `businessId` field or `businesses/` namespace to any real data.
- Does not change `js/db.js`, `js/cms-db.js`, or any route file.
- Does not assume A Tiểu's data model (a restaurant menu is not a DJ-equipment catalog — `products`/`categories` naming above is illustrative, not a commitment to reusing those exact node names for a fundamentally different business type).
