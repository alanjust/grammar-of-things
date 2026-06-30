-- Migration 0017 — FTS5 keyword search index for the object corpus
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0017_search.sql
--
-- Enables keyword search across catalog identifiers, attribution, institution name,
-- and blind Pass 1 observation text. Porter stemmer: "coiling" matches "coil".
-- rowid is set to objects.id so delete-by-id works with a direct rowid lookup.
-- object_id UNINDEXED: stored for join, not tokenized (mirrors chunks_fts pattern).

CREATE VIRTUAL TABLE IF NOT EXISTS objects_fts USING fts5(
  catalog_number,
  accession_number,
  attribution_culture,
  source_institution,
  fingerprint_pass1_text,
  fingerprint_pass1_synthesized,
  object_id UNINDEXED,
  tokenize = 'porter unicode61'
);

-- Backfill all existing objects
INSERT INTO objects_fts(
  rowid, object_id,
  catalog_number, accession_number,
  attribution_culture, source_institution,
  fingerprint_pass1_text, fingerprint_pass1_synthesized
)
SELECT
  id, id,
  catalog_number, accession_number,
  attribution_culture, source_institution,
  fingerprint_pass1_text, fingerprint_pass1_synthesized
FROM objects;
