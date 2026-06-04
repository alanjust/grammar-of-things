-- Migration 0002 — add fingerprint_flag to analyses
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0002_analysis_flag.sql
--
-- Stores the result of comparing the blind fingerprint against the documented attribution.
-- JSON: { alignment, flag_strength, reasoning, caveats }

ALTER TABLE analyses ADD COLUMN fingerprint_flag TEXT;
