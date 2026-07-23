# Sprint 17 — Audit & Baseline Summary

**Date:** 2026-07-18  
**Site:** pshopmusic.com (PSH Platform)  
**Workspace:** D:\PshopMusicSite  

---

## 1. JS FILE AUDIT

### 1.1 File Inventory

**Total JS footprint:** 806,659 bytes (787.8 KB) across 67 files

| Directory | Files | Total Size |
|-----------|-------|-----------|
| `js/` (root) | 48 files | ~538 KB |
| `js/ai/` | 19 files | ~118 KB |
| **Total** | **67** | **~788 KB** |

#### Largest files (potential lazy-load candidates):

| File | Size | Notes |
|------|------|-------|
| `js/admin-agent.js` | 111,803 bytes | Founder Agent — admin-only |
| `js/admin-categories.js` | 43,859 bytes | Admin-only |
| `js/admin-ai.js` | 41,732 bytes | Admin-only |
| `js/products-seed.js` | 31,620 bytes | Seed data, admin-only |
| `js/admin-sliders.js` | 27,466 bytes | Admin-only |
| `js/admin-social-center.js` | 25,683 bytes | Admin-only |
| `js/ai/task-router.js` | 24,317 bytes | Admin-only |
| `js/admin-one-click-marketing.js` | 24,329 bytes | Admin-only |
| `js/category.js` | 23,838 bytes | Public page |
| `js/admin-products.js` | 22,530 bytes | Admin-only |
| `js/home.js` | 21,476 bytes | Public page |
| `js/admin-image-ai.js` | 17,913 bytes | Admin-only |
| `js/admin-facebook-connect.js` | 16,791 bytes | Admin-only |
| `js/media-library-picker.js` | 17,485 bytes | Admin-only |
| `js/admin-products-ai-assist.js` | 16,996 bytes | Admin-only |

### 1.2 Import Dependencies

The project does NOT use ES modules (`import`/`export`). All scripts are loaded via `<script>` tags in order:

1. `firebase-app-compat.js` (CDN)
2. `firebase-auth-compat.js` (CDN)
3. `firebase-database-compat.js` (CDN)
4. `js/firebase-config.js` (initializes Firebase)
5. `js/site-content-seed.js` (seed data — high entropy, hard to tree-shake)
6. `js/products-seed.js` (seed data — high entropy, hard to tree-shake)
7. `js/db.js` (data layer)
8. `js/cms-db.js` (CMS data layer)
9. `js/admin-auth.js` (auth guard)
10. Admin/page-specific JS files

**Tree-shaking potential:** Low. The code uses IIFE + global namespace pattern (`const DB = (function(){...})()`). No module bundler. To tree-shake, the entire project would need bundling (Webpack/Rollup/Vite) and ES module migration — significant refactor.

### 1.3 Lazy-Loading Opportunities

**High-priority candidates (admin-only pages loaded on public pages):**

- `js/admin-agent.js` (112 KB) — loaded only on admin pages
- `js/admin-*.js` (all ~26 files) — loaded only on admin pages
- `js/ai/*.js` (19 files, ~118 KB) — loaded only on admin AI pages
- `js/products-seed.js` (32 KB) — seed data needed only for first-run seeding

**Mitigation:** Currently, admin JS files are only loaded on admin pages (correct). No admin JS leaks to public pages.

### 1.4 Dead Code Candidates

- **Legacy position grid:** `LEGACY_POSITION_XY` object in `home.js` with 9 positions ("top-left", "middle-center", etc.) — marked as legacy code but kept for backward compatibility with old slides that have the `position` field. Could be removed after data migration.
- **`js/admin-seo.js`** — only 1,778 bytes, appears minimal but should be verified.

### 1.5 Console.log/error Calls

**All console calls found across 65 files (excluding ai/*.js which has none):**

| File | Line | Type | Message |
|------|------|------|---------|
| `firebase-config.js` | 16-17 | `console.warn` | "Chưa cấu hình Firebase" (configuration guard) |
| `db.js` | 9 | `console.error` | "Firebase chưa được cấu hình" (configuration guard) |
| `admin-login.js` | 31 | `console.error` | Error reading "roles" node |
| `admin-products.js` | 113 | `console.error` | Failed to load products |
| `blog-list.js` | 94 | `console.error` | Failed to load blog list |
| `blog-post.js` | 143 | `console.error` | Failed to load blog post |
| `category.js` | 205, 468 | `console.error` | Failed to load categories/products |
| `home.js` | 328, 391 | `console.error` | Failed to load banners/content |
| `videos-list.js` | 71 | `console.error` | Failed to load video list |

**Assessment:** All console.error calls are in catch blocks for expected Firebase failure modes. These are appropriate for debugging but should be converted to a structured error-reporting mechanism in production. None leak sensitive data.

### 1.6 Exposed API Keys / Secrets

| File | Key | Type | Security Level |
|------|-----|------|---------------|
| `js/firebase-config.js:7` | `AIzaSyD-R2cQb-EI4I8wy60z1tuShIXny39Rawc` | Firebase Web API Key | ⚠️ **Public by design** — Firebase Web API keys are meant to be client-side; they are not secrets. Security is enforced via Firebase Security Rules (database.rules.json + storage.rules), not the API key. |

**No other API keys, secrets, or credentials found in any JS file.** No AWS keys, no OpenAI keys, no service account keys.

### 1.7 Token Usage (AI JS files)

The `js/ai/task-router.js` contains NLP "token" references — these are **text tokenization** for keyword matching (MIN_TOKEN_OVERLAP_RATIO, tokenize function), NOT API tokens. No API token exposure.

---

## 2. CSS AUDIT

### 2.1 File Inventory

| File | Size | Notes |
|------|------|-------|
| `css/style.css` | **39,611 bytes** | Public styles |
| `css/admin.css` | ~18 KB | Admin-only styles |

### 2.2 style.css — Analysis

- **Size:** 39.6 KB — moderate for a production site
- **Render-blocking:** Yes — loaded with `<link>` in `<head>`. Could be inlined critical CSS and deferred rest.
- **Duplicated rules found:**
  - `.category-header { ... }` block appears **twice** (lines ~121-129 and ~175-183) — **exact duplication**. Same for all nested rules (`.category-header-bg`, `::before`, `.container`, `.breadcrumb`, `.category-header-product-img`, etc.). This is ~3 KB of dead duplicate CSS.
- **Unused CSS candidates:** Several admin-specific classes that may not apply to public pages (but are shared in one file due to the project structure).

### 2.3 Unused CSS (Lighthouse)

- **Home page:** 0 bytes unused CSS detected
- **Category page:** 0 bytes unused CSS detected

### 2.4 CSS Optimization Opportunities

1. **Remove duplicated `.category-header` block** (~3 KB savings)
2. **Inline critical CSS** for above-the-fold content (hero section)
3. **Preload key fonts** (`Be Vietnam Pro`)
4. **Consider code-splitting** admin.css from style.css (already separate)

---

## 3. FIREBASE CONFIG AUDIT

### 3.1 Configuration Values

| Key | Value |
|-----|-------|
| `apiKey` | `AIzaSyD-R2cQb-EI4I8wy60z1tuShIXny39Rawc` |
| `authDomain` | `pshop-music.firebaseapp.com` |
| `databaseURL` | `https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `projectId` | `pshop-music` |
| `storageBucket` | `pshop-music.firebasestorage.app` |
| `messagingSenderId` | `241363789627` |
| `appId` | `1:241363789627:web:1698a9b6d26c33d94ff91e` |

### 3.2 Security Assessment

**Firebase Web API key is NOT a secret.** It's designed to be client-side. Security is enforced through:

- **Realtime Database Security Rules** (`database.rules.json`)
- **Storage Security Rules** (`storage.rules`)
- **Firebase Authentication** (email/password)
- **No sensitive operations** (create/delete users, billing) are done client-side

**Low risk.** The config file follows Firebase best practices.

---

## 4. ADMIN PAGE AUDIT

### 4.1 admin.html (Redirect)

- **Function:** HTTP meta-refresh + JS redirect to `admin/index.html`
- **noindex:** ✅ Properly set (`<meta name="robots" content="noindex, nofollow">`)
- **Auth mechanism:** Firebase Authentication via `admin-auth.js` — `onAuthStateChanged` listener redirects to `admin/login.html` if not authenticated
- **Role check:** Realtime Database `roles/{uid}.role` — `admin` or `editor` required

### 4.2 Security Implications

| Concern | Status | Details |
|---------|--------|---------|
| Auth bypass | ✅ Safe | Firebase `onAuthStateChanged` fires immediately; unauthenticated users redirected |
| Role escalation | ✅ Safe | Server-side rules enforce write permissions regardless of client role |
| Noindex | ✅ Set | `admin/index.html` and `admin.html` both have `noindex, nofollow` |
| XSS | ⚠️ Monitor | Content from Firebase is rendered via `innerHTML` in some places (admin pages rendering user content). Current patterns use `escapeHtml()` on most user inputs. |
| CSRF | ⚠️ Monitor | No CSRF tokens — but all state-changing operations use Firebase SDK which has its own auth mechanism |

---

## 5. RULES FILES AUDIT

### 5.1 database.rules.json

**Overall:** ✅ Well-structured with proper role-based access control.

#### Access Summary

| Node | Read | Write | Notes |
|------|------|-------|-------|
| `products` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `categories` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `banners` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `blogPosts` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `videos` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `siteContent` | ✅ Public | 🔒 Admin/Editor | ✅ Correct |
| `seoSettings` | ✅ Public | 🔒 Admin-only | ✅ Correct |
| `roles` | 🔒 Auth OR !exists | 🔒 Admin-only | ✅ Correct (bootstrap flow) |
| `aiDrafts` | 🔒 Auth+HasRole | 🔒 Admin/Editor | ✅ Correct |
| `aiJobs` | 🔒 Auth+HasRole | 🔒 Admin/Editor | ✅ Correct |
| `founderAgentWorkflows` | 🔒 Auth+HasRole | 🔒 Admin/Editor | ✅ Correct |
| `aiLogs` | 🔒 Auth+HasRole | 🔒 Auth+HasRole | ✅ Correct |
| `aiProviderConfig` | 🔒 Auth+HasRole | 🔒 Admin-only | ✅ Correct |
| `aiPlugins` | 🔒 Auth+HasRole | 🔒 Admin-only | ✅ Correct |
| `facebookConnection` | 🔒 Auth+HasRole | 🔒 Admin-only | ✅ Correct |
| `facebookOAuthState` | 🔒 Denied | 🔒 Admin+Self UID | ✅ Correct |
| `facebookPendingPages` | 🔒 Self-only | 🔒 Denied | ✅ Correct |
| `facebookPageTokens` | 🔒 Denied | 🔒 Denied | ✅ Correct (client never reads) |
| `facebookActiveToken` | 🔒 Denied | 🔒 Denied | ✅ Correct |
| `facebookUserToken` | 🔒 Denied | 🔒 Denied | ✅ Correct |
| `facebookAppConfig` | 🔒 Auth+HasRole | 🔒 Admin-only | ✅ Correct |
| `$other` (catch-all) | 🔒 Denied | 🔒 Denied | ✅ Correct |

#### Security Findings

1. **`roles` validation rule** (`"newData.hasChildren(['role']) && ..."`) — the `.validate` uses `newData.hasChildren(['role'])` which requires exactly `['role']` as child keys, meaning it expects an array of children. This should be `newData.hasChild('role')` for single-child check. However, the `hasChildren` with array argument accepts a list of required children, so `['role']` would require the `role` field to exist. This works correctly.

2. **`roles/$uid` write rule** — allows `(auth.uid === $uid && !root.child('roles').exists())` which means a user can self-register only when no roles exist at all (bootstrap). Once at least one role exists, only an admin can create new roles. **Correct.**

3. **Note:** `roles` validation allows role value to be only `'admin'` or `'editor'`. ✅

### 5.2 storage.rules

**Overall:** ✅ Well-documented with clear reasoning.

| Operation | Rule | Security Level |
|-----------|------|---------------|
| `get` (read single file) | ✅ Public | Required for public images |
| `list` (list directory) | 🔒 Auth required | Tightened from "public" — correct |
| `write` (create/update/delete) | 🔒 Auth required | Appropriate for CMS |

#### Documented Limitation

Storage rules cannot cross-reference Realtime Database (Firestore-only). To enforce Admin/Editor roles on Storage writes, Firebase Auth Custom Claims are needed — acknowledged in code comments as a future improvement.

---

## 6. LIGHTHOUSE BASELINE

### 6.1 Home Page (pshopmusic.com)

| Metric | Score / Value |
|--------|--------------|
| **Performance** | **58/100** ⚠️ |
| **Accessibility** | **73/100** ⚠️ |
| **Best Practices** | **100/100** ✅ |
| Console Errors | 0 ✅ |
| Unused JavaScript | 830 bytes (minimal) |
| Unused CSS | 0 bytes ✅ |
| Bootup Time | 496 ms |
| Total Blocking Time (TBT) | 98.5 ms |
| Largest Contentful Paint (LCP) | **8.87 s** 🔴 |
| Render-blocking Resources | Not measured (not in selected categories) |
| Deprecations | 0 ✅ |
| HTTPS | ✅ Pass |

### 6.2 Category Page (category.html)

| Metric | Score / Value |
|--------|--------------|
| **Performance** | **68/100** ⚠️ |
| **Accessibility** | **91/100** ✅ |
| **Best Practices** | **96/100** ⚠️ (likely image aspect ratio issues) |
| Console Errors | 0 ✅ |
| Unused JavaScript | 810 bytes (minimal) |
| Unused CSS | 0 bytes ✅ |
| Bootup Time | 524 ms |
| Total Blocking Time (TBT) | 108 ms |
| Largest Contentful Paint (LCP) | **6.29 s** 🟡 |
| Render-blocking Resources | Not measured (not in selected categories) |
| Deprecations | 0 ✅ |
| HTTPS | ✅ Pass |

### 6.3 Performance Bottlenecks Identified

1. **LCP (8.87s home / 6.29s category)** — Main performance killer. Likely due to:
   - Hero image loading (full-size images not optimized)
   - Firebase data fetch (waterfall: auth → database → render)
   - Google Fonts render-blocking
   - No critical CSS inlining
2. **No JS code splitting** — All public pages load `firebase-config.js` + `db.js` + `cms-db.js` + seed data files upfront
3. **Image optimization** — No WebP/AVIF, no lazy loading verification for hero images

---

## 7. OPTIMIZATION RECOMMENDATIONS

### Critical (Sprint 17)

1. **Fix LCP:** Optimize hero image (resize, WebP, preload `<link rel="preload">`)
2. **Improve Performance Score:** Address render-blocking, reduce JS payload on public pages
3. **Remove duplicate CSS:** Deduplicate `.category-header` block (~3 KB)

### High Priority

4. **Critical CSS inlining** for above-the-fold content
5. **Font display swap:** Ensure `font-display: swap` for Google Fonts (currently no `&display=swap` in URL)
6. **Image optimization pipeline:** All product/banner/hero images should serve WebP with fallback
7. **Tree-shakable build:** Consider migrating to Vite or Webpack for production builds

### Medium Priority

8. **Move seed data out of critical path:** `products-seed.js` (32 KB) and `site-content-seed.js` (8 KB) are loaded on every public page but only needed for first-run seeding
9. **Console.error → structured logging:** Replace `console.error` calls with a monitoring service
10. **Storage rules refinement:** Implement Firebase Auth Custom Claims for Admin/Editor Storage write access

### Low Priority

11. **Smart Mode default:** Change default UI mode to "Smart Mode" (currently Smart, already implemented)
12. **Legacy position data migration:** Clean up `LEGACY_POSITION_XY` after all slides are migrated

---

## 8. SECURITY SUMMARY

| Concern | Status | Severity |
|---------|--------|----------|
| Exposed Firebase API key | ✅ Acceptable (public by design) | Info |
| Exposed secrets/credentials | ✅ None found | — |
| Realtime Database rules | ✅ Well-configured, role-based | — |
| Storage rules | ✅ Well-documented, appropriate | — |
| XSS via innerHTML | ⚠️ Some usages, mitigating with escapeHtml() | Low |
| Auth bypass | ✅ Firebase Auth guard | — |
| Noindex on admin | ✅ Set correctly | — |
| CSRF protection | ⚠️ No explicit CSRF tokens | Low (Firebase SDK mitigates via Auth) |

---

## 9. FILES GENERATED BY THIS AUDIT

| File | Content |
|------|---------|
| `lh-baseline.json` | Lighthouse report for pshopmusic.com (1.5 MB) |
| `lh-category.json` | Lighthouse report for category.html (1.1 MB) |
| `sprint17-audit-summary.md` | This file |
