$date = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = "backups"
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$backup = "$dir\products-$date.json"
Copy-Item "data\products.json" $backup
Write-Host "Backup saved: $backup"
Get-ChildItem "${dir}\*.json" | Sort-Object Name -Descending | Select-Object -Skip 30 | ForEach-Object { Remove-Item $_.FullName; Write-Host "Removed old: $_" }
