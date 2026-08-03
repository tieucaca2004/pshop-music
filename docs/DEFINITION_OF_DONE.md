# DEFINITION OF DONE (DoD)

Tiêu chuẩn hoàn thành cho Release/verification của PSH Platform.

## Product SEO (Product 41)

- [ ] Database Product 41 có đủ: `seoTitle`, `metaDescription`, `seoKeywords`, `canonical`, `ogImage`, `slug`.
- [ ] `<title>` (Website) == Database `seoTitle`
- [ ] meta description (Website) == Database `metaDescription`
- [ ] `<link rel="canonical">` == Database `canonical`
- [ ] `og:title` == Database `seoTitle`
- [ ] `og:image` == Database `ogImage`
- [ ] Refresh không mất dữ liệu.
- [ ] Mở lại Product vẫn còn dữ liệu.
- [ ] Website Product Detail render SEO từ Database (hoàn tất PRODUCT RUNTIME MIGRATION).

## Release Verification (State Machine)

- STEP 1 Login → STEP 2 Business → STEP 3 CMS → STEP 4 Product → STEP 5 SEO → STEP 6 Save → STEP 7 Refresh → STEP 8 Reopen → STEP 9 Website → STEP 10 Runtime HTML (DB ↔ Website khớp) → STEP 11 Google SEO.
- PASS toàn bộ → `RELEASE VERIFIED`.
- FAIL → dừng đúng STEP FAIL.

## Product Runtime Migration Plan

- [ ] Product Detail load từ `GET /v1/products/{id}` (không dùng `products-seed.js`).
- [ ] SEO + display fields render từ Database.
- [ ] HTML trước/sau JS hiển thị đúng SEO từ Database.
- [ ] Đạt RELEASE VERIFICATION STEP 10.

## Chung

- Không placeholder, không mock, không demo card, không prototype.
- GitHub = Single Source of Truth; Runtime Evidence thắng suy luận.
- Không refactor/đổi logic khi chưa Founder duyệt.
