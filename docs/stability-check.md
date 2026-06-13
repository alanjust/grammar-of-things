# Multi-Pass Stability Check for Pass 1

*Grammar of Things — June 2026*

---

## The problem it solves

When the site analyzes an artifact image, the first thing it does is ask a language model to look at the image and report what it observes: construction traces, material boundaries, color zones, wear patterns, and so on. This step — Pass 1 — is the perceptual foundation that every subsequent analysis is built on.

The problem is that language models are stochastic. Run the same prompt against the same image three times and you get three outputs that overlap but aren't identical. On one run the model might notice and name *Symmetry as Evidence* as an operative principle. On another run it might notice the same thing but frame it differently, or focus elsewhere and not name it at all. This variance doesn't mean the model is unreliable — it means that a single observation pass captures a sample of what's observable, not a census.

When Pass 2 (the full analysis) is built entirely on what Pass 1 noticed, analysis quality is tied to the luck of that single sample. A principle that's consistently observable in an artifact might get dropped because it happened to fall outside the first run's attention. A borderline observation that crept in on one run might do outsized work in the analysis.

---

## What the stability check does

Before building the Pass 2 analysis, the system now runs Pass 1 three times instead of once — all three runs happen concurrently, with run 1 streaming to the screen as it always has and runs 2 and 3 running quietly in parallel.

Once all three runs complete, the system scores each run: for each of the 27 perceptual principles in the system's vocabulary, it asks how many runs noticed it. A principle that shows up in 2 or 3 out of 3 runs is **stable** — the model consistently sees it in this artifact. A principle that shows up in only 1 of 3 runs is **borderline** — it's a real observation but a fragile one.

Pass 2 receives this as a brief note appended to its context:

```
PERCEPTUAL STABILITY NOTE (3 independent Pass 1 runs):
High-confidence (majority of runs): ap_1, ap_3, ap_8, ta_1, ta_4
Lower-confidence (minority of runs, treat with caution): ap_7, ta_28
```

The high-confidence list tells Pass 2 what the artifact reliably shows. The lower-confidence list flags borderline observations that Pass 2 can acknowledge but should hold more lightly. The 27-principle vocabulary hasn't changed — what's changed is that Pass 2 now knows which observations are load-bearing and which are opportunistic.

---

## How the system vocabulary works

The 27 principles fall into two groups:

**15 artifact-domain principles** (prefixed `ap_`) are specific to physical object analysis: things like *Production Trace Reading* (reading surface marks as evidence of how something was made), *Wear Differential* (noticing where a surface is more abraded than surrounding areas), *Material Boundary Attention* (noticing where one material ends and another begins), *Completion State* (noticing whether an object is finished or interrupted), and so on. These are the perceptual habits of a trained artifact observer.

**12 universal visual principles** (prefixed `ta_`, from "Tier A") are principles that apply to any visual observation: *Edge Detection*, *Figure-Ground Relationships*, *Color Opponent Channels*, *Closure/Negative Space*, and others drawn from visual perception research. The system uses a curated subset of these — the ones relevant to artifact observation, excluding principles that only make sense for fine art (like Atmospheric Perspective or Linear Perspective).

These 27 principles make up the system's perceptual fingerprint vocabulary. The stability check's output maps directly onto this vocabulary. A principle ID like `ap_8` means *Symmetry as Evidence*; `ta_4` means *Figure-Ground Relationships*.

---

## How it functions in the website

From the user's perspective, the analysis screen looks and behaves identically to before. Pass 1 streams as the first output. Pass 2 follows. The stability check runs between them, invisibly, in a few seconds.

The JSON response from the API now includes two additional fields:

- **`stabilityPasses`** — how many Pass 1 runs were executed (3 by default)
- **`stabilityMap`** — the full hit-rate data, structured as a JSON object:

```json
{
  "ap_1": { "hits": 3, "total": 3 },
  "ap_3": { "hits": 2, "total": 3 },
  "ap_7": { "hits": 1, "total": 3 },
  "ta_4": { "hits": 3, "total": 3 }
}
```

Only principles with at least one hit appear in the map. A principle absent from the map was not observed in any run.

The database schema has two corresponding new columns on the analyses table (`stability_passes`, `stability_map`) for storage and future querying. The migration for these columns is in `src/db/migrations/0007_stability.sql`.

---

## How to configure it

The number of passes is controlled by a single environment variable: `STABILITY_PASSES`.

| Value | Effect |
|---|---|
| `3` (default) | Three passes — the full stability check |
| `1` | Single pass — functionally identical to the pre-stability behavior |
| `2` | Minimal stability check — majority threshold is 2/2, so any principle seen once passes |
| `5` | Maximum recommended — diminishing returns beyond this |

**Locally:** Set in `.dev.vars`. The file already has `STABILITY_PASSES=3`.

**Production:** Set in `wrangler.jsonc` under `"vars"`. Currently `"3"`. To revert to single-pass without touching code or deploying, override `STABILITY_PASSES` to `"1"` directly in the Cloudflare Workers dashboard under Environment Variables.

---

## What the token cost looks like

Each additional Pass 1 run costs roughly the same tokens as the first one. For a typical artifact image, Pass 1 runs around 1,400 input tokens and 600 output tokens. Three passes costs roughly 3× that for Pass 1.

The stability scoring (running the 27-principle vector scoring prompt against each of the three Pass 1 outputs) adds 3 additional cheap Haiku calls, around 500 tokens each.

Total addition over single-pass: roughly 2× Pass 1 cost + 3 small scoring calls. For a 3-pass run on a typical artifact, this is on the order of a few thousand additional tokens — noticeable but not significant relative to the full analysis cost.

The console log in Cloudflare's `wrangler tail` output reports exact token counts for every run:

```
[stability] 3 passes | pass1 tokens: 4210 in / 1830 out
```

---

## Why this matters for the analysis

The real payoff is reliability at the interpretive layer, not at the observation layer.

Pass 1 is formally restricted to observation — it's not supposed to interpret. But what it chooses to notice determines what Pass 2 can work with. An analysis that misses *Material Boundary Attention* as a stable operative principle in an artifact might underweight what the slip application tells us about production method. An analysis that includes a borderline observation as though it were robust might over-interpret a feature that the model only noticed once out of three careful looks.

The stability check doesn't make Pass 1 smarter — it makes the inventory more honest. Pass 2 now knows which observations are anchored in the artifact and which are marginal. That's the difference between analysis built on solid ground and analysis built on one model's good day.

For the Southwest archaeological corpus specifically, where the difference between a consistent formal observation (this vessel shows strong bilateral symmetry in its interior design field) and a marginal one (there might be a slight asymmetry in the upper left quadrant) can determine whether a production quality claim is credible, this distinction matters.

---

## The technical pattern

This is an adaptation of the "Concord" stability approach (Mollick et al.) for single-image analysis. The core idea: when a model's output is used as the input to a downstream task, and that output is stochastic, running the upstream step multiple times and filtering for consensus produces a more reliable downstream result than a single run.

The concrete implementation:
1. Pass 1 runs N times concurrently (stream + N-1 callModel calls)
2. The 27-principle vector scoring prompt runs against each output in parallel
3. Per-principle hit counts are computed across all N runs
4. The stability note passed to Pass 2 uses a majority threshold: `Math.ceil(N / 2)` hits required for high-confidence status

The majority threshold means: with 3 passes, a principle must appear in at least 2 runs to be "high-confidence." With 5 passes, it must appear in at least 3. Setting `STABILITY_PASSES=1` skips the entire check — the stability block appended to Pass 2 is an empty string, which means Pass 2 sees exactly what it always saw.
