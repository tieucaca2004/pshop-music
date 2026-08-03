# PROJECT_STATUS.md — PSH Business Platform

**Ngày sinh báo cáo:** 2026-08-01
**Branch:** `feature/cms-ai-sprint2` (HEAD `48ceaa7` — "Sprint 18: Business Settings", 2026-07-31)
**Repo local:** `/home/node/.openclaw/workspace/repo`
**Repo nguồn:** `https://github.com/tieucaca2004/pshop-music.git`
**Phương pháp:** Đọc toàn bộ source + chạy thật. Mọi kết luận kèm bằng chứng file/dòng hoặc kết quả chạy. KHÔNG sửa code, không commit, không merge.

---

## 1. Executive Summary

PSH (trước là Pshop Music e-commerce) là một platform **đã trưởng thành, single-tenant**, kiến trúc **Static HTML/CSS/JS (frontend) + Firebase Realtime Database + Cloud Functions (backend) + Netlify (hosting)**. Sau Sprint 14 (API Platform), repo đã tiến hóa sang **hướng multi-tenant Business Platform** (Sprint 10.x → Sprint A.1–A.3 PSH Console, Sprint 17 performance, Sprint 18 Business Settings), nhưng:

- **Sản phẩm production thật hiện tại vẫn là Pshop Music** (`pshopmusic.com`) — catalog-only, chưa có Orders/Inventory/Customers.
- **Tài liệu sản xuất (`PSH_*.md`, `ROADMAP.md`, `GAP_ANALYSIS`) bị LỆCH PHA với code hiện tại** — chúng snapshot trạng thái ~20/07 (single-tenant, multi-biz "by design missing"), trong khi code 26–31/07 đã chuyển sang multi-tenant. → Tài liệu không còn là nguồn sự thật đáng tin cậy nếu không đối chiếu code.
- **2 gap rẻ và quan trọng nhất** giữa hiện tại → OpenClaw thực sự dùng được: (a) **RBAC enforcement không nhất quán**, (b) **`aiGenerateWorker` chưa được deploy** (code-complete, xác nhận comment `functions/index.js:960-964`).
- **Website production hoạt động** (HTTP 200, title render, 8-12 script load, API health/products/categories 200, diagnostics 403 đúng). **Playwright MCP chưa dùng được** vì thiếu system libraries trong sandbox.
- **Security rules tương đối tốt** (tenant-isolated storage rules, role-based DB rules, harden headers), nhưng **Database Rules chưa từng deploy** (mục 8) và `database.rules.json` (đang dùng) chứa quy tắc superAdmin quá rộng.

**Đánh giá tổng:** Platform chạy được, code chất lượng tốt, có kỷ luật. Nhưng để gọi là "Production Business Operating System" còn thiếu: Orders/Inventory/Customers (quyết định business), OpenClaw kết nối thật, deploy DB/storage rules, CI/CD, và test suite thực sự.

---

## 2. Current Architecture

**Frontend (không build step, deploy as-is):**
- Site khách: `index.html`, `category.html`, `blog.html`, `blog-post.html`, `videos.html` + `css/style.css` + `js/db.js`, `js/cms-db.js`, `js/site-chrome.js`.
- CMS Admin: `admin/*.html` (32+ trang — README liệt kê login/index/products/categories/banners/sliders/blog/videos/menu/footer/seo/settings/users + `admin/ai/*`).
- PSH Shell: `psh/index.html` (SPA fetch-based, `<iframe src="/admin/index.html">`, `<script src="/js/workspace-engine.js">` — bằng chứng `psh/index.html:59,72,303`).
- PSH Console: `console/{business-selector,create-business,workspace}.html` (Sprint A.1–A.3).
- Platform UI mới: `platform/{login,workspace,founder,ai}/*.html` — **thư mục mới phát hiện**, không chắc được nối vào Netlify deploy hay không (chưa thấy redirect).
- AI client: `js/ai/` (~45 file) — provider-registry, plugin-manager, workflow-engine, content-engine.

**Backend (Firebase Cloud Functions):**
- Entrypoint duy nhất: `exports.apiGateway = onRequest(...)` (`functions/index.js:813`), dispatch path `/v1/*` (`index.js:825`), auth pipeline `shared/middleware.js` (authenticate) + `shared/auth.js` (verifyAuth→requireBusiness→requireRole→fullAuthPipeline).
- 34 file `functions/routes/` — **33 router thật**, `_mt-template.js` chỉ là scaffold không require (bằng chứng: không xuất hiện trong `index.js:772-805`).
- 6 Cloud Function độc lập: `openaiProxy`, `facebookOAuthCallback`, `facebookSelectPage`, `facebookPublish`, `facebookRefreshToken`, `aiGenerateWorker` (chưa deploy).
- `functions/shared/` ~30 module (auth, permissions, apiAdapter, aiGenerate, aiModules, agentPlanner/Execute/Tools, asyncJob, eventBus, webhook, selfHealing, listResource, objectResource, publishToTarget, retry, rateLimit, security, tenant, validation, subscriptionValidator, corsConfig, logger, response).

**Data layer:**
- Firestore/RTDB: `businesses/{id}/` tenant paths + legacy flat nodes (`products`, `categories`, `blogPosts`, `banners`, `sliders`, ...).
- 2 bộ rules: `database.rules.json` (237 dòng, đang cấu hình trong `firebase.json`) + `database-rules-mt.json` (multi-tenant — nhẹ hơn, không phải file cấu hình active).
- Storage: `storage.rules` (3.4KB) — tenant-isolated, super_admin bypass, legacy catch-all loại bỏ /businesses/.

**Hosting/Infra:** Netlify (`pshshopmusic.com`, site `48256e20-...`), Firebase project `pshop-music`, domain chuyển hướng sang `psh.vn` (commit `1301d79` "update domain to psh.vn" — bằng chứng git log).

---

## 3. Completed Features (có bằng chứng chạy thật / commit)

| Feature | Trạng thái | Bằng chứng |
|---|---|---|
| **Site khách + CMS Admin** (products/categories/blog/banners/sliders/videos/menu/footer/seo/settings/users) | ✅ Hoạt động | HTTP 200, README, `git log` |
| **API Platform (Sprint 14)** — 6 Phase: Core API, CMS APIs, Founder, Agent, Media AI, Self-Healing + OpenClaw | ✅ **FOUNDER PASS** | `CHANGELOG.md:14` founder test `/v1/system/diagnostics`; `GET /v1/health` → 200, `/v1/products` → 200 (chạy thật) |
| **Founder Agent** (V1→V5) | ✅ Code hoàn tất | `functions/{routes/agent.js(181), shared/agentExecute.js(407), agentPlanner.js(181), agentTools.js(84)}` thật |
| **Media AI — 9 module generate** (blog/product-seo/facebook/banner/image/image-prompt/slider/faq) | ✅ Thật | `routes/aiGenerate.js` ROUTE_TO_MODULE 9 entry; 1-click-marketing gọi 4 module song song |
| **Facebook Integration** (V1→V5) | ✅ Production | `routes/facebook.js` + 4 CF riêng đã deploy (Sprint 14 Readiness) |
| **AI SEO / SEO Foundation (Sprint 16)** | ✅ Lighthouse SEO 100/100 | `SPRINT16_SEO_FOUNDATION_REPORT.md`, commit |
| **Performance (Sprint 17)** — font-display, image preload, CSS dedup, security headers | ✅ | Commit `ad18489`, `sprint17-audit-summary.md` |
| **Business Settings (Sprint 18)** | ✅ | HEAD `48ceaa7` |
| **PSH Console (Sprint A.1–A.3)** — business selector/onboarding/workspace shell | ✅ | `console/*.html` |
| **Storage Rules tenant-isolation (critical fix)** | ✅ | `storage.rules` — cross-tenant read đã chặn (comment dòng 15-22) |
| **Async AI worker** | ⚠️ Code xong, **CHƯA DEPLOY** | `index.js:965` + comment 960-964 |

---

## 4. Incomplete Features

| Feature | Trạng thái | Bằng chứng |
|---|---|---|
| **Media AI — video** | 🔶 **503 stub** (chưa implement) | `routes/aiGenerate.js` `STUB_ROUTES={video}`; `js/ai/modules/video-generator.js` chỉ voice-over option, không API thật |
| **Media AI — voice/subtitle** | 🔶 **503 stub** | `STUB_ROUTES` (bằng chứng subagent backend: trả `SERVICE_UNAVAILABLE` "Think Ahead. Build Later") |
| **DB + Storage Rules deploy** | 🔶 Chưa deploy lên production | `sprint17-audit-summary.md` nói `database.rules.json` "chưa từng deploy" (mục 8) |
| **Sprint 15 frontend deploy** | 🔶 **Netlify PENDING** (Cloud Functions xong) | `CHANGELOG.md:5` "ĐANG CHỜ FRONTEND DEPLOY"; `ROADMAP.md:3` |
| **AI SEO per-product** | 🔶 Blog-only, chưa per-product | `GAP_ANALYSIS` §9 |
| **OpenClaw kết nối thật** | 🔶 Planning-only — chưa session sống | Nhiều doc planning; không log kết nối thật |
| **agent role end-to-end** | 🔶 UI không tạo được tài khoản `agent` | `PSH_FOUNDER_RECOMMENDATIONS.md` rec #4 |
| **Sprint 11 Requirement #3 — AI Provider runtime** | 🔶 **VẪN FAILED** (Billing Account ĐÓNG) | `CHANGELOG.md:435,421`, `SPRINT_11_ACCEPTANCE.md` "DỰ THẢO" |

---

## 5. Broken Features

- **3 route Media AI (video/voice/subtitle) trả 503** — cố ý stub, không có provider. Nếu UI trỏ tới → lỗi người dùng thấy.
- **OpenClaw "Agent couldn't generate a response"** trước đây — do context phình ~1.2M token (ghi MEMORY.md) — là vấn đề runtime OpenClaw, không phải bug PSH. Hiện session này chạy bình thường.
- **Playwright MCP**: không khởi động được trong sandbox (thiếu `libglib-2.0.so.0` + 20 lib khác; không `ssh-keygen`/`sudo` cài apt được). Đây là ràng buộc sandbox, không phải lỗi repo.
- **PSH shell load 2 file KHÔNG tồn tại** → `psh/index.html:68,74` reference `js/business-context.js` + `js/subscription-middleware.js`, mà `ls` xác nhận **không có file** → console 404/JS error khi mở `/psh/`.
- **Nav PSH trỏ tới trang không tồn tại**: `psh/index.html:51,344` link `/admin/billing.html` nhưng **file không tồn tại** (`ls admin/billing.html` → No such file).
- **`admin/ai/content.html` rỗng + broken script**: page này (`admin/ai/content.html:75`) load `../../js/admin-chrome.js` — **file không tồn tại** (`ls js/admin-chrome.js` → No such file); page không có nội dung ngoài chrome.

---

## 6. Production Readiness

- **Website live**: ✅ `pshopmusic.com/` 200 (1.2s), `/psh/` 200 (0.49s) — chạy thật.
- **API live**: ✅ `/v1/health` 200 (4.99s — **chậm, đáng lưu ý**), `/v1/products` 200, `/v1/categories` 200, `/v1/system/diagnostics` 403 (đúng: cần auth).
- **Render**: title chính xác, `psh/` nạp 12 script — trang phục vụ đúng (không xác nhận được JS render thật vì chưa có browser).
- **Security headers**: ✅ Netlify `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`, `Permissions-Policy` (`.netlify/netlify.toml`).
- **Chưa production-ready để gọi là Operating System**: thiếu Orders/Inventory/Customers, thiếu deploy rules, thiếu CI/CD, thiếu test suite, RBAC chưa nhất quán.

---

## 7. Technical Debt

1. **RBAC enforcement không nhất quán** — `canAccess()` chỉ wire vào 3/~15 route files (GAP_ANALYSIS §13; Founder Review debt #1).
2. **`aiGenerateWorker` chưa deploy** — code xong, async generation không chạy thật (`index.js:960-964`).
3. **Test suite gần như không tồn tại trong repo production** — chỉ `functions/tests/apiAdapter.test.js` (406B, 2 `it()`); hồ sơ "149-test" không nằm trong các thư mục test hiện diện; `functions/package.json` không có script test. Không có CI (`.github/workflows` không tồn tại).
4. **Tài liệu lệch pha code** — `PSH_*.md`/`ROADMAP.md`/`GAP_ANALYSIS` snapshot 20/07, không còn khớp kiến trúc multi-tenant hiện tại.
5. **`database.rules.json` chưa deploy + superAdmin wildcard rộng** (`root.child('superAdmins/'+auth.uid)` cấp toàn `.read`/`.write`).
6. **Analytics = 0 business metrics** — chỉ AI-ops telemetry (GAP §12).
7. **2 folder A Tiểu untracked + domain pshop vs psh.vn lẫn lộn** (commit đổi `psh.vn` nhưng site vẫn `pshopmusic.com`).
8. **SEO product pages chưa có** (`GAP_ANALYSIS` §9).
9. **Deploy là thủ công** (Founder login Netlify, `firebase deploy` tay) — không pipeline.
10. **OpenClaw Router vừa tạo (`openclaw-router/`)** — **untracked trong git**, hoàn chỉnh (13/13 test) nhưng chưa commit & chưa tích hợp Telegram thật.

---

## 8. Security

- **Storage**: tenant-isolated, đã fix lỗi cross-tenant read (bằng chứng comment `storage.rules:15-22`), super_admin bypass có `request.auth.token.roles.super_admin`.
- **Database `database.rules.json`**: role-based (`business_admin`/`business_editor`), `products.read: true` công khai (cố ý — catalog công khai), subscription write:false. **Tuy nhiên superAdmin wildcard cấp toàn quyền.**
- **`database-rules-mt.json`**: multi-tenant nhẹ, `$other` read/write:false — an toàn hơn nhưng KHÔNG phải file active.
- **API**: auth bắt buộc mọi route trừ `/v1/health` (public) — chạy thật xác nhận 403 khi không token.
- **Secret**: không secret lộ trong repo (API keys qua env/defineSecret). Firebase API key public-by-design (an toàn).
- **Rủi ro**: rules chưa deploy → production có thể đang chạy rules mặc định/mở; `roles` là global per-user (chưa theo business) — đúng điểm Decision Record đã nêu.

---

## 9. Performance

- **Lighthouse (từ sprint17-audit-summary, 18/07)**: Performance **58** (LCP 8.87s home 🔴), category **68** (LCP 6.29s), Accessibility 73, Best Practices 100.
- **Nguyên nhân chính**: hero image, Firebase waterfall (5 script), Google Fonts render-blocking, không critical CSS, seed data trên critical path, không bundle, 67 JS files ~788KB.
- **API `/v1/health`** phản hồi **~5s** (chạy thật) — Cloud Function cold start/region vấn đề đáng xem.
- **Sprint 17** đã fix một phần (font-display, image preload, CSS dedup, headers) nhưng Performance score chưa được re-measure sau đó.

---

## 10. Priority List (dựa trên Roadmap Tier + Founder Review)

**Tier 0 — Hygiene (nhỏ, gỡ khối):** reconcile RBAC, deploy rules, reconcile tài liệu vs code.
**Tier 1 — Hoàn tất nửa-done (tái dùng arch hiện có):** deploy `aiGenerateWorker`, per-product SEO, agent role UI, Telegram draft-notify.
**Tier 2 — OpenClaw Activation** (cần Tier 1 RBAC + worker).
**Tier 3 — Module business mới** (cần quyết định Founder): Analytics, Landing Pages, Orders, Inventory.
**Tier 4 — Multi-business architecture-readiness** (chỉ design, theo chỉ thị Founder).
**Tier 5 — Production Validation** (chạy cùng/cuối mọi tier).

---

## 11. Roadmap (kế hoạch, chưa triển khai — nguồn tài liệu)

Theo `PSH_PRODUCTION_ROADMAP.md` + `PSH_IMPLEMENTATION_PHASES.md`: Phase 0 hygiene → 1 finish-half-built → 2 OpenClaw A→C → 3 new modules → 4 multi-biz design. Sprint 19 đề xuất = Phase 0/1 + RBAC + OpenClaw Stage B; **Orders/Analytics/Landing/A Tiểu giữ ngoài Sprint 19** (cần quyết định business, đặc biệt Orders chạm tiền thật). Domain: đang chuyển `pshopmusic.com` → `psh.vn` (chưa hoàn tất đầy đủ).

---

## 12. TODO/FIXME/HACK Inventory

Chỉ **1 TODO duy nhất** toàn repo (không trừ node_modules):
- `js/ai/providers/openai.js:12` — TODO về URL `OPENAI_PROXY_URL`, nhưng **URL thật đã được điền sẵn** dòng 17 (`https://us-central1-pshop-music.cloudfunctions.net/openaiProxy`) → hết hiệu lực.

Không có FIXME/HACK/BUG marker nào khác (grep toàn repo).

---

## 13. Module Chưa Được Sử Dụng (Orphan / Dead)

Kiểm tra ref-count (grep tên file trong toàn repo, trừ chính nó + node_modules + .git) + verify HTML load.

### A. `js/ai/services/` — TOÀN BỘ 13 FILE LÀ DEAD CODE (không trang nào load)
`voice-service`, `video-service`, `subtitle-service`, `image-service`, `project-manager`, `template-engine`, `pipeline-adapter`, `render-queue`, `batch-engine`, `generation-service`, `asset-manager`, `provider-router`, `quality-engine` — HKÔNG HTML nào load. `pipeline-adapter` có guard `typeof PipelineAdapter !== 'undefined'` (`admin-image-ai.js:138`) nhưng file không bao giờ include → luôn fallback.

### B. `js/ai/content-engine/` — TOÀN BỘ 7 FILE ORPHAN
`cms-block-generator`, `content-evidence`, `missing-info`, `publication-readiness`, `section-planner`, `source-intelligence`, `visual-intelligence` — không nơi nào reference.

### C. Provider dead client-side
| File | Trạng thái | Bằng chứng |
|---|---|---|
| `js/ai/providers/kimi.js` | 🔴 **ORPHAN** (0 ref, không HTML load) | grep |
| `js/ai/coding-router.js` | 🔴 **ORPHAN** | 0 ref |
| `js/ai/modules/video-generator.js` | 🔴 **ORPHAN** (9/10 module dùng, riêng video không) | không HTML load |
| `js/ai/providers/seedance.js` | 🔴 **Backend CF tồn tại? KHÔNG** `exports.seedanceProxy` không có trong `functions/index.js` (chỉ openaiProxy); seedance không có trong provider admin UI | seedance.js:28 + index.js |
| `claude/deepseek/gemini.js` | ⚠️ STUB load được nhưng **registration lỗi**: `register('claude')` nhưng `provider-registry.js:11-14` đọc `provider.id` → đăng ký vào `providers[undefined]` | `claude.js:37` |

### D. Khác
- Root orphan: `js/ai-platform.js`, `js/db-compat.js`, `js/db-mt.js`, `js/shared.js`, `js/workspace-categories.js`, `js/extension-framework.js`.
- `js/module-runtime.js` chỉ PSH shell dùng.
- `functions/routes/_mt-template.js` — scaffold không require (`index.js:772-805` không có).
- `openclaw-router/` (tạo mới) — untracked.

Kết quả: ~20+ file AI client (services/content-engine/provider) **viết nhưng chưa được gọi từ production** — khớp dạng "build-ahead" trong roadmap.

---

## 14. Playwright MCP (mục 13 yêu cầu)

**Kết quả: KHÔNG dùng được trong sandbox hiện tại.**

- **Browser**: đã tải xong (`chromium-1228`, `chromium_headless_shell-1228`, `ffmpeg-1011` ở `~/.cache/ms-playwright`).
- **Playwright module**: có tại `/app/node_modules/playwright` — nạp OK.
- **Block**: `browserType.launch` fail — **thiếu 21 system libraries** (`libglib-2.0.so.0`, `libnss3`, `libgbm`, `libcairo`, `libX11`, `libxkbcommon`, ... — xác nhận `ldd`), và **không có `ssh-keygen`/`sudo`/quyền elevated** để cài apt. Chính xác: thiếu **system library**, không phải package (npm) — module + browser đã có.
- **Hệ quả**: không chụp được screenshot thật; mục 14 website chỉ xác minh bằng HTTP + nội dung HTML, chưa xác minh JS render/console/network error.
- **Cách gỡ**: cài libs trên host (lệnh apt trong session trước) hoặc bật `tools.elevated` cho mình.

---

## 15. CMS / AI Center / Media AI / Founder Agent / Telegram (mục 8-12)

- **CMS**: ✅ Đầy đủ backend API (routes thật) + admin UI. Frontend site khách đọc trực tiếp Firebase (public read).
- **AI Center**: ✅ Client framework lớn (`js/ai/`, ~45 file) — provider-registry, plugin-manager (8/8 plugin production từ Sprint 6), workflow-engine, job-queue, cost-tracking, observability. **OpenAI hoạt động thật** (backend gọi `api.openai.com` `gpt-4o-mini`/`dall-e-3` + `openaiProxy`). **Claude/DeepSeek/Gemini/Kimi/Seedance = stub client-side** — chưa có backend thật.
- **Media AI**: ✅ 9 module text/image thật; 🔶 video/voice/subtitle 503 stub; bỏ trống provider video/voice riêng thật.
- **Founder Agent**: ✅ V1→V5 đầy đủ backend (agent.js, agentPlanner/Execute/Tools) + UI `admin/ai/agent.html` → `admin-agent.js`. Chưa kích hoạt role `agent` end-to-end.
- **Telegram**: 🔶 **CHƯA có tích hợp business thật** — chỉ `health-center/notify-telegram.ps1` (infra alerting qua Bot API, env `TELEGRAM_BOT_TOKEN`/`CHAT_ID`), `functions/routes/notifications.js`, `subscriptionValidator.js` có nhắc. Không có route `/v1/telegram`. **OpenClaw-router (Telegram model router) vừa tạo chưa connect.**

---

## 16. Kết luận & điều kiện đưa vào dùng thật

**Tóm tắt:** PSH là platform single-tenant trưởng thành với backbone API vững chắc (33 router thật, auth 2 lớp, tenant rules, self-healing, webhook/event bus). Production hiện tại (Pshop Music) chạy ổn. Nhưng **5 rào chặn chính để thành "Business Operating System thật":**

1. Deploy `aiGenerateWorker` + Database/Storage rules (2 thứ code đã sẵn, chỉ chưa đẩy lên).
2. RBAC enforcement bù đắp (agent role + canAccess nhất quán).
3. Test suite + CI/CD thật (hiện không có).
4. Kết nối OpenClaw / Telegram thật (router vừa tạo cần commit + wire).
5. Quyết định business cho Orders/Inventory/Customers/A Tiểu (không tự build — Founder quyết).

**Không sửa code, không commit, không merge trong báo cáo này.** TOP 20 việc tiếp theo được đưa riêng (xem tin nhắn trả lời).
