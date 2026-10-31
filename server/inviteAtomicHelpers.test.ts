import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let supabaseModule: any;

describe("invite atomic helper wrappers", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    supabaseModule = await import("./supabase");
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("acceptInviteForPortalUserAtomic propagates RPC failures", async () => {
    vi.spyOn(supabaseModule.supabase, "rpc").mockResolvedValue({ data: null, error: { message: "rpc broken" } } as any);

    await expect(supabaseModule.acceptInviteForPortalUserAtomic({
      inviteToken: "tok",
      portalUserId: 1,
      userEmail: "a@b.com",
    })).rejects.toThrow("acceptInviteForPortalUserAtomic.rpc");
  });

  it("acceptInviteForPortalUserAtomic returns applied false for invalid input", async () => {
    const out = await supabaseModule.acceptInviteForPortalUserAtomic({
      inviteToken: "",
      portalUserId: Number.NaN,
      userEmail: "",
    });

    expect(out.applied).toBe(false);
    expect(out.reason).toBe("invalid_input");
  });

  it("revokeOtherPendingInvitesForEmailAndTenant propagates RPC failures", async () => {
    vi.spyOn(supabaseModule.supabase, "rpc").mockResolvedValue({ data: null, error: { message: "revoke rpc fail" } } as any);

    await expect(supabaseModule.revokeOtherPendingInvitesForEmailAndTenant({
      email: "a@b.com",
      tenantSlug: "test1",
      keepInviteToken: "tok",
    })).rejects.toThrow("revokeOtherPendingInvitesForEmailAndTenant.rpc");
  });
});
