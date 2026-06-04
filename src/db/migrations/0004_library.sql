-- Migration 0004 — document reference library
-- Run: wrangler d1 execute grammar-of-things --remote --file=./src/db/migrations/0004_library.sql
--
-- Stores scholarly reference documents and their chunked text for retrieval during Pass 2.
-- FTS5 full-text index enables keyword search across all chunks.

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  citation_key  TEXT NOT NULL,   -- e.g. "BRODY-2004" — used inline in analysis citations
  title         TEXT NOT NULL,
  author        TEXT NOT NULL,   -- last, first or "Last, First & Last, First"
  year          INTEGER,
  doc_type      TEXT,            -- "book" | "article" | "report" | "excerpt" | "chapter"
  doi           TEXT,
  source_url    TEXT,
  file_key      TEXT,            -- R2 key for original PDF (optional)
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,            -- internal notes about the document or its scope
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  chunk_text    TEXT NOT NULL,
  page_ref      TEXT,            -- e.g. "p.127" or "pp.127-129"
  section_ref   TEXT,            -- e.g. "Chapter 3" or "Form and Structure"
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 virtual table for full-text search across chunks.
-- Porter stemmer: "coiled" matches "coil", "analyzed" matches "analysis".
-- UNINDEXED columns are stored with each row but not tokenized.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_text,
  document_id   UNINDEXED,
  citation_key  UNINDEXED,
  page_ref      UNINDEXED,
  section_ref   UNINDEXED,
  tokenize = 'porter unicode61'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_citation_key ON documents(citation_key);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id      ON document_chunks(document_id);
