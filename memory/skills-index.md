# Skill Library Index

> Last updated: 2026-07-20
> Each skill contains: Purpose, Requirements, Workflow, Verification, Recovery.

## SEO Optimization
- Purpose: Audit and improve website SEO (meta, OG, Twitter, Schema, sitemap, robots)
- Requirements: Website URL, sitemap.xml access
- Workflow: Audit → Fix meta tags → Add OG/Twitter → Verify schema → Update sitemap/robots → Verify HTTP 200
- Verification: curl HTTP 200 on all pages, check meta tags in HTML

## Image Optimization
- Purpose: Convert images to WebP, add lazy loading, optimize compression
- Requirements: Image files, Python Pillow
- Workflow: Scan for JPG/PNG → Convert to WebP (quality 80) → Add loading=lazy to CSS/HTML → Verify file sizes
- Verification: Count WebP files, verify size reduction

## Database Backup
- Purpose: Create and rotate backups
- Requirements: scripts/backup-database.ps1
- Workflow: Copy products.json → Timestamp filename → Keep last 30 backups
- Verification: Check backups/ directory

## Health Check
- Purpose: Monitor website and API availability
- Requirements: scripts/health-check.js
- Workflow: HTTP GET to all URLs → Check 200 status → Report UP/DEGRADED/DOWN
- Verification: Run script, check JSON output

## Browser Automation
- Purpose: Automated browser tasks using Playwright
- Requirements: Playwright (pip + chromium), selenium or playwright Python
- Workflow: Launch → Navigate → Interact → Screenshot → Verify → Close
- Verification: Script runs without errors, screenshots captured

## Production Certification
- Purpose: Verify system is production-ready before declaring certified
- Requirements: Website URLs, access credentials, Playwright
- Workflow: Run 10 certification tests → Report passes/fails/unknown
- Verification: Only verifiable test results reported; unknowns marked explicitly

## State Machine Workflow
- Purpose: Ensure workflows are idempotent, resumable, and observable
- Requirements: scripts/workflow-state.js
- States: CREATED → RUNNING → WAITING_USER → RETRYING → COMPLETED → FAILED
- Verification: State transitions are tracked and logged

## Notification Filter
- Purpose: Ensure Telegram only receives final result messages
- Requirements: scripts/notification-filter.js
- Workflow: Filter messages → Allow only SUCCESS/FAILED/USER ACTION REQUIRED → Suppress all other output
- Verification: Only allowed messages pass through filter
