-- ─────────────────────────────────────────────────────────────
-- Phase 24: Client Invite Tracking
-- Run this in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Add invite tracking columns to portal_tenants
ALTER TABLE portal_tenants
  ADD COLUMN IF NOT EXISTS invite_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted BOOLEAN NOT NULL DEFAULT FALSE;

-- Add invite tracking to portal_users (for client users)
ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS invite_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted BOOLEAN NOT NULL DEFAULT FALSE;
