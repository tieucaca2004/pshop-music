$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$desktopLnk = [Environment]::GetFolderPath('Desktop') + '\Google Chrome.lnk'
$startMenuLnk = [Environment]::GetFolderPath('StartMenu') + '\Programs\Google Chrome.lnk'
$taskbarPath = "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Google Chrome.lnk"

$flag = "--remote-debugging-port=9222"
$changed = @()

$paths = @($desktopLnk, $startMenuLnk, $taskbarPath)
foreach ($p in $paths) {
    if (Test-Path $p) {
        try {
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($p)
            $currentTarget = $shortcut.TargetPath
            $currentArgs = $shortcut.Arguments
            if ($currentArgs -notmatch $flag) {
                $shortcut.Arguments = $currentArgs + " " + $flag
                $shortcut.Save()
                $changed += "OK: $p"
            } else {
                $changed += "ALREADY: $p"
            }
        } catch {
            $changed += "FAIL: $p - $_"
        }
    } else {
        $changed += "SKIP: $p (not found)"
    }
}

Write-Host "=== Kết quả ==="
$changed | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Chi tiết:"
Write-Host "- Flag đã thêm: $flag"
Write-Host "- Chức năng: Cho phép Chrome MCP auto-attach vào Chrome thật qua CDP"
Write-Host "- Lưu ý: Cần mở Chrome từ shortcut đã sửa để có hiệu lực"
Write-Host "- Nếu Chrome đang chạy: tắt hết Chrome, mở lại từ shortcut = auto có CDP"
