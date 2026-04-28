-- Phase 25: Add is_churned column to portal_tenants
-- Run this in Supabase SQL Editor

ALTER TABLE portal_tenants
  ADD COLUMN IF NOT EXISTS is_churned BOOLEAN NOT NULL DEFAULT FALSE;

-- When a client is archived/churned, both is_active=false and is_churned=true
-- When restored, is_active=true and is_churned=false
-- Hard delete removes the row entirely (use with caution)
