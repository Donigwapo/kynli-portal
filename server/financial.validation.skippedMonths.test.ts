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

function makeCtx(user: any, opts?: { clientWorkspaceTenantSlug?: string | null; viewAsClientTenantSlug?: string | null }) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: opts?.viewAsClientTenantSlug ?? null,
    clientWorkspaceTenantSlug: opts?.clientWorkspaceTenantSlug ?? null,
  };
}

function currentUtcYear(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric" }).format(new Date()));
}

function settingsFor(
  tenantSlug: string,
  coverageMode: "current_year_only" | "include_previous_years" | "custom_start_month",
  customStartYear: number | null = null,
  customStartMonth: number | null = null,
  isDefault = false,
) {
  return {
    settings: {
      tenant_slug: tenantSlug,
      coverage_mode: coverageMode,
      custom_start_year: customStartYear,
      custom_start_month: customStartMonth,
    },
    isDefault,
  };
}

describe("financial skipped-month validation + settings foundation", () => {
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
    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockImplementation(async (tenantSlug: string) =>
      settingsFor(String(tenantSlug), "current_year_only", null, null, true),
    );
  });

  it("missing settings row uses current-year default", async () => {
    const year = currentUtcYear();
    const admin = makeUser({ id: 101, role: "admin", email: "admin@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: year - 1, month: 11 },
      { year: year, month: 2 },
    ]);

    const result = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });

    expect(result.coverageMode).toBe("current_year_only");
    expect(result.settingsDefaulted).toBe(true);
    expect(result.reportingTimezone).toBe("UTC");
    expect(result.findings.every((f: any) => f.year === year)).toBe(true);
  });

  it("database error for settings does not silently use defaults", async () => {
    const admin = makeUser({ id: 102, role: "admin", email: "admin2@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([{ year: 2026, month: 7 }, { year: 2026, month: 9 }]);
    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockRejectedValue(new Error("settings read failed"));

    await expect(caller.financials.validationSkippedMonths({ tenantSlug: "heynova" })).rejects.toThrow(
      "Failed to retrieve financial validation settings.",
    );
  });

  it("current-year filtering keeps only current year findings", async () => {
    const year = currentUtcYear();
    const admin = makeUser({ id: 103, role: "admin", email: "admin3@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockResolvedValue(settingsFor("heynova", "current_year_only"));
    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: year - 1, month: 11 },
      { year, month: 2 },
      { year, month: 4 },
    ]);

    const result = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings.every((f: any) => f.year === year)).toBe(true);
    expect(result.findings.map((f: any) => `${f.year}-${f.month}`)).toContain(`${year}-3`);
  });

  it("include_previous_years returns full-range findings", async () => {
    const year = currentUtcYear();
    const admin = makeUser({ id: 104, role: "admin", email: "admin4@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockResolvedValue(settingsFor("heynova", "include_previous_years"));
    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: year - 1, month: 11 },
      { year, month: 2 },
    ]);

    const result = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });
    expect(result.findings.some((f: any) => f.year === year - 1 && f.month === 12)).toBe(true);
    expect(result.findings.some((f: any) => f.year === year && f.month === 1)).toBe(true);
  });

  it("custom start-month filtering excludes earlier findings", async () => {
    const year = currentUtcYear();
    const admin = makeUser({ id: 105, role: "admin", email: "admin5@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockResolvedValue(
      settingsFor("heynova", "custom_start_month", year, 2),
    );
    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: year - 1, month: 11 },
      { year, month: 4 },
    ]);

    const result = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });
    expect(result.findings.every((f: any) => (f.year > year) || (f.year === year && f.month >= 2))).toBe(true);
    expect(result.findings.some((f: any) => f.year === year && f.month === 3)).toBe(true);
  });

  it("December-to-January boundary is preserved", async () => {
    const admin = makeUser({ id: 106, role: "admin", email: "admin6@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockResolvedValue(settingsFor("heynova", "include_previous_years"));
    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: 2025, month: 12 },
      { year: 2026, month: 2 },
    ]);

    const result = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual(expect.objectContaining({ year: 2026, month: 1 }));
  });

  it("forbids unauthorized tenant access for assigned staff", async () => {
    const accountant = makeUser({ id: 107, role: "accountant", email: "acct@firm.com" });
    const caller = appRouter.createCaller(makeCtx(accountant));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 107, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.financials.validationSkippedMonths({ tenantSlug: "heynova" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("does not write to underlying financial records", async () => {
    const admin = makeUser({ id: 108, role: "admin", email: "admin8@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const fromSpy = vi.spyOn(supabaseModule.supabase, "from");
    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: 2026, month: 7 },
      { year: 2026, month: 9 },
    ]);

    await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });

    const calls = fromSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((name) => name === "heynova_financials")).toBe(false);
  });

  it("admin updates settings successfully", async () => {
    const admin = makeUser({ id: 109, role: "admin", email: "admin9@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "heynova", company_name: "Heynova" } as any);
    const upsertSpy = vi.spyOn(supabaseModule, "upsertFinancialValidationSettings").mockResolvedValue({
      tenant_slug: "heynova",
      coverage_mode: "custom_start_month",
      custom_start_year: 2025,
      custom_start_month: 7,
      updated_at: new Date().toISOString(),
    } as any);

    const result = await caller.financials.updateValidationSettings({
      tenantSlug: "heynova",
      coverageMode: "custom_start_month",
      customStartYear: 2025,
      customStartMonth: 7,
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      tenantSlug: "heynova",
      coverageMode: "custom_start_month",
      customStartYear: 2025,
      customStartMonth: 7,
    }));
  });

  it("accountant cannot update settings", async () => {
    const accountant = makeUser({ id: 110, role: "accountant", email: "acct2@firm.com" });
    const caller = appRouter.createCaller(makeCtx(accountant));

    await expect(caller.financials.updateValidationSettings({
      tenantSlug: "heynova",
      coverageMode: "current_year_only",
    })).rejects.toThrow("Admin access required");
  });

  it("client cannot update settings", async () => {
    const clientUser = makeUser({ id: 111, role: "client", email: "client@heynova.com", tenant_slug: "heynova" });
    const caller = appRouter.createCaller(makeCtx(clientUser));

    await expect(caller.financials.updateValidationSettings({
      tenantSlug: "heynova",
      coverageMode: "current_year_only",
    })).rejects.toThrow("Admin access required");
  });

  it("invalid custom configuration is rejected", async () => {
    const admin = makeUser({ id: 112, role: "admin", email: "admin10@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "heynova", company_name: "Heynova" } as any);

    await expect(caller.financials.updateValidationSettings({
      tenantSlug: "heynova",
      coverageMode: "custom_start_month",
      customStartYear: 2026,
      customStartMonth: null,
    } as any)).rejects.toThrow("Custom start year and month are required for custom coverage mode.");
  });

  it("settings for one tenant do not affect another", async () => {
    const admin = makeUser({ id: 113, role: "admin", email: "admin11@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getFinancialValidationSettings").mockImplementation(async (tenantSlug: string) => {
      if (tenantSlug === "heynova") return settingsFor("heynova", "current_year_only");
      return settingsFor("acme_llc", "include_previous_years");
    });

    vi.spyOn(supabaseModule, "listFinancialPeriodsStrict").mockResolvedValue([
      { year: 2025, month: 11 },
      { year: 2026, month: 2 },
    ]);

    const one = await caller.financials.validationSkippedMonths({ tenantSlug: "heynova" });
    const two = await caller.financials.validationSkippedMonths({ tenantSlug: "acme_llc" });

    expect(one.coverageMode).toBe("current_year_only");
    expect(two.coverageMode).toBe("include_previous_years");
    expect(two.findings.length).toBeGreaterThanOrEqual(one.findings.length);
  });
});
