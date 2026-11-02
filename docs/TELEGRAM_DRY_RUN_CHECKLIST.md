# Telegram dry-run checklist — Product Research

## 1. Verified facts

- Real Tavily keyless research has been verified with `KRK-R8-G4`.
- Official domain verified: `krkmusic.com` (KRK manufacturer page returned by the real query).
- Other brand domains are **not verified** in this task; do not add them to the allow-list without checking the manufacturer site.
- `dryRun=true` must remain. Do not approve/post a real Facebook post.

## 2. Missing production configuration

Set these as `telegramWebhook` Firebase parameters (non-secret), not in source code:

```env
PSH_RESEARCH_PROVIDER=tavily
PSH_RESEARCH_OFFICIAL_DOMAINS=krkmusic.com
PSH_RESEARCH_TIMEOUT_MS=15000
```

- Tavily keyless needs **no API key**.
- If a free Tavily key is later used for higher limits, bind it as a secret; never commit it.
- `functions/index.js` defines these as `defineString` parameters with empty/default values and copies them into the research config for `telegramWebhook`.
- Existing secrets (`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `COMPOSITOR_SECRET`) must not be removed or overwritten.

## 3. Where to configure

Local/emulator: create `functions/.env.local` (not committed) with the values above.

Production: set the Firebase parameters/environment for the `pshop-music` Functions deployment, then deploy only after Founder approval. This task does **not** deploy.

## 4. Test product

Send one photo with this caption:

```text
SKU: KRK-R8-G4
Giá: 8.500.000
```

Do not add a fake condition or specifications.

## 5. Expected preview

- Product: KRK ROKIT 8 G4; SKU `KRK-R8-G4`.
- Price: **8.500.000đ** exactly as submitted.
- Official source URL contains `krkmusic.com`.
- Specs include `Power Output: 203 Watts`, `Frequency Response: 36Hz - 40KHz`.
- Research source/warning block visible.
- Image status visible (`ẢNH GỐC` when compositor is not configured).
- Target Fanpage visible.
- Existing `DUYỆT & ĐĂNG` / `HỦY` buttons present.

## 6. Safety checks

1. Confirm the preview says dry-run mode (`DUYỆT sẽ KHÔNG đăng lên Facebook`) before doing anything.
2. Prefer **HỦY** for this dry-run; do not approve.
3. If approval is tested, verify it is still dry-run and no Graph `/feed` call is made.
4. Never send a real product to a public page during acceptance.
5. Do not log bot tokens, webhook secret, research keys or full private data.

## 7. If Telegram cannot be tested

Missing one of these blocks live acceptance:
- `TELEGRAM_BOT_TOKEN` / webhook setup.
- Founder-authorised Telegram chat and approver mapping.
- A configured target Fanpage token.
- Production research parameters.

Do not send messages to production Telegram to “see if it works.” Prepare the local/emulator run and wait for Founder.
