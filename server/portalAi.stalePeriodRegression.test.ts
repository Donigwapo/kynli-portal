import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let appRouter: any;
let supabaseModule: any;
let llmModule: any;

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

describe("portalAi.ask stale/deleted period regression", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    llmModule = await import("./_core/llm");
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

    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("financial deleted month: marks June unavailable and excludes stale assistant history", async () => {
    const user = makeUser({ id: 2201, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "listFinancialPeriods").mockResolvedValue([
      { year: 2026, month: 7 },
    ] as any);

    const getFinancialsSpy = vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([] as any);

    const invokeSpy = vi.spyOn(llmModule, "invokeLLM").mockResolvedValue({
      choices: [{ message: { content: "June 2026 is not currently available in submitted financial records." } }],
    } as any);

    const out = await caller.portalAi.ask({
      message: "How did June perform?",
      pageContext: { route: "/portal/financials", pageType: "financials", year: 2026, month: 7 },
      history: [
        { role: "assistant", content: "In June 2026 your net profit was $48,200." },
        { role: "user", content: "Please remember June performance." },
      ],
    });

    expect(out.message).toContain("not currently available");
    expect(getFinancialsSpy).not.toHaveBeenCalledWith("acme_llc", 2026, 6);

    const finalCall = invokeSpy.mock.calls.find((c: any[]) => !(c?.[0] as any)?.outputSchema);
    expect(finalCall).toBeTruthy();

    const finalMessages = ((finalCall?.[0] as any)?.messages ?? []) as Array<{ role: string; content: string }>;
    const assistantHistoryEcho = finalMessages.some((m) => m.role === "assistant" && m.content.includes("June 2026 your net profit"));
    const userHistoryPresent = finalMessages.some((m) => m.role === "user" && m.content.includes("Please remember June performance"));
    const systemText = finalMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n")
      .toLowerCase();

    expect(assistantHistoryEcho).toBe(false);
    expect(userHistoryPresent).toBe(true);
    expect(systemText).toContain("financial period data for requested/selected/latest period is unavailable");
  });

  it("coaching deleted month: marks June unavailable and excludes stale assistant trigger history", async () => {
    const user = makeUser({ id: 2202, role: "client", email: "client2@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockResolvedValue([
      {
        period_year: 2026,
        period_month: 7,
        report_month_label: "Jul 26",
        trigger_engine_version: "phase_5_v1",
        received_at: "2026-07-31T00:00:00.000Z",
        triggered_count: 3,
        clear_count: 10,
        unknown_count: 4,
      },
    ] as any);

    const byPeriodSpy = vi.spyOn(supabaseModule, "getCfoTriggerSnapshotByPeriod").mockResolvedValue(null as any);
    vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue(null as any);

    const invokeSpy = vi.spyOn(llmModule, "invokeLLM").mockResolvedValue({
      choices: [{ message: { content: "June trigger data is not currently available." } }],
    } as any);

    const out = await caller.portalAi.ask({
      message: "What triggers fired in June?",
      pageContext: { route: "/portal/coaching", pageType: "coaching", year: 2026, month: 7 },
      history: [
        { role: "assistant", content: "In June, low cash balance and negative net income were triggered." },
        { role: "user", content: "Can you recap coaching triggers?" },
      ],
    });

    expect(out.message).toContain("not currently available");
    expect(byPeriodSpy).not.toHaveBeenCalledWith("acme_llc", 2026, 6, "financial_pdf");

    const finalCall = invokeSpy.mock.calls.find((c: any[]) => !(c?.[0] as any)?.outputSchema);
    expect(finalCall).toBeTruthy();

    const finalMessages = ((finalCall?.[0] as any)?.messages ?? []) as Array<{ role: string; content: string }>;
    const assistantHistoryEcho = finalMessages.some((m) => m.role === "assistant" && m.content.includes("low cash balance"));
    const userHistoryPresent = finalMessages.some((m) => m.role === "user" && m.content.includes("recap coaching triggers"));
    const systemText = finalMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n")
      .toLowerCase();

    expect(assistantHistoryEcho).toBe(false);
    expect(userHistoryPresent).toBe(true);
    expect(systemText).toContain("state this clearly");
  });

  it("comparison with June deleted and July available does not run verified comparison from stale history", async () => {
    const user = makeUser({ id: 2203, role: "client", email: "client3@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(user));

    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockResolvedValue([
      {
        period_year: 2026,
        period_month: 7,
        report_month_label: "Jul 26",
        trigger_engine_version: "phase_5_v1",
        received_at: "2026-07-31T00:00:00.000Z",
        triggered_count: 2,
        clear_count: 11,
        unknown_count: 4,
      },
    ] as any);

    const byPeriodSpy = vi.spyOn(supabaseModule, "getCfoTriggerSnapshotByPeriod").mockResolvedValue(null as any);
    vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue(null as any);

    const invokeSpy = vi.spyOn(llmModule, "invokeLLM").mockResolvedValue({
      choices: [{ message: { content: "June is unavailable, so a verified June-vs-July comparison cannot be performed." } }],
    } as any);

    const out = await caller.portalAi.ask({
      message: "Compare June and July",
      pageContext: { route: "/portal/coaching", pageType: "coaching", year: 2026, month: 7 },
      history: [
        { role: "assistant", content: "In June, 6 triggers fired while July had 2." },
        { role: "user", content: "Earlier we discussed June trigger trends." },
      ],
    });

    expect(out.message).toContain("comparison cannot be performed");
    expect(byPeriodSpy).not.toHaveBeenCalled();

    const finalCall = invokeSpy.mock.calls.find((c: any[]) => !(c?.[0] as any)?.outputSchema);
    expect(finalCall).toBeTruthy();

    const finalMessages = ((finalCall?.[0] as any)?.messages ?? []) as Array<{ role: string; content: string }>;
    const systemText = finalMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n")
      .toLowerCase();
    const assistantHistoryEcho = finalMessages.some((m) => m.role === "assistant" && m.content.includes("6 triggers fired"));

    expect(systemText).toContain("state this clearly");
    expect(assistantHistoryEcho).toBe(false);
  });

  it("user-only history gating applies in both financial and coaching tenant-data contexts", async () => {
    const user = makeUser({ id: 2204, role: "client", email: "client4@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(user));

    const invokeSpy = vi.spyOn(llmModule, "invokeLLM").mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    } as any);

    vi.spyOn(supabaseModule, "listFinancialPeriods").mockResolvedValue([{ year: 2026, month: 7 }] as any);
    vi.spyOn(supabaseModule, "getFinancials").mockResolvedValue([
      {
        revenue: 100000,
        expenses: 65000,
        cogs_actual: 10000,
        other_income_actual: 0,
        other_expense_actual: 0,
        net_profit: 25000,
        net_profit_margin: 0.25,
        budget_revenue: 90000,
        budget_expenses: 60000,
        cogs_budget: 9000,
        other_income_budget: 0,
        other_expense_budget: 0,
      },
    ] as any);

    await caller.portalAi.ask({
      message: "How profitable were we?",
      pageContext: { route: "/portal/financials", pageType: "financials", year: 2026, month: 7 },
      history: [
        { role: "assistant", content: "Old assistant financial fact" },
        { role: "user", content: "Old user financial message" },
      ],
    });

    vi.spyOn(supabaseModule, "listCfoTriggerSnapshotPeriods").mockResolvedValue([
      {
        period_year: 2026,
        period_month: 7,
        report_month_label: "Jul 26",
        trigger_engine_version: "phase_5_v1",
        received_at: "2026-07-31T00:00:00.000Z",
        triggered_count: 1,
        clear_count: 12,
        unknown_count: 4,
      },
    ] as any);

    vi.spyOn(supabaseModule, "getCfoTriggerSnapshotByPeriod").mockResolvedValue({
      id: "snap-jul",
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 7,
      report_month_label: "Jul 26",
      trigger_engine_version: "phase_5_v1",
      source_import_id: null,
      source_document_id: null,
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: ["low_cash_balance"],
      clear_keys: [],
      unknown_keys: [],
      triggers: [{ trigger_key: "low_cash_balance", status: "triggered", display_value: "$5,000" }],
      raw_payload: {},
      received_at: "2026-07-31T00:00:00.000Z",
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    } as any);
    vi.spyOn(supabaseModule, "getLatestCfoTriggerSnapshot").mockResolvedValue({
      id: "snap-jul",
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 7,
      report_month_label: "Jul 26",
      trigger_engine_version: "phase_5_v1",
      source_import_id: null,
      source_document_id: null,
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: ["low_cash_balance"],
      clear_keys: [],
      unknown_keys: [],
      triggers: [{ trigger_key: "low_cash_balance", status: "triggered", display_value: "$5,000" }],
      raw_payload: {},
      received_at: "2026-07-31T00:00:00.000Z",
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    } as any);

    await caller.portalAi.ask({
      message: "Explain these triggers",
      pageContext: { route: "/portal/coaching", pageType: "coaching", year: 2026, month: 7 },
      history: [
        { role: "assistant", content: "Old assistant trigger fact" },
        { role: "user", content: "Old user trigger message" },
      ],
    });

    const finalCalls = invokeSpy.mock.calls
      .map((c: any[]) => c?.[0])
      .filter((args: any) => !args?.outputSchema);

    expect(finalCalls.length).toBeGreaterThanOrEqual(2);

    for (const args of finalCalls) {
      const messages = (args.messages ?? []) as Array<{ role: string; content: string }>;
      const assistantHistoryMessages = messages.filter((m) => m.role === "assistant" && m.content.startsWith("Old assistant"));
      const userHistoryMessages = messages.filter((m) => m.role === "user" && m.content.startsWith("Old user"));
      expect(assistantHistoryMessages.length).toBe(0);
      expect(userHistoryMessages.length).toBeGreaterThan(0);
    }
  });
});
