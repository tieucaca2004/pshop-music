"""CHỈ DÙNG CHO TEST TÍCH HỢP (không triển khai): chạy compositor_server THẬT nhưng thay bước tách nền bằng một
segmenter giả (mask hình chữ nhật ở giữa) để kiểm tra đường HTTP + compose + xác minh pixel mà không cần mô hình rembg.
In ra cổng đã bind ở dòng đầu tiên.  Dùng: COMPOSITOR_SECRET=... python stub_segmenter_server.py"""
import os
import sys
import numpy as np
from http.server import ThreadingHTTPServer

import compositor
import compositor_server


def stub_segment(rgb, mask_bytes):
    w, h = rgb.size
    a = np.zeros((h, w), dtype=np.uint8)
    a[h // 6: 5 * h // 6, w // 6: 5 * w // 6] = 255
    return a


compositor._segment = stub_segment

if __name__ == "__main__":
    secret = os.environ.get("COMPOSITOR_SECRET", "")
    if len(secret) < 24:
        sys.exit("COMPOSITOR_SECRET quá ngắn")
    srv = ThreadingHTTPServer(("127.0.0.1", 0), compositor_server.make_handler(secret))
    print(srv.server_address[1], flush=True)
    srv.serve_forever()
