# Product Web Research — provider-neutral contract

## Status

As of 2026-10-31:
- Research **interface, cache, matching, evidence validation and intake integration** exist.
- A controlled **real Tavily keyless search** returned a KRK official G4 URL and specification content; see `scripts/research-real-smoke.js`.
- The provider is **not activated by default** and is not bound to `telegramWebhook`; production still reports `unconfigured`.
- The repository's `agentTools.js` `research-product` uses AI knowledge only, not the Internet; it is **not** used as web research.

## Behaviour after the Research → Writer change (code + mocked tests only)

**Not verified against the real Internet or production.** Everything below is implemented and covered by mocked tests; real Tavily behaviour (in particular whether *keyless* mode accepts `include_raw_content`) has not been exercised since this change. Production configuration is unchanged and still has to be set by the Founder.

Flow: caption → `parseProductCaption` → research (by SKU/model **or by name only**) → `applyResearchProduct` → `buildProductBrief` → writer prompt (`richBrief`) → claim filter → Telegram preview.

- **Name-only lookup.** If the caption has no SKU and no model, research still runs with the product name (`contentOrchestrator.js`). It is best-effort: no draft is rejected because research failed, and `product.sku` is never created from research.
- **Page content.** The Tavily request asks for `include_raw_content`. If Tavily answers HTTP 400/422 the adapter retries once without it and the result is marked `contentLevel: "snippet"` (no features/applications/description can be extracted from a snippet that lacks them). `contentLevel: "page"` means at least one accepted source returned page text.
- **Verification from evidence in the source, not from the query.** A result is accepted only if its **title or URL** contains the model as a contiguous token run (`ddj 400` or `ddj400`, with exact token boundaries, so DDJ-400 ≠ DDJ-1000/DDJ-4000/DDJ-FLX4; "Generation 4" = G4). Variant words (wireless/xe/studio…), generation tokens (G3 vs G4, Mk) and comparison/"vs"/"best" titles are rejected. If a brand was supplied it must appear in the source. `matchedSku`/`product.model` are the string found **in the source**; `verification.evidence` lists url / where / matched text. A custom HTTP provider still supplies its own `matchedSku`.
- **Unverifiable queries are not searched.** Names with no model-like token (no digit and fewer than 2 identifying words, e.g. "Giá đỡ micro") return `rejected / unverifiable_query` without any network call; if nothing matches, `rejected / no_matching_source`. The writer then receives only the product name (unchanged safe behaviour).
- **Extracted content (verbatim from the source page, no inference):** `specs` (`Key: value` lines and table rows), `features` (bullet lines), `applications` (sentences with usage cues such as "designed for / ideal for / for DJs/studio"), `description` (first descriptive paragraph), `claims` (up to 30 clean lines per source). Text after "Related products / You may also like / Compare…" is cut off, and price/cart/shipping/cookie lines are dropped. Up to 4 sources, official ones first.
- **Writer input.** `buildProductBrief` carries brand, model, type, specs, description, features, applications and up to 24 `referenceNotes` (English source text is rephrased in Vietnamese by the writer) plus the verification level. The claim filter's allowed text includes all of these, so a faithful paraphrase survives while unsourced claims (and unsourced venue/audience claims) are still removed. The filter itself was not loosened.
- **Cache.** Results carry `schema: 2`. Older cache entries (no schema; snippet-only or query-verified) are ignored and re-researched. Verified results with no usable content (no specs/features/applications/description/≥3 claim lines) are not cached. No Firebase data is deleted; old entries simply age out/are overwritten.

### Bài Facebook từ dữ liệu research (Content Engine)
- **Chỉ có tên / không có nguồn khớp:** không gọi AI. Bài = mở bài ("Pshop Music giới thiệu <tên>.") → giá/tình trạng Founder cấp → lời mời liên hệ → hashtag. Telegram Preview liệt kê "Thông tin còn thiếu" (không nằm trong bài đăng).
- **Có research:** Writer nhận mô tả/tính năng/công dụng/tài liệu tham khảo; bộ lọc claim loại câu không nguồn, kể cả **thông số số học tự bịa** (mọi "số + đơn vị" như W/Hz/dB/inch/mm/kg phải có trong nguồn).
- **Bảng thông số kỹ thuật** do CODE ghép nguyên văn từ research khi status \`verified\` (nguồn hãng theo \`PSH_RESEARCH_OFFICIAL_DOMAINS\`); không in khi \`partial\`/\`rejected\`. Thứ tự bài: nội dung → thông số → giá/tình trạng → CTA → hashtag.
- **Preview** hiển thị toàn bộ bài (tách nhiều tin Telegram nếu > ~3800 ký tự, nút DUYỆT/HỦY ở tin cuối). Publisher đăng nguyên văn \`aiCaption\`; thân bài giới hạn an toàn 6000 ký tự (cắt theo đoạn) so với giới hạn 63.206 của Facebook.

### Limits that remain
- Only Tavily is wired (no extra provider/service was added). Whether keyless mode returns `raw_content` is unconfirmed; the snippet fallback is the safety net.
- Verification relies on the title/URL token match. A page that is titled with the right model but whose body mixes other models can still contribute lines (mitigated, not eliminated, by the "related products" cut-off).
- Official-source status needs `PSH_RESEARCH_OFFICIAL_DOMAINS`; otherwise the status is `partial`. Only `krkmusic.com` is a Founder-confirmed domain; `pioneerdj.com` etc. appear only in tests.
- Extraction works on English-style pages; sparse pages yield sparse data and the writer stays short on purpose.
- Names that are purely Vietnamese/generic are not searched (by design).

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

- Name only (no SKU/model): research runs by name; verified data is merged, otherwise the writer gets only the name.
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
