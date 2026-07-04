# AI Assistant — Quy tắc bắt buộc (AI_RULES)

AI Assistant trong PSH Platform là **Workflow Engine dạng Plugin**, KHÔNG phải chatbot. Mọi plugin mới thêm vào sau này (kể cả không do sprint này viết) đều phải tuân thủ các quy tắc dưới đây — vi phạm bất kỳ điều nào là lỗi thiết kế cần sửa trước khi merge.

## 1. Workflow bắt buộc

```
CMS → AI Plugin → Draft → Admin Review → Publish
```

AI không được tự Publish trong bất kỳ trường hợp nào. Mọi kết quả sinh ra dừng lại ở **Draft** (node `aiDrafts`), chỉ chuyển thành dữ liệu thật khi Admin/Editor bấm **Duyệt & Publish** trong `admin/ai/drafts.html`.

## 2. Chỉ đọc, không bịa, không sửa dữ liệu gốc

- AI chỉ đọc CMS qua đúng hàm data layer đã có: `DB.get/getAll`, `CategoryDB.getAll`, `BlogDB.get/getAll`, `SeoDB.get`, `SiteContentDB.get` (Products/Categories/Blog/SEO/Settings). Không tự suy diễn/bịa số liệu không có trong dữ liệu đọc được.
- **Brands** và **Media Library** hiện chưa phải CMS module riêng: Brand đọc qua field `brand` sẵn có trên Product; Media Library dùng tạm ảnh sẵn có của chính đối tượng đang xử lý (vd `product.images`) — xem `ROADMAP.md` mục Media Library.
- AI không bao giờ gọi `DB.update`, `BlogDB.update`, `BannerDB.add`, `SiteContentDB.save`... trực tiếp từ trong 1 module/plugin. Các hàm ghi dữ liệu thật chỉ được gọi ở **đúng 1 nơi**: `publishToTarget()` trong `js/admin-ai.js`, và chỉ chạy khi Admin bấm Publish.

## 3. Chỉ chạy khi có hành động rõ ràng của người dùng

Không có trigger tự động/cron/webhook nào khởi chạy AI. Mọi job đều bắt đầu từ việc người dùng bấm "Chạy" trên `admin/ai/index.html`.

## 4. Provider độc lập (Provider Interface)

Hợp đồng chung: `js/ai/provider-interface.js`. Đổi nhà cung cấp AI (OpenAI/Claude/Gemini/DeepSeek/khác) chỉ cần:
- Đổi `activeProvider` toàn cục trong `admin/ai/providers.html`, HOẶC
- Gán provider riêng cho 1 plugin cụ thể trong `admin/ai/plugins.html` (Plugin Manager, `aiPlugins/{id}.providerId`).

Không việc nào trong 2 việc trên yêu cầu sửa Workflow, UI, hay `js/ai/job-queue.js`. Provider mới = thêm 1 file trong `js/ai/providers/*.js` tự gọi `AIProviderRegistry.register()`.

## 5. Plugin độc lập (Module/Plugin Registry)

Mỗi AI Action là 1 file riêng trong `js/ai/modules/*.js`, tự gọi `AIModuleRegistry.register()`. Thêm/gỡ 1 plugin không được phép ảnh hưởng plugin khác hay phần còn lại của hệ thống. Trạng thái Enable/Disable/Version/Provider của từng plugin quản lý qua **Plugin Manager** (`admin/ai/plugins.html`, node `aiPlugins`) — plugin bị Disable phải:
- Không hiển thị trên Dashboard (`admin/ai/index.html`).
- Không thể thực thi kể cả khi bị gọi trực tiếp (guard 2 lớp: ẩn UI + kiểm tra lại trong `AdminAI.runModule()`).

## 6. Job Queue tuần tự

Mọi plugin chạy qua `js/ai/job-queue.js` (`AIJobQueue`), xử lý **tuần tự từng item**, không chạy song song. Trạng thái job: `queued` (hiển thị "Pending"), `running`, `completed`, `failed` (ở cấp item), `cancelled`, và hành động `retryFailed()`/`resume()`.

⚠️ **Giới hạn kiến trúc đã biết**: Job Queue hiện chạy phía trình duyệt Admin (V1) — PSH Platform không có backend/Cloud Functions. Nếu đóng tab `admin/ai/jobs.html` giữa chừng, job dở tiếp tục khi mở lại trang đó. Xem `ROADMAP.md` cho hướng nâng cấp — **không tự ý thêm Cloud Functions để "sửa" giới hạn này** nếu chưa được yêu cầu rõ ràng.

## 7. Log bắt buộc cho mọi lượt chạy

Mỗi item xử lý (kể cả thất bại vì chưa cấu hình provider) đều ghi 1 dòng vào `aiLogs` (`LogDB`) gồm: thời gian, người thực hiện (uid + email), plugin, provider, `jobId`, thời gian xử lý (`durationMs`), trạng thái (`success`/`failure`), thông báo lỗi nếu có. Không được bỏ log ở bất kỳ nhánh nào của `processItem()`.

## 8. Giới hạn phạm vi hiện tại (Sprint 2)

Chỉ 3 plugin đang **Enable**: Product Description Generator, Slider Generator, SEO Generator. 5 plugin viết ở Sprint 1 (Blog Writer, Facebook Post Generator, Banner Generator, FAQ Generator, Image Prompt Generator) giữ nguyên code, đánh dấu **Disabled/Coming Soon** trong Plugin Manager — không xóa, không refactor, sẽ bật ở sprint sau (xem `ROADMAP.md`).

Chưa tích hợp AI Image Generation / AI Video ở bất kỳ hình thức nào (kể cả gọi thử) — các module liên quan (`image-prompt-generator`) chỉ sinh **văn bản prompt** để người dùng tự dùng ở công cụ khác.

## Giới hạn kiến trúc phát hiện khi triển khai Sprint 2

- **Media Library chưa tồn tại**: Slider Generator dùng tạm `product.images` của chính sản phẩm đang xử lý làm nguồn ảnh, thay vì đọc 1 Media Library tổng.
- **Sản phẩm không có trang riêng**: SEO Generator Sprint 2 chỉ nhắm **Blog Post** (nơi `blog-post.html` đã có cơ chế set Meta/OG động sẵn) — chưa áp dụng cho Product.

Hai điểm trên đã ghi vào `ROADMAP.md`, không tự ý xây thêm Media Library hay trang sản phẩm riêng nếu chưa được yêu cầu.
