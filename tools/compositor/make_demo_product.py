"""Tạo ảnh sản phẩm TỔNG HỢP để thử compositor/E2E (không phải ảnh khách hàng). Dùng: python make_demo_product.py <out.png>"""
import sys

from test_real_segmentation import synthetic_device

if __name__ == "__main__":
    synthetic_device().save(sys.argv[1], format="PNG")
