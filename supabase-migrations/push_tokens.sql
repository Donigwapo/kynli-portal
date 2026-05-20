-- Phase: Firebase Cloud Messaging token registration for web push

CREATE TABLE IF NOT EXISTS public.portal_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  portal_user_id BIGINT NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_push_tokens_user_active
  ON public.portal_push_tokens(portal_user_id, is_active, updated_at DESC);
