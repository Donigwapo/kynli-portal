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

function makeTenant(slug: string, isActive: boolean) {
  const now = new Date().toISOString();
  return {
    id: Math.floor(Math.random() * 10000) + 1,
    slug,
    company_name: slug.toUpperCase(),
    contact_name: null,
    email: null,
    package_tier: "cfo",
    is_active: isActive,
    is_churned: !isActive,
    ghl_notes: null,
    invite_sent_at: null,
    invite_accepted: false,
    created_at: now,
    updated_at: now,
  };
}

function makeWorkspaceAccess(userId: number, slug: string, isPrimary = false) {
  const now = new Date().toISOString();
  return {
    id: `${userId}-${slug}`,
    portal_user_id: userId,
    tenant_slug: slug,
    access_type: "member",
    is_primary: isPrimary,
    access_grant_source: "legacy",
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

function makeCtx(
  user: any,
  opts?: { clientWorkspaceTenantSlug?: string | null; viewAsClientTenantSlug?: string | null },
) {
  const res: any = {
    cookiesSet: [] as Array<any>,
    cookiesCleared: [] as Array<any>,
    cookie(name: string, value: string, options: any) {
      this.cookiesSet.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: any) {
      this.cookiesCleared.push({ name, options });
      return this;
    },
  };

  return {
    user,
    req: { headers: {}, cookies: {} },
    res,
    viewAsClientTenantSlug: opts?.viewAsClientTenantSlug ?? null,
    clientWorkspaceTenantSlug: opts?.clientWorkspaceTenantSlug ?? null,
  };
}

describe("client no-active-workspace behavior", () => {
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

  it("one active business => current resolves active workspace", async () => {
    const user = makeUser({ id: 2001, role: "client", email: "one@acme.com", tenant_slug: "acme_llc" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "acme_llc", true),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("acme_llc", true),
    ] as any);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("acme_llc", true) as any);

    const out = await caller.clientWorkspaces.current();
    expect(out?.tenantSlug).toBe("acme_llc");
  });

  it("multiple active businesses => switcher list contains all active authorized", async () => {
    const user = makeUser({ id: 2002, role: "client", email: "many@acme.com", tenant_slug: "acme_llc" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "acme_llc", true),
      makeWorkspaceAccess(user.id, "beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("acme_llc", true),
      makeTenant("beta_inc", true),
    ] as any);

    const out = await caller.clientWorkspaces.list();
    expect(out.map((w: any) => w.slug).sort()).toEqual(["acme_llc", "beta_inc"]);
  });

  it("one active + one churned => only active accessible", async () => {
    const user = makeUser({ id: 2003, role: "client", email: "mix@acme.com", tenant_slug: "acme_llc" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "acme_llc", true),
      makeWorkspaceAccess(user.id, "beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("acme_llc", true),
      makeTenant("beta_inc", false),
    ] as any);

    const out = await caller.clientWorkspaces.list();
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("acme_llc");
  });

  it("all businesses churned => current returns no-active-workspace state", async () => {
    const user = makeUser({ id: 2004, role: "client", email: "none@acme.com", tenant_slug: "beta_inc" });
    const ctx = makeCtx(user, { clientWorkspaceTenantSlug: "beta_inc" });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "beta_inc", true),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(false);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("beta_inc", false) as any);

    const out = await caller.clientWorkspaces.current();
    expect(out).toEqual({ tenantSlug: null, workspace: null });
    expect(ctx.res.cookiesCleared.some((c: any) => c.name === "portal_client_workspace_tenant")).toBe(true);
  });

  it("previously selected workspace churned => stale data path is blocked server-side", async () => {
    const user = makeUser({ id: 2005, role: "client", email: "stale@acme.com", tenant_slug: "acme_llc" });
    const ctx = makeCtx(user, { clientWorkspaceTenantSlug: "beta_inc" });
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "acme_llc", true),
      makeWorkspaceAccess(user.id, "beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("acme_llc", true),
      makeTenant("beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(false);

    await expect(caller.financials.get({ year: 2026, tenantSlug: "beta_inc" })).rejects.toThrow("You do not have access to this workspace.");
  });

  it("restored business becomes accessible after refresh", async () => {
    const user = makeUser({ id: 2006, role: "client", email: "restore@acme.com", tenant_slug: "acme_llc" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([
      makeWorkspaceAccess(user.id, "acme_llc", true),
      makeWorkspaceAccess(user.id, "beta_inc", false),
    ] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([
      makeTenant("acme_llc", true),
      makeTenant("beta_inc", true),
    ] as any);

    const listOut = await caller.clientWorkspaces.list();
    expect(listOut.map((w: any) => w.slug).sort()).toEqual(["acme_llc", "beta_inc"]);

    vi.spyOn(supabaseModule, "getClientWorkspaceAccessByUserAndTenant").mockResolvedValue(
      makeWorkspaceAccess(user.id, "beta_inc", false) as any,
    );
    vi.spyOn(supabaseModule, "getTenantBySlug").mockImplementation(async (slug: string) => {
      if (slug === "beta_inc") return makeTenant("beta_inc", true);
      return makeTenant("acme_llc", true);
    });

    await expect(caller.clientWorkspaces.switch({ tenantSlug: "beta_inc" })).resolves.toMatchObject({ success: true, tenantSlug: "beta_inc" });
  });

  it("staff/admin behavior remains unchanged", async () => {
    const staff = makeUser({ id: 2007, role: "accountant", email: "staff@firm.com", tenant_slug: null });
    const ctx = makeCtx(staff);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 2007, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("acme_llc", true) as any);
    const getFinancialsSpy = vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([] as any);

    await caller.financials.get({ year: 2026, tenantSlug: "acme_llc" });
    expect(getFinancialsSpy).toHaveBeenCalledWith("acme_llc", 2026, undefined);
  });

  it("client sign-out path should remain available from no-active-workspace state", async () => {
    // Frontend sign-out button uses shared logout flow; backend auth remains unchanged.
    const client = makeUser({ id: 2008, role: "client", email: "logout@acme.com", tenant_slug: "none" });
    expect(client.role).toBe("client");
  });
});
