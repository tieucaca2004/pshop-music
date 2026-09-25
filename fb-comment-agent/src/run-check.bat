@echo off
REM FB_PAGE_ACCESS_TOKEN KHONG duoc ghi thang vao file nay (repo GitHub public).
REM Tao file fb-comment-agent\src\fb-token.local.bat (da .gitignore) chua dong:
REM   set "FB_PAGE_ACCESS_TOKEN=<token moi sau khi thu hoi token cu>"
if exist "%~dp0fb-token.local.bat" call "%~dp0fb-token.local.bat"
if not defined FB_PAGE_ACCESS_TOKEN (
  echo [run-check] Thieu FB_PAGE_ACCESS_TOKEN - tao fb-token.local.bat >> "%~dp0..\logs\agent-cron.log"
  exit /b 1
)
cd /d D:\PshopMusicSite\fb-comment-agent
node src/index.js check >> logs\agent-cron.log 2>&1
