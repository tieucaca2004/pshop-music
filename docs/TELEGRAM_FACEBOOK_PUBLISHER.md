# Đăng bài Facebook qua Telegram (PSH) — kiến trúc, cấu hình, vận hành

Luồng: `Telegram (ảnh + Tên/Giá/Tình trạng) → telegramWebhook → intake → lưu bản nháp + ảnh (Storage) → AI viết nội dung → IMAGE ROUTER / COMPOSITOR thay nền (giữ pixel sản phẩm) → xem trước Telegram → DUYỆT/HỦY → đăng đúng Fanpage → Telegram nhận kết quả + URL`.

Không có hệ thống riêng: tái dùng `routes/fbPublisher.js`, `shared/fbDraftStore.js`, `shared/fbPageConfig.js`, `shared/aiGenerate.js`, `shared/telegram.js`, `facebook-graph-api.js` (Graph **v19**, không đổi).

## 1. Thành phần
| Thành phần | File | Việc |
|---|---|---|
| Webhook | `functions/index.js` (`exports.telegramWebhook`), `shared/telegramWebhookRelay.js` | Kiểm `X-Telegram-Bot-Api-Secret-Token`; tin nhắn → orchestrator, nút → `fbPublisher` |
| Product Intake + CONTENT ORCHESTRATOR | `shared/contentOrchestrator.js` | Parse "Tên/Giá/Tình trạng/Page", chống trùng (`telegramUpdates/{update_id}`), chạy các bước, ghi `draft.steps` |
| Lưu ảnh | `shared/telegramMedia.js` | getFile → kiểm magic-bytes/kích thước (≤10MB) → Storage `fbDrafts/{draftId}/original.*` → URL Firebase lâu dài |
| IMAGE ROUTER | `shared/imageRouter.js` | Đọc `imageRouterConfig`; gọi compositor; lỗi/tắt → ảnh gốc + cảnh báo |
| PYTHON COMPOSITOR | `tools/compositor/` | Tách nền (mask/rembg) + nền mới + ghép sản phẩm 1:1 (không resize), xác minh pixel |
| Quyền người duyệt | `shared/approverPolicy.js`, `fbPublisher.checkApprover` | chat + `approverIds` + ánh xạ uid PSH + role hiện hành |
| Approval Gate + Publisher | `routes/fbPublisher.js`, `shared/fbDraftStore.js` | `approveTransaction`/`cancelTransaction` (nguyên tử), version-lock, đăng, báo kết quả |

## 2. Trạng thái bản nháp
`RECEIVED → PROCESSING → PENDING_APPROVAL → APPROVED → PUBLISHING → PUBLISHED`; nhánh `FAILED` (kèm `failStage`: intake | pipeline | preview | publish), `CANCELLED`.
`/retry <mã>` chỉ đưa `FAILED(publish)` về `PENDING_APPROVAL` (version +1) khi Facebook CHƯA ghi nhận bài (`facebookPostId` rỗng).
`draft.steps.{intake,content,image,preview}` ghi trạng thái từng bước; `draft.notices` là cảnh báo hiển thị cho người duyệt.

## 3. Cấu hình RTDB (server-only, do Founder ghi; KHÔNG sửa Rules trong đợt này)
```
telegramConfig: {
  token:        "<bot token>",
  chatId:       "<id chat được phép>",          // số, hoặc @kênh công khai
  approverIds:  ["<telegram user id>", ...],    // BẮT BUỘC, khác rỗng
  approverMap:  { "<telegram user id>": "<uid PSH>" },   // BẮT BUỘC, từng người
  publishRoles: ["admin","editor"],             // tuỳ chọn; super_admin luôn được
  dryRun:       false                           // true = chạy đủ luồng nhưng KHÔNG gọi Facebook (thử an toàn); báo "[DRY-RUN]" trên Telegram
}
telegramWebhookSecret: "<chuỗi ngẫu nhiên riêng>"   // khác webhookSigningSecret
imageRouterConfig: {                              // mặc định KHÔNG có = không xử lý ảnh
  providers: {
    compositor:   { enabled: true, approvedForProductPhotos: true, url: "https://<máy chủ compositor>", secret: "<>=24 ký tự>", timeoutMs: 45000,
                    canvas: {width:1200,height:1200}, style: "studio" },
    aiBackground: { enabled: false, approvedForBackgrounds: false }   // TÍNH PHÍ nếu bật; chỉ vẽ NỀN, không nhận ảnh sản phẩm
  }
}
```
Quyền: uid trong `approverMap` phải có `superAdmins/{uid}.role === 'super_admin'` hoặc `roles/{uid}` thuộc `publishRoles` **tại thời điểm thao tác**. Thiếu ánh xạ/mất quyền → từ chối (fail-closed). `agent` không có quyền đăng mặc định.
Fanpage: mặc định Page đang active (Super Admin chọn ở trang quản trị — G1). Dòng `Page: <id>` chỉ được chấp nhận nếu server có token cho Page đó; `pageId` còn được Graph xác minh (`getPageInfo`) khi nhận và khi đăng.

## 4. Mẫu tin nhắn
Gửi 1 ảnh, kèm chú thích:
```
Tên: Pioneer DDJ-400
Giá: 3.500.000        (chấp nhận 3tr5, 850k, 3,500,000đ)
Tình trạng: Like new 95%
Page: <ID Fanpage — bỏ trống để dùng Page đang chọn>
```
Giá và tình trạng trong bài LUÔN do hệ thống chèn từ dữ liệu này (AI không thể sửa).

## 5. Compositor (máy chủ riêng, KHÔNG chạy trong Cloud Functions)
```
python -m venv .venv && .venv\Scripts\python -m pip install -r requirements.txt     # Pillow, numpy, rembg[cpu]
$env:COMPOSITOR_SECRET = "<>=24 ký tự ngẫu nhiên>" ; .\run_compositor.ps1 -ListenHost 127.0.0.1 -Port 8765
```
Mô hình u2net (~176MB) tự tải từ GitHub ở lần chạy đầu (biến COMPOSITOR_REMBG_MODEL=u2netp để dùng mô hình nhỏ hơn). Máy chủ chỉ nghe localhost: Cloud Functions cần một địa chỉ HTTPS tới nó (reverse proxy/tunnel do Founder chọn; không tự mở cổng).
Không có `rembg` và không có mask → compositor trả `NO_SEGMENTATION`, router báo "blocked" và dùng ảnh gốc (không giả vờ).
Test: `python -m unittest -v` trong `tools/compositor`.

## 6. Việc của Founder trước khi bật trên Production (chưa thực hiện)
1. Tạo/chọn bot Telegram; ghi `telegramConfig` (token, chatId, approverIds, approverMap) và `telegramWebhookSecret`.
2. Quyết định chính sách quyền: ai (uid/role) được gửi sản phẩm và duyệt đăng.
3. Deploy hàm `telegramWebhook` + `apiGateway` (liệt kê từng hàm); `setWebhook` với `secret_token`.
4. (Tuỳ chọn) dựng máy chủ compositor + mô hình tách nền; ghi `imageRouterConfig` (cần duyệt gửi ảnh sản phẩm cho máy chủ này).
5. Thử trên Page thử/staging TRƯỚC khi đăng thật (xem báo cáo `TELEGRAM_FACEBOOK_PUBLISHER_IMPLEMENTATION.md`).

## 7. Rollback
Gỡ webhook (`deleteWebhook`) hoặc xoá `telegramConfig.token` → luồng dừng ngay; rollback `apiGateway`/`telegramWebhook` về revision trước; xoá `imageRouterConfig` → quay về ảnh gốc. Bài đã đăng lên Facebook không tự gỡ (xoá thủ công trên Facebook).
