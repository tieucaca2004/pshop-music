# Founder Platform — Control Plane

PSH Business Platform's master dashboard and management layer.

## Founder Dashboard
- Total Businesses, Active/Suspended/Archived counts
- Active Users (unique across all tenants)
- AI Usage (tokens consumed)
- Storage (MB used)
- API Calls (count)
- Errors (recent)
- Background Jobs (queue status)

## Platform Settings
- Brand: name, logo, favicon
- Theme: primaryColor, secondaryColor, font
- SMTP: host, port, user, password (for invitation emails)
- Storage: bucket, limits
- Firebase: project, apiKey, region
- OpenAI: defaultKey, defaultModel
- Security: allowedDomains, rateLimits, sessionTTL

## Data Flow
```
Founder Dashboard → FounderPlatform service → Firebase RTDB
    ├── businesses/ (all tenants)
    ├── businessMembers/ (all users)
    └── businessAuditLogs/ (all events)
```
