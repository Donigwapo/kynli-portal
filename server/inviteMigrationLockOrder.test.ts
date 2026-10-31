import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(process.cwd(), "supabase-migrations/invite_membership_hardening_atomic.sql");

function extractFunctionBody(sql: string, functionName: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${functionName}`);
  const slice = sql.slice(start);
  const end = slice.indexOf("$$;");
  if (end < 0) throw new Error(`Function terminator not found: ${functionName}`);
  return slice.slice(0, end + 3);
}

describe("invite membership migration lock-order guardrails", () => {
  it("accept and remove functions use consistent advisory-lock-before-row-lock order", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const acceptFn = extractFunctionBody(sql, "accept_portal_invite_atomic(");
    const removeFn = extractFunctionBody(sql, "remove_client_workspace_membership_atomic(");

    const acceptAdvisoryAt = acceptFn.indexOf("pg_advisory_xact_lock");
    const acceptInviteForUpdateAt = acceptFn.indexOf("WHERE invite_token = p_invite_token\n  FOR UPDATE");
    const acceptUserForUpdateAt = acceptFn.indexOf("FROM public.portal_users");

    const removeAdvisoryAt = removeFn.indexOf("pg_advisory_xact_lock");
    const removeUserForUpdateAt = removeFn.indexOf("FROM public.portal_users");

    expect(acceptAdvisoryAt).toBeGreaterThan(-1);
    expect(removeAdvisoryAt).toBeGreaterThan(-1);

    // advisory lock must happen before the locked row reads to avoid cross-function inversion deadlocks
    expect(acceptAdvisoryAt).toBeLessThan(acceptInviteForUpdateAt);
    expect(acceptAdvisoryAt).toBeLessThan(acceptUserForUpdateAt);
    expect(removeAdvisoryAt).toBeLessThan(removeUserForUpdateAt);
  });

  it("accept function still hard-fails on invite status race after membership writes", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const acceptFn = extractFunctionBody(sql, "accept_portal_invite_atomic(");

    expect(acceptFn).toContain("RAISE EXCEPTION 'invite_status_race'");
  });

  it("functions remain execute-restricted to service_role", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("REVOKE ALL ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) FROM authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.accept_portal_invite_atomic(text, bigint, text) TO service_role;");

    expect(sql).toContain("REVOKE ALL ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) FROM authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.remove_client_workspace_membership_atomic(bigint, text) TO service_role;");
  });
});
