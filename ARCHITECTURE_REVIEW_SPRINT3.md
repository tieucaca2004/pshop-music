# Architecture Review Report — Sprint 3, Requirement #1

Ngày: xem `CHANGELOG.md` mục "Sprint 3". Phạm vi: tích hợp OpenAI API thật vào AI Framework.

## Phát hiện

Khi triển khai "Hoàn thiện Provider (API Key, validate(), health(), Test Connection)" theo đúng nghĩa đen (nhập API Key vào form CMS, lưu qua `ProviderConfigDB`/`aiProviderConfig` như mọi field cấu hình khác), hệ thống an toàn tự động của công cụ đã **chặn thao tác này**, vì:

- `aiProviderConfig` là node Realtime Database, đọc được bởi **bất kỳ tài khoản nào có entry trong `roles`** — tức mọi Editor và Admin của CMS, không chỉ Admin.
- PSH Platform là site tĩnh, chạy hoàn toàn phía trình duyệt — không có nơi nào "ẩn" API Key khỏi client mà vẫn gọi được OpenAI trực tiếp từ JS.
- Lưu 1 secret có khả năng phát sinh chi phí thật (OpenAI tính phí theo usage) vào nơi nhiều tài khoản đọc được là rủi ro rò rỉ/lạm dụng thật, không phải giả định.

## Phân loại theo khung A/B/C

| Vấn đề | Phân loại | Lý do |
|---|---|---|
| Lưu API Key OpenAI thẳng trong `aiProviderConfig` (Firebase, phía client) | **A — Bắt buộc sửa ngay** | Đây là lỗ hổng bảo mật thật (secret leakage), không phải rủi ro lý thuyết — bất kỳ Editor nào cũng đọc được key, có thể gây thiệt hại tài chính thật qua OpenAI billing. Không triển khai tiếp theo hướng này. |
| Giải pháp: Cloud Function Proxy (`functions/openaiProxy`) giữ API Key trong Secret Manager, browser không bao giờ thấy key | Đã sửa ngay trong Sprint 3 theo quyết định của Chief Architect | Đúng mục A — đã xử lý trong sprint này thay vì hoãn. |
| Bảo mật API key cho 3 provider còn lại (Claude/Gemini/DeepSeek) khi được tích hợp thật ở sprint sau | **C — Future Roadmap** | Chưa tích hợp thật ở sprint này (ngoài phạm vi Requirement #1) — khi tích hợp, áp dụng lại đúng mẫu Cloud Function Proxy đã có, không cần thiết kế lại. Đã ghi vào `ROADMAP.md`. |
| Cloud Function region mặc định (`us-central1`) có độ trễ cao hơn với người dùng ở Việt Nam so với Realtime Database (`asia-southeast1`) | **C — Future Roadmap** | Không ảnh hưởng tính đúng đắn, chỉ ảnh hưởng độ trễ vài trăm ms — có thể đổi region khi cần tối ưu, không cấp bách. |
| Rate limiting / chống lạm dụng Cloud Function Proxy (1 Editor có thể gọi liên tục, tốn quota OpenAI) | **B — Đưa Sprint sau** | Hiện chỉ có xác thực (Firebase Auth + kiểm tra `roles`), chưa có giới hạn tần suất gọi. Rủi ro thấp ở quy mô hiện tại (ít tài khoản CMS), nhưng nên bổ sung nếu số lượng Editor tăng. |
| `functions/index.js` chưa có test tự động (unit test) | **C — Future Roadmap** | Ngoài phạm vi Requirement #1, không cấp bách cho 1 proxy function đơn giản. |

## Việc đã KHÔNG làm (đúng phạm vi Sprint 3 Requirement #1)

- Không đổi `IAIProvider` (vẫn đúng 3 phương thức `generate/validate/health`).
- Không đổi Plugin (`js/ai/modules/*.js`) — plugin vẫn không biết OpenAI/Claude/Gemini/DeepDeepSeek, chỉ gọi qua interface.
- Không đổi Queue (`js/ai/job-queue.js`), không đổi Plugin Manager (`js/ai/plugin-manager.js`).
- Không đổi Database Structure/Collection hiện có — chỉ thêm 1 Cloud Function mới, không thêm node Firebase nào.
- Không tích hợp Claude/Gemini/DeepSeek — vẫn là stub.
- Không xây rate limiting, không xây test tự động, không đổi region — ghi vào Roadmap thay vì tự làm.

## Đề xuất tiếp theo (không tự triển khai, chỉ ghi nhận)

Xem `ROADMAP.md` mục "AI Assistant" — đã cập nhật với 2 mục Future Roadmap ở trên.
