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

function makeCtx(user: any, opts?: { clientWorkspaceTenantSlug?: string | null; viewAsClientTenantSlug?: string | null }) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: opts?.viewAsClientTenantSlug ?? null,
    clientWorkspaceTenantSlug: opts?.clientWorkspaceTenantSlug ?? null,
  };
}

describe("coaching trigger monitor + priorities", () => {
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
    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "cfo",
      is_active: true,
      is_churned: false,
      company_name: "Acme LLC",
    } as any);
  });

  it("returns canonical 17 triggers with operational unknown placeholders", async () => {
    const user = makeUser({ id: 1001, role: "admin", email: "admin@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue({
      id: "snap-1",
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 6,
      report_month_label: "Jun 26",
      trigger_engine_version: "phase_5_v1",
      source_import_id: null,
      source_document_id: null,
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: ["negative_net_income"],
      clear_keys: [],
      unknown_keys: [],
      triggers: [
        { trigger_key: "negative_net_income", status: "triggered", display_value: "$-123" },
      ],
      raw_payload: {},
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const out = await caller.coaching.triggerMonitorLatest({ tenantSlug: "acme_llc" });

    expect(out.items).toHaveLength(17);
    expect(out.summary.total).toBe(17);
    const op = out.items.find((i: any) => i.trigger_key === "no_tiered_pricing");
    expect(op?.status).toBe("unknown");
    expect(op?.display_value).toBe("Not enough data");
  });

  it("uses exact latest snapshot period ordering helper", async () => {
    const user = makeUser({ id: 1002, role: "admin", email: "admin2@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const latestSpy = vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue(null as any);

    await caller.coaching.triggerMonitorLatest({ tenantSlug: "acme_llc" });

    expect(latestSpy).toHaveBeenCalledWith("acme_llc", "financial_pdf");
  });

  it("lists trigger periods in chronological order with latest flag", async () => {
    const user = makeUser({ id: 1006, role: "admin", email: "admin4@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockResolvedValue([
      {
        period_year: 2025,
        period_month: 12,
        report_month_label: "Dec 25",
        trigger_engine_version: "v1",
        received_at: "2025-12-31T00:00:00.000Z",
        triggered_count: 3,
        clear_count: 9,
        unknown_count: 5,
      },
      {
        period_year: 2026,
        period_month: 1,
        report_month_label: "Jan 26",
        trigger_engine_version: "v1",
        received_at: "2026-01-31T00:00:00.000Z",
        triggered_count: 4,
        clear_count: 8,
        unknown_count: 5,
      },
      {
        period_year: 2026,
        period_month: 2,
        report_month_label: "Feb 26",
        trigger_engine_version: "v2",
        received_at: "2026-02-20T00:00:00.000Z",
        triggered_count: 6,
        clear_count: 6,
        unknown_count: 5,
      },
    ] as any);

    const out = await caller.coaching.triggerMonitorPeriods({ tenantSlug: "acme_llc" });

    expect(out.periods).toHaveLength(3);
    expect(out.periods[0]).toMatchObject({ periodYear: 2025, periodMonth: 12, isLatest: false });
    expect(out.periods[1]).toMatchObject({ periodYear: 2026, periodMonth: 1, isLatest: false });
    expect(out.periods[2]).toMatchObject({ periodYear: 2026, periodMonth: 2, isLatest: true });
  });

  it("retrieves historical period and returns canonical 17-card merge", async () => {
    const user = makeUser({ id: 1007, role: "admin", email: "admin5@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "getCfoTriggerSnapshotByPeriod").mockResolvedValue({
      id: "snap-feb",
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 2,
      report_month_label: "Feb 26",
      trigger_engine_version: "phase_5_v1",
      source_import_id: null,
      source_document_id: null,
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: ["low_cash_balance"],
      clear_keys: [],
      unknown_keys: [],
      triggers: [{ trigger_key: "low_cash_balance", status: "triggered", display_value: "$7,749" }],
      raw_payload: {},
      received_at: "2026-02-28T00:00:00.000Z",
      created_at: "2026-02-28T00:00:00.000Z",
      updated_at: "2026-02-28T00:00:00.000Z",
    } as any);

    vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue({
      id: "snap-jun",
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 6,
      report_month_label: "Jun 26",
      trigger_engine_version: "phase_5_v1",
      source_import_id: null,
      source_document_id: null,
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: [],
      clear_keys: [],
      unknown_keys: [],
      triggers: [],
      raw_payload: {},
      received_at: "2026-06-30T00:00:00.000Z",
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z",
    } as any);

    const out = await caller.coaching.triggerMonitorByPeriod({ tenantSlug: "acme_llc", periodYear: 2026, periodMonth: 2 });

    expect(out.items).toHaveLength(17);
    expect(out.selectedSnapshot?.reportMonthLabel).toBe("Feb 26");
    expect(out.isLatest).toBe(false);
    const triggered = out.items.find((i: any) => i.trigger_key === "low_cash_balance");
    expect(triggered?.status).toBe("triggered");
    const operational = out.items.find((i: any) => i.trigger_key === "churn_not_improving");
    expect(operational?.status).toBe("unknown");
  });

  it("enforces staff assignment restrictions", async () => {
    const staff = makeUser({ id: 1003, role: "accountant", email: "acct@firm.com", tenant_slug: null as any });
    const caller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { staff_user_id: 1003, tenant_slug: "beta_llc" },
    ] as any);

    await expect(caller.coaching.triggerMonitorPeriods({ tenantSlug: "acme_llc" })).rejects.toThrow(
      "Tenant is not assigned to this staff member.",
    );
  });

  it("supports view-as-client context for staff without explicit tenantSlug", async () => {
    const staff = makeUser({ id: 1004, role: "accountant", email: "acct2@firm.com", tenant_slug: null as any });
    const caller = appRouter.createCaller(
      makeCtx(staff, { viewAsClientTenantSlug: "acme_llc", clientWorkspaceTenantSlug: null }),
    );

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { staff_user_id: 1004, tenant_slug: "acme_llc" },
    ] as any);
    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockResolvedValue([] as any);

    await expect(caller.coaching.triggerMonitorPeriods({})).resolves.toMatchObject({ tenantSlug: "acme_llc" });
  });

  it("allows authorized staff/admin to delete a trigger snapshot with strict period scope", async () => {
    const admin = makeUser({ id: 1010, role: "admin", email: "admin-delete@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const deleteSnapshotSpy = vi.spyOn(supabaseModule, "deleteCfoTriggerSnapshotPeriod").mockResolvedValue(1);
    const deleteFinancialPeriodSpy = vi.spyOn(supabaseModule, "deleteFinancialPeriod").mockResolvedValue(undefined as any);

    const out = await caller.coaching.deleteTriggerMonitorPeriod({
      tenantSlug: "acme_llc",
      year: 2026,
      month: 7,
    });

    expect(out.success).toBe(true);
    expect(out.deletedCount).toBe(1);
    expect(deleteSnapshotSpy).toHaveBeenCalledWith("acme_llc", 2026, 7, "financial_pdf");
    expect(deleteFinancialPeriodSpy).not.toHaveBeenCalled();
  });

  it("rejects trigger snapshot delete for client users", async () => {
    const clientUser = makeUser({ id: 1011, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(clientUser));

    await expect(
      caller.coaching.deleteTriggerMonitorPeriod({ year: 2026, month: 7 }),
    ).rejects.toThrow("Clients cannot delete trigger snapshots.");
  });

  it("delete + period list reflects removed month while preserving other months", async () => {
    const admin = makeUser({ id: 1012, role: "admin", email: "admin-periods@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    let removed = false;

    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockImplementation(async () => {
      if (removed) {
        return [
          {
            period_year: 2026,
            period_month: 6,
            report_month_label: "Jun 26",
            trigger_engine_version: "v1",
            received_at: "2026-06-30T00:00:00.000Z",
            triggered_count: 4,
            clear_count: 8,
            unknown_count: 5,
          },
        ] as any;
      }

      return [
        {
          period_year: 2026,
          period_month: 6,
          report_month_label: "Jun 26",
          trigger_engine_version: "v1",
          received_at: "2026-06-30T00:00:00.000Z",
          triggered_count: 4,
          clear_count: 8,
          unknown_count: 5,
        },
        {
          period_year: 2026,
          period_month: 7,
          report_month_label: "Jul 26",
          trigger_engine_version: "v1",
          received_at: "2026-07-31T00:00:00.000Z",
          triggered_count: 5,
          clear_count: 7,
          unknown_count: 5,
        },
      ] as any;
    });

    vi.spyOn(supabaseModule, "deleteCfoTriggerSnapshotPeriod").mockImplementation(async () => {
      removed = true;
      return 1;
    });

    const before = await caller.coaching.triggerMonitorPeriods({ tenantSlug: "acme_llc" });
    expect(before.periods).toHaveLength(2);

    await caller.coaching.deleteTriggerMonitorPeriod({ tenantSlug: "acme_llc", year: 2026, month: 7 });

    const after = await caller.coaching.triggerMonitorPeriods({ tenantSlug: "acme_llc" });
    expect(after.periods).toHaveLength(1);
    expect(after.periods[0]).toMatchObject({ periodYear: 2026, periodMonth: 6 });
  });

  it("priorities create/complete/reopen/delete are tenant-scoped", async () => {
    const admin = makeUser({ id: 1005, role: "admin", email: "admin3@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "listCoachingPriorities").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "createCoachingPriority").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_slug: "acme_llc",
      year: 2026,
      title: "Sign 12 clients",
      completed: false,
      sort_order: 0,
      created_by_user_id: 1005,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const created = await caller.coaching.prioritiesCreate({ year: 2026, tenantSlug: "acme_llc", title: "Sign 12 clients" });
    expect(created.success).toBe(true);

    vi.spyOn(supabaseModule, "updateCoachingPriorityCompletion").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_slug: "acme_llc",
      year: 2026,
      title: "Sign 12 clients",
      completed: true,
      sort_order: 0,
      created_by_user_id: 1005,
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const completed = await caller.coaching.prioritiesToggle({
      id: "11111111-1111-4111-8111-111111111111",
      completed: true,
      tenantSlug: "acme_llc",
    });
    expect(completed.success).toBe(true);

    vi.spyOn(supabaseModule, "updateCoachingPriorityCompletion").mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_slug: "acme_llc",
      year: 2026,
      title: "Sign 12 clients",
      completed: false,
      sort_order: 0,
      created_by_user_id: 1005,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const reopened = await caller.coaching.prioritiesToggle({
      id: "11111111-1111-4111-8111-111111111111",
      completed: false,
      tenantSlug: "acme_llc",
    });
    expect(reopened.success).toBe(true);

    const deleteSpy = vi.spyOn(supabaseModule, "deleteCoachingPriority").mockResolvedValue(undefined as any);
    const deleted = await caller.coaching.prioritiesDelete({
      id: "11111111-1111-4111-8111-111111111111",
      tenantSlug: "acme_llc",
    });
    expect(deleted.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith("acme_llc", "11111111-1111-4111-8111-111111111111");
  });
});
