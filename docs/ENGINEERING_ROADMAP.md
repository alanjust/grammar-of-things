# Engineering Roadmap — The Grammar of Things

This document is for engineers who will continue development after a grant. It describes the current state of the system, what has been built and why, known gaps and technical debt, and a phased plan for completing the tool.

---

## Current State (as of June 2026)

### What is built and working

- **Cloudflare Workers deployment** — Astro v6 + `@astrojs/cloudflare` v13, Workers Assets model. Deployed via `npm run deploy`. Live at `thegrammarofthings.com` (custom domain, Workers route). See `CLAUDE.md` for deploy notes.
- **D1 database** (`grammar-of-things`) — SQLite on Cloudflare. Two tables: `objects` and `analyses`. Migrations are in `src/db/migrations/`.
- **R2 object storage** (`ARTIFACTS`) — Stores original and normalized artifact images. Keys are structured as `{objectId}/{label}-original.{ext}` and `{objectId}/{label}-analysis.{ext}`.
- **Admin authentication** — HttpOnly KV-session cookie (`got_admin`, 12h) or `Authorization: Bearer <ADMIN_TOKEN>`. `requireAdmin(request)` guards all API mutations. Public browsing requires no auth.
- **Ingest pipeline** (`POST /api/ingest`) — SSE-streaming pipeline: normalizes images (OffscreenCanvas, 1568px long edge, JPEG q85), runs Pass 1 (blind visual observation), scores 27-principle fingerprint vector, extracts documentation through three layers (raw → structured → canonical). Stores everything to D1 + R2.
- **Analysis pipeline** (`POST /api/analyze`) — SSE-streaming: Passes 2, 3, 4. Pass 4 runs three sub-passes in parallel via `Promise.allSettled`: fingerprint vector scoring, provenance integrity check, contradiction detection. Results stored in `analyses` table with structured JSON columns for each pass and flag type.
- **27-principle fingerprint** — 15 artifact principles (ap_1–ap_15) + 12 Tier A visual principles (ta_*). Defined in `src/lib/principles.ts`. All principles have full name, rationale, and observation guidance. Scored 0–3 by Pass 1.
- **Provenance integrity pass** — 11 flag codes (CHAIN_GAP, PRIVATE_CHAIN, DATE_VAGUE, etc.) applied to canonical documentation. Severity-coded HIGH / MEDIUM / LOW. Stored as `provenance_flags` JSON in `analyses`.
- **Contradiction detection pass** — Cross-references documentation claims against Pass 1 visual observations. Stored as `contradiction_flags` JSON in `analyses`.
- **Magic-byte MIME detection** — `detectMimeFromBytes()` in `src/lib/image.ts` ensures images are declared with the correct content-type to Claude regardless of R2 metadata. Prevents a class of analysis failures caused by format mismatch.
- **Reference corpus infrastructure** — `is_reference` and `reference_tradition` columns on `objects`. API endpoint `GET /api/reference/distribution` computes mean + stddev per principle per tradition. Catalog UI has a reference toggle. Reference Corpus page at `/reference` shows objects grouped by tradition with progress toward target.
- **Multi-pass stability check** — Pass 1 runs N times concurrently (default 3, configurable via `STABILITY_PASSES` env var). Hit-rate per principle across runs produces a `stabilityMap`. Pass 2 receives a stability note distinguishing high-confidence vs. borderline observations. `stability_passes` and `stability_map` stored on `analyses`. Set `STABILITY_PASSES=1` to revert without a code deploy.
- **Admin annotations** — `notes TEXT` on both `objects` and `analyses`. Admins can attach private running notes to any artifact or analysis run. Never rendered publicly. PATCH endpoints on `/api/objects/[id]` and `/api/analysis/[id]`.
- **Per-analysis delete** — `DELETE /api/analysis/[id]` (admin-only). Intended workflow: re-run an analysis to get stability-enriched Pass 2, delete the prior single-pass version.
- **Feedback queue** — `feedback_queue` table. Public POST `/api/feedback` (honeypot-gated). Admin GET + PATCH `/api/feedback/[id]` for status transitions (open → resolved/dismissed). Public form and admin review queue both at `/feedback`.
- **Design system** — Token layer in `src/styles/tokens.css`. Token audit script (`node scripts/token-audit.js`) enforces no raw hex/rgba/numeric values in CSS. `.prose` class for safe markdown rendering. Tooltip system on fingerprint terms.
- **Compare page** — Side-by-side fingerprint comparison for 2–N objects. Radar chart overlay and per-principle difference table.
- **Corpus browsing** — `/corpus` grid with filters for conflict objects and reference objects. Each object page shows full analysis history, fingerprint chart, and authenticity flags.
- **Researcher guide** — `/guide` — comprehensive guide for researchers arriving without context.
- **MCP server** — `grammar-collections-mcp` (separate package at `~/grammar-collections-mcp/`). 4-tool stdio + HTTP MCP server. Met/Smithsonian/IIIF adapters. Steps 1–6 complete.

### Key files

| File | Purpose |
|------|---------|
| `src/lib/principles.ts` | 27-principle definitions, PASS1_PROMPT_*, VECTOR_SCORING_PROMPT |
| `src/lib/model-router.ts` | PassConfig, resolveModelConfig, streamModel, callModel |
| `src/lib/image.ts` | normalizeImage, detectMimeFromBytes, dataUrlToBlob, IMAGE_SPEC |
| `src/lib/authenticity.ts` | PROVENANCE_INTEGRITY_PROMPT, CONTRADICTION_DETECTION_PROMPT |
| `src/lib/doc-extract.ts` | extractDocLayers — raw → structured → canonical |
| `src/lib/auth.ts` | requireAdmin, isAdmin, session helpers |
| `src/lib/markdown.ts` | renderMarkdown — hardened marked renderer |
| `src/lib/retrieval.ts` | FTS retrieval + citation injection into Pass 2 |
| `src/db/types.ts` | D1 table types, VECTOR_KEY, serializeVector/parseVector |
| `src/styles/tokens.css` | All design tokens (extend here first) |
| `ARCHITECTURE.md` | Full system architecture reference |
| `CLAUDE.md` | AI assistant instructions, deploy notes, auth/security rules |

### Data model summary

**`objects` table** — One row per cataloged artifact. Key columns:
- `id`, `ezid_ark`, `catalog_number`, `accession_number`
- `attribution_culture`, `attribution_confidence`, `attribution_mapping_notes`
- `doc_raw`, `doc_structured`, `doc_canonical` — three documentation layers
- `image_original_key`, `image_analysis_key` — comma-separated R2 keys
- `fingerprint_vector` — JSON array of 27 scores
- `fingerprint_model`, `fingerprint_pass1_text`, `fingerprinted_at`
- `source_institution`, `source_url`
- `claim_conflict` — flag for attribution source disagreement
- `is_reference`, `reference_tradition` — reference corpus membership
- `notes` — admin-only private notes (never rendered publicly)
- `image_spec`, `created_at`, `updated_at`

**`feedback_queue` table** — One row per public feedback submission. Key columns:
- `id`, `body`, `contact` (optional email), `page` (URL where submitted), `created_at`
- `status` — `open` | `resolved` | `dismissed`

**`analyses` table** — One row per analysis run. Key columns:
- `id`, `object_id` (FK), `created_at`
- `mode` (`artifact` | ...), `audience` (`researcher` | `conservator` | `general`)
- `pass1_text`, `pass2_text`, `pass3_text`
- `fingerprint_flag` — structured JSON flag from Pass 4 vector scoring
- `provenance_flags` — JSON array of ProvenanceFlag objects
- `contradiction_flags` — JSON array of ContradictionFlag objects
- `stability_passes` — INTEGER, number of Pass 1 runs used (nullable — null on pre-stability analyses)
- `stability_map` — TEXT JSON, Record of principle ID → `{hits, total}` (nullable)
- `notes` — admin-only private notes (never rendered publicly)
- `read_time_seconds`

---

## Phase 1 — Reference Corpus Population (current)

**Goal:** Reach 30 authenticated reference objects for Mimbres Phase III.

**What's needed (engineering work: minimal):**
- The infrastructure is complete. The only remaining work is data entry: identifying 30 authenticated, well-documented Mimbres Phase III bowls from institutional collections, cataloging each through the Catalog page, and marking them as reference pieces.
- Recommended sources: Peabody Museum, SAR, Maxwell Museum, University of Colorado. Focus on excavated pieces with EZID/ARK records and clear chain of custody.

**Success criterion:** `/api/reference/distribution?tradition=mimbres` returns `n >= 30` with non-trivial standard deviations across all 27 principles.

---

## Phase 2 — Statistical Comparison Layer

**Goal:** Replace provisional fingerprint labels with z-score comparison against the reference distribution.

**Architecture:**

The comparison pass runs after the fingerprint vector is computed. For each principle `k`:

```
z_k = (score_k - μ_k) / σ_k
```

where μ and σ come from `/api/reference/distribution?tradition={attribution_culture}`.

Flags should be generated when |z| > 2.0 (notable) or > 3.0 (outlier). A composite anomaly score (RMS of all z-scores) gives a single number for ranking objects.

**Files to create/modify:**
- `src/lib/comparison.ts` — `compareToReference(vector, distribution)` → per-principle z-scores + composite score
- `src/pages/api/analyze.ts` — call comparison after Pass 4 vector scoring; store results in new DB column
- `src/db/migrations/0014_comparison.sql` — add `comparison_zscores TEXT`, `comparison_anomaly_score REAL` to `analyses` (migrations 0010–0013 are already applied)
- Corpus/[id]/analysis/[analysisId].astro — show z-score column in fingerprint table; composite score chip in header

**Edge cases to handle:**
- σ = 0 for any principle (all reference objects scored identically) — return null z, don't flag
- tradition unknown — no comparison possible, show "No reference tradition available"
- reference corpus below threshold (N < 30) — show "Provisional: based on N=X objects, interpret with caution"
- attribution_confidence low — note that comparison is against a tradition that may not be correct

---

## Phase 3 — Scale and Search

**Goal:** Make the tool usable when the corpus contains hundreds of objects.

**Problem:** The Compare page currently loads all objects and renders everything client-side. This works at N=50 but not at N=500. The search problem is also not solved — there is no way to ask "show me all objects with high Symmetry scores and Mimbres attribution."

**Recommended architecture: Agentic search (not RAG)**

For synthesis queries ("find objects with unusual provenance gaps that also have high Production Trace scores"), vector similarity search is not the right tool. The query involves structured conditions over multiple columns and semantic reasoning. The right approach is:

1. A **pre-compiled analysis vault** — all analyses stored as structured JSON with full text, accessible to the agent via a simple DB query interface.
2. An **agentic search endpoint** (`POST /api/search/agent`) that takes a natural-language query, converts it to a structured DB query + semantic filter plan, executes it, and returns ranked results.
3. A **search UI** — a simple text input that calls the agent endpoint and streams results, replacing the current filter-only approach for research queries.

Token cost note: synthesis queries are expensive (10–30x a single analysis). Budget accordingly if exposing this to non-admin users.

**Simpler intermediate step:** Add structured filter parameters to `/api/objects`:
- `?tradition=mimbres&has_analysis=true&min_fp_score=ap_1:2`
- Returns filtered, paginated results
- Enables the Compare page to do a targeted query rather than loading everything

**Files to modify:**
- `src/pages/api/objects.ts` — add filtering, pagination, sort
- `src/pages/corpus.astro` — lazy-load grid with pagination, filter sidebar
- `src/pages/compare.astro` — refactor to query-based selection rather than pre-loaded grid

---

## Phase 4 — MCP Expansion

**Goal:** Expand the `grammar-collections-mcp` package to cover additional institutional collections and expose analysis capabilities.

**Current state:** Met/Smithsonian/IIIF adapters complete. Rights gate enforced. Reference-mode seam built. Steps 1–6 complete.

**Planned additions:**
- `analyze_object` tool — given an IIIF manifest URL or internal object ID, trigger ingestion + analysis pipeline and return results
- `compare_objects` tool — given two or more object IDs, return fingerprint comparison
- `search_corpus` tool — query the internal corpus by structured filters
- Additional collection adapters: Heard Museum, Denver Art Museum, Arizona State Museum

**Architecture note:** The MCP server is a separate package (`~/grammar-collections-mcp/`). It communicates with the main Worker via the internal API (same ADMIN_TOKEN auth). Do not merge it into the main Workers project — keeping it separate preserves the ability to run it locally via stdio even when the Worker is deployed.

---

## Phase 5 — Multi-Institution Open Corpus

**Goal:** Allow other institutions to contribute to a shared reference corpus without giving them admin access to the full system.

**Problem:** Currently, only admins can ingest objects. Multi-institution contribution requires:
- Per-institution authentication (not a single shared ADMIN_TOKEN)
- Contribution workflow: institution submits object → internal review → marked as reference if approved
- Provenance chain validation at submission time, not just at analysis time

**Recommended approach:**
1. Add an `institutions` table with per-institution API tokens and contribution quotas.
2. Add a `pending_contributions` table for submitted-but-not-yet-approved reference objects.
3. Build a `/review` workflow for approving pending contributions.
4. Issue per-institution tokens via a separate admin endpoint.

This is a significant scope expansion. Do not attempt before Phase 2 is complete and the reference corpus has demonstrated value.

---

## NAGPRA Support

The NAGPRA Amendments of 2023 (effective January 2024) significantly expanded repatriation obligations. The tool currently:
- Flags objects with `FUNERARY_CLAIM` provenance pattern when documentation describes them as mortuary ware
- Does not provide NAGPRA-specific guidance or flag objects that may be subject to new compliance requirements

**Planned additions:**
- NAGPRA flag type in provenance integrity pass: detect documentation patterns that suggest likely repatriation eligibility (funerary association, sacred object language, object type + cultural affiliation combination)
- Link to NAGPRA database (the National NAGPRA Online Database) for cross-reference
- Disclaimer language in analysis output for flagged objects

**Note:** This tool does not determine NAGPRA status. It can only flag patterns in documentation that suggest an object warrants NAGPRA review. Legal determination requires tribal consultation, not algorithm output.

---

## Known Technical Debt

| Item | File | Priority |
|------|------|----------|
| No pagination on `/api/objects` | `src/pages/api/objects.ts` | Medium — add before corpus exceeds ~300 objects |
| Compare page loads all objects client-side | `src/pages/compare.astro` | Medium — refactor to query-based selection |
| `conflict-count` CSS class renamed to `filter-count` but old class may remain in some templates | `src/pages/corpus.astro` | Low |
| FTS (full-text search) on analyses exists but UI doesn't expose it | `src/lib/retrieval.ts` | Low — wire up in Phase 3 search UI |
| No test suite | — | Medium — add integration tests for ingest and analysis pipelines before adding Phase 2 comparison logic |
| Single canonical fingerprinter model: no migration path for model version change | `src/lib/model-router.ts` | High in long run — need a re-fingerprint workflow for corpus-wide model updates |
| Image normalization uses OffscreenCanvas which is not available in all Workers runtimes | `src/lib/image.ts` | Low — falls back gracefully, but normalization failure is silent |

---

## Environment Setup (for new engineers)

### Prerequisites
- Node 20+
- Cloudflare account with Workers, D1, R2, KV enabled
- `wrangler` CLI: `npm install -g wrangler`
- Anthropic API key

### Local development
```bash
git clone <repo>
cd grammar-of-things
npm install
# Create .dev.vars (gitignored):
echo 'ANTHROPIC_API_KEY=<your-key>' >> .dev.vars
echo 'ADMIN_TOKEN=<your-token>' >> .dev.vars
# Apply all migrations locally:
wrangler d1 execute grammar-of-things --local --file=src/db/migrations/0001_initial.sql
# ... (repeat for all migrations)
npm run dev
```

### Deploy to production
```bash
npm run deploy
```

### Apply a new migration
```bash
# Remote:
wrangler d1 execute grammar-of-things --remote --file=src/db/migrations/0014_comparison.sql
# Local:
wrangler d1 execute grammar-of-things --local --file=src/db/migrations/0014_comparison.sql
```
Migrations 0001–0013 are already applied to the remote database. The next migration to write is `0014_*`.

### Token audit (before committing CSS changes)
```bash
node scripts/token-audit.js
```
Must exit with 0 errors. See `CLAUDE.md` for token system rules.

### Secrets (production)
All API keys and tokens are Cloudflare Secrets, never in `wrangler.toml [vars]`:
```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ADMIN_TOKEN
```
Local equivalents go in `.dev.vars` (gitignored).
