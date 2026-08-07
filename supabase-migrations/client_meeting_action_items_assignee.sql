-- Add explicit assignee reference for client meeting / check-in action items.
-- Nullable and backward-compatible.

ALTER TABLE public.client_meeting_action_items
  ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_client_meeting_action_items_tenant_assignee
  ON public.client_meeting_action_items(tenant_slug, assigned_to_user_id);
