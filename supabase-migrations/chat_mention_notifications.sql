-- Phase: Chat mention notifications
-- Creates durable notification records for @mentions in chat messages/replies.

CREATE TABLE IF NOT EXISTS portal_notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  sender_user_id BIGINT REFERENCES portal_users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL DEFAULT 'chat_mention',
  title TEXT NOT NULL,
  content TEXT,
  tenant_slug TEXT,
  assignment_id BIGINT,
  dm_key TEXT,
  chat_message_id BIGINT,
  thread_parent_id BIGINT,
  target_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_recipient_created
  ON portal_notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_unread
  ON portal_notifications(recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_chat_message
  ON portal_notifications(chat_message_id);

-- Prevent duplicate mention notifications for the same recipient/message/type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_notifications_chat_mention
  ON portal_notifications(recipient_user_id, chat_message_id, notification_type)
  WHERE chat_message_id IS NOT NULL;
