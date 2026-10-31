import { beforeAll, describe, expect, it } from "vitest";

function shouldIncludeTenantUserRow(input: {
  role: string | null;
  hasWorkspaceAccess: boolean;
  hasValidPendingInvite: boolean;
  hasExplicitRemovedHistory: boolean;
}) {
  const role = input.role ?? "client";
  if (role !== "client") return true;
  if (input.hasExplicitRemovedHistory && !input.hasWorkspaceAccess && !input.hasValidPendingInvite) return false;
  return true;
}

let isValidPendingTenantInvite: any;
let resolveTenantMemberInviteStatus: any;

describe("listTenantMembers invite lifecycle helpers", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    const mod = await import("./supabase");
    isValidPendingTenantInvite = mod.isValidPendingTenantInvite;
    resolveTenantMemberInviteStatus = mod.resolveTenantMemberInviteStatus;
  });

  const nowMs = Date.now();
  const future = new Date(nowMs + 60_000).toISOString();
  const past = new Date(nowMs - 60_000).toISOString();

  it("treats only non-revoked unexpired pending invite as valid pending", () => {
    expect(
      isValidPendingTenantInvite({
        invite_token: "a",
        email: "x@test.com",
        tenant_slug: "test1",
        status: "pending",
        expires_at: future,
        revoked_at: null,
      } as any, nowMs),
    ).toBe(true);

    expect(
      isValidPendingTenantInvite({
        invite_token: "b",
        email: "x@test.com",
        tenant_slug: "test1",
        status: "pending",
        expires_at: past,
        revoked_at: null,
      } as any, nowMs),
    ).toBe(false);

    expect(
      isValidPendingTenantInvite({
        invite_token: "c",
        email: "x@test.com",
        tenant_slug: "test1",
        status: "pending",
        expires_at: future,
        revoked_at: new Date(nowMs - 1_000).toISOString(),
      } as any, nowMs),
    ).toBe(false);

    expect(
      isValidPendingTenantInvite({
        invite_token: "d",
        email: "x@test.com",
        tenant_slug: "test1",
        status: "used",
        expires_at: future,
        revoked_at: null,
      } as any, nowMs),
    ).toBe(false);
  });

  it("maps used/accepted to accepted status and never downgrades to pending due to missing workspace access", () => {
    const usedInvite = {
      invite_token: "u",
      email: "x@test.com",
      tenant_slug: "test1",
      status: "used",
      expires_at: future,
      revoked_at: null,
    } as any;

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: usedInvite,
        hasWorkspaceAccess: true,
        source: "tenant_user",
        nowMs,
      }),
    ).toBe("accepted");

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: usedInvite,
        hasWorkspaceAccess: false,
        source: "tenant_user",
        nowMs,
      }),
    ).toBe("accepted");
  });

  it("maps pending/revoked/expired correctly", () => {
    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: {
          invite_token: "p",
          email: "x@test.com",
          tenant_slug: "test1",
          status: "pending",
          expires_at: future,
          revoked_at: null,
        } as any,
        hasWorkspaceAccess: false,
        source: "tenant_user",
        nowMs,
      }),
    ).toBe("pending");

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: {
          invite_token: "r",
          email: "x@test.com",
          tenant_slug: "test1",
          status: "revoked",
          expires_at: future,
          revoked_at: new Date(nowMs - 1_000).toISOString(),
        } as any,
        hasWorkspaceAccess: false,
        source: "tenant_user",
        nowMs,
      }),
    ).toBe("revoked");

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: {
          invite_token: "e",
          email: "x@test.com",
          tenant_slug: "test1",
          status: "pending",
          expires_at: past,
          revoked_at: null,
        } as any,
        hasWorkspaceAccess: false,
        source: "tenant_user",
        nowMs,
      }),
    ).toBe("expired");
  });

  it("staff/global sources remain not_sent", () => {
    const pendingInvite = {
      invite_token: "p",
      email: "x@test.com",
      tenant_slug: "test1",
      status: "pending",
      expires_at: future,
      revoked_at: null,
    } as any;

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: pendingInvite,
        hasWorkspaceAccess: true,
        source: "staff_assignment",
        nowMs,
      }),
    ).toBe("not_sent");

    expect(
      resolveTenantMemberInviteStatus({
        latestInvite: pendingInvite,
        hasWorkspaceAccess: true,
        source: "global_staff",
        nowMs,
      }),
    ).toBe("not_sent");
  });

  it("keeps legacy client visible when no workspace-access history exists", () => {
    expect(
      shouldIncludeTenantUserRow({
        role: "client",
        hasWorkspaceAccess: false,
        hasValidPendingInvite: false,
        hasExplicitRemovedHistory: false,
      }),
    ).toBe(true);
  });

  it("hides explicitly removed client without active access or valid pending invite", () => {
    expect(
      shouldIncludeTenantUserRow({
        role: "client",
        hasWorkspaceAccess: false,
        hasValidPendingInvite: false,
        hasExplicitRemovedHistory: true,
      }),
    ).toBe(false);
  });

  it("shows explicitly removed client again if they have a new valid pending invite", () => {
    expect(
      shouldIncludeTenantUserRow({
        role: "client",
        hasWorkspaceAccess: false,
        hasValidPendingInvite: true,
        hasExplicitRemovedHistory: true,
      }),
    ).toBe(true);
  });

  it("keeps active owner/member visible regardless of removed history", () => {
    expect(
      shouldIncludeTenantUserRow({
        role: "client",
        hasWorkspaceAccess: true,
        hasValidPendingInvite: false,
        hasExplicitRemovedHistory: true,
      }),
    ).toBe(true);
  });

});
