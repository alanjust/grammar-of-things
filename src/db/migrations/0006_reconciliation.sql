-- Migration 0006 — cross-source reconciliation
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0006_reconciliation.sql
--
-- Adds:
--   objects.claim_conflict   — 1 when two sources assert different cultures for the same object
--   object_claims            — one row per source's full claim about an object
--
-- Design: the fingerprint is never touched by reconciliation.
-- Every claim lives on the claim side; the evidence/claim split stays intact.
-- objects.attribution_culture remains the primary/display claim; object_claims
-- holds the full multi-source set so "sources disagree" can be detected and surfaced.

-- Additive column — safe to run on a table with existing rows
ALTER TABLE objects ADD COLUMN claim_conflict INTEGER NOT NULL DEFAULT 0;

-- Child table: one row per source assertion about an object
CREATE TABLE IF NOT EXISTS object_claims (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id          INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Source identification
  source_institution TEXT NOT NULL,
  source_url         TEXT,

  -- The claim this source makes (verbatim, never paraphrased)
  attribution_culture TEXT,   -- verbatim institutional claim; null if source doesn't assert one
  doc_raw            TEXT,    -- layer 1: verbatim record from this source
  doc_structured     TEXT,    -- layer 2: JSON of institution's own fields

  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_object_claims_object_id ON object_claims(object_id);
