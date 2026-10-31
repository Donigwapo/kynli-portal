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

describe("client workspace churn authorization hardening", () => {
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

  it("active A + churned B => list returns only active authorized workspace A", async () => {
    const user = makeUser({ id: 1001, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
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
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("acme_llc");
  });

  it("selected workspace B churned => current falls back to A and replaces cookie", async () => {
    const user = makeUser({ id: 1002, role: "client", email: "client2@acme.com", tenant_slug: "acme_llc" });
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
    vi.spyOn(supabaseModule, "getTenantBySlug").mockImplementation(async (slug: string) => {
      if (slug === "acme_llc") return makeTenant("acme_llc", true);
      if (slug === "beta_inc") return makeTenant("beta_inc", false);
      return null;
    });

    const out = await caller.clientWorkspaces.current();
    expect(out?.tenantSlug).toBe("acme_llc");
    expect(ctx.res.cookiesSet.some((c: any) => c.name === "portal_client_workspace_tenant" && c.value === "acme_llc")).toBe(true);
  });

  it("only workspace churned => current returns controlled no-active-workspace state and clears cookie", async () => {
    const user = makeUser({ id: 1003, role: "client", email: "client3@acme.com", tenant_slug: "beta_inc" });
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

  it("direct client requests for churned B are rejected for representative APIs", async () => {
    const user = makeUser({ id: 1004, role: "client", email: "client4@acme.com", tenant_slug: "acme_llc" });
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
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(false);

    await expect(caller.financials.get({ year: 2026, tenantSlug: "beta_inc" })).rejects.toThrow("You do not have access to this workspace.");
    await expect(caller.coaching.list({ year: 2026, tenantSlug: "beta_inc" })).rejects.toThrow("You do not have access to this workspace.");
    await expect(caller.documents.list({ year: 2026, tenantSlug: "beta_inc" })).rejects.toThrow("You do not have access to this workspace.");
    await expect(caller.chat.list({ tenantSlug: "beta_inc", limit: 20 })).rejects.toThrow("You do not have access to this workspace.");
  });

  it("restoring B returns it to authorized workspace list", async () => {
    const user = makeUser({ id: 1005, role: "client", email: "client5@acme.com", tenant_slug: "acme_llc" });
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
    const slugs = out.map((x: any) => x.slug).sort();
    expect(slugs).toEqual(["acme_llc", "beta_inc"]);
  });

  it("legacy client fallback with active own tenant remains authorized", async () => {
    const user = makeUser({ id: 1006, role: "client", email: "legacy@acme.com", tenant_slug: "legacy_co" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(false);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockImplementation(async (slug: string) => {
      if (slug === "legacy_co") return makeTenant("legacy_co", true);
      return makeTenant(slug, true);
    });
    const getFinancialsSpy = vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([] as any);

    await caller.financials.get({ year: 2026 });
    expect(getFinancialsSpy).toHaveBeenCalledWith("legacy_co", 2026, undefined);
  });

  it("legacy client fallback with churned own tenant is rejected", async () => {
    const user = makeUser({ id: 1007, role: "client", email: "legacy2@acme.com", tenant_slug: "legacy_co" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(false);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("legacy_co", false) as any);

    await expect(caller.financials.get({ year: 2026 })).rejects.toThrow("No active workspaces available for this user.");
  });

  it("explicitly revoked member cannot regain access via legacy fallback", async () => {
    const user = makeUser({ id: 1008, role: "client", email: "revoked@acme.com", tenant_slug: "beta_inc" });
    const ctx = makeCtx(user);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "listPortalTenantsBySlugs").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "hasRevokedClientWorkspaceAccessByUserAndTenant").mockResolvedValue(true);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("beta_inc", true) as any);

    await expect(caller.financials.get({ year: 2026, tenantSlug: "beta_inc" })).rejects.toThrow("You do not have access to this workspace.");
    await expect(caller.financials.get({ year: 2026 })).rejects.toThrow("No active workspaces available for this user.");
  });

  it("staff/admin behavior remains unchanged", async () => {
    const staff = makeUser({ id: 1009, role: "accountant", email: "acct@firm.com", tenant_slug: null });
    const ctx = makeCtx(staff);
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 1009, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);
    const getFinancialsSpy = vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant("acme_llc", true) as any);

    await caller.financials.get({ year: 2026, tenantSlug: "acme_llc" });
    expect(getFinancialsSpy).toHaveBeenCalledWith("acme_llc", 2026, undefined);
  });
});
