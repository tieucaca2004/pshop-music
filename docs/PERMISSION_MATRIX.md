# Permission Matrix — PSH Business Platform

## Roles

| Role | Level | Description |
|------|-------|-------------|
| Owner | 100 | Full access, can transfer ownership, delete business |
| Admin | 80 | Full access except ownership transfer and deletion |
| Manager | 60 | Operational access: manage members, settings, content |
| Editor | 40 | Content management: products, blogs, banners, orders |
| Viewer | 20 | Read-only access to all business data |

## Permission Matrix

| Action | Owner | Admin | Manager | Editor | Viewer |
|--------|:-----:|:-----:|:-------:|:-----:|:------:|
| **Business Management** | | | | | |
| Edit business info | ✅ | ✅ | ✅ | — | — |
| Archive/restore business | ✅ | — | — | — | — |
| Transfer ownership | ✅ | — | — | — | — |
| Delete business | ✅ | — | — | — | — |
| **Member Management** | | | | | |
| Invite member | ✅ | ✅ | ✅ | — | — |
| Remove member | ✅ | ✅ | ✅ | — | — |
| Change member role | ✅ | ✅ | — | — | — |
| Suspend member | ✅ | ✅ | — | — | — |
| Leave business | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Settings** | | | | | |
| Edit general settings | ✅ | ✅ | ✅ | — | — |
| Edit branding | ✅ | ✅ | ✅ | — | — |
| Edit AI settings | ✅ | ✅ | — | — | — |
| Edit billing | ✅ | — | — | — | — |
| **Content** | | | | | |
| Create/edit products | ✅ | ✅ | ✅ | ✅ | — |
| Delete products | ✅ | ✅ | ✅ | — | — |
| Manage orders | ✅ | ✅ | ✅ | ✅ | — |
| Manage customers | ✅ | ✅ | ✅ | ✅ | — |
| View all data | ✅ | ✅ | ✅ | ✅ | ✅ |
