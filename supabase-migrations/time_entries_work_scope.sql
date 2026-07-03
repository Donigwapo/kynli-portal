BEGIN;

-- 1) Add work_scope if missing
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS work_scope TEXT;

-- 2) Backfill existing rows
UPDATE public.time_entries
SET work_scope = CASE
  WHEN tenant_slug IS NULL THEN 'internal'
  ELSE 'client'
END
WHERE work_scope IS NULL
   OR BTRIM(work_scope) = ''
   OR work_scope NOT IN ('client', 'internal');

-- 3) Default + NOT NULL
ALTER TABLE public.time_entries
  ALTER COLUMN work_scope SET DEFAULT 'client';

ALTER TABLE public.time_entries
  ALTER COLUMN work_scope SET NOT NULL;

-- 4) Allowed values constraint
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS chk_time_entries_work_scope;

ALTER TABLE public.time_entries
  ADD CONSTRAINT chk_time_entries_work_scope
  CHECK (work_scope IN ('client', 'internal'));

-- 5) Scope/tenant consistency constraint
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS chk_time_entries_scope_tenant;

ALTER TABLE public.time_entries
  ADD CONSTRAINT chk_time_entries_scope_tenant
  CHECK (
    (work_scope = 'client' AND tenant_slug IS NOT NULL)
    OR (work_scope = 'internal' AND tenant_slug IS NULL)
  );

-- 6) Query helper index for running/today lookups
CREATE INDEX IF NOT EXISTS idx_time_entries_staff_scope_tenant_status_started
  ON public.time_entries (staff_user_id, work_scope, tenant_slug, status, started_at DESC);

COMMIT;
