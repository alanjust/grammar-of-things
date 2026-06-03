-- Migration 0001 — initial schema
-- Run: wrangler d1 execute grammar-of-things --file=./src/db/migrations/0001_init.sql
--
-- Shape: one Object → one canonical blind fingerprint → many Analyses.
-- Vectors stored as JSON arrays in canonical principle order (see VECTOR_KEY in types.ts).
-- D1/SQLite holds JSON natively; the migration to pgvector happens with the query layer.

-- ---------------------------------------------------------------------------
-- objects
-- ---------------------------------------------------------------------------
-- One row per physical artifact. The fingerprint lives here — one per object,
-- computed blind (from image alone, documentation excluded).
--
-- Documentation is stored in three layers as JSON to accommodate variable
-- institutional field sets. First-class columns are promoted only for values
-- that must be directly queryable: persistent identifier, catalog/accession
-- numbers, and the canonical attribution claim.

CREATE TABLE IF NOT EXISTS objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Persistent identifiers — first-class for deduplication and source linking.
  -- EZID/ARK is the preferred key (n2t.net resolver); catalog_number and
  -- accession_number are institution-assigned and may be non-unique across
  -- institutions, so both are kept alongside the ARK.
  ezid_ark          TEXT,   -- e.g. "n2t.net/ark:/65665/3f927a0ac-..."
  catalog_number    TEXT,   -- institution catalog / item number
  accession_number  TEXT,   -- museum accession number

  -- Canonical attribution claim — first-class so it can be compared against
  -- the blind fingerprint without parsing JSON.
  attribution_culture       TEXT,   -- e.g. "Mimbres", "Hohokam"
  attribution_confidence    TEXT,   -- "reading" | "hypothesis" | "indeterminate"
  attribution_mapping_notes TEXT,   -- uncertain mappings flagged by the canonical layer

  -- Documentation — three layers.
  -- Layer 1: verbatim paste from source. NEVER modified after write.
  --          Must never reach Pass 1 context (quarantine).
  -- Layer 2: AI-split structured JSON (institution's own fields preserved).
  -- Layer 3: AI-mapped canonical fields (shared cross-institution vocabulary).
  doc_raw       TEXT,   -- layer 1
  doc_structured TEXT,  -- layer 2, JSON
  doc_canonical  TEXT,  -- layer 3, JSON

  -- Source metadata
  source_institution  TEXT,
  source_url          TEXT,

  -- Image storage (R2 keys).
  -- original: full-res, uncompressed, never touched — the archival prime source.
  -- analysis: normalized copy at fixed spec (1568px long edge) used for all model calls.
  image_original_key  TEXT,
  image_analysis_key  TEXT,
  image_spec          TEXT,   -- e.g. "1568px-long-edge-jpeg-q85"

  -- Blind fingerprint — canonical Pass 1 result, computed from image alone.
  -- Stored as a JSON array in canonical principle order:
  --   [ap_1, ap_2, ap_3, ap_4, ap_5, ap_6, ap_7, ap_8, ap_9, ap_10,
  --    ap_11, ap_12, ap_13, ap_14, ap_15,
  --    ta_1, ta_2, ta_4, ta_5, ta_13, ta_15, ta_20, ta_28,
  --    ta_47, ta_48, ta_49, ta_51]
  -- 27 integers, each 0–3. Null until Track A ingestion runs.
  -- One canonical fingerprinter model must write all rows (see A3 rule).
  fingerprint_vector    TEXT,   -- JSON array, e.g. "[2,0,1,3,...]"
  fingerprint_model     TEXT,   -- model that produced this fingerprint
  fingerprint_pass1_text TEXT,  -- verbatim Pass 1 observation (input to vector scoring)
  fingerprinted_at      TEXT,   -- ISO 8601 timestamp

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------
-- Zero or more per object. Each is one run of Pass 2/3/4 (or a custom prompt)
-- against an existing object. Linked back via object_id.
-- Carries its own scored vector (same 27-value layout as fingerprint_vector)
-- derived from the Pass 1 text of this run.

CREATE TABLE IF NOT EXISTS analyses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id  INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Run configuration
  mode      TEXT NOT NULL,   -- "artifact" | "connections"
  audience  TEXT,            -- "researcher" | "curator" | "educator"

  -- Models used for this run (from A2 model config)
  model_pass1      TEXT,
  model_pass2      TEXT,
  model_pass3      TEXT,
  model_extraction TEXT,
  model_vector     TEXT,

  -- Verbatim pass outputs
  pass1_text  TEXT,
  pass2_text  TEXT,
  pass3_text  TEXT,

  -- Full Pass 4 extraction JSON (raw output from extraction pass)
  extraction_json TEXT,

  -- Scored vector for this analysis run — same canonical order as fingerprint_vector.
  -- Computed from pass1_text via VECTOR_SCORING_PROMPT.
  -- May differ from objects.fingerprint_vector if a different model was used.
  analysis_vector TEXT,   -- JSON array, 27 integers 0–3

  -- Fields promoted from extraction_json for direct querying.
  -- Kept in sync with extraction_json on write; source of truth is extraction_json.
  object_class              TEXT,  -- ceramic_vessel | carved_organic | composite | lithic | shell | fiber | other
  tradition                 TEXT,  -- mimbres | hohokam | ancestral_puebloan | casas_grandes | salado | unknown
  tradition_confidence      TEXT,  -- reading | hypothesis | indeterminate
  function_category         TEXT,  -- domestic_utilitarian | serving_display | ritual_ceremonial | mortuary | indeterminate
  production_level          TEXT,  -- household | part_time_specialist | full_time_specialist | indeterminate
  tradition_routing_basis   TEXT,  -- visual_only | metadata_confirmed | metadata_conflict | ambiguous
  metadata_completeness     TEXT,  -- none | partial | full

  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

-- Object lookups by persistent identifier
CREATE INDEX IF NOT EXISTS idx_objects_ezid_ark       ON objects(ezid_ark)          WHERE ezid_ark IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objects_accession      ON objects(accession_number)  WHERE accession_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objects_catalog        ON objects(catalog_number)    WHERE catalog_number IS NOT NULL;

-- Canonical attribution — used by the misattribution instrument (fingerprint vs. claim)
CREATE INDEX IF NOT EXISTS idx_objects_culture        ON objects(attribution_culture) WHERE attribution_culture IS NOT NULL;

-- Objects that have been fingerprinted (Track A complete)
CREATE INDEX IF NOT EXISTS idx_objects_fingerprinted  ON objects(fingerprinted_at)  WHERE fingerprinted_at IS NOT NULL;

-- Analysis lookups
CREATE INDEX IF NOT EXISTS idx_analyses_object_id     ON analyses(object_id);
CREATE INDEX IF NOT EXISTS idx_analyses_mode          ON analyses(mode);
CREATE INDEX IF NOT EXISTS idx_analyses_tradition     ON analyses(tradition) WHERE tradition IS NOT NULL;
