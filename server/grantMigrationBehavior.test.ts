import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const SQL_PATH = "supabase-migrations/business_members_access_model_grant_source.sql";

describe("business_members_access_model_grant_source migration behavior guards", () => {
  const sql = readFileSync(SQL_PATH, "utf8");

  it("preserves invite_accepted provenance on repeated admin grants", () => {
    expect(sql).toContain("WHEN cwa.access_grant_source = 'invite_accepted' THEN cwa.access_grant_source");
  });

  it("validates target tenant existence and active state before grant", () => {
    expect(sql).toContain("FROM public.portal_tenants pt");
    expect(sql).toContain("RETURN QUERY SELECT false, 'invalid_tenant'");
    expect(sql).toContain("RETURN QUERY SELECT false, 'inactive_tenant'");
  });

  it("keeps soft-deleted rows out of active conflict target", () => {
    expect(sql).toContain("ON CONFLICT (portal_user_id, tenant_slug)");
    expect(sql).toContain("WHERE deleted_at IS NULL");
    expect(sql).toContain("deleted_at = NULL");
  });

  it("adds per-user primary assignment serialization lock", () => {
    expect(sql).toContain("v_primary_lock_key bigint");
    expect(sql).toContain("'primary:' || p_portal_user_id::text");
    expect(sql).toContain("pg_advisory_xact_lock(v_primary_lock_key)");
  });
});
