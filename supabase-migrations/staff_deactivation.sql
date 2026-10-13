-- Staff deactivation/reactivation safety workflow
-- Adds status columns to portal_users and durable assignment snapshots per deactivation cycle.
-- Execute as a single transaction in SQL Editor to avoid partial-apply states.
BEGIN;

ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by BIGINT,
  ADD COLUMN IF NOT EXISTS last_deactivation_event_id UUID;

UPDATE public.portal_users
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE public.portal_users
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.portal_users
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.portal_users
  DROP CONSTRAINT IF EXISTS chk_portal_users_status;

ALTER TABLE public.portal_users
  ADD CONSTRAINT chk_portal_users_status
  CHECK (status IN ('active', 'inactive'));

CREATE TABLE IF NOT EXISTS public.staff_deactivation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id BIGINT NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  deactivated_by BIGINT REFERENCES public.portal_users(id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reactivated_by BIGINT REFERENCES public.portal_users(id) ON DELETE SET NULL,
  reactivated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chk_staff_deactivation_events_status CHECK (status IN ('open', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_deactivation_events_open_per_staff
  ON public.staff_deactivation_events(staff_user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_staff_deactivation_events_staff
  ON public.staff_deactivation_events(staff_user_id, deactivated_at DESC);

CREATE TABLE IF NOT EXISTS public.staff_assignment_snapshots (
  id BIGSERIAL PRIMARY KEY,
  deactivation_event_id UUID NOT NULL REFERENCES public.staff_deactivation_events(id) ON DELETE CASCADE,
  staff_user_id BIGINT NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  tenant_slug TEXT NOT NULL,
  original_assigned_at TIMESTAMPTZ,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restoration_status TEXT NOT NULL DEFAULT 'pending',
  restoration_reason TEXT,
  restored_at TIMESTAMPTZ,
  restored_assignment_id BIGINT,
  CONSTRAINT chk_staff_assignment_snapshots_status CHECK (
    restoration_status IN ('pending', 'restored', 'skipped_conflict', 'skipped_ineligible', 'skipped_missing_client', 'skipped_not_authorized')
  ),
  CONSTRAINT uq_staff_assignment_snapshots_event_tenant UNIQUE (deactivation_event_id, staff_user_id, tenant_slug)
);

CREATE INDEX IF NOT EXISTS idx_staff_assignment_snapshots_staff_event
  ON public.staff_assignment_snapshots(staff_user_id, deactivation_event_id, restoration_status);

CREATE INDEX IF NOT EXISTS idx_staff_assignment_snapshots_tenant
  ON public.staff_assignment_snapshots(tenant_slug);

-- Keep deactivated_by consistent as FK.
-- Fail fast on unexpected schema issues instead of silently skipping constraint failures.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'portal_users'
      AND constraint_name = 'fk_portal_users_deactivated_by'
  ) THEN
    ALTER TABLE public.portal_users
      ADD CONSTRAINT fk_portal_users_deactivated_by
      FOREIGN KEY (deactivated_by)
      REFERENCES public.portal_users(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_staff_to_client_locked(
  p_staff_user_id BIGINT,
  p_tenant_slug TEXT,
  p_actor_user_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.portal_users%ROWTYPE;
  v_staff public.portal_users%ROWTYPE;
  v_tenant_slug TEXT := lower(trim(coalesce(p_tenant_slug, '')));
  v_tenant_active BOOLEAN;
BEGIN
  IF p_staff_user_id IS NULL OR p_staff_user_id <= 0 THEN
    RAISE EXCEPTION 'Invalid staff id';
  END IF;

  IF p_actor_user_id IS NULL OR p_actor_user_id <= 0 THEN
    RAISE EXCEPTION 'Invalid actor id';
  END IF;

  IF v_tenant_slug = '' THEN
    RAISE EXCEPTION 'Invalid tenant slug';
  END IF;

  -- 1) Lock actor/staff rows first (global lock order)
  SELECT * INTO v_actor
  FROM public.portal_users
  WHERE id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor not found';
  END IF;

  IF v_actor.role <> 'admin' OR COALESCE(v_actor.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'Only active admins can assign staff to clients';
  END IF;

  SELECT * INTO v_staff
  FROM public.portal_users
  WHERE id = p_staff_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff user not found';
  END IF;

  IF COALESCE(v_staff.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'Cannot assign an inactive staff member';
  END IF;

  IF v_staff.role NOT IN ('admin', 'accounting_manager', 'tax_manager', 'accountant') THEN
    RAISE EXCEPTION 'Target user is not staff';
  END IF;

  -- 2) Lock tenant scope for assignment writer coordination
  PERFORM pg_advisory_xact_lock(84721, hashtext(v_tenant_slug));

  -- 3) Validate and lock tenant row
  SELECT t.is_active INTO v_tenant_active
  FROM public.portal_tenants t
  WHERE lower(t.slug) = v_tenant_slug
  FOR UPDATE;

  IF NOT FOUND OR v_tenant_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot assign staff to an inactive or missing client';
  END IF;

  INSERT INTO public.staff_client_assignments (staff_id, tenant_slug)
  VALUES (v_staff.id, v_tenant_slug)
  ON CONFLICT (staff_id, tenant_slug) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_staff_member(
  p_staff_user_id BIGINT,
  p_actor_user_id BIGINT
)
RETURNS TABLE (
  deactivation_event_id UUID,
  assignment_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff portal_users%ROWTYPE;
  v_actor portal_users%ROWTYPE;
  v_event_id UUID;
  v_assignment_count INTEGER := 0;
  v_active_admin_count INTEGER := 0;
  v_tenant_slug TEXT;
BEGIN
  -- Serialize deactivation attempts globally to prevent cross-admin lock inversions
  -- and ensure last-admin safeguards are evaluated against a stable state.
  PERFORM pg_advisory_xact_lock(84722, 1);

  SELECT * INTO v_actor
  FROM public.portal_users
  WHERE id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor not found';
  END IF;

  IF v_actor.role <> 'admin' OR COALESCE(v_actor.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'Only active admins can deactivate staff';
  END IF;

  SELECT * INTO v_staff
  FROM public.portal_users
  WHERE id = p_staff_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff user not found';
  END IF;

  IF v_staff.role NOT IN ('admin', 'accounting_manager', 'tax_manager', 'accountant') THEN
    RAISE EXCEPTION 'Target user is not staff';
  END IF;

  IF COALESCE(v_staff.status, 'active') = 'inactive' THEN
    RAISE EXCEPTION 'Staff user is already inactive';
  END IF;

  IF v_staff.id = v_actor.id THEN
    RAISE EXCEPTION 'Admins cannot deactivate themselves';
  END IF;

  IF v_staff.role = 'admin' THEN
    SELECT count(*) INTO v_active_admin_count
    FROM public.portal_users
    WHERE role = 'admin'
      AND COALESCE(status, 'active') = 'active';

    IF v_active_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot deactivate the last active admin';
    END IF;
  END IF;

  INSERT INTO public.staff_deactivation_events (staff_user_id, deactivated_by, status)
  VALUES (v_staff.id, v_actor.id, 'open')
  RETURNING id INTO v_event_id;

  -- Lock all tenant scopes currently assigned to the staff member in deterministic order.
  FOR v_tenant_slug IN
    SELECT DISTINCT a.tenant_slug
    FROM public.staff_client_assignments a
    WHERE a.staff_id = v_staff.id
    ORDER BY a.tenant_slug
  LOOP
    PERFORM pg_advisory_xact_lock(84721, hashtext(v_tenant_slug));
  END LOOP;

  -- Snapshot and delete from the same locked/stable assignment set.
  WITH locked_assignments AS (
    SELECT a.id, a.staff_id, a.tenant_slug, a.assigned_at
    FROM public.staff_client_assignments a
    WHERE a.staff_id = v_staff.id
    ORDER BY a.tenant_slug, a.id
    FOR UPDATE
  ), inserted_snapshots AS (
    INSERT INTO public.staff_assignment_snapshots (
      deactivation_event_id,
      staff_user_id,
      tenant_slug,
      original_assigned_at,
      snapshot_at,
      restoration_status
    )
    SELECT
      v_event_id,
      la.staff_id,
      la.tenant_slug,
      la.assigned_at,
      NOW(),
      'pending'
    FROM locked_assignments la
    RETURNING tenant_slug
  )
  DELETE FROM public.staff_client_assignments a
  USING locked_assignments la
  WHERE a.id = la.id;

  GET DIAGNOSTICS v_assignment_count = ROW_COUNT;

  UPDATE public.portal_users
  SET
    status = 'inactive',
    deactivated_at = NOW(),
    deactivated_by = v_actor.id,
    last_deactivation_event_id = v_event_id,
    updated_at = NOW()
  WHERE id = v_staff.id;

  UPDATE public.staff_deactivation_events
  SET snapshot_count = v_assignment_count
  WHERE id = v_event_id;

  RETURN QUERY SELECT v_event_id, v_assignment_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_staff_reactivation(
  p_staff_user_id BIGINT
)
RETURNS TABLE (
  tenant_slug TEXT,
  tenant_name TEXT,
  classification TEXT,
  blocking_staff_ids BIGINT[],
  blocking_staff_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT last_deactivation_event_id INTO v_event_id
  FROM public.portal_users
  WHERE id = p_staff_user_id;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH snap AS (
    SELECT s.tenant_slug
    FROM public.staff_assignment_snapshots s
    WHERE s.staff_user_id = p_staff_user_id
      AND s.deactivation_event_id = v_event_id
      AND s.restoration_status = 'pending'
  ),
  tenant_state AS (
    SELECT
      snap.tenant_slug,
      t.company_name,
      t.is_active,
      t.slug IS NOT NULL AS tenant_exists
    FROM snap
    LEFT JOIN public.portal_tenants t
      ON t.slug = snap.tenant_slug
  ),
  blockers AS (
    SELECT
      ts.tenant_slug,
      array_agg(DISTINCT pu.id ORDER BY pu.id) FILTER (WHERE pu.id IS NOT NULL) AS staff_ids,
      array_agg(DISTINCT COALESCE(pu.name, pu.email, ('User #' || pu.id::text)) ORDER BY COALESCE(pu.name, pu.email, ('User #' || pu.id::text))) FILTER (WHERE pu.id IS NOT NULL) AS staff_names
    FROM tenant_state ts
    LEFT JOIN public.staff_client_assignments a
      ON a.tenant_slug = ts.tenant_slug
     AND a.staff_id <> p_staff_user_id
    LEFT JOIN public.portal_users pu
      ON pu.id = a.staff_id
     AND pu.role IN ('accountant', 'accounting_manager', 'tax_manager')
     AND COALESCE(pu.status, 'active') = 'active'
    GROUP BY ts.tenant_slug
  )
  SELECT
    ts.tenant_slug,
    ts.company_name,
    CASE
      WHEN NOT ts.tenant_exists THEN 'client_inactive_or_missing'
      WHEN ts.is_active IS NOT TRUE THEN 'client_inactive_or_missing'
      WHEN coalesce(array_length(b.staff_ids, 1), 0) > 0 THEN 'assigned_to_active_accountant'
      ELSE 'eligible_restore'
    END AS classification,
    coalesce(b.staff_ids, ARRAY[]::BIGINT[]) AS blocking_staff_ids,
    coalesce(b.staff_names, ARRAY[]::TEXT[]) AS blocking_staff_names
  FROM tenant_state ts
  LEFT JOIN blockers b
    ON b.tenant_slug = ts.tenant_slug
  ORDER BY ts.tenant_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_staff_member(
  p_staff_user_id BIGINT,
  p_actor_user_id BIGINT
)
RETURNS TABLE (
  deactivation_event_id UUID,
  restored_count INTEGER,
  skipped_conflict_count INTEGER,
  skipped_ineligible_count INTEGER,
  skipped_missing_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff portal_users%ROWTYPE;
  v_actor portal_users%ROWTYPE;
  v_event_id UUID;
  v_restored INTEGER := 0;
  v_skipped_conflict INTEGER := 0;
  v_skipped_ineligible INTEGER := 0;
  v_skipped_missing INTEGER := 0;
  v_has_blocker BOOLEAN := false;
  v_tenant_active BOOLEAN;
  v_inserted_assignment_id BIGINT;
  v_existing_assignment_id BIGINT;
  r RECORD;
BEGIN
  SELECT * INTO v_actor
  FROM public.portal_users
  WHERE id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor not found';
  END IF;

  IF v_actor.role <> 'admin' OR COALESCE(v_actor.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'Only active admins can reactivate staff';
  END IF;

  SELECT * INTO v_staff
  FROM public.portal_users
  WHERE id = p_staff_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff user not found';
  END IF;

  IF v_staff.role NOT IN ('admin', 'accounting_manager', 'tax_manager', 'accountant') THEN
    RAISE EXCEPTION 'Target user is not staff';
  END IF;

  IF COALESCE(v_staff.status, 'active') <> 'inactive' THEN
    RAISE EXCEPTION 'Staff user is not inactive';
  END IF;

  v_event_id := v_staff.last_deactivation_event_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'No deactivation snapshot found for staff user';
  END IF;

  FOR r IN
    SELECT s.id, s.tenant_slug
    FROM public.staff_assignment_snapshots s
    WHERE s.staff_user_id = v_staff.id
      AND s.deactivation_event_id = v_event_id
      AND s.restoration_status = 'pending'
    ORDER BY s.tenant_slug, s.id
    FOR UPDATE
  LOOP
    -- Maintain global order: lock actor/staff first, then tenant scope lock.
    PERFORM pg_advisory_xact_lock(84721, hashtext(r.tenant_slug));

    SELECT t.is_active INTO v_tenant_active
    FROM public.portal_tenants t
    WHERE t.slug = r.tenant_slug
    FOR UPDATE;

    IF NOT FOUND OR v_tenant_active IS NOT TRUE THEN
      UPDATE public.staff_assignment_snapshots
      SET restoration_status = 'skipped_missing_client',
          restoration_reason = 'Client missing or inactive',
          restored_at = NOW()
      WHERE id = r.id;
      v_skipped_missing := v_skipped_missing + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_client_assignments a
      JOIN public.portal_users pu ON pu.id = a.staff_id
      WHERE a.tenant_slug = r.tenant_slug
        AND a.staff_id <> v_staff.id
        AND pu.role IN ('accountant', 'accounting_manager', 'tax_manager')
        AND COALESCE(pu.status, 'active') = 'active'
      FOR UPDATE OF a
    ) INTO v_has_blocker;

    IF v_has_blocker THEN
      UPDATE public.staff_assignment_snapshots
      SET restoration_status = 'skipped_conflict',
          restoration_reason = 'Another active accountant is already assigned',
          restored_at = NOW()
      WHERE id = r.id;
      v_skipped_conflict := v_skipped_conflict + 1;
      CONTINUE;
    END IF;

    v_inserted_assignment_id := NULL;
    v_existing_assignment_id := NULL;

    INSERT INTO public.staff_client_assignments (staff_id, tenant_slug)
    VALUES (v_staff.id, r.tenant_slug)
    ON CONFLICT (staff_id, tenant_slug) DO NOTHING
    RETURNING id INTO v_inserted_assignment_id;

    IF v_inserted_assignment_id IS NOT NULL THEN
      UPDATE public.staff_assignment_snapshots
      SET restoration_status = 'restored',
          restoration_reason = null,
          restored_at = NOW(),
          restored_assignment_id = v_inserted_assignment_id
      WHERE id = r.id;

      v_restored := v_restored + 1;
    ELSE
      -- Assignment already existed for this staff+tenant in current state.
      SELECT a.id INTO v_existing_assignment_id
      FROM public.staff_client_assignments a
      WHERE a.staff_id = v_staff.id
        AND a.tenant_slug = r.tenant_slug
      LIMIT 1;

      UPDATE public.staff_assignment_snapshots
      SET restoration_status = 'restored',
          restoration_reason = 'Already assigned at reactivation time',
          restored_at = NOW(),
          restored_assignment_id = v_existing_assignment_id
      WHERE id = r.id;
    END IF;
  END LOOP;

  UPDATE public.portal_users
  SET
    status = 'active',
    deactivated_at = NULL,
    deactivated_by = NULL,
    updated_at = NOW()
  WHERE id = v_staff.id;

  UPDATE public.staff_deactivation_events
  SET status = 'closed',
      reactivated_by = v_actor.id,
      reactivated_at = NOW()
  WHERE id = v_event_id
    AND status = 'open';

  RETURN QUERY
  SELECT v_event_id, v_restored, v_skipped_conflict, v_skipped_ineligible, v_skipped_missing;
END;
$$;

-- Lock down RPC execution; these privileged SECURITY DEFINER functions must not be callable by anon/authenticated users.
REVOKE ALL ON FUNCTION public.assign_staff_to_client_locked(BIGINT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_staff_member(BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_staff_reactivation(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_staff_member(BIGINT, BIGINT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.assign_staff_to_client_locked(BIGINT, TEXT, BIGINT) FROM anon;
    REVOKE ALL ON FUNCTION public.deactivate_staff_member(BIGINT, BIGINT) FROM anon;
    REVOKE ALL ON FUNCTION public.preview_staff_reactivation(BIGINT) FROM anon;
    REVOKE ALL ON FUNCTION public.reactivate_staff_member(BIGINT, BIGINT) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.assign_staff_to_client_locked(BIGINT, TEXT, BIGINT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.deactivate_staff_member(BIGINT, BIGINT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.preview_staff_reactivation(BIGINT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.reactivate_staff_member(BIGINT, BIGINT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.assign_staff_to_client_locked(BIGINT, TEXT, BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.deactivate_staff_member(BIGINT, BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.preview_staff_reactivation(BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.reactivate_staff_member(BIGINT, BIGINT) TO service_role;
  END IF;
END;
$$;

COMMIT;
