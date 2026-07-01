-- Migration 0018 — fingerprint_synthesis_truncated flag on objects
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0018_synthesis_truncated.sql

ALTER TABLE objects ADD COLUMN fingerprint_synthesis_truncated INTEGER NOT NULL DEFAULT 0;
