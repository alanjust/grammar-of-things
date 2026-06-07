-- Migration 0005 — human review queue for sensitivity-flagged records
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0005_review_queue.sql
--
-- When the MCP ingestion path returns sensitivity_flag=true, the record is held
-- here for human review before any fingerprint or analysis runs.
-- A false positive costs a glance; a false negative is what the project exists to prevent.

CREATE TABLE IF NOT EXISTS review_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,

  -- MCP source fields (enough to re-fetch the full ObjectRecord)
  source          TEXT NOT NULL,          -- MCP adapter name, e.g. "smithsonian"
  source_object_id TEXT NOT NULL,         -- stable MCP object id

  -- Full ObjectRecord stored as JSON (so nothing is lost if the source changes)
  object_record   TEXT NOT NULL,          -- JSON of the full ObjectRecord from get_object

  -- Why it was queued
  flag_reason     TEXT NOT NULL DEFAULT 'sensitivity_flag',

  -- Review outcome
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewer_note   TEXT,
  reviewed_at     TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status     ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_source_obj ON review_queue(source, source_object_id);
