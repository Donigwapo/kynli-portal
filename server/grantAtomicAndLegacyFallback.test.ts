import { beforeAll, describe, expect, it } from "vitest";

let isEligibleExistingClientForImmediateGrant: any;
let resolveTenantMemberAccessStatus: any;

describe("grant atomic + legacy fallback guards", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    const mod = await import("./supabase");
    isEligibleExistingClientForImmediateGrant = mod.isEligibleExistingClientForImmediateGrant;
    resolveTenantMemberAccessStatus = mod.resolveTenantMemberAccessStatus;
  });

  it("does not consider unverified/inactive/non-client users eligible for immediate grant", () => {
    expect(isEligibleExistingClientForImmediateGrant(null)).toBe(false);
    expect(
      isEligibleExistingClientForImmediateGrant({ role: "client", status: "inactive", supabase_uid: "uid" }),
    ).toBe(false);
    expect(
      isEligibleExistingClientForImmediateGrant({ role: "client", status: "active", supabase_uid: null }),
    ).toBe(false);
    expect(
      isEligibleExistingClientForImmediateGrant({ role: "accountant", status: "active", supabase_uid: "uid" }),
    ).toBe(false);
  });

  it("keeps pending_setup for pending invites without active access", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "tenant_user",
        hasWorkspaceAccess: false,
        accessGrantSource: null,
        inviteStatus: "pending",
      }),
    ).toBe("pending_setup");
  });

  it("maps legacy active tenant authorization as granted in member display", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "tenant_user",
        hasWorkspaceAccess: true,
        accessGrantSource: "legacy",
        inviteStatus: "not_sent",
      }),
    ).toBe("granted");
  });
});
