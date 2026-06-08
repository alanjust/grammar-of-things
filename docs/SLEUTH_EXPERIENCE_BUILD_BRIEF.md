# The Grammar of Things — "The Look" Experience Build Brief v1

Planning document. Written for handoff to Claude Code. Nothing here is a code change made by the planning agent — these are instructions to implement.

**Working name:** "The Look" (route `/look`). Placeholder — Alan will rename. Wherever the name appears, keep it in one config/content value so renaming is a single edit, not a find-and-replace.

**Context.** The existing system (see `GRAMMAR_OF_THINGS_BUILD_BRIEF.md` and `pattern-catalog-first-ingestion.md`) reads an object blind, scores 27 perceptual principles, and produces a Pass 2 analysis with epistemic labels (`[OBS]`, `[INTERP]`, `[CONS]`, `[THEORY]`) and anchored claims. That work is the engine. **This brief does not touch the analysis engine, the blind fingerprint, the ingestion pipeline, or the comparison/misattribution path.** It builds a new *audience-facing experience* that consumes analysis that already exists and re-presents it as a guided, interactive act of noticing.

**The goal in one sentence.** A first-time visitor with no background looks at one ordinary archaeological object and, in a few minutes, discovers things in it with their own eyes that they couldn't see when they started — and walks away wanting to look closely at everything.

This is the Sesame Street principle applied to archaeology: intellectually serious content delivered as delight. Sense before language. The viewer does the seeing; the tool only points.

---

## The four design rules (these govern every decision below)

1. **Stage the reveal — never dump.** The experience never lists characteristics. For each one it invites the look, gives the viewer a beat to try, *then* reveals it on the image and names it in plain language. The discovery must feel like theirs.
2. **Point at the pixels.** Every reveal is anchored to a location on the object — a highlight, spotlight, zoom, or dim-the-rest overlay. The naming is text; the *evidence* is visual and located. This is both the teaching mechanism and the honesty mechanism (the receipts).
3. **Honesty is the curriculum.** The experience visibly distinguishes what can be *seen* from what is *inferred* from what is a *contested guess*. As cards progress from observation to interpretation to theory, the interface changes register so the viewer learns the difference between seeing and guessing. Never show raw label codes to the visitor — translate them (see Voice rules).
4. **Delight before intellect.** Warm, playful, plainspoken. Wonder, not lecture. Short. The visitor drives the pace — nothing auto-advances past a reveal.

---

## The experience, step by step

A single-object guided sequence. One object per session. Built as an ordered set of "reveal cards" plus a few framing stages around them.

**Stage 0 — The bare object.**
Just the object, large, beautiful, centered. No labels, no analysis, no chrome. One quiet invitation: *"Before we say anything — look. What do you notice?"* A single control to begin (e.g. "Show me"). Give the eye a few unhurried seconds with the object before any language arrives. (Sontag: experience before interpretation.)

**Stages 1…n — The reveal cards (the heart).**
Each card runs the same four-beat micro-loop:

1. **Invite.** A plain-language prompt that aims the viewer's attention without giving the answer. e.g. *"Look at the dark shapes. Now look at the light shapes between them. Which one is the picture?"*
2. **Try.** A beat for the viewer to look (and, where natural, to tap/guess/answer). Nothing reveals until they act. This is what converts a reader into a looker.
3. **Reveal.** The image animates the answer — highlight/spotlight/zoom on the exact region — and the characteristic is named in plain words. e.g. *"Both. The potter built it so the empty space is also a shape. That's figure-ground reversal."*
4. **Why it's wonderful (one line).** A single sentence on why it matters or why it's hard to do. Then the viewer chooses to go on.

Cards are **sequenced to escalate**: open with the most visually obvious, highest-confidence observations (easy wins build the viewer's confidence as a looker), then move toward interpretation, then toward the genuinely uncertain. The epistemic register shifts visibly across this arc (Voice rules below).

**Stage Final — "Now you try."**
Present a *new* object (or a fresh region of the same one) with no guidance and a single prompt: *"Your turn. Find something."* Offer a light "reveal what I might have missed" afterward. This is the conversion moment — the viewer discovers they can now see something unaided. That realization is the product. Capture it in copy: name what just happened — *"You just read an object. That's what archaeologists do."*

**Optional running element — the Notebook.**
A small panel that fills in with each thing the viewer has found, so discovery visibly accumulates. Cheap, high-payoff for the "I'm becoming a sleuth" feeling. If it complicates Phase 1, defer to Phase 2.

---

## Part A — Phase 1: build the experience on one curated object

Goal: nail the interaction on a single hand-authored object before automating anything. The object is the **Mimbres bowl A326247** (already in the system, images in `public/images/`).

- Build the `/look` route and the card sequencer: Stage 0 → ordered cards → Stage Final. Viewer-paced; no card reveals before the "try" beat.
- For Phase 1, the card content is **authored data, not generated** — a small structured content file (one entry per card) holding: the invite prompt, the reveal text, the one-line "why," the epistemic tier, and the **image region** to highlight (coordinates/shape relative to the image). Alan authors/edits the wording; the developer supplies the structure and the region coordinates for the bowl.
- Region highlighting on the image is required in Phase 1 — this is the experience. Implement a reusable overlay (spotlight + dim, or box + zoom) driven by the region data in the card file.
- Seed content (starting point — final wording is Alan's, regions to be measured on the actual image). These map to characteristics already in the bowl's analysis:
  - **Figure-ground reversal** (tier: observation) — dark forms and light channels both read as the "picture."
  - **Production trace** (observation) — evidence of how it was physically made (coil/scrape).
  - **Color-zone logic** (observation) — the single-pigment, white-ground program.
  - **Designed symmetry / a deliberate break** (observation → interpretation) — the order, and where it bends.
  - **A "why" card** (interpretation) — what the geometric achievement suggests, clearly marked as inference.
  - Close on one honest **uncertainty** (theory) — something scholars debate, marked as a guess, to teach calibration.

**Acceptance check (Phase 1):** A person who knows nothing can complete `/look` on the bowl, never sees a code or jargon term unexplained, experiences each characteristic as invite → try → reveal-on-image → name, and reaches "Now you try." No card spoils itself before the try beat.

---

## Part B — Phase 2: generate the experience from analysis data (the seam)

Goal: any cataloged object can become a "Look" automatically, drawing on the analysis the engine already produces.

- Build a transform that takes an object's existing analysis (Pass 1 fingerprint + Pass 2 labeled, anchored statements) and **selects and sequences** a handful (≈5–8) of lay-suitable reveal cards: prefer high-confidence, visually locatable, surprising characteristics for the early cards; order by epistemic tier (observation → interpretation → theory); cap the count so it stays an experience, not a catalog.
- **Plain-language rewrite:** the transform converts each selected statement and its label into the invite/reveal/why copy at a lay reading level. The forensic wording is the source; the visitor never sees it raw.
- **Region anchoring decision (call this out — it's the real dependency):** highlighting requires per-characteristic image coordinates, which the current text analysis does not produce. Choose and document one path:
  - (a) add a lightweight, optional **region-annotation step** that returns a point/box for key features (an add-on to analysis, not a change to the blind fingerprint), or
  - (b) keep a **curated annotation layer** authored per hero object, automating selection/copy but not yet regions.
  Recommend (b) for the next milestone (fast, reliable, keeps the engine untouched), (a) as the path to scale. Build the card schema so it accepts regions from either source without change.

**Acceptance check (Phase 2):** Pointing the transform at a second cataloged object yields a coherent, correctly-sequenced, plain-language `/look` with no hand-written copy, honest epistemic register, and regions supplied by whichever path was chosen.

---

## Voice and UI rules

- **Translate the labels, always.** `[OBS]` → "you can see this." `[INTERP]` → "we're reading into it." `[CONS]` → "most experts agree." `[THEORY]` → "this is a guess people argue about." Render the distinction as a visible, consistent treatment (color, icon, a short tag) so the viewer learns the gradient. Keep the exact phrasings in one place for Alan to tune.
- Plain language only. Contractions. Short sentences. No archaeology jargon without an immediate plain gloss. Wonder over authority.
- Viewer-paced. Nothing past a reveal auto-advances. Easy to go back.
- Mobile-first; the object image is the hero on every screen size.
- Reuse the existing site's visual tokens/components where they fit; this is a new *experience surface*, not a new visual identity.

## Do not

- Do not modify the analysis engine, the blind fingerprint, the ingestion pipeline, the documentation quarantine, or the comparison/misattribution path. This experience is read-only over analysis that already exists.
- Do not show the full 27-principle fingerprint or any raw label codes to the visitor.
- Do not lecture, auto-play the whole sequence, or reveal a card before the viewer's "try" beat.
- Do not block the build on the region-annotation question — Phase 1 uses authored regions; Phase 2 picks a path.

## Sequence

1. Part A — `/look` route, card sequencer, overlay, authored bowl content. Ship the single-object experience and get it in front of real first-time viewers.
2. Iterate the bowl experience on observed reactions before generalizing.
3. Part B — the transform and the region-anchoring decision, so any cataloged object becomes a Look.

Out of scope for v1: the Notebook (optional, defer if it slows Phase 1), automated region detection at scale, multi-object "tours," accounts/saving, and any two-audience depth toggle. Build the single warm register first.
