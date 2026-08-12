# PSH Project Context

**Cập nhật:** 2026-08-10
**Branch:** `feature/cms-ai-sprint2`
**Repo:** `https://github.com/tieucaca2004/pshop-music.git`
**Production:** https://pshopmusic.com (Netlify auto-deploy từ GitHub push) · Firebase project `pshop-music`

## Điểm đang làm
- **PRODUCT SEO** cho từng sản phẩm trong catalog Firebase (`products/`). Mỗi sản phẩm có trang `product-<slug>.html` + canonical + JSON-LD + sitemap.
- Cơ chế render: `js/product-runtime-render.js` đọc `DB.get(PRODUCT_ID)` từ Firebase, render SEO title/meta động. Trang HTML lưu sẵn JSON-LD tĩnh (Product + FAQ + Breadcrumb) cho crawler.

## Đã hoàn thành (PRODUCT SEO)
- id 41 LEXAR JumpDrive P30 128GB — `product-lexar-p30-128gb.html` (commit cũ)
- id 42 Tai nghe Sol Republic — `product-sol-republic-v10.html` + schema OfferCatalog (commit `3db4e34`, `b43398f`)
- id 44 ALPHATHETA XDJ-AN — `product-alphatheta-xdj-an-portable-dj-system.html` (commit `af38a76`, pushed + verified production 200)

## Image workflow (2026-08-10)
- Ảnh thật id 41 + id 44 do Founder cung cấp đã được xử lý + upload lên Firebase Storage (`firebaseStorageDownloadTokens` — URL ổn định dài hạn, không phụ thuộc token ngắn).
- Cập nhật `products/41.image` + `.ogImage` và `products/44.image` + `.ogImage` (URL ổn định, HTTP 200).
- JSON-LD image đã thêm vào 2 trang HTML (id 41 ban đầu `image: None`, id 44 dùng URL cũ token-expired → đã thay bằng URL mới).
- Ảnh: id 41 = hộp Lexar P30 trên nền bàn gỗ (chưa tách nền e-commerce — ghi nhận: cần Founder duyệt hoặc xử lý bg sau). id 44 = XDJ-AN nền trắng/xám sản phẩm (sạch).
- **Blocked cũ đã gỡ:** billing account `01B88C-CA9680-D7BE63` từng delinquent (403 storage) — Founder đã fix payment method, storage hoạt động lại.

## Blocked
- **id 1 PIONEER XDJ-RX3** — DATA COLLISION trong Firebase: `description` chứa nội dung của XDJ-AN (không phải XDJ-RX3). Không tạo trang SEO, không sửa Firebase. Seed (`js/products-seed.js` id 1) có description XDJ-RX3 sạch → nguồn sự thật tiềm năng để sửa sau khi Founder duyệt.

## NEXT ACTION
- SEO id 2 ALPHATHETA OMNIS-DUO Portable DJ System (data sạch, verified).

## PSH Media Center — Generate Image PASS (2026-08-12)
- Engine: openaiProxy action `generate_image` → OpenAI Images API `/v1/images/generations`, model `gpt-image-2` (đổi từ dall-e-3), body `{model:'gpt-image-2', prompt, size(1:1|4:5|16:9 map 1024|1792), n:1}` — KHÔNG gửi `response_format` (gpt-image-2 luôn trả base64; gửi sẽ 400 "Unknown parameter 'response_format'").
- Response: `data[0].b64_json` → buffer → Firebase Storage `ai-generated/<ts>-<rand>.png`, public download URL `https://firebasestorage.googleapis.com/v0/b/pshop-music.firebasestorage.app/o/<path>?alt=media&token=<uuid>`.
- Verified real: HTTP 200, image/png, size 1024x1024. Dùng token từ metadata.firebaseStorageDownloadTokens.
- IAM cần: secretmanager.secretAccessor + viewer + secretVersionAdder (add secret version), iam.serviceAccountUser trên compute SA `241363789627-compute@...` (deploy openaiProxy Gen2).
- Page: /psh/platform/media-center/ (wired AdminImageAI.runGeneration + job/poll/draft). Video/voice = stub.
