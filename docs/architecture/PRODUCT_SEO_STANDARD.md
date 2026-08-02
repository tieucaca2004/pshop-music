# PRODUCT SEO STANDARD (Platform Standard)

**Task:** PRODUCT-SEO-01
**Ngày:** 2026-08-02
**Status:** SOURCE OF TRUTH — mọi sản phẩm mới phải reuse chuẩn này
**Type:** Product SEO Configuration — KHÔNG áp dụng cho Website/Global SEO (`seoSettings`)

---

## 1. Database Schema (node `products/{productId}`)

Các field Product SEO lưu trực tiếp trong node product:

| Field | Type | Mô tả |
|---|---|---|
| `seoTitle` | string | Tiêu đề SEO sản phẩm (<=60 ký tự) |
| `metaDescription` | string | Mô tả meta (<=160 ký tự) |
| `seoKeywords` | string[] | Mảng từ khóa |
| `slug` | string | Đường dẫn URL sản phẩm (viết-thường-gạch-nối) |
| `canonical` | string | URL canonical đầy đủ |
| `ogImage` | string | URL ảnh OpenGraph (rơi về `image` nếu trống) |

Ví dụ node `products/41`:
```json
{
  "seoTitle": "USB Lexar JumpDrive P30 128GB – USB 3.2 Chính Hãng",
  "metaDescription": "USB Lexar JumpDrive P30 128GB tốc độ đọc 450MB/s, vỏ kim loại...",
  "seoKeywords": ["USB Lexar", "JumpDrive P30", "USB 3.2"],
  "slug": "lexar-jumpdrive-p30-128gb-usb-3-2",
  "canonical": "https://pshopmusic.com/product-lexar-p30-128gb.html",
  "ogImage": ""
}
```

## 2. Product SEO Fields — định nghĩa

6 field bắt buộc: `seoTitle`, `metaDescription`, `seoKeywords`, `slug`, `canonical`, `ogImage`.

## 3. Admin Form Mapping (admin/products.html)

| ID element | Field | Notes |
|---|---|---|
| `pSeoTitle` | seoTitle | input text |
| `pSeoDescription` | metaDescription | textarea |
| `pSeoKeywords` | seoKeywords | input, tách dấu phẩy |
| `pCanonical` | canonical | input url |
| `pOgImage` | ogImage | input url |
| `pSlug` | slug | input text |

## 4. Frontend Mapping (js/admin-products.js)

- **Load:** `editProduct(id)` — đọc từ product node, gán vào các element `pSeo*`.
- **Save:** `saveProduct()` — gom 6 field vào `data` object → `DB.update(id, data)`.
- Dùng Firebase SDK (luồng Admin UI), không qua API Gateway cho save.

## 5. Backend Mapping

- **Save/Update:** `DB.update(id, data)` (db.js) — ghi thẳng node `products/{id}` (client SDK). Reuse — không hardcode.
- **Read:** `DB.get(id)` / GET product — trả product node (gồm SEO fields).
- API Gateway PATCH `/v1/products` yêu cầu role write — không phải luồng UI chính.

## 6. Renderer Mapping (Product Detail page)

`product-lexar-p30-128gb.html` — script `DB.get('41')` render vào `<head>` runtime:
- `<title>` ← `seoTitle` + " - Pshop Music"
- `<meta name="description">` ← `metaDescription`
- `<meta name="keywords">` ← `seoKeywords.join(', ')`
- `<link rel="canonical">` ← `canonical`
- `og:title`, `og:description`, `og:image`, `og:url` ← SEO fields từ DB
- **KHÔNG hardcode** — mọi giá trị đọc từ Product Database.

## 7. Runtime Flow

```
Founder → Admin (products.html) → edit → DB.update(product, {seo*}) → Firebase
  → Product Detail page → DB.get(id) → ghi <head> (title/meta/og/canonical) → View Source
```

## 8. Founder Workflow

Login → Product Edit → chỉnh 6 field SEO → Save → Refresh → Reopen → View Product → View Source → PASS

## 9. Definition of Done

PASS khi: ✓ Founder chỉnh được ✓ Save ✓ Refresh ✓ Reopen ✓ Database ✓ Product Detail ✓ View Source ✓ Production ✓ Không mất dữ liệu

## 10. Coding Rules

- Chỉ thao tác Product SEO — KHÔNG đụng `seoSettings`/Website/Global SEO.
- Reuse `DB.get`/`DB.update`/product node — không duplicate logic.
- Không hardcode value renderer — phải đọc từ DB.

## 11. Testing Rules

- node --check KHÔNG phải Runtime PASS — phải verify Production (curl/fetch/browser HTML thật).
- Verify View Source (không chỉ DevTools) — Google crawler đọc được.

## 12. Deployment Rules

- Commit → Push → Deploy Netlify → Verify Production URL.

## 13. Product SEO Standard (kết luận)

Product SEO = 6 field trong node `products/{id}` + Admin form (DB.update) + Renderer (DB.get → head). KHÔNG áp dụng seoSettings cho product.
