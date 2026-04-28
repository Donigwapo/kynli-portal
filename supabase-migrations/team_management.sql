-- ─────────────────────────────────────────────────────────────
-- Phase 23: Team Member Management
-- Run this in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Step 1: Drop the old role check constraint and add new one with all 4 roles
ALTER TABLE portal_users
  DROP CONSTRAINT IF EXISTS portal_users_role_check;

ALTER TABLE portal_users
  ADD CONSTRAINT portal_users_role_check
  CHECK (role IN ('admin', 'accounting_manager', 'tax_manager', 'accountant', 'client'));

-- Step 2: Create staff_client_assignments table
-- Links a staff member (portal_user) to a tenant they are assigned to
CREATE TABLE IF NOT EXISTS staff_client_assignments (
  id          BIGSERIAL PRIMARY KEY,
  staff_id    BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  tenant_slug TEXT   NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, tenant_slug)
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff_id
  ON staff_client_assignments(staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_tenant_slug
  ON staff_client_assignments(tenant_slug);
