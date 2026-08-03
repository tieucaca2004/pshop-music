# PRODUCT SEO ARCHITECTURE

> Kiến trúc SEO cho Product trên website `pshopmusic.com`.
> Nguồn sự thật: Runtime Evidence 2026-08-03 + Database Product 41.

## 1. Model SEO trong Database

Product 41 (LEXAR JUMPDRIVE P30 128GB) lưu trong Database (qua API Gateway `GET /v1/products/41`):

| Field | Giá trị (Database) |
|---|---|
| seoTitle | `LEXAR JUMPDRIVE P30 128GB – USB 3.2 Chính Hãng` |
| metaDescription | `Khám phá LEXAR JUMPDRIVE P30 128GB, USB 3.2 tốc độ cao…` |
| seoKeywords | `["LEXAR JUMPDRIVE P30","USB 3.2","thiết bị DJ"]` |
| slug | `lexar-jumpdrive-p30-128gb-usb-3-2` |
| canonical | `https://pshopmusic.com/product-lexar-p30-128gb.html` |
| ogImage | firebasestorage URL |

## 2. Mapping SEO → HTML

| Database Field | HTML Element |
|---|---|
| seoTitle | `<title>` + `<meta property="og:title">` |
| metaDescription | `<meta name="description">` |
| canonical | `<link rel="canonical">` |
| seoTitle (og) | `og:title` |
| ogImage | `<meta property="og:image">` |
| slug | URL path / lookup |
| seoKeywords | `<meta name="keywords">` (tuỳ chọn) |

## 3. Trạng thái hiện tại (Production)

- Database **có đủ** field SEO (Product 41).
- Website Runtime HTML dùng **title/description/og:image hardcoded** khác Database (nguồn `products-seed.js` không chứa field SEO — xem `PRODUCT_ROOT_CAUSE_ANALYSIS.md`).
- RELEASE VERIFICATION STEP 10: **FAIL** — Database ↔ Website Runtime HTML không khớp (seoTitle, metaDescription, og:title, og:image khác; canonical khớp).

## 4. Target architecture

Sau hoàn tất PRODUCT RUNTIME MIGRATION:
```
GET /product-{slug}.html
  → renderer gọi GET /v1/products/{id}
  → ghi <title>, meta description, canonical, og:title, og:image vào <head> từ Database
  → HTML trước/sau JS đều hiển thị SEO từ Database (đạt RELEASE STEP 10)
```

## 5. Definition of Done (SEO)

- [ ] `<title>` == Database `seoTitle`
- [ ] meta description == Database `metaDescription`
- [ ] canonical == Database `canonical`
- [ ] `og:title` == Database `seoTitle`
- [ ] `og:image` == Database `ogImage`
- [ ] Refresh/mở lại vẫn giữ dữ liệu

## Liên quan

- `PRODUCT_RUNTIME_ARCHITECTURE.md`
- `PRODUCT_RUNTIME_MIGRATION_PLAN.md`
- `docs/architecture/PRODUCT_SEO_STANDARD.md`
- `docs/checklists/PRODUCT_SEO_CHECKLIST.md`
- `docs/constitution/PRODUCT_SEO_WORKFLOW.md`
- `RELEASE_VERIFICATION_REPORT.md`
