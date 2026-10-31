import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let supabaseModule: any;

function makeFromMock() {
  return vi.fn((table: string) => {
    if (table === "portal_tenants") {
      const tenantRow = {
        id: 1,
        slug: "test1",
        company_name: "Test 1",
        contact_name: null,
        email: null,
        package_tier: "legacy",
        is_active: true,
        is_churned: false,
        ghl_notes: null,
        invite_sent_at: null,
        invite_accepted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: tenantRow, error: null }),
            single: async () => ({ data: tenantRow, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      } as any;
    }

    if (table === "portal_users") {
      return {
        select: () => ({
          ilike: async () => ({ data: [], error: null }),
        }),
        upsert: async () => ({ error: null }),
      } as any;
    }

    if (table === "portal_invites") {
      return {
        insert: async () => ({ error: null }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({ error: null }),
            }),
          }),
        }),
      } as any;
    }

    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    } as any;
  });
}

describe("invite resend hardening", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "resend_test_key";
    supabaseModule = await import("./supabase");
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(supabaseModule.supabase.auth.admin, "generateLink").mockResolvedValue({
      data: {
        user: { id: "uid-new" },
        properties: { action_link: "https://supabase.test/auth/v1/verify?token=abc" },
      },
      error: null,
    } as any);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation(makeFromMock());

    vi.spyOn(supabaseModule.supabase, "rpc").mockImplementation(async (fn: string) => {
      if (fn === "revoke_pending_portal_invites_except") {
        return { data: 1, error: null } as any;
      }
      return { data: null, error: null } as any;
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
    })) as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns failure when revoke-older-pending RPC fails after invite send", async () => {
    vi.spyOn(supabaseModule.supabase, "rpc").mockImplementation(async (fn: string) => {
      if (fn === "revoke_pending_portal_invites_except") {
        return { data: null, error: { message: "rpc failed" } } as any;
      }
      return { data: null, error: null } as any;
    });

    const result = await supabaseModule.resendTenantMemberInvite({
      tenantSlug: "test1",
      email: "member@test.com",
      fullName: "Member",
    });

    expect(result.sent).toBe(false);
    expect(String(result.error || "")).toContain("revokeOtherPendingInvitesForEmailAndTenant.rpc");
  });

  it("succeeds when invite send works and old pending tokens revoke", async () => {
    const result = await supabaseModule.resendTenantMemberInvite({
      tenantSlug: "test1",
      email: "member@test.com",
      fullName: "Member",
    });

    expect(result).toEqual({ sent: true });
  });
});
