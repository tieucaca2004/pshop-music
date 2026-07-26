# PSH Business Platform — Architecture

## Authentication Flow (API Gateway Pattern)

```
Request → API Gateway
           ├── authenticate()         → verify Firebase ID token
           ├── build helpers.auth     → attach user context
           └── route.handle(req, res, helpers)
                                    │
                                    └── Route receives:
                                        - helpers.auth (authenticated user)
                                        - helpers.sendSuccess/sendError
```

### Gateway Responsibilities
- `authenticate()` — verify Firebase ID token, return user context
- `authorizeBusiness()` — check businessMembers/{businessId}/{uid}
- Build `helpers.auth` — pass authenticated user to routes
- Standard error handling (401/403)
- Request context enrichment

### Route Responsibilities
- Business logic only
- Permission check via `authorizeBusiness()` if needed
- Response via `helpers.sendSuccess()` / `helpers.sendError()`

## Route Classification by Auth Type

### Gateway-Authenticated (33 routes via apiGateway)
All routes under `/v1/*` go through apiGateway which handles authentication.
Routes receive `helpers.auth` with verified user context.

### Public Routes (exempt from auth)
- `health.js` — system health check
- `registration.js` — user registration
- `webhooks.js` — third-party callbacks
- `cmsLists.js` GET — public content reads

### Self-Authenticated (standalone Cloud Functions)
- `openaiProxy` — OpenAI API proxy (calls authenticate() directly)
- `facebookOAuthCallback` — Facebook OAuth callback
- `facebookPublish` — Facebook publish
- `facebookSelectPage` — Facebook page selection
- `facebookRefreshToken` — Facebook token refresh

## Multi-tenant Data Structure
businesses/{businessId}/{collection}/{id}
- Products, Categories, Orders, Customers, Inventory
- CMS, BlogPosts, Banners, Media, Files
- AI Jobs, Drafts, Analytics, Notifications
- Settings

## Legacy Compatibility
- PShop Music uses `roles/{uid}` (flat nodes)
- New tenants use `businessMembers/{businessId}/{uid}` + `businesses/{businessId}/`
- Compat layer in `js/db-compat.js`
