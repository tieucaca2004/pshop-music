# PSH Platform - Telegram Notification Script
# Reads the latest health report and, if any score is unhealthy, prepares and
# (optionally) sends a Telegram alert. No secrets are hardcoded - set
# TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID as environment variables, or pass
# -BotToken / -ChatId, to actually deliver the message via the Bot API.
param(
    [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
    [string]$ChatId   = $env:TELEGRAM_CHAT_ID
)

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir    = Join-Path $ScriptDir "data"
$LatestFile = Join-Path $DataDir "latest.json"
$AlertsFile = Join-Path $DataDir "alerts.json"
function T { return (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

if (-not (Test-Path $LatestFile)) {
    Write-Host "[$(T)] No latest.json found - run monitor.ps1 first." -ForegroundColor Red
    exit 1
}

try {
    $health = Get-Content -Path $LatestFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Host "[$(T)] Failed to parse latest.json: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Emoji built from Unicode code points rather than literal multi-byte
# characters - Windows PowerShell 5.1 reads BOM-less .ps1 files using the
# system ANSI codepage by default, which mangles raw UTF-8 emoji in source.
function Get-Emoji {
    param($Score)
    if ($null -eq $Score) { return [char]::ConvertFromUtf32(0x26AA) }   # white circle
    if ($Score -ge 80) { return [char]::ConvertFromUtf32(0x1F7E2) }     # green circle
    elseif ($Score -ge 50) { return [char]::ConvertFromUtf32(0x1F7E1) } # yellow circle
    else { return [char]::ConvertFromUtf32(0x1F534) }                  # red circle
}

$scores = $health.scores
$scoreMap = [ordered]@{
    "Overall"  = $scores.overall
    "CPU"      = $scores.cpu
    "RAM"      = $scores.ram
    "Disk"     = $scores.disk
    "Security" = $scores.security
    "Website"  = $scores.website
    "AI"       = $scores.ai
}

$lowScores   = @($scoreMap.GetEnumerator() | Where-Object { $null -ne $_.Value -and $_.Value -lt 50 })
$shouldAlert = $lowScores.Count -gt 0

# ---- Collect top issues from the report ----
$issues = @()
try { if ($health.security.issues) { $issues += @($health.security.issues) } } catch {}
try {
    foreach ($p in @($health.website.pages)) {
        if ($p -and $p.status -ne "up") { $issues += "$($p.name) is $($p.status) (HTTP $($p.code))" }
    }
} catch {}
try {
    if ($health.security.stoppedServices -and @($health.security.stoppedServices).Count -gt 0) {
        $issues += "Stopped auto-services: $((@($health.security.stoppedServices) | Select-Object -First 5) -join ', ')"
    }
} catch {}
try { if ($health.ai.firebase -and $health.ai.firebase -ne "up") { $issues += "AI/Firebase status: $($health.ai.firebase)" } } catch {}
$issues = @($issues | Select-Object -Unique)

# ---- Recommendations, keyed off which category is unhealthy ----
$recommendations = @()
if ($scores.cpu -lt 50) { $recommendations += "CPU load is high - check top CPU processes in the report and close/restart heavy apps." }
if ($scores.ram -lt 50) { $recommendations += "RAM usage is high - close memory-heavy applications or consider a reboot." }
if ($scores.disk -lt 50) { $recommendations += "Disk usage is high on C:/D: - clean temp files, empty Recycle Bin, or move data off the drive." }
if ($scores.security -lt 50) { $recommendations += "Security score is low - review Defender/firewall status, restart stopped auto-services, and check login failures." }
if ($scores.website -lt 50) { $recommendations += "Website endpoint(s) are unhealthy - check hosting, DNS, SSL cert, and recent deployments." }
if ($scores.ai -lt 50) { $recommendations += "AI infrastructure (Firebase) is unreachable - verify project status and network/firewall access." }
if ($recommendations.Count -eq 0) { $recommendations += "No action needed - all scores are healthy." }

# ---- Build Telegram-ready message ----
$overallEmoji = Get-Emoji $scores.overall
$lines = @()
$lines += "$overallEmoji *PSH Health Center Alert*"
$lines += "Host: $($health.hostname) | $(T)"
$lines += ""
$lines += "*Scores:*"
foreach ($kv in $scoreMap.GetEnumerator()) {
    $lines += "$(Get-Emoji $kv.Value) $($kv.Key): $($kv.Value)/100"
}
if ($issues.Count -gt 0) {
    $lines += ""
    $lines += "*Top Issues:*"
    foreach ($i in ($issues | Select-Object -First 8)) { $lines += "- $i" }
}
$lines += ""
$lines += "*Recommendations:*"
foreach ($r in $recommendations) { $lines += "- $r" }
$message = $lines -join "`n"

# ---- Persist alert payload ----
$alertPayload = [ordered]@{
    timestamp    = T
    shouldAlert  = $shouldAlert
    overallScore = $scores.overall
    lowScores    = @($lowScores | ForEach-Object { [ordered]@{ category = $_.Key; score = $_.Value } })
    issues       = $issues
    recommendations = $recommendations
    message      = $message
}

try {
    $alertPayload | ConvertTo-Json -Depth 6 | Out-File -FilePath $AlertsFile -Encoding utf8 -Force
    Write-Host "[$(T)] Alert data saved to $AlertsFile" -ForegroundColor Green
} catch {
    Write-Host "[$(T)] ERROR saving alert data: $($_.Exception.Message)" -ForegroundColor Red
}

if (-not $shouldAlert) {
    Write-Host "[$(T)] All scores >= 50. No alert needed." -ForegroundColor Green
    exit 0
}

Write-Host "[$(T)] ALERT CONDITIONS MET (score(s) below 50):" -ForegroundColor Red
Write-Host $message

if ($BotToken -and $ChatId) {
    try {
        $uri  = "https://api.telegram.org/bot$BotToken/sendMessage"
        $body = @{ chat_id = $ChatId; text = $message; parse_mode = "Markdown" }
        Invoke-RestMethod -Uri $uri -Method Post -Body $body -TimeoutSec 15 -ErrorAction Stop | Out-Null
        Write-Host "[$(T)] Telegram notification sent." -ForegroundColor Green
    } catch {
        Write-Host "[$(T)] Failed to send Telegram message: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "[$(T)] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set - message prepared but not sent." -ForegroundColor Yellow
    Write-Host "[$(T)] Set those env vars (or pass -BotToken/-ChatId) to enable delivery." -ForegroundColor Yellow
}
