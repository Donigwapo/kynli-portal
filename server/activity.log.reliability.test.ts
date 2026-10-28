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

describe("activity log reliability behavior", () => {
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("successful audit insert does not emit failure warning", async () => {
    const admin = makeUser({ id: 31, role: "admin", email: "admin31@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "acme_llc", package_tier: "cfo" } as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 431, source_import_id: null, source_document_id: null }] as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    const insertSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 999 } as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await caller.financials.updatePublishedPeriod({
      tenantSlug: "acme_llc",
      month: 11,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 1000, budget: 900 }],
      expenses: [{ category: "Ops", actual: 250, budget: 200 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 100, budget: 90 },
        totalOtherIncome: { actual: 0, budget: 0 },
        totalOtherExpense: { actual: 0, budget: 0 },
      },
      financialSummary: "Summary",
      notes: "",
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith("[activity_log.write.failed]", expect.anything());
  });

  it("insertActivityLog returns null path emits safe failure warning", async () => {
    const admin = makeUser({ id: 32, role: "admin", email: "admin32@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "acme_llc", package_tier: "cfo" } as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 432, source_import_id: null, source_document_id: null }] as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    const insertSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue(null as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await caller.financials.updatePublishedPeriod({
      tenantSlug: "acme_llc",
      month: 12,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 900, budget: 850 }],
      expenses: [{ category: "Ops", actual: 150, budget: 140 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 50, budget: 45 },
        totalOtherIncome: { actual: 0, budget: 0 },
        totalOtherExpense: { actual: 0, budget: 0 },
      },
      financialSummary: "Summary",
      notes: "",
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[activity_log.write.failed]",
      expect.objectContaining({
        action_type: "financial_published_period_updated",
        tenant_slug: "acme_llc",
        year: 2026,
        month: 12,
        actor_user_id: "32",
      }),
    );

    const payload = warnSpy.mock.calls.find((c) => c[0] === "[activity_log.write.failed]")?.[1] as Record<string, unknown>;
    expect(payload).toBeTruthy();
    expect(payload).not.toHaveProperty("totals");
    expect(payload).not.toHaveProperty("financialSummary");
    expect(payload).not.toHaveProperty("notes");
  });

  it("unexpected audit insert exception is handled and financial mutation still succeeds", async () => {
    const admin = makeUser({ id: 33, role: "admin", email: "admin33@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 433 }] as any);
    vi.spyOn(supabaseModule, "deleteLineItemsForPeriod").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "deleteFinancialPeriod").mockResolvedValue(undefined);

    const insertSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockRejectedValue(new Error("db insert panic"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await caller.financials.deletePublishedPeriod({
      tenantSlug: "acme_llc",
      year: 2026,
      month: 12,
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[activity_log.write.failed]",
      expect.objectContaining({
        action_type: "financial_published_period_deleted",
        tenant_slug: "acme_llc",
        year: 2026,
        month: 12,
        actor_user_id: "33",
      }),
    );
  });
});
