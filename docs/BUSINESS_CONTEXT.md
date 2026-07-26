# Business Context — PSH Platform

## Current Business Context

User session carries:
```json
{
  "uid": "...",
  "currentBusinessId": "pshop-music",
  "businesses": [
    { "id": "pshop-music", "role": "owner" },
    { "id": "a-tieu", "role": "admin" }
  ]
}
```

## Business Switch Flow
1. User selects business from Business Selector
2. `currentBusinessId` updated in AuthContext
3. Route receives `helpers.auth.currentBusinessId`
4. Data layer scoped to `businesses/{currentBusinessId}/`

## Business Selector
Future UI component showing:
- Current business name + logo
- Dropdown to switch
- Create new business button
- Invitation notification
