# API List — PSH Platform Multi-tenant

## Business Lifecycle
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | /v1/businesses | Create business |
| GET | /v1/businesses/{id} | Get business info |
| PATCH | /v1/businesses/{id} | Update business |
| POST | /v1/businesses/{id}/archive | Archive |
| POST | /v1/businesses/{id}/restore | Restore |
| POST | /v1/businesses/{id}/delete | Soft delete |
| POST | /v1/businesses/{id}/transfer | Transfer ownership |
| GET | /v1/user/businesses | List user's businesses |

## Business Members
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /v1/businesses/{id}/members | List members |
| POST | /v1/businesses/{id}/members/invite | Invite member |
| DELETE | /v1/businesses/{id}/members/{uid} | Remove member |
| PATCH | /v1/businesses/{id}/members/{uid}/role | Change role |
| POST | /v1/businesses/{id}/members/{uid}/suspend | Suspend member |
| POST | /v1/businesses/{id}/members/{uid}/unsuspend | Unsuspend |

## Invitations
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | /v1/invitations/accept | Accept invitation |
| POST | /v1/invitations/{id}/cancel | Cancel invitation |
| GET | /v1/businesses/{id}/invitations | List invitations |

## Business Settings
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /v1/businesses/{id}/settings | Get settings |
| PATCH | /v1/businesses/{id}/settings/general | Update general |
| PATCH | /v1/businesses/{id}/settings/branding | Update branding |
| PATCH | /v1/businesses/{id}/settings/ai | Update AI config |
| PATCH | /v1/businesses/{id}/settings/billing | Update billing (owner only) |

## Business Context
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /v1/user/context | Get current user context |
| POST | /v1/user/switch | Switch current business |

## Audit Log
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /v1/businesses/{id}/audit | Get audit log |
