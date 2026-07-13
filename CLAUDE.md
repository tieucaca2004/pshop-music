# CLAUDE.md — PSH Platform (Pshop Music)

Đây không phải bản copy nguyên trạng nguyên tắc từ dự án khác. Các nguyên tắc dưới đây được đúc kết từ hơn 1 năm phát triển thật của PSH Platform — từ Sprint 1 (CRUD Product/Category/Banner cơ bản) tới Sprint 13 (AI Plugin Framework, Founder Agent, Product Management) — phản ánh đúng cách Chief Architect thật sự giao việc và cách Claude thật sự đã làm việc trong repo này. (Có tham khảo cấu trúc trình bày — không phải nội dung — từ [andrej-karpathy-skills/CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md).)

**Bối cảnh bắt buộc phải hiểu trước khi đọc tiếp:** PSH Platform là site thương mại điện tử THẬT (`pshopmusic.com`, DJ & thiết bị âm thanh, Nha Trang) với dữ liệu Production thật (42+ sản phẩm thật) đang phục vụ khách hàng thật. Chief Architect (chủ shop, không phải lập trình viên) giao việc dưới dạng "Sprint Requirement" — 1 khối văn bản có cấu trúc rất rõ ràng (MISSION/GOAL/INPUT/OUTPUT/RULES/ACCEPTANCE TEST/"Do NOT modify") — đây LÀ đặc tả đủ để thực thi ngay, không phải yêu cầu mơ hồ cần được diễn giải lại.

**Đánh đổi:** các nguyên tắc dưới đây thiên về cẩn trọng hơn tốc độ, vì rủi ro ở đây là dữ liệu Production thật, không phải rủi ro lý thuyết.

---

## 1. Triết lý sản phẩm — vì sao mọi quyết định được đưa ra

### Founder First

Mọi tính năng tồn tại để Founder (chủ shop) dùng được thật, không phải để chứng minh năng lực kỹ thuật.

- Ưu tiên tính năng Founder chạm vào hàng ngày (Product/Blog/Banner/AI Assist ngay trong trang đang sửa) hơn hạ tầng kỹ thuật đẹp mà Founder không bao giờ thấy (Workflow Engine nội bộ, Observability Dashboard, Context Builder...).
- Khi phải chọn giữa 1 giải pháp "đúng kiến trúc" nhưng khó dùng và 1 giải pháp đơn giản Founder hiểu ngay — chọn giải pháp Founder hiểu ngay.
- UI/sidebar dùng đúng ngôn ngữ Founder hiểu (tiếng Việt, không thuật ngữ kỹ thuật) — 2 nhãn gần giống nhau trỏ 2 trang khác nhau là lỗi nghiêm trọng (từng xảy ra thật), không phải chi tiết nhỏ.
- "Smart Mode" của CMS tồn tại chính vì lý do này — Founder không cần thấy Queue/Plugin Manager/Provider Registry, chỉ Engineer (Advanced Mode) mới cần thấy.

### Business Value First

Không xây kiến trúc "cho tương lai" nếu chưa ai cần dùng hôm nay.

- Không thêm khả năng mở rộng/cấu hình nào chưa được Requirement yêu cầu, kể cả khi "có vẻ sẽ cần sau này".
- Một năng lực kỹ thuật hoàn toàn mới (Image AI thật, Facebook OAuth thật, đổi AI Provider...) chỉ đáng triển khai khi có Requirement cụ thể yêu cầu — không tự đề xuất/tự xây trước "để sẵn".
- Ý tưởng hay nhưng chưa được giao → ghi vào `ROADMAP.md`, không tự code trước.
- Giữa 2 Requirement có vẻ tương đương về độ khó, ưu tiên Requirement Founder sẽ dùng ngay hơn Requirement chỉ có giá trị kỹ thuật nội bộ.

### Production First

Đây là site thật, không phải sandbox — mọi thay đổi phải giả định có dữ liệu thật đang chạy phía sau.

- Trước khi đổi field/schema, luôn tự hỏi: "dữ liệu thật hiện có sẽ ra sao nếu field mới này là `undefined`?" — câu trả lời bắt buộc phải là "vẫn hiển thị/hoạt động đúng như trước" (cách làm cụ thể ở mục 5, "Không Redesign Khi Chưa Cần").
- Trước khi báo hoàn tất, luôn xác minh bằng dữ liệu Production thật — không chỉ tin "chạy được ở local/Preview" là đủ (quy trình cụ thể ở mục 9, Definition of Done).
- Firebase Rules/Cloud Functions ảnh hưởng trực tiếp toàn bộ site đang chạy cho khách thật — deploy các hạ tầng này luôn cần Chief Architect tự thao tác (xem mục 8, Development Workflow).

---

## 2. Kỷ luật quy trình — cách 1 Requirement được thực thi

### One Requirement = One Feature

Mỗi lượt làm việc chỉ giải quyết đúng 1 Requirement được giao — không gộp, không mở rộng.

- Không triển khai 2 tính năng lớn song song trong cùng 1 lượt, kể cả khi cả hai "có vẻ liên quan" (vd không tự làm luôn Facebook Integration khi đang làm Banner AI, dù cả hai đều là "Media AI").
- Danh sách "Do NOT modify: ..." trong mỗi Requirement là ranh giới cứng — không đụng vào Plugin/module/trang không được liệt kê là mục tiêu.
- Nếu Requirement hé lộ 1 việc khác đáng làm (field thiếu, lỗi hiển thị phát hiện tình cờ) → ghi nhận lại, không tự mở rộng phạm vi đang làm để tiện sửa luôn.

### Deploy → Founder Test → PASS → Next Requirement

Quy trình đầy đủ, có thứ tự từng bước từ lúc nhận Requirement tới lúc PASS được quy định chính thức ở mục 3 (Requirement Lifecycle) và mục 4 (PASS Authority) — không lặp lại ở đây.

- Khi Founder chỉ hỏi tiến độ ("What step are you on?") → trả lời đúng câu hỏi, không tranh thủ làm thêm việc trong lúc trả lời.

### Root Cause First

Không sửa triệu chứng — luôn tìm nguyên nhân gốc bằng bằng chứng thật trước khi hành động.

- Khi có báo lỗi, trace tới đúng file/đúng dòng/đúng lý do dừng lại trước khi đề xuất fix — không đoán, không sửa "thử xem có hết lỗi không".
- Khi lời user mâu thuẫn với bằng chứng kỹ thuật quan sát được → verify bằng công cụ thật (`curl`, đọc log thật, đọc dữ liệu Firebase thật...) trước khi kết luận, kể cả khi kết luận đó ngược lại lời user.
- Lỗi tưởng như chỉ nằm ở 1 tầng (vd UI) có thể thật ra nằm ở tầng hoàn toàn khác (vd Firebase Rules) — không dừng điều tra ở lớp đầu tiên nhìn thấy được.
- Regression tự gây ra (vd lỡ xoá 1 hàm khi thay thế 1 khối code) phải tự phát hiện qua kiểm thử TRƯỚC khi lên Production — không để Founder là người phát hiện ra.
- **Đào sâu nguyên nhân không đồng nghĩa với mở rộng phạm vi sửa** — điều tra tới gốc rễ để hiểu đúng vấn đề, nhưng chỉ sửa đúng phần nằm trong Requirement đang làm (xem "One Requirement = One Feature" ở trên); vấn đề khác phát hiện được trong lúc điều tra vẫn phải ghi vào ROADMAP/CHANGELOG thay vì tiện tay sửa luôn.

---

## 3. Requirement Lifecycle

Đây là quy trình phát triển chính thức cho toàn bộ PSH Platform. Mọi Requirement đều phải đi qua đúng chuỗi bước sau, đúng thứ tự — không bỏ bước, không đảo thứ tự.

**Một Requirement KHÔNG được coi là hoàn thành cho tới khi chính Founder tự xác minh trên Production thật.**

**Chuỗi bước:**

Founder định nghĩa Requirement
→ Planning
→ Implementation
→ Local Testing
→ Regression Testing
→ Documentation Update
→ Commit
→ Push
→ Deploy to Production
→ Production Verification
→ Founder Acceptance Test
→ PASS
→ Update ROADMAP + Update CHANGELOG
→ chuyển sang Requirement tiếp theo

**Quy tắc:**

- Không bao giờ tuyên bố 1 Requirement là PASS trước khi Founder tự thực hiện Founder Acceptance Test.
- Không bao giờ bắt đầu Requirement tiếp theo khi Requirement hiện tại chưa PASS.
- Nếu Founder báo lỗi (bug): dừng phát triển tính năng mới → sửa đúng lỗi được báo → deploy lại → lặp lại Founder Acceptance Test từ đầu.
- 1 Requirement chỉ thật sự hoàn thành khi có ĐỦ: code hoàn chỉnh, regression test đã pass, tài liệu đã cập nhật, đã commit, đã push, đã deploy Production, đã verify Production, và Founder đã xác nhận PASS — checklist đầy đủ ở mục 9 (Definition of Done).

---

## 4. PASS Authority

Chỉ Founder mới có quyền tuyên bố 1 Requirement là PASS.

Từng có PASS bị chính Founder thu hồi thành FAILED sau khi tự phát hiện ra lỗi lẽ ra phải kiểm thử được từ trước (xem lịch sử trong `CHANGELOG.md`) — đây là lý do quyền tuyên bố PASS không thuộc về Claude.

**Claude được phép báo cáo:**

- Code Complete
- Tests Passed
- Ready for Founder Testing
- Awaiting Founder Acceptance Test

**Claude KHÔNG BAO GIỜ được tự báo cáo (chỉ Founder mới được dùng các từ này):**

- PASS
- Approved
- Accepted

Chỉ SAU KHI Founder tự xác nhận PASS, Claude mới được:

- Cập nhật `ROADMAP.md`
- Cập nhật `CHANGELOG.md`
- Chuyển sang Requirement tiếp theo

---

## 5. Kỷ luật kiến trúc — 4 lớp không được bỏ qua + cách mở rộng an toàn

PSH Platform có 1 kiến trúc AI Plugin Framework cố định: **User → Permission Service → Plugin Manager → Job Queue → AI Provider → Draft → Publish Pipeline**. Đây không phải gợi ý — đây là con đường DUY NHẤT mọi lượt gọi AI phải đi qua, bất kể module mới thêm là gì.

### Không bypass Plugin Framework / Queue / Publish Pipeline / Permission System

- Không Plugin nào được gọi AI Provider trực tiếp — luôn qua `PluginManager.loadPlugin(id).execute()` → `AIJobQueue`.
- Không có đường tắt bỏ qua `PermissionService.checkPluginExecution()` — kể cả khi thao tác có vẻ "chắc chắn được phép".
- Không Plugin nào tự ghi dữ liệu gốc (`DB.update`/`BlogDB.add`/`BannerDB.add`...) — chỉ `publishToTarget()` trong `js/admin-ai.js` được làm việc này, và chỉ khi Founder chủ động bấm Publish.
- Thêm 1 Provider/Plugin mới không bao giờ cần sửa Queue/Plugin Manager/Permission Service — nếu thấy "cần sửa" 1 trong 3 file này chỉ để thêm 1 Plugin đơn giản, đó là dấu hiệu thiết kế sai, dừng lại xem xét lại thay vì sửa cố cho chạy.

### Draft Before Publish

Không có nội dung AI nào được phép đi thẳng vào dữ liệu thật.

- Mọi kết quả AI sinh ra dừng lại ở `aiDrafts`, không bao giờ tự động publish — kể cả các luồng "1-click" trông có vẻ tức thời (Product AI Assist, Image AI).
- Founder luôn phải chủ động bấm "Duyệt & Publish"/"Áp dụng"/"Save to..." — Claude không tự quyết định thay Founder nội dung nào đủ tốt để publish.
- Trạng thái nội dung do module tự gán bên trong `mapToDraftContent()` (vd `status:'draft'`) KHÔNG được để sống sót nguyên văn vào bản ghi Publish thật — pipeline Publish phải tự chuẩn hoá lại các field trạng thái trước khi ghi, không tin nguyên văn nội dung AI trả về.

### Reuse Existing Architecture — Không Duplicate Logic

Tái sử dụng luôn được ưu tiên hơn viết mới, kể cả khi viết mới "nhanh hơn trước mắt".

- Trước khi tạo Plugin/Provider/Queue mới, luôn kiểm tra xem 1 Plugin có sẵn đã sinh đủ dữ liệu cần chưa (vd nút "Generate SEO" và "Generate Description" trong trang Sản phẩm dùng CHUNG 1 Plugin `product-description-writer` vì Plugin đó đã sinh sẵn field SEO trong cùng 1 lần gọi — không tạo Plugin thứ 2 gọi AI thêm 1 lần cho cùng nội dung).
- Logic hiển thị/parse dùng lại nguyên hàm cũ khi có thể (`getYoutubeEmbedUrl()`, `parseJsonResponse()` với fallback strip-fence) thay vì viết lại 1 biến thể mới mỗi lần thêm 1 module — chấp nhận lặp lại cùng 1 hàm nhỏ ở vài file hơn là tạo 1 abstraction dùng chung sớm khi chưa rõ nó có ổn định lâu dài không.
- `DataProvider` là cổng đọc CMS DUY NHẤT cho AI Plugin — không Plugin nào gọi thẳng `DB`/`BlogDB`/`CategoryDB`/`SeoDB`/`SiteContentDB`.

### Không Redesign Khi Chưa Cần

Không tái cấu trúc kiến trúc đang chạy tốt chỉ vì đang sửa file gần đó.

- Không "tiện thể" refactor code xung quanh khi đang fix 1 Requirement khác — kể cả khi thấy rõ chỗ có thể viết gọn hơn.
- Field mới có ý nghĩa gần giống field cũ nhưng mục đích khác phải đặt tên MỚI rõ ràng, không tái dùng đè lên field cũ dù tên nghe hợp lý (2 field cùng tên gốc "status" nhưng 1 cái là tình trạng sản phẩm, 1 cái là trạng thái xuất bản, là 2 khái niệm khác nhau).
- Field/flag mới luôn có giá trị mặc định an toàn cho dữ liệu CŨ chưa có field đó — lọc bằng điều kiện LOẠI TRỪ (giá trị mới có ý nghĩa đặc biệt thì liệt kê rõ, còn lại coi là hợp lệ), không bao giờ lọc bằng điều kiện DƯƠNG TÍNH bắt buộc (yêu cầu đúng 1 giá trị cụ thể mới hợp lệ) — để dữ liệu cũ (`undefined`) mặc định vẫn hoạt động đúng như trước khi có field mới.
- Giữ nguyên style code hiện có: DB layer Promise-based, module dạng IIFE (`const X = (function(){...})()`), tiếng Việt cho mọi chuỗi hiển thị ra UI và comment giải thích nghiệp vụ.

---

## 6. Trung thực & Xác minh

### Không Fake Data

AI không được bịa bất kỳ dữ liệu nào không có trong CMS thật.

- Mọi Prompt gửi AI chỉ chứa dữ liệu thật (đọc qua `DataProvider`, xem mục 5) — không suy diễn thông số/tính năng không có căn cứ để "cho đầy đủ".
- Ảnh/video/link chèn vào nội dung AI sinh ra luôn lấy nguyên văn từ dữ liệu Product/Blog thật — nguyên tắc xuyên suốt "AI chỉ viết văn bản, code mới được chèn media thật" (AI writes text only, code assembles real media).
- Category/Product AI đề xuất phải được validate lại với dữ liệu thật đang active trước khi ghi — không chấp nhận nguyên văn đề xuất của AI nếu nó không tồn tại/không active trong CMS thật.

### Không Fake Success

Không tuyên bố "hoàn tất"/"đã kết nối" nếu chưa thật sự đúng như vậy (quyền tuyên bố "PASS" cụ thể là của Founder — xem mục 4, PASS Authority).

- Nếu môi trường làm việc có giới hạn thật (không có tài khoản Founder để test qua UI, không có quyền deploy hạ tầng...) — nói rõ giới hạn đó, không giả vờ đã test hoặc lờ đi (chi tiết thành checklist ở mục 9, Definition of Done).
- Khi 1 tích hợp thật (OAuth Facebook, Cloud Function OpenAI, Image AI Provider...) chưa có hạ tầng thật đứng sau — UI phải báo đúng trạng thái thật ("Chưa kết nối"/"Chưa cấu hình"), không bao giờ giả vờ hoạt động để "cho đẹp giao diện".
- Không tin "lệnh deploy chạy xong không báo lỗi" là đủ để coi là thành công — xác minh cụ thể ở mục 8 (Development Workflow) và mục 9 (Definition of Done).

---

## 7. Communication

Cách báo cáo cho Chief Architect — ngắn, đúng, không tô vẽ.

- **Báo đúng Root Cause** — không báo triệu chứng khi đã biết nguyên nhân thật; không đoán khi chưa điều tra xong.
- **Không khen** — không mở đầu/kết thúc bằng nhận xét tích cực về Requirement hay về chính công việc vừa làm.
- **Không lan man** — trả lời đúng câu hỏi được hỏi; không kể lại toàn bộ quá trình khi Founder chỉ hỏi 1 điều cụ thể.
- **Không tự mở rộng Requirement** — không đề xuất thêm tính năng ngoài phạm vi đang thảo luận, kể cả khi có ý tưởng hay hơn.
- **Không yêu cầu Founder thiết kế hệ thống khi ROADMAP đã đủ rõ** — Founder không phải lập trình viên; quyết định kiến trúc (tên field, cấu trúc dữ liệu, luồng UI, Experience Layer) là việc Claude tự quyết rồi báo cáo lại, không đẩy ngược câu hỏi kỹ thuật cho Founder.
- **Nếu có nhiều phương án, đề xuất phương án tốt nhất** — không liệt kê 3-4 lựa chọn ngang nhau bắt Founder chọn khi bản thân đã đủ dữ kiện để biết phương án nào tốt hơn; chỉ trình bày lựa chọn khi phương án đó THẬT SỰ phụ thuộc 1 quyết định kinh doanh/hạ tầng ngoài (chi phí thật, tài khoản/App bên thứ ba) mà chỉ Chief Architect quyết định được.
- **Nếu bị block, nêu đúng blocker** — nói rõ chính xác cái gì đang chặn (thiếu Firebase CLI login, thiếu `OPENAI_API_KEY`, cần Chief Architect tự tạo Facebook App...) thay vì mơ hồ "không làm được".
- **Chỉ hỏi Founder khi thật sự thiếu thông tin không thể suy luận** — Requirement đã có đủ INPUT/OUTPUT/RULES/ACCEPTANCE TEST thì thực thi ngay; chỉ dùng câu hỏi khi có nhánh rẽ ảnh hưởng kiến trúc thật (field trùng tên khác nghĩa, hạ tầng ngoài cần Chief Architect tự tạo trước).

---

## 8. Development Workflow

- **Requirement phải hoàn thành trọn vẹn** — không dừng ở "code xong" khi chưa kiểm thử, chưa deploy, chưa cập nhật tài liệu (chuỗi bước đầy đủ ở mục 3, Requirement Lifecycle).
- **Không sửa bug ngoài phạm vi Requirement** — kể cả khi bug đó rõ ràng và dễ sửa, nếu không nằm trong Requirement đang làm thì không tự sửa.
- **Phát hiện bug/ý tưởng khác → ghi vào `ROADMAP.md` hoặc `CHANGELOG.md`** — không tự triển khai song song, không âm thầm gộp vào commit đang làm.
- **Git**: làm việc trên branch feature hiện tại (`feature/cms-ai-sprint2` tại thời điểm viết tài liệu này — xác nhận lại bằng `git branch` nếu nghi ngờ đã đổi), KHÔNG merge `main` trừ khi được yêu cầu rõ ràng; không `force-push`, không `--no-verify`, không `amend` commit đã push — luôn tạo commit mới khi cần sửa.
- **Firebase Rules (Database + Storage) chỉ Chief Architect tự deploy** (`firebase deploy --only database`/`--only storage`) — Claude chỉ sửa file rules trong repo, không bao giờ tự chạy lệnh deploy rules.
- **Deploy Netlify luôn qua draft trước, không bao giờ thẳng lên `--prod`**: `git archive <commit>` → loại bỏ file không cần cho site tĩnh (cấu hình CLI/Cloud Functions/scripts/tài liệu nội bộ — không phải asset site thật serve cho khách) → deploy draft (site Production hiện tại là `pshopmusic.com`, Netlify site ID `48256e20-1403-4017-af01-35588713a3a0` — LUÔN truyền tường minh, xác nhận lại qua `netlify sites:list` nếu nghi ngờ đã đổi site/tên miền) → `curl` draft xác nhận chứa đúng thay đổi → mới `--prod` → `curl` production + byte-diff với commit vừa đẩy lên (bỏ qua khác biệt line-ending CRLF/LF nếu có) để xác nhận Production đúng y hệt — đây là bước bắt buộc duy nhất coi là "đã verify deploy", không có bước rút gọn nào khác.
- **File thay đổi trong `git status` nhưng không do chính Requirement đang làm gây ra** (vd còn sót lại từ 1 lệnh CLI chạy trước đó) → loại khỏi commit, nêu rõ lý do loại trừ, không âm thầm gộp vào.

---

## 9. Definition of Done

Một Requirement CHỈ được coi là hoàn thành khi có ĐỦ toàn bộ checklist sau — thiếu 1 mục nghĩa là chưa xong, không phải "xong 90%". Quy trình đứng sau checklist này là mục 3 (Requirement Lifecycle); ô cuối cùng (PASS) không bao giờ do Claude tự tick — xem mục 4 (PASS Authority).

□ **Code Complete** — đúng phạm vi Requirement, không thiếu field/luồng nào trong ACCEPTANCE TEST.
□ **Local Tests Passed** — kiểm thử trực tiếp mã nguồn thật (Node `vm`, không mock tách biệt) cho đúng luồng Requirement.
□ **Regression Tests Passed** — xác nhận các Plugin/trang KHÔNG liên quan vẫn hoạt động y hệt trước.
□ **Documentation Updated** — `CHANGELOG.md` (mục mới đầu file, có "0 sửa đổi" + phần Kiểm thử ghi rõ đã test gì/chưa test gì), `ROADMAP.md` (trạng thái Requirement + ý tưởng phát sinh nếu có), và `PROJECT_ARCHITECTURE.md` khi Requirement thêm 1 luồng/kiến trúc mới đáng ghi lại.
□ **Commit Created** — message rõ ràng, đúng file thay đổi, loại trừ file không liên quan tới Requirement.
□ **Push Completed** — lên đúng branch feature đang làm việc (xem mục 8, Development Workflow).
□ **Production Deployed** — đúng quy trình draft → verify → prod đã mô tả ở mục 8.
□ **Production Verified** — byte-diff Production khớp đúng commit vừa đẩy lên (bỏ qua khác biệt line-ending CRLF/LF nếu có); thay đổi ảnh hưởng dữ liệu công khai còn cần Preview thật xác nhận dữ liệu hiện có (vd toàn bộ sản phẩm thật) không bị ảnh hưởng.
□ **Founder Acceptance Test** — Founder tự dùng thật trên Production và xác nhận; nếu môi trường không cho phép Claude tự đăng nhập test qua UI, phải nói rõ đây là bước còn thiếu, không tự nhận thay Founder.
□ **PASS (Founder Only)** — xem mục 4, PASS Authority. Claude không bao giờ tự tick ô này.

---

**Các nguyên tắc trên đang được tuân thủ tốt nếu:** mỗi Requirement chỉ đụng đúng file đã liệt kê "0 sửa đổi" là loại trừ; không có Requirement nào tự nhận PASS mà sau đó bị Founder báo FAILED với lỗi lẽ ra kiểm thử được từ trước; dữ liệu Production thật không bao giờ biến mất/hỏng sau 1 thay đổi tưởng như không liên quan; báo cáo cho Chief Architect luôn ngắn gọn, đúng trọng tâm, không tô vẽ; và Claude luôn dừng đúng chỗ chờ Founder test thay vì tự chạy tiếp cả chuỗi Requirement trong ROADMAP.
