-- ============================================================
-- Migration: Extend {slug}_chat tables with file attachment
-- and archive classification columns.
--
-- Run this for EACH tenant slug that already has a _chat table.
-- Replace {slug} with the actual tenant slug, e.g.:
--   grit_media_group_llc
-- ============================================================

-- Example for grit_media_group_llc:
ALTER TABLE grit_media_group_llc_chat
  ADD COLUMN IF NOT EXISTS sender_user_id  INTEGER,
  ADD COLUMN IF NOT EXISTS file_key        TEXT,
  ADD COLUMN IF NOT EXISTS file_url        TEXT,
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS file_size       BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS archive_year    INTEGER,
  ADD COLUMN IF NOT EXISTS archive_month   INTEGER,   -- 1–12
  ADD COLUMN IF NOT EXISTS portal_document_id INTEGER,
  -- Allow message to be NULL (file-only messages have no text body)
  ALTER COLUMN message DROP NOT NULL;

-- ── New tenant template ──────────────────────────────────────
-- When creating a new tenant's chat table, use this DDL:
--
-- CREATE TABLE {slug}_chat (
--   id                  SERIAL PRIMARY KEY,
--   sender_user_id      INTEGER,
--   sender_role         TEXT NOT NULL DEFAULT 'client',
--   sender_name         TEXT NOT NULL,
--   message             TEXT,                    -- nullable: file-only messages have no text
--   read                BOOLEAN NOT NULL DEFAULT FALSE,
--   file_key            TEXT,
--   file_url            TEXT,
--   file_name           TEXT,
--   file_size           BIGINT,
--   mime_type           TEXT,
--   archive_year        INTEGER,
--   archive_month       INTEGER,                 -- 1–12
--   portal_document_id  INTEGER,
--   created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
