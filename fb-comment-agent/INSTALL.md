# Hướng dẫn cài đặt — Facebook Comment AI Agent

## Yêu cầu
- Node.js 18+
- Facebook Page (đã tạo sẵn)
- Facebook Page Access Token

## Cài đặt nhanh

### 1. Clone / Copy files

Project nằm tại: `D:\PshopMusicSite\fb-comment-agent\`

### 2. Cài dependencies

```bash
cd D:\PshopMusicSite\fb-comment-agent
npm init -y
npm install node-fetch@2      # nếu cần cho Node < 18
```

> Node.js 18+ có sẵn fetch global, không cần cài thêm.

### 3. Cấu hình thông tin quán

Sửa file `knowledge/restaurant-info.json`:

```json
{
  "restaurant": {
    "name": "Hủ Tiếu Xào Á Tiểu Nhị",
    "address": "123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    "phone": "0909 123 456",
    "openingHours": {
      "weekdays": "09:00 - 22:00",
      "weekends": "08:00 - 23:00"
    },
    "delivery": {
      "grabFood": "https://food.grab.com/...",
      "shopeeFood": "https://shopeefood.vn/...",
      "baemin": "https://baemin.vn/..."
    }
  }
}
```

### 4. Lấy Facebook Page Access Token

1. Vào [Facebook Developers](https://developers.facebook.com/)
2. Tạo App → thêm sản phẩm **Facebook Login**
3. Vào **Tools → Graph API Explorer**
4. Chọn App → `GET TOKEN` → `Page Access Token`
5. Copy token (bắt đầu bằng `EAAC...`)

### 5. Cài biến môi trường

#### Windows (PowerShell - admin)
```powershell
[System.Environment]::SetEnvironmentVariable('FB_PAGE_ACCESS_TOKEN','YOUR_TOKEN_HERE','Machine')
```

#### Hoặc set trực tiếp trước khi chạy
```powershell
$env:FB_PAGE_ACCESS_TOKEN="YOUR_TOKEN_HERE"
```

### 6. Kiểm thử không cần token

```bash
node src/index.js test-classify "Cho xin menu"
node src/index.js test-reply "Quán ở đâu?"
```

### 7. Chạy thật

```bash
# Kiểm tra một lần
node src/index.js check

# Chạy nền liên tục
node src/index.js watch
```

## Chạy tự động qua Task Scheduler (Windows)

```powershell
# Tạo task chạy mỗi 15 phút
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "D:\PshopMusicSite\fb-comment-agent\src\index.js check" -WorkingDirectory "D:\PshopMusicSite\fb-comment-agent"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "FBCommentAgent_ATieuNhi" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM"
```

## Tùy chỉnh câu trả lời

Sửa file `src/reply-generator.js` — mảng `replies` chứa các template câu trả lời cho từng ý định. Có thể thêm/sửa/xóa thoải mái.
