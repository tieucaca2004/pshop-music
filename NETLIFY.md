# Deploy lên Netlify

Site hiện đang chạy tại: **https://pshop-music.netlify.app**

## Kiến trúc

- **Hosting**: Netlify (serverless functions cho SSR/API, không dùng `server.js`)
- **Database**: MySQL trên [Aiven](https://aiven.io) (free trial 30 ngày, $300 credit)
- **Build**: `@netlify/plugin-nextjs` tự nhận diện Next.js, build bằng `npm run build`

> ⚠️ **Lưu ý quan trọng**: Next.js 16 đổi `middleware.ts` thành `proxy.ts` và buộc chạy ở
> runtime `nodejs` (không hỗ trợ `edge` nữa). Netlify Next.js Runtime (`@netlify/plugin-nextjs@5.15.12`
> tại thời điểm deploy) **chưa hỗ trợ** kiểu proxy mới này — build sẽ lỗi ở bước "Edge Functions
> bundling" (`Cannot find module './chunks/[turbopack]_runtime.js'` hoặc `'./webpack-runtime.js'`).
>
> Giải pháp đã áp dụng: **bỏ hẳn `proxy.ts`**, chuyển việc bảo vệ route `/admin/*` vào:
> - `src/app/admin/(protected)/layout.tsx` — gọi `requireAdminPage()`, redirect nếu chưa đăng nhập
> - Mỗi server action trong `src/lib/actions/*.ts` — gọi `requireAdminAction()` ở đầu hàm
>
> Cách này hoạt động trên **mọi nền tảng** (Netlify, Hostinger, Vercel...), không phụ thuộc
> tính năng edge middleware. Nếu sau này Netlify cập nhật runtime hỗ trợ `proxy.ts`, có thể khôi
> phục middleware tập trung nếu muốn, nhưng không bắt buộc.

## Biến môi trường đã cấu hình trên Netlify

```
DATABASE_URL       mysql://avnadmin:***@pshop-music-db-....aivencloud.com:11772/defaultdb?ssl-mode=REQUIRED
JWT_SECRET         (random 64-hex-char string)
NEXT_PUBLIC_SITE_URL = https://pshop-music.netlify.app
```

Xem/sửa tại: `app.netlify.com/projects/pshop-music` → **Site configuration → Environment variables**,
hoặc qua CLI: `npx netlify env:list` / `npx netlify env:set KEY value`.

## Database (Aiven MySQL)

- `db/schema.sql` đã được import vào database `defaultdb`.
- `npm run seed` đã chạy để tạo danh mục/sản phẩm mẫu + tài khoản admin
  (`admin@pshopmusic.vn` / `Admin@123456` — **đổi mật khẩu trước khi public chính thức**).
- Kết nối SSL: `src/lib/db.ts` tự strip `ssl-mode=REQUIRED` khỏi URI và bật `ssl: { rejectUnauthorized: false }`
  vì chưa pin CA certificate của Aiven. Để chặt hơn, có thể tải CA cert từ Aiven dashboard và
  truyền vào `ssl.ca`.

⚠️ **Aiven free trial chỉ có 30 ngày.** Trước khi hết hạn, cần:
1. Nâng cấp lên plan trả phí trên Aiven, hoặc
2. Export dữ liệu (`mysqldump`) và chuyển sang MySQL khác (Hostinger Remote MySQL, Railway, v.v.)

## Lệnh deploy lại sau khi sửa code

```bash
git push                      # đẩy code lên GitHub (Netlify có thể auto-deploy nếu đã nối repo)
# hoặc deploy trực tiếp từ máy:
npx netlify deploy --prod --build
```

## Kết nối GitHub để auto-deploy (khuyến nghị)

Hiện site được deploy thủ công qua Netlify CLI. Để mỗi lần `git push` tự động deploy:

1. Vào **app.netlify.com/projects/pshop-music → Site configuration → Build & deploy**
2. Mục **Continuous deployment** → **Link repository** → chọn GitHub →
   `tieucaca2004/pshop-music`, branch `main`
3. Build command: `npm run build`, Publish directory: để plugin tự quản lý (không cần điền)
