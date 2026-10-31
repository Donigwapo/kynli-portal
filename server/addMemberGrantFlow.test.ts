import { beforeAll, describe, expect, it } from "vitest";

let isEligibleExistingClientForImmediateGrant: any;
let resolveTenantMemberAccessStatus: any;

describe("addMember grant flow model guards", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    const mod = await import("./supabase");
    isEligibleExistingClientForImmediateGrant = mod.isEligibleExistingClientForImmediateGrant;
    resolveTenantMemberAccessStatus = mod.resolveTenantMemberAccessStatus;
  });

  it("requires active client role + supabase_uid for immediate grant", () => {
    expect(
      isEligibleExistingClientForImmediateGrant({
        role: "client",
        status: "active",
        supabase_uid: "uid_123",
      }),
    ).toBe(true);

    expect(
      isEligibleExistingClientForImmediateGrant({
        role: "client",
        status: "inactive",
        supabase_uid: "uid_123",
      }),
    ).toBe(false);

    expect(
      isEligibleExistingClientForImmediateGrant({
        role: "client",
        status: "active",
        supabase_uid: null,
      }),
    ).toBe(false);

    expect(
      isEligibleExistingClientForImmediateGrant({
        role: "admin",
        status: "active",
        supabase_uid: "uid_123",
      }),
    ).toBe(false);
  });

  it("maps access statuses for approved model", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "workspace_member",
        hasWorkspaceAccess: true,
        accessGrantSource: "admin_granted",
        inviteStatus: "not_sent",
      }),
    ).toBe("granted");

    expect(
      resolveTenantMemberAccessStatus({
        source: "workspace_member",
        hasWorkspaceAccess: true,
        accessGrantSource: "invite_accepted",
        inviteStatus: "accepted",
      }),
    ).toBe("accepted");

    expect(
      resolveTenantMemberAccessStatus({
        source: "tenant_user",
        hasWorkspaceAccess: false,
        accessGrantSource: null,
        inviteStatus: "pending",
      }),
    ).toBe("pending_setup");
  });
});
