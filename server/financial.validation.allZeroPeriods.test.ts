import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase")>();
  return {
    ...actual,
    listFinancialCorePeriodsStrict: vi.fn(),
    listLineItemAmountsByYearStrict: vi.fn(),
    getFinancialValidationSettings: vi.fn(),
    getStaffAssignments: vi.fn(),
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

describe("financial validation all-zero periods", () => {
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

    vi.mocked(supabaseModule.getFinancialValidationSettings).mockResolvedValue(
      settingsFor("heynova", "include_previous_years"),
    );
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

  it("modern financial period with valid zero values", async () => {
    const admin = makeUser({ id: 1, role: "admin", email: "admin@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(1);
    expect(res.invalidDataFindings).toHaveLength(0);
  });

  it("legacy optional fields NULL-compatible path still evaluates", async () => {
    const admin = makeUser({ id: 2, role: "admin", email: "admin2@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "legacy_missing_optional_columns",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(1);
    expect(res.optionalFieldsCompatMode).toBe("legacy_missing_optional_columns");
  });

  it("all core totals zero and all line items zero => finding", async () => {
    const admin = makeUser({ id: 3, role: "admin", email: "admin3@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });
    vi.mocked(supabaseModule.listLineItemAmountsByYearStrict).mockResolvedValue({
      lineItems: [{ year: 2026, month: 8, amount: 0 }],
      invalidPeriods: [],
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(1);
  });

  it("all core totals zero but non-zero line item => no all-zero finding", async () => {
    const admin = makeUser({ id: 4, role: "admin", email: "admin4@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });
    vi.mocked(supabaseModule.listLineItemAmountsByYearStrict).mockResolvedValue({
      lineItems: [{ year: 2026, month: 8, amount: 12.5 }],
      invalidPeriods: [],
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(0);
    expect(res.invalidDataFindings).toHaveLength(0);
  });

  it("invalid required revenue => invalid_financial_data only", async () => {
    const admin = makeUser({ id: 5, role: "admin", email: "admin5@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 9)],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(1);
    expect(res.invalidDataFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "invalid_financial_data", year: 2026, month: 8, field: "revenue" }),
      ]),
    );
  });

  it("invalid required expenses => invalid_financial_data", async () => {
    const admin = makeUser({ id: 6, role: "admin", email: "admin6@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "missing_required_field", field: "expenses", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(0);
    expect(res.invalidDataFindings).toHaveLength(1);
  });

  it("invalid required net profit => invalid_financial_data", async () => {
    const admin = makeUser({ id: 7, role: "admin", email: "admin7@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "invalid_required_field", field: "net_profit", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.invalidDataFindings).toHaveLength(1);
  });

  it("one malformed month alongside valid months does not block valid findings", async () => {
    const admin = makeUser({ id: 8, role: "admin", email: "admin8@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 9)],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings).toHaveLength(1);
    expect(res.invalidDataFindings).toHaveLength(1);
  });

  it("malformed line-item amount becomes invalid_financial_data and blocks uncertain period", async () => {
    const admin = makeUser({ id: 9, role: "admin", email: "admin9@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8), coreRow(2026, 9)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });
    vi.mocked(supabaseModule.listLineItemAmountsByYearStrict).mockResolvedValue({
      lineItems: [{ year: 2026, month: 9, amount: 0 }],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "invalid_line_item_amount", field: "amount", source: "line_items" }],
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.invalidDataFindings.some((f: any) => f.year === 2026 && f.month === 8)).toBe(true);
    expect(res.findings.some((f: any) => f.year === 2026 && f.month === 8)).toBe(false);
  });

  it("genuine database retrieval failure => explicit error", async () => {
    const admin = makeUser({ id: 10, role: "admin", email: "admin10@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockRejectedValue(new Error("db failed"));
    await expect(caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" })).rejects.toThrow(
      "Failed to retrieve financial period totals for validation.",
    );
  });

  it("no false all-zero finding when data is uncertain", async () => {
    const admin = makeUser({ id: 11, role: "admin", email: "admin11@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [{ year: 2026, month: 8, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings.some((f: any) => f.year === 2026 && f.month === 8)).toBe(false);
    expect(res.invalidDataFindings.some((f: any) => f.year === 2026 && f.month === 8)).toBe(true);
  });

  it("per-client coverage settings apply to both finding types", async () => {
    const admin = makeUser({ id: 12, role: "admin", email: "admin12@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.getFinancialValidationSettings).mockResolvedValue(settingsFor("heynova", "custom_start_month", 2026, 3));
    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 2), coreRow(2026, 3)],
      invalidPeriods: [{ year: 2026, month: 2, reasonCode: "invalid_required_field", field: "revenue", source: "financials" }],
      optionalFieldsCompatMode: "standard",
    });

    const res = await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });
    expect(res.findings.every((f: any) => f.month >= 3)).toBe(true);
    expect(res.invalidDataFindings.every((f: any) => f.month >= 3)).toBe(true);
  });

  it("tenant isolation enforced", async () => {
    const staff = makeUser({ id: 13, role: "accountant", email: "acct@firm.com" });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.mocked(supabaseModule.getStaffAssignments).mockResolvedValue([
      { id: 1, staff_id: 13, tenant_slug: "acme", assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("no financial record writes", async () => {
    const admin = makeUser({ id: 14, role: "admin", email: "admin14@kynli.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.mocked(supabaseModule.listFinancialCorePeriodsStrict).mockResolvedValue({
      periods: [coreRow(2026, 8)],
      invalidPeriods: [],
      optionalFieldsCompatMode: "standard",
    });

    const upsertSpy = vi.spyOn(supabaseModule, "upsertFinancial");
    const replaceSpy = vi.spyOn(supabaseModule, "replaceLineItemsForPeriod");

    await caller.financials.validationAllZeroPeriods({ tenantSlug: "heynova" });

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
