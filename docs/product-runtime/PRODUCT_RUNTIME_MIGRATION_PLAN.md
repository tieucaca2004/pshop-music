# PRODUCT RUNTIME MIGRATION PLAN

> Kế hoạch thay thế nguồn dữ liệu Product Detail từ Runtime hiện tại (`products-seed.js` + HTML hardcode) sang Product Database (qua API Gateway).
> Trạng thái: **Chờ Founder phê duyệt** — chưa viết code, chưa deploy, chưa refactor.
> Ngày lập: 2026-08-03.

## 1. Nơi Product Detail đang lấy dữ liệu (Current Source)

| # | Nguồn | Runtime Evidence | Vai trò |
|---|---|---|---|
| 1 | `js/products-seed.js` (static asset) | HTTP 200, ~36KB, 12 field display (id/name/brand/category/price/image/description/specs/status/badgeText/categoryLabel/createdAt) — **không có field SEO** | Duy nhất render Product Detail + SEO |
| 2 | HTML tĩnh trong `product-*.html` (SEO hardcode trong `<head>`) | HTML trước JS == HTML sau JS | `<title>`, meta description, canonical, og:* |

## 2. Nơi sẽ đổi sang Product Database

| # | Bước | Chuyển từ | Sang |
|---|---|---|---|
| 1 | Lấy dữ liệu Product Detail | `products-seed.js` (static) | API Gateway `GET /v1/products/{id}` (đọc RTDB) |
| 2 | `<title>` | HTML hardcode | `data.seoTitle` |
| 3 | meta description | HTML hardcode | `data.metaDescription` |
| 4 | canonical | HTML hardcode | `data.canonical` |
| 5 | og:title / og:image | HTML hardcode | `data.seoTitle` / `data.ogImage` |
| 6 | Display fields (name/price/image/specs...) | `products-seed.js` | API `data.*` |

## 3. Mapping Field — Current Source → Database

| Current Source (products-seed.js) | Database Field | Trạng thái |
|---|---|---|
| id | id | MATCH |
| name | name | MATCH |
| brand | brand | MATCH |
| category / categoryLabel | category / categoryLabel | MATCH |
| price | price | MATCH |
| image | image | MATCH |
| description | description | MATCH |
| specs | specs | MATCH |
| status | status | MATCH |
| badgeText | badgeText | MATCH |
| createdAt | createdAt | MATCH |
| *(HTML title)* | seoTitle | **MISSING → DB** |
| *(HTML meta desc)* | metaDescription | **MISSING → DB** |
| *(HTML canonical)* | canonical | **MISSING → DB** |
| *(HTML og:image)* | ogImage | **MISSING → DB** |
| — | slug | MISSING → DB |
| — | seoKeywords / images / faq / features | MISSING → DB |

## 4. File cần thay đổi

| File | Thay đổi |
|---|---|
| `product-lexar-p30-128gb.html` (và các `product-*.html`) | Fetch API Product; render SEO + display từ Database |
| `js/products-seed.js` | Không còn là nguồn chính cho Product Detail |
| Renderer script trong page | Gọi `GET /v1/products/{id}` + ghi `<head>` + DOM |

## 5. API sử dụng

- **Primary:** `GET https://us-central1-pshop-music.cloudfunctions.net/apiGateway/v1/products/{id}`
- **Fallback (chỉ đọc):** RTDB `https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app`
- Bỏ việc dùng `products-seed.js` cho Product Detail.

## 6. Definition of Done

- [ ] Product Detail load từ `GET /v1/products/{id}` (không dùng `products-seed.js`)
- [ ] `<title>` == Database `seoTitle`
- [ ] meta description == Database `metaDescription`
- [ ] canonical == Database `canonical`
- [ ] `og:title` == Database `seoTitle`
- [ ] `og:image` == Database `ogImage`
- [ ] Display fields (name/price/image/specs) khớp Database
- [ ] HTML trước/sau JS hiển thị đúng SEO từ Database
- [ ] Đạt STEP 10 RELEASE VERIFICATION (Database ↔ Website Runtime HTML khớp)

## Trạng thái

**AWAITING FOUNDER APPROVAL** — chưa thực thi. Khi Founder phê duyệt, chuyển sang bước migration (không refactor, không đổi logic, không mở workflow khác).
