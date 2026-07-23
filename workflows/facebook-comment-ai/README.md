# Facebook Comment AI Agent - Hủ Tiếu Xào A Tiểu

## Cài đặt
```bash
node agent.js "câu hỏi của khách"
```

## Ví dụ
```bash
node agent.js "Cho xin menu"
# Intent: menu (100%)
# Reply: Dạ, quán em có hủ tiếu xào, hủ tiếu khô và hủ tiếu nước...

node agent.js "Quán ở đâu"
# Intent: địa chỉ (100%)
# Reply: Quán ở 86 Lạc Long Quân, Nha Trang...

node agent.js "Mấy giờ mở cửa"
# Intent: giờ (100%)
# Reply: Quán mở cửa 8:00 - 21:00...

node agent.js "Có Grab không"
# Intent: grab (100%)
# Reply: Có GrabFood và ShopeeFood...

node agent.js "abc xyz" (câu hỏi không liên quan)
# Intent: unknown (0%)
# Reply: [below 80% - cần duyệt]
```

## Chỉnh sửa knowledge base
Sửa file `knowledge/knowledge-base.json` để cập nhật menu, địa chỉ, giờ mở cửa...

## Lưu ý
- Reply chỉ được gửi tự động khi confidence >= 80%
- Câu hỏi không rõ ràng sẽ được chuyển vào hàng chờ
