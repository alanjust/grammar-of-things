# Claude Code kickoff — build "The Look" (Phase 1)

Paste this into Claude Code to start the build. It points at the three planning docs and sets the order, the guardrails, and where to stop.

---

Build Phase 1 of the visitor experience called "The Look" (route `/look`). This is a new audience-facing surface on the existing Grammar of Things site. Read these three docs in `docs/` first, in this order:

1. `SLEUTH_EXPERIENCE_BUILD_BRIEF.md` — the authoritative spec. Build to Part A (Phase 1) only.
2. `the-look-bowl-copy.md` — the finished visitor copy for the first object (Mimbres bowl A326247). This is the card content; use it verbatim.
3. `the-look-now-you-try.md` — the finished copy for the closing "Now you try" object (Met pitcher, `met-833901`).

**Goal:** a first-time visitor with no background looks at one object and discovers things in it with their own eyes — a guided, staged act of noticing that ends with them reading a second object unaided.

**Build, in order:**
1. The `/look` route and the card sequencer: Stage 0 → ordered reveal cards → Stage Final ("Now you try"). Viewer-paced; nothing reveals before the "try" beat; easy to go back.
2. The reusable image-region overlay (spotlight + dim, or box + zoom), driven by region data in the card content file.
3. The Phase 1 content file: load the bowl cards and the pitcher reveals from the two copy docs. Wording is final — do not rewrite it. Structure each card as: tier, invite, reveal, why, region.
4. Translate the epistemic tiers to the visitor-facing labels in the copy docs. Never show raw `[OBS]`/`[INTERP]`/`[CONS]`/`[THEORY]` codes to the visitor.

**Isolation & positioning (non-negotiable — this is the priority constraint):**
- Build the entire feature as **new files only**, contained under a single new route folder (`src/pages/look/`) plus, if needed, a dedicated components folder and one content file for this feature. The whole experience must be self-contained and removable — deleting its folder(s) returns the site to its exact current behavior.
- **Do not edit any existing page, component, route, or the global stylesheet.** Specifically do not modify `SiteNav.astro`, `SiteFooter.astro`, `index.astro`, or any existing `src/pages/*` route.
- **Do not add a menu/nav link in Phase 1.** Dark-launch: the experience is reachable by direct URL (`/look`) only. Adding it to the nav is a separate, later, one-line step the owner will decide on after testing.
- Reuse existing style tokens/variables **read-only**. Scope all new CSS to this feature's own components so nothing leaks onto existing pages. Do not introduce a new visual identity.

**Guardrails (from the brief — hold to these):**
- Do not modify the analysis engine, the blind fingerprint, the ingestion pipeline, the documentation quarantine, or the comparison/misattribution path. This experience is read-only over analysis that already exists.
- Phase 1 uses **authored** region coordinates (measure them on the actual images and put them in the content file). Do not block on automated region detection — that's Phase 2.
- Keep the experience name in one config value so it can be renamed in one edit.
- Reuse existing visual tokens/components where they fit. This is a new surface, not a new visual identity.
- The pitcher is public domain via the Met; display the credit line given in the copy doc.

**Acceptance check (then stop for review):** a person who knows nothing can complete `/look` on the bowl, never sees an unexplained code or jargon term, experiences each characteristic as invite → try → reveal-on-image → name, and reaches "Now you try" with the pitcher. Stop there. Do not start Phase 2 (the transform that generates cards from analysis) until the Phase 1 experience has been reviewed with real first-time viewers.

Flag anything in the docs that's ambiguous or that conflicts with the existing codebase before building it.
