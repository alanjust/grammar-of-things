// Database types — mirrors the schema in migrations/0001_init.sql.
// D1 returns rows as plain objects; these types describe what comes back.

// ---------------------------------------------------------------------------
// Canonical vector key — fixed order, must match VECTOR_SCORING_PROMPT
// ---------------------------------------------------------------------------

export const VECTOR_KEY = [
  // 15 artifact-domain principles
  'ap_1', 'ap_2', 'ap_3', 'ap_4', 'ap_5',
  'ap_6', 'ap_7', 'ap_8', 'ap_9', 'ap_10',
  'ap_11', 'ap_12', 'ap_13', 'ap_14', 'ap_15',
  // 12 Tier A universal principles (applicable subset)
  'ta_1', 'ta_2', 'ta_4', 'ta_5',
  'ta_13', 'ta_15', 'ta_20', 'ta_28',
  'ta_47', 'ta_48', 'ta_49', 'ta_51',
] as const;

export type VectorKey = (typeof VECTOR_KEY)[number];
export type PrincipleScores = Record<VectorKey, number>;

// Parse a stored vector JSON string to a named-score object.
export function parseVector(json: string): PrincipleScores {
  const arr: number[] = JSON.parse(json);
  return Object.fromEntries(
    VECTOR_KEY.map((k, i) => [k, arr[i] ?? 0])
  ) as PrincipleScores;
}

// Serialize a named-score object (from VECTOR_SCORING_PROMPT output) to a
// canonical-order JSON array string for storage.
export function serializeVector(scores: Record<string, number>): string {
  return JSON.stringify(
    VECTOR_KEY.map(k => Math.min(3, Math.max(0, Math.round(scores[k] ?? 0))))
  );
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DbObject {
  id: number;

  // Persistent identifiers
  ezid_ark:         string | null;
  catalog_number:   string | null;
  accession_number: string | null;

  // Canonical attribution (first-class)
  attribution_culture:       string | null;
  attribution_confidence:    string | null;
  attribution_mapping_notes: string | null;

  // Documentation — three layers as JSON strings
  doc_raw:        string | null;   // layer 1: verbatim paste
  doc_structured: string | null;   // layer 2: AI-split JSON
  doc_canonical:  string | null;   // layer 3: canonical-vocabulary JSON

  // Source
  source_institution: string | null;
  source_url:         string | null;

  // Images (R2 keys)
  image_original_key: string | null;
  image_analysis_key: string | null;
  image_spec:         string | null;

  // Blind fingerprint
  fingerprint_vector:     string | null;  // JSON array, 27 ints
  fingerprint_model:      string | null;
  fingerprint_pass1_text: string | null;
  fingerprinted_at:       string | null;  // ISO 8601

  created_at: string;
  updated_at: string;
}

export interface DbAnalysis {
  id:        number;
  object_id: number;

  mode:     'artifact' | 'connections';
  audience: string | null;

  // Models
  model_pass1:      string | null;
  model_pass2:      string | null;
  model_pass3:      string | null;
  model_extraction: string | null;
  model_vector:     string | null;

  // Pass outputs
  pass1_text: string | null;
  pass2_text: string | null;
  pass3_text: string | null;

  // Pass 4 outputs
  extraction_json: string | null;  // full JSON
  analysis_vector: string | null;  // JSON array, 27 ints

  // Promoted extraction fields
  object_class:            string | null;
  tradition:               string | null;
  tradition_confidence:    string | null;
  function_category:       string | null;
  production_level:        string | null;
  tradition_routing_basis: string | null;
  metadata_completeness:   string | null;

  // Stability check (set when artifact.ts runs multiple Pass 1 passes)
  stability_passes: number | null;
  stability_map:    string | null;  // JSON: Record<string, { hits: number; total: number }>

  created_at: string;
}

// ---------------------------------------------------------------------------
// Documentation layer types
// ---------------------------------------------------------------------------

// Layer 2: AI-structured JSON (institution's field set preserved)
export interface DocStructured {
  institution: string;
  fields: Record<string, string>;   // raw field names → raw values
  parsed_at: string;
}

// Layer 3: canonical JSON (shared cross-institution vocabulary)
export interface DocCanonical {
  culture:               string | null;
  culture_confidence:    'reading' | 'hypothesis' | 'indeterminate' | null;
  period:                string | null;
  object_type:           string | null;
  material:              string | null;
  dimensions:            string | null;
  site:                  string | null;
  collection:            string | null;
  source_institution:    string | null;
  source_url:            string | null;
  condition:             string | null;
  notes:                 string | null;
  mapping_flags:         string[];    // uncertain mappings flagged by AI
  mapped_at:             string;
}
