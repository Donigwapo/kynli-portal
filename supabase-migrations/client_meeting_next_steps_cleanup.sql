-- Phase: Client Meeting Next Steps simplification
-- Remove explicit assignment and align status values to Open / In Progress / Completed.

ALTER TABLE public.client_meeting_action_items
  DROP CONSTRAINT IF EXISTS chk_client_meeting_action_items_status;

ALTER TABLE public.client_meeting_action_items
  ADD CONSTRAINT chk_client_meeting_action_items_status
  CHECK (status IN ('open','in_progress','completed'));

-- Normalize legacy values if present.
UPDATE public.client_meeting_action_items
SET status = 'completed'
WHERE status = 'done';

ALTER TABLE public.client_meeting_action_items
  DROP CONSTRAINT IF EXISTS chk_client_meeting_action_items_role;

ALTER TABLE public.client_meeting_action_items
  DROP COLUMN IF EXISTS assigned_to_role;
