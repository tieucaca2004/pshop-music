"""PSH PYTHON COMPOSITOR — tạo ảnh quảng cáo bằng cách THAY NỀN và GIỮ NGUYÊN PIXEL sản phẩm gốc.

Nguyên tắc (không thương lượng):
  * Sản phẩm KHÔNG bao giờ bị vẽ lại, nội suy (resize) hay đổi màu. Pixel lõi của sản phẩm (alpha == 255) được
    chép NGUYÊN BYTE vào ảnh đầu ra ở tỉ lệ 1:1. Nếu sản phẩm lớn hơn khung, KHUNG được nới ra (tối đa MAX_CANVAS),
    không thu nhỏ sản phẩm.
  * Chỉ NỀN được tạo mới (thủ tục xác định, miễn phí) hoặc nhận từ provider nền do bên gọi cung cấp.
  * Chỉ viền mép (alpha < 255) được hoà trộn với nền; bóng đổ nằm DƯỚI sản phẩm, trên lớp nền.
  * Tách nền: dùng mask do bên gọi đưa vào, hoặc `rembg` nếu đã cài trên máy chủ compositor. Không có cả hai ->
    ném NoSegmentation (code NO_SEGMENTATION). KHÔNG có bước "đoán mask" giả.
  * Sau khi ghép: giải mã lại ảnh đầu ra và kiểm tra lại từng pixel lõi bằng bản gốc; kết quả nằm trong report.

Phụ thuộc: Pillow, numpy (bắt buộc); rembg (tuỳ chọn, cần mô hình tách nền do chủ dự án cài).
"""
import io
import math

import numpy as np
from PIL import Image, ImageFilter, ImageOps

MAX_INPUT_BYTES = 25 * 1024 * 1024
MAX_CANVAS = 4096
MIN_CANVAS = 256
MAX_OUTPUT_BYTES = 4_500_000  # Telegram nhận ảnh qua URL tối đa 5 MB
CORE_ALPHA = 255
FILL_RATIO = 0.82            # sản phẩm chiếm tối đa ~82% cạnh khung
AUTO_FILL_RATIO = 0.78       # khung tự chọn: sản phẩm chiếm ~78% cạnh
AUTO_MIN_CANVAS = 640


class CompositorError(Exception):
    code = "COMPOSITOR_ERROR"

    def __init__(self, message, code=None):
        super().__init__(message)
        if code:
            self.code = code


class NoSegmentation(CompositorError):
    code = "NO_SEGMENTATION"


def _open_image(data, what):
    if not isinstance(data, (bytes, bytearray)) or len(data) == 0:
        raise CompositorError(what + " rỗng", "BAD_IMAGE")
    if len(data) > MAX_INPUT_BYTES:
        raise CompositorError(what + " quá lớn", "IMAGE_TOO_LARGE")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        raise CompositorError(what + " không phải ảnh hợp lệ", "BAD_IMAGE")
    if im.format not in ("JPEG", "PNG", "WEBP"):
        raise CompositorError(what + " phải là JPEG/PNG/WEBP", "BAD_IMAGE")
    if im.width < 32 or im.height < 32 or im.width * im.height > 60_000_000:
        raise CompositorError(what + " có kích thước không hợp lệ", "BAD_IMAGE")
    return im


_SESSION = {}


def _rembg_session(new_session):
    """Phiên rembg dùng lại giữa các request. Mô hình chọn qua biến môi trường COMPOSITOR_REMBG_MODEL (mặc định u2net;
    u2netp nhỏ/nhanh hơn, kém chính xác hơn)."""
    import os
    name = os.environ.get("COMPOSITOR_REMBG_MODEL", "u2net")
    if name not in _SESSION:
        _SESSION[name] = new_session(name)
    return _SESSION[name]


def _segment(rgb, mask_bytes):
    """Trả mảng alpha uint8 (H, W). Ném NoSegmentation nếu không có nguồn mask."""
    if mask_bytes:
        m = _open_image(mask_bytes, "mask").convert("L")
        if m.size != rgb.size:
            raise CompositorError("mask khác kích thước ảnh", "BAD_MASK")
        return np.array(m, dtype=np.uint8)
    try:
        from rembg import new_session, remove  # noqa: WPS433 — tuỳ chọn
    except Exception:
        raise NoSegmentation("Chưa có mô hình tách nền (rembg) và không có mask đi kèm")
    buf = io.BytesIO()
    rgb.save(buf, format="PNG")
    try:
        out = remove(buf.getvalue(), session=_rembg_session(new_session))
    except Exception:
        # mô hình chưa tải được / lỗi chạy: KHÔNG giả vờ đã tách nền
        raise NoSegmentation("Mô hình tách nền không khả dụng (chưa tải hoặc lỗi chạy)")
    cut = Image.open(io.BytesIO(out)).convert("RGBA")
    if cut.size != rgb.size:
        raise CompositorError("segmentation trả kích thước lạ", "BAD_MASK")
    return np.array(cut.getchannel("A"), dtype=np.uint8)


def _procedural_background(size, style):
    """Nền xác định (không ngẫu nhiên): gradient dọc + vầng sáng + sàn mờ. Không chứa chữ/logo/vật thể."""
    w, h = size
    palettes = {
        "studio": ((246, 247, 249), (206, 210, 218)),
        "warm": ((250, 244, 235), (221, 205, 186)),
        "dark": ((58, 62, 72), (18, 20, 26)),
    }
    top, bottom = palettes.get(style, palettes["studio"])
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top_a = np.array(top, dtype=np.float32)[None, None, :]
    bot_a = np.array(bottom, dtype=np.float32)[None, None, :]
    grad = top_a * (1 - y) + bot_a * y
    grad = np.broadcast_to(grad, (h, w, 3)).copy()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2.0, h * 0.42
    d = np.sqrt(((xx - cx) / (w * 0.75)) ** 2 + ((yy - cy) / (h * 0.75)) ** 2)
    glow = np.clip(1.0 - d, 0.0, 1.0)[:, :, None]
    lift = 18.0 if style != "dark" else 26.0
    grad = grad + glow * lift
    floor = np.clip((yy - h * 0.72) / (h * 0.28), 0.0, 1.0)[:, :, None]
    grad = grad * (1.0 - 0.10 * floor)
    return Image.fromarray(np.clip(grad, 0, 255).astype(np.uint8), "RGB")


def _cover(img, size):
    """Phủ kín khung (cắt giữa) — chỉ dùng cho NỀN, không bao giờ cho sản phẩm."""
    return ImageOps.fit(img.convert("RGB"), size, method=Image.LANCZOS, centering=(0.5, 0.5))


def compose(product_bytes, background_bytes=None, canvas=None, style="studio", mask_bytes=None):
    """Ghép sản phẩm lên nền mới. Trả (png_bytes, report).

    canvas=None → khung vuông TỰ CHỌN theo cỡ sản phẩm (sản phẩm chiếm ~78% cạnh, không bao giờ bị resize);
    canvas=(w, h) → kích thước TỐI THIỂU của khung (khung được nới nếu sản phẩm lớn hơn)."""
    src = _open_image(product_bytes, "ảnh sản phẩm")
    src = ImageOps.exif_transpose(src)  # xoay theo EXIF: phép hình học không mất mát, làm TRƯỚC khi kiểm
    rgb = src.convert("RGB")
    alpha = _segment(rgb, mask_bytes)
    # Nếu ảnh gốc có sẵn kênh alpha và không có mask riêng, dùng nó
    if not mask_bytes and src.mode in ("RGBA", "LA") and np.any(np.array(src.getchannel("A")) < 255):
        alpha = np.minimum(alpha, np.array(src.getchannel("A"), dtype=np.uint8))

    fg_fraction = float(np.count_nonzero(alpha >= 128)) / alpha.size
    if fg_fraction < 0.02 or fg_fraction > 0.97:
        raise CompositorError("mask sản phẩm không hợp lý (chiếm %.1f%% ảnh)" % (fg_fraction * 100), "BAD_MASK")

    # Alpha cuối: lõi (>= 250) ép = 255 để pixel lõi được chép NGUYÊN; mép giữ mềm.
    final_alpha = alpha.copy()
    final_alpha[final_alpha >= 250] = CORE_ALPHA
    final_alpha[final_alpha < 6] = 0
    ys, xs = np.nonzero(final_alpha > 0)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    prod_rgb = np.array(rgb, dtype=np.uint8)[y0:y1, x0:x1]
    prod_a = final_alpha[y0:y1, x0:x1]
    ph, pw = prod_a.shape

    if canvas is None:
        side = int(math.ceil(max(pw, ph) / AUTO_FILL_RATIO))
        cw = ch = max(AUTO_MIN_CANVAS, side)
    else:
        cw, ch = max(MIN_CANVAS, int(canvas[0])), max(MIN_CANVAS, int(canvas[1]))
    need_w = int(math.ceil(pw / FILL_RATIO))
    need_h = int(math.ceil(ph / FILL_RATIO))
    cw, ch = max(cw, need_w), max(ch, need_h)
    if cw > MAX_CANVAS or ch > MAX_CANVAS:
        raise CompositorError("sản phẩm quá lớn để ghép 1:1 (khung cần %dx%d)" % (cw, ch), "PRODUCT_TOO_LARGE")

    if background_bytes:
        bg = _cover(_open_image(background_bytes, "ảnh nền"), (cw, ch))
        bg_kind = "provider"
    else:
        bg = _procedural_background((cw, ch), style)
        bg_kind = "procedural:" + (style if style in ("studio", "warm", "dark") else "studio")

    ox = (cw - pw) // 2
    oy = int(round((ch - ph) * 0.58))  # hơi thấp hơn tâm để có chỗ cho bóng
    oy = max(0, min(oy, ch - ph))

    # Bóng tiếp xúc: elip mờ dưới đáy sản phẩm — vẽ lên NỀN, trước khi dán sản phẩm
    shadow = Image.new("L", (cw, ch), 0)
    sh_w, sh_h = int(pw * 0.72), max(8, int(ph * 0.07))
    sx0 = ox + (pw - sh_w) // 2
    sy0 = oy + ph - sh_h // 2
    from PIL import ImageDraw
    ImageDraw.Draw(shadow).ellipse([sx0, sy0, sx0 + sh_w, sy0 + sh_h], fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(4, sh_h * 0.8)))
    dark = Image.new("RGB", (cw, ch), (0, 0, 0))
    bg = Image.composite(dark, bg, shadow.point(lambda v: int(v * 0.55)))

    out = bg.copy()
    out.paste(Image.fromarray(prod_rgb, "RGB"), (ox, oy), Image.fromarray(prod_a, "L"))

    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=False)
    png = buf.getvalue()
    if len(png) > MAX_OUTPUT_BYTES:
        raise CompositorError("ảnh kết quả quá lớn (%d bytes)" % len(png), "OUTPUT_TOO_LARGE")

    report = verify_output(png, prod_rgb, prod_a, (ox, oy))
    report.update({"background": bg_kind, "canvas": [cw, ch], "placement": [ox, oy], "product_size": [pw, ph],
                   "foreground_fraction": round(fg_fraction, 4)})
    return png, report


def verify_output(png_bytes, prod_rgb, prod_alpha, origin):
    """Giải mã LẠI ảnh đầu ra và so từng pixel lõi với sản phẩm gốc."""
    im = Image.open(io.BytesIO(png_bytes))
    im.load()
    if im.format != "PNG":
        raise CompositorError("định dạng đầu ra không phải PNG", "BAD_OUTPUT")
    arr = np.array(im.convert("RGB"), dtype=np.uint8)
    ox, oy = origin
    ph, pw = prod_alpha.shape
    region = arr[oy:oy + ph, ox:ox + pw]
    core = prod_alpha == CORE_ALPHA
    core_count = int(np.count_nonzero(core))
    if core_count == 0:
        raise CompositorError("không có pixel lõi để giữ nguyên", "BAD_MASK")
    mismatched = int(np.count_nonzero(np.any(region[core] != prod_rgb[core], axis=1)))
    return {
        "product_pixels_preserved": mismatched == 0,
        "core_pixels": core_count,
        "core_pixels_mismatched": mismatched,
        "width": int(im.width),
        "height": int(im.height),
        "format": "PNG",
        "bytes": len(png_bytes),
    }
