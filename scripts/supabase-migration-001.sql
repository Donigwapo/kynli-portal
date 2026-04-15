-- ─── Migration 001: Team Members, Focus Areas, Time Logs columns ──────────────
-- Run this in your Supabase SQL Editor to add the new tables and columns.

-- ─── Shared: Team Members ────────────────────────────────────────────────────
-- Stores team member names per tenant slug (shared table, not per-tenant)
CREATE TABLE IF NOT EXISTS team_members (
  id         BIGSERIAL PRIMARY KEY,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS team_members_slug_idx ON team_members(slug);

-- ─── Shared: Focus Areas ─────────────────────────────────────────────────────
-- Stores custom focus area labels per tenant slug
CREATE TABLE IF NOT EXISTS focus_areas (
  id         BIGSERIAL PRIMARY KEY,
  slug       TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS focus_areas_slug_idx ON focus_areas(slug);

-- ─── Alter: Add new columns to grit_media_group_llc_time_logs ────────────────
-- These columns are needed for the new Add Entry modal
ALTER TABLE grit_media_group_llc_time_logs
  ADD COLUMN IF NOT EXISTS log_date      DATE,
  ADD COLUMN IF NOT EXISTS team_member   TEXT,
  ADD COLUMN IF NOT EXISTS task_category TEXT,
  ADD COLUMN IF NOT EXISTS minutes       INTEGER DEFAULT 0;

-- ─── Seed: Default Focus Areas for Grit Media Group LLC ──────────────────────
INSERT INTO focus_areas (slug, label) VALUES
  ('grit_media_group_llc', 'Consulting'),
  ('grit_media_group_llc', 'Fulfillment'),
  ('grit_media_group_llc', 'Sales'),
  ('grit_media_group_llc', 'Admin'),
  ('grit_media_group_llc', 'Strategy')
ON CONFLICT DO NOTHING;
