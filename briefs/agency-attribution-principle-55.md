# Build Brief: Sync 4 new perceptual principles; add 2 to the fingerprint vector

**For Claude Code. Read CLAUDE.md first. Run `node scripts/token-audit.js` before committing if any CSS is touched (none should be).**

Date: 2026-07-15. Approved direction: this is a prototype — do not preserve old vectors for compatibility. Re-fingerprint everything. Better outcomes beat stability.

The Hidden Grammar of Art repo has grown from 54 to **58 principles**. Four were added (IDs 55–58). This brief syncs all four into Grammar of Things' reference data and adds the two that belong in the artifact fingerprint vector.

| ID | Name | Tier | Into vector? |
|----|------|------|--------------|
| 55 | Agency Attribution | A | **Yes** — `ta_55` |
| 56 | Postural Affect | A | **Yes** — `ta_56` |
| 57 | Embodied Simulation | B | No — reference only |
| 58 | Empathic Resonance | C | No — reference only |

**Vector goes 27 → 29.** Only the two Tier A additions enter it. Embodied Simulation is Tier B (the universal subset is strictly Tier A) and overlaps the existing `ap_1` Production Trace Reading. Empathic Resonance is Tier C and requires a depicted suffering body — too narrow and off-tier for the fingerprint. Both are still synced to `hg-principles.json` so this repo's reference list matches the art site's 58; the existing `APPLICABLE_TIER_A_IDS` filter is what selects the two that get vectorized, so no selective copying is needed.

**Why these two earn slots:** the vector already carries the social-perception cluster (ta_47 Face Detection, ta_48 Biological Motion, ta_49 Gaze Direction). Agency Attribution and Postural Affect are the missing members of that same cluster. For Mimbres figurative bowls — figures in relation, bodies in posture, often faceless or in filled silhouette — "agents-in-relation vs. geometric pattern" and "emotional charge read from body configuration when no face is legible" are close to the central diagnostic axes. Both should carry real comparison/attribution signal. Both score 0 on a plain undecorated pot, exactly as Face Detection already does — a valid reading, not a problem.

---

## Changes

### 1. `src/data/hg-principles.json` — add all four entries after id 54

Schema matches existing entries exactly (`studioUse` mirrors `howToUse`, as in the current file).

```json
{
  "id": 55,
  "name": "Agency Attribution",
  "subtitle": "intention read into form",
  "tier": "A",
  "claimType": "Perceptual/attentional mechanism",
  "neuralFact": "Heider and Simmel (1944) showed that people automatically narrate intention, goal, and social relationship onto simple moving shapes — triangles and circles read as 'chasing,' 'bullying,' or 'hiding' with no biological features at all. This activates the same mentalizing network (superior temporal sulcus, temporoparietal junction, medial prefrontal cortex) engaged when reading real people's intentions. It requires no face, no eyes, no lifelike motion — only a spatial relationship between forms with an implied vector: one approaches, one blocks, one recedes, one is pursued.",
  "studioTool": "Agency reads from relationship, not likeness. Two forms with an implied directional relationship — one oriented toward another, one positioned as obstacle, one trailing another's implied path — get read as agents with wants, even in fully abstract work. This is the perceptual root of narrative: not motion itself, not gaze itself, but the inferred want behind a form's position relative to another.",
  "howToUse": "To imply intention: give a form orientation relative to another (facing, reaching, blocking, withdrawing), and leave the relationship incomplete rather than resolved — a form mid-approach or blocked-short reads as wanting something more strongly than one that has arrived. Works in pure abstraction: two shapes with a converging vector and an obstacle between them will be read as a thwarted goal by nearly any viewer, with no figuration required.",
  "studioUse": "To imply intention: give a form orientation relative to another (facing, reaching, blocking, withdrawing), and leave the relationship incomplete rather than resolved — a form mid-approach or blocked-short reads as wanting something more strongly than one that has arrived. Works in pure abstraction: two shapes with a converging vector and an obstacle between them will be read as a thwarted goal by nearly any viewer, with no figuration required.",
  "combineWith": ["Directional Force/Implied Movement", "Gaze Direction / Social Attention", "Biological Motion Detection", "Implied Time/Narrative Sequence"]
},
{
  "id": 56,
  "name": "Postural Affect",
  "subtitle": "emotion read from the body, no face required",
  "tier": "A",
  "claimType": "Perceptual/affective mechanism",
  "neuralFact": "A static body posture resolves into a felt emotional state before the face is even parsed — often faster, and sometimes overriding the face when the two conflict. De Gelder's work shows that fear, dominance, threat, and grief read directly from the configuration of a body: a raised shoulder, a recoiling torso, a collapsed spine. This runs on a dedicated pathway — the extrastriate and fusiform body areas coding body form, with the superior temporal sulcus and amygdala assigning emotional and social meaning. It is fast, largely automatic, and holds up across cultures. Crucially it needs no motion and no visible face, which is exactly why it survives in a still image on a gallery wall.",
  "studioTool": "The body is a face. A figure's emotional charge is carried in posture — the angle of a spine, the set of the shoulders, the closing or opening of the limbs — independent of, and sometimes louder than, its facial expression. A turned-away or faceless figure is not emotionally mute; its posture is doing the reading. This is why a figure seen from behind, or with the face in shadow, can still land a specific feeling.",
  "howToUse": "To set an emotional register without relying on the face: shape the whole body. Compression (drawn-in limbs, lowered head, curved spine) reads as fear, submission, or grief; expansion (raised chin, squared shoulders, open stance) reads as dominance or confidence. When the face is absent, obscured, or neutral, posture carries the entire affective load — and when face and body conflict, the body often wins the first read. Works in figuration and in near-abstract figures alike.",
  "studioUse": "To set an emotional register without relying on the face: shape the whole body. Compression (drawn-in limbs, lowered head, curved spine) reads as fear, submission, or grief; expansion (raised chin, squared shoulders, open stance) reads as dominance or confidence. When the face is absent, obscured, or neutral, posture carries the entire affective load — and when face and body conflict, the body often wins the first read. Works in figuration and in near-abstract figures alike.",
  "combineWith": ["Face Detection", "Biological Motion Detection", "Agency Attribution", "Gaze Direction / Social Attention"]
},
{
  "id": 57,
  "name": "Embodied Simulation",
  "subtitle": "the mark re-enacted in the viewer's body",
  "tier": "B",
  "claimType": "Perceptual/motor mechanism (embodied simulation)",
  "neuralFact": "Viewing an action — or the physical trace of one — activates the observer's own motor system, as if lightly rehearsing the movement. Freedberg and Gallese (2007) extended this from depicted actions to the artist's gesture itself: the slash of a blade, the drag of a loaded brush, the drip of thrown paint recruit motor and premotor areas in the viewer via the mirror system. Part of what a gestural mark 'means' is felt as a faint motor echo of making it. This is the mechanism behind why physical brushwork reads as energy rather than as mere texture. Honest caveat: the strong version — that inert marks reliably drive motor cortex — has mixed replication, which is why this sits in Tier B rather than A.",
  "studioTool": "A mark carries the memory of the hand that made it. Visible, directional, effortful marks — a fast drag, a scraped edge, a flung line — get partly re-enacted in the viewer's motor system, reading as kinetic energy and bodily presence. This is why a gesturally worked surface feels alive in a way a flat, anonymous fill does not: the viewer is faintly making the mark alongside you.",
  "howToUse": "To make a surface feel physical rather than depicted: leave the gesture legible. Preserve directional drag, pressure variation, and the speed of a stroke instead of blending it out. A mark that clearly encodes how the hand moved invites the viewer to re-enact it and reads as energy; a mark scrubbed of its making reads as inert. Strongest where the gesture is large, directional, and singular enough to be 'felt' as one movement.",
  "studioUse": "To make a surface feel physical rather than depicted: leave the gesture legible. Preserve directional drag, pressure variation, and the speed of a stroke instead of blending it out. A mark that clearly encodes how the hand moved invites the viewer to re-enact it and reads as energy; a mark scrubbed of its making reads as inert. Strongest where the gesture is large, directional, and singular enough to be 'felt' as one movement.",
  "combineWith": ["Directional Force/Implied Movement", "Biological Motion Detection", "Postural Affect", "Agency Attribution"]
},
{
  "id": 58,
  "name": "Empathic Resonance",
  "subtitle": "sharing a depicted body's pain or effort",
  "tier": "C",
  "claimType": "Affective-empathy mechanism (not theory-of-mind)",
  "neuralFact": "Seeing another body in pain, strain, or physical effort activates part of the viewer's own affective and somatosensory response — anterior insula and anterior cingulate cortex for shared distress (Singer and colleagues), with somatosensory involvement when the depicted contact or wound is specific. This is a real, measurable resonance, and it is what gives images of suffering (a Crucifixion, a Goya, war photography) their bodily grip. Two honest qualifications: this is the affective-empathy network, not the theory-of-mind / mentalizing network — a different system from Agency Attribution and Gaze Direction — and its strength is more variable across viewers and more culturally mediated, which places it in Tier C.",
  "studioTool": "Depicted pain and effort are felt, not just seen. A specific, legible wound, strain, or weight in a depicted body produces a faint answering response in the viewer's own body — a wince, a bracing. Specificity drives it: a precise site of contact or injury resonates far more than a generic or symbolic one. This is a real lever for images meant to implicate the viewer physically rather than address them at arm's length.",
  "howToUse": "To make a viewer feel a depicted body rather than observe it: be specific and somatic. Locate the strain, the wound, or the weight precisely — a defined point of contact, a clear line of tension — rather than gesturing at suffering symbolically. Vulnerable or exposed body zones amplify the response. Use sparingly and deliberately; the effect is strong but variable across viewers, and overuse reads as manipulation rather than empathy.",
  "studioUse": "To make a viewer feel a depicted body rather than observe it: be specific and somatic. Locate the strain, the wound, or the weight precisely — a defined point of contact, a clear line of tension — rather than gesturing at suffering symbolically. Vulnerable or exposed body zones amplify the response. Use sparingly and deliberately; the effect is strong but variable across viewers, and overuse reads as manipulation rather than empathy.",
  "combineWith": ["Postural Affect", "Face Detection", "Biological Motion Detection", "Agency Attribution"]
}
```

Update `meta.epistemicNotice`: "These 54 principles" → "These 58 principles".

Note: match these entries verbatim to the Hidden Grammar of Art repo's copy — that repo is the canonical source. IDs 55–58 and tiers are as shown.

### 2. `src/lib/principles.ts`

- Add `55` and `56` to `APPLICABLE_TIER_A_IDS` (NOT 57 or 58 — Tier B/C, excluded from the universal subset by design). Everything derived from the set (`APPLICABLE_TIER_A_NAMES`, `TIER_A_PRINCIPLE_REF`, `VECTOR_KEY_NAMES`) picks up ta_55 and ta_56 automatically — verify, don't assume.
- Note the `PRINCIPLE_NAMES` export filters `tier === 'A'` across ALL principles — it will now include Agency Attribution and Postural Affect (correct) but NOT the Tier B/C additions (also correct). Confirm this export is only used for the fine-art Pass 2 reference list and that pulling in the two new Tier A names there is harmless/desirable.
- `VECTOR_SCORING_PROMPT`: the ta_* block (currently ~lines 134–145) is hardcoded text. **Preferred fix:** generate both the ap_* and ta_* lines from the same JSON sources instead of hardcoded strings, so the prompt can never drift from `VECTOR_KEY` again. At minimum, add `ta_55: Agency Attribution` and `ta_56: Postural Affect`, and change every hardcoded "27" in the prompt to derive from `VECTOR_KEY.length`.
- `PASS1_PROMPT_SINGLE` and `PASS1_PROMPT_MULTI`: in the "ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES" paragraph, add two application clauses:
  - "Agency Attribution reads whether depicted forms are configured as agents in relation — one oriented toward, blocking, or pursuing another — as designed narrative content rather than repeating pattern."
  - "Postural Affect reads emotional or social charge from the configuration of a depicted body — the set of shoulders, spine, or limbs — including when the figure has no legible face."

### 3. `src/db/types.ts`

- Append `'ta_55'` and `'ta_56'` to `VECTOR_KEY`. Update the comments ("12 Tier A" → "14 Tier A"; "27 ints" → "29 ints" on `fingerprint_vector` and `analysis_vector`).
- No SQL migration needed — vectors are JSON text columns. Do NOT edit applied migration `0001` (its comment listing the old key order is now historical).

### 4. Consolidate the duplicated VECTOR_KEY copies (the real payoff)

These files each carry their own inline copy of the key list and/or name map. Replace every copy with imports of `VECTOR_KEY` from `src/db/types.ts` and `VECTOR_KEY_NAMES` from `src/lib/principles.ts`:

- `src/pages/catalog.astro` (~line 174)
- `src/pages/compare.astro` (~line 134) — also change the `vec.length === 27` filter (~line 349) to `vec.length === VECTOR_KEY.length`
- `src/pages/reference.astro` (~line 56)
- `src/pages/corpus/[id].astro` (~line 77)
- `src/pages/corpus/[id]/analysis/[analysisId].astro` (~line 60)
- `src/pages/api/analysis/[id].ts` (~line 7)
- `src/pages/api/compare/synthesize.ts` (~line 9)

Frontmatter imports are straightforward. Where a key list is used inside a client-side `<script>`, pass it from frontmatter (`define:vars` or a serialized JSON island) rather than retyping it. After this change there must be exactly one definition of the key order in the codebase. The next principle addition should then be a two-file change plus copy.

- `src/pages/principles.astro` (~line 21): add `55: 'ta_55'` and `56: 'ta_56'` to the id→key map (or derive the map from `APPLICABLE_TIER_A_IDS`).

### 5. Copy updates ("27" is public-facing identity)

Now **29** in the vector. Confirmed: `principles.astro` filters `hg-principles.json` down to `APPLICABLE_TA_IDS` only (the vectorized subset) — it does NOT render the full 58-principle set. So it goes to 29 like everything else; Embodied Simulation and Empathic Resonance get no display anywhere on this page (see item 8).

- `src/components/SiteNav.astro`: "The 27 Principles" → "The 29 Principles" (2 places)
- `src/components/Proof.astro`: "6 of 27" → "6 of 29"; "All 27 principle scores" → "All 29 principle scores"
- `src/pages/guide.astro`: many mentions of 27 — sweep all of them to 29
- `src/pages/partners.astro`: "27 perceptual principles" → "29"
- `src/pages/principles.astro`: title, meta description, h1, and body copy all say "27" (lines ~40, 41, 55, 57, 60) — sweep to 29. This file is already being touched in item 4 for the id→key map; don't stop there.
- `src/components/Hero.astro`, `Problem.astro`, `HowItWorks.astro`, `Roadmap.astro`: each has a "27-principle..." mention on the homepage — sweep to 29.
- `src/pages/api/analyze.ts` (~line 109): `BLIND FINGERPRINT (27 principles scored 0–3, image only):` — this is inside a live model prompt (the provenance/contradiction pass), not just page copy. Update it too.
- Grep for any remaining `27` in copy contexts before finishing, across BOTH extensions — the `.astro`-only version misses the two `.ts` prompt/export strings above:
  `grep -rn "27" src --include="*.astro" --include="*.ts"` and judge each hit.

### 6. Step B / ingestion classification

`ingest.ts` defaults every `VECTOR_KEY` entry to `unclassified` and filters model output against `VECTOR_KEY` — ta_55 and ta_56 are picked up automatically once the keys exist. Verify the `VECTOR_KEY_NAMES` lookup renders "Agency Attribution" and "Postural Affect" in the synthesis markdown.

### 7. Re-fingerprint the corpus

17 objects, 19 stored analyses (verified in D1 `grammar-of-things`, 2026-07-15). Old 27-length vectors are invalid after this change — `parseVector` would silently report ta_55/ta_56 as 0 ("not present"), a false claim, and old Pass 1 text never had these principles in its prompt, so rescoring old text would under-detect them.

Plan: re-run the full fingerprint pipeline (Pass 1 → synthesis → vector scoring) on all 17 objects. **Before deleting or replacing any stored analysis, stop and get Alan's explicit sign-off on the per-object plan** — he has previously kept specific analyses as before/after references (objects 33/35). Batch cost is small; data-handling decisions are his.

### 8. Verify

- `npm run build` clean; token audit clean if any CSS touched.
- Live-test one object end-to-end after deploy: Pass 1 mentions Agency Attribution and Postural Affect only when genuinely active; vector stores 29 ints; radar charts render 29 spokes on catalog, compare, corpus, and reference pages; compare page doesn't drop re-fingerprinted objects.
- Confirm the principles page shows Agency Attribution and Postural Affect with their vector badges. Embodied Simulation / Empathic Resonance will NOT appear there or anywhere else in the GoT UI — `principles.astro` only ever renders the vectorized Tier A subset, confirmed by reading the page's filter logic, not just guessed. Both principles exist solely as data in `hg-principles.json` after this brief ships, with zero user-facing surface. That's consistent with "reference parity, no vector slot" as scoped below, but flag it to Alan explicitly before shipping — it's a slightly unusual outcome for a "sync" brief that two of the four synced principles are invisible everywhere.

---

## Out of scope

- **Embodied Simulation (57) and Empathic Resonance (58) in the vector.** Synced to `hg-principles.json` for reference parity only. Rationale: Embodied Simulation is Tier B (breaks the strictly-Tier-A universal subset) and conceptually overlaps `ap_1` Production Trace Reading, which already reads the maker's gesture from the mark in the artifact domain; Empathic Resonance is Tier C and requires a depicted body in pain/effort — too narrow and too culturally variable to carry fingerprint signal across a ceramics corpus. If a later use case (e.g. a figurative-heavy tradition) argues for either, revisit then — but adding a Tier B/C principle to the vector should be a deliberate rule change, since it redefines what the "universal subset" means.
- Hidden Grammar of Art repo edits (separate repo; it is the canonical source these entries are copied from).
- Reference-corpus z-score thresholds (still waiting on 30+ objects per tradition; unchanged by this).
