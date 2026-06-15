# Grammar of Things — Next Session

Updated 2026-06-15.

---

## Open Items

### /partners page — DONE (2026-06-15)

- New prerendered page at `/partners` — institutional partnership ask, eight sections
- Footer link added ("Institutional Partnership")
- Credibility section on homepage: "Institutional partnership inquiry →" link added after transfer statement
- Deployed to production
- `contact@thegrammarofthings.com` set up via Cloudflare Email Routing → forwards to `alan@alanjust.com`

**Two sections need Alan's review before using the URL in outreach:**
- "What the tool will not claim" — conservative draft; confirm against actual commitments
- "Governance and tribal consultation" — structural draft; replace generics with specific commitments if/when tribal contacts or advisory board design is decided

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

### Item 3: Security Follow-ups — LOW PRIORITY

From the 2026-06-12 security hardening pass. Not urgent for a pitch PoC.

- `corpus.astro` and `compare.astro` — object-grid renders museum metadata (accession/culture labels) via `innerHTML`; lower severity than model output but worth sweeping when convenient
- Accessibility sweep: `aria-pressed` on toggle buttons, radar SVG `<title>`/`<desc>`, soften "Every claim is anchored" and "resolves immediately" copy in credibility section

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
