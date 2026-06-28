# Pshop Music

Website thương mại điện tử cho shop thiết bị DJ — loa kiểm âm, bàn DJ, tai nghe và phụ kiện.
Xây dựng bằng **Next.js (App Router)** + **MySQL** (qua `mysql2`), có sẵn **Admin Panel** quản lý
sản phẩm/danh mục/yêu cầu liên hệ.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **TypeScript**, **Tailwind CSS v4**
- **MySQL** kết nối trực tiếp qua `mysql2` (không dùng ORM)
- **JWT cookie** cho xác thực admin (`proxy.ts` bảo vệ `/admin` và `/api/admin`)

## Bắt đầu (development)

1. Copy `.env.example` thành `.env` và điền `DATABASE_URL` (MySQL local hoặc remote).
2. Import schema: chạy file [`db/schema.sql`](db/schema.sql) vào database của bạn.
3. Cài dependencies và chạy:

```bash
npm install
npm run seed     # tạo danh mục/sản phẩm mẫu + tài khoản admin
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000). Trang quản trị tại `/admin/login`
(tài khoản mặc định in ra console sau khi `npm run seed`).

## Cấu trúc chính

```
db/schema.sql            Schema MySQL (chạy 1 lần để tạo bảng)
scripts/seed.ts           Script tạo dữ liệu mẫu
src/app/                  Trang web (App Router)
  ├─ (storefront pages)   /, /danh-muc/[slug], /san-pham/[slug], /lien-he
  └─ admin/                Trang quản trị (yêu cầu đăng nhập)
src/app/api/               Route handlers (API công khai + admin auth)
src/lib/                   Truy vấn DB, auth, server actions
src/components/            UI components
server.js                  Custom Node server (dùng để deploy lên hosting truyền thống)
```

## Build & chạy production

```bash
npm run build
npm run start    # chạy server.js, đọc PORT từ biến môi trường
```

## Deploy lên Hostinger

Xem hướng dẫn chi tiết tại [`DEPLOY.md`](DEPLOY.md).
