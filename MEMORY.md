# MEMORY.md — Long-Term Curated Memory

> Last updated: 2026-07-20
> Purpose: Persistent knowledge that survives session restarts.

## Architecture Overview

This workspace (`D:\PshopMusicSite`) serves multiple projects:
- **pshopmusic.com** — DJ equipment e-commerce (primary)
- **atieu.com** — Restaurant business website (static, for Meta Verification)
- Future projects TBD

Stack: Static HTML + Firebase Realtime Database + Netlify deployment.
OpenClaw gateway runs in `local` mode. Browser automation uses CDP (Playwright available).

## Key Credentials
- TenTen.vn: tieucaca2004 / Tina2010@@ (domain registrar for atieu.com)
- ImprovMX: Tieucaca2012@gmail.com / Tina2010@@ (email forwarding contact@atieu.com)
- Pshop Admin: tieucaca2012@gmail.com / Tina2010@@ (Firebase Auth)
- Firebase: pshop-music project (RTDB, Auth, Storage)

## Systems & Architecture

### Pshop Music (pshopmusic.com)
- Static HTML site with Firebase backend for CMS
- Admin panel at /admin/ (Firebase Auth + RTDB)
- Products stored in Firebase RTDB + data/products.json
- Netlify deployment (publish: .)
- SEO: meta tags, OG, Twitter Cards, JSON-LD, sitemap(13 URLs), robots.txt
- Mobile: responsive CSS with breakpoints at 900/700/680/600/400px

### atieu.com
- Static HTML site in `atieu.com/` subfolder
- 6 pages: Home, About, Business Info, Contact, Privacy, Terms
- Ready for deployment to atieu.com domain (needs separate Netlify site)

### Browser Automation
- Chrome v150 available
- CDP port 18800 listening
- Playwright 1.61 installed (pip + npm + chromium)
- Workflow state machine in scripts/workflow-state.js
- Notification filter in scripts/notification-filter.js

## Design Decisions
1. Production over perfection — ship working code, iterate
2. Evidence-first — never guess or estimate
3. API before browser automation
4. Telegram is final-result-only channel (SUCCESS/FAILED/USER ACTION REQUIRED)
