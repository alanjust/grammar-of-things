-- Migration 0007 — stability check columns on analyses
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0007_stability.sql
--
-- Adds two nullable columns to store multi-pass Pass 1 stability data.
-- Both are null for analyses run before this migration (single-pass behavior).
--
-- stability_passes: how many Pass 1 runs were executed (1 = legacy single-pass)
-- stability_map:    JSON object mapping principle IDs to { hits, total }

ALTER TABLE analyses ADD COLUMN stability_passes INTEGER;
ALTER TABLE analyses ADD COLUMN stability_map TEXT;
