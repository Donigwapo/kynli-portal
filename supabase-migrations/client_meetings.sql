-- Phase 1: Coaching Client Meetings

CREATE TABLE IF NOT EXISTS public.client_meetings (
  id BIGSERIAL PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  meeting_type TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by_user_id BIGINT,
  updated_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_client_meetings_type CHECK (meeting_type IS NULL OR meeting_type IN ('quarterly_review','monthly_cfo','tax_planning','bookkeeping_review','other')),
  CONSTRAINT chk_client_meetings_status CHECK (status IN ('scheduled','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_client_meetings_tenant_meeting_date
  ON public.client_meetings(tenant_slug, meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_client_meetings_tenant_created_at
  ON public.client_meetings(tenant_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_meeting_action_items (
  id BIGSERIAL PRIMARY KEY,
  meeting_id BIGINT NOT NULL REFERENCES public.client_meetings(id) ON DELETE CASCADE,
  tenant_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  assigned_to_role TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_client_meeting_action_items_role CHECK (assigned_to_role IS NULL OR assigned_to_role IN ('client','accountant','admin')),
  CONSTRAINT chk_client_meeting_action_items_status CHECK (status IN ('open','in_progress','done'))
);

CREATE INDEX IF NOT EXISTS idx_client_meeting_action_items_meeting_sort
  ON public.client_meeting_action_items(meeting_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_client_meeting_action_items_tenant_status_due
  ON public.client_meeting_action_items(tenant_slug, status, due_date);

CREATE OR REPLACE FUNCTION public.set_client_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_meetings_updated_at ON public.client_meetings;
CREATE TRIGGER trg_client_meetings_updated_at
BEFORE UPDATE ON public.client_meetings
FOR EACH ROW EXECUTE FUNCTION public.set_client_meetings_updated_at();

CREATE OR REPLACE FUNCTION public.set_client_meeting_action_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_meeting_action_items_updated_at ON public.client_meeting_action_items;
CREATE TRIGGER trg_client_meeting_action_items_updated_at
BEFORE UPDATE ON public.client_meeting_action_items
FOR EACH ROW EXECUTE FUNCTION public.set_client_meeting_action_items_updated_at();
