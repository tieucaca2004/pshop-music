"""Test THẬT với mô hình tách nền rembg (bỏ qua nếu chưa cài rembg hoặc chưa tải được mô hình).
Ảnh thử là ảnh TỔNG HỢP trên máy này; không gửi đi đâu. Pixel lõi được kiểm ĐỘC LẬP: tính lại mask bằng chính rembg."""
import io
import unittest

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import compositor

try:
    import rembg  # noqa: F401
    HAVE_REMBG = True
except Exception:
    HAVE_REMBG = False


def synthetic_device(w=700, h=520):
    rng = np.random.default_rng(3)
    bg = (rng.integers(150, 200, size=(h, w, 1)) * np.ones((1, 1, 3))).astype(np.uint8)  # nền nhiễu xám
    im = Image.fromarray(bg, "RGB")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([110, 90, 590, 430], radius=30, fill=(20, 20, 24), outline=(230, 230, 235), width=4)
    d.rectangle([140, 120, 560, 250], fill=(40, 90, 200))
    for i in range(6):
        d.ellipse([150 + i * 65, 290, 200 + i * 65, 340], fill=(220, 40 + i * 30, 40), outline=(255, 255, 255), width=2)
    d.text((160, 380), "PSHOP DDJ-400", fill=(255, 255, 255))
    return im.filter(ImageFilter.GaussianBlur(0.6))


@unittest.skipUnless(HAVE_REMBG, "rembg chưa cài")
class RealSegmentationTests(unittest.TestCase):
    def test_real_model_compose_preserves_core_pixels(self):
        src = synthetic_device()
        buf = io.BytesIO()
        src.save(buf, format="PNG")
        try:
            png, rep = compositor.compose(buf.getvalue(), None, (1200, 1200), "studio", None)
        except compositor.NoSegmentation as e:
            self.skipTest("mô hình tách nền chưa tải được: %s" % e)
        self.assertTrue(rep["product_pixels_preserved"])
        self.assertGreater(rep["core_pixels"], 20000)
        # kiểm độc lập: tính lại alpha bằng rembg rồi so pixel lõi ở vị trí đặt
        from rembg import new_session, remove
        cut = Image.open(io.BytesIO(remove(buf.getvalue(), session=compositor._rembg_session(new_session)))).convert("RGBA")
        a = np.array(cut.getchannel("A"), dtype=np.uint8)
        a[a >= 250] = 255
        a[a < 6] = 0
        ys, xs = np.nonzero(a > 0)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        out = np.array(Image.open(io.BytesIO(png)).convert("RGB"))
        ox, oy = rep["placement"]
        core = a[y0:y1, x0:x1] == 255
        self.assertTrue(np.array_equal(out[oy:oy + y1 - y0, ox:ox + x1 - x0][core], np.array(src)[y0:y1, x0:x1][core]))
        # nền mới: nhiễu xám của ảnh gốc không còn ở góc ảnh kết quả
        corner = out[:30, :30].reshape(-1, 3).astype(float)
        self.assertLess(corner.std(axis=0).max(), 6.0)


if __name__ == "__main__":
    unittest.main()
