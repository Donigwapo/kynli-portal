-- Separate Client Meeting vs Check-in Calls datasets while reusing shared UI/API.

ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS meeting_mode TEXT;

UPDATE public.client_meetings
SET meeting_mode = 'client_meeting'
WHERE meeting_mode IS NULL OR BTRIM(meeting_mode) = '' OR meeting_mode NOT IN ('client_meeting', 'check_in_call');

ALTER TABLE public.client_meetings
  ALTER COLUMN meeting_mode SET DEFAULT 'client_meeting';

ALTER TABLE public.client_meetings
  ALTER COLUMN meeting_mode SET NOT NULL;

ALTER TABLE public.client_meetings
  DROP CONSTRAINT IF EXISTS chk_client_meetings_mode;

ALTER TABLE public.client_meetings
  ADD CONSTRAINT chk_client_meetings_mode
  CHECK (meeting_mode IN ('client_meeting', 'check_in_call'));

CREATE INDEX IF NOT EXISTS idx_client_meetings_tenant_mode_meeting_date
  ON public.client_meetings(tenant_slug, meeting_mode, meeting_date DESC);
