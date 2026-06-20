# Build Brief: Multi-Pass Stability Check for Pass 1

## Goal

Run Pass 1 N times and attach a hit-rate to each principle cited, so downstream analysis distinguishes stable observations from noise. N defaults to 3 (controlled by env var, not code).

## Background

A single LLM pass has stochastic variance — different principles surface on different runs. Running Pass 1 three times and taking only the majority-cited principles before feeding Pass 2 produces a more reliable perceptual inventory. This is the "stability check" pattern from Concord (Mollick et al.) adapted for single-image analysis.

---

## Files to read first

- `src/pages/api/analyze.ts` — where Pass 1 currently runs
- `src/pages/api/artifact.ts` — `EXTRACTION_PROMPT`, `buildArtifactPass2UserText`, and related prompt builders
- `src/lib/model-router.ts` — `callModel` / `streamModel`
- `src/db/types.ts` — `DbAnalysis` schema

---

## What to implement

### 1. Read `STABILITY_PASSES` from env

In `analyze.ts`, read the env var at the top of the handler:

```ts
const stabilityPasses = Math.max(1, parseInt(env.STABILITY_PASSES ?? '3', 10));
```

- Default is 3 if the var is absent.
- Clamp to a minimum of 1 (single pass = current behavior).
- No maximum enforced in code, but document 1–5 as the sensible range.

### 2. Run Pass 1 N times

When `stabilityPasses > 1`:

- Pass 1 run 1 streams to the client as today (no change to streaming behavior).
- Passes 2 through N use `callModel` (non-streaming) and run sequentially after run 1 completes.
- Each run uses the same frozen prompt and model config as run 1.

When `stabilityPasses === 1`, skip all of this — existing code path unchanged.

### 3. Extract principles from each run independently

After all N Pass 1 runs complete, run the existing extraction step against each Pass 1 output. Result: N sets of principle IDs.

### 4. Compute the stability map

For each principle ID that appeared in any run, count how many runs cited it:

```ts
type StabilityMap = Record<string, { hits: number; total: number }>;
```

Example: `{ "ap_3": { hits: 2, total: 3 }, "ta_1": { hits: 3, total: 3 } }`

### 5. Filter for Pass 2

Build the Pass 2 input using only principles where `hits >= Math.ceil(total / 2)` — majority-cited. Pass the full `stabilityMap` along so Pass 2 can optionally note when a cited principle was a borderline (non-unanimous) hit.

### 6. Store in DB

Add two nullable columns to `DbAnalysis` via a new migration:

| Column | Type | Description |
|---|---|---|
| `stability_passes` | INTEGER | How many Pass 1 runs were executed |
| `stability_map` | TEXT | JSON of the `StabilityMap` |

Do not alter any existing columns.

### 7. API response

Include `stabilityMap` and `stabilityPasses` in the JSON response alongside existing pass outputs. No UI changes in this build.

### 8. Token logging

Log total input + output tokens across all Pass 1 runs to the console (visible in `wrangler tail`). Format:

```
[stability] 3 passes | pass1 tokens: 4210 in / 1830 out
```

Do not surface token counts to the client.

---

## Env var configuration

Add to `.dev.vars` for local development:

```
STABILITY_PASSES=3
```

Add `STABILITY_PASSES` as a Cloudflare Secret (or wrangler.toml `[vars]` entry) for production. To revert to single-pass behavior without a code change, set `STABILITY_PASSES=1`.

---

## What NOT to change

- Streaming behavior on the first Pass 1 run
- Pass 2, Pass 3, extraction, or vector steps
- Auth — stability passes are admin-only like all analysis runs
- Any UI, CSS, or token audit — no frontend changes in this build

---

## Verification

Run with `STABILITY_PASSES=3` against one test image. Confirm:

1. `stabilityMap` is present in the response JSON
2. At least one principle shows `hits < 3` (proving variance is real and being caught)
3. Token log appears in `wrangler tail` output
4. A single-pass run (`STABILITY_PASSES=1`) produces identical behavior to today
