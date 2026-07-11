# CLAUDE.md — PSH Platform (Pshop Music)

Nguyên tắc hành vi cho Claude khi làm việc trong repo này. Tham khảo từ 4 nguyên tắc chung của [andrej-karpathy-skills/CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md), đã điều chỉnh/bổ sung cho đúng cách dự án này thực sự vận hành (Sprint/Requirement do Chief Architect giao, branch `feature/cms-ai-sprint2`, Firebase Production thật với dữ liệu thật).

**Đánh đổi:** các nguyên tắc dưới đây thiên về cẩn trọng hơn tốc độ, vì đây là site thật đang phục vụ khách hàng thật (`pshopmusic.com`) với 42 sản phẩm thật. Với việc vặt/rõ ràng, dùng phán đoán, không cần áp dụng máy móc.

---

## 1. Bám sát đúng Requirement đã giao — không tự hỏi lại nếu đã đủ rõ

**Requirement đã có INPUT/OUTPUT/RULES/ACCEPTANCE TEST thì triển khai ngay — không chờ xác nhận thêm.**

- Chief Architect gửi Requirement dạng rất chi tiết (field cụ thể, RULES "Do NOT modify...", ACCEPTANCE TEST) — đây LÀ đặc tả đủ để code, không phải gợi ý cần hỏi lại. Khi thấy dòng kiểu "This is now an implementation Requirement, do not wait for another specification" → thực thi thẳng.
- Chỉ dùng `AskUserQuestion` khi thật sự có ít nhất 2 cách hiểu khác nhau ảnh hưởng tới kiến trúc (vd: field mới trùng tên với field cũ nghĩa khác nhau, hoặc Requirement cần hạ tầng ngoài thật như OAuth App/App Review mà chỉ Chief Architect tạo được) — không hỏi cho việc có thể tự quyết định hợp lý rồi ghi rõ giả định trong CHANGELOG.
- Ý tưởng/tính năng phát sinh trong lúc làm nhưng CHƯA được giao → ghi vào `ROADMAP.md` (mục *"chỉ ghi nhận, KHÔNG tự ý triển khai"*), tuyệt đối không tự code trước.
- Một tin nhắn có thể vừa là bình luận định hướng (tiếng Việt, không có field/spec cụ thể) vừa là Requirement thật — phân biệt rõ trước khi code: không có RULES/ACCEPTANCE TEST cụ thể → chỉ log vào ROADMAP, không code.

## 2. Tối giản — chỉ code đúng phạm vi, không tự mở rộng

**Code tối thiểu giải quyết đúng Requirement. Không có gì "tiện thể" thêm vào.**

- Không thêm field/nút/trang nào ngoài danh sách Requirement liệt kê, kể cả khi có vẻ "hợp lý nên có".
- Không tạo Plugin/Provider/Queue/Workflow mới nếu 1 Plugin có sẵn tái sử dụng được (vd 5 nút AI trong trang Sản phẩm tái dùng đúng 4 Plugin đã có, không tạo Plugin thứ 5 cho "SEO" vì `product-description-writer` đã sinh sẵn field SEO).
- Không tự "cải thiện" kiến trúc đang chạy tốt chỉ vì đang sửa file gần đó — Requirement luôn có danh sách "Do NOT modify" tường minh (Queue/Provider/Workflow/Plugin Framework...), tôn trọng tuyệt đối danh sách đó.
- Mỗi Requirement xong luôn viết rõ dòng **"0 sửa đổi: ..."** trong CHANGELOG liệt kê chính xác những gì KHÔNG bị đụng tới — đây là bằng chứng, không phải thủ tục hình thức.

## 3. Thay đổi phẫu thuật — không phá dữ liệu Production thật

**Đây là site thật với 42 sản phẩm thật đang bán — mọi thay đổi field/schema phải an toàn ngược (backward-compatible).**

- Field/flag mới luôn phải có giá trị mặc định an toàn cho dữ liệu CŨ chưa có field đó — không bao giờ lọc bằng điều kiện dương tính bắt buộc (vd `pubStatus === 'published'`) mà phải lọc bằng điều kiện âm tính loại trừ (`pubStatus !== 'draft' && !== 'hidden'`), để dữ liệu cũ (`undefined`) mặc định vẫn hiển thị đúng.
- Field ý nghĩa gần giống nhau nhưng khác mục đích phải đặt tên KHÁC nhau rõ ràng, không tái dùng đè lên field cũ (vd `pubStatus` — trạng thái xuất bản — phải khác `status` — tình trạng Mới/Qua sử dụng — dù cả hai đều là "status").
- Sau mỗi thay đổi vào 1 file dùng chung nhiều nơi (`js/media-library-picker.js`, `js/admin-ai.js`...), luôn xác nhận qua test trực tiếp rằng các nơi dùng chung KHÔNG khai báo option mới vẫn ra HTML/hành vi y hệt trước (0 regression, không suy đoán).
- Regression tự gây ra (vd lỡ xoá 1 hàm khi replace 1 khối code) phải tự phát hiện qua kiểm thử TRƯỚC khi lên production — không để Founder là người phát hiện ra.
- Giữ nguyên style code hiện có: DB layer Promise-based, module dạng IIFE (`const X = (function(){...})()`), tiếng Việt cho mọi chuỗi hiển thị ra UI/comment giải thích nghiệp vụ.

## 4. Luôn xác minh bằng dữ liệu/thao tác thật — không tự nhận PASS

**Không tuyên bố "hoàn tất"/"PASS" nếu chưa thật sự kiểm thử được.**

- Kiểm thử bắt buộc trước khi commit: Node `vm` chạy trực tiếp mã nguồn thật (không phải bản viết lại/giả lập tách biệt) cho logic không thể test qua UI (admin cần đăng nhập Firebase Auth, không có tài khoản thật); Preview trình duyệt thật cho trang công khai (dữ liệu Firebase thật, không mock).
- Không có tài khoản Founder đăng nhập được vào CMS — đây là giới hạn thật, phải NÓI RÕ trong CHANGELOG ("Chưa kiểm thử qua UI thật có đăng nhập"), không giả vờ đã test hoặc lờ đi.
- Khi có mâu thuẫn giữa lời báo cáo của user và bằng chứng kỹ thuật (vd "Cloud Function không nhận request nào" trong khi code trace cho thấy nó phải nhận được) → verify bằng công cụ thật (`curl`, `gcloud logging read`...) trước khi kết luận, kể cả khi kết luận đó ngược lại lời user.
- Sau khi deploy: luôn `curl` production + `git show <commit>:<file>` byte-diff (bỏ line-ending khác biệt CRLF/LF nếu có) để xác nhận production đúng y hệt commit vừa đẩy lên, không chỉ tin "deploy chạy xong không lỗi" là đủ.

## 5. Kỷ luật Git & Deploy

**Không có thao tác nào trong mục này được phép "tiện tay" làm khác đi.**

- Luôn làm việc trên branch `feature/cms-ai-sprint2` — **KHÔNG BAO GIỜ tự merge vào `main`** trừ khi Chief Architect yêu cầu rõ ràng.
- Firebase Realtime Database Rules / Storage Rules **chỉ Chief Architect tự deploy** (`firebase deploy --only database`/`--only storage`) — Claude chỉ được sửa file `database.rules.json`/`storage.rules` trong repo, không bao giờ tự chạy lệnh deploy rules.
- Deploy Netlify luôn theo đúng quy trình: `git archive <commit>` → loại bỏ `functions/docs/scripts/wordpress-theme/data/firebase.json/.firebaserc/database.rules.json/storage.rules/.gitignore/*.md` → deploy **draft** trước (luôn kèm `--site=48256e20-1403-4017-af01-35588713a3a0` tường minh) → `curl` xác nhận draft chứa đúng thay đổi → mới `--prod` → `curl` xác nhận production.
- Không dùng `--no-verify`/bỏ qua git hook, không `force-push`, không `amend` commit đã push — luôn tạo commit mới khi cần sửa.
- File nào phát hiện bị thay đổi ngoài ý muốn trong `git status` (vd `.firebaserc` tự đổi do lệnh `firebase`/`gcloud` chạy trước đó) → không đưa vào commit của Requirement đang làm, nêu rõ lý do loại trừ.

## 6. Tài liệu hoá mỗi Requirement

**Mỗi Requirement xong đều để lại dấu vết đầy đủ trong 3 file gốc của sự thật.**

- `CHANGELOG.md` — thêm mục mới ở ĐẦU file (mới nhất trên cùng), đúng format đã có: tiêu đề `## Sprint X — Requirement #Y: Tên`, đoạn mở đầu nêu động lực, các gạch đầu dòng mô tả thay đổi theo file, dòng "0 sửa đổi", dòng "Kiểm thử" nêu rõ đã test gì/chưa test gì.
- `PROJECT_ARCHITECTURE.md` — thêm 1 mục mới mô tả kiến trúc/luồng dữ liệu (dùng sơ đồ dạng code block mũi tên `→` nếu là 1 luồng xử lý, giống các mục đã có).
- `ROADMAP.md` — cập nhật trạng thái Requirement tương ứng trong khối "FOUNDER FIRST ROADMAP" (nếu có) + log ý tưởng phát sinh mới.
- Không tự tạo file `.md` mới ngoài yêu cầu (tránh rác tài liệu ở root) trừ khi Requirement cần 1 runbook riêng cho thao tác vận hành thật (vd `docs/FACEBOOK_INTEGRATION_SETUP.md`).

## 7. Dừng đúng lúc — không tự ý làm tiếp Requirement sau

**"One Requirement = One Feature. Finish. Deploy. Founder tests. PASS. Only then continue."**

- Sau khi code xong → kiểm thử xong → deploy xong → cập nhật docs xong → commit + push xong: **DỪNG LẠI**, chờ Chief Architect xác nhận Founder Acceptance Test PASS, không tự ý bắt đầu Requirement tiếp theo trong Roadmap.
- Không làm song song 2 tính năng lớn trong cùng 1 lượt, kể cả khi cả hai đều "có vẻ liên quan".
- Khi Chief Architect chỉ hỏi tiến độ (vd "What step are you on?") → trả lời đúng câu hỏi, không tự ý tranh thủ làm thêm việc trong lúc trả lời.
- Khi bị chặn bởi thứ ngoài khả năng của Claude trong môi trường này (không có Firebase CLI login, không có tài khoản Founder, cần App Review từ Meta...) → nói rõ đây là việc chỉ Chief Architect tự làm được, không tự tìm cách "lách" bằng workaround không an toàn.

---

**Các nguyên tắc trên đang được tuân thủ tốt nếu:** mỗi Requirement chỉ đụng đúng file đã liệt kê "0 sửa đổi" là loại trừ; không có Requirement nào tự nhận PASS mà sau đó bị Founder báo FAILED với lỗi lẽ ra kiểm thử được từ trước; dữ liệu Production thật (42 sản phẩm, dữ liệu Firebase thật) không bao giờ biến mất/hỏng sau 1 thay đổi tưởng như không liên quan; và AI luôn dừng đúng chỗ để chờ Founder test thay vì tự chạy tiếp cả chuỗi Requirement.
