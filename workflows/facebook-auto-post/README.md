# Facebook Auto Post — Native OpenClaw Workflow

## Workflow Name
`Facebook Auto Post`

## Purpose
Publish text messages and images to the Pshop Music Facebook Page via the Facebook Graph API. This is a **native OpenClaw workflow** — no Docker, no n8n, no external dependencies.

## Required Credentials

| Credential | Value |
|---|---|
| **App ID** | `27491382417218688` (Pshop Music) |
| **Page ID** | `109215528208008` (A. Tiểu - Hủ Tiếu Xào) |
| **Page Access Token** | `EAAdf6…sMZD` (255 chars — obtain from Graph API Explorer) |

## File Structure

```
D:\PshopMusicSite\workflows\facebook-auto-post\
├── publish.js                    # Main workflow script
├── .facebook-credentials.json    # Credentials file (gitignored)
├── facebook-credentials.template.json  # Template for credentials
└── README.md                     # This file
```

## Setup

### Step 1: Provide the Page Access Token

I need you to obtain the **Page Access Token** from the Graph API Explorer:

1. Open https://developers.facebook.com/tools/explorer/
2. Select App: **Pshop Music** (27491382417218688)
3. Click **Generate Access Token**
4. Ensure permissions: `pages_manage_posts`, `pages_read_engagement`
5. Select the page: **109215528208008**
6. Copy the token
7. Run this command to save it:

```powershell
$token = "EAAdf6Le4TlABR4...paste-full-token"
$creds = @{pageAccessToken=$token}
$creds | ConvertTo-Json | Out-File D:\PshopMusicSite\workflows\facebook-auto-post\.facebook-credentials.json -Encoding utf8
```

### Step 2: Validate (no post will be made)
```bash
node D:\PshopMusicSite\workflows\facebook-auto-post\publish.js --message "Test" --validate-only
```

### Step 3: Post a message
```bash
node D:\PshopMusicSite\workflows\facebook-auto-post\publish.js --message "Hello from Pshop Music!"
```

## Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `--message` | string | Yes | The post content |
| `--validate-only` | flag | No | Check credentials without posting |

## Output
- **Success:** Returns the Facebook Post ID (e.g., `109215528208008_123456789`)
- **Failure:** Returns error message with step-by-step recovery instructions

## API Used
- `GET /v21.0/{page_id}` → validate credentials
- `POST /v21.0/{page_id}/feed` → publish message

## Error Handling
| Error | Recovery |
|---|---|
| Token expired / invalid | Regenerate in Graph API Explorer |
| Credentials file missing | Run the setup command above |
| Permission denied | Add `pages_manage_posts` scope |
| App Secret needed | Click "Show" in Meta Developer settings |
| API rate limited | Wait 15 minutes between posts |

## Agent Calling Convention

Future OpenClaw agents can call this workflow by executing:

```javascript
const { execSync } = require('child_process');
const result = execSync('node D:\\PshopMusicSite\\workflows\\facebook-auto-post\\publish.js --message "Your post"');
console.log(result.toString());
```

## Security
- The credentials file (`.facebook-credentials.json`) is in `.gitignore`
- Never commit the token to the repository
- The token should be treated as a secret
