BEGIN;

-- Record how tenant access was provisioned so Business Members can reliably distinguish
-- admin-granted access from invitation-accepted access.
ALTER TABLE public.client_workspace_access
  ADD COLUMN IF NOT EXISTS access_grant_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_workspace_access_access_grant_source_check'
      AND conrelid = 'public.client_workspace_access'::regclass
  ) THEN
    ALTER TABLE public.client_workspace_access
      ADD CONSTRAINT client_workspace_access_access_grant_source_check
      CHECK (access_grant_source IN ('legacy', 'admin_granted', 'invite_accepted'));
  END IF;
END $$;

UPDATE public.client_workspace_access
SET access_grant_source = 'legacy'
WHERE access_grant_source IS NULL;

ALTER TABLE public.client_workspace_access
  ALTER COLUMN access_grant_source SET DEFAULT 'legacy';

ALTER TABLE public.client_workspace_access
  ALTER COLUMN access_grant_source SET NOT NULL;

-- Align invitation-acceptance RPC with the status constraint and grant-source tracking.
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

  v_lock_key := hashtextextended(v_invite.tenant_slug || ':' || p_portal_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

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
      access_grant_source,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      p_portal_user_id,
      v_invite.tenant_slug,
      'member',
      CASE WHEN v_has_primary THEN false ELSE true END,
      'invite_accepted',
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
      END,
      access_grant_source = CASE
        WHEN cwa.access_type = 'owner' THEN cwa.access_grant_source
        WHEN cwa.access_grant_source = 'admin_granted' THEN cwa.access_grant_source
        ELSE 'invite_accepted'
      END;

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
  SET status = 'used',
      used_at = v_now,
      accepted_at = v_now,
      updated_at = v_now
  WHERE pi.invite_token = p_invite_token
    AND pi.status = 'pending'
    AND pi.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_status_race';
  END IF;

  RETURN QUERY SELECT true, v_invite.tenant_slug::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) TO service_role;

-- Atomic admin grant RPC: membership + provenance commit together.
CREATE OR REPLACE FUNCTION public.grant_client_workspace_access_admin_atomic(
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
  v_tenant RECORD;
  v_has_primary boolean;
  v_lock_key bigint;
  v_primary_lock_key bigint;
BEGIN
  IF p_portal_user_id IS NULL OR v_slug = '' THEN
    RETURN QUERY SELECT false, 'invalid_input';
    RETURN;
  END IF;

  SELECT pt.slug, coalesce(pt.is_active, true) AS is_active
  INTO v_tenant
  FROM public.portal_tenants pt
  WHERE pt.slug = v_slug;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_tenant';
    RETURN;
  END IF;

  IF NOT coalesce(v_tenant.is_active, true) THEN
    RETURN QUERY SELECT false, 'inactive_tenant';
    RETURN;
  END IF;

  v_lock_key := hashtextextended(v_slug || ':' || p_portal_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Serialize primary-workspace assignment operations per user across different-tenant grants.
  v_primary_lock_key := hashtextextended('primary:' || p_portal_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_primary_lock_key);

  SELECT pu.id, pu.role
  INTO v_user
  FROM public.portal_users pu
  WHERE pu.id = p_portal_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'portal_user_not_found';
    RETURN;
  END IF;

  IF coalesce(v_user.role, '') <> 'client' THEN
    RETURN QUERY SELECT false, 'non_client_role';
    RETURN;
  END IF;

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
    access_grant_source,
    created_at,
    updated_at,
    deleted_at
  ) VALUES (
    p_portal_user_id,
    v_slug,
    'member',
    CASE WHEN v_has_primary THEN false ELSE true END,
    'admin_granted',
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
    END,
    access_grant_source = CASE
      WHEN cwa.access_type = 'owner' THEN cwa.access_grant_source
      WHEN cwa.access_grant_source = 'invite_accepted' THEN cwa.access_grant_source
      WHEN cwa.access_grant_source = 'admin_granted' THEN cwa.access_grant_source
      ELSE 'admin_granted'
    END;

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

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_client_workspace_access_admin_atomic(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_client_workspace_access_admin_atomic(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_client_workspace_access_admin_atomic(bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_client_workspace_access_admin_atomic(bigint, text) TO service_role;

COMMIT;
