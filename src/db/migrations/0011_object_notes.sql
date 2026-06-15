-- Migration 0011 — admin notes on objects
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0011_object_notes.sql

ALTER TABLE objects ADD COLUMN notes TEXT;
