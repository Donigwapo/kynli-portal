import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

type ExistingPortalUser = {
  id: number;
  supabase_uid: string | null;
  email: string;
  name: string | null;
  role: "admin" | "accounting_manager" | "tax_manager" | "accountant" | "client";
  tenant_slug: string | null;
  must_reset_password: boolean;
  invite_sent_at?: string | null;
  invite_accepted?: boolean;
  created_at: string;
  updated_at: string;
};

type HarnessOptions = {
  existingUsers?: ExistingPortalUser[];
  inviteGenerateLinkResult?: { data: any; error: any };
  magicGenerateLinkResult?: { data: any; error: any };
  emailDeliveryOk?: boolean;
};

let currentHarness: ReturnType<typeof createHarness> | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    if (!currentHarness) throw new Error("Harness not initialized before module import");
    return currentHarness.client;
  }),
}));

function createHarness(options: HarnessOptions = {}) {
  const calls = {
    fromTables: [] as string[],
    portalUsersLookups: [] as Array<{ column: string; value: string }>,
    portalInvitesInserts: [] as any[],
    portalUsersUpserts: [] as any[],
    tenantUpdates: [] as any[],
    generateLinkArgs: [] as any[],
  };

  const existingUsers = options.existingUsers ?? [];

  const generateLink = vi.fn(async (args: any) => {
    calls.generateLinkArgs.push(args);

    if (args.type === "invite") {
      return (
        options.inviteGenerateLinkResult ?? {
          data: {
            user: { id: "uid-new-user" },
            properties: { action_link: "https://supabase.test/auth/v1/verify?token=invite-token" },
          },
          error: null,
        }
      );
    }

    if (args.type === "magiclink") {
      return (
        options.magicGenerateLinkResult ?? {
          data: {
            user: { id: "uid-existing-user" },
            properties: { action_link: "https://supabase.test/auth/v1/verify?token=magic-token" },
          },
          error: null,
        }
      );
    }

    return { data: null, error: { message: `Unsupported generateLink type: ${String(args.type)}` } };
  });

  const client = {
    auth: {
      admin: {
        generateLink,
      },
    },
    from: vi.fn((table: string) => {
      calls.fromTables.push(table);

      if (table === "portal_users") {
        return {
          select: vi.fn(() => ({
            ilike: vi.fn(async (column: string, value: string) => {
              calls.portalUsersLookups.push({ column, value });
              const normalized = String(value || "").trim().toLowerCase();
              const matches = existingUsers.filter((u) => String(u.email || "").trim().toLowerCase() === normalized);
              return { data: matches, error: null };
            }),
          })),
          upsert: vi.fn(async (payload: any) => {
            calls.portalUsersUpserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "portal_invites") {
        return {
          insert: vi.fn(async (payload: any) => {
            calls.portalInvitesInserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "portal_tenants") {
        return {
          update: vi.fn((payload: any) => ({
            eq: vi.fn(async (_column: string, _value: string) => {
              calls.tenantUpdates.push(payload);
              return { error: null };
            }),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          ilike: vi.fn(async () => ({ data: [], error: null })),
        })),
        insert: vi.fn(async () => ({ error: null })),
        upsert: vi.fn(async () => ({ error: null })),
        update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      };
    }),
  };

  const fetchMock = vi.fn(async () => {
    if (options.emailDeliveryOk === false) {
      return {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "resend provider unavailable",
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
    };
  });

  return { client, calls, fetchMock };
}

async function loadInviteClientByEmail() {
  vi.resetModules();
  const mod = await import("./supabase");
  return mod.inviteClientByEmail;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.RESEND_API_KEY = "resend_test_key";
  process.env.RESEND_FROM_EMAIL = "Kynli Consulting <invite@kynliconsulting.com>";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  currentHarness = null;
});

describe("inviteClientByEmail regression coverage", () => {
  it("1) first invitation for a new user writes invite_accepted=false", async () => {
    currentHarness = createHarness({ emailDeliveryOk: true });
    vi.stubGlobal("fetch", currentHarness.fetchMock as any);

    const inviteClientByEmail = await loadInviteClientByEmail();
    const result = await inviteClientByEmail(
      "new-owner@acme.com",
      "Acme Corp",
      "acme",
      "https://portal.kynli.test/auth/callback",
      "Acme Owner",
      "https://portal.kynli.test",
    );

    expect(result).toEqual({ sent: true });
    expect(currentHarness.calls.portalUsersUpserts).toHaveLength(1);

    const upsert = currentHarness.calls.portalUsersUpserts[0];
    expect(upsert.email).toBe("new-owner@acme.com");
    expect(upsert.role).toBe("client");
    expect(upsert.tenant_slug).toBe("acme");
    expect(upsert.must_reset_password).toBe(false);
    expect(upsert.invite_accepted).toBe(false);
    expect(upsert.invite_sent_at).toBeTruthy();

    expect(currentHarness.calls.generateLinkArgs).toHaveLength(1);
    expect(currentHarness.calls.generateLinkArgs[0].type).toBe("invite");
  });

  it("2) resending to an accepted existing user keeps invite_accepted=true", async () => {
    const existingAcceptedUser: ExistingPortalUser = {
      id: 42,
      supabase_uid: "uid-existing-accepted",
      email: "accepted@acme.com",
      name: "Accepted User",
      role: "accounting_manager",
      tenant_slug: "legacy_tenant",
      must_reset_password: true,
      invite_sent_at: "2026-01-01T00:00:00.000Z",
      invite_accepted: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    };

    currentHarness = createHarness({
      existingUsers: [existingAcceptedUser],
      emailDeliveryOk: true,
      inviteGenerateLinkResult: {
        data: null,
        error: { message: "User already registered" },
      },
    });
    vi.stubGlobal("fetch", currentHarness.fetchMock as any);

    const inviteClientByEmail = await loadInviteClientByEmail();
    const result = await inviteClientByEmail(
      "accepted@acme.com",
      "Acme Corp",
      "new_target_tenant",
      "https://portal.kynli.test/auth/callback",
      "Renamed By Admin",
      "https://portal.kynli.test",
    );

    expect(result).toEqual({ sent: true });
    expect(currentHarness.calls.generateLinkArgs.map((a) => a.type)).toEqual(["invite", "magiclink"]);

    const upsert = currentHarness.calls.portalUsersUpserts[0];
    expect(upsert.invite_accepted).toBe(true);
  });

  it("3) existing user role/tenant/workspace associations are preserved on resend", async () => {
    const existingAcceptedUser: ExistingPortalUser = {
      id: 42,
      supabase_uid: "uid-existing-accepted",
      email: "accepted@acme.com",
      name: "Accepted User",
      role: "accounting_manager",
      tenant_slug: "legacy_tenant",
      must_reset_password: true,
      invite_sent_at: "2026-01-01T00:00:00.000Z",
      invite_accepted: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    };

    currentHarness = createHarness({
      existingUsers: [existingAcceptedUser],
      emailDeliveryOk: true,
      inviteGenerateLinkResult: {
        data: null,
        error: { message: "User already registered" },
      },
    });
    vi.stubGlobal("fetch", currentHarness.fetchMock as any);

    const inviteClientByEmail = await loadInviteClientByEmail();
    const result = await inviteClientByEmail(
      "accepted@acme.com",
      "Acme Corp",
      "new_target_tenant",
      "https://portal.kynli.test/auth/callback",
      "Renamed By Admin",
      "https://portal.kynli.test",
    );

    expect(result).toEqual({ sent: true });

    const upsert = currentHarness.calls.portalUsersUpserts[0];
    expect(upsert.role).toBe("accounting_manager");
    expect(upsert.tenant_slug).toBe("legacy_tenant");
    expect(upsert.must_reset_password).toBe(true);
    expect(upsert.name).toBe("Accepted User");

    // Workspace memberships should not be altered by this function.
    expect(currentHarness.calls.fromTables).not.toContain("client_workspace_access");
  });

  it("4) resending to an existing pending user keeps account fields stable", async () => {
    const existingPendingUser: ExistingPortalUser = {
      id: 55,
      supabase_uid: "uid-existing-pending",
      email: "pending@acme.com",
      name: "Pending User",
      role: "client",
      tenant_slug: "pending_tenant",
      must_reset_password: false,
      invite_sent_at: "2026-03-01T00:00:00.000Z",
      invite_accepted: false,
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
    };

    currentHarness = createHarness({
      existingUsers: [existingPendingUser],
      emailDeliveryOk: true,
      inviteGenerateLinkResult: {
        data: null,
        error: { message: "user already exists" },
      },
    });
    vi.stubGlobal("fetch", currentHarness.fetchMock as any);

    const inviteClientByEmail = await loadInviteClientByEmail();
    const result = await inviteClientByEmail(
      "pending@acme.com",
      "Acme Corp",
      "other_tenant",
      "https://portal.kynli.test/auth/callback",
      "Pending User Updated",
      "https://portal.kynli.test",
    );

    expect(result).toEqual({ sent: true });

    const upsert = currentHarness.calls.portalUsersUpserts[0];
    expect(upsert.invite_accepted).toBe(false);
    expect(upsert.role).toBe("client");
    expect(upsert.tenant_slug).toBe("pending_tenant");
    expect(upsert.must_reset_password).toBe(false);
    expect(upsert.name).toBe("Pending User");
  });

  it("5) failed email delivery does not mark invite as successfully sent", async () => {
    currentHarness = createHarness({ emailDeliveryOk: false });
    vi.stubGlobal("fetch", currentHarness.fetchMock as any);

    const inviteClientByEmail = await loadInviteClientByEmail();
    const result = await inviteClientByEmail(
      "delivery-fail@acme.com",
      "Acme Corp",
      "acme",
      "https://portal.kynli.test/auth/callback",
      "Delivery Fail",
      "https://portal.kynli.test",
    );

    expect(result.sent).toBe(false);
    expect(result.error).toContain("Resend send failed");

    // Critical regression guard:
    // metadata updates happen only after email send succeeds.
    expect(currentHarness.calls.portalUsersUpserts).toHaveLength(0);
    expect(currentHarness.calls.tenantUpdates).toHaveLength(0);
  });
});
