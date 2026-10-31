import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase-migrations/invite_membership_hardening_atomic_fix_ambiguous_tenant_slug.sql",
);

describe("invite RPC ambiguity regression", () => {
  it("qualifies tenant_slug references in accept_portal_invite_atomic to avoid 42702", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Ensure aliased client_workspace_access predicate
    expect(sql).toContain("AND cwa.tenant_slug = v_invite.tenant_slug");

    // Ensure aliased portal_invites predicates
    expect(sql).toContain("WHERE pi.invite_token = p_invite_token");
    expect(sql).toContain("AND pi.tenant_slug = v_invite.tenant_slug");

    // Guardrail: no unqualified tenant_slug predicate in this corrective function body.
    const functionStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.accept_portal_invite_atomic(");
    const functionEnd = sql.indexOf("$$;", functionStart);
    const fn = sql.slice(functionStart, functionEnd);
    expect(fn).not.toMatch(/\bAND\s+tenant_slug\s*=\s*/);
    expect(fn).not.toMatch(/\bWHERE\s+tenant_slug\s*=\s*/);
  });
});
