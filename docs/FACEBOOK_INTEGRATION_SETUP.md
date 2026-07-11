# Facebook Page Integration — Runbook thiết lập hạ tầng thật

Sprint 12 Requirement #9 (Facebook AI V4 — Facebook Page Integration) yêu cầu OAuth đăng nhập Facebook thật + đăng bài thật lên Fanpage. Phần này **KHÔNG THỂ triển khai chỉ bằng code** — cần Chief Architect (chủ tài khoản Facebook/Meta Business thật) tự thực hiện các bước dưới đây trước khi tính năng hoạt động được. Đây là lý do KHÔNG khác gì bài học đã gặp ở Sprint 3 với `OPENAI_API_KEY` (xem `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md`) — chỉ khác là lần này còn có thêm bước **App Review** bắt buộc từ phía Meta, việc mà không ai làm thay chủ tài khoản được.

## Đã triển khai trong code (Sprint 12 Requirement #9)

- **`js/admin-facebook-connect.js`** — card "📘 Đăng tự động lên Facebook" trên `admin/ai/index.html`, hiển thị đúng 4 trạng thái (🟢 Connected/⚪ Not Connected/🟠 Token Expiring/🔴 Token Expired), dialog xin phép đúng nội dung đã yêu cầu, nút Ngắt kết nối ghi thật vào Firebase (`facebookConnection`).
- **`js/admin-ai.js`** — nút "📤 Đăng lên Facebook" trên mỗi phiên bản Draft Facebook AI V3 (`admin/ai/drafts.html`) — kiểm tra trạng thái kết nối thật, luôn báo rõ ràng thay vì giả vờ đăng thành công.
- **`database.rules.json`** — đã thêm rule cho node `facebookConnection` (admin mới ghi được, đã đăng nhập mới đọc được) — **CHƯA deploy**, xem mục "Việc cần Chief Architect làm" bên dưới.
- **KHÔNG có OAuth thật, KHÔNG gọi Facebook Graph API thật** — mọi hành động "Kết nối"/"Đổi Fanpage"/"Kết nối lại" đều hiển thị thông báo rõ ràng hướng dẫn hoàn tất các bước dưới đây, thay vì giả vờ hoạt động.

## Việc cần Chief Architect tự làm (không thể làm thay)

### 1. Tạo Facebook App trên Meta for Developers
1. Vào https://developers.facebook.com/ (đăng nhập bằng tài khoản Facebook quản lý Fanpage Pshop Music).
2. Tạo App mới, loại **Business**.
3. Thêm sản phẩm **"Facebook Login for Business"** và **"Pages API"**.

### 2. Xin quyền (permissions) cần thiết
- `pages_show_list` — lấy danh sách Fanpage đang quản lý.
- `pages_manage_posts` — đăng bài lên Fanpage.
- `pages_read_engagement` — đọc trạng thái bài đăng (tuỳ chọn, để hiển thị kết quả đăng).

### 3. App Review (bắt buộc, chỉ chủ tài khoản làm được)
- Ở **Development Mode**, ứng dụng chỉ hoạt động cho chính tài khoản Admin/Developer/Tester của App — đủ để bạn tự test.
- Để **Live Mode** (dùng thật, đăng cho khách hàng nếu sau này mở rộng đa người dùng) — Meta yêu cầu **App Review** thủ công cho `pages_manage_posts` (quay video demo luồng sử dụng, giải trình mục đích). Nếu chỉ dùng cho 1 Fanpage của chính Pshop Music, có thể ở Development Mode là đủ, không bắt buộc App Review.

### 4. Cấu hình OAuth Redirect URI
- Trong App Settings → Facebook Login → Valid OAuth Redirect URIs, thêm:
  `https://us-central1-pshop-music.cloudfunctions.net/facebookOAuthCallback`
  (URL Cloud Function sẽ tạo ở bước 6 — có thể khác nếu đặt tên hàm khác).

### 5. Lấy App ID + App Secret
- **App ID**: công khai, an toàn để đặt trong code phía client (tương tự cách các trang OAuth khác hoạt động).
- **App Secret**: **TUYỆT ĐỐI KHÔNG đặt trong code/client** — phải lưu trong Google Secret Manager, chỉ Cloud Function phía server được đọc (giống hệt cách `OPENAI_API_KEY` đang được xử lý, xem `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md`).

### 6. Deploy Cloud Function mới xử lý OAuth + Publish
Cần thêm vào `functions/index.js` (chưa viết — sẽ cần 1 Requirement riêng sau khi có App ID/Secret thật để viết và test được):
- `facebookOAuthCallback` — nhận `code` từ Facebook redirect, đổi lấy User Access Token → đổi tiếp lấy danh sách Page + Page Access Token (long-lived) → ghi metadata (không ghi token) vào `facebookConnection`, ghi token thật vào 1 node/collection server-only (Admin SDK, không có Client Rule nào cho phép đọc).
- `facebookPublish` — nhận `draftId`, đọc token thật phía server, gọi `POST /{page-id}/feed` hoặc `/{page-id}/photos` (Graph API) để đăng Caption/Ảnh/Hashtags/Product Link/YouTube link, trả về `facebookPostId` để lưu lại vào Draft.

### 7. Deploy Database Rules đã cập nhật
```
firebase deploy --only database
```
(rule cho `facebookConnection` đã có sẵn trong `database.rules.json`, chỉ cần deploy khi sẵn sàng dùng thật).

### 8. Cập nhật hằng số App ID trong code
Sau khi có App ID thật, cần 1 dòng code nhỏ để bật OAuth thật thay vì thông báo "chưa cấu hình" — sẽ làm ở Requirement tiếp theo, sau khi có đủ App ID + Cloud Function đã deploy.

## Checklist xác minh trước khi coi Facebook AI V4 là PASS thật

- [ ] Facebook App đã tạo, có App ID thật.
- [ ] App Secret đã lưu trong Secret Manager (KHÔNG trong code).
- [ ] OAuth Redirect URI đã cấu hình đúng.
- [ ] Cloud Function `facebookOAuthCallback` + `facebookPublish` đã viết + deploy.
- [ ] `firebase deploy --only database` đã chạy (rule `facebookConnection` đã live).
- [ ] Founder tự đăng nhập Facebook thật, chọn đúng Fanpage, thấy card chuyển 🟢 Connected.
- [ ] Founder Generate 1 bài Facebook AI V3, bấm "Đăng lên Facebook" thật, xác nhận bài xuất hiện trên Fanpage thật + `facebookPostId` được lưu lại.

Cho tới khi checklist trên hoàn tất, Facebook AI V4 vẫn ở trạng thái **"Chỉ khung UI an toàn — chưa hoạt động thật"**, không được tuyên bố PASS.
