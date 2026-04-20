-- ============================================================
-- Migration: Extend {slug}_documents tables with month and
-- file_size columns required for chat file auto-archiving.
--
-- Run for EACH tenant slug that has a _documents table.
-- Replace {slug} with the actual tenant slug, e.g.:
--   grit_media_group_llc
-- ============================================================

-- Example for grit_media_group_llc:
ALTER TABLE grit_media_group_llc_documents
  ADD COLUMN IF NOT EXISTS month      INTEGER,       -- 1–12, month the file was shared/uploaded
  ADD COLUMN IF NOT EXISTS file_size  BIGINT;        -- file size in bytes

-- ── New tenant template ──────────────────────────────────────
-- When creating a new tenant's documents table, use this DDL:
--
-- CREATE TABLE {slug}_documents (
--   id           SERIAL PRIMARY KEY,
--   name         TEXT NOT NULL,
--   description  TEXT,
--   doc_type     TEXT NOT NULL DEFAULT 'Other',
--   file_key     TEXT NOT NULL,
--   file_url     TEXT NOT NULL,
--   mime_type    TEXT,
--   file_size    BIGINT,
--   year         INTEGER,
--   month        INTEGER,          -- 1–12
--   created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
