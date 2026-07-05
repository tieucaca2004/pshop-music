# Roadmap — chỉ ghi nhận, KHÔNG tự ý triển khai

Mọi mục dưới đây cần được yêu cầu rõ ràng ở 1 sprint sau mới triển khai. Không tự ý code trước khi được giao.

> **Trạng thái hiện tại: Sprint 2 đã hoàn tất. Sprint 3 Requirement #1 (tích hợp OpenAI thật qua Cloud Function Proxy) và Requirement #2 (Product AI Plugin sang Production) đã hoàn tất.** Các mục dưới đây vẫn ở dạng ghi nhận, chưa triển khai trừ khi ghi chú khác.

## AI Assistant

- **Kích hoạt 5 plugin đang "Coming Soon"** (Blog Writer, Facebook Post Generator, Banner Generator, FAQ Generator, Image Prompt Generator) — code đã có từ Sprint 1, chỉ cần bật Enable trong Plugin Manager ở sprint được giao.
- **Thêm field "Model" riêng cho Product** — hiện thông tin model đang gộp chung trong field `specs` (text tự do), không tách riêng. Phát sinh khi rà soát Requirement #2 (Sprint 3) — cần đổi Database Structure (Product schema) nên KHÔNG tự làm, chỉ ghi nhận.
- **Product Description Generator: dùng `description` hiện có làm ngữ cảnh** — hiện plugin luôn viết mô tả mới hoàn toàn từ `name/brand/specs/category`, chưa tận dụng `description` đã có (nếu có) để viết lại/mở rộng thay vì thay thế. Phát sinh khi rà soát Requirement #2 (Sprint 3) — ngoài phạm vi Requirement #2 (chỉ "kích hoạt sang Production", không đổi Prompt/Interface), để sprint sau nếu được giao.
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

## CMS / Hạ tầng chung

- WordPress theme (`wordpress-theme/`) hiện lạc hậu so với kiến trúc CMS chính — đồng bộ lại nếu được yêu cầu dùng song song.
- Xem thêm các mục Roadmap kỹ thuật khác (nếu phát sinh) trong `README.md`.
