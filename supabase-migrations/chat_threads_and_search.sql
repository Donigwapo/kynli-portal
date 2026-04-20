-- ============================================================
-- Migration: Add threaded replies + search index to {slug}_chat
--
-- Run for EACH tenant slug that has a _chat table.
-- Replace {slug} with the actual tenant slug.
-- ============================================================

-- Example for grit_media_group_llc:

-- 1. Add thread_id (self-referencing FK to parent message)
--    and reply_count (denormalized counter for fast display)
ALTER TABLE grit_media_group_llc_chat
  ADD COLUMN IF NOT EXISTS thread_id    INTEGER REFERENCES grit_media_group_llc_chat(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count  INTEGER NOT NULL DEFAULT 0;

-- 2. Index for fast thread lookups (fetch all replies for a parent)
CREATE INDEX IF NOT EXISTS idx_grit_media_group_llc_chat_thread_id
  ON grit_media_group_llc_chat(thread_id)
  WHERE thread_id IS NOT NULL;

-- 3. Full-text search index on message body (GIN for fast ilike / to_tsvector)
CREATE INDEX IF NOT EXISTS idx_grit_media_group_llc_chat_message_fts
  ON grit_media_group_llc_chat USING gin(to_tsvector('english', coalesce(message, '')));

-- ── New tenant template ──────────────────────────────────────
-- When creating a NEW tenant's chat table, use this full DDL:
--
-- CREATE TABLE {slug}_chat (
--   id                  SERIAL PRIMARY KEY,
--   sender_user_id      INTEGER,
--   sender_role         TEXT NOT NULL DEFAULT 'client',
--   sender_name         TEXT NOT NULL,
--   message             TEXT,
--   read                BOOLEAN NOT NULL DEFAULT FALSE,
--   file_key            TEXT,
--   file_url            TEXT,
--   file_name           TEXT,
--   file_size           BIGINT,
--   mime_type           TEXT,
--   archive_year        INTEGER,
--   archive_month       INTEGER,
--   portal_document_id  INTEGER,
--   thread_id           INTEGER REFERENCES {slug}_chat(id) ON DELETE CASCADE,
--   reply_count         INTEGER NOT NULL DEFAULT 0,
--   created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
--
-- CREATE INDEX idx_{slug}_chat_thread_id
--   ON {slug}_chat(thread_id) WHERE thread_id IS NOT NULL;
--
-- CREATE INDEX idx_{slug}_chat_message_fts
--   ON {slug}_chat USING gin(to_tsvector('english', coalesce(message, '')));
