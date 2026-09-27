# API AUDIT MATRIX

HEAD audit: `a450956` (prompt ghi 5ceccf1 — HEAD thực tế mới hơn). Production: NOT DEPLOYED.

Nguồn: chạy runtime thật `exports.apiGateway` trên Firebase Emulator, 13 caller (ANON, BADTOKEN, NOROLE, L_AGENT, L_EDITOR, L_ADMIN, T_A_VIEWER/EDITOR/ADMIN, T_A_NOCLAIM, T_UNVERIFIED, T_B_ADMIN, SUPER). Cột 401/403/404/409/5xx = "yes" nếu mã đó QUAN SÁT được ở ít nhất 1 caller. Status "PASS" trong tài liệu này chỉ là kết quả kỹ thuật của audit, không phải Founder PASS.

| Method | Route | Auth | Role | Tenant Scope | Input | DB/Storage | Success | 401 | 403 | 404 | 409 | 5xx | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/v1/health` | public | — | — | — | — | 200 | — | — | — | — | — | none | MISSING_TEST |
| GET | `/v1/system/health` | Firebase token | legacy admin | global | — | read-only | — | yes | yes | — | — | yes | none | PARTIAL |
| POST | `/v1/system/self-test` | Firebase token | legacy admin | global | — | read-only | 200 | yes | yes | — | — | — | none | MISSING_TEST |
| GET | `/v1/auth/me` | Firebase token | any legacy role | own uid | — | roles/<uid> | 200 | yes | yes | — | — | — | none | MISSING_TEST |
| GET | `/v1/products` | public | public | pshop-music (single tenant) | path/query | RTDB products | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/products` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | 201 | — | yes | — | — | — | none (gateway) | PARTIAL |
| PATCH | `/v1/products/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| DELETE | `/v1/products/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB products | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| GET | `/v1/blog` | public | public | pshop-music (single tenant) | path/query | RTDB blog | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/banners` | public | public | pshop-music (single tenant) | path/query | RTDB banners | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/categories` | public | public | pshop-music (single tenant) | path/query | RTDB categories | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/menu` | public | public | pshop-music (single tenant) | path/query | RTDB menu | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/menu` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB menu | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/footer` | public | public | pshop-music (single tenant) | path/query | RTDB footer | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/footer` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB footer | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/settings` | public | public | pshop-music (single tenant) | path/query | RTDB settings | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/settings` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB settings | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/seo` | public | public | pshop-music (single tenant) | path/query | RTDB seo | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/seo` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB seo | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/sliders` | public | public | pshop-music (single tenant) | path/query | RTDB sliders | 200 | — | — | — | — | — | none (gateway) | MISSING_TEST |
| PUT | `/v1/sliders` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB sliders | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/media` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB media | 200 | yes | — | — | — | — | none (gateway) | BUG |
| POST | `/v1/media/upload` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB media | — | — | yes | — | — | — | none (gateway) | PARTIAL |
| DELETE | `/v1/media/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB media | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| GET | `/v1/users` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB users | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/users` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/users/custom-claims` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| DELETE | `/v1/users/AUD_NOPE` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB users | 200 | yes | yes | — | — | — | none (gateway) | BUG |
| GET | `/v1/drafts` | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB drafts | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/drafts/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB drafts | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| DELETE | `/v1/drafts/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| POST | `/v1/drafts/TEST_NOPE/publish` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | — | — | yes | yes | — | — | none (gateway) | DESIGN_DECISION |
| POST | `/v1/drafts/TEST_NOPE/reject` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB drafts | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| GET | `/v1/jobs` | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB jobs | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/jobs/TEST_NOPE` | authenticate() (roles/<uid>) | admin/editor/agent (view) | pshop-music (single tenant) | path/query | RTDB jobs | — | — | yes | yes | — | — | none (gateway) | BUG |
| POST | `/v1/jobs/TEST_NOPE/retry` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB jobs | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| POST | `/v1/jobs/TEST_NOPE/cancel` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB jobs | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| GET | `/v1/logs` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB logs | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/history/conversations` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB history | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/workflows` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB workflows | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/webhooks` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB webhooks | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/webhooks` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB webhooks | — | — | yes | — | — | — | none (gateway) | PARTIAL |
| DELETE | `/v1/webhooks/TEST_NOPE` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB webhooks | — | — | yes | yes | — | — | none (gateway) | PARTIAL |
| GET | `/v1/events` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB events | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/events` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB events | — | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/queue/retry` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB queue | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/system/diagnostics` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB system | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/system/jobs/monitor` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB system | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/queue/status` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB queue | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/rules/repair` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB rules | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/founder/home` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB founder | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/ai/one-click-marketing` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | — | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/ai/blog-writer/generate` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | — | — | — | yes | — | — | none (gateway) | DESIGN_DECISION |
| POST | `/v1/ai/nope/generate` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB ai | — | — | — | yes | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/agent/tools` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | path/query | RTDB agent | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/agent/plan` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB agent | — | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/agent/conversations` | authenticate() (roles/<uid>) | legacy admin | pshop-music (single tenant) | JSON | RTDB agent | 201 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/openclaw/capabilities` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB openclaw | 200 | yes | — | — | — | — | none (gateway) | BUG |
| GET | `/v1/social-media-center/drafts` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB social-media-center | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/facebook/connection` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB facebook | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| GET | `/v1/facebook/status` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB facebook | 200 | — | yes | — | — | — | none (gateway) | PARTIAL |
| POST | `/v1/facebook/publish` | authenticate() (roles/<uid>) | admin/editor | pshop-music (single tenant) | JSON | RTDB facebook | — | — | yes | — | — | — | none (gateway) | BLOCKED |
| GET | `/v1/plans` | public (GET) | — | global | — | plans | 200 | — | — | — | — | — | none | MISSING_TEST |
| POST | `/v1/plans` | public (GET) | — | global | — | plans | — | — | — | yes | — | — | none | DESIGN_DECISION |
| GET | `/v1/businesses` | verifyAuth+requireSuperAdmin | super_admin | global | — | businesses/* | 200 | yes | yes | — | — | — | none | MISSING_TEST |
| POST | `/v1/businesses` | verifyAuth+requireSuperAdmin | super_admin | global | JSON | businesses/* | — | yes | yes | — | — | — | none | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A` | verifyAuth+requireBusiness | super_admin | businesses/<claims.bid> | path | businesses/<bid>/* | 200 | yes | yes | — | — | — | none (gateway) | DESIGN_DECISION |
| GET | `/v1/businesses/TEST_BIZ_A/profile` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/profile | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/profile` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/profile | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/products` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/products` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | — | yes | yes | — | — | — | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/products/p1` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| DELETE | `/v1/businesses/TEST_BIZ_A/products/TEST_NOPE` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/products | — | yes | yes | yes | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1/media` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/products | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/categories` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/categories | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/inventory` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/inventory | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/customers` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/customers | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/customers` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/customers | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/orders` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/orders | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/orders` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/orders | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/payments` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/payments | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/reports/sales` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/reports | — | yes | yes | yes | — | — | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/subscription` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/subscription | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/billing` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/billing | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/notifications` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/notifications | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/audit-logs` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/audit-logs | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/api-keys` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/api-keys | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/TEST_BIZ_A/api-keys` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/api-keys | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/transactions` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/transactions | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/invoices` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/invoices | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/team` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | path | businesses/<bid>/team | 200 | yes | yes | — | — | yes | none (gateway) | BUG |
| POST | `/v1/businesses/TEST_BIZ_A/team/invite` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | — | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/team/AUD_T_A_VIEWER` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | — | yes | yes | yes | — | — | none (gateway) | MISSING_TEST |
| DELETE | `/v1/businesses/TEST_BIZ_A/team/AUD_NOPE` | verifyAuth+requireBusiness | business_admin | businesses/<claims.bid> | JSON body | businesses/<bid>/team | — | yes | yes | yes | — | — | none (gateway) | MISSING_TEST |
| GET | `/v1/businesses/TEST_BIZ_A/cms/pages` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/cms | — | yes | yes | yes | — | — | none (gateway) | BUG |
| POST | `/v1/businesses/TEST_BIZ_A/cms/pages` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/cms | — | yes | yes | yes | — | — | none (gateway) | BUG |
| GET | `/v1/businesses/TEST_BIZ_A/settings/general` | verifyAuth+requireBusiness | business_viewer+ | businesses/<claims.bid> | path | businesses/<bid>/settings | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/settings/general` | verifyAuth+requireBusiness | business_editor+ | businesses/<claims.bid> | JSON body | businesses/<bid>/settings | 200 | yes | yes | — | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/register` | public / token (verify-email) | — | self | JSON | users, businesses, claims | — | — | — | — | — | — | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| POST | `/v1/register/verify-email` | public / token (verify-email) | — | self | JSON | users, businesses, claims | — | yes | yes | — | — | — | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| POST | `/v1/register/resend-verification` | public / token (verify-email) | — | self | JSON | users, businesses, claims | — | — | — | — | — | — | registration-security.test.js (WEAK: no gateway) | MISSING_TEST |
| GET | `/v1/nope` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB nope | — | — | — | yes | — | — | none (gateway) | MISSING_TEST |
| GET | `/nov1` | authenticate() (roles/<uid>) | admin/editor/agent | pshop-music (single tenant) | path/query | RTDB  | — | — | — | yes | — | — | none (gateway) | MISSING_TEST |
| POST | `/v1/businesses/:bid/payments/callback/:provider` | verifyAuth+requireBusiness | (không có requireRole) | claims.bid | {transactionId,status} | transactions, orders.paymentStatus | 200 | yes | yes | yes | — | — | none | BUG |
| POST | `/v1/businesses/:bid/team/invite` | business_admin | business_admin | claims.bid | {email,role} | Auth user, businesses/<bid>/users, claims | 201 | yes | yes | — | yes | — | none | BUG |
| POST | `/v1/ai/:type/generate` | authenticate() | admin/editor; agent: blog,image,image-prompt | pshop-music | {input, async?} | apiAsyncJobs, aiDrafts | 200/202 | yes | yes | yes | — | yes | none | BUG |
| POST | `openaiProxy (standalone)` | validateRequest (bất kỳ roles/<uid>) | bất kỳ role (kể cả agent) | — | {action,...} | OpenAI (ngoài) | 200 | yes | yes | — | — | yes | none | BUG |
| POST | `facebookPublish (standalone)` | validateRequest | bất kỳ role (kể cả agent) | — | {message,...} | Facebook Graph (ngoài) | 200 | yes | yes | — | — | yes | none | BUG |
| GET | `facebookOAuthCallback (standalone)` | state param | — | — | query code,state | facebookConnection | 302/200 | — | — | — | — | yes | none | MISSING_TEST |
| POST | `facebookSelectPage / facebookRefreshToken` | validateRequest | bất kỳ role (standalone); gateway: admin | — | JSON | facebookConnection | 200 | yes | yes | — | — | yes | none | PARTIAL |
| trigger | `aiGenerateWorker (onValueCreated apiAsyncJobs)` | — (server) | — | — | job record | apiAsyncJobs, aiDrafts | — | — | — | — | — | — | tests/workflow-worker.test.js | PASS* |

## Ghi chú theo route

- `GET /v1/health` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/system/health` — **PARTIAL** — admin → 503 trong emulator (health phụ thuộc dịch vụ ngoài); RBAC đúng
- `POST /v1/system/self-test` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/auth/me` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/products` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/products` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `PATCH /v1/products/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `DELETE /v1/products/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/blog` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/banners` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/categories` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/menu` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PATCH /v1/menu` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/footer` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PATCH /v1/footer` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/settings` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PATCH /v1/settings` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/seo` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PATCH /v1/seo` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/sliders` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PUT /v1/sliders` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/media` — **BUG** — ERR-2: user đã xác thực nhưng không có role → 401 (phải 403)
- `POST /v1/media/upload` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `DELETE /v1/media/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/users` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/users` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/users/custom-claims` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `DELETE /v1/users/AUD_NOPE` — **BUG** — USR-1: uid không tồn tại → 200 thay vì 404
- `GET /v1/drafts` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/drafts/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `DELETE /v1/drafts/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/drafts/TEST_NOPE/publish` — **DESIGN_DECISION** — AGT-1: agent được publish draft → blogPosts thật (drafts.manage) — Founder quyết định
- `POST /v1/drafts/TEST_NOPE/reject` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/jobs` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/jobs/TEST_NOPE` — **BUG** — JOB-1: agent đọc được mọi apiAsyncJobs theo id (lộ uid, webhookUrl)
- `POST /v1/jobs/TEST_NOPE/retry` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/jobs/TEST_NOPE/cancel` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/logs` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/history/conversations` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/workflows` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/webhooks` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/webhooks` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `DELETE /v1/webhooks/TEST_NOPE` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/events` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/events` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/queue/retry` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/system/diagnostics` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/system/jobs/monitor` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/queue/status` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/rules/repair` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/founder/home` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/ai/one-click-marketing` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/ai/blog-writer/generate` — **DESIGN_DECISION** — Path sai của probe; path đúng /v1/ai/blog/generate (đã test ở p2: AI-1..4)
- `POST /v1/ai/nope/generate` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/agent/tools` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/agent/plan` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/agent/conversations` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/openclaw/capabilities` — **BUG** — ERR-2 (như trên)
- `GET /v1/social-media-center/drafts` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/facebook/connection` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `GET /v1/facebook/status` — **PARTIAL** — ERR-1: anonymous → 403 (phải 401); RBAC theo role đúng
- `POST /v1/facebook/publish` — **BLOCKED** — Proxy tới URL Production hardcode (FUNCTIONS_BASE) — không test được trong emulator; check canPublish PASS (anon→403 đúng message)
- `GET /v1/plans` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/plans` — **DESIGN_DECISION** — Không có route POST — 404 hợp lệ
- `GET /v1/businesses` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/businesses` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A` — **DESIGN_DECISION** — business_admin không đọc được record business gốc (chỉ /profile) — theo thiết kế
- `GET /v1/businesses/TEST_BIZ_A/profile` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `PATCH /v1/businesses/TEST_BIZ_A/profile` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/products` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `POST /v1/businesses/TEST_BIZ_A/products` — **BUG** — VAL-1/2/3: nhận name 200KB, name toàn khoảng trắng, price âm, price:"abc" (201)
- `GET /v1/businesses/TEST_BIZ_A/products/p1` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `PATCH /v1/businesses/TEST_BIZ_A/products/p1` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `DELETE /v1/businesses/TEST_BIZ_A/products/TEST_NOPE` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/products/p1/media` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/categories` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/inventory` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/customers` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `POST /v1/businesses/TEST_BIZ_A/customers` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/orders` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `POST /v1/businesses/TEST_BIZ_A/orders` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/payments` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/reports/sales` — **BUG** — ERR-3: sub-route lạ rơi vào catch-all businesses → 403 SUPER_ADMIN_REQUIRED thay vì 404
- `GET /v1/businesses/TEST_BIZ_A/subscription` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/billing` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/notifications` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/audit-logs` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/api-keys` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `POST /v1/businesses/TEST_BIZ_A/api-keys` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/transactions` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/invoices` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `GET /v1/businesses/TEST_BIZ_A/team` — **BUG** — TEAM-4: member thiếu email+displayName → 502 + lộ message nội bộ
- `POST /v1/businesses/TEST_BIZ_A/team/invite` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `PATCH /v1/businesses/TEST_BIZ_A/team/AUD_T_A_VIEWER` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `DELETE /v1/businesses/TEST_BIZ_A/team/AUD_NOPE` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/businesses/TEST_BIZ_A/cms/pages` — **BUG** — ERR-3 (như trên)
- `POST /v1/businesses/TEST_BIZ_A/cms/pages` — **BUG** — ERR-3 (như trên)
- `GET /v1/businesses/TEST_BIZ_A/settings/general` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `PATCH /v1/businesses/TEST_BIZ_A/settings/general` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo; TEN-1: T_B_ADMIN gọi URL của A nhận 200 dữ liệu CỦA B (không lộ, nhưng mismatch im lặng)
- `POST /v1/register` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/register/verify-email` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/register/resend-verification` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /v1/nope` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `GET /nov1` — **MISSING_TEST** — Runtime hành vi đúng trong audit; không có test gateway trong repo
- `POST /v1/businesses/:bid/payments/callback/:provider` — **BUG** — PAY-1 (HIGH): business_viewer đánh dấu thanh toán paid; PAY-2: provider thật không có Firebase token → 401, verifyWebhook không kiểm chữ ký
- `POST /v1/businesses/:bid/team/invite` — **BUG** — TEAM-3: response trả tempPassword; TEAM-1 escalation chặn (400) OK; TEAM-2 user tồn tại → 409 OK
- `POST /v1/ai/:type/generate` — **BUG** — AI-2: request async trùng tạo job trùng (không idempotency); AI-1/3/4 OK
- `POST openaiProxy (standalone)` — **BUG** — OAI-1: agent vượt RBAC module (runtime: agent qua auth, tới validation action); không rate limit
- `POST facebookPublish (standalone)` — **BUG** — FB-1: agent qua auth (runtime 400 "Chưa kết nối" = đã vượt RBAC); gateway giới hạn Admin/Editor nhưng hàm standalone thì không
- `GET facebookOAuthCallback (standalone)` — **MISSING_TEST** — Chỉ review tĩnh
- `POST facebookSelectPage / facebookRefreshToken` — **PARTIAL** — Cùng vấn đề validateRequest như FB-1 (tĩnh)
- `trigger aiGenerateWorker (onValueCreated apiAsyncJobs)` — **PASS*** — *Chỉ orchestration; không phải PASS nghiệm thu

## Mã trả về đầy đủ theo caller (runtime)

| Method | Route | ANON | BADTOKEN | NOROLE | L_AGENT | L_EDITOR | L_ADMIN | T_A_VIEWER | T_A_EDITOR | T_A_ADMIN | T_A_NOCLAIM | T_UNVERIFIED | T_B_ADMIN | SUPER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/v1/health` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| GET | `/v1/system/health` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 503 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/system/self-test` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/auth/me` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 200 | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/products` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| POST | `/v1/products` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 201 | 201 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| PATCH | `/v1/products/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| DELETE | `/v1/products/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/blog` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| GET | `/v1/banners` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| GET | `/v1/categories` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| GET | `/v1/menu` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH | `/v1/menu` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/footer` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH | `/v1/footer` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/settings` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH | `/v1/settings` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/seo` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH | `/v1/seo` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/sliders` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| PUT | `/v1/sliders` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/media` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 200 | 200 | 200 | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED |
| POST | `/v1/media/upload` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| DELETE | `/v1/media/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/users` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/users` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/users/custom-claims` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| DELETE | `/v1/users/AUD_NOPE` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/drafts` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/drafts/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| DELETE | `/v1/drafts/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/drafts/TEST_NOPE/publish` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/drafts/TEST_NOPE/reject` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/jobs` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/jobs/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/jobs/TEST_NOPE/retry` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/jobs/TEST_NOPE/cancel` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/logs` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/history/conversations` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/workflows` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/webhooks` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/webhooks` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| DELETE | `/v1/webhooks/TEST_NOPE` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 404:NOT_FOUND | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/events` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/events` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/queue/retry` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/system/diagnostics` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/system/jobs/monitor` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/queue/status` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/rules/repair` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/founder/home` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/ai/one-click-marketing` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/ai/blog-writer/generate` | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND |
| POST | `/v1/ai/nope/generate` | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND |
| GET | `/v1/agent/tools` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/agent/plan` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/agent/conversations` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 201 | 201 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/openclaw/capabilities` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 200 | 200 | 200 | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED |
| GET | `/v1/social-media-center/drafts` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/facebook/connection` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/facebook/status` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 200 | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| POST | `/v1/facebook/publish` | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED |
| GET | `/v1/plans` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| POST | `/v1/plans` | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND |
| GET | `/v1/businesses` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 200 |
| POST | `/v1/businesses` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:EMAIL_NOT_VERIFIED | 403:SUPER_ADMIN_REQUIRED | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/profile` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| PATCH | `/v1/businesses/TEST_BIZ_A/profile` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A/products` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| POST | `/v1/businesses/TEST_BIZ_A/products` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| PATCH | `/v1/businesses/TEST_BIZ_A/products/p1` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| DELETE | `/v1/businesses/TEST_BIZ_A/products/TEST_NOPE` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 404:NOT_FOUND | 404:NOT_FOUND | 403:EMAIL_NOT_VERIFIED | 404:NOT_FOUND | 404:NOT_FOUND |
| GET | `/v1/businesses/TEST_BIZ_A/products/p1/media` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/categories` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/inventory` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/customers` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| POST | `/v1/businesses/TEST_BIZ_A/customers` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A/orders` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| POST | `/v1/businesses/TEST_BIZ_A/orders` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A/payments` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/reports/sales` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:EMAIL_NOT_VERIFIED | 403:SUPER_ADMIN_REQUIRED | 404:NOT_FOUND |
| GET | `/v1/businesses/TEST_BIZ_A/subscription` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/billing` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/notifications` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/audit-logs` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/api-keys` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| POST | `/v1/businesses/TEST_BIZ_A/api-keys` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/businesses/TEST_BIZ_A/transactions` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/invoices` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| GET | `/v1/businesses/TEST_BIZ_A/team` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 502:UPSTREAM_ERROR | 502:UPSTREAM_ERROR | 403:EMAIL_NOT_VERIFIED | 200 | 502:UPSTREAM_ERROR |
| POST | `/v1/businesses/TEST_BIZ_A/team/invite` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| PATCH | `/v1/businesses/TEST_BIZ_A/team/AUD_T_A_VIEWER` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 403:EMAIL_NOT_VERIFIED | 404:NOT_FOUND | 400:INVALID_REQUEST |
| DELETE | `/v1/businesses/TEST_BIZ_A/team/AUD_NOPE` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 403:FORBIDDEN | 404:NOT_FOUND | 404:NOT_FOUND | 403:EMAIL_NOT_VERIFIED | 404:NOT_FOUND | 404:NOT_FOUND |
| GET | `/v1/businesses/TEST_BIZ_A/cms/pages` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:EMAIL_NOT_VERIFIED | 403:SUPER_ADMIN_REQUIRED | 404:NOT_FOUND |
| POST | `/v1/businesses/TEST_BIZ_A/cms/pages` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:SUPER_ADMIN_REQUIRED | 403:EMAIL_NOT_VERIFIED | 403:SUPER_ADMIN_REQUIRED | 404:NOT_FOUND |
| GET | `/v1/businesses/TEST_BIZ_A/settings/general` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 200 | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| PATCH | `/v1/businesses/TEST_BIZ_A/settings/general` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:TENANT_FORBIDDEN | 403:FORBIDDEN | 200 | 200 | 200 | 403:EMAIL_NOT_VERIFIED | 200 | 200 |
| POST | `/v1/register` | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| POST | `/v1/register/verify-email` | 401:UNAUTHENTICATED | 401:UNAUTHENTICATED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 403:PERMISSION_DENIED | 400:INVALID_REQUEST |
| POST | `/v1/register/resend-verification` | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST | 400:INVALID_REQUEST |
| GET | `/v1/nope` | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND |
| GET | `/nov1` | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND | 404:NOT_FOUND |
