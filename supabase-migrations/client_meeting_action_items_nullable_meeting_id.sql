-- Allow standalone client action items not attached to a meeting.
-- Preserve foreign key behavior for non-null meeting IDs.

ALTER TABLE public.client_meeting_action_items
  ALTER COLUMN meeting_id DROP NOT NULL;
