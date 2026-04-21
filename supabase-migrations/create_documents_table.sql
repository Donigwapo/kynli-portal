-- ============================================================
-- Migration: Create {slug}_documents table for each tenant
-- Run once per tenant slug (replace {slug} with actual slug)
-- e.g. grit_media_group_llc
-- ============================================================

-- Replace {slug} with the actual tenant slug before running.
-- Example: CREATE TABLE grit_media_group_llc_documents ( ... )

CREATE TABLE IF NOT EXISTS {slug}_documents (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,                          -- display name / title
  description     TEXT,                                   -- optional note (e.g. "Shared via chat by Mecheal")
  doc_type        TEXT NOT NULL DEFAULT 'Other',          -- 'Financials' | 'Tax Returns' | 'W-2 / 1099' | 'Chat Attachment' | 'Other'
  file_key        TEXT NOT NULL,                          -- S3 object key
  file_url        TEXT NOT NULL,                          -- public URL
  file_name       TEXT,                                   -- original filename
  file_size       BIGINT,                                 -- bytes
  mime_type       TEXT,                                   -- e.g. 'application/pdf', 'image/png'
  year            INTEGER NOT NULL,                       -- year of upload (for grouping)
  month           INTEGER,                                -- 1–12, month of upload (for grouping)
  uploaded_by_name TEXT,                                  -- display name of uploader
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast year/month filtering
CREATE INDEX IF NOT EXISTS idx_{slug}_documents_year_month
  ON {slug}_documents(year, month);

-- Index for doc_type filtering
CREATE INDEX IF NOT EXISTS idx_{slug}_documents_doc_type
  ON {slug}_documents(doc_type);

-- Full-text search index on name + description
CREATE INDEX IF NOT EXISTS idx_{slug}_documents_fts
  ON {slug}_documents USING gin(
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  );
