-- Migration 0019 — structured per-principle corroboration classification
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0019_synthesis_classification.sql
--
-- Stores the machine-readable output of Step B synthesis: for every VECTOR_KEY
-- principle id, one of stable/thin/contradicted/unclassified plus evidence text.
-- Replaces the freeform Stable/Thin/Contradicted prose as the source of truth —
-- fingerprint_pass1_synthesized is now generated FROM this structured data,
-- not the other way around. See NEXT_SESSION.md for why this exists.

ALTER TABLE objects ADD COLUMN fingerprint_synthesis_classification TEXT;
