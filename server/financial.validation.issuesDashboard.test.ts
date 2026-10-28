import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase")>();
  return {
    ...actual,
    listActivePortalTenantsForValidationStrict: vi.fn(),
    countActivePortalTenantsForValidationStrict: vi.fn(),
    listFinancialPeriodsStrict: vi.fn(),
    getFinancialValidationSettings: vi.fn(),
    getTenantBySlug: vi.fn(),
    listFinancialCorePeriodsStrict: vi.fn(),
    listLineItemAmountsByYearStrict: vi.fn(),
  };
});

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

function settingsFor(
  tenantSlug: string,
  coverageMode: "current_year_only" | "include_previous_years" | "custom_start_month",
  customStartYear: number | null = null,
  customStartMonth: number | null = null,
) {
  return {
    settings: {
      tenant_slug: tenantSlug,
      coverage_mode: coverageMode,
      custom_start_year: customStartYear,
      custom_start_month: customStartMonth,
    },
    isDefault: false,
  };
}

function coreRow(y: number, m: number, overrides?: Partial<any>) {
  return {
    year: y,
    month: m,
    revenue: 0,
    expenses: 0,
    cogs_actual: 0,
    other_income_actual: 0,
    other_expense_actual: 0,
    net_profit: 0,
    ...overrides,
  };
}

describe("financial validation issues dashboard aggregation", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    const routersModule = await import("./routers");
    appRouter = routersModule.appRouter;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(supabaseModule.listActivePortalTenantsForValidationStrict).mockResolvedValue([
      { slug: "heynova", company_name: "Heynova" },
      { slug: "acme", company_name: "Acme" },
    ]);
    vi.mocked(supabaseModule.countActivePortalTenantsForValidationStrict).mockResolvedValue(2);

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockImplementation(async (slug: string) => {
      if (slug === "heynova") return [{ year: 2026, month: 7 }, { year: 2026, month: 9 }];
      return [{ year: 2026, month: 1 }, { year: 2026, month: 2 }];
    });

    vi.mocked(supabaseModule.getFinancialValidationSettings).mockImplementation(async (slug: string) =>
      settingsFor(slug, "include_previous_years"),
    );
    vi.mocked(supabaseModule.getTenantBySlug).mockImplementation(async (slug: string) => ({
      id: 1,
      slug,
      company_name: slug,
      contact_name: null,
      email: null,
      package_tier: "growth_1",
      is_active: true,
      is_churned: false,
      ghl_notes: null,
      invite_sent_at: null,
      invite_accepted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });

    vi.mocked(supabaseModule.listLineItemAmountsByYearStrict).mockResolvedValue({
      lineItems: [],
      invalidPeriods: [],
    });

    const originalFrom = supabaseModule.supabase.from.bind(supabaseModule.supabase);
    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
        } as any;
      }
      return originalFrom(table as any) as any;
    });
  });

  it("aggregates all three rule types", async () => {
    const admin = makeUser({ id: 1, role: "admin", email: "admin@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [{ year: 2026, month: 10, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const result = await caller.financials.validationSkippedMonthsSummary({});
    const ruleIds = new Set(result.issues.map((i: any) => i.ruleId));

    expect(ruleIds.has("skipped_financial_month")).toBe(true);
    expect(ruleIds.has("all_zero_financial_period")).toBe(true);
    expect(ruleIds.has("invalid_financial_data")).toBe(true);
    expect(result.summary.totalDetectedFindings).toBe(result.issues.length);
  });

  it("does not duplicate findings", async () => {
    const admin = makeUser({ id: 2, role: "admin", email: "admin2@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockResolvedValue([
      { year: 2026, month: 7 },
      { year: 2026, month: 7 },
      { year: 2026, month: 9 },
    ]);

    const result = await caller.financials.validationSkippedMonthsSummary({ tenantSlug: "heynova" });
    const keys = result.issues.map((i: any) => `${i.tenantSlug}-${i.year}-${i.month}-${i.ruleId}-${i.reasonCode ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respects per-client coverage settings", async () => {
    const nowYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric" }).format(new Date()));
    const admin = makeUser({ id: 3, role: "admin", email: "admin3@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockResolvedValue([
      { year: nowYear - 1, month: 11 },
      { year: nowYear, month: 2 },
    ]);

    vi.mocked(supabaseModule.getFinancialValidationSettings).mockImplementation(async (slug: string) => {
      if (slug === "heynova") return settingsFor("heynova", "current_year_only");
      return settingsFor("acme", "include_previous_years");
    });

    const result = await caller.financials.validationSkippedMonthsSummary({});
    const heynovaIssues = result.issues.filter((i: any) => i.tenantSlug === "heynova");
    const acmeIssues = result.issues.filter((i: any) => i.tenantSlug === "acme");

    expect(heynovaIssues.every((i: any) => i.year === nowYear)).toBe(true);
    expect(acmeIssues.some((i: any) => i.year === nowYear - 1)).toBe(true);
  });

  it("one rule failure preserves other rule findings for same tenant", async () => {
    const admin = makeUser({ id: 4, role: "admin", email: "admin4@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockRejectedValue(new Error("skipped failed"));

    const result = await caller.financials.validationSkippedMonthsSummary({ tenantSlug: "heynova" });
    expect(result.issues.some((i: any) => i.ruleId === "all_zero_financial_period")).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].ruleFailures?.some((rf: any) => rf.ruleId === "skipped_financial_month")).toBe(true);
  });

  it("failed rules are not counted as clean", async () => {
    const admin = makeUser({ id: 5, role: "admin", email: "admin5@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockRejectedValue(new Error("zero rule failed"));

    const result = await caller.financials.validationSkippedMonthsSummary({ tenantSlug: "heynova" });
    expect(result.summary.clientsFullyValidated).toBe(0);
    expect(result.summary.clientsPartiallyValidated + result.summary.clientsFailedValidation).toBeGreaterThan(0);
    expect(result.failures.some((f: any) => Array.isArray(f.ruleFailures) && f.ruleFailures.length > 0)).toBe(true);
  });

  it("one tenant failure does not block others", async () => {
    const admin = makeUser({ id: 6, role: "admin", email: "admin6@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockImplementation(async (slug: string) => {
      if (slug === "acme") throw new Error("db failed");
      return [{ year: 2026, month: 7 }, { year: 2026, month: 9 }];
    });

    const result = await caller.financials.validationSkippedMonthsSummary({});
    expect(result.summary.scannedClients).toBe(2);
    expect(result.summary.clientsPartiallyValidated + result.summary.clientsFailedValidation).toBeGreaterThan(0);
    expect(result.issues.some((i: any) => i.tenantSlug === "heynova")).toBe(true);
  });

  it("counts include per-rule totals", async () => {
    const admin = makeUser({ id: 7, role: "admin", email: "admin7@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [{ year: 2026, month: 10, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const result = await caller.financials.validationSkippedMonthsSummary({ tenantSlug: "heynova" });
    expect(result.summary.totalDetectedFindings).toBe(result.issues.length);
    expect(result.summary.skippedFinancialMonthFindings).toBeGreaterThanOrEqual(0);
    expect(result.summary.allZeroFinancialPeriodFindings).toBeGreaterThanOrEqual(0);
    expect(result.summary.invalidFinancialDataFindings).toBeGreaterThanOrEqual(0);
  });

  it("bounded scan limit reports completeness metadata", async () => {
    const admin = makeUser({ id: 8, role: "admin", email: "admin8@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listActivePortalTenantsForValidationStrict).mockResolvedValue([
      { slug: "heynova", company_name: "Heynova" },
    ]);
    vi.mocked(supabaseModule.countActivePortalTenantsForValidationStrict).mockResolvedValue(5);

    const result = await caller.financials.validationSkippedMonthsSummary({ limitTenants: 1 });
    expect(result.scan.totalEligibleClients).toBe(5);
    expect(result.scan.scannedClients).toBe(1);
    expect(result.scan.unscannedClients).toBe(4);
    expect(result.scan.complete).toBe(false);
  });

  it("passes scan limit through tenant listing helper", async () => {
    const admin = makeUser({ id: 9, role: "admin", email: "admin9@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    await caller.financials.validationSkippedMonthsSummary({ limitTenants: 17 });
    expect(supabaseModule.listActivePortalTenantsForValidationStrict).toHaveBeenCalledWith(17);
  });

  it("unauthorized users cannot access", async () => {
    const accountant = makeUser({ id: 10, role: "accountant", email: "acct@firm.com" });
    const caller = appRouter.createCaller(makeCtx(accountant));
    await expect(caller.financials.validationSkippedMonthsSummary({})).rejects.toThrow("Admin access required");
  });

  it("does not write financial data", async () => {
    const admin = makeUser({ id: 11, role: "admin", email: "admin11@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const upsertSpy = vi.spyOn(supabaseModule, "upsertFinancial");
    const replaceSpy = vi.spyOn(supabaseModule, "replaceLineItemsForPeriod");

    await caller.financials.validationSkippedMonthsSummary({});

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("existing skipped-month compatibility remains", async () => {
    const admin = makeUser({ id: 12, role: "admin", email: "admin12@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialPeriodsStrict).mockResolvedValue([{ year: 2026, month: 7 }, { year: 2026, month: 9 }]);

    const result = await caller.financials.validationSkippedMonthsSummary({ tenantSlug: "heynova" });
    expect(result.issues.some((i: any) => i.ruleId === "skipped_financial_month" && i.year === 2026 && i.month === 8)).toBe(true);
  });
});
