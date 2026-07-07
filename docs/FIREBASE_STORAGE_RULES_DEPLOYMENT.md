# Firebase Storage Rules — Deployment Guide

Sprint 9 Requirement #3 (Firebase Storage Security Rules). Tài liệu này chuẩn bị đầy đủ để người vận hành (người có quyền truy cập Firebase Console/CLI thật) deploy `storage.rules` một cách an toàn — môi trường phát triển hiện tại **không có Firebase CLI đã đăng nhập/không có quyền truy cập project thật** (kế thừa đúng giới hạn đã ghi nhận ở Sprint 9 Requirement #2 cho `database.rules.json`: `firebase projects:list` báo lỗi xác thực), nên bước deploy thật sự **chưa được thực hiện và không được giả lập là đã thực hiện**.

---

## 0. Tình trạng hiện tại (đã xác nhận, không suy đoán)

| Câu hỏi | Trả lời |
|---|---|
| `storage.rules` có tồn tại và được version-control trong repo? | ✅ Có — tạo mới ở Sprint 9 Requirement #3 (trước đó KHÔNG có file này trong repo — Storage Rules trước giờ chỉ tồn tại thủ công trên Firebase Console, không ai theo dõi được lịch sử thay đổi). |
| `firebase.json` có trỏ đúng tới `storage.rules`? | ✅ Có — đã thêm khối `"storage": {"rules": "storage.rules"}`. |
| `storage.rules` có khớp với chính nó (nội bộ nhất quán, không mâu thuẫn)? | ✅ Có — xác nhận bằng 9/9 kịch bản kiểm thử chạy trên **Firebase Storage Emulator thật** (không phải mô phỏng lại logic Rules), xem mục 4. |
| `README.md` có còn hướng dẫn nào mâu thuẫn với `storage.rules`? | ✅ Không — đã sửa ở Sprint 9 Requirement #3 (bước 4 mục "Thiết lập Firebase" trỏ đúng file thật, không còn snippet Rules nhúng tay). |
| **Rules đang chạy THẬT trên Firebase Console (Production) có khớp với `storage.rules` không?** | ❓ **KHÔNG THỂ XÁC NHẬN từ môi trường này** — không có Firebase CLI đã đăng nhập/quyền truy cập project `pshop-music` thật. Đây là lý do chính của tài liệu này: chuẩn bị đầy đủ để người vận hành tự xác nhận và deploy. |

**Không tuyên bố "Production đã khớp Rules" — vì chưa từng deploy và chưa từng xác minh được Rules đang chạy thật.**

---

## 1. Trước khi deploy — bắt buộc đối chiếu với Rules đang chạy thật

**Không deploy đè lên mà không kiểm tra trước.** Storage Rules thủ công trước đây rất có thể vẫn là dạng v1 đơn giản kiểu `allow read, write: if request.auth != null` hoặc thậm chí `allow read: if true` (KHÔNG phân biệt `get`/`list`) — nếu đúng vậy, Rules thật hiện tại đang ngầm cho phép **`list` công khai** (bất kỳ ai cũng liệt kê được toàn bộ đường dẫn file trong Storage qua `listAll()`, không chỉ đọc file đã biết URL trước). Đây chính là khoảng hở mà `storage.rules` trong repo THẮT CHẶT lại (xem mục 0 và chú thích trong `storage.rules`).

1. Đăng nhập [Firebase Console](https://console.firebase.google.com) → chọn project `pshop-music` → **Storage → Rules**.
2. Copy toàn bộ nội dung Rules đang hiển thị ở đó, lưu tạm ra 1 file cục bộ (KHÔNG commit vào repo, chỉ để đối chiếu — ví dụ `storage.rules.LIVE-SNAPSHOT.txt`).
3. So sánh với `storage.rules` trong repo — đặc biệt chú ý: Rules thật có tách `get`/`list` riêng không, hay chỉ có `read` gộp chung (v1) — nếu gộp chung và `allow read: if true`, nghĩa là `list` công khai hiện đang MỞ, và deploy bản trong repo sẽ ĐÓNG lại (thắt chặt, đúng mục tiêu Requirement này, không phải "giảm chức năng" — Media Library vẫn hoạt động bình thường vì luôn chạy trong phiên đã đăng nhập).
4. Nếu khác nhau theo hướng khác (ví dụ Rules thật đang chặn cả `get` công khai, khác với giả định "trang khách hotlink ảnh trực tiếp không cần đăng nhập") — **ghi rõ khác biệt cụ thể vào `ROADMAP.md` mục "Firebase Storage Security Rules" TRƯỚC KHI deploy**, không suy đoán, vì deploy đè có thể làm gãy tính năng hotlink ảnh ở trang khách nếu giả định sai.
5. Kiểm tra tab **History** (Firebase Console → Storage → Rules → biểu tượng lịch sử, nếu có) để biết Rules đã từng được sửa tay lần nào chưa.

---

## 2. Deploy

Sau khi đã đối chiếu ở mục 1 và sẵn sàng:

```bash
firebase login          # nếu chưa đăng nhập
firebase use pshop-music  # xác nhận đúng project (khớp .firebaserc)
firebase deploy --only storage
```

Lệnh này đọc đúng `storage.rules` (qua `firebase.json`) và áp dụng lên Firebase Storage Rules của project `pshop-music`. Không cần thao tác nào khác — không đổi cấu trúc file/thư mục trong Storage, không xoá/di chuyển file nào, chỉ đổi lớp Rules kiểm soát truy cập.

---

## 3. Sau khi deploy — checklist xác minh (bắt buộc, không bỏ qua)

Đánh dấu từng mục sau khi xác nhận THẬT trên môi trường Production — không đánh dấu nếu chưa tự tay kiểm tra:

- [ ] Firebase Console → Storage → Rules hiển thị đúng nội dung khớp với `storage.rules` trong repo (copy lại và diff 1 lần nữa để chắc chắn).
- [ ] Trang khách (`index.html`, `category.html`, `blog.html`, `videos.html`) vẫn hiện đúng ảnh sản phẩm/banner/slider/blog cover, không có lỗi console (URL ảnh đã biết trước vẫn `get` công khai, không đổi diện).
- [ ] Đăng nhập CMS (Admin hoặc Editor) → mở Media Library (`admin/media-library.html` hoặc trang gọi `media-library-picker.js`) → xác nhận danh sách ảnh vẫn hiện đầy đủ (yêu cầu `list`, chỉ hoạt động khi đã đăng nhập).
- [ ] Vẫn trong phiên đã đăng nhập → thử upload 1 ảnh mới và xoá 1 ảnh trong Media Library → xác nhận cả hai thao tác thành công (yêu cầu `write`).
- [ ] Mở tab ẩn danh (chưa đăng nhập) → thử gọi trực tiếp Storage REST API để liệt kê thư mục (ví dụ `https://firebasestorage.googleapis.com/v0/b/<bucket>/o?prefix=uploads/&delimiter=/`) → xác nhận bị từ chối quyền truy cập, KHÔNG trả về danh sách đường dẫn file — đây chính là mục tiêu bảo mật của Requirement #3, lần đầu tiên xác nhận được trên môi trường thật.
- [ ] Mở tab ẩn danh → thử `PUT`/upload trực tiếp vào Storage REST API (không qua giao diện) → xác nhận bị từ chối.

Nếu bất kỳ mục nào ở trên THẤT BẠI — xem mục 4 "Rollback" ngay, và ghi rõ vào `ROADMAP.md` (không suy đoán nguyên nhân nếu chưa xác nhận được).

---

## 4. Rollback (nếu có sự cố sau deploy)

Firebase Console → Storage → Rules → tab **History** (nếu Console hỗ trợ cho Storage) → chọn phiên bản Rules trước đó → **Restore**. Nếu Console không hỗ trợ lịch sử cho Storage Rules ở thời điểm deploy, dán lại nội dung đã lưu ở mục 1 bước 2 (snapshot Rules cũ trước khi deploy) và Publish thủ công.

---

## 5. Bằng chứng đã kiểm thử (môi trường phát triển, KHÔNG thay thế cho xác minh Production thật)

Vì môi trường này không có quyền truy cập Firebase thật, việc kiểm thử được thực hiện bằng **Firebase Storage Emulator** (`firebase-tools` + `@firebase/rules-unit-testing`, cùng bộ công cụ tạm cài ở Sprint 9 Requirement #2 cho Database Emulator, không commit vào repo) — nạp đúng nội dung `storage.rules` thật vào 1 Emulator Storage thật (không phải mô phỏng lại logic Rules bằng tay), rồi chạy các thao tác `get`/`list`/`write`/`delete` có xác thực qua `authenticatedContext()`/`unauthenticatedContext()` (thư viện chính thức của Firebase để unit-test Rules).

**9/9 kịch bản PASS** trên Emulator thật:
1. Người dùng đã đăng nhập upload (create) 1 file — cho phép (chuẩn bị dữ liệu cho các bước sau).
2. `get` 1 file đã biết đường dẫn khi CHƯA đăng nhập — cho phép (hotlink công khai, không đổi hành vi).
3. `list` 1 thư mục khi CHƯA đăng nhập — bị chặn (đây chính là điểm THẮT CHẶT của Requirement #3).
4. `list` 1 thư mục khi đã đăng nhập — cho phép (Media Library vẫn hoạt động bình thường).
5. `write` (upload) khi CHƯA đăng nhập — bị chặn.
6. `write` (upload) bởi 1 người dùng đã đăng nhập khác (không phải người upload ban đầu) — cho phép (đúng hành vi hiện tại: không phân biệt vai trò Admin/Editor).
7. `delete` khi CHƯA đăng nhập — bị chặn.
8. `delete` bởi người dùng đã đăng nhập (bất kỳ vai trò nào) — cho phép (đúng hành vi Media Library: Editor cũng xoá được ảnh).
9. `get` một đường dẫn không tồn tại — Rules không tự chặn thêm (`get: if true` không phụ thuộc đường dẫn); lỗi 404 trả về là do Storage không tìm thấy object, không phải do Rules từ chối — xác nhận Rules không có hành vi phụ ẩn nào khác ngoài phân quyền.

---

## 6. Giới hạn đã biết — không tự sửa ở Requirement này

`storage.rules` **không thể** phân biệt vai trò Admin/Editor cho `write` (ví dụ chỉ Admin mới được xoá, Editor chỉ được thêm) — Firebase Storage Security Rules không có cách nào cross-reference node `roles/{uid}` trong Realtime Database (chỉ hỗ trợ `firestore.get()`/`firestore.exists()` cho Cloud Firestore, dự án này dùng Realtime Database). Cách duy nhất để Storage Rules biết vai trò thật của `request.auth.uid` là Firebase Auth **Custom Claims** (đặt qua Admin SDK/Cloud Function khi tạo/thu hồi tài khoản ở `admin/users.html`) — đây là thay đổi Business Logic + Cloud Function mới, ngoài phạm vi Requirement #3, cần Decision Record + Chief Architect phê duyệt riêng nếu triển khai sau. Xem thêm `ROADMAP.md` mục "Firebase Storage Security Rules".
