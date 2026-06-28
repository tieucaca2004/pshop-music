# Hướng dẫn Deploy Pshop Music lên Hostinger

Website được xây bằng **Next.js (Node.js)** + **MySQL** (kết nối trực tiếp qua `mysql2`, không dùng ORM
để tránh phụ thuộc native binary phức tạp trên shared hosting).

## 1. Yêu cầu trên Hostinger

- Plan **Premium/Business Hosting** (hoặc cao hơn) có hỗ trợ **Node.js** trong hPanel.
- Node.js phiên bản **20.9+** (xem mục "Setup Node.js App" trong hPanel để chọn version).

## 2. Tạo database MySQL

1. Vào **hPanel → Databases → MySQL Databases**.
2. Tạo database mới (ví dụ `u123_pshopmusic`), tạo user và gán full privileges.
3. Mở **phpMyAdmin**, chọn database vừa tạo, vào tab **Import**, chọn file [`db/schema.sql`](db/schema.sql)
   trong source code và Import để tạo bảng.
4. Ghi lại thông tin kết nối: host (thường là `localhost`), tên database, username, password.

## 3. Tạo Node.js App trên Hostinger

1. Vào **hPanel → Advanced → Setup Node.js App**.
2. Bấm **Create Application**:
   - **Node.js version**: 20.x hoặc mới hơn.
   - **Application mode**: Production.
   - **Application root**: thư mục chứa code, ví dụ `pshop-music`.
   - **Application URL**: domain hoặc subdomain của bạn (ví dụ `pshopmusic.vn`).
   - **Application startup file**: `server.js`.
3. Sau khi tạo, Hostinger cung cấp lệnh `source ... && cd ...` để vào đúng môi trường Node — dùng lệnh
   này trong **Terminal** (hPanel → Advanced → Terminal) cho các bước tiếp theo.

## 4. Đưa code lên server

Có 2 cách, chọn 1:

**Cách A — qua Git (khuyến nghị):**
```bash
cd ~/domains/your-domain.com/pshop-music   # đúng theo Application root đã tạo
git clone https://github.com/<username>/pshop-music.git .
```

**Cách B — qua File Manager / FTP:** upload toàn bộ source code (trừ `node_modules`, `.next`) vào
Application root.

## 5. Cấu hình biến môi trường

Trong thư mục app, tạo file `.env` (copy từ `.env.example`) với thông tin thật:

```env
DATABASE_URL="mysql://USERNAME:PASSWORD@localhost:3306/u123_pshopmusic"
JWT_SECRET="<chuỗi ngẫu nhiên dài, ví dụ tạo bằng `openssl rand -hex 32`>"
NEXT_PUBLIC_SITE_URL="https://pshopmusic.vn"
SEED_ADMIN_EMAIL="admin@pshopmusic.vn"
SEED_ADMIN_PASSWORD="<mật khẩu mạnh, chỉ dùng để seed lần đầu>"
```

> Lưu ý: cũng có thể nhập các biến này trực tiếp trong hPanel → Setup Node.js App → mục
> **Environment variables**, thay cho file `.env`.

## 6. Cài đặt & build

Trong Terminal (đã `source` đúng môi trường Node ở bước 3):

```bash
npm install
npm run build
```

Seed dữ liệu mẫu (danh mục, sản phẩm placeholder, tài khoản admin) — chỉ chạy **một lần**:

```bash
npm run seed
```

Sau khi seed xong, đăng nhập `/admin/login` bằng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, vào
trang sản phẩm để **thay ảnh/giá/mô tả thật**, sau đó nên xoá `SEED_ADMIN_PASSWORD` khỏi `.env` hoặc
đổi mật khẩu admin (tính năng đổi mật khẩu admin có thể bổ sung sau nếu cần).

## 7. Khởi động ứng dụng

Quay lại **hPanel → Setup Node.js App**, bấm **Restart** trên ứng dụng. Hostinger sẽ tự chạy
`node server.js` (file startup đã cấu hình ở bước 3) và lấy `PORT` qua biến môi trường tự động.

Truy cập domain để kiểm tra. Nếu lỗi, xem log tại mục **Logs** trong Setup Node.js App.

## 8. Cập nhật code sau này

```bash
cd ~/domains/your-domain.com/pshop-music
git pull
npm install
npm run build
```
Sau đó bấm **Restart** trong Setup Node.js App.

## 9. Trỏ domain

Nếu domain mua trên Hostinger và hosting cùng tài khoản, domain tự động trỏ đúng khi tạo Node.js App
với Application URL là domain đó. Nếu domain ở nơi khác, cập nhật nameserver hoặc DNS A/CNAME record
theo hướng dẫn trong hPanel → Domains.
