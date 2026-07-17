-- Track when a reviewed import was committed as a final financial period.
ALTER TABLE public.financial_import_jobs
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_financial_import_jobs_saved_at
  ON public.financial_import_jobs(saved_at);
