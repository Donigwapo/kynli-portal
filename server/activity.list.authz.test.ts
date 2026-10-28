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
    tenant_slug: partial.tenant_slug ?? "acme_llc",
    must_reset_password: false,
    created_at: now,
    updated_at: now,
  };
}

function makeCtx(
  user: any,
  opts?: { clientWorkspaceTenantSlug?: string | null; viewAsClientTenantSlug?: string | null },
) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: opts?.viewAsClientTenantSlug ?? null,
    clientWorkspaceTenantSlug: opts?.clientWorkspaceTenantSlug ?? null,
  };
}

describe("activity.list authorization", () => {
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

  it("allows admin to request all activity logs", async () => {
    const admin = makeUser({ id: 1, role: "admin", email: "admin@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin));

    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({});

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: undefined,
        limit: 300,
      }),
    );
  });

  it("allows admin to request a specific tenant's activity logs", async () => {
    const admin = makeUser({ id: 2, role: "admin", email: "admin2@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin));

    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({ tenantSlug: "acme_llc" });

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "acme_llc",
      }),
    );
  });

  it("allows accountant to request an assigned tenant", async () => {
    const staff = makeUser({ id: 101, role: "accountant", email: "acct@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 101, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);
    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({ tenantSlug: "acme_llc" });

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "acme_llc",
      }),
    );
  });

  it("blocks accountant requesting an unassigned tenant", async () => {
    const staff = makeUser({ id: 102, role: "accountant", email: "acct2@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 102, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.activity.list({ tenantSlug: "other_llc" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("staff request without tenant filter is constrained to assigned tenant set", async () => {
    const staff = makeUser({ id: 103, role: "accountant", email: "acct3@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 103, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
      { id: 2, staff_id: 103, tenant_slug: "beta_inc", assigned_at: new Date().toISOString() },
    ] as any);
    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({});

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlugs: ["acme_llc", "beta_inc"],
      }),
    );
  });

  it("client-role users cannot access activity logs", async () => {
    const client = makeUser({ id: 201, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(client));

    await expect(caller.activity.list({ tenantSlug: "acme_llc" })).rejects.toThrow(
      "Activity log is restricted to staff/admin.",
    );
  });

  it("view-as-client cookie context does not widen staff access", async () => {
    const staff = makeUser({ id: 104, role: "accountant", email: "acct4@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(
      makeCtx(staff, {
        viewAsClientTenantSlug: "other_llc",
        clientWorkspaceTenantSlug: null,
      }),
    );

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 104, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.activity.list({ tenantSlug: "other_llc" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );

    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);
    await caller.activity.list({});

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlugs: ["acme_llc"],
      }),
    );
  });

  it("preserves pagination + filters while applying tenant authorization", async () => {
    const staff = makeUser({ id: 105, role: "accountant", email: "acct5@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 105, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);
    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({
      search: "report",
      actionType: "file_uploaded",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
      limit: 25,
    });

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "report",
        actionType: "file_uploaded",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-12-31T23:59:59.999Z",
        limit: 25,
        tenantSlugs: ["acme_llc"],
      }),
    );
  });

  it("handles invalid/empty/malformed tenant identifiers safely", async () => {
    const staff = makeUser({ id: 106, role: "accountant", email: "acct6@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 106, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);
    await caller.activity.list({ tenantSlug: "   " });
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ tenantSlugs: ["acme_llc"] }));

    await expect(caller.activity.list({ tenantSlug: "!!!" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("cross-client isolation supports multiple assigned tenants only", async () => {
    const staff = makeUser({ id: 107, role: "accountant", email: "acct7@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 107, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
      { id: 2, staff_id: 107, tenant_slug: "gamma_group", assigned_at: new Date().toISOString() },
      { id: 3, staff_id: 107, tenant_slug: "gamma_group", assigned_at: new Date().toISOString() },
    ] as any);

    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({});

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlugs: ["acme_llc", "gamma_group"] }),
    );
  });

  it("workspace-scoped admin request resolves active tenant and queries that tenant only", async () => {
    const admin = makeUser({ id: 301, role: "admin", email: "admin3@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "Acme LLC" }));
    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({ workspaceScoped: true });

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "acme_llc",
      }),
    );
  });

  it("workspace-scoped accountant request requires assignment to active tenant", async () => {
    const staff = makeUser({ id: 302, role: "accountant", email: "acct8@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 302, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);
    const listSpy = vi.spyOn(supabaseModule, "listActivityLogs").mockResolvedValue([] as any);

    await caller.activity.list({ workspaceScoped: true });

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: "acme_llc" }),
    );
  });

  it("workspace-scoped staff request is forbidden when active tenant is unassigned", async () => {
    const staff = makeUser({ id: 303, role: "accountant", email: "acct9@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(staff, { viewAsClientTenantSlug: "other_llc" }));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 303, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.activity.list({ workspaceScoped: true })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("workspace-scoped request fails closed when active workspace tenant is missing", async () => {
    const admin = makeUser({ id: 304, role: "admin", email: "admin4@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: null, clientWorkspaceTenantSlug: null }));

    await expect(caller.activity.list({ workspaceScoped: true })).rejects.toThrow(
      "Active client workspace is required.",
    );
  });

  it("workspace-scoped request rejects internal pseudo-tenant", async () => {
    const admin = makeUser({ id: 305, role: "admin", email: "admin5@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "kynli_internal" }));

    await expect(caller.activity.list({ workspaceScoped: true })).rejects.toThrow(
      "Active client workspace is required.",
    );
  });

  it("workspace-scoped request rejects mismatched requested tenant", async () => {
    const admin = makeUser({ id: 306, role: "admin", email: "admin6@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    await expect(caller.activity.list({ workspaceScoped: true, tenantSlug: "beta_inc" })).rejects.toThrow(
      "Requested tenant does not match active client workspace.",
    );
  });
});

describe("listActivityLogs applies tenant filters at DB query layer", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = supabaseModule ?? (await import("./supabase"));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses IN tenant filter before order/limit when tenantSlugs are provided", async () => {
    const ops: string[] = [];

    const query: any = {
      select: vi.fn(() => {
        ops.push("select");
        return query;
      }),
      or: vi.fn(() => {
        ops.push("or");
        return query;
      }),
      eq: vi.fn(() => {
        ops.push("eq");
        return query;
      }),
      in: vi.fn(() => {
        ops.push("in");
        return query;
      }),
      gte: vi.fn(() => {
        ops.push("gte");
        return query;
      }),
      lte: vi.fn(() => {
        ops.push("lte");
        return query;
      }),
      order: vi.fn(() => {
        ops.push("order");
        return query;
      }),
      limit: vi.fn(() => {
        ops.push("limit");
        return Promise.resolve({ data: [], error: null });
      }),
    };

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      expect(table).toBe("activity_logs");
      return query;
    });

    await supabaseModule.listActivityLogs({
      tenantSlugs: ["acme_llc", "beta_inc"],
      limit: 10,
    });

    expect(query.in).toHaveBeenCalledWith("tenant_slug", ["acme_llc", "beta_inc"]);
    expect(ops.indexOf("in")).toBeGreaterThan(-1);
    expect(ops.indexOf("in")).toBeLessThan(ops.indexOf("limit"));
    expect(query.eq).not.toHaveBeenCalledWith("tenant_slug", expect.anything());
  });

  it("falls back to EQ tenant filter when single tenantSlug is provided", async () => {
    const query: any = {
      select: vi.fn(() => query),
      or: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation(() => query);

    await supabaseModule.listActivityLogs({ tenantSlug: "ACME LLC" });

    expect(query.eq).toHaveBeenCalledWith("tenant_slug", "acme_llc");
    expect(query.in).not.toHaveBeenCalledWith("tenant_slug", expect.anything());
  });
});
