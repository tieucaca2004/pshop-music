# Facebook Page Integration — Runbook thiết lập hạ tầng thật

**Cập nhật (Sprint 12 — Facebook AI V5, Facebook Configuration & Auto Publish):** TOÀN BỘ code thật đã được viết — OAuth flow thật (client + Cloud Function), Page Selection UI, quản lý Token, Publish thật lên Graph API (Caption/Ảnh/Hashtag/Product Link/YouTube link), theo dõi trạng thái Publishing/Published/Failed. **KHÔNG có gì trong danh sách dưới đây còn "chưa viết"** — chỉ còn đúng phần hạ tầng bên ngoài (Meta App thật + App ID/Secret + deploy) mà chỉ Chief Architect tự làm được, giống hệt bài học `OPENAI_API_KEY` ở Sprint 3. Xem mục "Việc cần Chief Architect tự làm" — đã cập nhật, không còn mục nào ghi "cần Requirement riêng sau" nữa.

Sprint 12 Requirement #9 (Facebook AI V4) ban đầu CHỈ xây khung UI an toàn (theo đúng phạm vi Chief Architect chọn lúc đó). Facebook AI V5 nối tiếp bằng TOÀN BỘ code thật còn thiếu — do KHÔNG có Meta App nào tồn tại tại thời điểm viết Requirement này, phần OAuth/Graph API/Cloud Function **chưa thể chạy thử thật**, chỉ được kiểm thử bằng Node `vm` với Facebook Graph API giả lập (mock) theo đúng spec API chính thức của Meta.

## Đã triển khai trong code (Sprint 12 — Facebook AI V4 + V5)

- **`js/admin-facebook-connect.js`** — card kết nối tại `admin/facebook-settings.html` (Settings > Facebook Configuration, trang MỚI — dọn khỏi `admin/ai/index.html` cũ), hiển thị đúng 4 trạng thái (🟢/⚪/🟠/🔴) — trạng thái Token Expiring/Expired giờ được TỰ TÍNH LẠI mỗi lần hiển thị (so `tokenExpiresAt` với đồng hồ hiện tại), không dựa vào giá trị tĩnh đã ghi từ trước. `proceedOAuth()` giờ redirect THẬT sang Facebook Login Dialog (dùng `state` nonce ghi vào `facebookOAuthState/{state}` để Cloud Function callback biết yêu cầu của Founder nào). Sau khi Facebook redirect về (`?oauth=success`), tự đọc `facebookPendingPages/{uid}` và hiển thị Page Selection (tên + ảnh đại diện) để Founder chọn Default Page, gọi Cloud Function `facebookSelectPage` khi bấm LƯU.
- **`functions/index.js`** — 3 Cloud Function mới:
  - `facebookOAuthCallback` — nhận redirect từ Facebook (code+state), đổi code → Short-Lived → Long-Lived User Token (~60 ngày) → lấy danh sách Fanpage + Page Access Token riêng từng Page qua `/me/accounts`. Token thật CHỈ ghi vào node server-only `facebookPageTokens/{uid}` — client chỉ nhận metadata (`facebookPendingPages/{uid}`).
  - `facebookSelectPage` — Founder chọn 1 Page, copy đúng token của Page đó sang `facebookActiveToken` (server-only, node DUY NHẤT `facebookPublish` đọc), ghi `facebookConnection` (chỉ metadata).
  - `facebookPublish` — đăng thật lên Graph API: nhiều ảnh dùng pattern `attached_media` (upload từng ảnh `published:false` lấy `media_fbid`, gộp vào 1 bài `/feed`), trả về `facebookPostId` thật.
- **`js/admin-ai.js`** — `publishVersionToFacebook(draftId, versionLabel)` giờ đăng THẬT (không còn chỉ hiển thị thông báo "chưa triển khai"): tự lắp Caption+Highlights+CTA+Hashtags+Product Link (URL TUYỆT ĐỐI, không phải link tương đối trong Draft) + link YouTube THẬT (đọc trực tiếp `product.youtubeUrl`, KHÔNG dùng `youtubeEmbedUrl` — link embed không phù hợp để chia sẻ công khai) — theo dõi Publishing/Published (kèm Facebook Post ID thật)/Failed NGAY trên đúng phiên bản A/B/C vừa bấm, không ảnh hưởng 2 phiên bản còn lại.
- **`database.rules.json`** — thêm rule cho `facebookOAuthState`/`facebookPendingPages`/`facebookPageTokens`/`facebookActiveToken` (2 node cuối `.read:false`/`.write:false` TUYỆT ĐỐI — không ai, kể cả Admin, đọc được qua client, chỉ Cloud Function Admin SDK bypass được) — **CHƯA deploy**, xem mục "Việc cần Chief Architect làm" bên dưới.
- **Sidebar**: "Facebook Configuration" đã thêm vào cả Advanced Mode và Smart Mode (`js/admin-auth.js`), Founder tự vào được từ Cài đặt.

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
- **App Secret**: **TUYỆT ĐỐI KHÔNG đặt trong code/client** — phải lưu trong Google Secret Manager qua `firebase functions:secrets:set FACEBOOK_APP_SECRET` (giống hệt cách `OPENAI_API_KEY` đang được xử lý, xem `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md`).

### 6. Điền App ID vào code (2 chỗ) rồi deploy Cloud Function
Cloud Function `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish` **ĐÃ VIẾT XONG** trong `functions/index.js` (Facebook AI V5) — chỉ còn:
1. Điền App ID thật vào hằng số `FACEBOOK_APP_ID` ở ĐẦU `functions/index.js` VÀ đầu `js/admin-facebook-connect.js` (2 chỗ, tìm dòng có ghi chú `TODO`).
2. `firebase functions:secrets:set FACEBOOK_APP_SECRET` (nhập App Secret thật, KHÔNG dán vào chat/file).
3. `firebase deploy --only functions` — deploy cả 3 hàm `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish` cùng lúc với `openaiProxy` đã có.

### 7. Deploy Database Rules đã cập nhật
```
firebase deploy --only database
```
(rule cho `facebookConnection`/`facebookOAuthState`/`facebookPendingPages`/`facebookPageTokens`/`facebookActiveToken` đã có sẵn trong `database.rules.json`, chỉ cần deploy khi sẵn sàng dùng thật).

### 8. Xác nhận URL Redirect khớp thật
Sau khi deploy, Firebase CLI in ra URL Cloud Function thật cho `facebookOAuthCallback` — đối chiếu với URL đã đăng ký ở bước 4 (Valid OAuth Redirect URIs) VÀ với hằng số `FACEBOOK_OAUTH_CALLBACK_URL` trong cả `functions/index.js` và `js/admin-facebook-connect.js` — nếu khác (vd khác region), sửa lại cả 2 nơi cho khớp URL thật.

## Checklist xác minh trước khi coi Facebook AI V5 là PASS thật

- [ ] Facebook App đã tạo, có App ID thật — đã điền vào `functions/index.js` VÀ `js/admin-facebook-connect.js`.
- [ ] App Secret đã lưu trong Secret Manager qua `firebase functions:secrets:set FACEBOOK_APP_SECRET` (KHÔNG trong code).
- [ ] OAuth Redirect URI đã cấu hình đúng trong Facebook App Settings.
- [ ] `firebase deploy --only functions` đã chạy (3 hàm `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish` deploy thành công).
- [ ] `firebase deploy --only database` đã chạy (rule `facebookConnection`/`facebookOAuthState`/`facebookPendingPages`/`facebookPageTokens`/`facebookActiveToken` đã live).
- [ ] Founder vào Cài đặt > Facebook Configuration, bấm Connect Facebook, đọc dialog xin phép, bấm Continue with Facebook.
- [ ] Đăng nhập Facebook thật thành công, hệ thống TỰ ĐỘNG lấy đúng danh sách Fanpage — Founder KHÔNG tự gõ bất kỳ ID nào.
- [ ] Founder chọn 1 Fanpage mặc định, bấm LƯU, card chuyển 🟢 Connected.
- [ ] Founder Generate 1 bài Facebook AI V3 (chọn 1 Sản phẩm có sẵn), xem Draft, bấm "Đăng lên Facebook" thật.
- [ ] Xác nhận: bài xuất hiện trên đúng Fanpage đã chọn, ảnh hiển thị đúng, Caption đúng, Hashtag đầy đủ, Product Link mở đúng sản phẩm, `facebookPostId` được lưu lại, CMS hiển thị "✅ Đã đăng".

Cho tới khi checklist trên hoàn tất, Facebook AI V5 vẫn ở trạng thái **"Code thật đã viết xong — chưa xác nhận hoạt động thật"**, không được tuyên bố PASS.
