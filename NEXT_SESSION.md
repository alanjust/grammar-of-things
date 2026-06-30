# Grammar of Things — Next Session

Updated 2026-06-25 (evening).

---

## Open Items

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
