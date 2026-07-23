# Facebook Comment AI Agent — Á Tiểu Nhị

Tự động trả lời bình luận trên Facebook Page **Hủ Tiếu Xào Á Tiểu Nhị**.

> ⚠️ Chỉ xử lý **Comment**. Không phải Messenger, không phải chatbot.

## Kiến trúc

```
fb-comment-agent/
├── src/
│   ├── index.js           # Entry point + Orchestrator
│   ├── classifier.js      # Phân loại ý định bình luận
│   ├── reply-generator.js # Sinh câu trả lời từ knowledge base
│   └── logger.js          # Ghi log + Review Queue
├── knowledge/
│   ├── restaurant-info.json  # Thông tin quán
│   └── intents.json          # Định nghĩa các ý định + từ khóa
├── config/
│   └── settings.json      # Cấu hình agent
├── logs/                  # Log files (auto-generated)
├── tests/
│   └── test-results.md    # Kết quả kiểm thử
├── README.md
└── INSTALL.md
```

## Luồng xử lý

```
Bình luận mới
    │
    ▼
[Classifier] ──→ Phân loại ý định
    │                 (menu, địa chỉ, giờ, giá, ...)
    │
    ├── ≥ 80% ──→ [Reply Generator] ──→ Đăng trả lời lên Facebook
    │
    └── < 80% ──→ [Review Queue] ──→ Chờ chủ quán duyệt
                        │
                        └── Spam / Thiếu từ ──→ Bỏ qua, không trả lời
```

## Các ý định hỗ trợ

| Ý định | Ví dụ bình luận | Hành động |
|--------|----------------|-----------|
| `ask_menu` | "Cho xin menu" | Gửi menu |
| `ask_address` | "Quán ở đâu?" | Gửi địa chỉ + Google Maps |
| `ask_hours` | "Mấy giờ mở cửa?" | Gửi giờ mở cửa |
| `ask_phone` | "Cho xin số điện thoại" | Gửi SĐT |
| `ask_delivery` | "Có Grab không?" | Gửi link các app ship |
| `ask_price` | "Bao nhiêu một tô?" | Gửi giá tham khảo |
| `ask_promotion` | "Có khuyến mãi gì không?" | Gửi chương trình KM |
| `complaint` | "Hủ tiếu bị nhão" | Xin lỗi + tag chủ quán |
| `praise` | "Ngon tuyệt vời" | Cảm ơn khách |
| `spam` | Link / emoji-only | Bỏ qua |

## Commands

```bash
# Kiểm tra bình luận một lần
node src/index.js check

# Chạy nền, kiểm tra định kỳ
node src/index.js watch

# Xem review queue
node src/index.js review

# Duyệt một item trong queue
node src/index.js resolve <review_id>

# Xem log gần đây
node src/index.js logs

# Kiểm thử classification (không cần FB token)
node src/index.js test-classify "Cho xin menu"
node src/index.js test-reply "Cho xin menu"
```

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `FB_PAGE_ACCESS_TOKEN` | ✅ | Facebook Page Access Token |
