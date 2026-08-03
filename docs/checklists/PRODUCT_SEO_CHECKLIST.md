# PRODUCT SEO CHECKLIST

**Task:** PRODUCT-SEO-01
**Ngày:** 2026-08-02
**Mục đích:** Check-list để mỗi lần SEO **sản phẩm MỚI** chỉ cần tick từng mục — không tự tạo cách làm.
**Tham chiếu:** `docs/architecture/PRODUCT_SEO_STANDARD.md` + `docs/constitution/PRODUCT_SEO_WORKFLOW.md`
**Quy tắc:** Chỉ thao tác Product SEO — KHÔNG đụng `seoSettings`/Website/Global SEO.

---

## 1. PHẦN 1 — DATABASE (Product node)

- [ ] Xác định đúng `productId` (không đoán — đọc từ list sản phẩm)
- [ ] Verify node `products/{productId}` tồn tại
- [ ] `seoTitle` có (string, <=60 ký tự)
- [ ] `metaDescription` có (string, <=160 ký tự)
- [ ] `seoKeywords` có (mảng string)
- [ ] `slug` có (viết-thường-gạch-nối)
- [ ] `canonical` có (URL đầy đủ)
- [ ] `ogImage` có (URL; rơi về `image` nếu trống)

## 2. PHẦN 2 — ADMIN PRODUCT FORM

- [ ] Form có `pSeoTitle`
- [ ] Form có `pSeoDescription`
- [ ] Form có `pSeoKeywords`
- [ ] Form có `pCanonical`
- [ ] Form có `pOgImage`
- [ ] Form có `pSlug`
- [ ] `editProduct()` load 6 field từ product node
- [ ] `saveProduct()` ghi 6 field vào `data` → `DB.update(id, data)`

## 3. PHẦN 3 — BACKEND

- [ ] Save qua Firebase SDK (`DB.update`) — Reuse, không hardcode
- [ ] Read qua `DB.get(id)` / GET product — trả node đủ SEO
- [ ] KHÔNG tạo duplicate logic

## 4. PHẦN 4 — RENDERER (Product Detail)

- [ ] Product Detail page có script render SEO
- [ ] `<title>` ← `seoTitle` (từ DB)
- [ ] `<meta name="description">` ← `metaDescription` (từ DB)
- [ ] `<meta name="keywords">` ← `seoKeywords` (từ DB)
- [ ] `<link rel="canonical">` ← `canonical` (từ DB)
- [ ] `og:title` ← `seoTitle`
- [ ] `og:description` ← `metaDescription`
- [ ] `og:image` ← `ogImage` (rơi về `image`)
- [ ] `og:url` ← URL product
- [ ] KHÔNG hardcode giá trị SEO — phải đọc từ DB

## 5. PHẦN 5 — PRODUCTION

- [ ] Commit (message mô tả PRODUCT-SEO)
- [ ] Push lên `feature/cms-ai-sprint2`
- [ ] Deploy Netlify (site `48256e20` / pshopmusic.com)
- [ ] Verify Production URL trả về 200

## 6. PHẦN 6 — FOUNDER WORKFLOW (verify runtime thật)

- [ ] Founder login
- [ ] Mở Product Edit
- [ ] Chỉnh 6 field SEO
- [ ] Save
- [ ] Refresh
- [ ] Reopen Product Edit — dữ liệu còn
- [ ] View Product Detail
- [ ] View Source (không chỉ DevTools)
- [ ] Google crawler đọc được (title/description/canonical/OG)

## 7. PHẦN 7 — VERIFY PRODUCTION HTML (View Source)

- [ ] `<title>` = seoTitle từ Product DB
- [ ] `<meta name="description">` = metaDescription từ Product DB
- [ ] `<meta name="keywords">` = seoKeywords từ Product DB
- [ ] `<link rel="canonical">` = canonical từ Product DB
- [ ] `<meta property="og:title">` = seoTitle
- [ ] `<meta property="og:description">` = metaDescription
- [ ] `<meta property="og:image">` = ogImage/image
- [ ] `<meta property="og:url">` = URL product
- [ ] KHÔNG lấy từ Website/Global SEO (`seoSettings`)

## 8. KẾT LUẬN

- [ ] Toàn bộ mục trên PASS
- [ ] Không mất dữ liệu
- [ ] PRODUCT_SEO_STANDARD.md đã chuẩn
- [ ] PRODUCT_SEO_WORKFLOW.md đã chuẩn
- [ ] DỪNG — không audit/refactor thêm, không mở rộng sản phẩm khác

---

**GHI CHÚ:** Node --check KHÔNG phải Runtime PASS — phải verify Production (curl/fetch/View Source thật).
