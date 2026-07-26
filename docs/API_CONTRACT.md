# API Contract — PSH Business Platform (Multi-tenant)

## Standard Response Format

**Success:**
```json
{ "success": true, "data": {...} }
```

**Error:**
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable", "details": null } }
```

## HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | GET, PATCH, PUT, DELETE success |
| 201 | POST (created) |
| 400 | Invalid request |
| 401 | Unauthenticated |
| 403 | Permission denied |
| 404 | Not found |
| 409 | Conflict |
| 500 | Internal error |

## Multi-tenant Routes

All MT routes: `/v1/businesses/{businessId}/{collection}[/{id}]`

### Products
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | /v1/businesses/{bid}/products | viewer+ |
| GET | /v1/businesses/{bid}/products/{id} | viewer+ |
| POST | /v1/businesses/{bid}/products | editor+ |
| PATCH | /v1/businesses/{bid}/products/{id} | editor+ |
| DELETE | /v1/businesses/{bid}/products/{id} | admin+ |

### Categories, Orders, Customers, etc follow same pattern.

## Middleware Flow
1. `authenticate()` → verify Firebase ID token
2. `authorizeBusiness()` → check businessMembers/{bid}/{uid}
3. Route handler
4. `sendSuccess()` / `sendError()` → standard response

## Permission Levels (businessMembers)
- `owner`: full access
- `admin`: read + write + delete
- `editor`: read + write
- `viewer`: read only
