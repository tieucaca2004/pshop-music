# Business Lifecycle — PSH Platform

## States
```
 ┌──────────┐
 │ Created  │
 └────┬─────┘
      │
      ▼
 ┌──────────┐     ┌──────────┐     ┌──────────┐
 │ Active   │────►│ Archived │────►│ Deleted  │
 └──────────┘     └──────────┘     └──────────┘
      │                 │
      └─────────────────┘ (restore)
```

## State Transitions
| From | To | Action | Who |
|------|----|--------|-----|
| Created | Active | Auto | System |
| Active | Archived | Archive | Owner |
| Archived | Active | Restore | Owner |
| Active | Deleted | Soft delete | Owner |
| Archived | Deleted | Soft delete | Owner |

## Business Status Values
- `active` — Normal operation
- `archived` — Suspended, data preserved
- `deleted` — Soft deleted, data hidden
- `suspended` — Billing/abuse related

## Membership Lifecycle
```
Invited → Pending → Accepted → Active
                       │
                       ├──→ Rejected
                       └──→ Cancelled
         
Active → Suspended → Active (unsuspend)
Active → Removed (permanent)
```
