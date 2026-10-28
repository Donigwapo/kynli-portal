CREATE TABLE IF NOT EXISTS public.financial_validation_settings (
  tenant_slug TEXT PRIMARY KEY,
  coverage_mode TEXT NOT NULL DEFAULT 'current_year_only',
  custom_start_year INTEGER NULL,
  custom_start_month INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_financial_validation_settings_tenant
    FOREIGN KEY (tenant_slug)
    REFERENCES public.portal_tenants(slug)
    ON DELETE CASCADE,

  CONSTRAINT ck_financial_validation_settings_coverage_mode
    CHECK (coverage_mode IN ('current_year_only', 'include_previous_years', 'custom_start_month')),

  CONSTRAINT ck_financial_validation_settings_custom_start_month
    CHECK (custom_start_month IS NULL OR custom_start_month BETWEEN 1 AND 12),

  CONSTRAINT ck_financial_validation_settings_custom_pair_required
    CHECK (
      (coverage_mode = 'custom_start_month' AND custom_start_year IS NOT NULL AND custom_start_month IS NOT NULL)
      OR
      (coverage_mode <> 'custom_start_month' AND custom_start_year IS NULL AND custom_start_month IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_financial_validation_settings_coverage_mode
  ON public.financial_validation_settings (coverage_mode);

CREATE OR REPLACE FUNCTION public.set_financial_validation_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_validation_settings_updated_at ON public.financial_validation_settings;
CREATE TRIGGER trg_financial_validation_settings_updated_at
BEFORE UPDATE ON public.financial_validation_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_validation_settings_updated_at();

ALTER TABLE public.financial_validation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_validation_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.financial_validation_settings FROM anon, authenticated;
