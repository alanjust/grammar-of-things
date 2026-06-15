-- Migration 0009 — reference corpus tracking on objects
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0009_reference_corpus.sql
--
-- Enables authenticated reference pieces to be designated during cataloging.
-- These objects form the statistical baseline for per-tradition fingerprint distributions.

ALTER TABLE objects ADD COLUMN is_reference INTEGER DEFAULT 0;
ALTER TABLE objects ADD COLUMN reference_tradition TEXT;
