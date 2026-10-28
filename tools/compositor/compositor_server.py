"""HTTP wrapper tối giản (stdlib) cho compositor.py — chạy trên máy chủ do chủ dự án quản lý (KHÔNG phải Cloud Functions).

Chạy:   COMPOSITOR_SECRET=<chuỗi ngẫu nhiên dài> python compositor_server.py --host 127.0.0.1 --port 8765
Hợp đồng với functions/shared/imageRouter.js:
  POST /compose   header  X-Compositor-Secret: <secret>
  body JSON  { request_id, image_b64, background_b64|null, mask_b64|null, canvas:{width,height}, style }
  200 JSON   { ok:true, image_b64, report:{ product_pixels_preserved, width, height, background, ... } }
  4xx/5xx    { ok:false, code, message }   (code=NO_SEGMENTATION khi chưa cài mô hình tách nền)
Bảo mật: bắt buộc secret (so sánh hằng thời gian), giới hạn kích thước body, KHÔNG nhận URL (không SSRF), không ghi ảnh ra đĩa,
không log nội dung ảnh/secret. Đặt sau HTTPS reverse proxy (Router chỉ chấp nhận URL https).
"""
import argparse
import base64
import binascii
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from compositor import CompositorError, compose

MAX_BODY = 40 * 1024 * 1024


def _b64(value, what):
    if value is None:
        return None
    if not isinstance(value, str):
        raise CompositorError(what + " phải là chuỗi base64", "BAD_REQUEST")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise CompositorError(what + " không phải base64 hợp lệ", "BAD_REQUEST")


def make_handler(secret):
    class Handler(BaseHTTPRequestHandler):
        server_version = "PSHCompositor/1.0"

        def log_message(self, fmt, *args):  # không log URL/body
            return

        def _send(self, status, obj):
            data = json.dumps(obj).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _drain(self):
            """Đọc bỏ tối đa 2 MB body của yêu cầu bị từ chối để client không bị reset kết nối (không xử lý nội dung)."""
            try:
                n = min(int(self.headers.get("Content-Length", "0")), 2 * 1024 * 1024)
                if n > 0:
                    self.rfile.read(n)
            except (ValueError, OSError):
                pass

        def do_POST(self):
            if self.path != "/compose":
                self._drain()
                return self._send(404, {"ok": False, "code": "NOT_FOUND", "message": "not found"})
            provided = self.headers.get("X-Compositor-Secret", "")
            if not secret or not hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8")):
                self._drain()
                return self._send(401, {"ok": False, "code": "UNAUTHORIZED", "message": "unauthorized"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length <= 0 or length > MAX_BODY:
                return self._send(413, {"ok": False, "code": "BAD_REQUEST", "message": "body size"})
            try:
                req = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(req, dict):
                    raise ValueError("body")
            except (ValueError, UnicodeDecodeError):
                return self._send(400, {"ok": False, "code": "BAD_REQUEST", "message": "invalid json"})
            try:
                image = _b64(req.get("image_b64"), "image_b64")
                background = _b64(req.get("background_b64"), "background_b64")
                mask = _b64(req.get("mask_b64"), "mask_b64")
                canvas = req.get("canvas") or {}
                size = (int(canvas.get("width", 1200)), int(canvas.get("height", 1200)))
                style = str(req.get("style") or "studio")[:40]
                png, report = compose(image, background, size, style, mask)
            except CompositorError as e:
                status = 422 if e.code in ("NO_SEGMENTATION", "BAD_MASK", "PRODUCT_TOO_LARGE") else 400
                return self._send(status, {"ok": False, "code": e.code, "message": str(e)[:200]})
            except (TypeError, ValueError):
                return self._send(400, {"ok": False, "code": "BAD_REQUEST", "message": "invalid parameters"})
            except Exception:
                return self._send(500, {"ok": False, "code": "INTERNAL", "message": "internal error"})
            return self._send(200, {"ok": True, "image_b64": base64.b64encode(png).decode("ascii"), "report": report})

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"ok": True})
            return self._send(404, {"ok": False, "code": "NOT_FOUND", "message": "not found"})

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    secret = os.environ.get("COMPOSITOR_SECRET", "")
    if len(secret) < 24:
        raise SystemExit("COMPOSITOR_SECRET phải có ít nhất 24 ký tự")
    ThreadingHTTPServer((args.host, args.port), make_handler(secret)).serve_forever()


if __name__ == "__main__":
    main()
