# PRODUCT SEO WORKFLOW (Constitution)

**Task:** PRODUCT-SEO-01
**Ngày:** 2026-08-02
**Status:** SOURCE OF TRUTH — mọi sản phẩm mới phải theo workflow này, không tự tạo cách mới
**Phạm vi:** Product SEO. KHÔNG áp dụng cho Website/Global SEO (`seoSettings`).

---

## 1. Goal
Hoàn thành Product SEO cho **đúng 01 sản phẩm** (ID: 41 — USB Lexar JumpDrive P30 128GB). Không thêm chức năng mới, không refactor hệ thống, không audit thêm.

## 2. Workflow bắt buộc (theo thứ tự)

### PHASE 1 — Product SEO fields
Verify trong node `products/{productId}`: `seoTitle`, `metaDescription`, `seoKeywords`, `slug`, `canonical`, `ogImage`. Thiếu → implement.

### PHASE 2 — Admin Product
Founder chỉnh được 6 field (SEO Title, SEO Description, SEO Keywords, Canonical, OG Image, Slug). Save → Refresh → Reopen → PASS.

### PHASE 3 — Renderer
Product Detail lấy `title/description/keywords/canonical/OpenGraph` từ **Product Database**, không hardcode.

### PHASE 4 — Production
Commit → Push → Deploy Netlify → Verify Production → View Source → PASS.

### PHASE 5 — Founder Workflow
Edit Product SEO → Save → Refresh → Reopen → View Product → View Source → PASS.

### PHASE 6 — Save Configuration
Lưu toàn bộ cấu hình thành Platform Standard (Source of Truth) — xong Phase 1-5 mới làm.

## 3. Definition of Done
PASS khi: ✓ Founder chỉnh được ✓ Save ✓ Refresh ✓ Reopen ✓ Database ✓ Product Detail ✓ View Source ✓ Production ✓ Configuration lưu thành PRODUCT_SEO_STANDARD.md ✓ Workflow lưu thành PRODUCT_SEO_WORKFLOW.md.

## 4. Coding Rules
- Chỉ Product SEO — KHÔNG đụng `seoSettings`/Website/Global SEO.
- Reuse `DB.get`/`DB.update`/product node — không duplicate logic.
- Renderer không hardcode giá trị — đọc từ Product Database.

## 5. Testing Rules
- node --check KHÔNG phải Runtime PASS.
- Phải verify Production Runtime (curl/fetch/browser/View Source thật).
- View Source (không chỉ DevTools) — Google crawler đọc được.

## 6. Deployment Rules
Commit → Push → Deploy Netlify → Verify Production URL.

## 7. Blocker Policy (Authentication/Secret)
- Xác minh 1 lần. Thiếu quyền → dừng, báo Founder.
- Không dành thời gian vượt blocker credentials.

## 8. Sai khi hoàn thành
- Dừng. Không audit thêm, không refactor thêm, không mở rộng sang sản phẩm khác.
- Không được kết thúc sau Audit/Root Cause — phải hoàn thành end-to-end + deploy + verify production.

---

## Reference
- `docs/architecture/PRODUCT_SEO_STANDARD.md` (định nghĩa schema/mapping/standard chi tiết)
- Product node: `products/41` (USB Lexar JumpDrive P30 128GB – USB 3.2)
