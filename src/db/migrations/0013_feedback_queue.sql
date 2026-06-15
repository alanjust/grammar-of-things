-- Migration 0013 — public feedback queue
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0013_feedback_queue.sql

CREATE TABLE IF NOT EXISTS feedback_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT    NOT NULL,
  contact    TEXT,
  page       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  status     TEXT    NOT NULL DEFAULT 'open'
);
