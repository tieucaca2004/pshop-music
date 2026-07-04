# Theme WordPress — Pshop Music

Theme này chuyển nguyên bản site tĩnh (`D:\PshopMusicSite`) sang WordPress, **giữ nguyên 100% giao diện và chức năng**: hero ảnh chạy tự động, 6 banner danh mục bo góc, lưới sản phẩm có tìm kiếm/lọc/xem thêm, popup chi tiết sản phẩm, form liên hệ, footer 4 cột.

Khác biệt chính so với bản tĩnh: **dữ liệu sản phẩm giờ nằm trong WordPress** (không còn localStorage riêng từng trình duyệt nữa) — bạn quản lý sản phẩm ngay trong `wp-admin`, mọi khách truy cập đều thấy cùng một dữ liệu.

⚠️ Đây là theme được viết theo đúng chuẩn WordPress (register post type, meta box, enqueue script...), nhưng **chưa được test trên WordPress thật** vì máy đang làm việc không cài PHP/MySQL. Bạn cần test lại sau khi cài lên hosting — nếu có lỗi gì, gửi lại thông báo lỗi để tôi sửa.

## Cài đặt

1. Nén thư mục `pshop-music/` (bên trong `wordpress-theme/`) thành file `pshop-music.zip` — **lưu ý nén đúng cách sao cho file `style.css` nằm ngay trong thư mục gốc của zip**, không bị lồng thêm 1 cấp thư mục.
2. Vào `wp-admin` → **Giao diện (Appearance) → Giao diện (Themes) → Thêm mới → Tải lên (Upload Theme)** → chọn file `pshop-music.zip` → Cài đặt → **Kích hoạt (Activate)**.
   - Hoặc tải qua FTP/File Manager: chép thư mục `pshop-music` vào `wp-content/themes/`, rồi vào Giao diện để kích hoạt.
3. Sau khi kích hoạt, theme sẽ **tự động chạy 1 lần**:
   - Tạo 5 danh mục sản phẩm: Máy DJ, Loa kiểm âm, Tai nghe, Soundcard, Phụ kiện.
   - Nhập toàn bộ **42 sản phẩm** có sẵn (kèm mô tả, giá, thương hiệu...), và **tải ảnh sản phẩm về lưu trên chính hosting của bạn** (8 sản phẩm có ảnh — quá trình tải ảnh về máy chủ này không bị chặn hotlink như khi xem trực tiếp trên trình duyệt, nên sẽ ổn định hơn bản cũ).
4. Mở trang chủ để kiểm tra — nếu chưa thấy đủ 42 sản phẩm (do hosting giới hạn thời gian chạy PHP, quá trình tải ảnh bị ngắt giữa chừng), truy cập:
   ```
   https://tenmiencuaban.com/wp-admin/?pshop_reimport=1
   ```
   (phải đăng nhập admin trước) — an toàn để chạy lại nhiều lần, sản phẩm đã có sẽ không bị nhân đôi.

## Quản lý sản phẩm

Vào menu **Sản phẩm** trong `wp-admin` (menu riêng, biểu tượng nốt nhạc):
- **Thêm sản phẩm mới**: nhập tên (tiêu đề), mô tả (ô nội dung chính), ảnh đại diện (Ảnh sản phẩm ở cột phải), chọn Danh mục, và điền các trường riêng ở khung "Chi tiết sản phẩm": Thương hiệu, Thông số/dòng phụ, Giá, Tình trạng (Mới/Qua sử dụng), Nhãn (badge).
- **Sửa/xóa**: thao tác y hệt bài viết thường của WordPress.
- Danh sách sản phẩm có thêm 2 cột **Giá** và **Tình trạng** để xem nhanh.

## Những gì giữ nguyên y hệt bản tĩnh

- Toàn bộ giao diện, màu sắc, font, hiệu ứng hover, responsive mobile.
- Hero slideshow tự động, banner danh mục bo góc, popup sản phẩm với nút Gọi/Zalo/Facebook/Shopee.
- Form liên hệ **vẫn chỉ chạy phía trình duyệt** (bấm gửi → hiện thông báo thành công), **chưa gửi email thật** — giống hệt bản tĩnh trước đó. Nếu muốn form gửi email thật qua `wp_mail`, báo tôi làm thêm (không khó, chỉ là chưa làm vì bạn nói "giữ nguyên tất cả").

## Việc bạn cần tự làm

- Đổi số điện thoại/Zalo/Facebook/Shopee nếu cần: sửa các hằng số `PSHOP_CONTACT_*` ở đầu file `functions.php`.
- Cài plugin bảo mật/backup thông thường (Wordfence, UpdraftPlus...) theo nhu cầu — theme này không đụng tới phần đó.
- Nếu muốn URL đẹp hơn (không bắt buộc vì sản phẩm không có trang riêng): vào **Cài đặt → Đường dẫn tĩnh (Permalinks)** chọn "Tên bài viết".

## Nếu gặp lỗi khi kích hoạt

Gửi cho tôi đúng nội dung lỗi hiển thị (hoặc dòng lỗi trong `wp-content/debug.log` nếu bật `WP_DEBUG`), tôi sẽ sửa trực tiếp trong các file PHP.
