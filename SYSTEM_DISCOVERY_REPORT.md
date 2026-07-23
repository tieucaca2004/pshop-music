# SYSTEM DISCOVERY REPORT

Read-only technical discovery of D:\PshopMusicSite as of 2026-07-20, HEAD `a4be41c`. Focus here is **what exists and how it works** — status/gaps are in `PSH_PRODUCTION_GAP_ANALYSIS.md`, this document doesn't repeat that framing.

---

## API Gateway
Single Firebase Cloud Function `apiGateway` (`functions/index.js`, 906 lines), manual path/method dispatch (not Express Router) to 14-15 route modules in `functions/routes/`: `agent.js`, `aiGenerate.js`, `cmsLists.js`, `cmsSingletons.js`, `drafts.js`, `facebook.js`, `founder.js`, `health.js`, `jobsLogs.js`, `media.js`, `openclaw.js`, `selfHealing.js`, `socialMediaCenter.js`, `users.js`, `webhooks.js`. Deployed at `https://us-central1-pshop-music.cloudfunctions.net/apiGateway`. `openaiProxy` and 4 Facebook OAuth/publish functions are separate, standalone Cloud Functions, outside the Gateway.

## OpenAPI Specification
`openapi.yaml` (32KB), OpenAPI 3.0.3. Documents Bearer Firebase ID Token auth on every endpoint except `GET /v1/health`, and an `x-required-role` extension per operation reflecting actual route-level checks "as of `AGENT_RBAC_AUDIT.md`'s matrix." Standard Response/Error envelope (`{success, data, meta}` / `{success:false, error:{code,message,details}, meta}`) applied consistently. Literal operation count: 63 (2 of ~40 path entries are parameterized templates covering 7 CMS resource types, so real surface area is larger than the literal count).

## Existing AI Modules
9 plugins in `js/ai/modules/`, all delegating shared prompt/draft-mapping logic to `js/ai/modules-core.js` (Sprint 14 refactor), registered via `AIModuleRegistry`, dispatched through `js/ai/task-router.js` (keyword/entity matching, not AI-based intent), executed via `AIJobQueue` → Provider Manager → Draft. Supporting infrastructure: `js/ai/context-builder.js` (read-only context assembly, no memory/RAG), `admin/ai/observability.html` (AI-ops health dashboard), `admin/ai/cost-tracking.html` (estimated spend), `admin/ai/plugins.html` (Plugin Manager Dashboard), `admin/ai/providers.html` (Provider config), `admin/ai/workflow.html`+`workflow-insights.html` (sequential multi-plugin runs, in-memory only, not persisted).

## Draft System
Every AI output lands in `aiDrafts` (RTDB), never writes directly to CMS data. `functions/routes/drafts.js`: list/get/publish/reject. Publish path normalizes draft-status fields before writing to real collections (per Constitution §5) — real writes only happen through `publishToTarget()` (`js/admin-ai.js`) or the Cloud-Function equivalent, gated on explicit Founder action. `admin/ai/drafts.html` is the review UI.

## Media System
`js/media-library.js` — Storage-backed (no separate DB node), recursive `listAll()`. `admin/media-library.html` browse UI. `js/media-library-picker.js` — reusable picker component embedded in Product/Blog/Banner/Slider/Category forms (replaced older per-field upload widgets, Sprint 8). Image-only; no video/PDF; no duplicate detection.

## Authentication
Firebase Authentication (client SDK + Admin SDK server-side verification of ID tokens, `functions/shared/auth.js`). Role read from RTDB `roles/{uid}` — global per-user, not scoped to any business or resource.

## RBAC
`functions/shared/permissions.js`: `ROLE_PERMISSIONS = { admin: ['*'], editor: [9 permissions], agent: ['drafts.manage','ai.generate.blog','ai.generate.image','ai.generate.imagePrompt','jobs.view'] }`. Central `canAccess(auth, permission)` helper exists but is only actually called from 3 of ~15 route files (`drafts.js`, `aiGenerate.js` partially, `jobsLogs.js` partially) plus 2 inline `/v1/system/*` checks; the rest use hardcoded `role === 'admin'/'editor'` string comparisons. `admin/users.html` — role dropdown offers only `editor`/`admin`; `users.js` rejects `role:'agent'` account creation.

## Async Jobs
Two coexisting systems: (1) legacy `js/ai/job-queue.js` (`AIJobQueue`), browser-driven, writes/reads RTDB `aiJobs`, requires an open Admin tab to process. (2) newer `functions/shared/asyncJob.js` + `aiGenerateWorker` (`functions/index.js:895`, `onValueCreated` trigger on `/apiAsyncJobs/{jobId}`) — server-side, code-complete, **not yet deployed** per its own inline comment.

## Webhook Framework
`functions/routes/webhooks.js` (admin-only): `GET/POST /v1/webhooks` (register), `DELETE /v1/webhooks/{id}`, `GET /v1/events` (poll fallback over `apiEvents`, last 200). `functions/shared/webhook.js` — HMAC-SHA256-signed outbound delivery (`X-PSH-Signature` header), best-effort POST. `functions/shared/eventBus.js` emits events (`draft.published`, `ai.generate.completed/failed`, etc.) that trigger registered webhook deliveries. No retry queue found beyond a separate `shared/retry.js` (not deep-audited).

## CMS Architecture
Flat RTDB nodes per resource (`products`, `categories`, `blogPosts`, `banners`, `siteContent`, etc.), no business-scoping field anywhere. Client-side DB layer is Promise-based, IIFE-module pattern (`const X = (function(){...})()`), consistent across `js/db.js`, `js/cms-db.js`. `DataProvider` is the single read gateway for AI plugins (no plugin calls `DB`/`BlogDB` etc. directly).

## Product System
`admin/products.html` + `js/admin-products.js`. Fields: `sku`, `name`, `price`, `oldPrice`, `stockStatus` (binary), `warranty`, `specs` (free text), `images[]`, `category`/`categoryIds[]`. Rendered on `category.html` as grid + modal (no per-product URL except 2 hand-built exceptions).

## Category System
`admin/categories.html` + `CategoryDB` (`js/cms-db.js:68`). Cover image, manual `order`-based drag-reorder. Flat, no subcategories.

## Blog System
`admin/blog.html` + `js/admin-blog.js`, `BlogDB` (`js/cms-db.js:70-80`). Quill rich text, Media Library picker for cover, slug management, draft/published gate. Public: `blog.html` (list), `blog-post.html` (detail).

## SEO System
`js/ai/modules/seo-generator.js` — targets Blog Post only (explicit in-code rationale: Product has no per-item page to attach SEO to). Site-wide technical SEO (meta tags, sitemap, structured data, Lighthouse 100/100) shipped separately in the real Sprint 16 ("SEO Foundation") — a different layer from the AI SEO plugin, covering all existing pages' baseline meta/schema, not per-product AI-generated SEO content.

## Landing Pages
No code found anywhere in the repository.

## Image Pipeline
Two distinct systems: `image-prompt-generator.js` (Sprint 6, text-only — generates a prompt string for a human to paste elsewhere, no image API call) and `image-generator.js` (Sprint 12/15, generates real images via OpenAI Images API through the existing Provider Manager — `targetCollection: null`, Founder chooses destination — Product Gallery/Featured Image/Blog Cover/Banner — after reviewing the Draft). A separate `remove_background` server-side operation was flagged in `SECURITY_AUDIT_REPORT.md` as a fixed SSRF finding (fetched an arbitrary `imageUrl` server-side without origin validation).

## Existing Admin UI
32 admin pages total: core CMS (`products`, `categories`, `banners`, `blog`, `sliders`, `videos`, `menu`, `footer`, `seo`, `settings`, `users`, `media-library`, `facebook-settings`, `social-media-center`, `home`, `login`, `index`), plus 17 pages under `admin/ai/` (assistant, agent, plugins, providers, drafts, jobs, logs, usage, cost-tracking, observability, health, images, context-builder, one-click-marketing, workflow, workflow-insights, index).

## Deployment Architecture
Static site → Netlify (site ID `48256e20-1403-4017-af01-35588713a3a0`), `netlify.toml` sets security headers (`X-Frame-Options`, HSTS, `Permissions-Policy`) and long-cache immutable headers for `/js/*`, `/css/*`, `/images/*`; `/admin*` explicitly `noindex,nofollow`. Deploy process is draft-first, byte-diff-verified against the source commit before promoting to `--prod` (`CLAUDE.md` §8) — always Founder-triggered, never automatic. Backend → Firebase: `firebase.json` wires Realtime Database rules, Storage rules, and Cloud Functions (`functions/` codebase). Firebase Rules deploys are Founder-only, never run by Claude.

## OpenClaw Integration
See `OPENCLAW_INTEGRATION_REPORT.md` for the full capability-by-capability verification. Summary: real groundwork exists (agent role skeleton, `/v1/openclaw/capabilities` discovery endpoint), but every `OPENCLAW_*.md` document is explicitly marked planning-only, and no live OpenClaw session has ever connected to this Gateway.
