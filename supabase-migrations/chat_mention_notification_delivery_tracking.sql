-- Phase: Mention notification webhook delivery tracking
-- Adds delivery metadata columns used for non-blocking n8n webhook delivery.

ALTER TABLE public.portal_notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivery_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_portal_notifications_delivery_status
  ON public.portal_notifications(delivery_status, created_at DESC);
