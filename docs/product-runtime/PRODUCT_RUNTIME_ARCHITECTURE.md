# PRODUCT RUNTIME ARCHITECTURE

> Kiến trúc vận hành (Runtime) của trang Product Detail trên production website `pshopmusic.com`.
> Nguồn sự thật: Runtime Evidence thu ngày 2026-08-03 (không suy luận, không đọc source).

## 1. Kiến trúc vận hành hiện tại (Production)

| Thành phần | Vai trò |
|---|---|
| `js/products-seed.js` | Static asset (HTTP 200, ~36KB) — nguồn dữ liệu display cho Product Detail |
| HTML tĩnh trong `product-*.html` | Chứa `<title>`, meta description, canonical, `og:*` — **hardcoded bên trong `<head>`** |
| Firebase Realtime Database (RTDB) | Lưu Product data (qua API Gateway `GET /v1/products/{id}`) |
| API Gateway | `https://us-central1-pshop-music.cloudfunctions.net/apiGateway` |

## 2. Pipeline render hiện tại

```
GET /product-lexar-p30-128gb.html
  → HTTP Response (HTML static, SEO hardcoded trong <head>)
  → products-seed.js (static JS, 12 field display)
  → Browser render
```

## 3. Runtime Evidence — nguồn sinh SEO

**PRODUCT RUNTIME TRACE (2026-08-03):**
- HTML **trước JS** (HTTP Response thô) == HTML **sau JS** (browser post-render)
  - title: `USB Lexar JumpDrive P30 128GB – USB 3.2 Gen 1`
  - meta description: `USB Lexar JumpDrive P30 128GB chính hãng, tốc…`
  - canonical: `https://pshopmusic.com/product-lexar-p30-128gb.html`
  - og:image: `https://images.microcms-assets.io/...`
- Kết luận: **SEO tồn tại trong HTML Response ban đầu (static/server-served). JS Runtime KHÔNG thay đổi title/meta/canonical/og.**

**PRODUCT RUNTIME NETWORK (2026-08-03):**
- Không có request tới `/v1/products`
- Không có request tới Firebase RTDB / Firestore
- Không có JSON Product
- Chỉ có: `product-lexar-p30-128gb.html` (200, HTML), `images/products/lexar-jumpdrive-p30-128gb.jpg` (404), `js/products-seed.js` (200, JS)
- Kết luận: **Website Runtime không phát sinh request lấy dữ liệu Product/SEO trong quá trình render.**

## 4. Field products-seed.js cung cấp

| Field | Vai trò | Database Product 41 |
|---|---|---|
| id | lookup + render | MATCH |
| name | tiêu đề hiển thị | MATCH |
| brand | brand display | MATCH |
| category / categoryLabel | category + label | MATCH |
| price | giá | MATCH |
| image | ảnh | MATCH |
| description | mô tả | MATCH |
| specs | thông số | MATCH |
| status | trạng thái | MATCH |
| badgeText | badge | MATCH |
| createdAt | — | MATCH |

## 5. Field SEO — MISSING trong products-seed.js

| Field | Database | products-seed.js | Trạng thái |
|---|---|---|---|
| seoTitle | ✅ | ❌ | **MISSING** |
| metaDescription | ✅ | ❌ | **MISSING** |
| canonical | ✅ | ❌ | **MISSING** |
| ogImage | ✅ | ❌ | **MISSING** |
| slug | ✅ | ❌ | **MISSING** |
| seoKeywords / images / faq / features | ✅ | ❌ | **MISSING** |

> Đây là lý do Website Runtime HTML dùng title/description/og:image **hardcoded** khác Database: nguồn `products-seed.js` không có field SEO nào.

## 6. Target architecture (PRODUCT RUNTIME MIGRATION)

```
GET /product-{slug}.html
  → JS renderer gọi GET /v1/products/{id} (API Gateway → RTDB)
  → Ghi <title>, meta description, canonical, og:* vào <head> từ Database
  → Render display fields (name/price/image/specs) từ Database
```

Xem chi tiết Migration Plan tại `PRODUCT_RUNTIME_MIGRATION_PLAN.md`.

## 7. Tài liệu liên quan

- `PRODUCT_SEO_ARCHITECTURE.md` — kiến trúc SEO
- `PRODUCT_RUNTIME_TRACE_RESULT.md` — kết quả trace runtime
- `PRODUCT_RUNTIME_MIGRATION_PLAN.md` — kế hoạch migration
- `docs/architecture/PRODUCT_SEO_STANDARD.md`
