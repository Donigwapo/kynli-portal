-- Phase 3A: Workspace Chat Internal Notes visibility layer
-- NOTE (future): add a separate message origin/type axis (e.g., user vs system)
-- rather than overloading visibility_scope for system-generated workflow events.

ALTER TABLE public.portal_chat_messages
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'workspace_public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_portal_chat_messages_visibility_scope'
  ) THEN
    ALTER TABLE public.portal_chat_messages
      ADD CONSTRAINT chk_portal_chat_messages_visibility_scope
      CHECK (visibility_scope IN ('workspace_public', 'staff_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_portal_chat_messages_tenant_visibility_created
  ON public.portal_chat_messages(tenant_slug, visibility_scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_chat_messages_dm_visibility_created
  ON public.portal_chat_messages(dm_key, visibility_scope, created_at DESC)
  WHERE dm_key IS NOT NULL;
