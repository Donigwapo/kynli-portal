-- Coaching Next Steps: quarter-scoped accountability tasks per tenant.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.coaching_next_steps (
  id BIGSERIAL PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  quarter INTEGER NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to BIGINT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by BIGINT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_coaching_next_steps_quarter
    CHECK (quarter IN (1, 2, 3, 4)),

  CONSTRAINT chk_coaching_next_steps_status
    CHECK (status IN ('not_started', 'in_progress', 'waiting', 'blocked', 'completed')),

  CONSTRAINT chk_coaching_next_steps_priority
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  CONSTRAINT chk_coaching_next_steps_completion_pair
    CHECK ((completed_at IS NULL AND completed_by IS NULL) OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)),

  CONSTRAINT chk_coaching_next_steps_due_date_reasonable
    CHECK (due_date IS NULL OR due_date >= DATE '2000-01-01')
);

CREATE INDEX IF NOT EXISTS idx_coaching_next_steps_tenant_period_sort
  ON public.coaching_next_steps(tenant_slug, year, quarter, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_coaching_next_steps_tenant_status_due
  ON public.coaching_next_steps(tenant_slug, status, due_date);

CREATE INDEX IF NOT EXISTS idx_coaching_next_steps_tenant_assigned
  ON public.coaching_next_steps(tenant_slug, assigned_to);

CREATE OR REPLACE FUNCTION public.set_coaching_next_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coaching_next_steps_updated_at ON public.coaching_next_steps;
CREATE TRIGGER trg_coaching_next_steps_updated_at
BEFORE UPDATE ON public.coaching_next_steps
FOR EACH ROW EXECUTE FUNCTION public.set_coaching_next_steps_updated_at();
