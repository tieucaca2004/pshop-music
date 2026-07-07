# Firebase Database Rules — Deployment Guide

Sprint 9 Requirement #2 (Firebase Database Rules Production Alignment). Tài liệu này chuẩn bị đầy đủ để người vận hành (người có quyền truy cập Firebase Console/CLI thật) deploy `database.rules.json` một cách an toàn — môi trường phát triển hiện tại **không có Firebase CLI đã đăng nhập/không có quyền truy cập project thật** (đã xác nhận: `firebase projects:list` báo lỗi xác thực), nên bước deploy thật sự **chưa được thực hiện và không được giả lập là đã thực hiện**.

---

## 0. Tình trạng hiện tại (đã xác nhận, không suy đoán)

| Câu hỏi | Trả lời |
|---|---|
| `database.rules.json` có khớp với chính nó (nội bộ nhất quán, không mâu thuẫn)? | ✅ Có — xác nhận bằng 19/19 kịch bản kiểm thử chạy trên **Firebase Realtime Database Emulator thật** (không phải mô phỏng lại logic Rules), xem mục 4. |
| `firebase.json` có trỏ đúng tới `database.rules.json`? | ✅ Có — `firebase.json` chứa `"database": {"rules": "database.rules.json"}`. |
| `.firebaserc` có trỏ đúng project? | ✅ Có — `"default": "pshop-music"`. |
| `README.md` có còn hướng dẫn nào mâu thuẫn với `database.rules.json`? | ✅ Không — đã sửa ở Sprint 9 Requirement #1 (trước đó README có 1 bản Rules nhúng sẵn, khác và kém an toàn hơn `database.rules.json`; đã thay bằng hướng dẫn deploy đúng file thật). |
| **Rules đang chạy THẬT trên Firebase Console (Production) có khớp với `database.rules.json` không?** | ❓ **KHÔNG THỂ XÁC NHẬN từ môi trường này** — không có Firebase CLI đã đăng nhập/quyền truy cập project `pshop-music` thật. Đây là lý do chính của tài liệu này: chuẩn bị đầy đủ để người vận hành tự xác nhận và deploy. |

**Không tuyên bố "Production đã khớp Rules" — vì chưa từng deploy và chưa từng xác minh được Rules đang chạy thật.**

---

## 1. Trước khi deploy — bắt buộc đối chiếu với Rules đang chạy thật

**Không deploy đè lên mà không kiểm tra trước** — nếu Rules đang chạy thật khác nhiều so với `database.rules.json` (ví dụ vẫn là bản cũ nhúng trong README trước Sprint 9 Requirement #1, hoặc một bản chỉnh tay khác chưa được ghi lại ở đâu), deploy đè có thể thay đổi hành vi Production đột ngột mà không ai kịp chuẩn bị.

1. Đăng nhập [Firebase Console](https://console.firebase.google.com) → chọn project `pshop-music` → **Realtime Database → Rules**.
2. Copy toàn bộ nội dung Rules đang hiển thị ở đó, lưu tạm ra 1 file cục bộ (KHÔNG commit vào repo, chỉ để đối chiếu — ví dụ `database.rules.LIVE-SNAPSHOT.json`).
3. So sánh với `database.rules.json` trong repo (`diff` 2 file, hoặc so sánh bằng mắt từng node: `products`/`categories`/`banners`/`blogPosts`/`videos`/`siteContent`/`seoSettings`/`roles`/`aiDrafts`/`aiJobs`/`aiLogs`/`aiProviderConfig`/`aiPlugins`).
4. Nếu khác nhau — **đây chính là "khác biệt" mà Requirement này yêu cầu ghi rõ, không suy đoán**: viết lại các điểm khác nhau cụ thể (ví dụ: "Rules thật hiện tại `roles.read: true` vĩnh viễn, không giới hạn khi đã có dữ liệu") vào `ROADMAP.md` mục "Firebase Database Rules" TRƯỚC KHI deploy, để có hồ sơ rõ ràng về việc gì thay đổi.
5. Kiểm tra tab **History** (Firebase Console → Realtime Database → Rules → biểu tượng lịch sử) để biết Rules đã từng được sửa tay lần nào chưa, và khi nào — giúp xác định Rules hiện tại có khớp với bản gốc trong `README.md` (trước Sprint 9) hay đã bị chỉnh tay khác đi.

---

## 2. Deploy

Sau khi đã đối chiếu ở mục 1 và sẵn sàng:

```bash
firebase login          # nếu chưa đăng nhập
firebase use pshop-music  # xác nhận đúng project (khớp .firebaserc)
firebase deploy --only database
```

Lệnh này đọc đúng `database.rules.json` (qua `firebase.json`) và áp dụng lên Realtime Database Rules của project `pshop-music`. Không cần thao tác nào khác — không đổi Database Structure, không đổi dữ liệu, chỉ đổi lớp Rules kiểm soát truy cập.

---

## 3. Sau khi deploy — checklist xác minh (bắt buộc, không bỏ qua)

Đánh dấu từng mục sau khi xác nhận THẬT trên môi trường Production — không đánh dấu nếu chưa tự tay kiểm tra:

- [ ] Firebase Console → Realtime Database → Rules hiển thị đúng nội dung khớp với `database.rules.json` trong repo (copy lại và diff 1 lần nữa để chắc chắn).
- [ ] Trang khách (`index.html`, `category.html`, `blog.html`, `videos.html`) vẫn tải được sản phẩm/danh mục/bài viết/video bình thường, không có lỗi console (các node này vẫn `.read: true` công khai, không đổi diện — chỉ để chắc chắn không có regression).
- [ ] Đăng nhập bằng tài khoản **Editor** (không phải Admin) → xác nhận: sửa được Product/Category/Banner/Blog/Video/Slider (`siteContent`); **KHÔNG** sửa được Menu/Footer/SEO/Cài đặt/Người dùng (`seoSettings` chỉ Admin).
- [ ] Đăng nhập bằng tài khoản **Admin** → vào `admin/users.html` → **Thêm tài khoản mới** → xác nhận thao tác này thành công (đây là điểm đã được đính chính ở Sprint 8 Requirement #4 — kết luận "nhiều khả năng không phải lỗi thật" dựa trên đọc mã nguồn + mô phỏng Rules, **chưa từng được xác nhận trên Firebase thật** — đây là lần đầu tiên nên xác nhận thật).
- [ ] Vào lại `admin/login.html` (đã đăng xuất) → xác nhận: form đăng nhập vẫn hiện đúng bình thường. Nếu thấy cảnh báo "Chưa kết nối được hệ thống phân quyền..." — đây là **hành vi đã biết** (Xung đột #2, xem `ROADMAP.md`), KHÔNG phải lỗi mới, không cần hoảng — chưa được sửa ở Sprint 9 Requirement #1/#2 (ngoài phạm vi, chỉ liên quan tài liệu/Rules).
- [ ] Thử đọc `roles` khi CHƯA đăng nhập (vd mở tab ẩn danh, gọi trực tiếp REST: `https://<project>-default-rtdb.<region>.firebasedatabase.app/roles.json`) → xác nhận trả về lỗi quyền truy cập (`permission_denied`), KHÔNG trả về danh sách email/tên tài khoản CMS — đây chính là mục tiêu bảo mật của Requirement #1 (Sprint 8), lần đầu tiên xác nhận được trên môi trường thật.

Nếu bất kỳ mục nào ở trên THẤT BẠI — xem mục 4 "Rollback" ngay, và ghi rõ vào `ROADMAP.md` (không suy đoán nguyên nhân nếu chưa xác nhận được).

---

## 4. Rollback (nếu có sự cố sau deploy)

Firebase Console → Realtime Database → Rules → tab **History** → chọn phiên bản Rules trước đó → **Restore**. Đây là cơ chế rollback có sẵn của Firebase, không cần thao tác gì thêm từ phía code/repo.

---

## 5. Bằng chứng đã kiểm thử (môi trường phát triển, KHÔNG thay thế cho xác minh Production thật)

Vì môi trường này không có quyền truy cập Firebase thật, việc kiểm thử được thực hiện bằng **Firebase Realtime Database Emulator** (`firebase-tools` + `@firebase/rules-unit-testing`, cài tạm trong thư mục làm việc, không commit vào repo) — nạp đúng nội dung `database.rules.json` thật vào 1 Emulator RTDB thật (không phải mô phỏng lại logic Rules bằng tay như Sprint 8), rồi chạy các thao tác đọc/ghi có xác thực qua `authenticatedContext()`/`unauthenticatedContext()` (thư viện chính thức của Firebase để unit-test Rules).

**19/19 kịch bản PASS** trên Emulator thật:
1. Đọc `roles` công khai khi rỗng (bootstrap) — cho phép.
2. Ghi `products` khi chưa đăng nhập — bị chặn.
3. Admin đầu tiên tự nhận quyền khi `roles` rỗng — cho phép.
4. Uid khác tự nhận quyền Admin sau khi `roles` đã có dữ liệu — bị chặn (chống leo thang đặc quyền).
5. Admin cấp quyền Editor cho uid mới — cho phép.
6. Đọc `roles` công khai khi đã có dữ liệu — bị chặn (không lộ danh sách tài khoản).
7. Admin và Editor đều ghi được `products`.
8. Editor bị chặn ghi `seoSettings`; Admin ghi được.
9. Editor ghi được `siteContent` (cần cho Slider Manager).
10. Người đã đăng nhập nhưng không có `roles` bị chặn ghi `products` và `aiLogs`.
11. Editor ghi được `aiJobs`; người không có vai trò bị chặn.
12. Editor bị chặn ghi `aiProviderConfig`; Admin ghi được.
13. `.validate` chặn giá trị `role` rác (`"superadmin"`), chấp nhận giá trị hợp lệ (`"editor"`).

**Giới hạn của bằng chứng này**: Emulator xác nhận `database.rules.json` **tự nó nhất quán, đúng như thiết kế** — nhưng KHÔNG xác nhận được Rules đang chạy thật trên Production Firebase Console hiện là gì, vì môi trường này không có quyền truy cập project thật (`firebase projects:list` báo lỗi xác thực — đã xác nhận, không suy đoán). Mục 1 và 3 của tài liệu này là bước bắt buộc để đóng khoảng cách này khi có người vận hành thật.
