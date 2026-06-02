-- Minimal nested folders for portal documents
CREATE TABLE IF NOT EXISTS public.portal_document_folders (
  id BIGSERIAL PRIMARY KEY,
  tenant_slug TEXT,
  parent_folder_id BIGINT REFERENCES public.portal_document_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_path TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_document_folders_tenant_parent
  ON public.portal_document_folders(tenant_slug, parent_folder_id, name);

CREATE INDEX IF NOT EXISTS idx_portal_document_folders_full_path
  ON public.portal_document_folders(tenant_slug, full_path);

-- Avoid duplicate sibling folder names within the same parent + tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_document_folders_sibling_name
  ON public.portal_document_folders(
    COALESCE(tenant_slug, '__null__'),
    COALESCE(parent_folder_id, 0),
    lower(name)
  );

-- Keep updated_at fresh on updates
CREATE OR REPLACE FUNCTION public.set_portal_document_folders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_document_folders_updated_at ON public.portal_document_folders;
CREATE TRIGGER trg_portal_document_folders_updated_at
BEFORE UPDATE ON public.portal_document_folders
FOR EACH ROW
EXECUTE FUNCTION public.set_portal_document_folders_updated_at();

-- Backend-only access pattern: service-role writes/reads via server tRPC.
-- Deny direct browser role access.
ALTER TABLE public.portal_document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_document_folders FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.portal_document_folders FROM anon, authenticated;
