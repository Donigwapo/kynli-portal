-- Kynli Financials: widen net_profit_margin precision for active portal tenants only.
--
-- Goal:
--   Prevent numeric overflow on legitimate extreme margin percentages
--   by changing <tenant>_financials.net_profit_margin from NUMERIC(p,s)
--   to unconstrained NUMERIC.
--
-- Safety:
--   - Targets only tenants from public.portal_tenants where is_active = true
--   - Targets only existing tenant financial tables
--   - Changes only the net_profit_margin column type
--   - Preserves existing values via explicit cast
--   - Idempotent / safe to rerun
--   - Atomic transaction

BEGIN;

DO $$
DECLARE
  tenant_row RECORD;
  normalized_slug TEXT;
  financial_table TEXT;
  precision_val INTEGER;
  scale_val INTEGER;
BEGIN
  FOR tenant_row IN
    SELECT slug
    FROM public.portal_tenants
    WHERE is_active = true
  LOOP
    -- Mirror app-side sanitizeTenantSlug behavior as closely as possible.
    normalized_slug := lower(coalesce(tenant_row.slug, ''));
    normalized_slug := regexp_replace(normalized_slug, '[^a-z0-9]+', '_', 'g');
    normalized_slug := regexp_replace(normalized_slug, '_+', '_', 'g');
    normalized_slug := regexp_replace(normalized_slug, '^_+|_+$', '', 'g');

    IF normalized_slug = '' THEN
      normalized_slug := 'tenant';
    END IF;

    IF normalized_slug ~ '^[0-9]' THEN
      normalized_slug := 't_' || normalized_slug;
    END IF;

    financial_table := normalized_slug || '_financials';

    -- Only proceed when table + column exist.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = financial_table
        AND c.column_name = 'net_profit_margin'
    ) THEN
      SELECT c.numeric_precision, c.numeric_scale
      INTO precision_val, scale_val
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = financial_table
        AND c.column_name = 'net_profit_margin';

      -- If precision is constrained (e.g., NUMERIC(8,4)), widen to NUMERIC.
      -- If already unconstrained NUMERIC, numeric_precision is NULL and we skip.
      IF precision_val IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE %I.%I ALTER COLUMN net_profit_margin TYPE NUMERIC USING net_profit_margin::NUMERIC',
          'public',
          financial_table
        );
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
