"""Test PYTHON COMPOSITOR: chạy `python -m unittest -v` trong tools/compositor (cần Pillow, numpy).
Ảnh thử là ảnh TỔNG HỢP (không dùng ảnh khách hàng, không gọi mạng ngoài localhost)."""
import base64
import io
import json
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import compositor
import compositor_server

try:
    import rembg  # noqa: F401
    HAVE_REMBG = True
except Exception:
    HAVE_REMBG = False


def make_product(w=640, h=480, seed=7):
    """Sản phẩm giả: nhiều chi tiết (nhiễu màu + vạch giống chữ/nút) để lỗi nội suy/đổi màu bị phát hiện."""
    rng = np.random.default_rng(seed)
    arr = rng.integers(0, 256, size=(h, w, 3), dtype=np.uint8)
    im = Image.fromarray(arr, "RGB")
    d = ImageDraw.Draw(im)
    for i in range(0, w, 40):
        d.line([(i, 0), (i, h)], fill=(255, 255, 255), width=1)
    d.text((20, 20), "PSHOP-X1 LOGO", fill=(0, 0, 0))
    return im


def make_blocky(w, h, seed=11, block=16):
    """Sản phẩm giả nén được (khối màu) cho test ảnh lớn — vẫn đủ chi tiết để phát hiện nội suy."""
    rng = np.random.default_rng(seed)
    small = rng.integers(0, 256, size=((h + block - 1) // block, (w + block - 1) // block, 3), dtype=np.uint8)
    arr = np.kron(small, np.ones((block, block, 1), dtype=np.uint8))[:h, :w]
    return Image.fromarray(arr, "RGB")


def make_mask(w, h, inset=60, feather=3):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([inset, inset, w - inset, h - inset], radius=40, fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather))


def to_bytes(im, fmt="PNG"):
    b = io.BytesIO()
    im.save(b, format=fmt)
    return b.getvalue()


def core_of(mask_img):
    a = np.array(mask_img, dtype=np.uint8)
    a = a.copy()
    a[a >= 250] = 255
    a[a < 6] = 0
    ys, xs = np.nonzero(a > 0)
    return a, (int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1)


class ComposeTests(unittest.TestCase):
    def test_core_pixels_are_byte_identical_independent_check(self):
        prod = make_product()
        mask = make_mask(*prod.size)
        png, rep = compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(mask))
        self.assertTrue(rep["product_pixels_preserved"])
        self.assertEqual(rep["core_pixels_mismatched"], 0)
        # Kiểm lại ĐỘC LẬP (không dùng verify_output của compositor)
        out = np.array(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.uint8)
        alpha, (x0, x1, y0, y1) = core_of(mask)
        src = np.array(prod, dtype=np.uint8)[y0:y1, x0:x1]
        a = alpha[y0:y1, x0:x1]
        ox, oy = rep["placement"]
        region = out[oy:oy + (y1 - y0), ox:ox + (x1 - x0)]
        core = a == 255
        self.assertGreater(int(core.sum()), 50000)
        self.assertTrue(np.array_equal(region[core], src[core]))

    def test_no_resampling_when_product_fits(self):
        prod = make_product()
        mask = make_mask(*prod.size)
        _, rep = compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(mask))
        alpha, (x0, x1, y0, y1) = core_of(mask)
        self.assertEqual(rep["product_size"], [x1 - x0, y1 - y0])
        self.assertEqual(rep["canvas"], [1200, 1200])

    def test_background_is_new_and_edges_are_soft(self):
        prod = make_product()
        mask = make_mask(*prod.size)
        png, rep = compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(mask))
        out = np.array(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.uint8)
        # Góc ảnh đầu ra là nền thủ tục (sáng, mịn), không phải nhiễu của ảnh gốc
        corner = out[:40, :40].reshape(-1, 3).astype(float)
        self.assertLess(corner.std(axis=0).max(), 6.0)
        self.assertGreater(corner.mean(), 150)
        self.assertEqual(rep["background"], "procedural:studio")
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")

    def test_jpeg_input_uses_decoded_pixels_as_truth(self):
        prod = make_product()
        jpg = to_bytes(prod, "JPEG")
        decoded = Image.open(io.BytesIO(jpg)).convert("RGB")
        mask = make_mask(*decoded.size)
        png, rep = compositor.compose(jpg, None, (1000, 1000), "warm", to_bytes(mask))
        self.assertTrue(rep["product_pixels_preserved"])
        out = np.array(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.uint8)
        alpha, (x0, x1, y0, y1) = core_of(mask)
        ox, oy = rep["placement"]
        core = alpha[y0:y1, x0:x1] == 255
        self.assertTrue(np.array_equal(out[oy:oy + y1 - y0, ox:ox + x1 - x0][core], np.array(decoded)[y0:y1, x0:x1][core]))

    def test_auto_canvas_fits_product_without_scaling(self):
        prod = make_product()
        mask = make_mask(*prod.size)
        _, rep = compositor.compose(to_bytes(prod), None, None, "studio", to_bytes(mask))
        pw, ph = rep["product_size"]
        cw, ch = rep["canvas"]
        self.assertEqual(cw, ch)
        self.assertGreaterEqual(cw, 640)
        self.assertLessEqual(cw, int(max(pw, ph) / 0.78) + 2)
        self.assertTrue(rep["product_pixels_preserved"])

    def test_provider_background_used(self):
        prod = make_product()
        mask = make_mask(*prod.size)
        bg = Image.new("RGB", (900, 700), (10, 200, 30))
        png, rep = compositor.compose(to_bytes(prod), to_bytes(bg), (1200, 1200), "studio", to_bytes(mask))
        self.assertEqual(rep["background"], "provider")
        out = np.array(Image.open(io.BytesIO(png)).convert("RGB"))
        self.assertLess(abs(int(out[5, 5, 1]) - 200), 12)

    def test_large_product_expands_canvas_instead_of_scaling(self):
        prod = make_blocky(2400, 1800)
        mask = make_mask(2400, 1800, inset=100)
        png, rep = compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(mask))
        self.assertTrue(rep["product_pixels_preserved"])
        cw, ch = rep["canvas"]
        pw, ph = rep["product_size"]
        self.assertGreaterEqual(cw, pw)
        self.assertGreaterEqual(ch, ph)
        self.assertGreater(cw, 1200)

    def test_product_too_large_is_rejected(self):
        prod = Image.new("RGB", (4600, 3000), (120, 120, 120))
        mask = make_mask(4600, 3000, inset=300)
        with self.assertRaises(compositor.CompositorError) as cm:
            compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(mask))
        self.assertEqual(cm.exception.code, "PRODUCT_TOO_LARGE")

    def test_no_segmentation_without_mask_or_model(self):
        if HAVE_REMBG:
            self.skipTest("rembg đã cài trên máy này (kịch bản 'chưa có mô hình' không áp dụng)")
        with self.assertRaises(compositor.NoSegmentation) as cm:
            compositor.compose(to_bytes(make_product()), None, (1200, 1200), "studio", None)
        self.assertEqual(cm.exception.code, "NO_SEGMENTATION")

    def test_bad_masks_and_images_rejected(self):
        prod = make_product()
        empty = Image.new("L", prod.size, 0)
        full = Image.new("L", prod.size, 255)
        for m in (empty, full):
            with self.assertRaises(compositor.CompositorError) as cm:
                compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(m))
            self.assertEqual(cm.exception.code, "BAD_MASK")
        wrong = Image.new("L", (10 + prod.width, prod.height), 255)
        with self.assertRaises(compositor.CompositorError):
            compositor.compose(to_bytes(prod), None, (1200, 1200), "studio", to_bytes(wrong))
        with self.assertRaises(compositor.CompositorError) as cm:
            compositor.compose(b"not an image", None, (1200, 1200), "studio", to_bytes(make_mask(*prod.size)))
        self.assertEqual(cm.exception.code, "BAD_IMAGE")
        with self.assertRaises(compositor.CompositorError):
            compositor.compose(b"", None, (1200, 1200))


class ServerTests(unittest.TestCase):
    SECRET = "s" * 32

    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), compositor_server.make_handler(cls.SECRET))
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, body, secret=None, path="/compose", raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path), data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        if secret is not None:
            req.add_header("X-Compositor-Secret", secret)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def payload(self, with_mask=True):
        prod = make_product()
        p = {"image_b64": base64.b64encode(to_bytes(prod)).decode(), "canvas": {"width": 1000, "height": 1000}, "style": "studio"}
        if with_mask:
            p["mask_b64"] = base64.b64encode(to_bytes(make_mask(*prod.size))).decode()
        return p

    def test_success_roundtrip(self):
        st, body = self.post(self.payload(), self.SECRET)
        self.assertEqual(st, 200)
        self.assertTrue(body["ok"])
        self.assertTrue(body["report"]["product_pixels_preserved"])
        png = base64.b64decode(body["image_b64"])
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")

    def test_auth_required(self):
        self.assertEqual(self.post(self.payload(), None)[0], 401)
        self.assertEqual(self.post(self.payload(), "wrong-secret-wrong-secret-wrong")[0], 401)

    def test_no_segmentation_is_reported_not_faked(self):
        if HAVE_REMBG:
            self.skipTest("rembg đã cài (kịch bản 'chưa có mô hình' không áp dụng)")
        st, body = self.post(self.payload(with_mask=False), self.SECRET)
        self.assertEqual(st, 422)
        self.assertEqual(body["code"], "NO_SEGMENTATION")

    def test_bad_requests(self):
        self.assertEqual(self.post(None, self.SECRET, raw=b"{not json")[0], 400)
        self.assertEqual(self.post({"image_b64": "!!!"}, self.SECRET)[0], 400)
        self.assertEqual(self.post({}, self.SECRET, path="/other")[0], 404)


if __name__ == "__main__":
    unittest.main()
