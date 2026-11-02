# scripts/telegram-set-compositor.ps1 — ghi imageRouterConfig.providers.compositor (KHÔNG chứa secret).
#
# Mặc định CHỈ XEM TRƯỚC: kiểm /health, in JSON + lệnh sẽ chạy, KHÔNG ghi RTDB.
# Muốn ghi thật: thêm -Apply (Founder tự chạy; script này không tự deploy gì).
#
#   .\scripts\telegram-set-compositor.ps1 -Url https://compositor.example.com
#   .\scripts\telegram-set-compositor.ps1 -Url https://compositor.example.com -Apply
#   .\scripts\telegram-set-compositor.ps1 -Disable -Apply
#   .\scripts\telegram-set-compositor.ps1 -Url http://127.0.0.1:8765 -AllowHttp   # chỉ dry-run local
#
# Secret KHÔNG nằm trong RTDB: host compositor phải chạy với COMPOSITOR_SECRET trùng Functions secret.
# Trước khi -Apply, nên chạy scripts/compositor-check.js với cùng URL để kiểm chứng compose + pixel.
[CmdletBinding()]
param(
  [string]$Url = '',
  [int]$TimeoutMs = 60000,
  [ValidateSet('studio', 'warm', 'dark')][string]$Style = 'studio',
  [string]$Canvas = '',
  [switch]$Disable,
  [switch]$Apply,
  [switch]$AllowHttp
)

$ErrorActionPreference = 'Stop'
$Project = 'pshop-music'
$Instance = 'pshop-music-default-rtdb'

function Fail([string]$Message) { Write-Error $Message; exit 2 }
function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

if (-not $Disable) {
  if (-not $Url.Trim()) { Fail 'Thiếu -Url (hoặc dùng -Disable).' }
  try { $u = New-Object System.Uri($Url.Trim()) } catch { Fail 'URL không hợp lệ.' }
  if ($u.UserInfo) { Fail 'URL không được chứa user/password.' }
  if ($u.AbsolutePath -ne '/' -and $u.AbsolutePath -ne '') { Fail 'URL phải là URL gốc (không kèm /compose hay đường dẫn khác).' }
  $isHttps = ($u.Scheme -eq 'https')
  if (-not $isHttps) {
    if (-not $AllowHttp) { Fail 'Router production chỉ chấp nhận URL https. Dùng -AllowHttp chỉ để dry-run với compositor local.' }
    if ($Apply) { Fail 'Không ghi RTDB với URL http — production sẽ từ chối. Hãy dùng HTTPS.' }
  }
  if ($TimeoutMs -lt 5000 -or $TimeoutMs -gt 110000) { Fail 'TimeoutMs phải trong khoảng 5000..110000 (webhook timeout 120s).' }

  $canvasObj = $null
  if ($Canvas.Trim()) {
    if ($Canvas -notmatch '^\s*(\d{3,4})\s*[xX]\s*(\d{3,4})\s*$') { Fail 'Canvas phải dạng WIDTHxHEIGHT (vd 1200x1200).' }
    $cw = [int]$Matches[1]; $ch = [int]$Matches[2]
    if ($cw -lt 256 -or $ch -lt 256 -or $cw -gt 2048 -or $ch -gt 2048) { Fail 'Canvas mỗi cạnh phải trong khoảng 256..2048.' }
    $canvasObj = [ordered]@{ width = $cw; height = $ch }
  }

  $base = $Url.Trim().TrimEnd('/')
  try { $health = Invoke-RestMethod -Uri ($base + '/health') -Method Get -TimeoutSec 15 }
  catch { Fail ('Health check thất bại: ' + $_.Exception.Message) }
  if (-not $health.ok) { Fail '/health không trả ok=true — host chưa sẵn sàng.' }

  $comp = [ordered]@{
    enabled = $true
    approvedForProductPhotos = $true
    url = $base
    timeoutMs = $TimeoutMs
    style = $Style
  }
  if ($canvasObj) { $comp.canvas = $canvasObj }
} else {
  $comp = [ordered]@{ enabled = $false }
}

$config = [ordered]@{ providers = [ordered]@{ compositor = $comp } }
$json = $config | ConvertTo-Json -Depth 8
Write-Output '=== imageRouterConfig (KHÔNG có secret) ==='
Write-Output $json

$tmp = Join-Path $env:TEMP ('psh-imageRouterConfig-' + [guid]::NewGuid().ToString('N') + '.json')
Write-Utf8NoBom $tmp $json
try {
  if (-not $Apply) {
    Write-Output '=== CHƯA GHI (dry-run). Chạy lại với -Apply để ghi đúng cấu hình trên. ==='
    exit 0
  }

  Write-Output '=== GHI RTDB ==='
  & firebase database:set /imageRouterConfig $tmp --project $Project --instance $Instance --force
  if ($LASTEXITCODE -ne 0) { Fail ('firebase database:set thất bại (exit ' + $LASTEXITCODE + ').') }

  Write-Output '=== ĐỌC LẠI (không có secret) ==='
  & firebase database:get /imageRouterConfig --project $Project --instance $Instance
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Đã ghi nhưng không đọc lại được; kiểm tra Firebase Console.' }
  Write-Output 'Đã ghi imageRouterConfig. Bật/tắt chỉ ảnh hưởng bước tạo ảnh quảng cáo; dryRun của Facebook KHÔNG bị đổi.'
} finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
