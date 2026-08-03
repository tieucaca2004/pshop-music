# FOUNDER DIRECTIVES — Log

Nhật ký directive của Founder. Mỗi mục ghi directive mới nhất — **directive mới nhất thắng toàn bộ directive cũ**. Chỉ ghi nhận, không cần phê duyệt lại.

## 2026-08-03 — Release Verification / Knowledge Sync

- **13:42 PROJECT KNOWLEDGE SYNC** — Đồng bộ toàn bộ tri thức dự án lên GitHub (Single Source of Truth). Cập nhật: Constitution, Founder Directives, Architecture, Workflow Engine, Automation Architecture, CMS Architecture, Product Runtime Architecture, Product SEO Architecture, Runtime Trace Result, Root Cause Analysis, Product Runtime Migration Plan, Release Verification Report, Sprint Progress, Roadmap, Definition of Done, ADR, CHANGELOG, README. Scope đã xác nhận: **toàn bộ 18 loại, bất kể trạng thái**.
- **13:45 PROJECT KNOWLEDGE AUDIT** — Xác minh toàn bộ tri thức đã lưu vào GitHub Repository bằng git status/log/diff (không suy luận). 20 mục, mỗi mục: STATUS ✅ UP TO DATE / ⚠ OUTDATED / ❌ MISSING. Nếu còn thiếu: tự động cập nhật/merge (không tạo trùng), rồi `git add . && git commit -m "docs: synchronize founder knowledge after runtime trace and release verification" && git push origin feature/cms-ai-sprint2`. Kết quả: Repository Status, Knowledge Coverage (%), Files Updated, Files Missing, Commit SHA, Push Status. Coverage <100% → không kết thúc.

## 2026-08-03 — Release Workflow (trước Knowledge Sync)

- **09:54 + 10:07 + 10:09 + 10:13 + 10:19 + 10:23 + 10:29 + 10:30 + 13:08 Release Verification** — Verify production bằng Runtime Evidence (State Machine Atomic Transaction). Chỉ PASS/FAIL, dừng tại STEP FAIL, không retry/recover/audit/build. STEP 1-11 (Login→…→Google SEO). Kết quả: FAILED AT STEP 10 (Product 41 SEO Database ↔ Website Runtime HTML không khớp — `products-seed.js`/hardcode không đọc Database).
- **13:31 + 13:32 PRODUCT-SEO ROOT CAUSE TRACE** — Trace điểm đứt DB→Website bằng Runtime Evidence. Không sửa code. Root cause xác định: Website render SEO từ HTML hardcode + `products-seed.js` (không chứa field SEO).
- **13:35 PRODUCT RUNTIME TRACE** — HTML trước JS == sau JS → SEO sinh static/server-side, Runtime HTML từ HTTP Response.
- **13:39 PRODUCT RUNTIME MIGRATION** — Lập Migration Plan (đã ghi tại `docs/product-runtime/PRODUCT_RUNTIME_MIGRATION_PLAN.md`). Chờ phê duyệt, chưa code.

## 2026-08-01 (trước đó, tóm tắt)

- Git kết nối GitHub qua HTTPS + PAT token; giữ token.
- Code Product SEO trên `feature/cms-ai-sprint2` (commit local `40b0166` + docs `1804651` — chưa push).
- Đọc toàn bộ dự án, sinh `PROJECT_STATUS.md` + `PROJECT_STATUS_TOP20.md` (chưa commit).

## Ghi chú

- Directive cũ hơn bị ghi đè bởi directive mới nhất.
- PSH không build cho khách công cộng; không tự ý refactor; không mở sprint mới nếu Founder chưa quyết.
