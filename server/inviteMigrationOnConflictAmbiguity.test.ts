import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase-migrations/invite_membership_hardening_atomic_fix_on_conflict_ambiguity.sql",
);

describe("invite RPC ON CONFLICT ambiguity hardening", () => {
  it("uses #variable_conflict use_column and preserves partial-index ON CONFLICT inference", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("#variable_conflict use_column");
    expect(sql).toContain("ON CONFLICT (portal_user_id, tenant_slug)");
    expect(sql).toContain("WHERE deleted_at IS NULL");
  });

  it("keeps signature and service_role execute restriction", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.accept_portal_invite_atomic(");
    expect(sql).toContain("RETURNS TABLE(applied boolean, tenant_slug text, reason text)");

    expect(sql).toContain("REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) TO service_role;");
  });
});
