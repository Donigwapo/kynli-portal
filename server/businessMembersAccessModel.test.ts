import { beforeAll, describe, expect, it } from "vitest";

let resolveTenantMemberAccessStatus: any;
let resolveTenantMemberInviteStatus: any;

describe("business members access model", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    const mod = await import("./supabase");
    resolveTenantMemberAccessStatus = mod.resolveTenantMemberAccessStatus;
    resolveTenantMemberInviteStatus = mod.resolveTenantMemberInviteStatus;
  });

  it("marks active admin-granted member as granted", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "workspace_member",
        hasWorkspaceAccess: true,
        accessGrantSource: "admin_granted",
        inviteStatus: "not_sent",
      }),
    ).toBe("granted");
  });

  it("marks invite-accepted active member as accepted", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "workspace_member",
        hasWorkspaceAccess: true,
        accessGrantSource: "invite_accepted",
        inviteStatus: "accepted",
      }),
    ).toBe("accepted");
  });

  it("marks pending invite without access as pending_setup", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "tenant_user",
        hasWorkspaceAccess: false,
        accessGrantSource: null,
        inviteStatus: "pending",
      }),
    ).toBe("pending_setup");
  });

  it("legacy active member resolves to granted", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "tenant_user",
        hasWorkspaceAccess: true,
        accessGrantSource: "legacy",
        inviteStatus: "not_sent",
      }),
    ).toBe("granted");
  });

  it("staff/global users keep not_sent access status", () => {
    expect(
      resolveTenantMemberAccessStatus({
        source: "staff_assignment",
        hasWorkspaceAccess: true,
        accessGrantSource: null,
        inviteStatus: "accepted",
      }),
    ).toBe("not_sent");

    expect(
      resolveTenantMemberAccessStatus({
        source: "global_staff",
        hasWorkspaceAccess: true,
        accessGrantSource: null,
        inviteStatus: "accepted",
      }),
    ).toBe("not_sent");
  });

  it("used invite status still maps to accepted lifecycle", () => {
    const nowMs = Date.now();
    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: {
          invite_token: "x",
          email: "a@example.com",
          tenant_slug: "business2",
          status: "used",
          expires_at: new Date(nowMs + 10000).toISOString(),
          revoked_at: null,
        },
        hasWorkspaceAccess: true,
        source: "workspace_member",
        nowMs,
      }),
    ).toBe("accepted");
  });
});
