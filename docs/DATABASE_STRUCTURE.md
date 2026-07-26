# Database Structure — PSH Business Platform

## Core Nodes

### businesses/{businessId}/
- info/ — displayName, slug, status, plan, timezone, currency, country, language, createdAt, updatedAt
- settings/: general, branding, localization, ai, billing
- subscription/: plan, status, periodStart, trialEnds
- stats/: totalProducts, totalOrders, totalMembers, storageUsed (computed)

### businessMembers/{businessId}/{uid}
- role: owner|admin|manager|editor|viewer
- email, name, assignedAt, invitedBy, status: active|suspended

### businessInvitations/{invitationId}
- businessId, invitedEmail, invitedBy, role, token, status: pending|accepted|rejected|cancelled|expired
- createdAt, expiresAt, acceptedAt

### businessAuditLogs/{businessId}/{logId}
- uid, action, details, timestamp, ip, userAgent

### roles/{uid} (legacy — PShop Music only)
- role: admin|editor|agent
- email, name, createdAt

## Indexes
- businessMembers/{businessId} — .indexOn: [role, email, status]
- businessInvitations — .indexOn: [businessId, invitedEmail, status, token, expiresAt]
- businessAuditLogs/{businessId} — .indexOn: [uid, action, timestamp]
