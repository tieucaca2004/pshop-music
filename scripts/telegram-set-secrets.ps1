# scripts/telegram-set-secrets.ps1 — Founder TỰ chạy: lưu TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET vào Firebase Secret Manager (pshop-music).
#
# Chạy bằng "dot-source" để biến môi trường của phiên còn lại cho bước đăng ký webhook ngay sau đó:
#     Set-Location D:\PshopMusicSite-wt-tgfb
#     . .\scripts\telegram-set-secrets.ps1
#
# - Token nhập qua Read-Host -AsSecureString (dán được; không hiện ra, không vào lịch sử lệnh). Có thể dùng -FromEnv nếu đã đặt $env:TELEGRAM_BOT_TOKEN.
# - Kiểm token ĐÚNG bot @PSH_Flatform_Bot (id 9281952823) bằng scripts\telegram-verify-bot.js TRƯỚC khi lưu. Sai bot / sai định dạng => dừng, không lưu gì.
# - Webhook secret được SINH NGẪU NHIÊN (32 byte, base64url) và chỉ giữ trong biến môi trường của phiên này (để bước setWebhook dùng đúng giá trị).
# - Giá trị đi vào firebase-tools qua STDIN (--data-file -), KHÔNG xuống dòng cuối, KHÔNG qua tham số dòng lệnh; tên secret cố định.
# - KHÔNG deploy, KHÔNG ghi RTDB, KHÔNG gọi setWebhook. In ra chỉ số version vừa tạo, không bao giờ in giá trị.
param(
  [switch]$FromEnv,
  [string]$Project = 'pshop-music',
  [string]$FirebaseJs = '',
  [string]$NodeExe = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction Stop).Source }
if (-not $FirebaseJs) { $FirebaseJs = Join-Path (& $NodeExe -p "require('child_process').execSync('npm root -g').toString().trim()") 'firebase-tools\lib\bin\firebase.js' }
if (-not (Test-Path $FirebaseJs)) { Write-Host "Không tìm thấy firebase-tools: $FirebaseJs"; return }

function Set-FirebaseSecret([string]$Key, [string]$Value) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $NodeExe
  $psi.Arguments = '"' + $FirebaseJs + '" functions:secrets:set ' + $Key + ' --data-file - --project ' + $Project
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $w = New-Object System.IO.StreamWriter($p.StandardInput.BaseStream, (New-Object System.Text.UTF8Encoding($false)))
  $w.Write($Value); $w.Flush(); $w.Close()
  $outTask = $p.StandardOutput.ReadToEndAsync(); $errTask = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch {} }
  $text = ($outTask.Result + "`n" + $errTask.Result).Replace($Value, '***')
  $m = [regex]::Match($text, "secrets/$Key/versions/(\d+)")
  if (-not $m.Success) {
    $safe = ($text -replace '\d{8,12}:[A-Za-z0-9_-]{25,}', '***') -replace '\s+', ' '
    if ($safe.Length -gt 300) { $safe = $safe.Substring(0, 300) }
    throw "Lưu $Key KHÔNG thành công (không thấy version mới). Phản hồi (đã che): $safe"
  }
  return $m.Groups[1].Value
}

# 1) Token
if ($FromEnv) { $tok = ($env:TELEGRAM_BOT_TOKEN + '').Trim() }
else { $sec = Read-Host 'Token MOI cua @PSH_Flatform_Bot (khong hien ra)' -AsSecureString; $tok = [System.Net.NetworkCredential]::new('', $sec).Password.Trim() }
if ($tok -notmatch '^\d{8,12}:[A-Za-z0-9_-]{30,}$') { Write-Host 'DỪNG: giá trị nhập không có định dạng token Telegram (<số>:<chuỗi>). Chưa lưu gì.'; return }

# 2) Xác minh đúng bot TRƯỚC khi lưu
$env:TELEGRAM_BOT_TOKEN = $tok
& $NodeExe (Join-Path $repo 'scripts\telegram-verify-bot.js') | ForEach-Object { Write-Host $_ }
$vc = $LASTEXITCODE
if ($vc -ne 0 -and $vc -ne 6) { Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue; Write-Host "DỪNG: token chưa được xác nhận là của @PSH_Flatform_Bot (mã $vc). Chưa lưu gì."; return }

# 3) Webhook secret ngẫu nhiên (chỉ giữ trong phiên này)
$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$ws = [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_').TrimEnd('=')

# 4) Lưu hai secret (tên cố định)
try {
  $v1 = Set-FirebaseSecret 'TELEGRAM_BOT_TOKEN' $tok
  Write-Host "TELEGRAM_BOT_TOKEN -> version $v1 (đã lưu)"
  $v2 = Set-FirebaseSecret 'TELEGRAM_WEBHOOK_SECRET' $ws
  Write-Host "TELEGRAM_WEBHOOK_SECRET -> version $v2 (đã lưu)"
} catch { Write-Host $_.Exception.Message; Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue; return }

# 5) Giữ giá trị trong phiên này cho bước đăng ký webhook (đúng cùng secret_token)
$env:TELEGRAM_BOT_TOKEN = $tok
$env:TELEGRAM_WEBHOOK_SECRET = $ws
Write-Host 'XONG: hai secret đã lưu. Biến môi trường của phiên này giữ token + webhook secret cho bước đăng ký. Chưa deploy, chưa đăng ký webhook.'
