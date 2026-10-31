import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let appRouter: any;
let supabaseModule: any;

function makeUser(partial: { id: number; role: string; email: string; tenant_slug?: string | null; name?: string }) {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    supabase_uid: `uid-${partial.id}`,
    email: partial.email,
    name: partial.name ?? partial.email,
    role: partial.role,
    tenant_slug: partial.tenant_slug ?? null,
    must_reset_password: false,
    created_at: now,
    updated_at: now,
  };
}

function makeCtx(user: any) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: null,
    clientWorkspaceTenantSlug: null,
  };
}

describe("tenant.addMember result handling", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    const routersModule = await import("./routers");
    appRouter = routersModule.appRouter;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("new/unverified invite succeeds even when granted=false", async () => {
    const admin = makeUser({ id: 1, role: "admin", email: "admin@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "upsertTenantMember").mockResolvedValue({
      member: { id: 101, email: "new@client.com" },
      invited: true,
      granted: false,
      inviteError: undefined,
      grantError: "grant_atomic: not_applied",
      notificationSent: undefined,
      notificationError: undefined,
    } as any);
    const logSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 1 } as any);

    const out = await caller.tenant.addMember({
      slug: "acme_llc",
      fullName: "New Client",
      email: "new@client.com",
      portalOrigin: "http://localhost:5173",
    });

    expect(out).toEqual({
      success: true,
      invited: true,
      granted: false,
      notificationSent: null,
      notificationError: null,
    });

    expect(logSpy).toHaveBeenCalled();
  });

  it("existing verified client grant succeeds and returns granted=true", async () => {
    const admin = makeUser({ id: 2, role: "admin", email: "admin2@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "upsertTenantMember").mockResolvedValue({
      member: { id: 102, email: "existing@client.com" },
      invited: false,
      granted: true,
      notificationSent: true,
      notificationError: undefined,
    } as any);

    const out = await caller.tenant.addMember({
      slug: "acme_llc",
      fullName: "Existing Client",
      email: "existing@client.com",
      portalOrigin: "http://localhost:5173",
    });

    expect(out.success).toBe(true);
    expect(out.granted).toBe(true);
    expect(out.invited).toBe(false);
    expect(out.notificationSent).toBe(true);
  });

  it("existing verified client grant failure with no invite throws error", async () => {
    const admin = makeUser({ id: 3, role: "admin", email: "admin3@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "upsertTenantMember").mockResolvedValue({
      member: { id: 103, email: "existing-fail@client.com" },
      invited: false,
      granted: false,
      grantError: "grant_atomic: permission_denied",
      inviteError: undefined,
    } as any);

    await expect(caller.tenant.addMember({
      slug: "acme_llc",
      fullName: "Existing Fail",
      email: "existing-fail@client.com",
      portalOrigin: "http://localhost:5173",
    })).rejects.toThrow("grant_atomic: permission_denied");
  });

  it("invite failure with no grant throws invite error", async () => {
    const admin = makeUser({ id: 4, role: "admin", email: "admin4@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "upsertTenantMember").mockResolvedValue({
      member: { id: 104, email: "invite-fail@client.com" },
      invited: false,
      granted: undefined,
      inviteError: "smtp timeout",
      grantError: undefined,
    } as any);

    await expect(caller.tenant.addMember({
      slug: "acme_llc",
      fullName: "Invite Fail",
      email: "invite-fail@client.com",
      portalOrigin: "http://localhost:5173",
    })).rejects.toThrow("smtp timeout");
  });

  it("partial success keeps success path and preserves notification failure metadata", async () => {
    const admin = makeUser({ id: 5, role: "admin", email: "admin5@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "upsertTenantMember").mockResolvedValue({
      member: { id: 105, email: "existing-notify-fail@client.com" },
      invited: false,
      granted: true,
      notificationSent: false,
      notificationError: "provider unavailable",
    } as any);

    const out = await caller.tenant.addMember({
      slug: "acme_llc",
      fullName: "Existing Notify Fail",
      email: "existing-notify-fail@client.com",
      portalOrigin: "http://localhost:5173",
    });

    expect(out).toEqual({
      success: true,
      invited: false,
      granted: true,
      notificationSent: false,
      notificationError: "provider unavailable",
    });
  });
});
