-- Kynli invitation/membership hardening
-- LOCAL PREP ONLY: do not run automatically.

BEGIN;

-- 1) Ensure accepted_at exists for tenant-specific invite lifecycle tracking
ALTER TABLE public.portal_invites
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL;

-- 2) Indexes to support acceptance/revocation checks
CREATE INDEX IF NOT EXISTS idx_portal_invites_token ON public.portal_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_portal_invites_email_tenant_status
  ON public.portal_invites(email, tenant_slug, status)
  WHERE revoked_at IS NULL;

-- 2b) Ensure invite-token uniqueness if no equivalent uniqueness already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public'
      AND t.relname = 'portal_invites'
      AND i.indisunique
    GROUP BY i.indexrelid
    HAVING count(*) = 1
       AND bool_and(a.attname = 'invite_token')
  ) THEN
    CREATE UNIQUE INDEX ux_portal_invites_invite_token
      ON public.portal_invites(invite_token);
  END IF;
END $$;

-- 3) Uniqueness guard for workspace membership identity
--    Allows soft-deleted duplicates while preventing multiple active rows per user+tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_workspace_access_active_user_tenant
  ON public.client_workspace_access(portal_user_id, tenant_slug)
  WHERE deleted_at IS NULL;

-- 4) Atomic invite acceptance RPC
CREATE OR REPLACE FUNCTION public.accept_portal_invite_atomic(
  p_invite_token text,
  p_portal_user_id bigint,
  p_user_email text
)
RETURNS TABLE(applied boolean, tenant_slug text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_email text := lower(trim(coalesce(p_user_email, '')));
  v_invite RECORD;
  v_user RECORD;
  v_existing_access RECORD;
  v_has_primary boolean;
  v_lock_key bigint;
BEGIN
  IF trim(coalesce(p_invite_token, '')) = '' OR p_portal_user_id IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_input';
    RETURN;
  END IF;

  -- Read invite first to derive tenant-specific lock key.
  SELECT * INTO v_invite
  FROM public.portal_invites
  WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, 'invite_not_found';
    RETURN;
  END IF;

  IF coalesce(trim(v_invite.tenant_slug), '') = '' THEN
    RETURN QUERY SELECT false, NULL::text, 'missing_tenant';
    RETURN;
  END IF;

  -- Serialize accept/remove operations for this user+tenant pair.
  v_lock_key := hashtextextended(v_invite.tenant_slug || ':' || p_portal_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Re-lock and re-read invite row after advisory lock.
  SELECT * INTO v_invite
  FROM public.portal_invites
  WHERE invite_token = p_invite_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, 'invite_not_found';
    RETURN;
  END IF;

  IF lower(trim(coalesce(v_invite.email, ''))) <> v_email THEN
    RETURN QUERY SELECT false, NULL::text, 'email_mismatch';
    RETURN;
  END IF;

  IF v_invite.revoked_at IS NOT NULL OR lower(coalesce(v_invite.status, '')) = 'revoked' THEN
    RETURN QUERY SELECT false, NULL::text, 'invite_revoked';
    RETURN;
  END IF;

  IF (v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= v_now)
     OR lower(coalesce(v_invite.status, '')) = 'expired' THEN
    RETURN QUERY SELECT false, NULL::text, 'invite_expired';
    RETURN;
  END IF;

  IF lower(coalesce(v_invite.status, '')) <> 'pending' THEN
    RETURN QUERY SELECT false, NULL::text, 'invite_not_pending';
    RETURN;
  END IF;

  -- Ensure authenticated portal user record matches email and is client role.
  SELECT id, email, role INTO v_user
  FROM public.portal_users
  WHERE id = p_portal_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, 'portal_user_not_found';
    RETURN;
  END IF;

  IF lower(trim(coalesce(v_user.email, ''))) <> v_email THEN
    RETURN QUERY SELECT false, NULL::text, 'portal_user_email_mismatch';
    RETURN;
  END IF;

  IF coalesce(v_user.role, '') <> 'client' THEN
    RETURN QUERY SELECT false, NULL::text, 'non_client_role';
    RETURN;
  END IF;

  -- Prevent reactivation after removal using stale token:
  -- if there is any later revoked invite for same email+tenant, block this older token.
  IF EXISTS (
    SELECT 1
    FROM public.portal_invites pi
    WHERE lower(trim(coalesce(pi.email, ''))) = v_email
      AND pi.tenant_slug = v_invite.tenant_slug
      AND pi.revoked_at IS NOT NULL
      AND coalesce(pi.updated_at, pi.created_at) > coalesce(v_invite.created_at, v_now)
  ) THEN
    RETURN QUERY SELECT false, NULL::text, 'superseded_by_revocation';
    RETURN;
  END IF;

  SELECT * INTO v_existing_access
  FROM public.client_workspace_access
  WHERE portal_user_id = p_portal_user_id
    AND tenant_slug = v_invite.tenant_slug
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT EXISTS(
      SELECT 1 FROM public.client_workspace_access
      WHERE portal_user_id = p_portal_user_id
        AND deleted_at IS NULL
        AND is_primary = true
    ) INTO v_has_primary;

    INSERT INTO public.client_workspace_access(
      portal_user_id,
      tenant_slug,
      access_type,
      is_primary,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      p_portal_user_id,
      v_invite.tenant_slug,
      'member',
      CASE WHEN v_has_primary THEN false ELSE true END,
      v_now,
      v_now,
      NULL
    )
    ON CONFLICT (portal_user_id, tenant_slug)
    WHERE deleted_at IS NULL
    DO UPDATE SET
      deleted_at = NULL,
      updated_at = EXCLUDED.updated_at,
      access_type = CASE
        WHEN public.client_workspace_access.access_type = 'owner' THEN 'owner'
        ELSE 'member'
      END;

    -- Guarantee at least one primary after acceptance.
    IF NOT EXISTS (
      SELECT 1 FROM public.client_workspace_access
      WHERE portal_user_id = p_portal_user_id
        AND deleted_at IS NULL
        AND is_primary = true
    ) THEN
      UPDATE public.client_workspace_access
      SET is_primary = true,
          updated_at = v_now
      WHERE id = (
        SELECT id
        FROM public.client_workspace_access
        WHERE portal_user_id = p_portal_user_id
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      );
    END IF;
  END IF;

  UPDATE public.portal_invites
  SET status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  WHERE invite_token = p_invite_token
    AND status = 'pending'
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    -- Critical: if invite status transition fails after writes, abort transaction.
    RAISE EXCEPTION 'invite_status_race';
  END IF;

  RETURN QUERY SELECT true, v_invite.tenant_slug::text, NULL::text;
END;
$$;

-- 5) Revoke all pending invites except the newest one (resend hardening)
CREATE OR REPLACE FUNCTION public.revoke_pending_portal_invites_except(
  p_email text,
  p_tenant_slug text,
  p_keep_invite_token text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_slug text := trim(coalesce(p_tenant_slug, ''));
  v_keep text := trim(coalesce(p_keep_invite_token, ''));
  v_count integer := 0;
BEGIN
  IF v_email = '' OR v_slug = '' OR v_keep = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.portal_invites
  SET status = 'revoked',
      revoked_at = v_now,
      updated_at = v_now
  WHERE lower(trim(coalesce(email, ''))) = v_email
    AND tenant_slug = v_slug
    AND status = 'pending'
    AND revoked_at IS NULL
    AND invite_token <> v_keep;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6) Atomic client membership removal/revocation for a tenant.
CREATE OR REPLACE FUNCTION public.remove_client_workspace_membership_atomic(
  p_portal_user_id bigint,
  p_tenant_slug text
)
RETURNS TABLE(applied boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_slug text := trim(coalesce(p_tenant_slug, ''));
  v_user RECORD;
  v_has_primary boolean;
  v_next_slug text;
  v_lock_key bigint;
BEGIN
  IF p_portal_user_id IS NULL OR v_slug = '' THEN
    RETURN QUERY SELECT false, 'invalid_input';
    RETURN;
  END IF;

  -- Serialize accept/remove operations for this user+tenant pair.
  v_lock_key := hashtextextended(v_slug || ':' || p_portal_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id, email, role, tenant_slug INTO v_user
  FROM public.portal_users
  WHERE id = p_portal_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'portal_user_not_found';
    RETURN;
  END IF;

  IF coalesce(v_user.role, '') <> 'client' THEN
    RETURN QUERY SELECT false, 'non_client_role';
    RETURN;
  END IF;

  UPDATE public.client_workspace_access
  SET deleted_at = v_now,
      is_primary = false,
      updated_at = v_now
  WHERE portal_user_id = p_portal_user_id
    AND tenant_slug = v_slug
    AND deleted_at IS NULL;

  IF coalesce(trim(v_user.email), '') <> '' THEN
    UPDATE public.portal_invites
    SET status = 'revoked',
        revoked_at = v_now,
        updated_at = v_now
    WHERE lower(trim(coalesce(email, ''))) = lower(trim(v_user.email))
      AND tenant_slug = v_slug
      AND status = 'pending'
      AND revoked_at IS NULL;
  END IF;

  -- Ensure one primary remains if any active memberships exist.
  SELECT EXISTS (
    SELECT 1 FROM public.client_workspace_access
    WHERE portal_user_id = p_portal_user_id
      AND deleted_at IS NULL
      AND is_primary = true
  ) INTO v_has_primary;

  IF NOT v_has_primary THEN
    UPDATE public.client_workspace_access
    SET is_primary = true,
        updated_at = v_now
    WHERE id = (
      SELECT id
      FROM public.client_workspace_access
      WHERE portal_user_id = p_portal_user_id
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    );
  END IF;

  IF lower(trim(coalesce(v_user.tenant_slug, ''))) = lower(v_slug) THEN
    SELECT tenant_slug INTO v_next_slug
    FROM public.client_workspace_access
    WHERE portal_user_id = p_portal_user_id
      AND deleted_at IS NULL
    ORDER BY is_primary DESC, updated_at DESC
    LIMIT 1;

    UPDATE public.portal_users
    SET tenant_slug = v_next_slug,
        updated_at = v_now
    WHERE id = p_portal_user_id;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- Harden function execute permissions.
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_pending_portal_invites_except(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_pending_portal_invites_except(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_pending_portal_invites_except(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pending_portal_invites_except(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) TO service_role;

COMMIT;
