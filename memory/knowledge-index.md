# Knowledge Index

> Last updated: 2026-07-20
> Searchable index of all project knowledge, skills, and documentation.

## Projects

| Project | Domain | Location | Type | Status |
|---------|--------|----------|------|--------|
| Pshop Music | pshopmusic.com | `./` root | Static HTML + Firebase | Production |
| atieu.com | atieu.com | `./atieu.com/` | Static HTML | Not deployed |
| Future | TBD | TBD | TBD | TBD |

## Memory Files

| File | Contents |
|------|----------|
| `MEMORY.md` | Long-term curated memory, architecture, credentials |
| `memory/2026-07-20.md` | Today's session notes |
| `memory/user-preferences.md` | User communication and workflow preferences |
| `memory/skills-index.md` | Reusable skill library |
| `memory/experience-log.md` | Task experience records |
| `memory/knowledge-index.md` | This file — searchable index |

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/workflow-state.js` | Workflow state machine (CREATED→COMPLETED/FAILED) |
| `scripts/notification-filter.js` | Telegram notification filter |
| `scripts/backup-database.ps1` | Database backup with rotation |
| `scripts/health-check.js` | Website and API health monitoring |
| `scripts/audit_scoring.py` | System health scoring audit |
| `scripts/certification.py` | Production certification tests |

## Infrastructure

| Component | Status | Details |
|-----------|--------|---------|
| OpenClaw Gateway | ✅ Running | local mode, port 18789 |
| Node.js | ✅ v24.18.0 | - |
| Python | ✅ 3.14.6 | - |
| Chrome | ✅ v150 | CDP port 18800 |
| Playwright | ✅ Installed | pip + npm + chromium |
| Firebase | ✅ Configured | pshop-music project |
| Netlify | ✅ Configured | pshopmusic.com live |
| Docker | ❌ Not available | Not installed on this machine |

## Configurations

| File | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | OpenClaw gateway configuration |
| `netlify.toml` | Netlify deployment configuration |
| `js/firebase-config.js` | Firebase SDK configuration |
| `.gitignore` | Git exclusion rules |

## Automation Notes
- **Upload**: Always use media library (admin) → upload via browser file dialog → select image
- **Product publish**: Admin panel → Firebase RTDB → auto-published with "Đã xuất bản" status
- **DNS**: TenTen.vn for atieu.com; ImprovMX MX records verified by Google DNS
