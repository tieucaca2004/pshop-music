# API AUDIT INVENTORY

HEAD: `a450956`. Nguồn: đọc `functions/index.js` + `functions/routes/*.js` + `functions/shared/*.js`. Production: NOT DEPLOYED.

## Entry points (Cloud Functions)

| Function | Kiểu | File:dòng | Auth | Ghi chú |
|---|---|---|---|---|
| apiGateway | onRequest | functions/index.js:878 | theo router | ~30 router theo thứ tự; rate limit rateLimit.js (public 60/phút, auth 120/phút, AI 10/phút + 100/ngày, repair 5/giờ) |
| openaiProxy | onRequest | functions/index.js:192 | validateRequest (:79) — bất kỳ roles/<uid> | không rate limit, không kiểm module RBAC |
| facebookOAuthCallback | onRequest | functions/index.js:443 | state | |
| facebookSelectPage | onRequest | functions/index.js:525 | validateRequest | |
| facebookPublish | onRequest | functions/index.js:592 | validateRequest | không kiểm role admin/editor |
| facebookRefreshToken | onRequest | functions/index.js:657 | validateRequest | |
| aiGenerateWorker | RTDB onValueCreated apiAsyncJobs | functions/index.js:1030 | server | |

## Mô hình Auth

- **Legacy CMS** (`shared/auth.js` `authenticate()`): verify ID token → bắt buộc `roles/<uid>` (admin/editor/agent).
- **Tenant** (`verifyAuth` → `requireBusiness`/`resolveTenant` → `requireRole`): businessId ưu tiên `claims.businessId` > header `X-Business-Id` > URL > `pshop-music`; `validateBusinessAccess`: superAdmins → businesses/<bid>/users → legacy roles (pshop-music); kiểm `email_verified` + trạng thái business. Handler dùng `req.tenant.businessId`, KHÔNG dùng bid trên URL.
- Error contract gateway: `shared/response.js` (FORBIDDEN→403, BUSINESS_SUSPENDED→402, UPSTREAM_ERROR→502). `shared/middleware.js` sendError (FORBIDDEN→400) KHÔNG được gateway dùng.

## Route inventory (gateway)

| Method | Route | File | Auth | Role | Scope | Input | DB/Storage | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/v1/health` | index.js | public | — | — | — | — | none | MISSING_TEST |
| GET | `/v1/system/health` | index.js | Firebase token | legacy admin | global | — | read-only | none | PARTIAL |
| POST | `/v1/system/self-test` | index.js | Firebase token | legacy admin | global | — | read-only | none | MISSING_TEST |
| GET | `/v1/auth/me` | index.js | Firebase token | any legacy role | own uid | — | roles/<uid> | none | MISSING_TEST |
| GET | `/v1/products` | routes/products.js | public | public | pshop-music (single tenant) | path/query | RTDB products | none (gateway) | MISSING_TEST |
| POST | `/v1/products` | routes/products.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | none (gateway) | PARTIAL |
| PATCH | `/v1/products/TEST_NOPE` | routes/products.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | none (gateway) | PARTIAL |
| DELETE | `/v1/products/TEST_NOPE` | routes/products.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | none (gateway) | PARTIAL |
| GET | `/v1/blog` | routes/cmsLists.js | public | public | pshop-music (single tenant) | path/query | RTDB blog | none (gateway) | MISSING_TEST |
| GET | `/v1/banners` | routes/cmsLists.js | public | public | pshop-music (single tenant) | path/query | RTDB banners | none (gateway) | MISSING_TEST |
| GET | `/v1/categories` | routes/categories.js | public | public | pshop-music (single tenant) | path/query | RTDB categories | none (gateway) | MISSING_TEST |
| GET | `/v1/menu` | routes/cmsSingletons.js | public | public | pshop-music (single tenant) | path/query | RTDB menu | none (gateway) | MISSING_TEST |
| PATCH | `/v1/menu` | routes/cmsSingletons.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB menu | none (gateway) | PARTIAL |
| GET | `/v1/footer` | routes/cmsSingletons.js | public | public | pshop-music (single tenant) | path/query | RTDB footer | none (gateway) | MISSING_TEST |
| PATCH | `/v1/footer` | routes/cmsSingletons.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB footer | none (gateway) | PARTIAL |
| GET | `/v1/settings` | routes/cmsSingletons.js | public | public | pshop-music (single tenant) | path/query | RTDB settings | none (gateway) | MISSING_TEST |
| PATCH | `/v1/settings` | routes/cmsSingletons.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB settings | none (gateway) | PARTIAL |
| GET | `/v1/seo` | routes/cmsSingletons.js | public | public | pshop-music (single tenant) | path/query | RTDB seo | none (gateway) | MISSING_TEST |
| PATCH | `/v1/seo` | routes/cmsSingletons.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB seo | none (gateway) | PARTIAL |
| GET | `/v1/sliders` | routes/cmsSingletons.js | public | public | pshop-music (single tenant) | path/query | RTDB sliders | none (gateway) | MISSING_TEST |
| PUT | `/v1/sliders` | routes/cmsSingletons.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB sliders | none (gateway) | PARTIAL |
| GET | `/v1/media` | routes/media.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB media | none (gateway) | BUG |
| POST | `/v1/media/upload` | routes/media.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB media | none (gateway) | PARTIAL |
| DELETE | `/v1/media/TEST_NOPE` | routes/media.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB media | none (gateway) | PARTIAL |
| GET | `/v1/users` | routes/users.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB users | none (gateway) | MISSING_TEST |
| POST | `/v1/users` | routes/users.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | none (gateway) | MISSING_TEST |
| POST | `/v1/users/custom-claims` | routes/users.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | none (gateway) | MISSING_TEST |
| DELETE | `/v1/users/AUD_NOPE` | routes/users.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | none (gateway) | BUG |
| GET | `/v1/drafts` | routes/drafts.js | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB drafts | none (gateway) | PARTIAL |
| GET | `/v1/drafts/TEST_NOPE` | routes/drafts.js | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB drafts | none (gateway) | PARTIAL |
| DELETE | `/v1/drafts/TEST_NOPE` | routes/drafts.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | none (gateway) | PARTIAL |
| POST | `/v1/drafts/TEST_NOPE/publish` | routes/drafts.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | none (gateway) | DESIGN_DECISION |
| POST | `/v1/drafts/TEST_NOPE/reject` | routes/drafts.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | none (gateway) | PARTIAL |
| GET | `/v1/jobs` | routes/jobsLogs.js | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB jobs | none (gateway) | PARTIAL |
| GET | `/v1/jobs/TEST_NOPE` | routes/jobsLogs.js | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB jobs | none (gateway) | BUG |
| POST | `/v1/jobs/TEST_NOPE/retry` | routes/jobsLogs.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB jobs | none (gateway) | PARTIAL |
| POST | `/v1/jobs/TEST_NOPE/cancel` | routes/jobsLogs.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB jobs | none (gateway) | PARTIAL |
| GET | `/v1/logs` | routes/jobsLogs.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB logs | none (gateway) | PARTIAL |
| GET | `/v1/history/conversations` | routes/jobsLogs.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB history | none (gateway) | PARTIAL |
| GET | `/v1/workflows` | routes/jobsLogs.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB workflows | none (gateway) | PARTIAL |
| GET | `/v1/webhooks` | routes/webhooks.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB webhooks | none (gateway) | PARTIAL |
| POST | `/v1/webhooks` | routes/webhooks.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB webhooks | none (gateway) | PARTIAL |
| DELETE | `/v1/webhooks/TEST_NOPE` | routes/webhooks.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB webhooks | none (gateway) | PARTIAL |
| GET | `/v1/events` | routes/webhooks.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB events | none (gateway) | PARTIAL |
| POST | `/v1/events` | routes/webhooks.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB events | none (gateway) | PARTIAL |
| POST | `/v1/queue/retry` | routes/selfHealing.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB queue | none (gateway) | PARTIAL |
| GET | `/v1/system/diagnostics` | routes/selfHealing.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB system | none (gateway) | PARTIAL |
| GET | `/v1/system/jobs/monitor` | routes/selfHealing.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB system | none (gateway) | PARTIAL |
| GET | `/v1/queue/status` | routes/selfHealing.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB queue | none (gateway) | PARTIAL |
| POST | `/v1/rules/repair` | routes/selfHealing.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB rules | none (gateway) | PARTIAL |
| GET | `/v1/founder/home` | routes/founder.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB founder | none (gateway) | PARTIAL |
| POST | `/v1/ai/one-click-marketing` | routes/aiGenerate.js / founder.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | none (gateway) | PARTIAL |
| POST | `/v1/ai/blog-writer/generate` | routes/aiGenerate.js / founder.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | none (gateway) | DESIGN_DECISION |
| POST | `/v1/ai/nope/generate` | routes/aiGenerate.js / founder.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | none (gateway) | MISSING_TEST |
| GET | `/v1/agent/tools` | routes/agent.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB agent | none (gateway) | PARTIAL |
| POST | `/v1/agent/plan` | routes/agent.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB agent | none (gateway) | PARTIAL |
| POST | `/v1/agent/conversations` | routes/agent.js | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB agent | none (gateway) | PARTIAL |
| GET | `/v1/openclaw/capabilities` | routes/openclaw.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB openclaw | none (gateway) | BUG |
| GET | `/v1/social-media-center/drafts` | routes/socialMediaCenter.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB social-media-center | none (gateway) | PARTIAL |
| GET | `/v1/facebook/connection` | routes/facebook.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB facebook | none (gateway) | PARTIAL |
| GET | `/v1/facebook/status` | routes/facebook.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB facebook | none (gateway) | PARTIAL |
| POST | `/v1/facebook/publish` | routes/facebook.js | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB facebook | none (gateway) | BLOCKED |
| GET | `/v1/plans` | routes/subscriptions.js | public (GET) | — | global | — | plans | none | MISSING_TEST |
| POST | `/v1/plans` | routes/subscriptions.js | public (GET) | — | global | — | plans | none | DESIGN_DECISION |
| GET | `/v1/businesses` | routes/businesses.js | verifyAuth+requireSuperAdmin | super_admin | global | — | businesses/* | none | MISSING_TEST |
| POST | `/v1/businesses` | routes/businesses.js | verifyAuth+requireSuperAdmin | super_admin | global | JSON | businesses/* | none | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A` | routes/businesses.js | verifyAuth+requireBusiness | super_admin | businesses/<claims.bid> | path | businesses/<bid>/* | none (gateway) | DESIGN_DECISION |
| GET | `/v1/businesses/TEST_BIZ_A/profile` | routes/businesses.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/profile | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/profile` | routes/businesses.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/profile | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/products` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/products` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/products/p1` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | none (gateway) | MISSING_TEST |
| DELETE | `/v1/businesses/TEST_BIZ_A/products/TEST_NOPE` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1/media` | routes/products.js / productMedia.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/categories` | routes/categories.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/categories | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/inventory` | routes/inventory.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/inventory | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/customers` | routes/customers.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/customers | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/customers` | routes/customers.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/customers | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/orders` | routes/orders.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/orders | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/orders` | routes/orders.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/orders | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/payments` | routes/payments.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/payments | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/reports/sales` | routes/reports.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/reports | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/subscription` | routes/subscriptions.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/subscription | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/billing` | routes/subscriptions.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/billing | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/notifications` | routes/notifications.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/notifications | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/audit-logs` | routes/auditLogs.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/audit-logs | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/api-keys` | routes/apiKeys.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/api-keys | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/api-keys` | routes/apiKeys.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/api-keys | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/transactions` | routes/transactions.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/transactions | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/invoices` | routes/transactions.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/invoices | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/team` | routes/team.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/team | none (gateway) | BUG |
| POST | `/v1/businesses/TEST_BIZ_A/team/invite` | routes/team.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/team/AUD_T_A_VIEWER` | routes/team.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | none (gateway) | MISSING_TEST |
| DELETE | `/v1/businesses/TEST_BIZ_A/team/AUD_NOPE` | routes/team.js | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/cms/pages` | routes/tenantCms.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/cms | none (gateway) | BUG |
| POST | `/v1/businesses/TEST_BIZ_A/cms/pages` | routes/tenantCms.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/cms | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/settings/general` | routes/tenantSettings.js | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/settings | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/settings/general` | routes/tenantSettings.js | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/settings | none (gateway) | MISSING_TEST |
| POST | `/v1/register` | routes/registration.js | public / token (verify-email) | — | self | JSON | users, businesses, claims | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| POST | `/v1/register/verify-email` | routes/registration.js | public / token (verify-email) | — | self | JSON | users, businesses, claims | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| POST | `/v1/register/resend-verification` | routes/registration.js | public / token (verify-email) | — | self | JSON | users, businesses, claims | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| GET | `/v1/nope` | routes/index.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB nope | none (gateway) | MISSING_TEST |
| GET | `/nov1` | routes/index.js | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB  | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/:bid/payments/callback/:provider` | routes/* | verifyAuth+requireBusiness | (không có requireRole) | claims.bid | {transactionId,status} | transactions, orders.paymentStatus | none | BUG |
| POST | `/v1/businesses/:bid/team/invite` | routes/* | business_admin | business_admin | claims.bid | {email,role} | Auth user, businesses/<bid>/users, claims | none | BUG |
| POST | `/v1/ai/:type/generate` | routes/* | authenticate() | admin/editor; agent: blog,image,image-prompt | pshop-music | {input, async?} | apiAsyncJobs, aiDrafts | none | BUG |
| POST | `openaiProxy (standalone)` | functions/index.js | validateRequest (bất kỳ roles/<uid>) | bất kỳ role (kể cả agent) | — | {action,...} | OpenAI (ngoài) | none | BUG |
| POST | `facebookPublish (standalone)` | functions/index.js | validateRequest | bất kỳ role (kể cả agent) | — | {message,...} | Facebook Graph (ngoài) | none | BUG |
| GET | `facebookOAuthCallback (standalone)` | functions/index.js | state param | — | — | query code,state | facebookConnection | none | MISSING_TEST |
| POST | `facebookSelectPage / facebookRefreshToken` | routes/* | validateRequest | bất kỳ role (standalone); gateway: admin | — | JSON | facebookConnection | none | PARTIAL |
| trigger | `aiGenerateWorker (onValueCreated apiAsyncJobs)` | functions/index.js | — (server) | — | — | job record | apiAsyncJobs, aiDrafts | tests/workflow-worker.test.js | PASS* |

Ghi chú: route tenant liệt kê bằng business mẫu `TEST_BIZ_A` (= `:bid`). Mỗi router còn có biến thể GET/:id, PATCH, DELETE tương tự (cùng middleware) — hành vi đã quan sát ở các đại diện trên.
