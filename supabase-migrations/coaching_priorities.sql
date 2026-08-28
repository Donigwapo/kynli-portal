CREATE TABLE IF NOT EXISTS public.coaching_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id BIGINT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_coaching_priorities_year CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_coaching_priorities_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_coaching_priorities_tenant_year
  ON public.coaching_priorities(tenant_slug, year);

CREATE INDEX IF NOT EXISTS idx_coaching_priorities_tenant_year_completed_order
  ON public.coaching_priorities(tenant_slug, year, completed, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.set_coaching_priorities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coaching_priorities_updated_at ON public.coaching_priorities;
CREATE TRIGGER trg_coaching_priorities_updated_at
BEFORE UPDATE ON public.coaching_priorities
FOR EACH ROW
EXECUTE FUNCTION public.set_coaching_priorities_updated_at();

ALTER TABLE public.coaching_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_priorities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.coaching_priorities FROM anon, authenticated;
