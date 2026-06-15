-- Migration 0008 — provenance integrity and contradiction flags on analyses
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0008_authenticity_flags.sql
--
-- Stores results of two new parallel passes in the analysis pipeline:
--   provenance_flags:    JSON array of ProvenanceFlag — structural gaps and red flags in documentation
--   contradiction_flags: JSON array of ContradictionFlag — doc claims that conflict with Pass 1 observations

ALTER TABLE analyses ADD COLUMN provenance_flags TEXT;
ALTER TABLE analyses ADD COLUMN contradiction_flags TEXT;
