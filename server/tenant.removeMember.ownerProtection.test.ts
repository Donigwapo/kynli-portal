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

function makeTenant(input: { slug: string; email?: string | null; contact_name?: string | null }) {
  const now = new Date().toISOString();
  return {
    id: 101,
    slug: input.slug,
    company_name: "Acme LLC",
    contact_name: input.contact_name ?? "Owner Name",
    email: input.email !== undefined ? input.email : "owner@acme.com",
    package_tier: "cfo",
    is_active: true,
    is_churned: false,
    ghl_notes: null,
    invite_sent_at: null,
    invite_accepted: true,
    created_at: now,
    updated_at: now,
  };
}

function makePortalUser(input: { id: number; email: string; role?: string; tenant_slug?: string | null }) {
  const now = new Date().toISOString();
  return {
    id: input.id,
    supabase_uid: `uid-${input.id}`,
    email: input.email,
    name: input.email,
    role: (input.role ?? "client") as any,
    tenant_slug: input.tenant_slug ?? null,
    must_reset_password: false,
    status: "active",
    created_at: now,
    updated_at: now,
  };
}

describe("tenant.removeMember designated owner protection", () => {
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

  it("rejects designated owner removal via direct tRPC and performs no member mutation", async () => {
    const admin = makeUser({ id: 1, role: "admin", email: "admin@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant({ slug: "acme_llc", email: "owner@acme.com" }) as any);
    vi.spyOn(supabaseModule, "getPortalUserById").mockResolvedValue(makePortalUser({ id: 10, email: "owner@acme.com" }) as any);
    const removeSpy = vi.spyOn(supabaseModule, "removeTenantMember").mockResolvedValue(undefined as any);
    const logSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 1 } as any);

    await expect(caller.tenant.removeMember({ slug: "acme_llc", memberId: 10 })).rejects.toThrow(
      "Business owner access is protected",
    );

    expect(removeSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("allows additional client member removal", async () => {
    const admin = makeUser({ id: 2, role: "admin", email: "admin2@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant({ slug: "acme_llc", email: "owner@acme.com" }) as any);
    vi.spyOn(supabaseModule, "getPortalUserById").mockResolvedValue(makePortalUser({ id: 11, email: "member@acme.com" }) as any);
    const removeSpy = vi.spyOn(supabaseModule, "removeTenantMember").mockResolvedValue(undefined as any);
    const logSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 2 } as any);

    const out = await caller.tenant.removeMember({ slug: "acme_llc", memberId: 11 });

    expect(out).toEqual({ success: true });
    expect(removeSpy).toHaveBeenCalledWith({ tenantSlug: "acme_llc", memberId: 11 });
    expect(logSpy).toHaveBeenCalled();
  });

  it("does not auto-protect non-designated owner-like member", async () => {
    const admin = makeUser({ id: 3, role: "admin", email: "admin3@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(makeTenant({ slug: "acme_llc", email: "designated@acme.com" }) as any);
    vi.spyOn(supabaseModule, "getPortalUserById").mockResolvedValue(makePortalUser({ id: 12, email: "owner_style_member@acme.com" }) as any);

    const removeSpy = vi.spyOn(supabaseModule, "removeTenantMember").mockResolvedValue(undefined as any);
    vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 3 } as any);

    await caller.tenant.removeMember({ slug: "acme_llc", memberId: 12 });

    expect(removeSpy).toHaveBeenCalledWith({ tenantSlug: "acme_llc", memberId: 12 });
  });

  it("same owner email in another business does not block unrelated member removal", async () => {
    const admin = makeUser({ id: 4, role: "admin", email: "admin4@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockImplementation(async (slug: string) => {
      if (slug === "alpha_llc") return makeTenant({ slug: "alpha_llc", email: "shared_owner@client.com" }) as any;
      if (slug === "beta_inc") return makeTenant({ slug: "beta_inc", email: "shared_owner@client.com" }) as any;
      return null;
    });

    vi.spyOn(supabaseModule, "getPortalUserById").mockResolvedValue(makePortalUser({ id: 13, email: "member@beta.com" }) as any);
    const removeSpy = vi.spyOn(supabaseModule, "removeTenantMember").mockResolvedValue(undefined as any);
    vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 4 } as any);

    await caller.tenant.removeMember({ slug: "beta_inc", memberId: 13 });

    expect(removeSpy).toHaveBeenCalledWith({ tenantSlug: "beta_inc", memberId: 13 });
  });

  it("resolves designated owner using fallback contact_name email when tenant.email missing", async () => {
    const admin = makeUser({ id: 5, role: "admin", email: "admin5@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue(
      makeTenant({ slug: "acme_llc", email: null, contact_name: "owner_fallback@acme.com" }) as any,
    );
    vi.spyOn(supabaseModule, "getPortalUserById").mockResolvedValue(makePortalUser({ id: 14, email: "owner_fallback@acme.com" }) as any);
    const removeSpy = vi.spyOn(supabaseModule, "removeTenantMember").mockResolvedValue(undefined as any);
    const logSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 5 } as any);

    await expect(caller.tenant.removeMember({ slug: "acme_llc", memberId: 14 })).rejects.toThrow(
      "Business owner access is protected",
    );

    expect(removeSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("archive/restore behavior remains unaffected", async () => {
    const admin = makeUser({ id: 6, role: "admin", email: "admin6@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const archiveSpy = vi.spyOn(supabaseModule, "archiveTenant").mockResolvedValue(undefined as any);
    const restoreSpy = vi.spyOn(supabaseModule, "restoreTenant").mockResolvedValue(undefined as any);

    await expect(caller.tenant.archive({ slug: "acme_llc" })).resolves.toEqual({ success: true });
    await expect(caller.tenant.restore({ slug: "acme_llc" })).resolves.toEqual({ success: true });

    expect(archiveSpy).toHaveBeenCalledWith("acme_llc");
    expect(restoreSpy).toHaveBeenCalledWith("acme_llc");
  });
});
