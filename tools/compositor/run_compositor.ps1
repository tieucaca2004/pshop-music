# Chạy compositor PSH trên máy chủ do Founder quản lý (Windows PowerShell). KHÔNG tự mở cổng ra Internet.
#   1) Tạo venv và cài phụ thuộc (một lần):
#        python -m venv .venv ; .\.venv\Scripts\python.exe -m pip install -r requirements.txt
#   2) Đặt secret (>= 24 ký tự ngẫu nhiên) — KHÔNG commit, KHÔNG dán vào chat:
#        $env:COMPOSITOR_SECRET = '<chuỗi ngẫu nhiên>'
#   3) Chạy (chỉ nghe localhost; đặt sau HTTPS reverse proxy/tunnel do Founder chọn):
#        .\run_compositor.ps1
param([string]$ListenHost = '127.0.0.1', [int]$Port = 8765)
if (-not $env:COMPOSITOR_SECRET -or $env:COMPOSITOR_SECRET.Length -lt 24) { Write-Error 'Cần $env:COMPOSITOR_SECRET (>= 24 ký tự)'; exit 2 }
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }
& $py (Join-Path $PSScriptRoot 'compositor_server.py') --host $ListenHost --port $Port
