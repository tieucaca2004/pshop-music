# PSH Platform - Security & System Health Monitor
# Host: DESKTOP-TRUUF31 | Windows 10 Pro | PowerShell 5.1
param([switch]$Alert)

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir    = Join-Path $ScriptDir "data"
$LatestFile = Join-Path $DataDir "latest.json"
$HistoryFile = Join-Path $DataDir "history.csv"
$AlertsFile  = Join-Path $DataDir "alerts.json"
if (!(Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
function T { return (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }

Write-Host "[$(T)] Collecting system health..." -ForegroundColor Cyan

# ---- CPU ----
try {
    $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop
    $cpuPct = if ($cpu.LoadPercentage) { [math]::Round(($cpu | Measure-Object -Property LoadPercentage -Average).Average, 1) } else { $null }
    if ($null -eq $cpuPct) {
        $cpuPct = [math]::Round((Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop).CounterSamples[0].CookedValue, 1)
    }
    $cpuScore = [math]::Max(0, 100 - $cpuPct)
} catch { $cpuPct = "N/A"; $cpuScore = 50 }

# ---- RAM ----
try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $ramFree  = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $ramPct   = [math]::Round(($ramTotal - $ramFree) / $ramTotal * 100, 1)
    $ramScore = [math]::Max(0, 100 - $ramPct)
} catch { $ramPct = "N/A"; $ramTotal = "N/A"; $ramFree = "N/A"; $ramScore = 50 }

# ---- Disk (C: and D:) ----
$diskScore = 50; $disks = @()
try {
    $drives = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:' OR DeviceID='D:'" -ErrorAction Stop
    $maxPct = 0
    foreach ($d in $drives) {
        $up = [math]::Round(($d.Size - $d.FreeSpace) / $d.Size * 100, 1)
        if ($up -gt $maxPct) { $maxPct = $up }
        $disks += @{ drive = $d.DeviceID; totalGB = [math]::Round($d.Size / 1GB, 1); freeGB = [math]::Round($d.FreeSpace / 1GB, 1); usedPct = $up }
    }
    $diskScore = [math]::Max(0, 100 - $maxPct)
} catch { $disks = @() }

# ---- Uptime ----
try {
    $boot = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime
    $up = (Get-Date) - $boot
    $uptimeText = "$($up.Days)d $($up.Hours)h $($up.Minutes)m"
} catch { $uptimeText = "N/A" }

# ---- Top processes by CPU / Memory ----
$topCPU = @(); $topMem = @(); $procCount = "N/A"
try {
    $allProcs = Get-Process -ErrorAction Stop
    $procCount = $allProcs.Count
    $topCPU = $allProcs | Sort-Object CPU -Descending | Select-Object -First 5 | ForEach-Object { "$($_.Name) ($([math]::Round($_.CPU,1))s)" }
    $topMem = $allProcs | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { "$($_.Name) ($([math]::Round($_.WorkingSet64/1MB,1))MB)" }
} catch {}

# ---- Stopped services (auto-start expected but not running) ----
$stoppedServicesList = @(); $stoppedServicesCount = 0
try {
    $svc = Get-CimInstance Win32_Service -Filter "StartMode='Auto' AND State!='Running'" -ErrorAction Stop
    $stoppedServicesList = $svc | ForEach-Object { "$($_.DisplayName) ($($_.Name))" }
    $stoppedServicesCount = $stoppedServicesList.Count
} catch { $stoppedServicesList = @() }

Write-Host "[$(T)] Collecting security..." -ForegroundColor Cyan
$secScore = 100; $secIssues = @()

if ($stoppedServicesCount -gt 0) {
    $secIssues += "$stoppedServicesCount auto-start service(s) stopped: $($stoppedServicesList -join ', ')"
    $secScore -= [math]::Min(30, $stoppedServicesCount * 10)
}

# ---- Windows Defender ----
try {
    $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
    if ($mp) {
        $defStatus = if ($mp.AntivirusEnabled) { "Active" } else { "DISABLED" }
        if (!$mp.AntivirusEnabled) { $secIssues += "Defender DISABLED"; $secScore -= 30 }
        if ($mp.RealTimeProtectionEnabled -eq $false) { $secIssues += "Real-time protection OFF"; $secScore -= 20 }
    } else { $defStatus = "N/A" }
} catch { $defStatus = "N/A" }

# ---- Firewall ----
try {
    $profiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
    if ($profiles) {
        $en = ($profiles | Where-Object Enabled -eq $true).Count
        $fwStatus = "$en/$($profiles.Count) enabled"
        if ($en -lt $profiles.Count) { $secIssues += "Firewall profile(s) disabled"; $secScore -= 15 }
    } else { $fwStatus = "N/A" }
} catch { $fwStatus = "N/A" }

# ---- Scheduled tasks ----
$scheduledTasksInfo = "N/A"
try {
    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
        $tasks = Get-ScheduledTask -ErrorAction Stop
        $runningTasks = ($tasks | Where-Object { $_.State -eq 'Running' }).Count
        $scheduledTasksInfo = "$runningTasks running / $($tasks.Count) total"
    }
} catch { $scheduledTasksInfo = "N/A" }

# ---- Event logs (24h) ----
$critErr = 0; $logSuccess = 0; $logFail = 0
try { $critErr = (Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=1,2; StartTime=(Get-Date).AddHours(-24)} -ErrorAction SilentlyContinue | Measure-Object).Count } catch {}
if ($critErr -gt 10) { $secIssues += "$critErr critical system/app errors in 24h"; $secScore -= 5 }
try { $logSuccess = (Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4624; StartTime=(Get-Date).AddHours(-24)} -ErrorAction SilentlyContinue | Measure-Object).Count } catch {}
try { $logFail = (Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4625; StartTime=(Get-Date).AddHours(-24)} -ErrorAction SilentlyContinue | Measure-Object).Count } catch {}
if ($logFail -gt 5) { $secIssues += "$logFail login failures in 24h (possible brute force)"; $secScore -= 10 }

# ---- Local administrators ----
$admins = ""
try {
    $group = [ADSI]"WinNT://$env:ComputerName/Administrators,group"
    $members = $group.Invoke("Members") | ForEach-Object { $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null) }
    $admins = ($members | Sort-Object) -join ", "
} catch { $admins = "N/A" }

# ---- Process inventory via WMI + unknown (non-whitelisted) process check ----
# Not a malware detector - flags anything unfamiliar for manual review only.
$processWhitelist = @(
    'System','System Idle Process','Idle','Secure System','Registry','LsaIso','Memory Compression',
    'smss','csrss','wininit','services','lsass','svchost','winlogon',
    'explorer','dwm','fontdrvhost','LogonUI','conhost','RuntimeBroker','ShellExperienceHost',
    'StartMenuExperienceHost','SearchApp','SearchIndexer','SearchHost','SearchProtocolHost','SearchFilterHost',
    'sihost','taskhostw','spoolsv','WmiPrvSE','dllhost','rundll32','audiodg','MsMpEng','NisSrv',
    'MpDefenderCoreService','SecurityHealthService','SecurityHealthSystray','ctfmon','TextInputHost',
    'ApplicationFrameHost','SystemSettings','WUDFHost','sppsvc','SppExtComObj','PresentationFontCache',
    'PhoneExperienceHost','UserOOBEBroker','wlanext','mDNSResponder',
    'powershell','powershell_ide','pwsh','cmd','bash','WindowsTerminal','chrome','chrome-native-host','msedge',
    'msedgewebview2','firefox','brave','Code','node','git','OneDrive','Teams','msteams','Discord',
    'Spotify','Slack','Telegram','ChatGPT Classic','WINWORD','CalculatorApp','notepad','notepad++',
    'Taskmgr','mmc','vmcompute','vmms','extension-host','CompPkgSrv',
    'NVDisplay.Container','nvcontainer','RtkAudUService64','igfxCUIService','igfxEM',
    'AggregatorHost','wsl','wslhost','wslservice','claude','ollama','SettingSyncHost','WidgetService',
    'Widgets','GameBar','GameBarFTServer','gamingservices','gamingservicesnet','GameInputSvc','GameInputRedistService',
    'IntelCpHDCPSvc','IntelCpHeciSvc','jhi_service','HPSIsvc','OneApp.IGCC.WinService','UniKeyNT',
    'AlibabaProtect','FwUpdateManager','LDSvc','uahelperservice','UltraViewer_Service','WMIRegistrationService',
    'DDJ-800_AutoSetup','OMNIS-DUO_AutoSetup','XDJ-RX3_AutoSetup','cowork-svc'
)
$unknownProcesses = @()
try {
    $wmiProcs = Get-WmiObject -Class Win32_Process -ErrorAction Stop
    $uniqueNames = $wmiProcs | Select-Object -ExpandProperty Name -Unique | ForEach-Object { $_ -replace '\.exe$', '' }
    $unknownProcesses = @($uniqueNames | Where-Object { $processWhitelist -notcontains $_ })
} catch { $unknownProcesses = @() }

Write-Host "[$(T)] Checking websites..." -ForegroundColor Cyan
$webScore = 100; $webResults = @()
$urls = @(
    @{n="Homepage"; u="https://pshopmusic.com/"},
    @{n="Category"; u="https://pshopmusic.com/category.html"},
    @{n="Lexar P30"; u="https://pshopmusic.com/product-lexar-p30-128gb.html"}
)
foreach ($s in $urls) {
    $r = @{ name = $s.n; url = $s.u; status = "unknown"; code = 0; ms = 0 }
    try {
        $req = [System.Net.HttpWebRequest]::Create($s.u)
        $req.Method = "GET"; $req.Timeout = 15000
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $resp = $req.GetResponse()
        $sw.Stop()
        $r.code = [int]$resp.StatusCode
        $r.ms = $sw.ElapsedMilliseconds
        $r.status = if ($r.code -eq 200) { "up" } else { "degraded" }
        if ($r.code -ne 200) { $webScore -= 15 }
        $resp.Close()
    } catch {
        $r.status = "down"; $r.error = $_.Exception.Message; $webScore -= 25
    }
    $webResults += $r
}

# ---- SSL certificate expiry ----
$sslDays = "N/A"; $sslExp = "N/A"
try {
    $req = [Net.HttpWebRequest]::Create("https://pshopmusic.com/")
    $req.Method = "GET"; $req.Timeout = 15000
    $resp = $req.GetResponse()
    $cert = $req.ServicePoint.Certificate
    if ($cert) {
        $d = [datetime]::Parse($cert.GetExpirationDateString())
        $sslDays = ($d - (Get-Date)).Days
        $sslExp = $d.ToString("yyyy-MM-dd")
        if ($sslDays -lt 30) { $webScore -= 20 }
    }
    $resp.Close()
} catch {}

# ---- AI infrastructure (Firebase Realtime DB) ----
Write-Host "[$(T)] Checking AI infrastructure..." -ForegroundColor Cyan
$aiScore = 100; $fbStatus = "unknown"
try {
    $req = [System.Net.HttpWebRequest]::Create("https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app/.json?shallow=true")
    $req.Method = "GET"; $req.Timeout = 15000
    $resp = $req.GetResponse()
    $fbStatus = if ([int]$resp.StatusCode -eq 200) { "up" } else { "degraded" }
    if ($fbStatus -ne "up") { $aiScore -= 20 }
    $resp.Close()
} catch { $fbStatus = "down"; $aiScore -= 30 }

# ---- Scores ----
$secScore = [math]::Max(0, $secScore)
$webScore = [math]::Max(0, $webScore)
$aiScore  = [math]::Max(0, $aiScore)
$overall  = [math]::Round(($cpuScore + $ramScore + $diskScore + $secScore + $webScore + $aiScore) / 6, 1)

$health = @{
    timestamp = T
    hostname  = $env:COMPUTERNAME
    os        = "Windows 10 Pro"
    scores    = @{
        overall  = $overall
        cpu      = [math]::Round($cpuScore, 1)
        ram      = [math]::Round($ramScore, 1)
        disk     = [math]::Round($diskScore, 1)
        security = [math]::Round($secScore, 1)
        website  = [math]::Round($webScore, 1)
        ai       = [math]::Round($aiScore, 1)
    }
    system = @{
        cpuPct     = $cpuPct
        ramPct     = $ramPct
        ramTotalGB = $ramTotal
        ramFreeGB  = $ramFree
        disks      = $disks
        uptime     = $uptimeText
        processes  = @{ total = $procCount; topCPU = $topCPU; topMem = $topMem }
    }
    security = @{
        defender          = $defStatus
        firewall          = $fwStatus
        criticalErrors24h = $critErr
        logonSuccess24h   = $logSuccess
        loginFailures24h  = $logFail
        administrators    = $admins
        stoppedServices   = $stoppedServicesList
        scheduledTasks    = $scheduledTasksInfo
        unknownProcesses  = $unknownProcesses
        issues            = $secIssues
    }
    website = @{
        pages = $webResults
        ssl   = @{ daysLeft = $sslDays; expiry = $sslExp }
    }
    ai = @{ firebase = $fbStatus }
    alerts = @()
}

if ($overall -lt 60) { $health.alerts += @{ severity = "critical"; message = "Overall health score $overall - needs attention"; timestamp = T } }
if ($cpuPct -ne "N/A" -and $cpuPct -gt 90) { $health.alerts += @{ severity = "warning"; message = "CPU usage at $cpuPct%"; timestamp = T } }
if ($ramPct -ne "N/A" -and $ramPct -gt 90) { $health.alerts += @{ severity = "warning"; message = "RAM usage at $ramPct%"; timestamp = T } }
foreach ($d in $disks) { if ($d.usedPct -gt 90) { $health.alerts += @{ severity = "warning"; message = "$($d.drive) at $($d.usedPct)% used"; timestamp = T } } }
if ($defStatus -ne "Active" -and $defStatus -ne "N/A") { $health.alerts += @{ severity = "warning"; message = "Defender: $defStatus"; timestamp = T } }
if ($stoppedServicesCount -gt 0) { $health.alerts += @{ severity = "warning"; message = "$stoppedServicesCount auto-start service(s) stopped"; timestamp = T } }
foreach ($w in $webResults) { if ($w.status -ne "up") { $health.alerts += @{ severity = "critical"; message = "$($w.name) is $($w.status) (HTTP $($w.code))"; timestamp = T } } }

# ---- Save JSON ----
try {
    $health | ConvertTo-Json -Depth 10 | Out-File $LatestFile -Encoding utf8
    Write-Host "[$(T)] Health data saved to $LatestFile" -ForegroundColor Green
} catch { Write-Host "[$(T)] ERROR saving data: $_" -ForegroundColor Red }

# ---- Append CSV history ----
try {
    $writeHeader = -not (Test-Path $HistoryFile)
    if ($writeHeader) {
        Add-Content -Path $HistoryFile -Value "Timestamp,CpuPct,RamPct,Overall,Security,Website,AI" -Encoding utf8
    }
    $csvLine = "$(T),$cpuPct,$ramPct,$overall,$secScore,$webScore,$aiScore"
    Add-Content -Path $HistoryFile -Value $csvLine -Encoding utf8
} catch {}

# ---- Alerts file (Task 2 consumes this too) ----
if ($health.alerts.Count -gt 0) {
    try {
        @{ timestamp = T; alerts = $health.alerts } | ConvertTo-Json -Depth 5 | Out-File $AlertsFile -Encoding utf8
    } catch {}
}

# ---- Console report ----
Write-Host "[$(T)] ============" -ForegroundColor Yellow
Write-Host "[$(T)] CPU: $cpuPct% | RAM: $ramPct% | Uptime: $uptimeText" -ForegroundColor $(if ($cpuPct -ne 'N/A' -and $cpuPct -gt 80) {"Red"} elseif ($cpuPct -ne 'N/A' -and $cpuPct -gt 50) {"Yellow"} else {"Green"})
foreach ($d in $disks) { Write-Host "[$(T)] $($d.drive) $($d.usedPct)% used ($($d.freeGB) GB free)" -ForegroundColor $(if ($d.usedPct -gt 90) {"Red"} elseif ($d.usedPct -gt 75) {"Yellow"} else {"Green"}) }
Write-Host "[$(T)] Defender: $defStatus | Firewall: $fwStatus" -ForegroundColor $(if ($defStatus -eq "Active") {"Green"} else {"Yellow"})
Write-Host "[$(T)] Stopped auto-services: $stoppedServicesCount" -ForegroundColor $(if ($stoppedServicesCount -gt 0) {"Red"} else {"Green"})
Write-Host "[$(T)] Scheduled tasks: $scheduledTasksInfo" -ForegroundColor Gray
Write-Host "[$(T)] Critical errors (24h): $critErr | Login failures (24h): $logFail" -ForegroundColor $(if ($logFail -gt 5) {"Red"} else {"Green"})
if ($unknownProcesses.Count -gt 0) { Write-Host "[$(T)] Unrecognized processes (review): $($unknownProcesses -join ', ')" -ForegroundColor DarkYellow }
Write-Host "[$(T)] Websites up: $(($webResults | Where-Object {$_.code -eq 200}).Count)/$($webResults.Count)" -ForegroundColor $(if (($webResults | Where-Object {$_.code -ne 200}).Count -gt 0) {"Red"} else {"Green"})
Write-Host "[$(T)] SSL expires: $sslExp ($sslDays days)" -ForegroundColor $(if ($sslDays -ne 'N/A' -and $sslDays -gt 30) {"Green"} elseif ($sslDays -ne 'N/A' -and $sslDays -gt 7) {"Yellow"} else {"Red"})
Write-Host "[$(T)] Firebase: $fbStatus" -ForegroundColor $(if ($fbStatus -eq "up") {"Green"} else {"Red"})
Write-Host "[$(T)] ============" -ForegroundColor Yellow
$c = if ($overall -ge 80) {"Green"} elseif ($overall -ge 50) {"Yellow"} else {"Red"}
Write-Host "[$(T)] OVERALL HEALTH: $overall/100" -ForegroundColor $c
Write-Host "[$(T)] CPU=$([math]::Round($cpuScore,1)) RAM=$([math]::Round($ramScore,1)) Disk=$([math]::Round($diskScore,1)) Security=$secScore Website=$webScore AI=$aiScore"
if ($health.alerts.Count -gt 0) {
    Write-Host "[$(T)] ALERTS: $($health.alerts.Count)" -ForegroundColor Red
    foreach ($a in $health.alerts) { Write-Host "  [$($a.severity)] $($a.message)" -ForegroundColor Red }
}
Write-Host "[$(T)] Monitor check complete." -ForegroundColor Green
