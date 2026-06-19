-- Phase 2: Workspace Chat unread indicators + last-read state

CREATE TABLE IF NOT EXISTS public.portal_chat_reads (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  tenant_slug TEXT NOT NULL,
  assignment_id BIGINT,
  dm_key TEXT,
  last_read_message_id BIGINT,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep one read cursor per user/lane scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_chat_reads_scope
  ON public.portal_chat_reads(
    user_id,
    tenant_slug,
    COALESCE(assignment_id, -1),
    COALESCE(dm_key, '')
  );

CREATE INDEX IF NOT EXISTS idx_portal_chat_reads_user_updated
  ON public.portal_chat_reads(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_chat_reads_tenant
  ON public.portal_chat_reads(tenant_slug, assignment_id, dm_key);

CREATE OR REPLACE FUNCTION public.set_portal_chat_reads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_chat_reads_updated_at ON public.portal_chat_reads;
CREATE TRIGGER trg_portal_chat_reads_updated_at
BEFORE UPDATE ON public.portal_chat_reads
FOR EACH ROW
EXECUTE FUNCTION public.set_portal_chat_reads_updated_at();

ALTER TABLE public.portal_chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_chat_reads FORCE ROW LEVEL SECURITY;

-- Backend-only access (service-role through server).
REVOKE ALL ON public.portal_chat_reads FROM anon, authenticated;
