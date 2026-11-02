# Product Web Research — provider-neutral contract

## Status

As of 2026-10-31:
- Research **interface, cache, matching, evidence validation and intake integration** exist.
- A controlled **real Tavily keyless search** returned a KRK official G4 URL and specification content; see `scripts/research-real-smoke.js`.
- The provider is **not activated by default** and is not bound to `telegramWebhook`; production still reports `unconfigured`.
- The repository's `agentTools.js` `research-product` uses AI knowledge only, not the Internet; it is **not** used as web research.

## Provider recommendation

Recommended: **Tavily Search API — keyless mode**.
- Real verified query: exact `KRK-R8-G4` → official `krkmusic.com` ROKIT 8 Generation 4 page; extracted official specs included Power Output 203 W and Frequency Response 36 Hz–40 kHz.
- Keyless mode requires no account/key and is free but rate-limited; docs: https://docs.tavily.com/documentation/keyless.md
- Optional free key gives 1,000 credits/month, no card (per Tavily docs checked 2026-10-31): https://docs.tavily.com/documentation/api-credits
- HTTPS, clear timeout, Cloud Functions fetch-compatible.

Alternatives:
- **Brave Search API / LLM Context** — source URLs/content; page advertises up to $20 free calls/month, prepaid credits: https://brave.com/search/api/
- **Serper.dev** — Google result snippets; useful for discovery, weaker full-page specification evidence.

The PSH research contract remains provider-neutral. Tavily is opt-in (`PSH_RESEARCH_PROVIDER=tavily`); no paid account was created or activated. Official domains must be configured per brand (e.g. `krkmusic.com`) or sources are marked `other`/partial.

**Verified official domain:** `krkmusic.com` (KRK, from the real G4 query). Other brand domains are **not verified**; Founder must confirm each before adding it to `PSH_RESEARCH_OFFICIAL_DOMAINS`. Do not infer a manufacturer domain from a product name.

## Configuration

Server-side environment / Functions secrets (never client-side, never committed):

| Variable | Required | Meaning |
|---|---|---|
| `PSH_RESEARCH_PROVIDER` | for Tavily | `tavily` enables Tavily keyless; omit for the custom HTTP contract |
| `PSH_RESEARCH_OFFICIAL_DOMAINS` | recommended | comma-separated manufacturer domains, e.g. `krkmusic.com` |
| `PSH_RESEARCH_URL` | for custom HTTP | HTTPS endpoint implementing the contract below |
| `PSH_RESEARCH_API_KEY` | for custom HTTP / optional Tavily key | Bearer token; not needed for Tavily keyless |
| `PSH_RESEARCH_TIMEOUT_MS` | no | Per-request timeout, default 15000 ms |

If URL or key is absent, `researchProduct()` returns `status: "unconfigured"` and does not call any model/provider.

Current Functions binding: `telegramWebhook` in `functions/index.js` declares `PSH_RESEARCH_PROVIDER`, `PSH_RESEARCH_OFFICIAL_DOMAINS` and `PSH_RESEARCH_TIMEOUT_MS` as `defineString` parameters and copies them into the research environment per invocation. Existing secrets (`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `COMPOSITOR_SECRET`) remain bound and unchanged. If the custom HTTP contract is used, its URL/key still require a separate secret binding; Tavily keyless does not.

## Request

`POST PSH_RESEARCH_URL`

```json
{
  "sku": "KRK-R8-G4",
  "name": "KRK ROKIT 8 G4",
  "category": "loa",
  "specs": "catalogue specs if any"
}
```

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <PSH_RESEARCH_API_KEY>`

## Response

The provider is responsible for real Internet search/fetch and source extraction.

```json
{
  "matchedSku": "KRK-R8-G4",
  "product": {
    "name": "KRK ROKIT 8 G4",
    "brand": "KRK",
    "model": "KRK ROKIT 8 G4",
    "category": "loa",
    "description": "verified short description",
    "warranty": null,
    "origin": null
  },
  "sources": [
    {
      "title": "KRK ROKIT G4 — official",
      "url": "https://www.krkmusic.com/...",
      "type": "official",
      "claims": ["203W Class D", "8-inch Kevlar"],
      "specs": { "Công suất": "203W", "Tần số": "36Hz–40kHz" },
      "features": ["DSP"],
      "applications": ["phòng thu"]
    }
  ]
}
```

Rules enforced by PSH:
- `url` must be `https://`; source title/URL/claims are preserved.
- `type` is `official`, `distributor` or `other`; official sources sort first.
- Exact model/generation matching: `matchedSku`/model must match the query; G3 vs G4, Mk2 vs Mk1 etc. are rejected.
- Conflicting spec values across sources are omitted and reported as a warning.
- No `price` is read from research; the user-submitted selling price remains authoritative.
- Warranty/origin are used only when present in the provider response; no inference.
- Cache: RTDB `productResearchCache/<normalizedSku>`, 7-day TTL. Cache hits avoid provider calls.

## Output object used by content/preview

```json
{
  "status": "verified | partial | rejected | unconfigured | timeout | error | catalog-only",
  "matchedSku": "...",
  "product": { "name": "...", "brand": "...", "model": "...", "category": "...", "description": "...", "warranty": null, "origin": null },
  "specs": { "Công suất": "203W" },
  "features": [],
  "applications": [],
  "sources": [{ "title": "...", "url": "https://...", "type": "official", "claims": [] }],
  "warnings": [],
  "fetchedAt": 0,
  "cache": "hit"
}
```

## Intake behavior

- SKU found in PSH catalogue: catalogue remains primary; verified research fills missing fields and is shown with sources.
- SKU not in catalogue + verified research: draft product is created from research name/specs; submitted price is kept.
- SKU not in catalogue + unconfigured/error/timeout: **no draft**; user is told research is unavailable.
- Research wrong generation/model: no merge; catalogue path continues with a warning; no draft if no catalogue.

## Tests

- `node tests/productResearch.test.js` — 17 provider-neutral unit tests (mocked provider/cache, domain spoofing, cache mismatch, Tavily errors, TMA-2 variant guard).
- `node tests/telegramFbPipeline.test.js` — 114 mock tests for SKU catalogue, research-verified/failure/fallback and preview.
- `node scripts/research-real-smoke.js` — real Tavily keyless call; verifies exact G4, official URL, 203 W and no web price (not part of the mock suite).
- `PSH_REAL_RESEARCH=1 node tests/telegramFbPipeline.test.js` — real research through content engine + Telegram preview (115 tests; AI/image mocked).

Mock tests do not prove Internet access; the real smoke/integration output is the evidence.
