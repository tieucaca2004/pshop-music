# Roadmap — chỉ ghi nhận, KHÔNG tự ý triển khai

Mọi mục dưới đây cần được yêu cầu rõ ràng ở 1 sprint sau mới triển khai. Không tự ý code trước khi được giao.

> **Trạng thái hiện tại: Sprint 2 đã hoàn tất. Sprint 3 CHƯA bắt đầu** — toàn bộ mục dưới đây đang ở dạng ghi nhận, chưa có mục nào được triển khai.

## AI Assistant

- **Kích hoạt 5 plugin đang "Coming Soon"** (Blog Writer, Facebook Post Generator, Banner Generator, FAQ Generator, Image Prompt Generator) — code đã có từ Sprint 1, chỉ cần bật Enable trong Plugin Manager ở sprint được giao.
- **Job Queue V2**: chuyển xử lý `aiJobs` sang Firebase Cloud Functions (trigger theo dữ liệu) — xử lý tuần tự thật sự, không phụ thuộc trình duyệt Admin còn mở hay không.
- **Bảo mật API key provider (đi kèm V2)**: proxy lời gọi AI thật (OpenAI/Claude/Gemini/DeepSeek) qua Cloud Function, không lưu/lộ key ở phía client.
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
