-- Centralized portal activity log / audit trail
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT,
  actor_name TEXT,
  actor_email TEXT,
  actor_role TEXT,
  actor_type TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  tenant_slug TEXT,
  organization_id TEXT,
  client_id TEXT,
  file_name TEXT,
  previous_value TEXT,
  new_value TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor
  ON public.activity_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action
  ON public.activity_logs(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant
  ON public.activity_logs(tenant_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_file_name
  ON public.activity_logs(file_name);
