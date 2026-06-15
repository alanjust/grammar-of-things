-- Migration 0012 — admin notes on analyses
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0012_analysis_notes.sql

ALTER TABLE analyses ADD COLUMN notes TEXT;
