-- Migration 0014 — pass1_truncated flag on objects
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0014_pass1_truncated.sql

ALTER TABLE objects ADD COLUMN pass1_truncated INTEGER NOT NULL DEFAULT 0;
