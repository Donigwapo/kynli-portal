CREATE TABLE IF NOT EXISTS public.cfo_trigger_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  report_month_label TEXT,
  trigger_engine_version TEXT NOT NULL,
  source_import_id UUID NULL,
  source_document_id UUID NULL,
  snapshot_source TEXT NOT NULL DEFAULT 'financial_pdf',
  metrics_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  clear_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  unknown_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cfo_trigger_snapshots_period_month CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT chk_cfo_trigger_snapshots_period_year CHECK (period_year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_cfo_trigger_snapshots_snapshot_source CHECK (snapshot_source IN ('financial_pdf', 'operational'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cfo_trigger_snapshots_import_engine_source
  ON public.cfo_trigger_snapshots(source_import_id, trigger_engine_version, snapshot_source)
  WHERE source_import_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cfo_trigger_snapshots_tenant_period_engine_source
  ON public.cfo_trigger_snapshots(tenant_slug, period_year, period_month, trigger_engine_version, snapshot_source)
  WHERE source_import_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cfo_trigger_snapshots_tenant_period_desc
  ON public.cfo_trigger_snapshots(tenant_slug, period_year DESC, period_month DESC, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_cfo_trigger_snapshots_received_at
  ON public.cfo_trigger_snapshots(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_cfo_trigger_snapshots_source_import_id
  ON public.cfo_trigger_snapshots(source_import_id)
  WHERE source_import_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_cfo_trigger_snapshots_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cfo_trigger_snapshots_updated_at ON public.cfo_trigger_snapshots;
CREATE TRIGGER trg_cfo_trigger_snapshots_updated_at
BEFORE UPDATE ON public.cfo_trigger_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_cfo_trigger_snapshots_updated_at();

ALTER TABLE public.cfo_trigger_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfo_trigger_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.cfo_trigger_snapshots FROM anon, authenticated;
