# Grammar of Things — Next Session

Updated 2026-07-03.

---

## Open Items

### Step B synthesis restructured to structured per-principle classification — DONE (2026-07-03, commit `0ac11c8`)

Was tagged 🔴 priority after reviewing the grounding-tier tagging brief for `artifact-principles.json` surfaced that two runtime signals meant to indicate "did independent model runs corroborate this claim" actually disagreed with each other: `fingerprint_stability_map` (mechanical per-run Haiku hit-count, no cross-run comparison) vs. the old freeform Stable/Thin/Contradicted synthesis prose (a genuine cross-run claim-convergence read, but incomplete — no "checked and found nothing" state). Confirmed on `A326247-0-25`: Investment Gradient looked corroborated by hit-count (8/9) and completely uncorroborated by synthesis prose (zero mentions) — the two signals gave opposite answers for the same claim.

**Fix:** Step B (`ingest.ts`) now asks the synthesis model for a structured JSON array (`{principleId, tier: stable|thin|contradicted, evidence}`) instead of freeform bullets it chooses itself. Any of the 27 principles the model doesn't return defaults to `unclassified` in code — a real, distinguishable state, not silent absence. The human-readable Stable/Thin/Contradicted markdown (`fingerprint_pass1_synthesized`) is now generated *from* this structured object via `renderSynthesisMarkdown()`, not the other way around. New `fingerprint_synthesis_classification` column (migration `0019`) stores the structured data for any future scoring/caveat logic to read directly and unambiguously — resolving the reason the interim "read synthesis Stable-section only, never the hit-count" rule was needed in the first place.

New export `VECTOR_KEY_NAMES` in `principles.ts` (id → name, derived from the same `artifact-principles.json`/`hg-principles.json` sources as everything else in that file — no hardcoded duplicate list).

**Verified live** (2026-07-03, object 35, `A326274-0`): all 27 principles present in the stored classification (12 stable, 3 thin, 0 contradicted, 12 unclassified), evidence text specific and provider-attributed (e.g. `[openai 3/3; absent claude, gemini]`), generated markdown reads naturally as Pass 2 evidence — same quality bar as the old freeform version, now with guaranteed structure behind it.

**Note:** an accidental duplicate (object 34) was created testing against the not-yet-deployed code before this was live — deleted (D1 + R2). Object 33 (pre-restructure, old-style synthesis) was kept as a before/after reference alongside object 35 (post-restructure), per Alan's call.

### Grounding-tier tagging for `artifact-principles.json` — DONE (2026-07-02, commit `8ec1dd0`)

Added `grounding: {observationTier, inferenceTier, note}` to all 15 artifact principles, distinguishing real VLM visual grounding from plausible-sounding confabulation. Purely additive — `description`/`howToApply`/`applicableTo` untouched, `hg-principles.json` untouched, nothing in `principles.ts` reads the new field yet (prep work for the eval harness, not wired into scoring).

Two adjustments from the reviewed brief, both confirmed with Alan before implementing:
- **Sequence Inference** downgraded from the brief's `grounded` to `partial` — the Overlap/Occlusion (hg-principles.json id 13, Tier A, V2/V3) analogy is object-level scene depth ordering, not confirmed to transfer to fine surface-mark superposition at a much smaller spatial scale.
- **Symmetry as Evidence** and **Proportion as Encoding** both tagged `speculative` for `inferenceTier` (Alan's call) — the brief proposed a split ("verifiable for detection, speculative for cause") the flat schema can't represent; `speculative` was chosen as the conservative default since these principles are invoked in Pass 1 to support the causal/functional claim, the riskier part, with the note explaining the detection itself is independently checkable via geometry.
- **Investment Gradient**'s note cites the `A326247-0-25` empirical finding directly (see the corroboration-signal-gap item above).

Deployed to production same day.

### Multi-provider Pass 1 single-image bug — FIXED AND VERIFIED (2026-07-02, commit `3ca6029`)

Gemini and OpenAI's Pass 1 stability runs only ever received `normalized[0]` (the first uploaded image), no matter how many images were uploaded or how many stability passes ran. Claude's native path already used every image via `imageBlocks = normalized.flatMap(...)`. Confirmed against object 30 (`A326247-0`, two images — interior + exterior): Claude's Pass 1 runs described a matching interior/exterior crack across both views; Gemini and OpenAI's stored runs explicitly self-reported receiving only one image (e.g. "As only one image was provided for examination…").

- `model-router.ts`: `NeutralRequest.image` (singular) → `images: Array<{mediaType, data}>`; all three provider adapters (`callAnthropic`, `callGemini`, `callOpenAI`) now loop over every image instead of reading one.
- `ingest.ts`: `neutralPass1Req.images` now built from all of `normalized`, matching Claude's native `imageBlocks` path.
- Added `images_sent: number` to each `labeledRuns` entry and to the stored `fingerprint_stability_runs` JSON, taken from the actual request payload rather than inferred from model self-reports — makes a future regression of this kind diagnosable from data instead of re-reading transcripts.
- Deployed to production same day.

**Corpus data-quality flag — decision, no schema change:** every multi-image object fingerprinted before this fix has the same asymmetry baked into its stored `fingerprint_pass1_synthesized` — Claude systematically saw more than Gemini/OpenAI, so "thin [claude only]" tags on those objects may reflect that information gap rather than a genuine cross-model perceptual difference. Chose a **timestamp cutoff over a new `pre_multiimage_fix` column**: compare an object's `fingerprinted_at` against this fix's deploy time (2026-07-02) to know if it predates the fix — zero migration cost. Do not silently re-run old multi-image objects and treat the new run as comparable to the old one without noting this gap.

**Verification (2026-07-02):** re-ran ingest against production using object 30's original two images (interior + exterior R2 keys). Created object id 31, initially left in place as a before/after reference, **later deleted (2026-07-02)** — both the DB row (via `DELETE /api/objects/31`) and its four R2 keys (originals + analysis copies) removed. All 9 stability runs showed `images_sent: 2` before deletion. Gemini reported "Image 1" / "Image 2" with a "Cross-View Observations" section tracing the same fracture from interior to exterior; OpenAI reported "View 1" / "View 2" with a "Features only visible, or reading differently, by view" section. Neither self-reported "only one image provided." Fix confirmed working end-to-end, not just at the type level.

**Second verification (2026-07-02):** also re-ran ingest on object 22 (`A326274-0`, fingerprinted 2026-06-25, predates the fix) using its stored original images. First attempt (images only, no `doc_raw`) created object **id 32** with a correct fingerprint but null `catalog_number`/`accession_number`/`attribution_culture`/etc. — Track B (`ingest.ts` ~line 435) only populates those fields when `doc_raw` is non-empty in the request, and that first request didn't include it. Deleted object 32 (DB + R2) and re-ran with object 22's stored `doc_raw` included this time, producing object **id 33** with full metadata (`A326274-0` / `070367` / Mimbres / Smithsonian) matching object 22, plus the corrected fix. All 9 runs show `images_sent: 2`. Object 22 itself remains untouched throughout — `ingest.ts` has no in-place update path, only insert.

### Hidden Grammar of Art — cross-model stability synthesis — DONE (2026-06-25)

Ported GoT stability synthesis to HGA. Both projects now run 9-run cross-model Pass 1 (Claude ×3, Gemini ×3, OpenAI ×3) with two independent steps:

- **Step A — Vector scoring:** all 9 runs scored by Haiku → hit map → `stabilityNote` preamble → stored `stabilityMap`
- **Step B — Synthesis:** Claude Sonnet reads all 9 labeled observations → Stable / Thin / Contradicted classification → `pass1Synthesized` → stored on `artworks.fingerprint_pass1_synthesized` for fast-path reuse

HGA architectural difference from GoT: stability runs at **analysis time** (`analyze.ts`), not ingest time. Synthesis is written back to the artwork row after first run so future analyses use the stored synthesis.

`fingerprintVector` is derived from Run 1 (Claude) scores only — intentional for now, but worth revisiting when building gallery compare/contrast features.

Art lover prompt voice also tightened (commit `00cb0b0`) — explicit Ira Glass-style instruction added: conversational, build-then-land, no lecture-hall register.

**Verification query:**
```
npx wrangler d1 execute hidden-grammar-of-art --remote --command "SELECT id, fingerprint_pass1_synthesized IS NOT NULL as has_synthesis FROM artworks ORDER BY id DESC LIMIT 5"
```

---

### /partners page — DONE (2026-06-15)

- New prerendered page at `/partners` — institutional partnership ask, eight sections
- Footer link added ("Institutional Partnership")
- Credibility section on homepage: "Institutional partnership inquiry →" link added after transfer statement
- Deployed to production
- `contact@thegrammarofthings.com` set up via Cloudflare Email Routing → forwards to `alan@alanjust.com`

**Both flagged sections reviewed and resolved 2026-06-25:**
- "What the tool will not claim" — confirmed accurate; no changes needed
- "Governance and tribal consultation" — softened to design intentions (commit `6377806`); advisory board and tribal consultation language now describes what the tool is built to support, not commitments made; partner/steward determines actual structure

---

### Item 1: Comment / Annotation System — DONE (2026-06-15)

- **1a. Object notes** — `notes TEXT` on `objects`, PATCH `/api/objects/[id]`, admin textarea in `/corpus/[id]`
- **1b. Analysis notes** — `notes TEXT` on `analyses`, PATCH `/api/analysis/[id]`, admin textarea in `/corpus/[id]/analysis/[analysisId]`
- **1c. Feedback queue** — `feedback_queue` table, public form at `/feedback` (honeypot), admin resolve/dismiss queue on same page, footer link added
- Migrations 0011–0013 applied to remote D1

### Per-analysis delete — DONE (2026-06-15)

- DELETE `/api/analysis/[id]` (admin-only)
- Delete button on each analysis card in `/corpus/[id]` — confirm dialog, removes row from DOM on success
- Intended workflow: re-run an analysis to get stability-enriched Pass 2, then delete the old one

---

### Item 2: Eval Harness — linters.py — DEFERRED

`docs/dieter_rams_eval.zip` contains `linters.py` — deterministic quality checks (machinery leaks, slop vocab, hedging patterns, length caps, section duplication).

**Decision:** Run as a monitor only for now. Do NOT fold into the eval score.

**How to use it today (no integration needed):**
```
python linters.py path/to/analysis.md
```
Point it at real outputs or stored analyses — findings become visible without affecting the 78.8 baseline or creating optimization pressure.

**When ready to integrate, ordered by safety:**
1. T0 machinery-leak penalty (5 pts) — safe, unambiguous, decision-relevant
2. T3 section-duplication penalty (3 pts) — real observed bug, but calibrate the 0.30 Jaccard threshold first (literature standard is 0.80; 0.30 catches rephrasing not just duplication)
3. T1a slop vocabulary — check if "intricate"/"meticulous" fire on legitimate artifact prose before adding penalty
4. T1b hedging patterns — leave as info-only log; these patterns conflict with calibrated-uncertainty epistemics; an optimizer squeezed between the hedge linter and the judge's register-separation criterion will flatten hedges and produce overclaiming

**Before integrating:** fix stale references in `docs/clyde-brief-linters.md` — judge is Sonnet (not Haiku), baseline is 78.8 (not 76.2). Run one full eval batch, inspect false-positive rate at each tier.

---

### Item 3: Security Follow-ups — PARTIALLY DONE (2026-06-25)

- `corpus.astro` and `compare.astro` innerHTML XSS — **FIXED** (commit `4dc0da0`). All DB-sourced values (catalog_number, attribution_culture, attribution_confidence, fingerprint_model, source_institution) now HTML-escaped via `esc()` helper before insertion into innerHTML template literals. Deployed to production.
- Dependabot enabled on all three repos (GoT, HGA, VLM Lab) — **DONE**
- CodeQL workflow added to all three repos — runs on GoT (public); skips cleanly on HGA/VLM Lab (private, requires GitHub Advanced Security to upload results)
- Branch protection on GoT main (no force-push, no deletion) — **DONE**; HGA/VLM Lab require GitHub Pro for private repos

**Still open:**
- Accessibility sweep: `aria-pressed` on toggle buttons, radar SVG `<title>`/`<desc>`, soften "Every claim is anchored" and "resolves immediately" copy in credibility section

---

### CLAUDE.md decision log — DONE (2026-06-30)

Added `## Decision Log` section to CLAUDE.md documenting settled architectural choices:
- Why D1 (relational model + FTS5 + vector storage; KV too flat; DOs are coordination actors)
- Why centralized markdown renderer (external code review flagged XSS risk from dispersed `marked.parse()` calls; commit `3bc2684`)
- Why three-layer auth (SSR vs. prerendered pages need different mechanisms — not redundant; commit `3bc2684`)

Task 1 from the brief (numbered Invariants section) was consciously rejected — duplication risk, CLAUDE.md is short enough. Brief updated to record this decision; won't re-run.

---

### Keyword search — DONE (2026-06-29)

- `/search` page with live search (300ms debounce), shareable `?q=` URLs, nav link added
- `/api/search` endpoint: FTS5 MATCH with porter stemmer + prefix matching (`term*`)
- Migration `0017_search.sql`: `objects_fts` FTS5 virtual table, rowid = object.id, backfilled 17 objects
- Fields indexed: `catalog_number`, `accession_number`, `attribution_culture`, `source_institution`, `fingerprint_pass1_text`, `fingerprint_pass1_synthesized`
- FTS kept in sync from both ingest paths (`mcp-ingest.ts`, `ingest.ts`)
- Excerpts use FTS5 `snippet()` with `[[M]]`/`[[/M]]` markers → client escapes + replaces with `<mark>`

---

### PDF download — DONE (2026-06-28)

`↓ PDF` button on every analysis page (commit `db4f2cb`). Calls `window.print()` with a `@media print` stylesheet that hides nav, footer, TOC rail, notes section, and radar chart. Preserves: object image, all pass text, fingerprint bar grid (scores + principle names), provenance flags, contradiction flags. Two-button top bar: `↓ .md` and `↓ PDF`.

---

## Nav

- **Review** and **The Look** hidden from nav (pages still live at `/review`, `/look` — TBD whether to resurface)

## Documents current as of 2026-06-15

- **Homepage** — HowItWorks, Roadmap, Proof sections updated to reflect provenance/contradiction detection and reference corpus infrastructure
- **one-pager-for-ian.md** — Panel 3/4/5 updated; provenance/contradiction capabilities added; object 16 replica validation result added; reference corpus infrastructure noted
- **ENGINEERING_ROADMAP.md** — data model, migration numbers, "what is built" list all current
- **Forensic partner** — corrected throughout to U.S. Fish and Wildlife Service (was incorrectly "NFS")

---

## Architecture Reference

See `docs/GRAMMAR_OF_THINGS_BUILD_BRIEF.md` for full system overview.

**Deploy:** `npm run deploy` from this directory — Workers Assets model, NOT Pages git connection.

**Live URL:** https://thegrammarofthings.com (custom domain) · https://grammar-of-things.alan-66a.workers.dev

**Env access:** `import { env } from 'cloudflare:workers'` — NOT `locals.runtime.env`

**Auth boundary:** Read-only public. All mutations require admin. ADMIN_TOKEN is a Cloudflare Secret (also in gitignored `.dev.vars`). mcp-ingest requires `Authorization: Bearer <ADMIN_TOKEN>`.

**Review page** is admin-gated to view (not just to act) — NAGPRA-sensitive records in queue. Reversible if needed.

**Feedback page** (`/feedback`) is public-read. Public can submit; admin queue on same page below the form.
