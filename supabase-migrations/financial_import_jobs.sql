CREATE TABLE IF NOT EXISTS public.financial_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL UNIQUE,
  document_id UUID NOT NULL,
  tenant_slug TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL,
  file_name TEXT,
  uploaded_by_user_id TEXT,
  extracted_data JSONB,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_financial_import_jobs_month CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT chk_financial_import_jobs_year CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_financial_import_jobs_status CHECK (status IN ('processing', 'ready_for_review', 'failed')),
  CONSTRAINT fk_financial_import_jobs_document FOREIGN KEY (document_id)
    REFERENCES public.documents_metadata(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_financial_import_jobs_import_id
  ON public.financial_import_jobs(import_id);

CREATE INDEX IF NOT EXISTS idx_financial_import_jobs_document_id
  ON public.financial_import_jobs(document_id);

CREATE INDEX IF NOT EXISTS idx_financial_import_jobs_tenant_slug
  ON public.financial_import_jobs(tenant_slug);

CREATE INDEX IF NOT EXISTS idx_financial_import_jobs_status
  ON public.financial_import_jobs(status);

CREATE OR REPLACE FUNCTION public.set_financial_import_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_import_jobs_updated_at ON public.financial_import_jobs;
CREATE TRIGGER trg_financial_import_jobs_updated_at
BEFORE UPDATE ON public.financial_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_financial_import_jobs_updated_at();

ALTER TABLE public.financial_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_import_jobs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.financial_import_jobs FROM anon, authenticated;
