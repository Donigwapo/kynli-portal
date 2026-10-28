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

describe("financial activity logging batch 1", () => {
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

  it("saveReviewedPeriod writes one financial_reviewed_period_saved log on success", async () => {
    const admin = makeUser({ id: 11, role: "admin", email: "admin@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 3,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "legacy",
    } as any);

    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 88 }] as any);

    const fromSpy = vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: importJob, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { import_id: importJob.import_id, tenant_slug: importJob.tenant_slug }, error: null }),
              }),
            }),
          }),
        } as any;
      }

      if (table === "financial_summary_versions") {
        const chain: any = {
          eq: () => chain,
          order: () => chain,
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        };

        return {
          select: () => chain,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }),
            }),
          }),
        } as any;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 1 } as any);

    const result = await caller.financials.saveReviewedPeriod({
      importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      tenantSlug: "acme_llc",
      month: 3,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
      expenses: [{ category: "Ops", actual: 300, budget: 250 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 100, budget: 90 },
        totalOtherIncome: { actual: 50, budget: 40 },
        totalOtherExpense: { actual: 20, budget: 30 },
      },
      financialSummary: "Reviewed and approved",
      notes: "Looks good",
    });

    expect(result.success).toBe(true);
    expect(insertLogSpy).toHaveBeenCalledTimes(1);
    expect(insertLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: 11,
        actor_role: "admin",
        action_type: "financial_reviewed_period_saved",
        entity_type: "financial_period",
        tenant_slug: "acme_llc",
        metadata: expect.objectContaining({
          year: 2026,
          month: 3,
          import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
          source_document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
          line_items_replaced: true,
        }),
      }),
    );

    expect(fromSpy).toHaveBeenCalledWith("financial_import_jobs");
  });

  it("updatePublishedPeriod writes one financial_published_period_updated log on success", async () => {
    const admin = makeUser({ id: 12, role: "admin", email: "admin2@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "cfo",
    } as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 42, source_import_id: null, source_document_id: null }] as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 2 } as any);

    const result = await caller.financials.updatePublishedPeriod({
      tenantSlug: "acme_llc",
      month: 4,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 1200, budget: 1100 }],
      expenses: [{ category: "Ops", actual: 400, budget: 380 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 100, budget: 90 },
        totalOtherIncome: { actual: 40, budget: 20 },
        totalOtherExpense: { actual: 10, budget: 15 },
      },
      financialSummary: "Updated summary",
      notes: "",
    });

    expect(result.success).toBe(true);
    expect(insertLogSpy).toHaveBeenCalledTimes(1);
    expect(insertLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: 12,
        action_type: "financial_published_period_updated",
        tenant_slug: "acme_llc",
        metadata: expect.objectContaining({
          year: 2026,
          month: 4,
          line_items_replaced: true,
          totals: expect.objectContaining({
            revenue: 1200,
            expenses: 400,
          }),
        }),
      }),
    );
  });

  it("deletePublishedPeriod writes one financial_published_period_deleted log on success", async () => {
    const admin = makeUser({ id: 13, role: "admin", email: "admin3@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 55 }] as any);
    vi.spyOn(supabaseModule, "deleteLineItemsForPeriod").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "deleteFinancialPeriod").mockResolvedValue(undefined);

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 3 } as any);

    const result = await caller.financials.deletePublishedPeriod({
      tenantSlug: "acme_llc",
      year: 2026,
      month: 5,
    });

    expect(result.success).toBe(true);
    expect(insertLogSpy).toHaveBeenCalledTimes(1);
    expect(insertLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: 13,
        action_type: "financial_published_period_deleted",
        entity_id: "55",
        tenant_slug: "acme_llc",
        metadata: expect.objectContaining({ year: 2026, month: 5 }),
      }),
    );
  });

  it("failed update/delete operations do not write false success logs", async () => {
    const admin = makeUser({ id: 14, role: "admin", email: "admin4@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "cfo",
    } as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 90, source_import_id: null, source_document_id: null }] as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockRejectedValue(new Error("replace failed"));

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 4 } as any);

    await expect(
      caller.financials.updatePublishedPeriod({
        tenantSlug: "acme_llc",
        month: 6,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 800, budget: 900 }],
        expenses: [{ category: "Ops", actual: 200, budget: 190 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 50, budget: 45 },
          totalOtherIncome: { actual: 10, budget: 5 },
          totalOtherExpense: { actual: 5, budget: 5 },
        },
        financialSummary: "Summary",
        notes: "",
      }),
    ).rejects.toThrow("replace failed");

    expect(insertLogSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();

    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 91 }] as any);
    vi.spyOn(supabaseModule, "deleteLineItemsForPeriod").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "deleteFinancialPeriod").mockRejectedValue(new Error("delete failed"));
    const insertLogSpy2 = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 5 } as any);

    await expect(
      caller.financials.deletePublishedPeriod({ tenantSlug: "acme_llc", year: 2026, month: 7 }),
    ).rejects.toThrow("delete failed");

    expect(insertLogSpy2).not.toHaveBeenCalled();
  });

  it("workspace mismatch is forbidden (no cross-client leakage) and does not write logs", async () => {
    const accountant = makeUser({ id: 15, role: "accountant", email: "acct@firm.com", tenant_slug: null });
    const caller = appRouter.createCaller(
      makeCtx(accountant, {
        viewAsClientTenantSlug: "beta_inc",
      }),
    );

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, staff_id: 15, tenant_slug: "acme_llc", assigned_at: new Date().toISOString() },
    ] as any);

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 6 } as any);

    await expect(
      caller.financials.updatePublishedPeriod({
        tenantSlug: "acme_llc",
        month: 8,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 100, budget: 100 }],
        expenses: [{ category: "Ops", actual: 10, budget: 10 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 0, budget: 0 },
          totalOtherIncome: { actual: 0, budget: 0 },
          totalOtherExpense: { actual: 0, budget: 0 },
        },
        financialSummary: "Summary",
        notes: "",
      }),
    ).rejects.toThrow("Requested tenant does not match active client workspace.");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });

  it("updatePublishedPeriod succeeds and emits structured warning when audit insert fails", async () => {
    const admin = makeUser({ id: 21, role: "admin", email: "admin5@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "cfo",
    } as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 142, source_import_id: null, source_document_id: null }] as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue(null as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await caller.financials.updatePublishedPeriod({
      tenantSlug: "acme_llc",
      month: 9,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 500, budget: 450 }],
      expenses: [{ category: "Ops", actual: 100, budget: 95 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 50, budget: 40 },
        totalOtherIncome: { actual: 0, budget: 0 },
        totalOtherExpense: { actual: 0, budget: 0 },
      },
      financialSummary: "Summary",
      notes: "",
    });

    expect(result.success).toBe(true);
    expect(insertLogSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[activity_log.write.failed]",
      expect.objectContaining({
        action_type: "financial_published_period_updated",
        tenant_slug: "acme_llc",
        year: 2026,
        month: 9,
        actor_user_id: "21",
      }),
    );

    const warnPayload = warnSpy.mock.calls.find((c) => c[0] === "[activity_log.write.failed]")?.[1] as Record<string, unknown>;
    expect(warnPayload).toBeTruthy();
    expect(warnPayload).not.toHaveProperty("totals");
    expect(warnPayload).not.toHaveProperty("financialSummary");
    expect(warnPayload).not.toHaveProperty("notes");
  });

  it("saveReviewedPeriod succeeds and emits structured warning when audit insert throws", async () => {
    const admin = makeUser({ id: 22, role: "admin", email: "admin6@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 10,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "legacy",
    } as any);

    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([{ id: 188 }] as any);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: importJob, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { import_id: importJob.import_id, tenant_slug: importJob.tenant_slug }, error: null }),
              }),
            }),
          }),
        } as any;
      }

      if (table === "financial_summary_versions") {
        const chain: any = {
          eq: () => chain,
          order: () => chain,
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        };

        return {
          select: () => chain,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }),
            }),
          }),
        } as any;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockRejectedValue(new Error("audit insert crash"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await caller.financials.saveReviewedPeriod({
      importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      tenantSlug: "acme_llc",
      month: 10,
      year: 2026,
      incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
      expenses: [{ category: "Ops", actual: 300, budget: 250 }],
      specialTotals: {
        totalCostOfGoodsSold: { actual: 100, budget: 90 },
        totalOtherIncome: { actual: 50, budget: 40 },
        totalOtherExpense: { actual: 20, budget: 30 },
      },
      financialSummary: "Reviewed and approved",
      notes: "Looks good",
    });

    expect(result.success).toBe(true);
    expect(insertLogSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[activity_log.write.failed]",
      expect.objectContaining({
        action_type: "financial_reviewed_period_saved",
        tenant_slug: "acme_llc",
        year: 2026,
        month: 10,
        actor_user_id: "22",
      }),
    );
  });

  it("saveReviewedPeriod fails when financial_import_jobs update returns an error and does not write success audit", async () => {
    const admin = makeUser({ id: 23, role: "admin", email: "admin7@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 11,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "legacy",
    } as any);

    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: importJob, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: "update failed" } }),
              }),
            }),
          }),
        } as any;
      }

      if (table === "financial_summary_versions") {
        const chain: any = {
          eq: () => chain,
          order: () => chain,
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        };

        return {
          select: () => chain,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }),
            }),
          }),
        } as any;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 7 } as any);

    await expect(
      caller.financials.saveReviewedPeriod({
        importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
        tenantSlug: "acme_llc",
        month: 11,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
        expenses: [{ category: "Ops", actual: 300, budget: 250 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 100, budget: 90 },
          totalOtherIncome: { actual: 50, budget: 40 },
          totalOtherExpense: { actual: 20, budget: 30 },
        },
        financialSummary: "Reviewed and approved",
        notes: "Looks good",
      }),
    ).rejects.toThrow("Failed to save reviewed financial import state.");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });

  it("saveReviewedPeriod propagates unexpected financial_import_jobs update exceptions and does not write success audit", async () => {
    const admin = makeUser({ id: 24, role: "admin", email: "admin8@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 12,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "legacy",
    } as any);

    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: importJob, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => {
                  throw new Error("update crashed");
                },
              }),
            }),
          }),
        } as any;
      }

      if (table === "financial_summary_versions") {
        const chain: any = {
          eq: () => chain,
          order: () => chain,
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        };

        return {
          select: () => chain,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }),
            }),
          }),
        } as any;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 8 } as any);

    await expect(
      caller.financials.saveReviewedPeriod({
        importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
        tenantSlug: "acme_llc",
        month: 12,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
        expenses: [{ category: "Ops", actual: 300, budget: 250 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 100, budget: 90 },
          totalOtherIncome: { actual: 50, budget: 40 },
          totalOtherExpense: { actual: 20, budget: 30 },
        },
        financialSummary: "Reviewed and approved",
        notes: "Looks good",
      }),
    ).rejects.toThrow("update crashed");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });

  it("saveReviewedPeriod fails when no matching import job row is updated and does not write success audit", async () => {
    const admin = makeUser({ id: 25, role: "admin", email: "admin9@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 9,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "acme_llc", package_tier: "legacy" } as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: importJob, error: null }) }) }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: "No rows found" } }),
              }),
            }),
          }),
        } as any;
      }
      if (table === "financial_summary_versions") {
        const chain: any = { eq: () => chain, order: () => chain, limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), maybeSingle: async () => ({ data: null, error: null }) };
        return { select: () => chain, insert: () => ({ select: () => ({ single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }) }) }) } as any;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 9 } as any);

    await expect(
      caller.financials.saveReviewedPeriod({
        importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
        tenantSlug: "acme_llc",
        month: 9,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
        expenses: [{ category: "Ops", actual: 300, budget: 250 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 100, budget: 90 },
          totalOtherIncome: { actual: 50, budget: 40 },
          totalOtherExpense: { actual: 20, budget: 30 },
        },
        financialSummary: "Reviewed and approved",
        notes: "Looks good",
      }),
    ).rejects.toThrow("Failed to save reviewed financial import state.");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });

  it("saveReviewedPeriod fails on returned import_id mismatch and does not write success audit", async () => {
    const admin = makeUser({ id: 26, role: "admin", email: "admin10@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 2,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "acme_llc", package_tier: "legacy" } as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: importJob, error: null }) }) }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { import_id: "11111111-1111-1111-1111-111111111111", tenant_slug: "acme_llc" }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === "financial_summary_versions") {
        const chain: any = { eq: () => chain, order: () => chain, limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), maybeSingle: async () => ({ data: null, error: null }) };
        return { select: () => chain, insert: () => ({ select: () => ({ single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }) }) }) } as any;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 10 } as any);

    await expect(
      caller.financials.saveReviewedPeriod({
        importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
        tenantSlug: "acme_llc",
        month: 2,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
        expenses: [{ category: "Ops", actual: 300, budget: 250 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 100, budget: 90 },
          totalOtherIncome: { actual: 50, budget: 40 },
          totalOtherExpense: { actual: 20, budget: 30 },
        },
        financialSummary: "Reviewed and approved",
        notes: "Looks good",
      }),
    ).rejects.toThrow("Failed to verify reviewed financial import update.");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });

  it("saveReviewedPeriod fails on returned tenant mismatch and does not write success audit", async () => {
    const admin = makeUser({ id: 27, role: "admin", email: "admin11@kynli.com", tenant_slug: null });
    const caller = appRouter.createCaller(makeCtx(admin, { viewAsClientTenantSlug: "acme_llc" }));

    const importJob = {
      import_id: "8cd4bbd5-68a2-42ac-8849-317effea2396",
      document_id: "30f8d79b-7086-4b5e-8767-6ea069f34d9d",
      tenant_slug: "acme_llc",
      month: 1,
      year: 2026,
      status: "ready_for_review",
      extracted_data: {},
    };

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({ slug: "acme_llc", package_tier: "legacy" } as any);
    vi.spyOn(supabaseModule, "upsertFinancial").mockResolvedValue(undefined);
    vi.spyOn(supabaseModule, "replaceLineItemsForPeriod").mockResolvedValue(undefined);

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "financial_import_jobs") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: importJob, error: null }) }) }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { import_id: importJob.import_id, tenant_slug: "beta_inc" }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === "financial_summary_versions") {
        const chain: any = { eq: () => chain, order: () => chain, limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }), maybeSingle: async () => ({ data: null, error: null }) };
        return { select: () => chain, insert: () => ({ select: () => ({ single: async () => ({ data: { id: "v1", version_number: 1 }, error: null }) }) }) } as any;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const insertLogSpy = vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({ id: 11 } as any);

    await expect(
      caller.financials.saveReviewedPeriod({
        importId: "8cd4bbd5-68a2-42ac-8849-317effea2396",
        tenantSlug: "acme_llc",
        month: 1,
        year: 2026,
        incomeSources: [{ category: "Sales", actual: 1000, budget: 1200 }],
        expenses: [{ category: "Ops", actual: 300, budget: 250 }],
        specialTotals: {
          totalCostOfGoodsSold: { actual: 100, budget: 90 },
          totalOtherIncome: { actual: 50, budget: 40 },
          totalOtherExpense: { actual: 20, budget: 30 },
        },
        financialSummary: "Reviewed and approved",
        notes: "Looks good",
      }),
    ).rejects.toThrow("Reviewed financial import tenant verification failed.");

    expect(insertLogSpy).not.toHaveBeenCalled();
  });
});
