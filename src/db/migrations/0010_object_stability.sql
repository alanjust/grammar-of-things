-- Migration 0010 — stability pass metadata on objects
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0010_object_stability.sql
--
-- Stores the number of independent Pass 1 runs used during ingest, and
-- the per-principle hit-rate map that results from comparing those runs.
-- Mirrors the stability_passes / stability_map columns on analyses, but
-- lives on objects because the fingerprint is computed at ingest time.

ALTER TABLE objects ADD COLUMN fingerprint_stability_passes INTEGER;
ALTER TABLE objects ADD COLUMN fingerprint_stability_map TEXT;
