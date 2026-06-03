# Pattern—Catalog-First Ingestion (Evidence / Claim Split)

**Status:** Reusable architecture pattern. Project-agnostic. Applies to any analysis project in this repo and in future projects (Hidden Grammar artifact tool, four-domain Art Lab page, CPG, decorative arts, craft, pattern-design, and others to come).

**One line:** Separate the evidence from the claim. Score the artifact blind, store its claims apart, compare them later.

This document describes the idea in the abstract. Individual projects reference it; they do not restate it. When the pattern improves, it improves here.

---

## The problem it solves

Every analysis project has two kinds of input that get dangerously mixed:

- **The artifact**—the primary source. An image, a package, an object, a design. Without it, nothing works.
- **The claims about it**—provenance, attribution, brand positioning, category, marketing copy, institutional metadata. These are assertions, not evidence.

When the claims contaminate the reading of the artifact, the analysis becomes circular: the tool "discovers" what the paperwork already told it. The output looks confident and proves nothing.

## The pattern—three stacked ideas

### 1. Separate the evidence from the claim (the blind principle)

Score the artifact from the artifact alone. The claims must not be present, in any form, while the artifact is being scored. This produces a claim-agnostic fingerprint—a reading that owes nothing to what the artifact is supposed to be.

The payoff: a fingerprint computed in deliberate ignorance of the claim can then be *compared against* the claim. A large gap is real evidence—a research flag, a mismatch, an anomaly—because the two were produced independently. This is the instrument. It only works if the separation is structural, enforced by the pipeline, not by remembering to do it.

Examples of the same move across domains:
- **Archaeology:** visual fingerprint vs. provenance attribution → misattribution flag.
- **CPG:** a package's blind visual grammar vs. the brand's stated positioning → does the design actually do what the brand claims?
- **Decorative arts / craft:** object's formal reading vs. its catalog attribution → period or maker anomalies.

### 2. Catalog first, analyze later

Intake is cheap and runs at upload: store the artifact, compute its blind fingerprint, store its claims separately. Stop there. Full analysis (deeper interpretive passes, custom prompts) is a separate, on-demand step run later against a cataloged object.

Why: cataloging at low cost is how a corpus accrues. You build the body of fingerprints first; you spend real effort on analysis selectively. The corpus is the durable asset.

### 3. Three-layer documentation model

The claims arrive in wildly varying formats—every institution, retailer, or brand uses its own field names and field sets. Do not model this as fixed database columns. Store it as JSON inside the database (Postgres holds JSON natively as JSONB; SQLite handles JSON too—so this forces no particular engine). Three layers per artifact:

1. **Raw, verbatim, never altered.** Exactly what was pasted or imported. Preserved for integrity and as the quarantined claim that must never reach the blind scoring step.
2. **Structured JSON.** AI splits the raw record into key/value pairs as the source presented them. Schema-less, so each artifact carries whatever fields its source had. Cheap extraction (Haiku-class).
3. **Canonical layer.** AI maps the source's idiosyncratic fields onto a shared internal vocabulary, so artifacts from different sources become comparable and the claim becomes queryable against the fingerprint. Map conservatively; flag uncertain mappings rather than guessing.

Promote a small set of stable identifiers to first-class columns (persistent ID, catalog/SKU number, the canonical claim being tested). Everything else stays in JSON.

## Artifact preservation—store the original, analyze a normalized copy

The artifact is the prime source, so preserve it faithfully: store the upload at **original, full resolution, uncompressed, untouched.** Run analysis on a separate **normalized derivative**, never on the original. Two reasons: future models read more than today's can, so the corpus can be re-scored without re-sourcing; and a single consistent analysis spec keeps fingerprints comparable across the corpus (inconsistent input resolution adds noise to cross-object comparison).

For image artifacts specifically: current vision models cap what they perceive (Claude is roughly 1568px on the long edge, ~1.15MP—above that the API scales down internally and extra pixels are never seen). So normalize the analysis copy to that ceiling at high quality, the same spec for every object. Feeding larger originals to the model does not improve the reading; preserving them in the archive does.

## The data model the pattern implies

- **One Object → one canonical blind fingerprint → many analyses.** Not one row per analysis.
- Store the fingerprint as an ordered numeric vector, not as separate flat columns, so similarity and cross-object queries are possible later without a rewrite.
- Store claims as raw + JSON + promoted canonical fields (above).
- An artifact with no claims is still validly cataloged on its fingerprint alone.

## Two-track ingestion (how it runs at upload)

Two independent tracks that never touch each other:

- **Track A—Evidence:** store the artifact, run the blind fingerprint from the artifact only.
- **Track B—Claim:** store the raw record verbatim, AI-split to JSON, AI-map to canonical fields.

Keeping the tracks separate in the pipeline is what makes the blindness structural.

## What stays out until later (build the seam, not the contents)

The cross-object query layer—similarity search, clustering, outlier detection across the fingerprint corpus—is a later, possibly grant-funded phase for any project that adopts this. Adopt the schema now so it is supported later; do not build the querying now.

---

## How projects adopt this

A project references this pattern and notes only its domain-specific specializations: what the artifact is, what the claim is, and what comparison constitutes a meaningful flag in that domain. It does not re-document the pattern itself.

Current and planned adopters:
- **The Grammar of Things** (archaeology) — the reference implementation. See `GRAMMAR_OF_THINGS_BUILD_BRIEF.md`, Part C.
- **Four-domain Art Lab page** — candidate for retrofit.
- **CPG** and other corpus domains — candidates as they are built.
