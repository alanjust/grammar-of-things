# Grammar of Things — Next Session

Pitch PoC state as of 2026-06-12. Deferred items below are real but not blocking a first demo.

---

## Open Items

### Item 1: Comment / Annotation System — NOT STARTED

Three distinct types, different audiences and write paths:

**1a. Object annotations** (admin-only)
Notes attached to a specific artifact — provenance hunches, cross-source discrepancies, things to investigate. Private. Never rendered publicly.
- Add `object_notes` table: `id`, `object_id` (FK), `body TEXT`, `created_at`
- OR add `notes TEXT` column on `objects` if a single running note is enough
- Render in `/corpus/[id]` behind `isAdmin` gate (already in place)

**1b. Analysis annotations** (admin-only)
Notes on a specific analysis run — "Pass 2 missed coiling construction, re-run after library update." Private. Never rendered publicly.
- Add `notes TEXT` to `analyses` table via migration
- Render on `/corpus/[id]/analysis/[analysisId]` behind `isAdmin` gate

**1c. Site feedback queue** (public-write → admin-review)
Visitors can submit: suggested additions, confusion, problems, questions. This is a deliberate exception to the "read-only public" auth boundary — public CAN write, but only you see the submissions. Same queue pattern as `review_queue`.
- Add `feedback_queue` table: `id`, `body TEXT`, `contact TEXT` (optional email), `page TEXT` (where they were), `created_at`, `status` (open/resolved/dismissed)
- Public POST endpoint (no auth required, but rate-limit or honeypot field to deter spam)
- Admin-only view: surface in `/review` or its own `/feedback` page
- Spam risk is low (niche scholarly audience) but a honeypot field costs nothing

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

### Item 3: Security Follow-ups — LOW PRIORITY

From the 2026-06-12 security hardening pass. Not urgent for a pitch PoC.

- `corpus.astro` and `compare.astro` — object-grid renders museum metadata (accession/culture labels) via `innerHTML`; lower severity than model output but worth sweeping when convenient
- Accessibility sweep: `aria-pressed` on toggle buttons, radar SVG `<title>`/`<desc>`, soften "Every claim is anchored" and "resolves immediately" copy in credibility section

---

## Architecture Reference

See `docs/GRAMMAR_OF_THINGS_BUILD_BRIEF.md` for full system overview.

**Deploy:** `npm run deploy` from this directory — Workers Assets model, NOT Pages git connection.

**Live URL:** https://grammar-of-things.alan-66a.workers.dev

**Env access:** `import { env } from 'cloudflare:workers'` — NOT `locals.runtime.env`

**Auth boundary:** Read-only public. All mutations require admin. ADMIN_TOKEN is a Cloudflare Secret (also in gitignored `.dev.vars`). mcp-ingest requires `Authorization: Bearer <ADMIN_TOKEN>`.

**Review page** is admin-gated to view (not just to act) — NAGPRA-sensitive records in queue. Reversible if needed.
