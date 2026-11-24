# WU1-R1 — Research Identity & Retrieval Safety Remediation Report

**Status:** REMEDIATION IMPLEMENTED — PENDING INDEPENDENT ACCEPTANCE REVIEW

**Worktree:** `D:\PshopMusicSite-wt-tgfb`

**Branch:** `feat/telegram-fb-publisher`
**HEAD:** `e0546fefae127723d8e51b20ac8919c0cdc9dbfd`

## 1. Repository and baseline

Expected and observed branch/HEAD matched.

### Initial status (before WU1-R1)

```text
 M functions/shared/contentOrchestrator.js
 M functions/tests/realPublish.test.js
 M functions/tests/telegramFbPipeline.test.js
?? functions/.env.pshop-music
?? functions/tests/out/...
?? docs/WU1-RESEARCH-RETRIEVAL-PRODUCT-MATCHING-REPORT.md
?? tools/compositor/...
```

`productResearch.js` was clean at WU1-R1 start. The pre-existing modifications and untracked files were preserved. No `.env` content was read or printed.

## 2. Final status / changed files

WU1-R1 adds:

```text
M  functions/shared/productResearch.js
?? functions/tests/productResearch.wu1r1.test.js
?? docs/WU1-R1-REMEDIATION-REPORT.md
```

`productResearch.wu1.test.js` and the prior WU1 reports remain untouched. Pre-existing modifications to `contentOrchestrator.js`, `realPublish.test.js`, `telegramFbPipeline.test.js`, test outputs and `.env.pshop-music` remain unchanged.

## 3. D1 — Cross-generation identity contamination

### Root cause

`matchEvidence()` accepted a model code anywhere in page content without checking whether the
page title/identity named a different generation. `classifyMatch()` did not re-check generation in
the exact branch.

### Remediation

- `matchEvidence()` now compares query generation against title/URL generation.
- Body-only exact matches are rejected if the body also contains a generation not present in the
  query.
- A different-generation title cannot be accepted merely because the body mentions the requested
  model.
- Exact sources remain the only source class allowed to contribute facts.

### Regression

`WU1-R1` test D1: G4 support page with incidental `RP5G2` mention.
Assertions: not exact, rejected, no specs, no `203 W`.

## 4. D2 — Missing generation classified as exact

### Root cause

`classifyMatch()` considered a model code + size sufficient even when the query omitted a material
generation discriminator.

### Remediation

- Added `identityComplete(query)`.
- Exact identity now requires a compact model code or both material family discriminators
  (for KRK-style families, size and generation).
- An incomplete query cannot become exact merely because a result supplies the missing generation.
- `KRK Rokit 5` with a G4 page becomes `product_family`/uncertain and carries no specs.
- `KRK Rokit 5 G2`, `RP5G2`, `RP8G4`, `DDJ-400`, `DDJ-FLX4`, `TMA-2 DJ` remain exact-capable.

### Regression

`WU1-R1` test D2: `KRK Rokit 5` against G4 page.
Assertions: not exact, no G4 specs.

## 5. D3 — Exact but insufficient content stopped retrieval

### Root cause

`tavilyProvider()` broke after the first exact model result, before checking whether extraction
produced usable content.

### Remediation

- Added `exactHasUsableContent()`.
- The query loop now stops only when an exact result has usable extracted content.
- An exact result with empty content continues to the next manual/specification query.
- Identity and content sufficiency remain separate:
  - exact identity + insufficient content is not rewritten as a false model;
  - later usable evidence can still be retrieved.
- If no later evidence exists, the result is marked `contentStatus=insufficient`; it is not filled
  with invented specs.

### Regression

`WU1-R1` test D3: first exact title with empty content, later manual with specs.
Assertions: at least two calls, verified, `Power=50 W`, `contentStatus=sufficient`.

## 6. D4 — Global query budget

### Implementation

`tavilyProvider()` now computes one `deadline` from `cfg.timeoutMs` (or the default). For every
query:

- remaining budget is calculated before starting;
- the per-request timeout is `min(per-request setting, remaining budget)`;
- the same check applies to the raw-content retry;
- no additional query starts after the deadline;
- if the budget is exhausted before any result is collected, the provider raises an AbortError;
  `researchProduct()` maps that to `status=timeout`, `failureStage=retrieval`.

### Guarantee / limitation

The implementation uses `AbortController`; the actual underlying HTTP client must honor the signal.
This is a cooperative abort, not a hard process kill. CPU-only matching/extraction work is not
preempted, but no further network operation is started after the deadline.

### Regression

- D4 single-request abort: timeout/retrieval.
- D4 expansion budget: first query consumes part of the total, the next query is aborted by the
  remaining budget; timeout/retrieval.

## 7. D5 — Cache identity validation

### Root cause

`cacheMatchesQuery()` trusted `hit.verification.verified` and skipped query/model validation.

### Remediation

- Removed the `byEvidence` bypass.
- Cache entries must have `schema=4`.
- `identityComplete(query)` is required.
- The cached identity is revalidated through `matchEvidence()` against a synthetic title containing
  the cached SKU/model/name/brand.
- Bad G4 entries are rejected for G2 queries.
- Variant suffix entries (`DDJ-400-N`) are rejected for base `DDJ-400`.
- Incomplete-generation queries cannot reuse an exact cached entry.
- Family/uncertain/rejected entries are not reusable as exact results.
- Valid cache hits remain valid.

`RESEARCH_SCHEMA` is now `4`; schema-3 and older cache entries are ignored, so previously unsafe
entries cannot bypass the new checks.

### Regression

- bad G4 cache for G2 query;
- variant cache for base model;
- incomplete-generation cache entry;
- existing valid cache hit;
- old schema ignored.

## 8. D6 — Conflicting claims and Writer input

### Investigation

`contentOrchestrator.js:81 researchPromptBlock()` includes:
- `research.specs`;
- `research.features`;
- `research.applications`;
- source `claims`;
- warnings.

Before D6 remediation, conflicting values were omitted from `specs` but remained in source
`claims`, `features` and `applications`, which could reach Writer.

### Remediation

`mergeFacts()` records conflicts with values and source URLs. `stripConflictClaims()` removes
conflicting values from:

- source `claims`;
- source `features`;
- source `applications`;
- source `specs`.

`normalizeResearch()` then recomputes clean facts and preserves the conflict diagnostics in
`conflicts` plus warnings. No Writer, Content Validation or Facebook Publisher file was changed.

### Test

`WU1-R1` D6: two official sources conflict on `Power`; `specs.Power` is absent, conflicts retain
both values and source URLs, and source claims/specs no longer contain the disputed values.
Warnings remain explicit for the Writer prompt.

### Residual risk

Warnings include the conflict values as diagnostic text. They are labelled as conflicts, not
facts. A future dedicated Writer/evidence-boundary unit may add a stricter claim-status type; that
is outside this bounded WU1-R1 change.

## 9. Tests and actual results

Commands run:

```text
node functions/tests/productResearch.test.js
node functions/tests/productResearch.wu1.test.js
node functions/tests/productResearch.wu1r1.test.js
node functions/tests/productContentBrief.test.js
node functions/tests/telegramFbPipeline.test.js
node --check functions/shared/productResearch.js
git diff --check
```

Actual results:

| Command | Result |
|---|---|
| `node functions/tests/productResearch.test.js` | **34 passed, 0 failed** |
| `node functions/tests/productResearch.wu1.test.js` | **15 passed, 0 failed** |
| `node functions/tests/productResearch.wu1r1.test.js` | **9 passed, 0 failed** |
| `node functions/tests/productContentBrief.test.js` | **28 passed, 0 failed** |
| `node functions/tests/telegramFbPipeline.test.js` | **123 passed, 0 failed, 0 skipped** |
| `node --check functions/shared/productResearch.js` | **exit 0** |
| `git diff --check` | **exit 0** |

`telegramDryRun.scenario.test.js` was not run: it requires a local Firebase
emulator/database/storage. No unrun test is reported as PASS.

All provider tests are offline/injected. No Tavily, Google or OpenAI call was made.

## 10. Compatibility

- Consumer interface unchanged:
  `deps.researchProduct({ sku, name, brand, category, specs })`.
- Existing statuses unchanged.
- New fields remain additive: `matchLevel`, `failureStage`, `contentStatus`, `searchQueries`,
  `conflicts`, `sourceTypes`.
- Existing consumer tests pass.
- Family-only results remain inspectable but carry no specs.
- Explicit-model family-only remains rejected.
- Writer/Content Validation/Facebook Publisher/Telegram approval/dryRun/tokens were not edited.

## 11. Remaining risks and limitations

- No real provider validation; abort/timeout behavior depends on the production fetch honoring
  AbortController.
- Query expansion is bounded to four queries and one total timeout; latency is still provider-bound.
- Source-type classification remains heuristic; unknown hosts stay `other`.
- Content-only matching is now generation-checked but still relies on readable page content; SEO or
  compatibility pages can require future tuning.
- PDF content is still not parsed; it reports insufficient content rather than inventing facts.
- D6 warning text still includes disputed values as diagnostics; future Writer hardening may add a
  claim-status contract.
- No production deployment, Facebook publication, Telegram approval, secret change, commit or push
  was performed.

## 12. Status

`REMEDIATION IMPLEMENTED — PENDING INDEPENDENT ACCEPTANCE REVIEW`

WU1 is not accepted. WU2 must not begin until a separate read-only acceptance review passes.
