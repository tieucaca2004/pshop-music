# Product Vision acceptance

## State as of 2026-11-01

- Vision request/response/error path: **unit-tested with mocks** (`node tests/productVision.test.js`, 6/6).
- Vision through Telegram intake: **pipeline-tested with injected mock** in `tests/telegramFbPipeline.test.js`.
- Real OpenAI Vision call: **not performed**. The Founder’s AIAIAI photo was not present in the worktree or temp image set; no substitute image was used.
- No cost was incurred for Vision in this task.

## What the code does

`functions/shared/productVision.js`
- Model: `gpt-4o-mini` (existing `OPENAI_API_KEY`).
- Image: base64 data URL (`image/jpeg`, `image/png` or `image/webp`), max 10 MB.
- Timeout: 20 s; HTTP/JSON errors return a status, never throw to Telegram.
- Prompt forbids inventing power, driver size, impedance, frequency, warranty, origin, price or specs.
- Model is only a suggestion; `contentOrchestrator` keeps it as `visionModel` and never sets the confirmed product model from Vision.

Caption data (seller) and Vision data (visual) remain separate. Price, warranty and condition from the caption are preserved. Technical specs require catalogue/research evidence.

## Real smoke result — 2026-11-01

Because the Founder’s phone photo was unavailable, the Founder authorized an Internet reference image. Used:
- Official page: https://aiaiai.audio/headphones/tma-2-dj
- Image: official AIAIAI TMA-2 DJ reference PNG (1920×1080, 1,545,992 bytes)
- **This is not the Founder phone photo.** It contains visible “TMA-2 DJ” text.

One authorized `gpt-4o-mini` request:

| Field | Result |
|---|---|
| HTTP | **200** |
| API status | **ok** |
| Duration | **5,788 ms** |
| Product type | **headphones** |
| Brand | **AIAIAI** (90) |
| Color | **black** |
| Model | **TMA-2 DJ** (85) |
| Recognition level | **model** |
| Warnings | **none** |
| Success | **true** |

Caveat: model recognition may be aided by visible text in this official reference image. It does not prove model recognition from a clean, text-free photo.

The first attempt returned `unconfigured` in 1 ms because standalone Node could not resolve a Firebase secret binding; it made **no HTTP request and incurred no API charge**. The second, authorized request above is the only real Vision call.

## Controlled real test

Prerequisite:
- A real product image supplied by Founder.
- A configured `OPENAI_API_KEY` available to the Functions runtime.
- Approval to make one paid `gpt-4o-mini` image request within quota.

Run:
```powershell
node scripts/product-vision-smoke.js --image "D:\path\to\founder-product.jpg"
```

The script prints only:
- image basename, bytes, MIME, duration;
- status, productType, brand, brandConfidence;
- model/modelConfidence (may be null);
- color, features, uncertain, warnings.

It never prints the API key and does not write to Firebase.

Expected for the AIAIAI example:
- productType: tai nghe chụp tai/DJ;
- brand: AIAIAI only if visible/credible;
- color: đen if visible;
- model: null unless genuinely identifiable;
- no technical specifications.

The smoke script exits 0 when the API succeeds and **product type or brand or model** is recognized. `model=null` is not a failure; it reports `recognitionLevel: "type" | "brand" | "model"`. API success with no recognized type/brand/model exits 3.

## Remaining blockers

1. Founder image file/path is missing in this environment.
2. No real Vision call has been made, so no claim of Vision API success.
3. Full Telegram preview/approval remains unverified in a live chat.
4. `imageRouterConfig` production is still not configured; this task does not change it.

## Do not

- Do not use a stock/AI-generated image and call it the Founder image.
- Do not turn a Vision brand/model guess into verified data.
- Do not publish to Facebook; `dryRun=true`.
