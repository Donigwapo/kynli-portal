BEGIN;

-- Fix ambiguous column references in accept_portal_invite_atomic (PostgreSQL 42702).
-- Keep signature/return shape unchanged.
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
#variable_conflict use_column
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
  FROM public.portal_invites pi
  WHERE pi.invite_token = p_invite_token;

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
  FROM public.portal_invites pi
  WHERE pi.invite_token = p_invite_token
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
  SELECT pu.id, pu.email, pu.role INTO v_user
  FROM public.portal_users pu
  WHERE pu.id = p_portal_user_id
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

  SELECT cwa.* INTO v_existing_access
  FROM public.client_workspace_access cwa
  WHERE cwa.portal_user_id = p_portal_user_id
    AND cwa.tenant_slug = v_invite.tenant_slug
    AND cwa.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.client_workspace_access cwa
      WHERE cwa.portal_user_id = p_portal_user_id
        AND cwa.deleted_at IS NULL
        AND cwa.is_primary = true
    ) INTO v_has_primary;

    INSERT INTO public.client_workspace_access AS cwa(
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
        WHEN cwa.access_type = 'owner' THEN 'owner'
        ELSE 'member'
      END;

    -- Guarantee at least one primary after acceptance.
    IF NOT EXISTS (
      SELECT 1
      FROM public.client_workspace_access cwa
      WHERE cwa.portal_user_id = p_portal_user_id
        AND cwa.deleted_at IS NULL
        AND cwa.is_primary = true
    ) THEN
      UPDATE public.client_workspace_access cwa
      SET is_primary = true,
          updated_at = v_now
      WHERE cwa.id = (
        SELECT cwa2.id
        FROM public.client_workspace_access cwa2
        WHERE cwa2.portal_user_id = p_portal_user_id
          AND cwa2.deleted_at IS NULL
        ORDER BY cwa2.updated_at DESC
        LIMIT 1
      );
    END IF;
  END IF;

  UPDATE public.portal_invites pi
  SET status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  WHERE pi.invite_token = p_invite_token
    AND pi.status = 'pending'
    AND pi.revoked_at IS NULL;

  IF NOT FOUND THEN
    -- Critical: if invite status transition fails after writes, abort transaction.
    RAISE EXCEPTION 'invite_status_race';
  END IF;

  RETURN QUERY SELECT true, v_invite.tenant_slug::text, NULL::text;
END;
$$;

-- Preserve restricted execute permissions.
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) TO service_role;

COMMIT;
