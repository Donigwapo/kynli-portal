-- Incremental hardening + structured service assignments for accountant roster
-- Safe follow-up migration after prior client_roster_services deployment.
-- Keeps services separate from portal_tenants.package_tier.

CREATE TABLE IF NOT EXISTS public.client_roster_services (
  id BIGSERIAL PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  roster_entry_id BIGINT NULL,
  client_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_roster_services_tenant
  ON public.client_roster_services(tenant_slug);

CREATE INDEX IF NOT EXISTS idx_client_roster_services_tenant_roster
  ON public.client_roster_services(tenant_slug, roster_entry_id);

CREATE INDEX IF NOT EXISTS idx_client_roster_services_tenant_client
  ON public.client_roster_services(tenant_slug, client_name);

CREATE INDEX IF NOT EXISTS idx_client_roster_services_tenant_roster_service
  ON public.client_roster_services(tenant_slug, roster_entry_id, service_name);

DROP INDEX IF EXISTS public.uq_client_roster_services_unique;

ALTER TABLE public.client_roster_services
  ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.client_roster_services
  DROP CONSTRAINT IF EXISTS chk_client_roster_services_service_name_nonempty;
ALTER TABLE public.client_roster_services
  ADD CONSTRAINT chk_client_roster_services_service_name_nonempty
  CHECK (btrim(service_name) <> '');

ALTER TABLE public.client_roster_services
  DROP CONSTRAINT IF EXISTS chk_client_roster_services_status_valid;
ALTER TABLE public.client_roster_services
  ADD CONSTRAINT chk_client_roster_services_status_valid
  CHECK (status IN ('active', 'inactive', 'churned'));

-- Deterministic dedupe BEFORE unique indexes (case-insensitive)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_slug, roster_entry_id, lower(btrim(service_name))
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.client_roster_services
  WHERE roster_entry_id IS NOT NULL
)
DELETE FROM public.client_roster_services s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_slug, lower(btrim(service_name))
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.client_roster_services
  WHERE roster_entry_id IS NULL
)
DELETE FROM public.client_roster_services s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- Recreate canonical unique indexes on every run to avoid stale definitions.
DROP INDEX IF EXISTS public.uq_client_roster_services_roster;
DROP INDEX IF EXISTS public.uq_client_roster_services_fallback;

CREATE UNIQUE INDEX uq_client_roster_services_roster
  ON public.client_roster_services(tenant_slug, roster_entry_id, lower(service_name))
  WHERE roster_entry_id IS NOT NULL;

CREATE UNIQUE INDEX uq_client_roster_services_fallback
  ON public.client_roster_services(tenant_slug, lower(service_name))
  WHERE roster_entry_id IS NULL;

-- RLS posture
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
      AND rolbypassrls = true
  ) THEN
    RAISE EXCEPTION 'service_role must have BYPASSRLS=true when FORCE RLS is enabled for client_roster_services';
  END IF;
END;
$$;

ALTER TABLE public.client_roster_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_roster_services FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_roster_services FROM PUBLIC;
REVOKE ALL ON TABLE public.client_roster_services FROM anon;
REVOKE ALL ON TABLE public.client_roster_services FROM authenticated;

-- Remove prior overload, if present
DROP FUNCTION IF EXISTS public.replace_client_roster_services(TEXT, BIGINT, TEXT, TEXT[]);

-- Structured, typed replacement function
CREATE OR REPLACE FUNCTION public.replace_client_roster_services(
  p_tenant_slug TEXT,
  p_roster_entry_id BIGINT,
  p_client_name TEXT,
  p_services JSONB
)
RETURNS TABLE (
  tenant_slug TEXT,
  roster_entry_id BIGINT,
  client_name TEXT,
  service_name TEXT,
  monthly_amount NUMERIC,
  service_start_date DATE,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant_slug TEXT := coalesce(trim(p_tenant_slug), '');
  v_client_name TEXT := coalesce(trim(p_client_name), '');
  v_services JSONB := coalesce(p_services, '[]'::jsonb);
  v_service_count INTEGER;

  v_item JSONB;
  v_ord BIGINT;

  v_name TEXT;
  v_name_key TEXT;
  v_amount_text TEXT;
  v_amount NUMERIC;
  v_start_text TEXT;
  v_start_date DATE;
  v_status TEXT;

  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_tenant_slug = '' THEN
    RAISE EXCEPTION 'p_tenant_slug is required';
  END IF;

  IF v_client_name = '' THEN
    RAISE EXCEPTION 'p_client_name is required';
  END IF;

  IF jsonb_typeof(v_services) <> 'array' THEN
    RAISE EXCEPTION 'p_services must be a JSON array';
  END IF;

  -- Require pg_input_is_valid for strict date validation safety.
  IF to_regprocedure('pg_catalog.pg_input_is_valid(text,text)') IS NULL THEN
    RAISE EXCEPTION 'pg_input_is_valid(text,text) is required for strict service_start_date validation';
  END IF;

  v_service_count := coalesce(jsonb_array_length(v_services), 0);
  IF v_service_count > 50 THEN
    RAISE EXCEPTION 'A maximum of 50 services is allowed per client';
  END IF;

  -- Delete existing identity scope first (fully qualified to avoid output-variable ambiguity).
  IF p_roster_entry_id IS NULL THEN
    DELETE FROM public.client_roster_services AS crs
    WHERE crs.tenant_slug = v_tenant_slug
      AND crs.roster_entry_id IS NULL;
  ELSE
    DELETE FROM public.client_roster_services AS crs
    WHERE crs.tenant_slug = v_tenant_slug
      AND crs.roster_entry_id = p_roster_entry_id;
  END IF;

  -- Empty array intentionally means "remove all".
  IF v_service_count = 0 THEN
    RETURN;
  END IF;

  FOR v_item, v_ord IN
    SELECT value, ord
    FROM jsonb_array_elements(v_services) WITH ORDINALITY AS t(value, ord)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'services[%] must be an object', v_ord;
    END IF;

    v_name := btrim(coalesce(v_item->>'name', ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'services[%].name is required', v_ord;
    END IF;
    IF char_length(v_name) > 100 THEN
      RAISE EXCEPTION 'services[%].name must be 100 characters or fewer', v_ord;
    END IF;

    v_name_key := lower(v_name);

    v_amount_text := btrim(coalesce(v_item->>'monthlyAmount', ''));
    IF v_amount_text = '' THEN
      RAISE EXCEPTION 'services[%].monthlyAmount is required', v_ord;
    END IF;
    IF v_amount_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'services[%].monthlyAmount must be numeric', v_ord;
    END IF;

    v_amount := v_amount_text::numeric;
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'services[%].monthlyAmount must be >= 0', v_ord;
    END IF;
    IF v_amount > 1000000000 THEN
      RAISE EXCEPTION 'services[%].monthlyAmount must be <= 1000000000', v_ord;
    END IF;
    v_amount := round(v_amount, 2);

    v_start_text := btrim(coalesce(v_item->>'startDate', ''));
    IF v_start_text = '' THEN
      RAISE EXCEPTION 'services[%].startDate is required', v_ord;
    END IF;
    IF v_start_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'services[%].startDate must use YYYY-MM-DD', v_ord;
    END IF;
    IF NOT pg_catalog.pg_input_is_valid(v_start_text, 'date') THEN
      RAISE EXCEPTION 'services[%].startDate is not a valid date', v_ord;
    END IF;

    v_start_date := v_start_text::date;
    IF v_start_date > current_date THEN
      RAISE EXCEPTION 'services[%].startDate cannot be in the future', v_ord;
    END IF;

    -- Missing status defaults to active; invalid explicit value is rejected.
    v_status := lower(coalesce(v_item->>'status', 'active'));
    IF v_status NOT IN ('active', 'inactive', 'churned') THEN
      RAISE EXCEPTION 'services[%].status must be one of active, inactive, churned', v_ord;
    END IF;

    -- Case-insensitive dedupe preserving first occurrence.
    IF array_position(v_seen_keys, v_name_key) IS NOT NULL THEN
      CONTINUE;
    END IF;
    v_seen_keys := array_append(v_seen_keys, v_name_key);

    INSERT INTO public.client_roster_services AS crs (
      tenant_slug,
      roster_entry_id,
      client_name,
      service_name,
      monthly_amount,
      service_start_date,
      status,
      updated_at
    ) VALUES (
      v_tenant_slug,
      p_roster_entry_id,
      v_client_name,
      v_name,
      v_amount,
      v_start_date,
      v_status,
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Fully qualified output query to avoid ambiguity with RETURNS TABLE variables.
  RETURN QUERY
  SELECT
    crs.tenant_slug,
    crs.roster_entry_id,
    crs.client_name,
    crs.service_name,
    crs.monthly_amount,
    crs.service_start_date,
    crs.status
  FROM public.client_roster_services AS crs
  WHERE crs.tenant_slug = v_tenant_slug
    AND (
      (p_roster_entry_id IS NULL AND crs.roster_entry_id IS NULL)
      OR crs.roster_entry_id = p_roster_entry_id
    )
  ORDER BY crs.service_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_client_roster_services(TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_client_roster_services(TEXT, BIGINT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.replace_client_roster_services(TEXT, BIGINT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_client_roster_services(TEXT, BIGINT, TEXT, JSONB) TO service_role;

REVOKE ALL ON SEQUENCE public.client_roster_services_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.client_roster_services_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.client_roster_services_id_seq FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_roster_services TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.client_roster_services_id_seq TO service_role;
