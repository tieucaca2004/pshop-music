# PRODUCT ROOT CAUSE ANALYSIS

> Phân tích điểm đứt giữa Database Product SEO và Website Runtime HTML.
> Ngày: 2026-08-03 · Phương pháp: chỉ Runtime Evidence (không suy luận, không đọc source).

## Vấn đề quan sát (RELEASE VERIFICATION STEP 10)

Website Runtime HTML của Product 41 **không khớp** Database Product 41:

| Field | Database (Product 41) | Website Runtime HTML | Trạng thái |
|---|---|---|---|
| seoTitle | `LEXAR JUMPDRIVE P30 128GB – USB 3.2 Chính Hãng` | `USB Lexar JumpDrive P30 128GB – USB 3.2 Gen 1` | KHÁC |
| metaDescription | `Khám phá LEXAR JUMPDRIVE P30 128GB, USB 3.2 tốc…` | `USB Lexar JumpDrive P30 128GB chính hãng, tốc…` | KHÁC |
| canonical | `https://pshopmusic.com/product-lexar-p30-128gb.html` | `https://pshopmusic.com/product-lexar-p30-128gb.html` | KHỚP |
| og:title | (theo seoTitle) | `USB Lexar JumpDrive P30 128GB – USB 3.2 Gen 1` | KHÁC |
| og:image | firebasestorage URL | `https://images.microcms-assets.io/...` | KHÁC |

## Trace chuỗi (Runtime Evidence)

### STEP A — Database Product 41: PASS
GET `/v1/products/41` → HTTP 200, trả đủ `seoTitle`, `metaDescription`, `canonical`, `ogImage`, `slug`.

### STEP B — Website Runtime Network: PASS (ROOT CAUSE IDENTIFIED)
Theo dõi toàn bộ Runtime Network khi load `product-lexar-p30-128gb.html`:
- Không có request tới `/v1/products`
- Không có request tới Firebase RTDB / Firestore
- Không có JSON Product
- Chỉ có: trang HTML (200), `images/products/lexar-jumpdrive-p30-128gb.jpg` (404), `js/products-seed.js` (200)

**→ Website Runtime KHÔNG phát sinh request lấy dữ liệu Product/SEO trong quá trình render.**

### STEP C/D — Runtime Trace (HTML trước JS vs sau JS): PASS
HTML **trước JS** == HTML **sau JS** — SEO tồn tại trong HTML Response ban đầu (static/hardcoded), JS không đổi.

## Root Cause (điểm đứt đầu tiên)

**Website Product Detail render SEO từ HTML hardcoded trong `<head>` của `product-*.html` và dữ liệu display từ `js/products-seed.js` (static) — KHÔNG đọc Database Product 41 qua API.** Vì vậy mọi SEO thay đổi trong Database không bao giờ phản ánh lên Website Runtime HTML.

Nguyên nhân cụ thể: **`products-seed.js` không chứa field SEO nào** (seoTitle, metaDescription, canonical, ogImage, slug đều MISSING — chỉ có 12 field display). Do đó trang không có nguồn để render SEO từ dữ liệu chung; title/description/og:image bị hardcode trong HTML.

## Kết luận

Điểm đứt là **nguồn dữ liệu**: Website Product Detail dùng `products-seed.js` + HTML hardcode thay vì Database qua API. Giải pháp nằm ở **PRODUCT RUNTIME MIGRATION** (chuyển nguồn sang API Gateway `GET /v1/products/{id}` đọc Database) — xem `PRODUCT_RUNTIME_MIGRATION_PLAN.md`.

## Liên quan

- `PRODUCT_RUNTIME_ARCHITECTURE.md`
- `PRODUCT_RUNTIME_TRACE_RESULT.md`
- `PRODUCT_RUNTIME_MIGRATION_PLAN.md`
