# The Grammar of Things—Build Brief v1

Planning document. Written for handoff to Claude Code. Nothing here is a code change made by the planning agent—these are instructions to implement.

Context: the artifact analysis tool is being spun into its own product and eventual grant project under the name **The Grammar of Things** (domain: thegrammarofthings.com). Near-term goal is a self-funded build that doubles as a funder-facing showcase. Hosting stays on Cloudflare. Framework stays on Astro. The four-pass analysis engine in `src/pages/api/artifact.ts` is preserved—these changes do not alter analytical behavior.

---

## Part A—Technical changes (cost control)

Two small, well-scoped changes. Neither changes what the analysis says—only what it costs to run.

### A1. Turn on prompt caching

**Why:** Pass 2's displacement block is a large, static set of instructions sent on every analysis. Prompt caching stores that block server-side and bills repeat sends at roughly 10% of normal input cost. This is the single highest-leverage cost change available.

**Current state in `artifact.ts`:**
- Prompts are built by functions that interpolate per-artifact values (`pass1` text, principle names, audience, views) into the prompt body—see `ARTIFACT_PROMPT` (line ~326), `PASS1_PROMPT_*` (line ~282/307), `COMPETENCY_PROMPT` (line ~916), `CONNECTIONS_PROMPT` (line ~944), `EXTRACTION_PROMPT` (line ~38).
- No `cache_control` markers anywhere. Caching is off.

**What to do:**
1. Separate the static instruction text from the per-artifact dynamic text in each prompt. Caching only helps if the cached prefix is byte-identical across calls—so the large static block (displacement, RAP protocol, evaluative criteria, reference class) must come first, as a stable prefix, with the dynamic per-artifact content placed after it.
2. Send the static block as a `system` prompt array with a `cache_control: { type: "ephemeral" }` breakpoint at the end of the static portion, on the calls that carry the heavy block—chiefly Pass 2 (`anthropic.messages.stream`, line ~1210) and Pass 3 (line ~1241). Apply to Pass 1 and the connections path as well if their static portions are large.
3. Verify the cached prefix does not contain any per-artifact value. If any dynamic value leaks into the prefix, the cache misses every time and the change does nothing.

**Acceptance check:** Run the same artifact twice. The second run's API response should report a high `cache_read_input_tokens` count and a correspondingly lower input charge.

### A2. Centralize model selection

**Why:** The model name `claude-sonnet-4-6` is hardcoded in five places (lines ~1161, 1211, 1242, 1275, 1283). To trade cost against quality—flip a heavy pass to Opus for a tougher artifact, or keep everything on Sonnet to stretch a month's budget—those should be one setting, not five edits.

**What to do:**
1. Define a single model-config object near the top of the endpoint, keyed by pass: e.g. `{ pass1, pass2, pass3, extraction }`. Default all to `claude-sonnet-4-6` except `extraction`, which stays on Haiku (`claude-haiku-4-5`) since it is cheap structured work.
2. Replace each hardcoded model string at the call sites with the matching config value.
3. Allow override via environment variable so the pass-to-model mapping can change without editing code—read from `locals.runtime?.env` the same way `ANTHROPIC_API_KEY` is read (line ~1096).

**Acceptance check:** Changing one env value reroutes the intended pass to a different model, confirmed in the API response's `model` field, with no other code edited.

**Do not:** Change prompt wording, pass order, vector scoring, or D1 writes. This is plumbing only.

### A3. Multi-provider model routing (forward-looking—design the seam now, integrate later)

A2 centralizes model selection across Anthropic models only, because they share one API. Using other providers (OpenAI, Google, Grok, Mistral, and open models like Llama / Qwen / Mistral) requires more, because each differs in API shape, image encoding, auth, and prompt behavior. Do **not** integrate multiple providers in v1. Only shape A2's config so it is provider-agnostic and ready.

**What to do now (cheap):** generalize the per-pass config from a model name to `{ provider, model }`, and route all model calls through a single internal function (a thin model-router) rather than calling a provider SDK directly at each pass. Even with only Anthropic wired today, every call should pass through that one function. That is the seam.

**What stays deferred:** actual provider integrations. When the time comes, prefer a unified gateway over hand-integrating each SDK—candidates: a gateway/aggregator (OpenRouter, LiteLLM), a TypeScript abstraction (Vercel AI SDK), or—best fit for this stack—**Cloudflare AI Gateway** (cross-provider routing, caching, observability) with **Workers AI** for hosted open models. Open models are always called via a host (Cloudflare, Groq, Together, Bedrock, Vertex), never self-hosted here.

**Two rules to write down so they are not lost:**

1. **One canonical fingerprinter.** Pick a single strong vision model to compute the Pass 1 fingerprint for every object in the corpus. Scores are not comparable across models, and the corpus comparison/outlier layer depends on consistency. Never let mixed models write the canonical fingerprint vector.
2. **Diversity belongs in a separate cross-check layer.** Running other models on the same image to measure agreement is valuable (inter-model agreement = a confidence signal; disagreement = a model artifact, not a property of the object). But this is a distinct, optional layer that reports agreement—it does not feed the canonical vector. Build it when there is a corpus to validate against.

**Why it is worth the seam:** match model to pass (cost/quality), resilience against price/deprecation/policy changes, an epistemic confidence signal for the forensic/grant case, and—if the federal partnership ever involves sensitive material—the option to route to open models on controlled infrastructure for data sovereignty.

**Caveats:** each provider needs its own key, its own image formatting, and its prompts re-validated (the displacement block is tuned for Claude's instruction-following). Anthropic prompt caching (A1) is provider-specific and does not carry to other providers.

---

## Part B—Site structure (the front door)

The site is the pitch. The tool is the proof. The grant is the future. Design principle: **modular hero, fixed core.** The top section swaps emphasis per audience without a rebuild; the proof and roadmap sections stay constant.

First target audience: **IMLS National Leadership Grants for Museums** framing (museum-field needs, model practices, collections stewardship, NAGPRA). Build the hero so it can flex to a digital-humanities, federal/forensic-ARPA, or private-foundation framing later by swapping one content block.

### Page order

**1. Hero (MODULAR—swappable per funder).**
One sentence on what the tool does in plain language, one sentence on why it matters to this audience, one image of a real analysis. For the IMLS framing: lead with collections stewardship and attribution integrity. Keep the copy in a single content block (e.g. one data file or one component prop set) so switching audiences is a content edit, not a layout change.

**2. The problem (FIXED).**
Plain-English statement of the real problem: a large share of museum and collection holdings carry attribution claims that rest on thin or old documentation; misattribution obstructs both scholarship and repatriation. No jargon. This is the section that makes a reviewer nod before they see the tool.

**3. The proof (FIXED—this is the heart).**
The one real analysis—the Mimbres bowl (NMNH 070367 / A326247)—shown well. Surface the epistemic labels (`[OBS]`, `[INTERP]`, `[CONS]`, `[THEORY]`), the RAP flags, and the 27-principle fingerprint, each with a one-line plain-English gloss of what it is and why it matters. One excellent, fully-explained example beats a thin gallery.

**4. How it works (FIXED).**
The four passes in plain terms—observe, interpret, take forward, extract—and the key idea that the tool separates what the eye can see from what the paperwork claims. State honestly what photography can and cannot determine. Honesty about limits builds more trust than polish.

**5. The roadmap / what funding builds (FIXED).**
Where all the architecture work lives, stated as plan, not claim. The retrieval corpus of real authorities; the growing fingerprint database; the outlier-detection instrument that flags objects whose visual fingerprint does not match their provenance; the ARPA and NAGPRA use cases. Label clearly what is prototype today versus what funding builds. Do not present the misattribution instrument as working—present it as the rigorous path from a proof of concept to the instrument.

**6. Who / credibility (MODULAR).**
The team, the NFS forensic-lab partnership, the institutional-steward story (build-and-transfer to a museum or consortium for long-term care). Funders fund teams and sustainability as much as ideas. Swap emphasis per audience here too.

**7. Footer / contact.**
Minimal. Domain identity, contact, and a one-line statement of the project's mission.

### Build notes

- Keep hero and credibility content in dedicated data files (Astro content collection or a simple JSON/JS data module) so a funder switch is a content edit. The fixed sections can be normal page components.
- This is a new site identity, not an AAJ page. Do not import AAJ design tokens, Hidden Grammar Zone A/B layouts, or `analysisModes.js`. The analysis engine (`artifact.ts` and its prompts) ports over; the AAJ shell does not.
- Hosting: Cloudflare Pages + Workers, as today. No migration needed for the showcase site.

---

## Part C—Data model and ingestion (catalog-first)

This is the core product reframe. The tool is a **cataloging instrument that can also analyze**, not an analysis tool. The image is the prime source; everything else refers to it. Ingestion (catalog + fingerprint) is decoupled from analysis (Passes 2–4 and custom prompts).

### C1. The data model

Replace the current flat shape (one row per analysis) with a hierarchy: **one Object → one canonical blind fingerprint → many analyses.**

- **Object** — the unit of the catalog. Holds: a stable id, the uploaded image(s), and a link to its raw documentation. One row per artifact.
- **Documentation** — the institutional catalog record, handled in three layers (see C1a). **Stored but quarantined**—never an input to the fingerprint; only available later, in analysis.
- **Fingerprint** — the canonical Pass 1 result: the 27 principles scored 0–3, computed from the image alone. One per object. **Store it as a real vector** (an ordered numeric array tied to the object), not as flat separate integer columns. This is what makes later vector/similarity queries possible without a rewrite.
- **Analysis** — zero or more, created later. Each is one run of Pass 2/3/4 or a custom prompt against an object, with its own output and its own scored vector, linked back to the same object.

D1 is fine for v1 at current scale. The migration to PostgreSQL + pgvector comes with the query layer (grant-funded phase). The requirement now is only that the **schema be shaped for vectors from day one**—store the fingerprint as an ordered array, keyed to an object that can hold many analyses. Do not bake in assumptions that one object equals one analysis.

### C1a. Documentation model—three layers

Institutional catalog records vary widely between sources (the Smithsonian's field set differs from any other museum's). Do **not** model documentation as fixed columns. The answer is not "PostgreSQL or JSON"—Postgres holds JSON natively (JSONB), and SQLite/D1 handles JSON too, so store the variable record as JSON inside the database. Three layers per object:

1. **Raw paste—verbatim, never altered.** Exactly what the user copies from the source (e.g. the Smithsonian object window). Preserved for provenance integrity and as the quarantined documentation. This is the layer that must never reach Pass 1.
2. **Structured JSON—AI splits the raw paste into key/value pairs** as the institution presented them (Culture, Continent, Country, Province/State, Collector, Accession Number, etc.). Schema-less, so each object carries whatever fields its source had. This is a cheap extraction step (same shape as the existing `EXTRACTION_PROMPT`, Haiku-class).
3. **Canonical layer—AI maps the institution's fields onto a shared internal vocabulary.** One source says "Culture: Mimbres," another "Cultural Affiliation"; both resolve to one canonical attribution field. This is what makes cross-institution queries possible and what the misattribution instrument compares against the blind fingerprint. Map conservatively; flag uncertain mappings rather than guessing.

**Promote to first-class columns (not buried in JSON):** the persistent identifier (**EZID / ARK**, e.g. `n2t.net/ark:/65665/...`)—the best key for deduping and linking back to the authoritative source—plus catalog number and accession number. The canonical attribution claim (e.g. culture) should also be directly queryable, since it is the value compared against the fingerprint.

### C2. The ingestion pipeline (Phase 1—catalog)

Build an upload path that is independent of any Pass 2/3/4 work. The primary path is **one object at a time**—a single artifact's image(s) plus a field (or fields) to paste its documentation, if any exists. Batch upload is an optional convenience layer to add later; the per-object pipeline below is the real work and is identical either way.

On upload, two independent things happen—neither touches the other:

**Track A—blind fingerprint (from the image only):**
1. Store the uploaded image(s) **original, full resolution, uncompressed, untouched** against a new Object record. This is the archival prime source—never the analysis copy. Reasons: future models will read more resolution than today's can, so the corpus can be re-fingerprinted without re-sourcing; and the original is the faithful record of the artifact.
2. Derive a **normalized analysis copy** from the original: long edge ~1568px (Claude vision's effective ceiling—roughly 1.15MP; above this the API scales down internally and the extra pixels are never seen), high quality, minimal recompression, and the **same spec for every object**. Consistency matters: inconsistent input resolution adds noise to cross-object fingerprint comparison later. The current artifact page resizes only conditionally (long edge > 2048px or > 4MB) and re-compresses as JPEG—replace that with unconditional normalization of the analysis copy to one fixed spec, while leaving the stored original alone.
3. **Run Pass 1 only**, blind, on the normalized copy: the fingerprint is computed from the image alone. The documentation must not be in the Pass 1 context in any form. The existing `PASS1_PROMPT_*` already does pure observation—reuse it unchanged.
4. Store the resulting 27-principle vector as the object's canonical fingerprint.

**Track B—documentation (from the pasted record only):**
1. Store the raw paste verbatim (layer 1).
2. AI splits it into structured JSON (layer 2) and maps it to canonical fields (layer 3), per C1a. Promote EZID/ARK, catalog number, accession number, and canonical attribution to first-class fields.
3. If a field is left empty (no documentation available), the object is still validly cataloged on its fingerprint alone.

Then stop. No Pass 2, 3, or 4. The object is now cataloged and fingerprinted. Track A is cheap (one Sonnet pass, plus caching from A1); Track B is a cheap Haiku-class extraction. This is how the corpus accrues. The blindness is structural—enforced by keeping the two tracks separate in the pipeline, not by remembering to do it.

### C3. The analysis path (Phase 2—on demand, later)

A separate flow, not part of ingestion:

1. Recall or query an object—its image(s) and now its documentation too.
2. Run a chosen prompt (Pass 2/3/4 or custom). Documentation is available as context here.
3. Store the output and its scored vector back against the same object as a new Analysis.
4. Where applicable, compare the blind fingerprint against the documented attribution claim. A large mismatch is a research flag—the embryonic misattribution instrument. Surface it; do not assert it as a conclusion.

### C4. Out of scope for v1 (build the seam, not the contents)

The cross-object query layer—"tensor query," similarity search, tradition clustering, outlier detection across the fingerprint corpus—is the grant-funded phase. Do **not** build it now. Only ensure C1's schema can support it later. Likewise OCR, the real retrieval corpus, and the pgvector migration are deferred.

---

## Sequence

1. A2 (model config)—smallest, unblocks cost control.
2. A1 (caching)—biggest cost saver; do right after A2.
3. C1 + C2—the catalog/ingest path and the object→fingerprint→analyses schema. This is the product spine; it moves early because it is how the corpus accrues cheaply.
4. C3—the on-demand analysis path against cataloged objects.
5. Part B site structure—build the fixed core first (problem, proof, how-it-works, roadmap), modular hero and credibility last. The proof section can showcase the catalog and a fingerprint-vs-claim flag, not just a single essay.

Vector database, OCR, the cross-object query layer, and the real retrieval corpus are deliberately out of scope for v1. They are the grant-funded phase. Build the seam, not the contents.
