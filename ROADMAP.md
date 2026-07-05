# Roadmap — chỉ ghi nhận, KHÔNG tự ý triển khai

Mọi mục dưới đây cần được yêu cầu rõ ràng ở 1 sprint sau mới triển khai. Không tự ý code trước khi được giao.

> **Trạng thái hiện tại: Sprint 2 và Sprint 3 (Requirement #1–#5) đã hoàn tất** — OpenAI qua Cloud Function Proxy, Product/SEO/Slider AI Plugin sang Production, End-to-End Integration Test + Completion Report (xem `docs/SPRINT_3_PROGRESS.md`). Các mục dưới đây vẫn ở dạng ghi nhận, chưa triển khai trừ khi ghi chú khác.

## AI Assistant

- **Kích hoạt 5 plugin đang "Coming Soon"** (Blog Writer, Facebook Post Generator, Banner Generator, FAQ Generator, Image Prompt Generator) — code đã có từ Sprint 1, chỉ cần bật Enable trong Plugin Manager ở sprint được giao.
- **Thêm field "Model" riêng cho Product** — hiện thông tin model đang gộp chung trong field `specs` (text tự do), không tách riêng. Phát sinh khi rà soát Requirement #2 (Sprint 3) — cần đổi Database Structure (Product schema) nên KHÔNG tự làm, chỉ ghi nhận.
- **Product Description Generator: dùng `description` hiện có làm ngữ cảnh** — hiện plugin luôn viết mô tả mới hoàn toàn từ `name/brand/specs/category`, chưa tận dụng `description` đã có (nếu có) để viết lại/mở rộng thay vì thay thế. Phát sinh khi rà soát Requirement #2 (Sprint 3) — ngoài phạm vi Requirement #2 (chỉ "kích hoạt sang Production", không đổi Prompt/Interface), để sprint sau nếu được giao.
- **SEO AI Plugin cho Product** — hiện SEO Generator (`js/ai/modules/seo-generator.js`) chỉ nhắm vào Blog Post, chưa hỗ trợ Product, vì Product chưa có trang chi tiết riêng để gắn Meta/OG/Schema (xem mục "SEO cho trang sản phẩm riêng" bên dưới — đây là cùng 1 giới hạn, ghi nhận lại khi rà soát Requirement #3, Sprint 3).
- **Tách riêng field "Focus Keyword"** cho SEO Generator — hiện đang gộp chung trong mảng `keywords` (nhiều từ khóa), chưa có 1 từ khóa chính riêng biệt. Phát sinh khi rà soát Requirement #3 (Sprint 3).
- **AI gợi ý URL Slug** cho SEO Generator — chưa làm vì đổi slug của bài đã publish có rủi ro phá link cũ (SEO/backlink); cần thiết kế riêng (vd chỉ áp dụng cho bài chưa publish) trước khi triển khai. Phát sinh khi rà soát Requirement #3 (Sprint 3).
- **Prompt Optimization** cho các plugin đã Production (Product Description Generator, SEO Generator) — prompt hiện là bản cố định từ Sprint 2, chưa qua vòng tối ưu/A-B test thực tế với OpenAI. Phát sinh khi rà soát Requirement #3 (Sprint 3).
- **Prompt Versioning** — chưa có cơ chế lưu lịch sử thay đổi prompt theo thời gian cho từng plugin. Phát sinh khi rà soát Requirement #3 (Sprint 3).
- **Cost Tracking** theo provider/plugin — chưa theo dõi chi phí sử dụng OpenAI (token/usage) theo từng lần Generate; xem thêm mục "Theo dõi chi phí/quota" đã ghi ở dưới (cùng ý, gộp lại).
- **Slider Generator: field `ctaText` hiện không có tác dụng** — Draft content có field này nhưng `js/home.js` không đọc (nút CTA dùng text cố định trong HTML, chỉ đổi `link`). Cần quyết định: làm cho field này có tác dụng thật (đổi text nút CTA theo từng slide) hoặc bỏ hẳn. Phát sinh khi rà soát Requirement #4 (Sprint 3), không sửa vì là Refactor ngoài phạm vi "chỉ kích hoạt sang Production".
- **Slider Generator: để AI tự gợi ý nội dung nút CTA** — hiện nội dung nút chỉ là lựa chọn cố định từ dropdown `ctaStyle` (Admin chọn tay), không phải do AI sinh ra. Phát sinh khi rà soát Requirement #4 (Sprint 3).
- **Job Queue V2**: chuyển xử lý `aiJobs` sang Firebase Cloud Functions (trigger theo dữ liệu) — xử lý tuần tự thật sự, không phụ thuộc trình duyệt Admin còn mở hay không.
- ✅ ~~Bảo mật API key provider~~ — **đã làm cho OpenAI** ở Sprint 3 Requirement #1 qua Cloud Function Proxy (`functions/openaiProxy`, key trong Secret Manager, không lưu Firebase/không lộ client). Xem `ARCHITECTURE_REVIEW_SPRINT3.md`.
- **Áp dụng lại mẫu Cloud Function Proxy cho Claude/Gemini/DeepSeek** khi các provider này được tích hợp thật ở sprint sau — dùng đúng khuôn mẫu `functions/index.js` đã có, không thiết kế lại (xem `ARCHITECTURE_REVIEW_SPRINT3.md`, phân loại C).
- **Rate limiting cho Cloud Function Proxy** — hiện chỉ xác thực (Firebase Auth + `roles`), chưa giới hạn tần suất gọi/quota theo user. Cân nhắc khi số lượng tài khoản CMS tăng (xem `ARCHITECTURE_REVIEW_SPRINT3.md`, phân loại B).
- **Đổi region Cloud Function** sang gần Việt Nam hơn (hiện `us-central1`) để giảm độ trễ, nếu cần tối ưu (phân loại C).
- **Job Queue V3**: dedicated queue service (vd Cloud Tasks) khi quy mô lớn hơn.
- **Media Library CMS module**: kho ảnh trung tâm (duyệt/tìm/tái sử dụng ảnh đã upload) — hiện ảnh chỉ quản lý rời rạc theo từng field. Cần có trước khi Slider Generator/Banner Generator thật sự "đọc Media Library" đúng nghĩa.
- **SEO cho trang sản phẩm riêng**: SEO Generator mở rộng sang Product — cần có trang chi tiết/URL riêng cho từng sản phẩm trước (hiện Product chỉ hiển thị dạng lưới + modal trên `category.html`).
- **AI Image Generation**: tích hợp API tạo ảnh thật (dùng `imagePrompt` đã có từ Slider Generator/Image Prompt Generator làm input) — chưa làm ở sprint nào tới hiện tại.
- **AI Video**: chưa có kế hoạch cụ thể.
- Sửa nội dung Draft bằng rich-text (Quill) thay vì xem JSON thô trong `admin/ai/drafts.html`.
- Theo dõi chi phí/quota sử dụng theo từng provider.

- **Version-control Firebase Realtime Database Rules** (`database.rules.json`) trong repo thay vì chỉ quản lý trên Firebase Console — giúp review/rollback rules dễ hơn, đặc biệt sau khi Cloud Function `openaiProxy` bắt đầu đọc node `roles`. Phát sinh khi rà soát Requirement #5 (Sprint 3).
- **Test tự động (CI)** cho `job-queue.js`/`permission-service.js`/3 plugin Production — Sprint 3 Requirement #5 mới kiểm thử thủ công 1 lần (mô phỏng qua Node `vm`, xem `docs/SPRINT_3_PROGRESS.md`), chưa phải bộ test chạy tự động trong CI.

## CMS / Hạ tầng chung

- WordPress theme (`wordpress-theme/`) hiện lạc hậu so với kiến trúc CMS chính — đồng bộ lại nếu được yêu cầu dùng song song.
- Xem thêm các mục Roadmap kỹ thuật khác (nếu phát sinh) trong `README.md`.
