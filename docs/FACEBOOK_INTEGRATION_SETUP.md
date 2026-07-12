# Facebook Page Integration — Runbook thiết lập hạ tầng thật

**Cập nhật (Sprint 12 — Facebook Integration V1):** TOÀN BỘ kiến trúc production đã hoàn chỉnh — bao gồm cả **Mock Mode** để tự kiểm thử TOÀN BỘ luồng (Connect → Page Selection → Generate → Publish) ngay hôm nay, KHÔNG cần chờ Meta App. App ID KHÔNG còn phải sửa code — nhập trực tiếp qua ô trên `admin/facebook-settings.html`. Chỉ còn đúng 2 việc bên ngoài mà chỉ Chief Architect tự làm được: (1) tạo Facebook App thật + nhập App ID qua UI, (2) thiết lập App Secret qua Secret Manager + deploy. Xem mục "Thử ngay hôm nay bằng Mock Mode" bên dưới trước khi cần tạo Facebook App thật.

Sprint 12 Requirement #9 (Facebook AI V4) ban đầu CHỈ xây khung UI an toàn. Facebook AI V5 viết toàn bộ code thật (OAuth/Cloud Function/Publish). Facebook Integration V1 (Requirement hiện tại) hoàn thiện thêm: App ID động (không hardcode), Mock Mode, Token Refresh, Permission Checking, Facebook Graph API Wrapper.

## Thử ngay hôm nay bằng Mock Mode (không cần Facebook App thật)

Chỉ cần production đã deploy Cloud Functions (`facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish`/`facebookRefreshToken`) và Database Rules — KHÔNG cần App ID/Secret thật:

1. Vào Cài đặt > Facebook Configuration (`admin/facebook-settings.html`) — để ô "App ID" TRỐNG.
2. Thấy badge "🧪 Mock Mode" — xác nhận hệ thống biết đang ở chế độ giả lập.
3. Bấm "Connect Facebook" → đọc dialog xin phép → "Continue with Facebook" — **KHÔNG chuyển sang trang Facebook thật** (không có gì để chuyển tới), tự động quay lại với danh sách 2 Fanpage giả ("[MOCK] Pshop Music"/"[MOCK] Pshop Coffee").
4. Chọn 1 Fanpage giả, bấm LƯU — card chuyển 🟢 Connected (kèm badge Mock Mode).
5. Vào Duyệt nội dung, Generate 1 bài Facebook AI V3, bấm "Đăng lên Facebook" — nhận `facebookPostId` dạng giả (`mock_page_1_mockpost_...`), CMS hiển thị "✅ Đã đăng" y hệt thật.
6. Thử "🔄 Làm mới Token" — cũng hoạt động ở chế độ giả lập.

Nếu cả 6 bước trên chạy trơn tru, kiến trúc ĐÃ ĐÚNG — phần còn lại chỉ là chờ Facebook App thật (bước dưới đây), không phải chờ sửa code.

## Đã triển khai trong code (Sprint 12 — Facebook AI V4 + V5 + Integration V1)

- **`js/admin-facebook-connect.js`** — card kết nối tại `admin/facebook-settings.html` (Settings > Facebook Configuration, trang MỚI — dọn khỏi `admin/ai/index.html` cũ), hiển thị đúng 4 trạng thái (🟢/⚪/🟠/🔴) — trạng thái Token Expiring/Expired giờ được TỰ TÍNH LẠI mỗi lần hiển thị (so `tokenExpiresAt` với đồng hồ hiện tại), không dựa vào giá trị tĩnh đã ghi từ trước. `proceedOAuth()` giờ redirect THẬT sang Facebook Login Dialog (dùng `state` nonce ghi vào `facebookOAuthState/{state}` để Cloud Function callback biết yêu cầu của Founder nào). Sau khi Facebook redirect về (`?oauth=success`), tự đọc `facebookPendingPages/{uid}` và hiển thị Page Selection (tên + ảnh đại diện) để Founder chọn Default Page, gọi Cloud Function `facebookSelectPage` khi bấm LƯU.
- **`functions/index.js`** — 3 Cloud Function mới:
  - `facebookOAuthCallback` — nhận redirect từ Facebook (code+state), đổi code → Short-Lived → Long-Lived User Token (~60 ngày) → lấy danh sách Fanpage + Page Access Token riêng từng Page qua `/me/accounts`. Token thật CHỈ ghi vào node server-only `facebookPageTokens/{uid}` — client chỉ nhận metadata (`facebookPendingPages/{uid}`).
  - `facebookSelectPage` — Founder chọn 1 Page, copy đúng token của Page đó sang `facebookActiveToken` (server-only, node DUY NHẤT `facebookPublish` đọc), ghi `facebookConnection` (chỉ metadata).
  - `facebookPublish` — đăng thật lên Graph API: nhiều ảnh dùng pattern `attached_media` (upload từng ảnh `published:false` lấy `media_fbid`, gộp vào 1 bài `/feed`), trả về `facebookPostId` thật.
- **`js/admin-ai.js`** — `publishVersionToFacebook(draftId, versionLabel)` giờ đăng THẬT (không còn chỉ hiển thị thông báo "chưa triển khai"): tự lắp Caption+Highlights+CTA+Hashtags+Product Link (URL TUYỆT ĐỐI, không phải link tương đối trong Draft) + link YouTube THẬT (đọc trực tiếp `product.youtubeUrl`, KHÔNG dùng `youtubeEmbedUrl` — link embed không phù hợp để chia sẻ công khai) — theo dõi Publishing/Published (kèm Facebook Post ID thật)/Failed NGAY trên đúng phiên bản A/B/C vừa bấm, không ảnh hưởng 2 phiên bản còn lại.
- **`database.rules.json`** — thêm rule cho `facebookOAuthState`/`facebookPendingPages`/`facebookPageTokens`/`facebookActiveToken`/`facebookUserToken`/`facebookAppConfig` (`facebookPageTokens`/`facebookActiveToken`/`facebookUserToken` là `.read:false`/`.write:false` TUYỆT ĐỐI — không ai, kể cả Admin, đọc được qua client, chỉ Cloud Function Admin SDK bypass được) — **CHƯA deploy**, xem mục "Việc cần Chief Architect làm" bên dưới.
- **Sidebar**: "Facebook Configuration" đã thêm vào cả Advanced Mode và Smart Mode (`js/admin-auth.js`), Founder tự vào được từ Cài đặt.
- **`functions/facebook-graph-api.js`** (mới, Integration V1) — wrapper Graph API DUY NHẤT, hỗ trợ Mock Mode (trả dữ liệu giả đúng shape thật khi chưa có App ID).
- **`facebookRefreshToken`** (Cloud Function mới, Integration V1) — gia hạn Long-Lived User Token còn hạn, nút "🔄 Làm mới Token" trên `admin/facebook-settings.html`.
- **`facebookAppConfig/appId`** (node Firebase mới, Integration V1) — Founder tự nhập App ID qua ô trên `admin/facebook-settings.html`, KHÔNG cần sửa code.

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
- **App ID**: công khai, an toàn — nhập trực tiếp vào ô "App ID" trên `admin/facebook-settings.html`, bấm LƯU (ghi vào Firebase `facebookAppConfig/appId`). **Không cần sửa code, không cần CLI** cho bước này (khác quy trình cũ ở Facebook AI V5 — đã cải tiến ở Facebook Integration V1).
- **App Secret**: **TUYỆT ĐỐI KHÔNG đặt trong code/client/ô nhập nào** — phải lưu trong Google Secret Manager qua `firebase functions:secrets:set FACEBOOK_APP_SECRET` (giống hệt cách `OPENAI_API_KEY` đang được xử lý, xem `docs/CLOUD_FUNCTIONS_DEPLOYMENT.md`).

### 6. Deploy Cloud Function (chỉ cần App Secret, KHÔNG cần sửa code cho App ID)
Cloud Function `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish`/`facebookRefreshToken` **ĐÃ VIẾT XONG** trong `functions/index.js` + `functions/facebook-graph-api.js` — chỉ còn:
1. `firebase functions:secrets:set FACEBOOK_APP_SECRET` (nhập App Secret thật, KHÔNG dán vào chat/file).
2. `firebase deploy --only functions` — deploy cả 4 hàm Facebook cùng lúc với `openaiProxy` đã có.
3. Nhập App ID qua UI (bước 5 ở trên) — có thể làm TRƯỚC hoặc SAU bước deploy này, không phụ thuộc thứ tự.

### 7. Deploy Database Rules đã cập nhật
```
firebase deploy --only database
```
(rule cho `facebookConnection`/`facebookOAuthState`/`facebookPendingPages`/`facebookPageTokens`/`facebookActiveToken`/`facebookUserToken`/`facebookAppConfig` đã có sẵn trong `database.rules.json`, chỉ cần deploy khi sẵn sàng dùng thật).

### 8. Xác nhận URL Redirect khớp thật
Sau khi deploy, Firebase CLI in ra URL Cloud Function thật cho `facebookOAuthCallback` — đối chiếu với URL đã đăng ký ở bước 4 (Valid OAuth Redirect URIs) VÀ với hằng số `FACEBOOK_OAUTH_CALLBACK_URL` trong cả `functions/index.js` và `js/admin-facebook-connect.js` — nếu khác (vd khác region), sửa lại cả 2 nơi cho khớp URL thật (đây là URL của chính PSH Platform, không phải App ID/Secret, nên vẫn hardcode bình thường).

## Checklist xác minh trước khi coi Facebook Integration là PASS thật (Real Mode)

- [ ] Đã thử Mock Mode thành công (mục "Thử ngay hôm nay" ở trên) — xác nhận kiến trúc đúng trước khi tốn công tạo Facebook App thật.
- [ ] Facebook App đã tạo, có App ID thật — đã nhập qua ô "App ID" trên `admin/facebook-settings.html` (KHÔNG cần sửa code).
- [ ] App Secret đã lưu trong Secret Manager qua `firebase functions:secrets:set FACEBOOK_APP_SECRET` (KHÔNG trong code).
- [ ] OAuth Redirect URI đã cấu hình đúng trong Facebook App Settings.
- [ ] `firebase deploy --only functions` đã chạy (4 hàm `facebookOAuthCallback`/`facebookSelectPage`/`facebookPublish`/`facebookRefreshToken` deploy thành công).
- [ ] `firebase deploy --only database` đã chạy (rule đầy đủ đã live).
- [ ] Badge "🧪 Mock Mode" đã biến mất sau khi nhập App ID thật (nếu vẫn còn hiện — kết nối cũ vẫn là Mock, cần bấm "Kết nối lại" để chuyển hẳn sang thật).
- [ ] Founder vào Cài đặt > Facebook Configuration, bấm Connect Facebook, đọc dialog xin phép, bấm Continue with Facebook.
- [ ] Đăng nhập Facebook thật thành công, hệ thống TỰ ĐỘNG lấy đúng danh sách Fanpage — Founder KHÔNG tự gõ bất kỳ ID nào.
- [ ] Founder chọn 1 Fanpage mặc định, bấm LƯU, card chuyển 🟢 Connected (không còn badge Mock Mode).
- [ ] Founder Generate 1 bài Facebook AI V3 (chọn 1 Sản phẩm có sẵn), xem Draft, bấm "Đăng lên Facebook" thật.
- [ ] Xác nhận: bài xuất hiện trên đúng Fanpage đã chọn, ảnh hiển thị đúng, Caption đúng, Hashtag đầy đủ, Product Link mở đúng sản phẩm, `facebookPostId` được lưu lại, CMS hiển thị "✅ Đã đăng".
- [ ] Thử "🔄 Làm mới Token" — xác nhận `tokenExpiresAt` cập nhật thành công.

Cho tới khi checklist trên hoàn tất, Facebook Integration vẫn ở trạng thái **"Code thật đã viết xong, kiểm thử được bằng Mock Mode — chưa xác nhận hoạt động thật với Facebook thật"**, không được tuyên bố PASS Real Mode (PASS Mock Mode là 1 cột mốc hợp lệ riêng, đã đủ để xác nhận kiến trúc đúng).
